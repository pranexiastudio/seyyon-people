import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32).refine((value) => !value.startsWith("replace_")),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment keys: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}
export const env = parsed.data;

