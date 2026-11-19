import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { authenticate } from "./auth.js";
import { errorHandler } from "./errors.js";
import { env } from "../config/env.js";

const protectedApp = express();
protectedApp.use((_request, response, next) => { response.locals.requestId = "test-request"; next(); });
protectedApp.get("/protected", authenticate, (_request, response) => response.sendStatus(204));
protectedApp.use(errorHandler);

test("missing or malformed bearer credentials cannot access protected routes", async () => {
  for (const authorization of ["", "Basic invalid", "Bearer invalid"]) {
    const response = await request(protectedApp).get("/protected").set("Authorization", authorization);
    assert.equal(response.status, 401);
  }
});

test("expired tokens and tokens with incorrect audience or issuer are rejected before database access", async () => {
  for (const invalidClaim of ["expiry", "audience", "issuer"]) {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setIssuedAt()
      .setIssuer(invalidClaim === "issuer" ? "other-issuer" : env.JWT_ISSUER)
      .setAudience(invalidClaim === "audience" ? "other-audience" : env.JWT_AUDIENCE)
      .setExpirationTime(invalidClaim === "expiry" ? 1 : "5m")
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    const response = await request(protectedApp).get("/protected").set("Authorization", "Bearer " + token);
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "INVALID_TOKEN");
  }
});
