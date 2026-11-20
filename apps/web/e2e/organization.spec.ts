import { test, expect, type Page } from "@playwright/test";
import { organizationFixtures } from "../../api/test/organization-fixtures";

test.skip(!process.env.SEYYON_ORG_TEST_DB, "Organization tests require a named disposable local database.");
test.describe.configure({ timeout: 60_000 });

const organization = "/app/organization";
const catalogApi = "/api/v1/workspace/organization/";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or Employee ID").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function login(page: Page, email: string, password: string) {
  await signIn(page, email, password);
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Branches", exact: true })).toBeVisible();
}

function watchBrowser(page: Page, allowedFailures: string[] = []) {
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  const expectedStatuses = new Map<number, number>();
  const resourceErrors: { status: number; path: string }[] = [];
  page.on("pageerror", () => errors.push("Uncaught browser exception"));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const status = message.text().match(/^Failed to load resource: the server responded with a status of (\d{3})/);
    if (status) {
      const url = message.location().url;
      const path = url.startsWith("http") ? new URL(url).pathname : "";
      if (path !== "/favicon.ico" || status[1] !== "404") resourceErrors.push({ status: Number(status[1]), path });
    }
    else errors.push("Unexpected browser console error");
  });
  page.on("requestfailed", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) errors.push(request.method() + " " + path + " transport failure");
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    const status = response.status();
    if (!path.startsWith("/api/") || status < 400) return;
    const key = response.request().method() + " " + path + " " + status;
    if (key === "POST /api/v1/auth/refresh 401" || allowedFailures.includes(key)) {
      expectedStatuses.set(status, (expectedStatuses.get(status) ?? 0) + 1);
    } else {
      errors.push(key);
    }
  });
  return () => {
    for (const { status, path } of resourceErrors) {
      const expected = expectedStatuses.get(status) ?? 0;
      if (expected > 0) expectedStatuses.set(status, expected - 1);
      else errors.push("Unexpected browser resource error " + status + " " + path);
    }
    expect(errors).toEqual([]);
  };
}
const editor = (page: Page) => page.getByRole("form", { name: "Catalog form" });
const catalogs = (page: Page) => page.getByRole("navigation", { name: "Organization catalogs" });
async function startCreate(page: Page, label: string, name: string, code: string) {
  await page.getByRole("button", { name: "Add " + label, exact: true }).click();
  await editor(page).getByLabel("Name", { exact: true }).fill(name);
  await editor(page).getByLabel("Code", { exact: true }).fill(code);
}
async function create(page: Page, label: string, result: string) {
  await editor(page).getByRole("button", { name: "Create " + label, exact: true }).click();
  await expect(page.getByText(result, { exact: true })).toBeVisible();
}
async function deactivate(page: Page, name: string) {
  await page.getByRole("button", { name: "Deactivate " + name, exact: true }).click();
  await page.getByRole("button", { name: "Confirm deactivation", exact: true }).click();
  await expect(page.getByText("Record deactivated.", { exact: true })).toBeVisible();
}

