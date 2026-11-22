import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const qaOrigin = process.env.SEYYON_ORG_TEST_DB && process.env.WEB_ORIGIN
  ? new URL(process.env.WEB_ORIGIN) : undefined;
const apiPort = qaOrigin ? process.env.PORT ?? "4000" : "4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../..",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: Number(qaOrigin?.port || 5173), strictPort: true, proxy: { "/api": "http://127.0.0.1:" + apiPort } },
});

