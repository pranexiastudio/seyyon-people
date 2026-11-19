import { z } from "zod";

export const healthSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  service: z.literal("seyyon-api"),
});
export type HealthResponse = z.infer<typeof healthSchema>;

export const tenantRoleNames = [
  "Company Admin", "HR Manager", "HR Executive", "Finance / Payroll Admin",
  "Department Manager", "Team Lead", "Employee",
] as const;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or Employee ID.").max(320),
  password: z.string().min(1, "Enter your password.").max(128),
  remember: z.boolean().default(false),
}).strict();
export const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128);
export const forgotPasswordSchema = z.object({ email: z.email().max(320).transform((value) => value.toLowerCase()) }).strict();
export const resetPasswordSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }).strict();
export const authContextSchema = z.object({
  id: z.uuid(), tenantId: z.uuid(), name: z.string(),
});
export const authProfileSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email() }),
  sessionId: z.uuid(),
  platform: z.boolean(),
  tenantId: z.uuid().nullable(),
  companyName: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  contexts: z.array(authContextSchema),
  canAccessPlatform: z.boolean(),
});
export const loginResponseSchema = z.object({ accessToken: z.string(), profile: authProfileSchema });
export type AuthProfile = z.infer<typeof authProfileSchema>;

export * from "./tenant.js";
export * from "./organization.js";
