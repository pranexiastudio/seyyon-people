import { test, expect, type Page } from "@playwright/test";
import { employeePermissions } from "@seyyon/shared";
import { organizationFixtures } from "../../api/test/organization-fixtures";

test.skip(!process.env.SEYYON_ORG_TEST_DB, "Requires a named disposable local database with the employee migration applied.");
test.describe.configure({ timeout: 60_000 });
const path = "/app/employees";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or Employee ID").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("This session", { exact: true })).toBeVisible();
}

async function fixtures() {
  const fixture = await organizationFixtures();
  const { owner, tenantA } = fixture;
  try {
    await owner.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_id) SELECT r.tenant_id,r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=$1 AND ((r.name='Company Admin' AND p.key=ANY($2::text[])) OR (r.name='Catalog Reader' AND p.key=$3))",
      [tenantA, Object.values(employeePermissions), employeePermissions.read],
    );
    return fixture;
  } catch (error) {
    await owner.end();
    throw error;
  }
}

function checkBrowser(page: Page, allowed: string[] = []) {
  const errors: string[] = [];
  const responses = new Map<number, number>();
  const resourceErrors: number[] = [];
  page.on("pageerror", () => errors.push("Uncaught browser exception"));
  page.on("response", (response) => {
    const route = new URL(response.url()).pathname;
    if (!route.startsWith("/api/") || response.status() < 400) return;
    const label = response.request().method() + " " + route + " " + response.status();
    if (label === "POST /api/v1/auth/refresh 401" || allowed.includes(label)) {
      responses.set(response.status(), (responses.get(response.status()) ?? 0) + 1);
    } else errors.push(label);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) errors.push(request.method() + " " + url.pathname + " transport failure");
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location().url;
    const status = Number(message.text().match(/^Failed to load resource: the server responded with a status of (\d{3})/)?.[1]);
    if (status === 404 && source.endsWith("/favicon.ico")) return;
    if (status) resourceErrors.push(status);
    else errors.push("Unexpected browser console error");
  });
  return () => {
    for (const status of resourceErrors) {
      const expected = responses.get(status) ?? 0;
      if (expected) responses.set(status, expected - 1);
      else errors.push("Unexpected browser resource error " + status);
    }
    expect(errors).toEqual([]);
  };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("Company Admin saves a draft, completes the profile, and manages status and reporting", async ({ page }) => {
  const failures: string[] = [];
  const verify = checkBrowser(page, failures);
  await page.setViewportSize({ width: 1440, height: 900 });
  const { owner, actors, tenantA, password } = await fixtures();
  try {
    await owner.query("INSERT INTO departments(id,tenant_id,name,code,updated_at) VALUES(gen_random_uuid(),$1,'Engineering','ENG',now())", [tenantA]);
    await owner.query("INSERT INTO employees(id,tenant_id,employee_number,display_name,updated_at) VALUES(gen_random_uuid(),$1,'LEAD','Morgan Lead',now())", [tenantA]);
    await owner.query("INSERT INTO employees(id,tenant_id,employee_number,display_name,updated_at) VALUES(gen_random_uuid(),$1,'DEPUTY','Taylor Deputy',now())", [tenantA]);
  } finally { await owner.end(); }
  await login(page, actors.admin.email, password);
  await page.getByRole("link", { name: "Employees", exact: true }).click();
  await page.getByRole("link", { name: "Add Employee" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByLabel("First name")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Employee number", { exact: true }).fill("web-001");
  await page.getByLabel("First name").fill("Riley");
  await page.getByLabel("Last name").fill("Stone");
  await page.getByLabel("Work email", { exact: true }).fill("riley@example.invalid");
  await page.getByLabel("Personal email", { exact: true }).fill("riley-personal@example.invalid");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Riley Stone" })).toBeVisible();
  const employeePath = new URL(page.url()).pathname;
  failures.push("PATCH /api/v1/workspace/employees/" + employeePath.split("/").at(-1) + "/status 409");
  await expect(page.getByRole("region", { name: "Employee details" }).getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("joining date, department and employment type");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Edit Employee" }).click();
  await expect(page.getByRole("heading", { name: "Edit Employee" })).toBeVisible();
  await noOverflow(page);
  await page.getByLabel("Last name").fill("River");
  await page.getByLabel("Joining date", { exact: true }).fill("2026-11-01");
  await page.getByRole("combobox", { name: "Department", exact: true }).selectOption({ label: "Engineering (ENG)" });
  await page.getByRole("combobox", { name: "Employment Type", exact: true }).selectOption({ label: "Permanent (PERMANENT)" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Riley River" })).toBeVisible();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("region", { name: "Employee details" }).getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Assign manager" }).click();
  await page.getByRole("searchbox", { name: "Find manager" }).fill("Morgan");
  await page.getByRole("combobox", { name: "New manager" }).selectOption({ label: "Morgan Lead (LEAD)" });
  await page.getByRole("button", { name: "Save manager" }).click();
  await page.getByRole("link", { name: "Morgan Lead", exact: true }).click();
  await expect(page.getByRole("region", { name: "Direct reports" }).getByRole("link", { name: "Riley River (WEB-001)" })).toBeVisible();
  await page.getByRole("link", { name: "Riley River (WEB-001)" }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Deactivate employee" });
  await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirmation.getByRole("button", { name: "Confirm status change" }).click();
  await expect(page.getByRole("region", { name: "Employee details" }).getByText("Inactive", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Morgan Lead", exact: true }).click();
  await page.getByRole("combobox", { name: "Report status" }).selectOption("HISTORICAL");
  await page.getByRole("link", { name: "Riley River (WEB-001)" }).click();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("region", { name: "Employee details" }).getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change manager" }).click();
  await page.getByRole("searchbox", { name: "Find manager" }).fill("Taylor");
  await page.getByRole("combobox", { name: "New manager" }).selectOption({ label: "Taylor Deputy (DEPUTY)" });
  await page.getByRole("button", { name: "Save manager" }).click();
  await expect(page.getByRole("link", { name: "Taylor Deputy", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear manager" }).click();
  await expect(page.getByText("No manager assigned.")).toBeVisible();
  await expect(page.getByText("Manager cleared.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Riley River" })).toBeVisible();
  await expect(page.getByText("riley-personal@example.invalid")).toBeVisible();
  await expect(page.getByText("No manager assigned.")).toBeVisible();
  await noOverflow(page);
  verify();
});

test("directory filters and paging work across desktop and mobile, and readers cannot see private details", async ({ page }) => {
  const allowed: string[] = [];
  const verify = checkBrowser(page, allowed);
  const { owner, tenantA, tenantB, actors, password } = await fixtures();
  let foreign: string;
  try {
    await owner.query("INSERT INTO departments(id,tenant_id,name,code,updated_at) VALUES(gen_random_uuid(),$1,'Operations','OPS',now())", [tenantA]);
    await owner.query(
      "INSERT INTO employees(id,tenant_id,employee_number,display_name,work_email,personal_email,department_id,updated_at) SELECT gen_random_uuid(),$1,'PAGE-' || lpad(n::text,2,'0'),'Staff ' || lpad(n::text,2,'0'),'staff-' || n || '@example.invalid','hidden@example.invalid',d.id,now() FROM generate_series(1,16) n JOIN departments d ON d.tenant_id=$1",
      [tenantA],
    );
    await owner.query("INSERT INTO employees(id,tenant_id,employee_number,display_name,active,employment_status,updated_at) VALUES(gen_random_uuid(),$1,'DRAFT','Hidden Draft',false,'DRAFT',now())", [tenantA]);
    foreign = (await owner.query("INSERT INTO employees(id,tenant_id,employee_number,display_name,updated_at) VALUES(gen_random_uuid(),$1,'FOREIGN','Foreign Fixture Name',now()) RETURNING id", [tenantB])).rows[0].id;
  } finally { await owner.end(); }
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, actors.reader.email, password);
  await page.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("16 employees", { exact: true })).toBeVisible();
  await noOverflow(page);
  await expect(page.getByRole("link", { name: "Add Employee" })).toHaveCount(0);
  await expect(page.getByText("Hidden Draft", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("employeeNumber");
  await page.getByRole("combobox", { name: "Sort direction", exact: true }).selectOption("desc");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("table").getByRole("row").nth(1)).toContainText("Staff 16");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("list", { name: "Employee cards" })).toBeVisible();
  await noOverflow(page);
  await page.getByText("Organization filters", { exact: true }).click();
  await page.getByRole("combobox", { name: "Department", exact: true }).selectOption({ label: "Operations (OPS)" });
  await page.getByRole("searchbox", { name: "Search employees" }).fill("PAGE-16");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/search=PAGE-16/);
  await expect(page.getByText("1 employee", { exact: true })).toBeVisible();
  for (const search of ["staff 16", "staff-16@example.invalid"]) {
    await page.getByRole("searchbox", { name: "Search employees" }).fill(search);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name: "View Staff 16" })).toBeVisible();
    await expect(page.getByText("1 employee", { exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "View Staff 16" }).click();
  await expect(page.getByRole("heading", { name: "Staff 16" })).toBeVisible();
  await expect(page.getByText("hidden@example.invalid")).toHaveCount(0);
  await expect(page.getByText("Personal email", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit Employee" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign manager" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await noOverflow(page);
  const edit = new URL(page.url()).pathname + "/edit";
  await page.waitForLoadState("networkidle");
  await page.goto(edit);
  await expect(page.getByRole("alert")).toHaveText("Employee management permission required.");
  await page.getByRole("link", { name: "Employee directory", exact: true }).click();
  await page.getByRole("combobox", { name: "Employment status" }).selectOption("DRAFT");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "Hidden Draft" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search employees" }).fill("no-match-qa");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No employees match the current filters.")).toBeVisible();
  allowed.push("GET /api/v1/workspace/employees/" + foreign + " 404");
  await page.waitForLoadState("networkidle");
  await page.goto(path + "/" + foreign);
  await expect(page.getByRole("alert")).toHaveText("Employee not found.");
  await expect(page.getByText("Foreign Fixture Name")).toHaveCount(0);
  verify();
});

test("edit form reports a stale version and reloads the latest record", async ({ page }) => {
  const { owner, tenantA, actors, password } = await fixtures();
  try {
    const employee = (await owner.query("INSERT INTO employees(id,tenant_id,employee_number,display_name,first_name,last_name,updated_at) VALUES(gen_random_uuid(),$1,'STALE','Old Name','Old','Name',now()) RETURNING id", [tenantA])).rows[0];
    const verify = checkBrowser(page, ["PATCH /api/v1/workspace/employees/" + employee.id + " 409"]);
    await login(page, actors.admin.email, password);
    await page.waitForLoadState("networkidle");
    await page.goto(path + "/" + employee.id + "/edit");
    await expect(page.getByLabel("First name")).toHaveValue("Old");
    await page.getByLabel("First name").fill("Local");
    await owner.query("UPDATE employees SET first_name='Remote',display_name='Remote Name',version=version+1 WHERE id=$1 AND tenant_id=$2", [employee.id, tenantA]);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert")).toContainText("changed elsewhere");
    await page.getByRole("button", { name: "Reload latest record" }).click();
    await expect(page.getByLabel("First name")).toHaveValue("Remote");
    verify();
  } finally { await owner.end(); }
});

test("department management assigns, replaces and clears a head", async ({ page }) => {
  const { owner, tenantA, actors, password } = await fixtures();
  try {
    const department = (await owner.query(
      "INSERT INTO departments(id,tenant_id,name,code,updated_at) VALUES(gen_random_uuid(),$1,'Head workflow','HEAD',now()) RETURNING id",
      [tenantA],
    )).rows[0];
    await owner.query(
      "INSERT INTO employees(id,tenant_id,department_id,employee_number,display_name,updated_at) VALUES(gen_random_uuid(),$1,$2,'FIRST','First Candidate',now()),(gen_random_uuid(),$1,$2,'SECOND','Second Candidate',now())",
      [tenantA, department.id],
    );
    const verify = checkBrowser(page);
    await login(page, actors.admin.email, password);
    await page.goto("/app/organization/departments");
    await page.getByRole("button", { name: "View Head workflow" }).click();
    const panel = page.getByRole("region", { name: "Department head" });
    await expect(panel.getByText("No department head assigned.")).toBeVisible();
    for (const [action, candidate] of [["Assign", "First Candidate (FIRST)"], ["Reassign", "Second Candidate (SECOND)"]]) {
      await panel.getByRole("button", { name: action + " department head", exact: true }).click();
      await panel.getByLabel("New department head").selectOption({ label: candidate });
      await panel.getByRole("button", { name: "Save department head" }).click();
      await expect(panel.getByText(candidate, { exact: true })).toBeVisible();
    }
    await panel.getByRole("button", { name: "Clear department head" }).click();
    await expect(panel.getByText("No department head assigned.")).toBeVisible();
    verify();
  } finally { await owner.end(); }
});
