import { z } from "zod";
import { catalogQuery } from "./organization.js";

export const employeePermissions = {
  read: "employees.read",
  manage: "employees.manage",
  manageReporting: "employees.reporting.manage",
  readPrivate: "employees.private.read",
  managePrivate: "employees.private.manage",
} as const;

export const employmentStatuses = ["DRAFT", "ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"] as const;
const employeeVersion = z.number().int().min(1).max(2147483647);

const assignmentIds = {
  branchId: z.uuid(),
  departmentId: z.uuid(),
  designationId: z.uuid(),
  jobGradeId: z.uuid(),
  employmentTypeId: z.uuid(),
  workLocationId: z.uuid(),
};
const name = z.string().trim().min(1).max(100);
const workOrPersonalEmail = z.string().trim().toLowerCase().pipe(z.email().max(320)).nullish();

export const employeeCreateSchema = z.strictObject({
  employeeNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
  firstName: name,
  lastName: name,
  workEmail: workOrPersonalEmail,
  personalEmail: workOrPersonalEmail,
  personalPhone: z.string().trim().min(1).max(40).nullish(),
  joinedOn: z.iso.date().refine((value) => !value.startsWith("0000-")).nullish(),
  branchId: assignmentIds.branchId.nullish(),
  departmentId: assignmentIds.departmentId.nullish(),
  designationId: assignmentIds.designationId.nullish(),
  jobGradeId: assignmentIds.jobGradeId.nullish(),
  employmentTypeId: assignmentIds.employmentTypeId.nullish(),
  workLocationId: assignmentIds.workLocationId.nullish(),
});

export const employeeUpdateSchema = employeeCreateSchema.partial()
  .extend({ version: employeeVersion })
  .refine((input) => Object.keys(input).length > 1, "Supply at least one profile field.");

export const employeeListQuery = catalogQuery.extend({
  status: z.enum(employmentStatuses).optional(),
  branchId: assignmentIds.branchId.optional(),
  departmentId: assignmentIds.departmentId.optional(),
  designationId: assignmentIds.designationId.optional(),
  jobGradeId: assignmentIds.jobGradeId.optional(),
  employmentTypeId: assignmentIds.employmentTypeId.optional(),
  workLocationId: assignmentIds.workLocationId.optional(),
  managerId: z.uuid().optional(),
  sort: z.enum(["name", "employeeNumber", "joinedOn", "createdAt", "status"]).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeListQuery = z.infer<typeof employeeListQuery>;

export const employeeManagerSchema = z.strictObject({ managerId: z.uuid().nullable(), version: employeeVersion });
export const employeeStatusSchema = z.strictObject({ status: z.enum(employmentStatuses), version: employeeVersion });
export const directReportsQuery = catalogQuery.pick({ page: true, limit: true }).extend({
  status: z.enum([...employmentStatuses, "HISTORICAL", "ALL"]).default("ACTIVE"),
});
