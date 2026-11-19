import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "../../api/src/modules/auth/password";

test("platform operator registers, configures, and suspends a company", async ({ page, browser }) => {
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  const userId = randomUUID();
  const email = userId + "@example.invalid";
  const companyName = "Browser Company " + userId;
  const companyEmail = "company-" + email;
  const adminEmail = "admin-" + email;
  const password = "Tenant-browser-password-2026!";
  const outbox = fileURLToPath(new URL("../../../.local/mail/", import.meta.url));
  await owner.connect();
  try {
    await owner.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)", [userId, email, await hashPassword(password)]);
    await owner.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [userId]);
    await page.goto("/login");
    await page.getByLabel("Email or Employee ID").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tenant statistics" })).toBeVisible();
    await page.getByRole("link", { name: "Add company" }).click();
    await page.getByLabel("Company name").fill(companyName);
    await page.getByLabel("Company email").fill(companyEmail);
    await page.getByLabel("Company size").selectOption("11-50");
    await page.getByRole("button", { name: "Register company" }).click();
    await expect(page.getByRole("heading", { name: companyName })).toBeVisible();

    await page.getByRole("link", { name: "Edit information" }).click();
    await page.getByLabel("City").fill("Chennai");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Company information saved.");
    await page.getByRole("link", { name: "Company profile", exact: true }).click();
    await expect(page.getByText("Chennai", { exact: true })).toBeVisible();
    await page.getByLabel("Logo file").setInputFiles({ name: "company.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSrsAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("button", { name: "Upload logo" }).click();
    const logo = page.getByRole("img", { name: companyName + " logo" });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);

    await page.getByRole("link", { name: "Configuration", exact: true }).click();
    await page.getByLabel("Enable attendance").check();
    await page.getByLabel("Timezone").fill("UTC");
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByRole("status")).toHaveText("Configuration saved.");
    await page.reload();
    await expect(page.getByLabel("Enable attendance")).toBeChecked();
    await expect(page.getByLabel("Timezone")).toHaveValue("UTC");

    await page.getByRole("link", { name: "Company profile" }).click();
    await page.getByRole("link", { name: "Manage admins" }).click();
    await page.getByLabel("Administrator email").fill(adminEmail);
    await page.getByRole("button", { name: "Add administrator" }).click();
    await expect(page.getByText(adminEmail, { exact: true })).toBeVisible();
    await expect(page.getByText("Invitation pending", { exact: true })).toBeVisible();
    let setupUrl = "";
    for (const file of await readdir(outbox)) {
      const message = JSON.parse(await readFile(join(outbox, file), "utf8").catch(() => "{}"));
      if (message.to === adminEmail) setupUrl = message.url;
    }
    expect(setupUrl).not.toBe("");
    const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const adminPage = await adminContext.newPage();
      const adminPassword = "Tenant-company-browser-password-2026!";
      await adminPage.goto(setupUrl);
      await adminPage.getByLabel("New password", { exact: true }).fill(adminPassword);
      await adminPage.getByLabel("Confirm password", { exact: true }).fill(adminPassword);
      await adminPage.getByRole("button", { name: "Update password" }).click();
      await expect(adminPage.getByRole("status")).toHaveText("Password updated. All previous sessions have been signed out.");
      await adminPage.getByRole("link", { name: "Back to sign in" }).click();
      await adminPage.getByLabel("Email or Employee ID").fill(adminEmail);
      await adminPage.getByLabel("Password", { exact: true }).fill(adminPassword);
      await adminPage.getByRole("button", { name: "Sign in", exact: true }).click();
      await adminPage.getByRole("link", { name: "Manage company" }).click();
      await expect(adminPage.getByRole("heading", { name: companyName })).toBeVisible();
      await adminPage.getByRole("navigation").getByRole("link", { name: "Configuration" }).click();
      await expect(adminPage.getByLabel("Timezone")).toHaveValue("UTC");
    } finally { await adminContext.close(); }

    await page.getByRole("link", { name: "Company profile" }).click();
    await page.getByRole("button", { name: "Suspend company" }).click();
    await expect(page.getByText("Company suspended", { exact: true })).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "Companies", exact: true }).click();
    await page.getByRole("searchbox").fill(companyEmail);
    await page.getByLabel("Status", { exact: true }).selectOption("SUSPENDED");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("row").filter({ hasText: companyName })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    const tenants = await owner.query("SELECT id FROM tenants WHERE company_email = $1", [companyEmail]);
    const tenantIds = tenants.rows.map(({ id }) => id);
    await owner.query("DELETE FROM audit_logs WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM roles WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM employment_types WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
    await owner.query("DELETE FROM auth_events WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [[email, adminEmail]]);
    await owner.query("DELETE FROM platform_audit_logs WHERE actor_id = $1", [userId]);
    await owner.query("DELETE FROM platform_admins WHERE user_id = $1", [userId]);
    await owner.query("DELETE FROM users WHERE email = ANY($1)", [[email, adminEmail]]);
    for (const file of await readdir(outbox).catch(() => [] as string[])) {
      const path = join(outbox, file);
      const mail = JSON.parse(await readFile(path, "utf8").catch(() => "{}"));
      if (mail.to === adminEmail) await unlink(path);
    }
    await owner.end();
  }
});

