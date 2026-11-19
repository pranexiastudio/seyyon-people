import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env.js";
import { database } from "../lib/database.js";
import { HttpError } from "./errors.js";
import { profile } from "../modules/auth/context.js";

export const authenticate: RequestHandler = async (request, response, next) => {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");
  let subject: string;
  let sessionId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET), {
      algorithms: ["HS256"], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, requiredClaims: ["sub", "iat", "exp"],
    });
    subject = z.uuid().parse(payload.sub);
    sessionId = z.uuid().parse(payload.sid);
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "Invalid or expired access token.");
  }
  response.locals.profile = await profile(subject, sessionId);
  response.locals.userId = subject;
  response.locals.sessionId = sessionId;
  next();
};

export const requirePlatformAdmin: RequestHandler = async (_request, response, next) => {
  const userId = z.uuid().parse(response.locals.userId);
  const admin = await database.platformAdmin.findUnique({ where: { userId } });
  if (!admin) throw new HttpError(403, "FORBIDDEN", "Platform access required.");
  next();
};

