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
function expect(response: request.Response, status: number, code?: string) {
  assert.equal(response.status, status, response.body.error?.code);
  if (code) assert.equal(response.body.error?.code, code);
  return response.body;
}

function requestId(response: request.Response) {
  const id = response.headers["x-request-id"];
  assert.ok(id);
  return id;
}

function foreignKeyViolation(constraint: string) {
  return (error: unknown) => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, "P2010");
    const meta = (error as { meta?: { driverAdapterError?: {
      cause?: { originalCode?: string; constraint?: { index?: string } };
    } } }).meta;
    assert.equal(meta?.driverAdapterError?.cause?.originalCode, "23503");
    assert.equal(meta?.driverAdapterError?.cause?.constraint?.index, constraint);
    return true;
  };
}

test("employee reporting and lifecycle integrate with tenant isolation and audit history", async (suite) => {
  const expected = process.env.SEYYON_ORG_TEST_DB;
  assert.ok(expected && expected !== "seyyon_people");
  for (const value of [process.env.DIRECT_URL, env.DATABASE_URL]) {
    const url = new URL(value ?? "");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.equal(url.pathname, "/" + expected);
  }
  try {
    const [runtime] = await database.$queryRaw<{ name: string; bypass: boolean }[]>`
      SELECT current_database() AS name, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname=current_user
    `;
    assert.deepEqual(runtime, { name: expected, bypass: false });
    const { owner, actors, password, tenantA, tenantB } = await organizationFixtures();
    try {
      await owner.query(
        "INSERT INTO role_permissions(tenant_id,role_id,permission_id) SELECT r.tenant_id,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=ANY($1::uuid[]) AND ((r.name='Company Admin' AND p.key=ANY($2::text[])) OR (r.name='Catalog Reader' AND p.key=$3))",
        [[tenantA, tenantB], Object.values(employeePermissions), employeePermissions.read],
      );
      async function client(email: string) {
        const login = await request(app).post("/api/v1/auth/login").set("Origin", env.WEB_ORIGIN)
          .send({ identifier: email, password, remember: false });
        const token: string = expect(login, 200).accessToken;
        return {
          get: (id: string) => request(app).get(root + "/" + id).auth(token, { type: "bearer" }),
          post: (input: object) => request(app).post(root).auth(token, { type: "bearer" }).send(input),
          manager: (id: string, managerId: string | null, version: number) =>
            request(app).put(root + "/" + id + "/manager").auth(token, { type: "bearer" }).send({ managerId, version }),
          reports: (id: string, query = "") => request(app).get(root + "/" + id + "/direct-reports" + query).auth(token, { type: "bearer" }),
          status: (id: string, status: string, version: number) =>
            request(app).patch(root + "/" + id + "/status").auth(token, { type: "bearer" }).send({ status, version }),
          edit: (id: string, input: object) =>
            request(app).patch(root + "/" + id).auth(token, { type: "bearer" }).send(input),
          head: (id: string, headId: string | null) =>
            request(app).put("/api/v1/workspace/organization/departments/" + id + "/head").auth(token, { type: "bearer" }).send({ headId }),
          headCandidates: (id: string) =>
            request(app).get("/api/v1/workspace/organization/departments/" + id + "/head-candidates").auth(token, { type: "bearer" }),
        };
      }
      const admin = await client(actors.admin.email);
      const reader = await client(actors.reader.email);
      const other = await client(actors.other.email);
      const departmentId = randomUUID();
      const closedBranch = randomUUID();
      await owner.query("INSERT INTO departments (id,tenant_id,name,code,updated_at) VALUES ($1,$2,'Engineering','ENG',now())", [departmentId, tenantA]);
      await owner.query("INSERT INTO branches (id,tenant_id,name,code,address,updated_at) VALUES ($1,$2,'Branch','BR','Synthetic address',now())", [closedBranch, tenantA]);
      const employmentTypeId = (await owner.query("SELECT id FROM employment_types WHERE tenant_id=$1 AND code='PERMANENT'", [tenantA])).rows[0].id as string;
      const required = { departmentId, employmentTypeId, joinedOn: "2024-02-29" };
      async function hire(code: string, extra: object = {}) {
        const draft = expect(await admin.post({ employeeNumber: code, firstName: code, lastName: "Fixture", ...required, ...extra }), 201);
        expect(await admin.status(draft.id, "ACTIVE", 1), 200);
        return draft.id as string;
      }
      const lead = await hire("LEAD");
      const deputy = await hire("DEPUTY");
      const employee = await hire("EMP", { personalEmail: "lifecycle-private@example.invalid" });
      const foreign = expect(await other.post({ employeeNumber: "EMP", firstName: "Other", lastName: "Tenant" }), 201).id as string;
      const managerRequests: string[] = [];
      const statusRequests: string[] = [];

      await suite.test("assigns, changes and clears managers with pagination and exact history", async () => {
        const assigned = await admin.manager(employee, lead, 2);
        assert.equal(expect(assigned, 200).manager.id, lead);
        managerRequests.push(requestId(assigned));
        expect(await admin.manager(deputy, lead, 2), 200);
        const first = expect(await reader.reports(lead, "?limit=1"), 200);
        const second = expect(await reader.reports(lead, "?limit=1&page=2"), 200);
        assert.equal(first.items[0].id, deputy);
        assert.equal(second.items[0].id, employee);
        assert.equal(second.total, 2);
        assert.equal(second.page, 2);
        assert.equal(Object.hasOwn(second.items[0], "personalEmail"), false);
        expect(await reader.reports(lead, "?limit=101"), 400);
        assert.equal(expect(await admin.manager(employee, lead, 3), 200).version, 3);
        const reassigned = await admin.manager(employee, deputy, 3);
        assert.equal(expect(reassigned, 200).manager.id, deputy);
        managerRequests.push(requestId(reassigned));
        expect(await admin.manager(employee, null, 3), 409, "EMPLOYEE_VERSION_CONFLICT");
        const cleared = await admin.manager(employee, null, 4);
        assert.equal(expect(cleared, 200).managerId, null);
        managerRequests.push(requestId(cleared));
      });

      await suite.test("rejects self-reporting, foreign employees, inactive managers and simple and multi-step cycles", async () => {
        expect(await admin.manager(employee, employee, 5), 400, "INVALID_EMPLOYEE_INPUT");
        expect(await admin.manager(lead, deputy, 2), 409, "EMPLOYEE_REPORTING_CYCLE");
        expect(await admin.manager(employee, deputy, 5), 200);
        expect(await admin.manager(lead, employee, 2), 409, "EMPLOYEE_REPORTING_CYCLE");
        expect(await admin.manager(employee, foreign, 6), 404, "EMPLOYEE_NOT_FOUND");
        expect(await other.manager(employee, null, 6), 404, "EMPLOYEE_NOT_FOUND");
        expect(await other.reports(lead), 404, "EMPLOYEE_NOT_FOUND");
        expect(await other.status(employee, "INACTIVE", 6), 404, "EMPLOYEE_NOT_FOUND");
        const activeDraft = expect(await admin.post({ employeeNumber: "DRAFT", firstName: "Draft", lastName: "Fixture" }), 201);
        expect(await admin.manager(employee, activeDraft.id, 6), 409, "INACTIVE_EMPLOYEE_MANAGER");
        expect(await request(app).get(root + "/" + lead + "/direct-reports"), 401);
        expect(await reader.manager(employee, null, 6), 403);
        expect(await reader.status(employee, "INACTIVE", 6), 403);
        await owner.query("INSERT INTO role_permissions(tenant_id,role_id,permission_id) SELECT r.tenant_id,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=$1 AND r.name='Catalog Reader' AND p.key=$2", [tenantA, employeePermissions.manageReporting]);
        const cleared = expect(await reader.manager(employee, null, 6), 200);
        assert.equal(cleared.managerId, null);
        assert.equal(Object.hasOwn(cleared, "personalEmail"), false);
        expect(await reader.status(employee, "INACTIVE", 7), 403);
      });

      await suite.test("serializes concurrent reciprocal manager changes", async () => {
        const left = await hire("LEFT");
        const right = await hire("RIGHT");
        const responses = await Promise.all([admin.manager(left, right, 2), admin.manager(right, left, 2)]);
        assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
        expect(responses.find(({ status }) => status === 409)!, 409, "EMPLOYEE_REPORTING_CYCLE");
        const managers = await owner.query("SELECT manager_id FROM employees WHERE tenant_id=$1 AND id=ANY($2::uuid[])", [tenantA, [left, right]]);
        assert.equal(managers.rows.filter(({ manager_id }) => manager_id !== null).length, 1);
      });

      await suite.test("serializes manager assignment against manager deactivation", async () => {
        const manager = await hire("RACE-LEAD");
        const report = await hire("RACE-REPORT");
        const [assignment, deactivation] = await Promise.all([
          admin.manager(report, manager, 2), admin.status(manager, "INACTIVE", 2),
        ]);
        assert.deepEqual([assignment.status, deactivation.status].sort(), [200, 409]);
        if (assignment.status === 200) {
          expect(deactivation, 409, "EMPLOYEE_HAS_ACTIVE_REPORTS");
          assert.equal(expect(await admin.get(manager), 200).employmentStatus, "ACTIVE");
        } else {
          expect(assignment, 409, "INACTIVE_EMPLOYEE_MANAGER");
          assert.equal(expect(await admin.get(report), 200).managerId, null);
        }
      });

      await suite.test("enforces activation prerequisites, active references and department-head dependencies", async () => {
        for (const [index, missing] of Object.keys(required).entries()) {
          const draft = expect(await admin.post({ employeeNumber: "MISSING-" + index, firstName: "Missing", lastName: "Fixture", ...required, [missing]: null }), 201);
          expect(await admin.status(draft.id, "ACTIVE", 1), 409, "EMPLOYEE_ACTIVATION_INCOMPLETE");
        }
        const draft = expect(await admin.post({ employeeNumber: "CLOSED", firstName: "Closed", lastName: "Fixture", ...required, branchId: closedBranch }), 201);
        expect(await admin.status(draft.id, "TERMINATED", 1), 409, "INVALID_EMPLOYEE_STATUS_TRANSITION");
        expect(await admin.status(draft.id, "INVALID", 1), 400, "INVALID_EMPLOYEE_INPUT");
        await owner.query("UPDATE branches SET active=false WHERE tenant_id=$1 AND id=$2", [tenantA, closedBranch]);
        expect(await admin.status(draft.id, "ACTIVE", 1), 409, "INACTIVE_EMPLOYEE_ASSIGNMENT");
        expect(await admin.head(departmentId, employee), 200);
        expect(await admin.status(employee, "INACTIVE", 7), 409, "EMPLOYEE_IS_DEPARTMENT_HEAD");
        expect(await admin.head(departmentId, null), 200);
      });

      await suite.test("protects active reports, validates reactivation and retains separated records and assignments", async () => {
        expect(await admin.status(lead, "INACTIVE", 2), 409, "EMPLOYEE_HAS_ACTIVE_REPORTS");
        expect(await admin.status(lead, "TERMINATED", 2), 409, "EMPLOYEE_HAS_ACTIVE_REPORTS");
        expect(await admin.status(deputy, "INACTIVE", 3), 200);
        assert.equal(expect(await reader.reports(lead), 200).total, 0);
        assert.equal(expect(await reader.reports(lead, "?status=INACTIVE"), 200).items[0].id, deputy);
        assert.equal(expect(await reader.reports(lead, "?status=HISTORICAL"), 200).items[0].id, deputy);
        assert.equal(expect(await reader.reports(lead, "?status=ALL"), 200).total, 1);
        expect(await admin.status(lead, "INACTIVE", 2), 200);
        expect(await admin.status(deputy, "ACTIVE", 4), 409, "INACTIVE_EMPLOYEE_MANAGER");
        expect(await admin.manager(deputy, null, 4), 200);
        expect(await admin.status(deputy, "ACTIVE", 5), 200);
        const inactive = await admin.status(employee, "INACTIVE", 7);
        assert.equal(expect(inactive, 200).version, 8);
        statusRequests.push(requestId(inactive));
        const reactivated = await admin.status(employee, "ACTIVE", 8);
        assert.equal(expect(reactivated, 200).employmentStatus, "ACTIVE");
        statusRequests.push(requestId(reactivated));
        expect(await admin.status(employee, "RESIGNED", 8), 409, "EMPLOYEE_VERSION_CONFLICT");
        const resigned = await admin.status(employee, "RESIGNED", 9);
        const separated = expect(resigned, 200);
        statusRequests.push(requestId(resigned));
        assert.equal(separated.departmentId, departmentId);
        assert.equal(separated.employmentTypeId, employmentTypeId);
        assert.equal(expect(await admin.get(employee), 200).employmentStatus, "RESIGNED");
        expect(await admin.status(employee, "ACTIVE", 10), 409, "INVALID_EMPLOYEE_STATUS_TRANSITION");
        expect(await admin.status(lead, "TERMINATED", 3), 200);
        expect(await admin.status(lead, "ACTIVE", 4), 409, "INVALID_EMPLOYEE_STATUS_TRANSITION");
        const persisted = await owner.query("SELECT active,employment_status FROM employees WHERE tenant_id=$1 AND id=$2", [tenantA, employee]);
        assert.deepEqual(persisted.rows, [{ active: false, employment_status: "RESIGNED" }]);
      });

      await suite.test("correlates append-only history with audits and verifies runtime isolation", async () => {
        const history = (await owner.query("SELECT * FROM employee_changes WHERE tenant_id=$1 AND employee_id=$2", [tenantA, employee])).rows;
        const audit = (await owner.query("SELECT action,actor_id,request_id FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2", [tenantA, employee])).rows;
        assert.equal(history.length, 9);
        assert.equal(audit.length, history.length + 1);
        for (const row of history) {
          assert.ok(row.created_at instanceof Date);
          assert.ok(audit.some((entry) => entry.request_id === row.request_id && entry.actor_id === row.actor_id &&
            entry.action === (row.kind === "MANAGER" ? "EMPLOYEE_MANAGER_CHANGED" : "EMPLOYEE_STATUS_CHANGED")));
        }
        assert.deepEqual(managerRequests.map((key) => history.find((row) => row.request_id === key))
          .map((row) => [row.previous_manager_id, row.new_manager_id]), [[null, lead], [lead, deputy], [deputy, null]]);
        assert.deepEqual(statusRequests.map((key) => history.find((row) => row.request_id === key))
          .map((row) => [row.previous_status, row.new_status]), [["ACTIVE", "INACTIVE"], ["INACTIVE", "ACTIVE"], ["ACTIVE", "RESIGNED"]]);
        assert.ok(!JSON.stringify({ history, audit }).includes("lifecycle-private@example.invalid"));
        const visible = () => database.$queryRaw`SELECT id FROM employee_changes WHERE employee_id=${employee}::uuid`;
        assert.deepEqual(await visible(), []);
        await database.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
          assert.equal((await tx.$queryRaw<{ id: string }[]>`SELECT id FROM employee_changes WHERE employee_id=${employee}::uuid`).length, history.length);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantB}, true)`;
          assert.deepEqual(await tx.$queryRaw`SELECT id FROM employee_changes WHERE employee_id=${employee}::uuid`, []);
        });
        assert.deepEqual(await visible(), []);
      });

      await suite.test("rejects cross-tenant employee and history relationship references in PostgreSQL", async () => {
        await database.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
          await tx.$executeRaw`SAVEPOINT foreign_manager`;
          await assert.rejects(tx.$executeRaw`UPDATE employees SET manager_id=${foreign}::uuid WHERE tenant_id=${tenantA}::uuid AND id=${employee}::uuid`,
            foreignKeyViolation("employees_tenant_id_manager_id_fkey"));
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT foreign_manager`;
          await tx.$executeRaw`SAVEPOINT foreign_history`;
          await assert.rejects(tx.$executeRaw`
            INSERT INTO employee_changes (id,tenant_id,employee_id,actor_id,kind,new_manager_id,request_id)
            VALUES (gen_random_uuid(),${tenantA}::uuid,${employee}::uuid,${actors.admin.id}::uuid,'MANAGER',${foreign}::uuid,'qa-foreign-reference')
          `, foreignKeyViolation("employee_changes_tenant_id_new_manager_id_fkey"));
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT foreign_history`;
        });
      });

      await suite.test("active edits preserve prerequisites and rejected edits produce no update audit", async () => {
        const active = await hire("EDIT-ACTIVE");
        const original = expect(await admin.get(active), 200);
        for (const field of ["joinedOn", "departmentId", "employmentTypeId"] as const) {
          expect(await admin.edit(active, { version: original.version, [field]: null }), 409, "EMPLOYEE_ACTIVATION_INCOMPLETE");
        }
        assert.deepEqual(expect(await admin.get(active), 200), original);
        const rejectedAudits = await owner.query("SELECT action FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2 AND action='EMPLOYEE_UPDATED'", [tenantA, active]);
        assert.deepEqual(rejectedAudits.rows, []);
        assert.equal(expect(await admin.edit(active, { version: original.version, joinedOn: "2025-01-01" }), 200).joinedOn, "2025-01-01");
        const draft = expect(await admin.post({ employeeNumber: "EDIT-DRAFT", firstName: "Draft", lastName: "Editable", ...required }), 201);
        const edited = expect(await admin.edit(draft.id, { version: draft.version, joinedOn: null, departmentId: null, employmentTypeId: null }), 200);
        assert.deepEqual([edited.employmentStatus, edited.joinedOn, edited.departmentId, edited.employmentTypeId, edited.version],
          ["DRAFT", null, null, null, 2]);
      });

      await suite.test("assigns, replaces and clears eligible heads, audits real changes and unblocks employee actions", async () => {
        const headAudits = () => owner.query(
          "SELECT action,request_id FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2 AND action LIKE 'DEPARTMENT_HEAD_%'",
          [tenantA, departmentId],
        );
        const existingAuditIds = new Set((await headAudits()).rows.map(({ request_id }) => request_id));
        const head = await hire("HEAD-MOVE");
        const replacement = await hire("HEAD-NEXT");
        const inactive = await hire("HEAD-INACTIVE");
        expect(await admin.status(inactive, "INACTIVE", 2), 200);
        expect(await reader.head(departmentId, head), 403);
        expect(await reader.headCandidates(departmentId), 403);
        expect(await other.head(departmentId, foreign), 404);
        for (const ineligible of [foreign, inactive, randomUUID()]) {
          expect(await admin.head(departmentId, ineligible), 409, "INELIGIBLE_DEPARTMENT_HEAD");
        }
        const candidates = expect(await admin.headCandidates(departmentId), 200).items;
        assert.ok(candidates.some(({ id }: { id: string }) => id === head));
        assert.ok(candidates.every(({ id }: { id: string }) => id !== foreign && id !== inactive));
        const assigned = await admin.head(departmentId, head);
        assert.equal(expect(assigned, 200).head.id, head);
        expect(await admin.head(departmentId, head), 200);
        expect(await admin.edit(head, { version: 2, departmentId: null }), 409, "EMPLOYEE_IS_DEPARTMENT_HEAD");
        const profile = expect(await admin.get(head), 200);
        assert.equal(profile.departmentId, departmentId);
        assert.equal(profile.version, 2);
        assert.equal((await owner.query("SELECT id FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2 AND action='EMPLOYEE_UPDATED'", [tenantA, head])).rowCount, 0);
        expect(await admin.status(head, "RESIGNED", 2), 409, "EMPLOYEE_IS_DEPARTMENT_HEAD");
        const replaced = await admin.head(departmentId, replacement);
        assert.equal(expect(replaced, 200).head.id, replacement);
        expect(await admin.status(replacement, "RESIGNED", 2), 409, "EMPLOYEE_IS_DEPARTMENT_HEAD");
        const cleared = await admin.head(departmentId, null);
        assert.equal(expect(cleared, 200).head, null);
        expect(await admin.head(departmentId, null), 200);
        expect(await admin.status(replacement, "RESIGNED", 2), 200);
        const targetDepartment = randomUUID();
        await owner.query("INSERT INTO departments (id,tenant_id,name,code,updated_at) VALUES ($1,$2,'Operations','OPS',now())", [targetDepartment, tenantA]);
        assert.equal(expect(await admin.edit(head, { version: 2, departmentId: targetDepartment }), 200).departmentId, targetDepartment);
        expect(await admin.head(departmentId, head), 409, "INELIGIBLE_DEPARTMENT_HEAD");
        const newAudits = (await headAudits()).rows.filter(({ request_id }) => !existingAuditIds.has(request_id));
        const expected = new Map([
          [requestId(assigned), "DEPARTMENT_HEAD_ASSIGNED"], [requestId(replaced), "DEPARTMENT_HEAD_REPLACED"],
          [requestId(cleared), "DEPARTMENT_HEAD_CLEARED"],
        ]);
        assert.equal(newAudits.length, 3);
        assert.deepEqual(new Map(newAudits.map(({ request_id, action }) => [request_id, action])), expected);
      });
    } finally {
      await owner.end();
    }
  } finally {
    await database.$disconnect();
  }
});
