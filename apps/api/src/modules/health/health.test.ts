import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { app } from "../../app.js";

test("liveness is independent of database availability and exposes no secrets", async () => {
  const response = await request(app).get("/api/v1/health/live");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", service: "seyyon-api" });
  assert.ok(response.headers["x-request-id"]);
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("unknown routes have a consistent error contract", async () => {
  const response = await request(app).get("/api/v1/unknown");
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.equal(response.body.error.requestId, response.headers["x-request-id"]);
});

