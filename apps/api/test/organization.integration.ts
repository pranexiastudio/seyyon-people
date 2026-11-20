import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import request from "supertest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { database } from "../src/lib/database.js";
import { organizationFixtures } from "./organization-fixtures.js";

const root = "/api/v1/workspace/organization";

test("organization catalog lifecycle, permissions and tenant isolation", async (suite) => {
  const { owner, actors, password, tenantA, tenantB } = await organizationFixtures();
  const login = async (email: string) => {
    const response = await request(app).post("/api/v1/auth/login").set("Origin", env.WEB_ORIGIN)
      .send({ identifier: email, password, remember: false });
    assert.equal(response.status, 200, "Fixture login failed");
    return response.body.accessToken as string;
  };
  const expect = (response: request.Response, status: number, errorCode?: string) => {
    assert.equal(response.status, status, response.body.error?.code);
    if (errorCode) assert.equal(response.body.error?.code, errorCode);
    return response.body;
  };
  try {
    const [admin, other, reader, member, platform] = await Promise.all(Object.values(actors).map(({ email }) => login(email)));
    const access = (token: string) => ({
      get: (path: string) => request(app).get(root + path).auth(token, { type: "bearer" }),
      post: (path: string, payload: object) => request(app).post(root + path).auth(token, { type: "bearer" }).send(payload),
      patch: (path: string, payload: object) => request(app).patch(root + path).auth(token, { type: "bearer" }).send(payload),
    });
    const own = access(admin!);
    const foreign = access(other!);
    const branch = { name: "Headquarters", code: "hq", address: "10 Test Road", isPrimary: true };
    const department = { name: "Engineering", code: "eng", description: "Build systems" };
    let hq: string;
    let otherBranch: string;
    let engineering: string;
    let operations: string;
    let otherDepartment: string;
    let designation: string;
    let junior: string;
    let office: string;

    await suite.test("requires workspace permission, rejects tenant input and guards stale tabs", async () => {
      expect(await request(app).get(root + "/branches"), 401);
      expect(await access(member!).get("/branches"), 403);
      expect(await access(platform!).get("/branches"), 403);
      expect(await access(reader!).get("/branches"), 200);
      expect(await access(reader!).post("/branches", branch), 403);
      expect(await own.get("/branches").set("X-Expected-Membership", actors.other.membership), 409, "WORKSPACE_CHANGED");
      expect(await own.post("/branches", { ...branch, tenantId: tenantB }), 400);
      expect(await own.get("/branches?limit=101"), 400);
    });
    await suite.test("branches support search, paging, details, primary changes and tenant isolation", async () => {
      hq = expect(await own.post("/branches", branch), 201).id;
      assert.equal(expect(await own.get("/branches/" + hq), 200).code, "HQ");
      expect(await own.post("/branches", { ...branch, isPrimary: false }), 409, "DUPLICATE_ORGANIZATION_CODE");
      expect(await own.patch("/branches/" + hq, { active: false }), 409, "ORGANIZATION_RECORD_IN_USE");
      expect(await own.patch("/branches/" + hq, { contactEmail: "invalid" }), 400);
      const responses = await Promise.all([
        own.post("/branches", { ...branch, name: "South branch", code: "SOUTH" }),
        own.post("/branches", { ...branch, name: "North branch", code: "NORTH" }),
      ]);
      for (const response of responses) expect(response, 201);
      const list = expect(await own.get("/branches?limit=1"), 200);
      assert.equal(list.total, 3);
      assert.equal(list.items[0].isPrimary, true);
      assert.notEqual(expect(await own.get("/branches?limit=1&page=2"), 200).items[0].id, list.items[0].id);
      assert.equal(expect(await own.get("/branches?search=headQUARTERS"), 200).items[0].id, hq);
      assert.equal(expect(await own.get("/branches?search=%25"), 200).total, 0);
      assert.equal(expect(await own.get("/branches"), 200).items.filter((row: { isPrimary: boolean }) => row.isPrimary).length, 1);
      expect(await own.patch("/branches/" + hq, { contactPhone: "+91 555 0123" }), 200);
      otherBranch = expect(await foreign.post("/branches", branch), 201).id;
      assert.equal(expect(await foreign.get("/branches"), 200).total, 1);
      expect(await foreign.get("/branches/" + hq), 404);
      expect(await foreign.patch("/branches/" + hq, { name: "Unauthorized" }), 404);
    });
    await suite.test("departments support editing and status changes", async () => {
      engineering = expect(await own.post("/departments", department), 201).id;
      operations = expect(await own.post("/departments", { name: "Operations", code: "ops" }), 201).id;
      otherDepartment = expect(await foreign.post("/departments", department), 201).id;
      expect(await own.patch("/departments/" + operations, { description: "Service operations", active: false }), 200);
      assert.equal(expect(await own.get("/departments?status=inactive"), 200).items[0].id, operations);
      expect(await own.patch("/departments/" + engineering, { description: "Product engineering" }), 200);
      expect(await own.patch("/departments/" + engineering, { headId: actors.member.id }), 400);
    });
    await suite.test("designations reject inactive or foreign departments and protect active dependencies", async () => {
      const payload = { name: "Engineer", code: "DEV", departmentId: engineering, jobLevel: 2 };
      expect(await own.post("/designations", { ...payload, departmentId: operations }), 409, "INACTIVE_REFERENCE");
      expect(await own.post("/designations", { ...payload, departmentId: otherDepartment }), 404);
      expect(await own.post("/designations", { ...payload, jobLevel: 0 }), 400);
      designation = expect(await own.post("/designations", payload), 201).id;
      assert.equal(expect(await own.get("/designations?departmentId=" + engineering), 200).items[0].department.name, "Engineering");
      expect(await own.patch("/designations/" + designation, { jobLevel: 3 }), 200);
      expect(await own.patch("/departments/" + engineering, { active: false }), 409, "ORGANIZATION_RECORD_IN_USE");
      expect(await own.patch("/designations/" + designation, { active: false }), 200);
      expect(await own.patch("/departments/" + engineering, { active: false }), 200);
      expect(await own.patch("/designations/" + designation, { active: true }), 409, "INACTIVE_REFERENCE");
      expect(await own.patch("/departments/" + engineering, { active: true }), 200);
      expect(await own.patch("/designations/" + designation, { active: true }), 200);
    });
    await suite.test("grades are rank-ordered and default employment types are read-only", async () => {
      const senior = expect(await own.post("/job-grades", { name: "Senior", code: "SEN", rank: 20 }), 201).id;
      junior = expect(await own.post("/job-grades", { name: "Junior", code: "JUN", rank: 10 }), 201).id;
      expect(await own.patch("/job-grades/" + senior, { rank: 10 }), 409, "DUPLICATE_GRADE_RANK");
      assert.equal(expect(await own.get("/job-grades"), 200).items[0].id, junior);
      expect(await own.patch("/job-grades/" + junior, { description: "Entry grade", active: false }), 200);
      const list = expect(await own.get("/employment-types?limit=2"), 200);
      assert.equal(list.total, 6);
      assert.equal(list.items.length, 2);
      assert.equal(expect(await own.get("/employment-types?search=Part-time"), 200).items[0].code, "PART_TIME");
      expect(await own.post("/employment-types", { name: "Extra", code: "EXTRA" }), 404);
      expect(await own.patch("/employment-types/" + list.items[0].id, { name: "Changed" }), 404);
    });
    await suite.test("work locations validate branch scope and audit successful mutations", async () => {
      const payload = { name: "Studio office", code: "OFFICE", branchId: hq, kind: "OFFICE" };
      expect(await own.post("/work-locations", { ...payload, branchId: otherBranch }), 404);
      office = expect(await own.post("/work-locations", payload), 201).id;
      expect(await own.post("/work-locations", { name: "Flexible", code: "FLEX", kind: "HYBRID" }), 201);
      assert.equal(expect(await own.get("/work-locations?kind=OFFICE"), 200).items[0].branch.code, "HQ");
      expect(await own.patch("/branches/" + hq, { active: false }), 409, "ORGANIZATION_RECORD_IN_USE");
      expect(await own.patch("/work-locations/" + office, { active: false }), 200);
      expect(await own.patch("/branches/" + hq, { active: false }), 200);
      expect(await own.patch("/work-locations/" + office, { active: true }), 409, "INACTIVE_REFERENCE");
      expect(await own.patch("/work-locations/" + office, { branchId: null, kind: "REMOTE", active: true }), 200);
      const audit = (await owner.query("SELECT action, entity_id FROM audit_logs WHERE tenant_id=$1", [tenantA])).rows;
      for (const action of ["BRANCH_CREATED", "BRANCH_PRIMARY_SET", "BRANCH_PRIMARY_CLEARED", "BRANCH_DEACTIVATED",
        "DEPARTMENT_UPDATED", "DESIGNATION_CREATED", "DESIGNATION_UPDATED", "JOB_GRADE_DEACTIVATED", "WORK_LOCATION_REACTIVATED"]) {
        assert.ok(audit.some((row) => row.action === action), action);
      }
      assert.equal(audit.filter((row) => row.entity_id === hq && row.action === "BRANCH_UPDATED").length, 1);
      assert.equal((await owner.query("SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2", [tenantB, hq])).rows[0].count, 0);
    });

    await suite.test("all catalogs scope lists and record IDs, enforce reader permissions and validate pagination", async () => {
      const employment = expect(await own.get("/employment-types?search=PERMANENT"), 200).items[0];
      const catalogs = [
        { path: "branches", id: hq, search: "HQ", saved: { contactPhone: "+91 555 0123", active: false } },
        { path: "departments", id: engineering, search: "ENG", saved: { description: "Product engineering", active: true } },
        { path: "designations", id: designation, search: "DEV", saved: { jobLevel: 3, active: true } },
        { path: "job-grades", id: junior, search: "JUN", saved: { description: "Entry grade", active: false } },
        { path: "employment-types", id: employment.id, search: "PERMANENT", saved: { code: "PERMANENT" } },
        { path: "work-locations", id: office, search: "OFFICE", saved: { kind: "REMOTE", branchId: null, active: true } },
      ];
      for (const { path, id, search, saved } of catalogs) {
        const readerList = expect(await access(reader!).get("/" + path + "?search=" + search + "&limit=1&page=1"), 200);
        assert.equal(readerList.items[0].id, id, path);
        assert.equal(readerList.page, 1, path);
        assert.equal(readerList.limit, 1, path);
        const detail = expect(await own.get("/" + path + "/" + id), 200);
        for (const [field, value] of Object.entries(saved)) assert.equal(detail[field], value, path + "." + field);
        expect(await foreign.get("/" + path + "/" + id), 404);
        expect(await foreign.patch("/" + path + "/" + id, { name: "Foreign change" }), 404);
        expect(await access(reader!).patch("/" + path + "/" + id, { name: "Reader change" }), path === "employment-types" ? 404 : 403);
      }
    });

    await suite.test("catalog validation and dependencies preserve existing records", async () => {
      expect(await own.post("/branches", { ...branch, code: "BAD ADDRESS", address: "" }), 400);
      expect(await own.post("/departments", { ...department, code: "ENG" }), 409, "DUPLICATE_ORGANIZATION_CODE");
      expect(await own.post("/designations", { name: "Duplicate", code: "dev", departmentId: engineering, jobLevel: 1 }), 409, "DUPLICATE_ORGANIZATION_CODE");
      expect(await own.post("/job-grades", { name: "Duplicate rank", code: "EXTRA", rank: 10 }), 409, "DUPLICATE_GRADE_RANK");
      expect(await own.post("/job-grades", { name: "Invalid rank", code: "EXTRA", rank: 0 }), 400);
      expect(await own.post("/work-locations", { name: "Invalid type", code: "EXTRA", kind: "UNKNOWN" }), 400);
      expect(await own.patch("/work-locations/" + office, { branchId: otherBranch }), 404);
      expect(await own.patch("/designations/" + designation, { departmentId: otherDepartment }), 404);

      const employee = randomUUID();
      await owner.query("UPDATE departments SET parent_id=$1 WHERE id=$2 AND tenant_id=$3", [engineering, operations, tenantA]);
      expect(await own.patch("/departments/" + operations, { active: true }), 200);
      expect(await own.patch("/departments/" + engineering, { active: false }), 409, "ORGANIZATION_RECORD_IN_USE");
      expect(await own.patch("/job-grades/" + junior, { active: true }), 200);
      await owner.query(
        "INSERT INTO employees (id,tenant_id,employee_number,display_name,department_id,designation_id,job_grade_id,work_location_id,updated_at) VALUES ($1,$2,'QA01','Synthetic dependency',$3,$4,$5,$6,now())",
        [employee, tenantA, engineering, designation, junior, office],
      );
      for (const [path, table, id] of [
        ["designations", "designations", designation], ["job-grades", "job_grades", junior], ["work-locations", "work_locations", office],
      ]) {
        expect(await own.patch("/" + path + "/" + id, { active: false }), 409, "ORGANIZATION_RECORD_IN_USE");
        assert.equal((await owner.query("SELECT active FROM " + table + " WHERE id=$1 AND tenant_id=$2", [id, tenantA])).rows[0].active, true);
      }
      await assert.rejects(owner.query("UPDATE employees SET branch_id=$1 WHERE id=$2 AND tenant_id=$3", [otherBranch, employee, tenantA]), { code: "23503" });
      await assert.rejects(owner.query("UPDATE departments SET parent_id=$1 WHERE id=$2 AND tenant_id=$3", [otherDepartment, operations, tenantA]), { code: "23503" });
      const stored = await owner.query("SELECT branch_id, department_id, designation_id FROM employees WHERE id=$1 AND tenant_id=$2", [employee, tenantA]);
      assert.deepEqual(stored.rows[0], { branch_id: null, department_id: engineering, designation_id: designation });
    });

    await suite.test("runtime RLS hides organization rows outside the transaction tenant", async () => {
      const tables = ["branches", "departments", "designations", "job_grades", "employment_types", "work_locations", "employees"];
      const role = await database.$queryRaw<{ role: string; bypass: boolean }[]>`
        SELECT current_user AS role, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname = current_user
      `;
      assert.deepEqual(role, [{ role: "seyyon_app", bypass: false }]);
      await database.$transaction(async (transaction) => {
        for (const table of tables) {
          assert.equal((await transaction.$queryRawUnsafe("SELECT id FROM " + table) as unknown[]).length, 0, table);
        }
        await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
        for (const table of tables) {
          const rows = await transaction.$queryRawUnsafe<{ tenant_id: string }[]>("SELECT tenant_id FROM " + table);
          assert.ok(rows.length > 0, table);
          assert.ok(rows.every(({ tenant_id }) => tenant_id === tenantA), table);
        }
        const changed = await transaction.$executeRaw`UPDATE branches SET name='Should stay unchanged' WHERE id=${otherBranch}::uuid`;
        assert.equal(changed, 0);
      });
      assert.deepEqual(await database.$queryRaw`SELECT id FROM branches`, []);
    });
  } finally {
    await Promise.all([owner.end(), database.$disconnect()]);
  }
});
