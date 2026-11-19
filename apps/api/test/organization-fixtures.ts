import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "../src/modules/auth/password.js";

export async function organizationFixtures() {
  const expected = process.env.SEYYON_ORG_TEST_DB;
  assert.ok(expected && expected !== "seyyon_people", "Set SEYYON_ORG_TEST_DB to a disposable local database name.");
  for (const key of ["DIRECT_URL", "DATABASE_URL"]) {
    const url = new URL(process.env[key] ?? "");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname === "/" + expected,
      "Both test connections must target the named disposable local database.");
  }
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await owner.connect();
  try {
    const target = await owner.query("SELECT current_database() AS name");
    assert.equal(target.rows[0].name, expected);
    const nonce = randomUUID();
    const password = "Organization-test-2026!";
    const hash = await hashPassword(password);
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const actors = {
      admin: { id: randomUUID(), email: "admin-" + nonce + "@example.invalid", tenantId: tenantA, membership: randomUUID() },
      other: { id: randomUUID(), email: "other-" + nonce + "@example.invalid", tenantId: tenantB, membership: randomUUID() },
      reader: { id: randomUUID(), email: "reader-" + nonce + "@example.invalid", tenantId: tenantA, membership: randomUUID() },
      member: { id: randomUUID(), email: "member-" + nonce + "@example.invalid", tenantId: tenantA, membership: randomUUID() },
      platform: { id: randomUUID(), email: "platform-" + nonce + "@example.invalid" },
    };
    await owner.query("BEGIN");
    for (const [id, name] of [[tenantA, "Organization catalog test"], [tenantB, "Other organization test"]]) {
      await owner.query("INSERT INTO tenants (id,name,slug,updated_at) VALUES ($1,$2,$3,now())", [id, name, id]);
      await owner.query("SELECT organization_seed_employment_types($1)", [id]);
    }
    for (const [key, actor] of Object.entries(actors)) {
      await owner.query("INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)", [actor.id, actor.email, hash]);
      if (!("tenantId" in actor)) {
        await owner.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [actor.id]);
        continue;
      }
      await owner.query("INSERT INTO memberships (id,tenant_id,user_id) VALUES ($1,$2,$3)", [actor.membership, actor.tenantId, actor.id]);
      if (key === "member") continue;
      const roleId = randomUUID();
      const reader = key === "reader";
      await owner.query("INSERT INTO roles (id,tenant_id,name) VALUES ($1,$2,$3)", [roleId, actor.tenantId, reader ? "Catalog Reader" : "Company Admin"]);
      await owner.query("INSERT INTO membership_roles (tenant_id,membership_id,role_id) VALUES ($1,$2,$3)", [actor.tenantId, actor.membership, roleId]);
      await owner.query("INSERT INTO role_permissions (tenant_id,role_id,permission_id) SELECT $1,$2,id FROM permissions WHERE key = ANY($3)",
        [actor.tenantId, roleId, reader ? ["organization.read"] : ["organization.read", "organization.manage", "organization.reporting.manage"]]);
    }
    await owner.query("COMMIT");
    return { tenantA, tenantB, actors, password, owner };
  } catch (error) {
    await owner.end();
    throw error;
  }
}
