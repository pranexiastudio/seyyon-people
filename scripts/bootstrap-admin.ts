import pg from "pg";
import { z } from "zod";
import { passwordSchema } from "@seyyon/shared";
import { hashPassword } from "../apps/api/src/modules/auth/password.js";

if (process.env.NODE_ENV === "production") throw new Error("Bootstrap is local-only.");
const email = z.email().parse(process.env.BOOTSTRAP_ADMIN_EMAIL).toLowerCase();
const password = passwordSchema.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
const passwordHash = await hashPassword(password);
const owner = new pg.Client({ connectionString: z.url().parse(process.env.DIRECT_URL) });
await owner.connect();
try {
  await owner.query("BEGIN");
  await owner.query("SELECT pg_advisory_xact_lock(849312)");
  if ((await owner.query("SELECT 1 FROM platform_admins LIMIT 1")).rowCount) throw new Error("A platform administrator already exists. Bootstrap does not overwrite accounts.");
  const result = await owner.query("INSERT INTO users (id, email, password_hash) VALUES (gen_random_uuid(), $1, $2) RETURNING id", [email, passwordHash]);
  await owner.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [result.rows[0].id]);
  await owner.query("INSERT INTO auth_events (id, user_id, action, request_id) VALUES (gen_random_uuid(), $1, 'LOCAL_ADMIN_BOOTSTRAPPED', 'local-cli')", [result.rows[0].id]);
  await owner.query("COMMIT");
  console.log("Local platform administrator created. Sign in with the supplied email and password.");
} catch (error) {
  await owner.query("ROLLBACK");
  throw error;
} finally {
  await owner.end();
}

