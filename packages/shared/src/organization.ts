export const organizationPermissions = {
  read: "organization.read",
  manage: "organization.manage",
  manageReporting: "organization.reporting.manage",
} as const;
import { z } from "zod";


const name = z.string().trim().min(1, "Enter a name.").max(200);
const code = z.string().trim().toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/, "Use up to 40 letters, digits, hyphens or underscores for the code.");
const description = z.string().trim().max(1000).nullish();
const positiveInt = z.number().int().min(1).max(2147483647);
export const workLocationKinds = ["OFFICE", "REMOTE", "HYBRID", "CUSTOM"] as const;

export const branchSchema = z.strictObject({
  name, code,
  address: z.string().trim().min(1, "Enter a branch address.").max(500),
  contactEmail: z.string().trim().pipe(z.email().max(320)).nullish(),
  contactPhone: z.string().trim().min(1).max(40).nullish(),
  isPrimary: z.boolean().optional(),
});
export const departmentSchema = z.strictObject({ name, code, description });
export const designationSchema = z.strictObject({
  name, code, departmentId: z.uuid("Choose a department."), jobLevel: positiveInt,
});
export const jobGradeSchema = z.strictObject({ name, code, description, rank: positiveInt });
export const workLocationSchema = z.strictObject({
  name, code, kind: z.enum(workLocationKinds),
  branchId: z.uuid().nullish(), address: z.string().trim().max(500).nullish(),
});

export const catalogQuery = z.strictObject({
  search: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});
export const catalogStatusQuery = catalogQuery.extend({
  status: z.enum(["active", "inactive"]).optional(),
});

export type CatalogRow = {
  id: string;
  name: string;
  code: string;
  active?: boolean;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isPrimary?: boolean;
  description?: string | null;
  departmentId?: string;
  department?: { id: string; name: string; code: string };
  jobLevel?: number;
  rank?: number;
  kind?: (typeof workLocationKinds)[number];
  branchId?: string | null;
  branch?: { id: string; name: string; code: string } | null;
};
export type CatalogPage = { items: CatalogRow[]; total: number; page: number; limit: number };
