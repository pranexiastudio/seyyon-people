import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30_000,
  use: { baseURL: process.env.WEB_ORIGIN || "http://localhost:5173", channel: "msedge", headless: true, screenshot: "only-on-failure" },
  webServer: {
    command: "npm run dev",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: (process.env.WEB_ORIGIN || "http://localhost:5173") + "/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

