import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";
import { employeePermissions, organizationPermissions, type employmentStatuses } from "@seyyon/shared";
import { useAuth } from "@/auth/auth-provider";
import { apiRequest } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { AdministrationLayout, Feedback, Status } from "../administration/layout";

export const employeeHome = "/app/employees";
export const employeeApi = "/workspace/employees";
export type EmploymentStatus = typeof employmentStatuses[number];
export const statusLabels: Record<EmploymentStatus, string> = {
  DRAFT: "Draft", ACTIVE: "Active", INACTIVE: "Inactive", RESIGNED: "Resigned", TERMINATED: "Terminated",
};
export const assignments = [
  { field: "branchId", relation: "branch", label: "Branch", catalog: "branches" },
  { field: "departmentId", relation: "department", label: "Department", catalog: "departments" },
  { field: "designationId", relation: "designation", label: "Designation", catalog: "designations" },
  { field: "jobGradeId", relation: "jobGrade", label: "Job Grade", catalog: "job-grades" },
  { field: "employmentTypeId", relation: "employmentType", label: "Employment Type", catalog: "employment-types" },
  { field: "workLocationId", relation: "workLocation", label: "Work Location", catalog: "work-locations" },
] as const;
type Catalog = typeof assignments[number];
type Reference = { id: string; name: string; code: string };
export type Employee = {
  id: string; employeeNumber: string; displayName: string; firstName: string | null; lastName: string | null;
  workEmail: string | null; personalEmail?: string | null; personalPhone?: string | null; joinedOn: string | null;
  employmentStatus: EmploymentStatus; version: number; managerId: string | null;
  manager: { id: string; displayName: string; employeeNumber: string } | null;
} & Record<Catalog["field"], string | null> & Record<Catalog["relation"], Reference | null>;
export type Page<T> = { items: T[]; total: number; page: number; limit: number };

export function useEmployeeAccess() {
  const { profile } = useAuth();
  const membership = profile?.contexts.find((entry) => entry.tenantId === profile.tenantId)?.id;
  const permissions = profile?.permissions ?? [];
  return {
    membership,
    manage: permissions.includes(employeePermissions.manage),
    reporting: permissions.includes(employeePermissions.manageReporting),
    privateRead: permissions.includes(employeePermissions.readPrivate),
    privateWrite: permissions.includes(employeePermissions.readPrivate) && permissions.includes(employeePermissions.managePrivate),
    catalogs: permissions.includes(organizationPermissions.read),
    key: ["employees", membership] as const,
    request: <T,>(path: string, options?: RequestInit) => apiRequest<T>(path, {
      ...options,
      headers: { "X-Expected-Membership": membership ?? "" },
    }),
  };
}

export function EmployeeWorkspace() {
  const { membership } = useEmployeeAccess();
  return <AdministrationLayout key={membership} platform={false} employees />;
}

export function useEmployee(id: string) {
  const access = useEmployeeAccess();
  return useQuery({
    queryKey: [...access.key, "profile", id, access.privateRead],
    queryFn: () => access.request<Employee>(employeeApi + "/" + id),
    enabled: !!id && !!access.membership,
    retry: false,
  });
}

export function EmployeeStatus({ status }: { status: EmploymentStatus }) {
  return <Status active={status === "ACTIVE"} label={statusLabels[status]} />;
}

export function DirectoryLink() {
  return <Button variant="outline" asChild><Link to={employeeHome}>Employee directory</Link></Button>;
}

export function Pagination({ page, limit, total, change }: {
  page: number; limit: number; total: number; change: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / limit));
  if (last === 1 && page === 1) return null;
  return <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => change(page - 1)}>Previous</Button>
    <span className="text-sm text-muted-foreground">Page {page} of {last}</span>
    <Button variant="outline" size="sm" disabled={page >= last} onClick={() => change(page + 1)}>Next</Button>
  </nav>;
}

export function CatalogPicker({ definition, value, onChange, selected, department, activeOnly, disabled }: {
  definition: Catalog; value: string; onChange: (value: string) => void; selected?: Reference | null;
  department?: string; activeOnly?: boolean; disabled?: boolean;
}) {
  const access = useEmployeeAccess();
  const [search, setSearch] = useState("");
  const path = "/workspace/organization/" + definition.catalog;
  const available = !!access.membership && access.catalogs && department !== "";
  const params = new URLSearchParams({ search, limit: "20" });
  if (activeOnly && definition.catalog !== "employment-types") params.set("status", "active");
  if (definition.catalog === "designations" && department) params.set("departmentId", department);
  const options = useQuery({
    queryKey: [...access.key, "catalog", path, params.toString()],
    queryFn: () => access.request<Page<Reference>>(path + "?" + params),
    enabled: available,
    retry: false,
  });
  const items = options.data?.items ?? [];
  const retained = selected?.id === value ? selected : undefined;
  const missing = !!value && !retained && !!options.data && !items.some((item) => item.id === value);
  const selectedQuery = useQuery({
    queryKey: [...access.key, "catalog-reference", path, value],
    queryFn: () => access.request<Reference>(path + "/" + value),
    enabled: available && missing,
    retry: false,
  });
  const current = retained ?? selectedQuery.data;
  return <div className="min-w-0 space-y-1">
    <label className="block text-sm font-medium">{definition.label}
      <select className={inputClass + " mt-1"} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || !available}>
        <option value="">{department === "" ? "Choose a department first" : activeOnly ? "None" : "All"}</option>
        {value && !items.some((item) => item.id === value) && <option value={value}>{current ? current.name + " (" + current.code + ")" : "Selected " + definition.label.toLowerCase()}</option>}
        {items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
      </select>
    </label>
    {available && <input type="search" aria-label={"Find " + definition.label.toLowerCase()} value={search}
      placeholder={"Find " + definition.label.toLowerCase()} maxLength={200} disabled={disabled}
      onChange={(event) => setSearch(event.target.value)} className={inputClass} />}
    {options.isFetching && <p className="text-xs text-muted-foreground" role="status">Loading options…</p>}
    <Feedback error={options.error?.message} />
  </div>;
}
