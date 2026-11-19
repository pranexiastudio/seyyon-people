import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import pg from "pg";
import request from "supertest";
import { SignJWT } from "jose";
import { app } from "../src/app.js";
import { database } from "../src/lib/database.js";
import { withTenant } from "../src/lib/tenant.js";
import { hashPassword, verifyPassword } from "../src/modules/auth/password.js";
import { newToken, tokenHash } from "../src/modules/auth/tokens.js";
import { env } from "../src/config/env.js";
import { tenantRoleNames } from "@seyyon/shared";

test("authentication lifecycle, platform separation, and tenant authorization", async (suite) => {
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  const tenantIds = [randomUUID(), randomUUID()];
  const accounts = { employee: randomUUID(), companyAdmin: randomUUID(), superAdmin: randomUUID(), disabled: randomUUID(), locked: randomUUID() };
  const userIds = Object.values(accounts);
  const membershipId = randomUUID();
  const permissionId = randomUUID();
  const password = "Local-test-password-2026!";
  const passwordHash = await hashPassword(password);
  const origin = env.WEB_ORIGIN;
  const email = (userId: string) => userId + "@example.invalid";
  const login = (userId: string, remember = false) => request(app).post("/api/v1/auth/login").set("Origin", origin).send({ identifier: email(userId), password, remember });
  const refresh = (cookie: string) => request(app).post("/api/v1/auth/refresh").set("Origin", origin).set("Cookie", cookie);
  const cookie = (response: request.Response) => {
    const cookies = response.headers["set-cookie"] as unknown as string[];
    assert.ok(cookies?.[0]);
    return cookies[0]!.split(";")[0]!;
  };
  let employee: request.Response;
  let admin: request.Response;
  let platform: request.Response;
  let employeeById: request.Response;
  const outbox = fileURLToPath(new URL("../../../.local/mail/", import.meta.url));
  const deliveredFiles: string[] = [];
  await owner.connect();
  try {
    for (const tenantId of tenantIds) await owner.query("INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1, 'Auth Test Company', $2, now())", [tenantId, tenantId]);
    for (const userId of userIds) await owner.query("INSERT INTO users (id, email, password_hash, disabled, employee_login_id) VALUES ($1, $2, $3, $4, $5)", [userId, email(userId), passwordHash, userId === accounts.disabled, userId === accounts.employee ? "AUTH-" + userId : null]);
    await owner.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [accounts.superAdmin]);
    for (const userId of [accounts.employee, accounts.companyAdmin, accounts.locked]) {
      await owner.query("INSERT INTO memberships (id, tenant_id, user_id) VALUES ($1, $2, $3)", [userId === accounts.employee ? membershipId : randomUUID(), tenantIds[0], userId]);
    }
    await owner.query("INSERT INTO permissions (id, key) VALUES ($1, $2)", [permissionId, "test:" + permissionId]);
    for (const roleName of tenantRoleNames) {
      const roleId = randomUUID();
      await owner.query("INSERT INTO roles (id, tenant_id, name) VALUES ($1, $2, $3)", [roleId, tenantIds[0], roleName]);
      if (roleName === "Company Admin") {
        const membership = await owner.query("SELECT id FROM memberships WHERE user_id = $1", [accounts.companyAdmin]);
        await owner.query("INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)", [tenantIds[0], membership.rows[0].id, roleId]);
        await owner.query("INSERT INTO role_permissions (tenant_id, role_id, permission_id) VALUES ($1, $2, $3)", [tenantIds[0], roleId, permissionId]);
      }
      if (roleName === "Employee") await owner.query("INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)", [tenantIds[0], membershipId, roleId]);
    }
    await suite.test("scrypt uses distinct salts and rejects incorrect passwords", async () => {
      assert.equal(await verifyPassword(password, passwordHash), true);
      assert.equal(await verifyPassword("wrong", passwordHash), false);
      assert.equal(await verifyPassword(password, "malformed"), false);
      assert.notEqual(await hashPassword(password), passwordHash);
    });
    await suite.test("invalid credentials, disabled accounts, and invalid bodies fail without account disclosure", async () => {
      const wrong = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ identifier: email(accounts.employee), password: "wrong", remember: false });
      const unknown = await login(randomUUID());
      const disabled = await login(accounts.disabled);
      for (const response of [wrong, unknown, disabled]) { assert.equal(response.status, 401); assert.equal(response.body.error.message, wrong.body.error.message); }
      const invalid = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ identifier: "", password: "", tenant_id: tenantIds[1] });
      assert.equal(invalid.status, 400);
      assert.equal((await request(app).post("/api/v1/auth/login").send({})).status, 403);
    });
    await suite.test("email and employee ID login issue stateful JWTs and appropriate cookies", async () => {
      employee = await login(accounts.employee);
      admin = await login(accounts.companyAdmin);
      platform = await login(accounts.superAdmin, true);
      employeeById = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ identifier: ("AUTH-" + accounts.employee).toLowerCase(), password, remember: false });
      for (const response of [employee, admin, platform, employeeById]) assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(employee.body.profile.tenantId, tenantIds[0]);
      assert.deepEqual(employee.body.profile.roles, ["Employee"]);
      assert.deepEqual(platform.body.profile.roles, ["Super Admin"]);
      assert.equal(platform.body.profile.tenantId, null);
      const remembered = (platform.headers["set-cookie"] as unknown as string[])[0]!;
      assert.match(remembered, /HttpOnly/);
      assert.match(remembered, /SameSite=Strict/);
      assert.match(remembered, /Expires=/);
      assert.doesNotMatch((employee.headers["set-cookie"] as unknown as string[])[0]!, /Expires=/);
      const stored = await owner.query("SELECT hash FROM refresh_tokens WHERE session_id = $1", [employee.body.profile.sessionId]);
      assert.notEqual(stored.rows[0].hash, cookie(employee).split("=")[1]);
    });
    await suite.test("protected routes enforce session, platform scope, memberships, and permissions", async () => {
      assert.equal((await request(app).get("/api/v1/auth/me")).status, 401);
      assert.equal((await request(app).get("/api/v1/auth/platform").auth(employee.body.accessToken, { type: "bearer" })).status, 403);
      assert.equal((await request(app).get("/api/v1/auth/workspace").auth(platform.body.accessToken, { type: "bearer" })).status, 403);
      assert.equal((await request(app).get("/api/v1/auth/platform").auth(platform.body.accessToken, { type: "bearer" })).status, 200);
      const foreignContext = await request(app).post("/api/v1/auth/context").set("Origin", origin).auth(employee.body.accessToken, { type: "bearer" }).send({ membershipId: randomUUID() });
      assert.equal(foreignContext.status, 403);
      assert.equal((await request(app).post("/api/v1/auth/context").set("Origin", origin).auth(employee.body.accessToken, { type: "bearer" }).send({ membershipId: null })).status, 403);
      assert.equal(await withTenant(accounts.companyAdmin, tenantIds[0]!, "test:" + permissionId, async () => "allowed"), "allowed");
      await assert.rejects(withTenant(accounts.employee, tenantIds[0]!, "test:" + permissionId, async () => "forbidden"), { status: 403 });
      await assert.rejects(withTenant(accounts.employee, tenantIds[1]!, null, async () => "foreign"), { status: 403 });
      await assert.rejects(withTenant(accounts.superAdmin, tenantIds[0]!, null, async () => "bypass"), { status: 403 });
      await owner.query("UPDATE tenants SET status = 'SUSPENDED' WHERE id = $1", [tenantIds[0]]);
      assert.equal((await request(app).get("/api/v1/auth/me").auth(admin.body.accessToken, { type: "bearer" })).status, 403);
      await owner.query("UPDATE tenants SET status = 'ACTIVE' WHERE id = $1", [tenantIds[0]]);
      await owner.query("UPDATE memberships SET status = 'DISABLED' WHERE id = $1", [membershipId]);
      assert.equal((await request(app).get("/api/v1/auth/me").auth(employee.body.accessToken, { type: "bearer" })).status, 403);
      await owner.query("UPDATE memberships SET status = 'ACTIVE' WHERE id = $1", [membershipId]);
      const expired = await new SignJWT({ sid: employee.body.profile.sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(accounts.employee).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setIssuedAt().setExpirationTime(1).sign(new TextEncoder().encode(env.JWT_SECRET));
      assert.equal((await request(app).get("/api/v1/auth/me").auth(expired, { type: "bearer" })).status, 401);
    });
    await suite.test("refresh rotates once; replay revokes the entire session and its access JWT", async () => {
      const rotated = await refresh(cookie(employee));
      assert.equal(rotated.status, 200);
      assert.notEqual(cookie(rotated), cookie(employee));
      assert.equal((await refresh(cookie(employee))).status, 401);
      assert.equal((await refresh(cookie(rotated))).status, 401);
      assert.equal((await request(app).get("/api/v1/auth/me").auth(rotated.body.accessToken, { type: "bearer" })).status, 401);
      const concurrent = await login(accounts.employee);
      const results = await Promise.all([refresh(cookie(concurrent)), refresh(cookie(concurrent))]);
      assert.deepEqual(results.map((response) => response.status).sort(), [200, 401]);
      const winner = results.find((response) => response.status === 200)!;
      assert.equal((await refresh(cookie(winner))).status, 401);
    });
    await suite.test("logout, session ownership, and session revocation invalidate access immediately", async () => {
      const forbidden = await request(app).delete("/api/v1/auth/sessions/" + platform.body.profile.sessionId).set("Origin", origin).auth(admin.body.accessToken, { type: "bearer" });
      assert.equal(forbidden.status, 404);
      assert.equal((await request(app).post("/api/v1/auth/logout").set("Origin", origin).set("Cookie", cookie(employeeById))).status, 204);
      assert.equal((await request(app).get("/api/v1/auth/me").auth(employeeById.body.accessToken, { type: "bearer" })).status, 401);
      const session = await login(accounts.employee);
      assert.equal((await request(app).delete("/api/v1/auth/sessions/" + session.body.profile.sessionId).set("Origin", origin).auth(session.body.accessToken, { type: "bearer" })).status, 204);
      assert.equal((await refresh(cookie(session))).status, 401);
      const expired = await login(accounts.employee);
      await owner.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [expired.body.profile.sessionId]);
      assert.equal((await refresh(cookie(expired))).status, 401);
    });
    await suite.test("only platform administrators can deactivate and reactivate accounts", async () => {
      const active = await login(accounts.employee);
      assert.equal(active.status, 200);
      const path = "/api/v1/auth/accounts/" + accounts.employee + "/status";
      assert.equal((await request(app).patch(path).set("Origin", origin).auth(admin.body.accessToken, { type: "bearer" }).send({ disabled: true })).status, 403);
      assert.equal((await request(app).patch(path).set("Origin", origin).auth(platform.body.accessToken, { type: "bearer" }).send({ disabled: true })).status, 204);
      assert.equal((await request(app).get("/api/v1/auth/me").auth(active.body.accessToken, { type: "bearer" })).status, 401);
      assert.equal((await refresh(cookie(active))).status, 401);
      assert.equal((await login(accounts.employee)).status, 401);
      assert.equal((await request(app).patch(path).set("Origin", origin).auth(platform.body.accessToken, { type: "bearer" }).send({ disabled: false })).status, 204);
    });
    await suite.test("reset delivery is private, reset tokens are single-use, and all prior sessions are revoked", async () => {
      const session = await login(accounts.employee);
      const response = await request(app).post("/api/v1/auth/forgot-password").set("Origin", origin).send({ email: email(accounts.employee) });
      assert.equal(response.status, 202);
      assert.equal(response.body.token, undefined);
      const unknown = await request(app).post("/api/v1/auth/forgot-password").set("Origin", origin).send({ email: email(randomUUID()) });
      assert.deepEqual(unknown.body, response.body);
      let token = "";
      for (const filename of await readdir(outbox)) {
        const delivered = JSON.parse(await readFile(outbox + "/" + filename, "utf8"));
        if (delivered.to === email(accounts.employee)) { token = new URL(delivered.url).hash.slice(1); deliveredFiles.push(filename); }
      }
      assert.ok(token);
      const newPassword = "A-new-local-password-2026!";
      assert.equal((await request(app).post("/api/v1/auth/reset-password").set("Origin", origin).send({ token, password: newPassword })).status, 204);
      assert.equal((await request(app).post("/api/v1/auth/reset-password").set("Origin", origin).send({ token, password: newPassword })).status, 400);
      assert.equal((await refresh(cookie(session))).status, 401);
      const updated = await owner.query("SELECT password_hash FROM users WHERE id = $1", [accounts.employee]);
      assert.equal(await verifyPassword(newPassword, updated.rows[0].password_hash), true);
      const expiredToken = newToken();
      await owner.query("INSERT INTO password_resets (hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')", [tokenHash(expiredToken), accounts.employee]);
      assert.equal((await request(app).post("/api/v1/auth/reset-password").set("Origin", origin).send({ token: expiredToken, password: newPassword })).status, 400);
    });
    await suite.test("repeated bad passwords lock the account and authentication is rate limited", async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({ identifier: email(accounts.locked), password: "wrong", remember: false });
        assert.equal(response.status, 401);
      }
      assert.equal((await login(accounts.locked)).status, 401);
      const locked = await owner.query("SELECT locked_until FROM users WHERE id = $1", [accounts.locked]);
      assert.ok(locked.rows[0].locked_until > new Date());
      let limited = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const response = await login(accounts.locked);
        if (response.status === 429) { limited = true; break; }
      }
      assert.equal(limited, true);
    });
    await suite.test("logout-all revokes every session for the current user", async () => {
      const response = await request(app).post("/api/v1/auth/logout-all").set("Origin", origin).auth(admin.body.accessToken, { type: "bearer" });
      assert.equal(response.status, 204);
      assert.equal((await refresh(cookie(admin))).status, 401);
    });
  } finally {
    await owner.query("DELETE FROM auth_events WHERE user_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM platform_audit_logs WHERE actor_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM membership_roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM role_permissions WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM permissions WHERE key LIKE 'test:%' AND id = $1", [permissionId]);
    await owner.query("DELETE FROM platform_admins WHERE user_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    for (const filename of deliveredFiles) await unlink(outbox + "/" + filename);
    await owner.end();
    await database.$disconnect();
  }
});

