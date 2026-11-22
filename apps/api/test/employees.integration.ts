import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { employeePermissions } from "@seyyon/shared";
import request from "supertest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { database } from "../src/lib/database.js";
import { organizationFixtures } from "./organization-fixtures.js";

const root = "/api/v1/workspace/employees";
const person = { employeeNumber: " emp_01 ", firstName: " Ada ", lastName: " Lovelace " };

function expect(response: request.Response, status: number, code?: string) {
  assert.equal(response.status, status, response.body.error?.code);
  if (code) assert.equal(response.body.error?.code, code);
  return response.body;
}

test("employee directory CRUD, permissions and isolation", async (suite) => {
  const expected = process.env.SEYYON_ORG_TEST_DB;
  assert.ok(expected && expected !== "seyyon_people");
  for (const url of [process.env.DIRECT_URL, env.DATABASE_URL]) {
    const parsed = new URL(url ?? "");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
    assert.equal(parsed.pathname, "/" + expected);
  }
  try {
    const [runtime] = await database.$queryRaw<{ name: string; bypass: boolean }[]>`
      SELECT current_database() AS name, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname=current_user
    `;
    assert.deepEqual(runtime, { name: expected, bypass: false });
    const { owner, actors, password, tenantA, tenantB } = await organizationFixtures();
    try {
      const grants = await owner.query(
        "SELECT key FROM permissions WHERE key=ANY($1::text[])",
        [Object.values(employeePermissions)],
      );
      assert.equal(grants.rowCount, 5);
      await owner.query(
        "INSERT INTO role_permissions (tenant_id,role_id,permission_id) SELECT r.tenant_id,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=ANY($1::uuid[]) AND ((r.name='Company Admin' AND p.key=ANY($2::text[])) OR (r.name='Catalog Reader' AND p.key=$3))",
        [[tenantA, tenantB], Object.values(employeePermissions), employeePermissions.read],
      );
      async function login(email: string) {
        const result = await request(app).post("/api/v1/auth/login").set("Origin", env.WEB_ORIGIN)
          .send({ identifier: email, password, remember: false });
        return expect(result, 200).accessToken as string;
      }
      function client(token: string) {
        return {
          get: (path = "") => request(app).get(root + path).auth(token, { type: "bearer" }),
          post: (body: object) => request(app).post(root).auth(token, { type: "bearer" }).send(body),
          patch: (id: string, body: object) => request(app).patch(root + "/" + id).auth(token, { type: "bearer" }).send(body),
        };
      }
      const admin = client(await login(actors.admin.email));
      const foreign = client(await login(actors.other.email));
      const reader = client(await login(actors.reader.email));
      const member = client(await login(actors.member.email));
      const platform = client(await login(actors.platform.email));

      const [branchId, departmentId, alternativeDepartment, designationId, jobGradeId, workLocationId,
        foreignBranch, inactiveBranch, manager, legacy] = Array.from({ length: 10 }, () => randomUUID()) as [string, string, string, string, string, string, string, string, string, string];
      await owner.query("INSERT INTO branches (id,tenant_id,name,code,address,active,updated_at) VALUES ($1,$4,'HQ','HQ','Test Road',true,now()),($2,$5,'Foreign','HQ','Test Road',true,now()),($3,$4,'Closed','OLD','Test Road',false,now())", [branchId, foreignBranch, inactiveBranch, tenantA, tenantB]);
      await owner.query("INSERT INTO departments (id,tenant_id,name,code,updated_at) VALUES ($1,$3,'Engineering','ENG',now()),($2,$3,'Operations','OPS',now())", [departmentId, alternativeDepartment, tenantA]);
      await owner.query("INSERT INTO designations (id,tenant_id,department_id,name,code,job_level,updated_at) VALUES ($1,$2,$3,'Engineer','DEV',1,now())", [designationId, tenantA, departmentId]);
      await owner.query("INSERT INTO job_grades (id,tenant_id,name,code,rank,updated_at) VALUES ($1,$2,'Grade 1','G1',1,now())", [jobGradeId, tenantA]);
      await owner.query("INSERT INTO work_locations (id,tenant_id,branch_id,name,code,kind,updated_at) VALUES ($1,$2,$3,'HQ office','OFFICE','OFFICE',now())", [workLocationId, tenantA, branchId]);
      const employmentType = async (tenant: string) =>
        (await owner.query("SELECT id FROM employment_types WHERE tenant_id=$1 AND code='PERMANENT'", [tenant])).rows[0].id as string;
      const employment = await employmentType(tenantA);
      const foreignEmployment = await employmentType(tenantB);
      await owner.query("INSERT INTO employees (id,tenant_id,employee_number,display_name,manager_id,membership_id,updated_at) VALUES ($1,$3,'MGR','Legacy Manager',null,null,now()),($2,$3,'LEGACY','Legacy Full Name',$1,$4,now())", [manager, legacy, tenantA, actors.member.membership]);
      const assignments = { branchId, departmentId, designationId, jobGradeId, employmentTypeId: employment, workLocationId };
      let id: string;
      const privateContact = { personalEmail: "private@example.invalid", personalPhone: "+91 555 0100" };

      await suite.test("creates a normalized draft, returns assignment details and preserves account independence", async () => {
        const created = expect(await admin.post({ ...person, ...assignments, ...privateContact,
          workEmail: " ADA.WORK@EXAMPLE.INVALID ", joinedOn: "2024-02-29" }), 201);
        id = created.id;
        assert.equal(created.employeeNumber, "EMP_01");
        assert.equal(created.displayName, "Ada Lovelace");
        assert.equal(created.employmentStatus, "DRAFT");
        assert.equal(created.version, 1);
        assert.equal(created.joinedOn, "2024-02-29");
        assert.equal(created.workEmail, "ada.work@example.invalid");
        assert.equal(created.personalEmail, privateContact.personalEmail);
        for (const [field, reference] of Object.entries(assignments)) {
          assert.equal(created[field], reference);
          assert.equal(created[field.slice(0, -2)].id, reference);
        }
        assert.deepEqual(expect(await admin.get("/" + id), 200), created);
        const persisted = await owner.query("SELECT active,membership_id,manager_id FROM employees WHERE tenant_id=$1 AND id=$2", [tenantA, id]);
        assert.deepEqual(persisted.rows, [{ active: false, membership_id: null, manager_id: null }]);
        assert.equal((await owner.query("SELECT id FROM users WHERE email='ada.work@example.invalid'")).rowCount, 0);
      });

      await suite.test("rejects malformed fields, unknown fields, and invalid catalog assignments", async () => {
        for (const input of [
          { firstName: "" }, { lastName: null }, { employeeNumber: "bad code" }, { workEmail: "invalid" }, { personalEmail: "invalid" },
          { personalPhone: "1".repeat(41) }, { joinedOn: "2025-02-29" }, { joinedOn: "2024-02-29T00:00:00Z" },
          { departmentId: "bad" }, { tenantId: tenantB }, { managerId: manager }, { employmentStatus: "ACTIVE" },
          { designationId }, { designationId, departmentId: alternativeDepartment }, { branchId: foreignBranch },
          { employmentTypeId: foreignEmployment },
        ]) expect(await admin.post({ ...person, ...input }), 400, "INVALID_EMPLOYEE_INPUT");
        expect(await admin.post({ ...person, branchId: inactiveBranch }), 409, "INACTIVE_EMPLOYEE_ASSIGNMENT");
        expect(await admin.post({ ...person, employeeNumber: "EMP_01" }), 409, "DUPLICATE_EMPLOYEE_NUMBER");
        expect(await admin.patch(id, { version: 1, departmentId: alternativeDepartment }), 400, "INVALID_EMPLOYEE_INPUT");
        expect(await admin.patch(id, { version: 1 }), 400, "INVALID_EMPLOYEE_INPUT");
        expect(await admin.patch(id, { version: 1, membershipId: actors.member.membership }), 400, "INVALID_EMPLOYEE_INPUT");
      });

      await suite.test("searches and combines assignment filters with stable sorting and pagination", async () => {
        for (const search of ["eMp_01", "lovelace", "ADA.WORK"]) {
          const result = expect(await reader.get("?search=" + search), 200);
          assert.deepEqual(result.items.map((item: { id: string }) => item.id), [id]);
        }
        assert.equal(expect(await admin.get("?search=%25"), 200).total, 0);
        const query = new URLSearchParams({ status: "DRAFT", ...assignments });
        assert.deepEqual(expect(await admin.get("?" + query), 200).items.map((item: { id: string }) => item.id), [id]);
        for (const [field, value] of Object.entries(assignments)) {
          assert.equal(expect(await admin.get("?" + field + "=" + value), 200).total, 1);
        }
        assert.equal(expect(await admin.get("?managerId=" + manager), 200).items[0].id, legacy);
        for (const field of ["limit=101", "page=0", "sort=passwordHash", "direction=bad", "status=OTHER", "tenantId=" + tenantB]) {
          expect(await admin.get("?" + field), 400, "INVALID_EMPLOYEE_INPUT");
        }
        const first = expect(await admin.get("?sort=employeeNumber&direction=desc&limit=1"), 200);
        const second = expect(await admin.get("?sort=employeeNumber&direction=desc&limit=1&page=2"), 200);
        assert.equal(first.items[0].id, manager);
        assert.equal(second.items[0].id, legacy);
        assert.equal(second.total, 3);
        assert.equal(second.page, 2);
      });

      await suite.test("enforces read, manage and private contact permissions and excludes private values from search", async () => {
        expect(await request(app).get(root), 401);
        expect(await member.get(), 403);
        expect(await platform.get(), 403);
        expect(await reader.post(person), 403);
        expect(await reader.patch(id, { version: 1, firstName: "Changed" }), 403);
        const publicProfile = expect(await reader.get("/" + id), 200);
        assert.equal(publicProfile.workEmail, "ada.work@example.invalid");
        for (const key of Object.keys(privateContact)) {
          assert.equal(Object.hasOwn(publicProfile, key), false);
          assert.equal(Object.hasOwn(expect(await admin.get("?search=EMP_01"), 200).items[0], key), false);
        }
        assert.equal(expect(await admin.get("?search=private%40example.invalid"), 200).total, 0);
        await owner.query("INSERT INTO role_permissions(tenant_id,role_id,permission_id) SELECT r.tenant_id,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=$1 AND r.name='Catalog Reader' AND p.key=$2", [tenantA, employeePermissions.manage]);
        expect(await reader.post({ ...person, employeeNumber: "EMP_02", ...privateContact }), 403);
        expect(await reader.patch(id, { version: 1, personalPhone: null }), 403);
        const allowed = expect(await reader.post({ ...person, employeeNumber: "EMP_02" }), 201);
        assert.equal(Object.hasOwn(allowed, "personalPhone"), false);
      });

      await suite.test("updates names and assignments, rejects duplicates and stale writes, and preserves legacy links", async () => {
        expect(await admin.patch(id, { version: 1, employeeNumber: "emp_02" }), 409, "DUPLICATE_EMPLOYEE_NUMBER");
        const changed = expect(await admin.patch(id, { version: 1, lastName: "Byron", departmentId: alternativeDepartment,
          designationId: null, joinedOn: null, personalPhone: null }), 200);
        assert.equal(changed.displayName, "Ada Byron");
        assert.equal(changed.designationId, null);
        assert.equal(changed.departmentId, alternativeDepartment);
        assert.equal(changed.branchId, branchId);
        assert.equal(changed.joinedOn, null);
        assert.equal(changed.personalPhone, null);
        assert.equal(changed.version, 2);
        expect(await admin.patch(id, { version: 1, firstName: "Stale" }), 409, "EMPLOYEE_VERSION_CONFLICT");
        const concurrent = await Promise.all([
          admin.patch(id, { version: 2, firstName: "Augusta" }),
          admin.patch(id, { version: 2, firstName: "Ada" }),
        ]);
        assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 409]);
        assert.equal(expect(await admin.get("/" + id), 200).version, 3);
        const prerequisites = { departmentId, employmentTypeId: employment, joinedOn: "2024-01-01" };
        expect(await admin.patch(legacy, { version: 1, firstName: "Incomplete", ...prerequisites }), 400, "INVALID_EMPLOYEE_INPUT");
        expect(await admin.patch(legacy, { version: 1, workEmail: "legacy@example.invalid" }), 409, "EMPLOYEE_ACTIVATION_INCOMPLETE");
        const legacyChange = expect(await admin.patch(legacy, { version: 1, workEmail: "legacy@example.invalid", ...prerequisites }), 200);
        assert.equal(legacyChange.displayName, "Legacy Full Name");
        assert.equal(legacyChange.manager.id, manager);
        assert.equal((await owner.query("SELECT membership_id FROM employees WHERE id=$1 AND tenant_id=$2", [legacy, tenantA])).rows[0].membership_id, actors.member.membership);
      });

      await suite.test("isolates foreign IDs, verifies database RLS and records successful writes without personal values", async () => {
        const otherRecord = expect(await foreign.post(person), 201);
        expect(await foreign.get("/" + id), 404, "EMPLOYEE_NOT_FOUND");
        expect(await foreign.patch(id, { version: 3, firstName: "Foreign" }), 404, "EMPLOYEE_NOT_FOUND");
        assert.deepEqual(expect(await foreign.get(), 200).items.map((item: { id: string }) => item.id), [otherRecord.id]);
        assert.deepEqual(await database.$queryRaw`SELECT id FROM employees`, []);
        await database.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantB}, true)`;
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM employees`, [{ id: otherRecord.id }]);
          assert.equal(await tx.$executeRaw`UPDATE employees SET display_name='Foreign' WHERE id=${id}::uuid`, 0);
        });
        assert.deepEqual(await database.$queryRaw`SELECT id FROM employees`, []);
        const audit = await owner.query("SELECT * FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2 ORDER BY created_at", [tenantA, id]);
        assert.equal(audit.rows.length, 3);
        assert.deepEqual(audit.rows.map(({ action }) => action).sort(), ["EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_UPDATED"]);
        assert.ok(audit.rows.every(({ actor_id, request_id }) => actor_id === actors.admin.id && request_id));
        assert.ok(Object.values(privateContact).every((value) => !JSON.stringify(audit.rows).includes(value)));
        assert.equal((await owner.query("SELECT id FROM employee_changes WHERE tenant_id=$1 AND employee_id=$2", [tenantA, id])).rowCount, 0);
      });
    } finally {
      await owner.end();
    }
  } finally {
    await database.$disconnect();
  }
});
