import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { defaultTenantConfig, organizationPermissions } from "@seyyon/shared";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { database } from "../src/lib/database.js";
import { hashPassword } from "../src/modules/auth/password.js";

test("Module 2 tenant, administrator, and configuration lifecycle", async (suite) => {
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  const runtime = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const nonce = randomUUID();
  const platformId = randomUUID();
  const employeeId = randomUUID();
  const emails = { platform: "platform-" + nonce + "@example.invalid", admin: "admin-" + nonce + "@example.invalid", employee: "employee-" + nonce + "@example.invalid" };
  const password = "Tenant-integration-password-2026!";
  const adminPassword = "New-company-admin-password-2026!";
  const companies = ["Alpha Module 2 " + nonce, "Beta Module 2 " + nonce];
  const submitted = { name: companies[0], companyEmail: "alpha-" + nonce + "@example.invalid",
    legalName: "Alpha Legal", website: "https://example.invalid", companySize: "11-50", country: "India" };
  const outbox = fileURLToPath(new URL("../../../.local/mail/", import.meta.url));
  const platformRoot = "/api/v1/platform";
  const ownCompany = "/api/v1/workspace/company";
  const login = (email: string, secret = password) => request(app).post("/api/v1/auth/login")
    .set("Origin", env.WEB_ORIGIN).send({ identifier: email, password: secret, remember: false });
  const bearer = (http: request.Test, token: string) => http.auth(token, { type: "bearer" });
  const verify = (response: request.Response, expected: number) =>
    assert.equal(response.status, expected, JSON.stringify(response.body));
  async function mail() {
    const matches = [];
    for (const file of await readdir(outbox).catch(() => [] as string[])) {
      const path = join(outbox, file);
      const message = JSON.parse(await readFile(path, "utf8").catch(() => "{}"));
      if (message.to === emails.admin) matches.push({ path, ...message });
    }
    return matches;
  }
  async function passwordLink(subject: RegExp, excludedToken?: string) {
    const message = (await mail()).find((item) => subject.test(item.subject) && new URL(item.url).hash.slice(1) !== excludedToken);
    assert.ok(message, "Expected a private local activation or reset link");
    return new URL(message.url).hash.slice(1);
  }
  const redeem = (token: string, secret: string) => request(app).post("/api/v1/auth/reset-password")
    .set("Origin", env.WEB_ORIGIN).send({ token, password: secret });
  let platform = "";
  let alpha = "";
  let beta = "";
  let admin = "";
  let adminSession = "";
  let member = "";
  const companyPath = (id: string) => platformRoot + "/companies/" + id;
  await owner.connect();
  await runtime.connect();
  try {
    const hash = await hashPassword(password);
    await owner.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$5),($3,$4,$5)", [platformId, emails.platform, employeeId, emails.employee, hash]);
    await owner.query("INSERT INTO platform_admins(user_id) VALUES($1)", [platformId]);
    const signedIn = await login(emails.platform);
    verify(signedIn, 200);
    platform = signedIn.body.accessToken;
    await suite.test("registration is transactional and duplicates and invalid fields are rejected", async () => {
      const endpoint = platformRoot + "/companies";
      verify(await request(app).post(endpoint).send(submitted), 401);
      verify(await bearer(request(app).post(endpoint), platform).send({ ...submitted, website: "javascript:alert(1)" }), 400);
      const first = await bearer(request(app).post(endpoint), platform).send(submitted);
      verify(first, 201);
      alpha = first.body.id;
      assert.equal(first.body.status, "ACTIVE");
      const second = await bearer(request(app).post(endpoint), platform).send({ name: companies[1], companyEmail: "beta-" + nonce + "@example.invalid" });
      verify(second, 201);
      beta = second.body.id;
      verify(await bearer(request(app).post(endpoint), platform).send({ ...submitted, companyEmail: "another-" + nonce + "@example.invalid" }), 409);
      verify(await bearer(request(app).post(endpoint), platform).send({ ...submitted, name: "Duplicate email " + nonce, companyEmail: submitted.companyEmail.toUpperCase() }), 409);
      assert.equal((await owner.query("SELECT count(*)::int AS count FROM tenants WHERE name LIKE $1", ["%" + nonce])).rows[0].count, 2);
      const result = await bearer(request(app).get(endpoint).query({ search: nonce, status: "ACTIVE", limit: 1 }), platform);
      verify(result, 200);
      assert.equal(result.body.total, 2);
      assert.equal(result.body.items.length, 1);
      const secondPage = await bearer(request(app).get(endpoint).query({ search: nonce, limit: 1, page: 2 }), platform);
      verify(secondPage, 200);
      assert.notEqual(result.body.items[0].id, secondPage.body.items[0].id);
      const overview = await bearer(request(app).get(platformRoot + "/dashboard"), platform);
      verify(overview, 200);
      assert.equal(overview.body.total, overview.body.active + overview.body.suspended);
      assert.ok(overview.body.users >= 2);
      assert.ok(overview.body.activity.some((item: { targetId: string }) => item.targetId === alpha));
    });
    await suite.test("organization reference data is provisioned and isolated by tenant", async () => {
      assert.equal((await runtime.query("SELECT id FROM employment_types")).rowCount, 0);
      await runtime.query("BEGIN");
      try {
        await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [alpha]);
        const types = await runtime.query("SELECT code, tenant_id FROM employment_types ORDER BY code");
        assert.deepEqual(types.rows.map(({ code }) => code), [
          "CONTRACT", "INTERN", "PART_TIME", "PERMANENT", "PROBATION", "TEMPORARY",
        ]);
        assert.ok(types.rows.every(({ tenant_id }) => tenant_id === alpha));
        await assert.rejects(runtime.query("SELECT organization_seed_employment_types($1)", [beta]), { code: "42501" });
      } finally {
        await runtime.query("ROLLBACK");
      }
    });
    await suite.test("admins can be invited and assigned against a specific tenant", async () => {
      const endpoint = companyPath(alpha) + "/admins";
      const invite = await bearer(request(app).post(endpoint), platform).send({ email: emails.admin, action: "invite" });
      verify(invite, 201);
      member = invite.body.id;
      assert.equal(invite.body.delivery, "queued");
      assert.equal(invite.body.token, undefined);
      verify(await login(emails.admin), 401);
      const pending = await bearer(request(app).get(endpoint), platform);
      assert.equal(pending.body[0].invitationPending, true);
      const firstToken = await passwordLink(/Set up/);
      const resend = await bearer(request(app).post(endpoint + "/" + member + "/password-link"), platform).send({ invitation: true });
      verify(resend, 202);
      assert.equal(resend.body.delivery, "queued");
      verify(await redeem(firstToken, adminPassword), 400);
      const token = await passwordLink(/Set up/, firstToken);
      verify(await redeem(token, adminPassword), 204);
      verify(await redeem(token, adminPassword), 400);
      const signed = await login(emails.admin, adminPassword);
      verify(signed, 200);
      assert.equal(signed.body.profile.tenantId, alpha);
      assert.deepEqual(signed.body.profile.roles, ["Company Admin"]);
      assert.deepEqual([...signed.body.profile.permissions].sort(), Object.values(organizationPermissions).sort());
      admin = signed.body.accessToken;
      adminSession = signed.body.profile.sessionId;
      const listed = await bearer(request(app).get(endpoint), platform);
      verify(listed, 200);
      assert.equal(listed.body[0].id, member);
      assert.equal(listed.body[0].invitationPending, false);
      verify(await bearer(request(app).post(endpoint), platform).send({ email: emails.admin, action: "assign" }), 409);
      verify(await bearer(request(app).post(companyPath(beta) + "/admins"), platform).send({ email: emails.employee, action: "assign" }), 201);
      const other = await login(emails.employee);
      verify(other, 200);
      assert.equal(other.body.profile.tenantId, beta);
      verify(await bearer(request(app).patch(companyPath(beta) + "/admins/" + member + "/status"), platform).send({ status: "DISABLED" }), 404);
    });
    await suite.test("workspace scope derives from the session and database access remains isolated", async () => {
      const own = await bearer(request(app).get(ownCompany), admin);
      verify(own, 200);
      assert.equal(own.body.id, alpha);
      verify(await bearer(request(app).get(ownCompany), admin).set("X-Expected-Membership", member), 200);
      verify(await bearer(request(app).put(ownCompany), admin).set("X-Expected-Membership", randomUUID()).send(submitted), 409);
      await owner.query("INSERT INTO memberships (id, tenant_id, user_id) VALUES ($1,$2,$3)", [randomUUID(), alpha, employeeId]);
      const withoutRole = await login(emails.employee);
      verify(withoutRole, 200);
      assert.equal(withoutRole.body.profile.tenantId, alpha);
      verify(await bearer(request(app).get(ownCompany), withoutRole.body.accessToken), 403);
      verify(await bearer(request(app).get(companyPath(beta)), admin), 403);
      verify(await bearer(request(app).post(platformRoot + "/companies"), admin).send(submitted), 403);
      verify(await bearer(request(app).patch(companyPath(alpha) + "/status"), admin).send({ status: "SUSPENDED" }), 403);
      verify(await bearer(request(app).put(ownCompany), admin).send({ ...submitted, tenantId: beta }), 400);
      assert.equal((await runtime.query("SELECT id FROM tenants")).rowCount, 0);
      await assert.rejects(runtime.query("SELECT * FROM module2_registry($1)", [randomUUID()]), { code: "42501" });
      await runtime.query("BEGIN");
      try {
        await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [alpha]);
        assert.equal((await runtime.query("SELECT id FROM tenants WHERE id=$1", [beta])).rowCount, 0);
        assert.equal((await runtime.query("UPDATE tenants SET city='Unauthorized' WHERE id=$1", [alpha])).rowCount, 0);
        await assert.rejects(runtime.query("UPDATE tenants SET status='SUSPENDED' WHERE id=$1", [alpha]), { code: "42501" });
      } finally { await runtime.query("ROLLBACK"); }
      await runtime.query("BEGIN");
      try {
        await runtime.query("SELECT set_config('app.admin_session_id', $1, true)", [adminSession]);
        await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [beta]);
        assert.equal((await runtime.query("UPDATE tenants SET city='Unauthorized' WHERE id=$1", [beta])).rowCount, 0);
      } finally { await runtime.query("ROLLBACK"); }
    });
    await suite.test("company contact data, logo, and configuration persist through both scopes", async () => {
      const edits = { ...submitted, city: "Chennai", contactNumber: "+91 98765 43210" };
      verify(await bearer(request(app).put(ownCompany), admin).send(edits), 204);
      const profile = await bearer(request(app).get(companyPath(alpha)), platform);
      verify(profile, 200);
      assert.equal(profile.body.city, "Chennai");
      verify(await bearer(request(app).put(ownCompany), admin).send({ ...edits, name: companies[1] }), 409);
      const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSrsAAAAASUVORK5CYII=", "base64");
      verify(await bearer(request(app).put(ownCompany + "/logo"), admin).set("Content-Type", "image/png").send(Buffer.from("invalid")), 400);
      verify(await bearer(request(app).put(ownCompany + "/logo"), admin).set("Content-Type", "image/png").send(Buffer.alloc(512 * 1024 + 1)), 413);
      verify(await bearer(request(app).put(ownCompany + "/logo"), admin).set("Content-Type", "image/png").send(logo), 204);
      const storedLogo = await bearer(request(app).get(companyPath(alpha) + "/logo"), platform);
      verify(storedLogo, 200);
      assert.equal(storedLogo.body.logo, "data:image/png;base64," + logo.toString("base64"));
      verify(await bearer(request(app).delete(ownCompany + "/logo"), admin), 204);
      const config = { ...defaultTenantConfig, branding: { displayName: "Alpha", primaryColor: "#123abc" },
        modules: { attendance: true, leave: true, payroll: false }, regional: { ...defaultTenantConfig.regional, timezone: "UTC" },
        attendance: { workingMinutesPerDay: 420, graceMinutes: 15 }, leave: { yearStartMonth: 4, carryForward: true },
        payroll: { currency: "USD", frequency: "BIWEEKLY" } };
      verify(await bearer(request(app).put(ownCompany + "/configuration"), admin).send({ ...config, regional: { ...config.regional, timezone: "Invalid/Timezone" } }), 400);
      verify(await bearer(request(app).put(ownCompany + "/configuration"), admin).send(config), 204);
      const stored = await bearer(request(app).get(companyPath(alpha) + "/configuration"), platform);
      verify(stored, 200);
      assert.deepEqual(stored.body, config);
      const isolated = await bearer(request(app).get(companyPath(beta) + "/configuration"), platform);
      assert.deepEqual(isolated.body, defaultTenantConfig);
    });
    await suite.test("tenant suspension blocks sign-in and records status history, then activation restores access", async () => {
      const endpoint = companyPath(alpha) + "/status";
      const update = (status: string) => bearer(request(app).patch(endpoint), platform).send({ status });
      verify(await update("SUSPENDED"), 204);
      verify(await update("SUSPENDED"), 204);
      verify(await bearer(request(app).get(ownCompany), admin), 401);
      verify(await login(emails.admin, adminPassword), 401);
      verify(await update("ACTIVE"), 204);
      const restored = await login(emails.admin, adminPassword);
      verify(restored, 200);
      admin = restored.body.accessToken;
      const details = await bearer(request(app).get(companyPath(alpha)), platform);
      assert.deepEqual(details.body.history.map((item: { action: string }) => item.action),
        ["COMPANY_ACTIVATED", "COMPANY_SUSPENDED", "COMPANY_REGISTERED"]);
    });
    await suite.test("admin reactivation and reset are scoped to a verified admin membership", async () => {
      const endpoint = companyPath(alpha) + "/admins/" + member;
      verify(await bearer(request(app).patch(endpoint + "/status"), platform).send({ status: "DISABLED" }), 204);
      verify(await bearer(request(app).get(ownCompany), admin), 401);
      verify(await bearer(request(app).post(endpoint + "/password-link"), platform).send({}), 409);
      verify(await bearer(request(app).patch(endpoint + "/status"), platform).send({ status: "ACTIVE" }), 204);
      const reset = await bearer(request(app).post(endpoint + "/password-link"), platform).send({});
      verify(reset, 202);
      assert.equal(reset.body.delivery, "queued");
      const newPassword = "Module-2-reset-password-2026!";
      verify(await redeem(await passwordLink(/^Reset/), newPassword), 204);
      verify(await login(emails.admin, adminPassword), 401);
      verify(await login(emails.admin, newPassword), 200);
    });
  } finally {
    const tenantIds = (await owner.query("SELECT id FROM tenants WHERE name = ANY($1)", [companies])).rows.map(({ id }) => id);
    const userIds = (await owner.query("SELECT id FROM users WHERE email = ANY($1)", [Object.values(emails)])).rows.map(({ id }) => id);
    await owner.query("DELETE FROM auth_events WHERE user_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM platform_audit_logs WHERE actor_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM audit_logs WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM employment_types WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM platform_admins WHERE user_id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
    await owner.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    for (const message of await mail()) await unlink(message.path);
    await Promise.all([owner.end(), runtime.end(), database.$disconnect()]);
  }
});