test("Company Admin manages the organization catalogs on desktop and mobile", async ({ page }) => {
  const verifyBrowser = watchBrowser(page, ["POST " + catalogApi + "branches 409"]);
  const { actors, password, owner } = await organizationFixtures();
  await owner.end();
  await login(page, actors.admin.email, password);
  await expect(page.getByText("No branches found.")).toBeVisible();
  await startCreate(page, "branch", "Studio branch", "hq");
  await editor(page).getByLabel("Address", { exact: true }).fill("42 Studio Road");
  await editor(page).getByLabel("Contact email").fill("branch@example.invalid");
  await editor(page).getByLabel("Primary branch", { exact: true }).check();
  await create(page, "branch", "Branch created.");
  await page.getByRole("button", { name: "View Studio branch" }).click();
  await expect(page.getByText("42 Studio Road", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Studio branch" }).click();
  await editor(page).getByLabel("Name", { exact: true }).fill("Prism branch");
  await editor(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await startCreate(page, "branch", "Duplicate", "HQ");
  await editor(page).getByLabel("Address").fill("42 Studio Road");
  await editor(page).getByRole("button", { name: "Create branch" }).click();
  await expect(page.getByRole("alert")).toHaveText("This code is already in use.");
  await page.getByRole("button", { name: "Close" }).click();
  await startCreate(page, "branch", "Satellite branch", "SAT");
  await editor(page).getByLabel("Address").fill("5 Satellite Road");
  await create(page, "branch", "Branch created.");
  await deactivate(page, "Satellite branch");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: "Reactivate Satellite branch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Prism branch" })).toHaveCount(0);

  await catalogs(page).getByRole("link", { name: "Departments" }).click();
  await startCreate(page, "department", "Engineering", "ENG");
  await editor(page).getByLabel("Description").fill("Product engineering");
  await create(page, "department", "Department created.");
  await page.getByRole("button", { name: "Edit Engineering" }).click();
  await editor(page).getByLabel("Description").fill("Build and maintain products.");
  await editor(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();

  await catalogs(page).getByRole("link", { name: "Designations" }).click();
  await startCreate(page, "designation", "Engineer", "DEV");
  await editor(page).getByRole("combobox", { name: "Department", exact: true }).selectOption({ label: "Engineering (ENG)" });
  await editor(page).getByLabel("Job level", { exact: true }).fill("2");
  await create(page, "designation", "Designation created.");
  await page.getByRole("button", { name: "Edit Engineer", exact: true }).click();
  await editor(page).getByLabel("Job level", { exact: true }).fill("3");
  await editor(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await deactivate(page, "Engineer");
  await catalogs(page).getByRole("link", { name: "Departments" }).click();
  await deactivate(page, "Engineering");

  await catalogs(page).getByRole("link", { name: "Job grades" }).click();
  await startCreate(page, "job grade", "Grade One", "G1");
  await editor(page).getByLabel("Grade rank").fill("1");
  await create(page, "job grade", "Job grade created.");
  await expect(page.getByText("G1 · Rank 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Grade One" }).click();
  await editor(page).getByLabel("Grade rank").fill("2");
  await editor(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("G1 · Rank 2", { exact: true })).toBeVisible();
  await deactivate(page, "Grade One");

  await catalogs(page).getByRole("link", { name: "Employment types" }).click();
  await expect(page.getByRole("button", { name: "View Permanent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add employment type" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await catalogs(page).getByRole("link", { name: "Work locations" }).click();
  await startCreate(page, "work location", "Satellite office", "WF1");
  await editor(page).getByRole("combobox", { name: "Location type", exact: true }).selectOption("HYBRID");
  await editor(page).getByRole("combobox", { name: "Branch", exact: true }).selectOption({ label: "Prism branch (HQ)" });
  await create(page, "work location", "Work location created.");
  await page.getByRole("combobox", { name: "Location type", exact: true }).selectOption("HYBRID");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: "View Satellite office" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Satellite office" }).click();
  await editor(page).getByLabel("Address").fill("12 Satellite Road");
  await editor(page).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  await deactivate(page, "Satellite office");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  verifyBrowser();
});

test("delegated organization readers can browse without management controls", async ({ page }) => {
  const verifyBrowser = watchBrowser(page);
  const { actors, password, owner } = await organizationFixtures();
  await owner.end();
  await login(page, actors.reader.email, password);
  const company = page.getByRole("navigation", { name: "Company navigation" });
  await expect(company.getByRole("link", { name: "Company profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add branch" })).toHaveCount(0);
  await catalogs(page).getByRole("link", { name: "Employment types" }).click();
  await page.getByRole("button", { name: "View Permanent" }).click();
  await expect(page.getByRole("heading", { name: "Permanent", exact: true })).toBeVisible();
  verifyBrowser();
});

const writableCatalogs = [
  { route: "branches", title: "Branches", label: "branch", field: "Address", original: "1 Demo Road", updated: "2 Demo Road" },
  { route: "departments", title: "Departments", label: "department", field: "Description", original: "Initial Department", updated: "Updated Department" },
  { route: "designations", title: "Designations", label: "designation", field: "Job level", original: "1", updated: "3" },
  { route: "job-grades", title: "Job grades", label: "job grade", field: "Grade rank", original: "10", updated: "20" },
  { route: "work-locations", title: "Work locations", label: "work location", field: "Address", original: "1 Demo Office", updated: "2 Demo Office" },
];

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const { route, title, label, field, original, updated } of writableCatalogs) {
  test(title + " validate, persist, filter and restore status", async ({ page }) => {
    const verifyBrowser = watchBrowser(page, ["POST " + catalogApi + route + " 409"]);
    const { actors, password, owner, tenantA } = await organizationFixtures();
    try {
      if (route === "designations") {
        await owner.query("INSERT INTO departments (id,tenant_id,name,code,updated_at) VALUES (gen_random_uuid(),$1,'Fixture department','DEP',now())", [tenantA]);
      }
      if (route === "branches") {
        await owner.query(
          "INSERT INTO branches (id,tenant_id,name,code,address,updated_at) SELECT gen_random_uuid(),$1,'Page branch ' || n,'PAGE-' || n,'Demo Road',now() FROM generate_series(1,16) n",
          [tenantA],
        );
      }
    } finally {
      await owner.end();
    }
    await signIn(page, actors.admin.email, password);
    await expect(page.getByText("This session", { exact: true })).toBeVisible();
    const path = organization + "/" + route;
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

    if (route === "branches") {
      await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    }

    const name = "QA " + label;
    const form = editor(page);
    const submit = form.getByRole("button", { name: "Create " + label, exact: true });
    async function fillCatalog(value: string) {
      if (route === "designations") {
        await form.getByRole("combobox", { name: "Department", exact: true }).selectOption({ label: "Fixture department (DEP)" });
      }
      await form.getByLabel(field, { exact: true }).fill(value);
    }
    await startCreate(page, label, name, "bad code");
    await fillCatalog(original);
    await submit.click();
    await expect(form.getByRole("alert")).toHaveText(/letters, digits, hyphens or underscores/);
    await form.getByLabel("Code", { exact: true }).fill("qa-code");
    await submit.click();
    await expect(form).toHaveCount(0);

    if (route === "branches") {
      const list = page.getByRole("region", { name: "Branches list" });
      await list.getByRole("searchbox").fill("qa-code");
      await list.getByRole("button", { name: "Apply filters" }).click();
    }
    const view = page.getByRole("button", { name: "View " + name, exact: true });
    const record = page.getByRole("region", { name: "Organization record" });
    await view.click();
    await expect(record.locator("dd").getByText(original, { exact: true })).toBeVisible();
    await record.getByRole("button", { name: "Close" }).click();
    await startCreate(page, label, "Duplicate", "Qa-CoDe");
    await fillCatalog(route === "job-grades" ? "11" : original);
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("This code is already in use.");
    await record.getByRole("button", { name: "Close" }).click();

    await expectNoOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
    const fieldRole = route === "designations" || route === "job-grades" ? "spinbutton" : "textbox";
    const editField = form.getByRole(fieldRole, { name: field, exact: true });
    await expect(editField).toHaveValue(original);
    await expectNoOverflow(page);
    await editField.fill(updated);
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
    await deactivate(page, name);
    const filters = page.getByRole("region", { name: title + " list" });
    await filters.getByRole("searchbox", { name: "Search by name or code", exact: true }).fill("qa-code");
    await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("inactive");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    const reactivate = page.getByRole("button", { name: "Reactivate " + name, exact: true });
    await expect(reactivate).toBeVisible();
    await page.reload();
    await expect(reactivate).toBeVisible();
    await expect(filters.getByRole("button", { name: /^View / })).toHaveCount(1);
    await view.click();
    await expect(record.locator("dd").getByText(updated, { exact: true })).toBeVisible();
    await reactivate.click();
    await page.getByRole("button", { name: "Confirm reactivation" }).click();
    await expect(page.getByText("Record reactivated.", { exact: true })).toBeVisible();
    await expect(view).toHaveCount(0);
    await page.goto(path + "?status=active&search=qa-code");
    await expect(view).toBeVisible();
    await expectNoOverflow(page);
    verifyBrowser();
  });
}

test("Employment types are seeded, searchable and read-only on desktop and mobile", async ({ page }) => {
  const verifyBrowser = watchBrowser(page);
  const { actors, password, owner } = await organizationFixtures();
  await owner.end();
  await signIn(page, actors.admin.email, password);
  await expect(page.getByText("This session", { exact: true })).toBeVisible();
  const path = organization + "/employment-types";
  await page.goto(path);
  const list = page.getByRole("region", { name: "Employment types list" });
  const defaults = [
    ["Contract", "CONTRACT"], ["Intern", "INTERN"], ["Part-time", "PART_TIME"],
    ["Permanent", "PERMANENT"], ["Probation", "PROBATION"], ["Temporary", "TEMPORARY"],
  ];
  await expect(list.getByRole("listitem")).toHaveCount(defaults.length);
  for (const [name, code] of defaults) {
    const row = list.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View " + name, exact: true }) });
    await expect(row.getByText(code, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /^(Add|Edit|Deactivate|Reactivate) / })).toHaveCount(0);
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await list.getByRole("searchbox").fill("part_time");
  await list.getByRole("button", { name: "Apply filters" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await list.getByRole("button", { name: "View Part-time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Part-time", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Add|Edit|Deactivate|Reactivate) / })).toHaveCount(0);
  await expectNoOverflow(page);
  verifyBrowser();
});

test("organization direct routes enforce workspace roles", async ({ browser, baseURL }) => {
  const { actors, password, owner, tenantA, tenantB } = await organizationFixtures();
  try {
    await owner.query(
      "INSERT INTO branches (id,tenant_id,name,code,address,updated_at) VALUES (gen_random_uuid(),$1,'Own branch','SAME','Demo',now()),(gen_random_uuid(),$2,'Foreign branch','SAME','Demo',now())",
      [tenantA, tenantB],
    );
  } finally {
    await owner.end();
  }
  for (const actor of ["anonymous", "member", "platform", "reader"] as const) {
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      const verifyBrowser = watchBrowser(page);
      if (actor !== "anonymous") {
        await signIn(page, actors[actor].email, password);
        await expect(page).toHaveURL(actor === "platform" ? /\/platform$/ : /\/app$/);
        await page.waitForLoadState("networkidle");
      }
      await page.goto(organization + "/branches?search=SAME");
      if (actor === "reader") {
        await expect(page.getByRole("button", { name: "View Own branch" })).toBeVisible();
        await expect(page.getByText("Foreign branch", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^(Add|Edit|Deactivate|Reactivate) / })).toHaveCount(0);
        for (const catalog of [...writableCatalogs.slice(1), { route: "employment-types", title: "Employment types" }]) {
          await page.waitForLoadState("networkidle");
          await page.goto(organization + "/" + catalog.route);
          await expect(page.getByRole("heading", { name: catalog.title, exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: /^(Add|Edit|Deactivate|Reactivate) / })).toHaveCount(0);
        }
      } else if (actor === "member") {
        await expect(page.getByRole("alert")).toHaveText("Organization access requires a workspace permission.");
      } else {
        await expect(page).toHaveURL(actor === "platform" ? /\/platform$/ : /\/login$/);
      }
      verifyBrowser();
    } finally {
      await context.close();
    }
  }
});
