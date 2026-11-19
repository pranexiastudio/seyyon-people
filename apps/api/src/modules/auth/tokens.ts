import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { env } from "../../config/env.js";

export const newToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function issueAccessToken(userId: string, sessionId: string) {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE)
    .setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(env.JWT_SECRET));
}

