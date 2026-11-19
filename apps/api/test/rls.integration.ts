import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

test("runtime RLS rejects foreign tenant access and cross-tenant role assignments", async () => {
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  const runtime = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const tenantIds = [randomUUID(), randomUUID()];
  const userId = randomUUID();
  const roleId = randomUUID();
  const membershipId = randomUUID();
  await owner.connect();
  await runtime.connect();
  try {
    const privileges = await runtime.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    assert.equal(privileges.rows[0].rolsuper, false);
    assert.equal(privileges.rows[0].rolbypassrls, false);
    for (const tenantId of tenantIds) {
      await owner.query("INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1, 'Isolation test', $2, now())", [tenantId, tenantId]);
    }
    await owner.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'not-a-login-hash')", [userId, userId + "@example.invalid"]);
    await owner.query("INSERT INTO memberships (id, tenant_id, user_id) VALUES ($1, $2, $3)", [membershipId, tenantIds[0], userId]);
    await owner.query("INSERT INTO roles (id, tenant_id, name) VALUES ($1, $2, 'Test')", [roleId, tenantIds[1]]);
    assert.equal((await runtime.query("SELECT * FROM memberships")).rowCount, 0);
    await runtime.query("BEGIN");
    await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantIds[0]]);
    assert.equal((await runtime.query("SELECT * FROM memberships")).rowCount, 1);
    assert.equal((await runtime.query("SELECT * FROM roles")).rowCount, 0);
    await assert.rejects(runtime.query("INSERT INTO roles (id, tenant_id, name) VALUES ($1, $2, 'Forbidden')", [randomUUID(), tenantIds[1]]), { code: "42501" });
    await runtime.query("ROLLBACK");
    await runtime.query("BEGIN");
    await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantIds[0]]);
    await assert.rejects(runtime.query("INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)", [tenantIds[0], membershipId, roleId]), { code: "23503" });
    await runtime.query("ROLLBACK");
    assert.equal((await runtime.query("SELECT * FROM memberships")).rowCount, 0);
    await assert.rejects(runtime.query("DELETE FROM audit_logs"), { code: "42501" });
    await assert.rejects(runtime.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [userId]), { code: "42501" });
  } finally {
    await runtime.query("ROLLBACK");
    await owner.query("DELETE FROM membership_roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM users WHERE id = $1", [userId]);
    await owner.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    await runtime.end();
    await owner.end();
  }
});
