import { z } from "zod";

export const tenantStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const companySizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"] as const;
export const companyAdminRole = "Company Admin";
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const site = z.url({ protocol: /^https?$/ }).max(2048);

export const companySchema = z.strictObject({
  name: z.string().trim().min(2).max(200),
  legalName: optionalText(200),
  companyEmail: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  contactNumber: z.string().trim().max(40).regex(/^\+?[0-9][0-9(). x-]{4,39}$/i).nullable().default(null),
  industry: optionalText(120),
  companySize: z.enum(companySizes).nullable().default(null),
  website: site.nullable().default(null),
  address: optionalText(500),
  country: optionalText(120),
  state: optionalText(120),
  city: optionalText(120),
  postalCode: optionalText(24),
});
export type CompanyInput = z.output<typeof companySchema>;
export type Company = Omit<CompanyInput, "companyEmail"> & {
  id: string; slug: string; companyEmail: string | null;
  status: typeof tenantStatuses[number]; createdAt: string; updatedAt: string;
  hasLogo: boolean; history: TenantActivity[];
};
export type TenantActivity = { id: string; action: string; createdAt: string; targetId?: string | null };
export type CompanySummary = Pick<Company, "id" | "name" | "slug" | "companyEmail" | "status" | "createdAt"> & { memberCount: number };
export type TenantAdmin = { id: string; email: string; status: "ACTIVE" | "DISABLED"; accountDisabled: boolean; invitationPending: boolean };
export type PlatformDashboard = {
  total: number; active: number; suspended: number; users: number; memberships: number;
  recent: CompanySummary[]; activity: TenantActivity[];
};

const timezone = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Enter a valid IANA timezone.");
const locale = z.string().max(40).refine((value) => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}, "Enter a valid locale.");
export const tenantConfigSchema = z.strictObject({
  branding: z.strictObject({ displayName: z.string().trim().max(200), primaryColor: z.string().regex(/^#[a-f\d]{6}$/i) }),
  regional: z.strictObject({ timezone, locale, firstDayOfWeek: z.enum(["MONDAY", "SUNDAY", "SATURDAY"]) }),
  modules: z.strictObject({ attendance: z.boolean(), leave: z.boolean(), payroll: z.boolean() }),
  attendance: z.strictObject({ workingMinutesPerDay: z.number().int().min(1).max(1440), graceMinutes: z.number().int().min(0).max(120) }),
  leave: z.strictObject({ yearStartMonth: z.number().int().min(1).max(12), carryForward: z.boolean() }),
  payroll: z.strictObject({ currency: z.string().regex(/^[A-Z]{3}$/).refine((value) => Intl.supportedValuesOf("currency").includes(value), "Enter a supported ISO currency code."),
    frequency: z.enum(["MONTHLY", "SEMIMONTHLY", "BIWEEKLY", "WEEKLY"]) }),
});
export type TenantConfig = z.output<typeof tenantConfigSchema>;
export const defaultTenantConfig: TenantConfig = {
  branding: { displayName: "", primaryColor: "#0d7469" },
  regional: { timezone: "Asia/Kolkata", locale: "en-IN", firstDayOfWeek: "MONDAY" },
  modules: { attendance: false, leave: false, payroll: false },
  attendance: { workingMinutesPerDay: 480, graceMinutes: 0 },
  leave: { yearStartMonth: 1, carryForward: false },
  payroll: { currency: "INR", frequency: "MONTHLY" },
};
export function readTenantConfig(input: unknown): TenantConfig {
  const saved = input as Partial<TenantConfig>;
  return tenantConfigSchema.parse({
    branding: { ...defaultTenantConfig.branding, ...saved.branding },
    regional: { ...defaultTenantConfig.regional, ...saved.regional },
    modules: { ...defaultTenantConfig.modules, ...saved.modules },
    attendance: { ...defaultTenantConfig.attendance, ...saved.attendance },
    leave: { ...defaultTenantConfig.leave, ...saved.leave },
    payroll: { ...defaultTenantConfig.payroll, ...saved.payroll },
  });
}
