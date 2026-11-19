import assert from "node:assert/strict";
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
      const junior = expect(await own.post("/job-grades", { name: "Junior", code: "JUN", rank: 10 }), 201).id;
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
      const office = expect(await own.post("/work-locations", payload), 201).id;
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
  } finally {
    await Promise.all([owner.end(), database.$disconnect()]);
  }
});
