import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "../../api/src/modules/auth/password";

test("login validation, password visibility, session restoration, and protected routes on desktop and mobile", async ({ page }) => {
  const owner = new pg.Client({ connectionString: process.env.DIRECT_URL });
  const userId = randomUUID();
  const email = userId + "@example.invalid";
  const password = "Browser-test-password-2026!";
  let deliveredPath: string | null = null;
  await owner.connect();
  try {
    await owner.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)", [userId, email, await hashPassword(password)]);
    await owner.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [userId]);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter your email or Employee ID.", { exact: true })).toBeVisible();
    await page.getByLabel("Email or Employee ID").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Unable to sign in with these credentials.");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Remember me").check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible();
    await page.getByRole("link", { name: "Account & security" }).click();
    await expect(page.getByRole("heading", { name: "Your account & security" })).toBeVisible();
    const refreshCookie = (await page.context().cookies()).find((cookie) => cookie.name === "seyyon_refresh");
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Good to have you back." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Let’s get you back in." })).toBeVisible();
    await page.getByLabel("Account email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText("If the account is eligible, a password reset link will be sent.");
    const outbox = fileURLToPath(new URL("../../../.local/mail/", import.meta.url));
    let resetUrl = "";
    for (const filename of await readdir(outbox)) {
      const content = JSON.parse(await readFile(outbox + filename, "utf8"));
      if (content.to === email) { resetUrl = content.url; deliveredPath = outbox + filename; }
    }
    expect(resetUrl).not.toBe("");
    await page.goto(resetUrl);
    await expect(page.getByRole("heading", { name: "Choose a new password." })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    const updatedPassword = "Updated-browser-password-2026!";
    await page.getByLabel("New password", { exact: true }).fill(updatedPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(updatedPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toHaveText("Password updated. All previous sessions have been signed out.");
    await page.getByRole("link", { name: "Back to sign in", exact: false }).click();
    await page.getByLabel("Email or Employee ID").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(updatedPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/platform$/);
  } finally {
    await owner.query("DELETE FROM auth_events WHERE user_id = $1", [userId]);
    await owner.query("DELETE FROM platform_admins WHERE user_id = $1", [userId]);
    await owner.query("DELETE FROM users WHERE id = $1", [userId]);
    if (deliveredPath) await unlink(deliveredPath);
    await owner.end();
  }
});

