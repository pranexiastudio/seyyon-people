import type { Prisma } from "../../generated/prisma/client.js";
import { database } from "../../lib/database.js";
import { HttpError } from "../../middleware/errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { newToken, tokenHash } from "./tokens.js";
import { listContexts } from "./context.js";
import { deliverReset } from "./delivery.js";

const unauthorized = () => new HttpError(401, "INVALID_CREDENTIALS", "Unable to sign in with these credentials.");
const invalidSession = () => new HttpError(401, "INVALID_SESSION", "Please sign in again.");
const invalidReset = () => new HttpError(400, "INVALID_RESET", "This reset link is invalid or expired.");

export async function login(identifier: string, password: string, remember: boolean, requestId: string) {
  const normalized = identifier.trim().toLowerCase();
  const users = await database.user.findMany({
    where: normalized.includes("@") ? { email: { equals: normalized, mode: "insensitive" } } : { employeeLoginId: { equals: normalized, mode: "insensitive" } }, take: 1,
  });
  const user = users[0];
  const verified = await verifyPassword(password, user?.passwordHash);
  if (!user) throw unauthorized();
  const result = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = await transaction.user.findUniqueOrThrow({ where: { id: user.id } });
    if (current.disabled || !current.passwordConfigured || (current.lockedUntil && current.lockedUntil > new Date())) return null;
    if (!verified || current.passwordHash !== user.passwordHash) {
      const failures = current.lockedUntil ? 1 : current.loginFailures + 1;
      await transaction.user.update({ where: { id: user.id }, data: { loginFailures: failures, lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
    await transaction.authEvent.createMany({ data: { userId: user.id, action: "LOGIN_FAILED", requestId } });
      return null;
    }
    const contexts = await listContexts(transaction, user.id);
    const platform = !!await transaction.platformAdmin.findUnique({ where: { userId: user.id } });
    if (!platform && !contexts.length) return null;
    await transaction.user.update({ where: { id: user.id }, data: { loginFailures: 0, lockedUntil: null } });
    const token = newToken();
    const session = await transaction.authSession.create({
      data: { userId: user.id, platform, tenantId: platform ? null : contexts[0]!.tenantId, remember,
        expiresAt: new Date(Date.now() + (remember ? 30 : 1) * 86400000),
        tokens: { create: { hash: tokenHash(token) } } },
    });
    await transaction.authEvent.createMany({ data: { userId: user.id, action: "LOGIN_SUCCEEDED", requestId } });
    return { session, token };
  });
  if (!result) throw unauthorized();
  return result;
}

export async function rotate(rawToken: string, requestId: string) {
  const hash = tokenHash(rawToken);
  const existing = await database.refreshToken.findUnique({ where: { hash }, include: { session: true } });
  if (!existing) throw invalidSession();
  const result = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${existing.session.userId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${existing.sessionId}::uuid FOR UPDATE`;
    const token = await transaction.refreshToken.findUniqueOrThrow({ where: { hash }, include: { session: { include: { user: true } } } });
    const session = token.session;
    if (token.usedAt) {
      await transaction.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await transaction.authEvent.createMany({ data: { userId: session.userId, action: "REFRESH_REUSE", requestId } });
      return null;
    }
    if (session.revokedAt || session.expiresAt <= new Date() || session.user.disabled) return null;
    const contexts = await listContexts(transaction, session.userId);
    if (session.platform ? !await transaction.platformAdmin.findUnique({ where: { userId: session.userId } }) : !contexts.some((entry) => entry.tenantId === session.tenantId)) return null;
    const nextToken = newToken();
    await transaction.refreshToken.update({ where: { hash }, data: { usedAt: new Date() } });
    await transaction.refreshToken.create({ data: { hash: tokenHash(nextToken), sessionId: session.id } });
    return { session, token: nextToken };
  });
  if (!result) throw invalidSession();
  return result;
}

export async function issuePasswordLink(transaction: Prisma.TransactionClient, userId: string, requestId: string, action = "PASSWORD_RESET_REQUESTED") {
  const token = newToken();
  await transaction.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await transaction.passwordReset.create({ data: { hash: tokenHash(token), userId, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  await transaction.authEvent.createMany({ data: { userId, action, requestId } });
  return token;
}

export async function requestPasswordReset(email: string, requestId: string) {
  const user = await database.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, disabled: false } });
  if (!user) return;
  const token = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    return issuePasswordLink(transaction, user.id, requestId);
  });
  await deliverReset(user.email, token);
}

export async function resetPassword(token: string, password: string, requestId: string) {
  const hash = tokenHash(token);
  const existing = await database.passwordReset.findUnique({ where: { hash } });
  if (!existing) throw invalidReset();
  const passwordHash = await hashPassword(password);
  await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${existing.userId}::uuid FOR UPDATE`;
    const reset = await transaction.passwordReset.findUniqueOrThrow({ where: { hash }, include: { user: true } });
    if (reset.usedAt || reset.expiresAt <= new Date() || reset.user.disabled) throw invalidReset();
    await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash, passwordConfigured: true, loginFailures: 0, lockedUntil: null } });
    await transaction.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
    await transaction.authSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await transaction.authEvent.createMany({ data: { userId: reset.userId, action: "PASSWORD_RESET_COMPLETED", requestId } });
  });
}

