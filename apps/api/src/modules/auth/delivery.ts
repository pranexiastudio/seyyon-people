import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";

export async function deliverReset(email: string, token: string, subject = "Reset your Seyyon People password") {
  if (env.NODE_ENV === "production") throw new Error("Local password delivery is disabled in production.");
  const directory = fileURLToPath(new URL("../../../../../.local/mail/", import.meta.url));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const url = new URL("/reset-password", env.WEB_ORIGIN);
  url.hash = token;
  await writeFile(new URL(`../../../../../.local/mail/${token.slice(0, 16)}.json`, import.meta.url),
    JSON.stringify({ to: email, subject, url: url.toString(), expiresInMinutes: 30 }, null, 2),
    { flag: "wx", mode: 0o600 });
}

