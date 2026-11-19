import { test, expect, type Page } from "@playwright/test";
import { organizationFixtures } from "../../api/test/organization-fixtures";

test.skip(!process.env.SEYYON_ORG_TEST_DB, "Organization tests require a named disposable local database.");
test.describe.configure({ timeout: 60_000 });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email or Employee ID").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Branches", exact: true })).toBeVisible();
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
});

test("delegated organization readers can browse without management controls", async ({ page }) => {
  const { actors, password, owner } = await organizationFixtures();
  await owner.end();
  await login(page, actors.reader.email, password);
  const company = page.getByRole("navigation", { name: "Company navigation" });
  await expect(company.getByRole("link", { name: "Company profile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add branch" })).toHaveCount(0);
  await catalogs(page).getByRole("link", { name: "Employment types" }).click();
  await page.getByRole("button", { name: "View Permanent" }).click();
  await expect(page.getByRole("heading", { name: "Permanent", exact: true })).toBeVisible();
});
