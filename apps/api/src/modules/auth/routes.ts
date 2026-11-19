import { Router, type Request, type Response, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, type AuthProfile } from "@seyyon/shared";
import { env } from "../../config/env.js";
import { database } from "../../lib/database.js";
import { withTenant } from "../../lib/tenant.js";
import { authenticate, requirePlatformAdmin } from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errors.js";
import { login, rotate, requestPasswordReset, resetPassword } from "./service.js";
import { issueAccessToken, tokenHash } from "./tokens.js";
import { profile, listContexts } from "./context.js";

export const authRouter = Router();
const cookieName = "seyyon_refresh";
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/v1/auth" };
const csrf: RequestHandler = (request, _response, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== new URL(env.WEB_ORIGIN).origin) {
    throw new HttpError(403, "INVALID_ORIGIN", "Request origin is not allowed.");
  }
  next();
};
function refreshCookie(request: Request) {
  const value = request.headers.cookie?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const authLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_request, _response, next) => next(new HttpError(429, "RATE_LIMITED", "Too many attempts. Please try again later.")),
});
const resetLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_request, _response, next) => next(new HttpError(429, "RATE_LIMITED", "Too many reset attempts. Please try again later.")),
});
async function sendSession(response: Response, result: Awaited<ReturnType<typeof login>>) {
  const accessToken = await issueAccessToken(result.session.userId, result.session.id);
  const currentProfile = await profile(result.session.userId, result.session.id);
  response.cookie(cookieName, result.token, { ...cookieOptions, ...(result.session.remember ? { expires: result.session.expiresAt } : {}) });
  response.json({ accessToken, profile: currentProfile });
}
authRouter.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  next();
});
authRouter.use(csrf);
authRouter.post("/login", authLimit, async (request, response) => {
  const input = loginSchema.parse(request.body);
  await sendSession(response, await login(input.identifier, input.password, input.remember, response.locals.requestId));
});
authRouter.post("/refresh", async (request, response) => {
  const token = refreshCookie(request);
  if (!token) throw new HttpError(401, "INVALID_SESSION", "Please sign in again.");
  try {
    await sendSession(response, await rotate(token, response.locals.requestId));
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) response.clearCookie(cookieName, cookieOptions);
    throw error;
  }
});
authRouter.post("/logout", async (request, response) => {
  const token = refreshCookie(request);
  if (token) {
    const stored = await database.refreshToken.findUnique({ where: { hash: tokenHash(token) } });
    if (stored) await database.$transaction(async (transaction) => {
      const session = await transaction.authSession.update({ where: { id: stored.sessionId }, data: { revokedAt: new Date() } });
    await transaction.authEvent.createMany({ data: { userId: session.userId, action: "LOGOUT", requestId: response.locals.requestId } });
    });
  }
  response.clearCookie(cookieName, cookieOptions).sendStatus(204);
});
authRouter.post("/forgot-password", resetLimit, async (request, response) => {
  const input = forgotPasswordSchema.parse(request.body);
  await requestPasswordReset(input.email, response.locals.requestId);
  response.status(202).json({ message: "If the account is eligible, a password reset link will be sent." });
});
authRouter.post("/reset-password", resetLimit, async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  await resetPassword(input.token, input.password, response.locals.requestId);
  response.clearCookie(cookieName, cookieOptions).sendStatus(204);
});
authRouter.get("/me", authenticate, (_request, response) => response.json(response.locals.profile));
authRouter.get("/sessions", authenticate, async (_request, response) => {
  response.json(await database.authSession.findMany({
    where: { userId: response.locals.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true, platform: true, tenantId: true },
    orderBy: { createdAt: "desc" },
  }));
});
authRouter.delete("/sessions/:id", authenticate, async (request, response) => {
  const id = z.uuid().parse(request.params.id);
  await database.$transaction(async (transaction) => {
    const result = await transaction.authSession.updateMany({ where: { id, userId: response.locals.userId }, data: { revokedAt: new Date() } });
    if (!result.count) throw new HttpError(404, "NOT_FOUND", "Session not found.");
    await transaction.authEvent.createMany({ data: { userId: response.locals.userId, action: "SESSION_REVOKED", requestId: response.locals.requestId } });
  });
  if (id === response.locals.sessionId) response.clearCookie(cookieName, cookieOptions);
  response.sendStatus(204);
});
authRouter.post("/logout-all", authenticate, async (_request, response) => {
  await database.$transaction(async (transaction) => {
    await transaction.authSession.updateMany({ where: { userId: response.locals.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await transaction.authEvent.createMany({ data: { userId: response.locals.userId, action: "ALL_SESSIONS_REVOKED", requestId: response.locals.requestId } });
  });
  response.clearCookie(cookieName, cookieOptions).sendStatus(204);
});
authRouter.post("/context", authenticate, async (request, response) => {
  const input = z.object({ membershipId: z.uuid().nullable() }).strict().parse(request.body);
  await database.$transaction(async (transaction) => {
    const userId: string = response.locals.userId;
    const contexts = await listContexts(transaction, userId);
    const selected = contexts.find((entry) => entry.id === input.membershipId);
    if (input.membershipId === null) {
      if (!await transaction.platformAdmin.findUnique({ where: { userId } })) throw new HttpError(403, "FORBIDDEN", "Platform access required.");
    } else if (!selected) throw new HttpError(403, "TENANT_ACCESS_DENIED", "Company access denied.");
    await transaction.authSession.update({ where: { id: response.locals.sessionId }, data: { platform: input.membershipId === null, tenantId: selected?.tenantId ?? null } });
    await transaction.authEvent.createMany({ data: { userId, action: "CONTEXT_CHANGED", requestId: response.locals.requestId } });
  });
  response.json(await profile(response.locals.userId, response.locals.sessionId));
});
authRouter.get("/workspace", authenticate, async (_request, response) => {
  const current = response.locals.profile as AuthProfile;
  if (current.platform || !current.tenantId) throw new HttpError(403, "TENANT_CONTEXT_REQUIRED", "Select a company workspace.");
  response.json(await withTenant(current.user.id, current.tenantId, null, async () => ({ companyName: current.companyName, roles: current.roles, permissions: current.permissions })));
});
authRouter.get("/platform", authenticate, requirePlatformAdmin, (_request, response) => {
  if (!(response.locals.profile as AuthProfile).platform) throw new HttpError(403, "PLATFORM_CONTEXT_REQUIRED", "Select the platform workspace.");
  response.json({ scope: "platform" });
});
authRouter.patch("/accounts/:id/status", authenticate, requirePlatformAdmin, async (request, response) => {
  const id = z.uuid().parse(request.params.id);
  const { disabled } = z.object({ disabled: z.boolean() }).strict().parse(request.body);
  if (!(response.locals.profile as AuthProfile).platform || id === response.locals.userId) throw new HttpError(403, "FORBIDDEN", "This account change is not permitted.");
  await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    if (!await transaction.user.findUnique({ where: { id } })) throw new HttpError(404, "NOT_FOUND", "Account not found.");
    await transaction.user.update({ where: { id }, data: { disabled, loginFailures: 0, lockedUntil: null } });
    await transaction.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await transaction.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
    await transaction.platformAuditLog.create({ data: { actorId: response.locals.userId, action: disabled ? "ACCOUNT_DEACTIVATED" : "ACCOUNT_ACTIVATED", targetId: id, requestId: response.locals.requestId } });
  });
  response.sendStatus(204);
});

