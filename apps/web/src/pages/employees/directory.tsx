import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { employeeListQuery, employmentStatuses } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { Feedback, Loading, PageHeading, panel } from "../administration/layout";
import { assignments, CatalogPicker, employeeApi, employeeHome, EmployeeStatus, Pagination, statusLabels,
  useEmployeeAccess, type Employee, type Page } from "./shared";

const columns = [
  ["Employee number", (employee: Employee) => employee.employeeNumber],
  ["Name", (employee: Employee) => employee.displayName],
  ["Work email", (employee: Employee) => employee.workEmail],
  ["Department", (employee: Employee) => employee.department?.name],
  ["Designation", (employee: Employee) => employee.designation?.name],
  ["Branch", (employee: Employee) => employee.branch?.name],
  ["Reporting manager", (employee: Employee) => employee.manager?.displayName],
  ["Joining date", (employee: Employee) => employee.joinedOn],
] as const;

function EmployeeActions({ employee, manage }: { employee: Employee; manage: boolean }) {
  const path = employeeHome + "/" + employee.id;
  return <div className="flex flex-wrap gap-2">
    <Button asChild size="sm" variant="outline"><Link to={path}>View<span className="sr-only"> {employee.displayName}</span></Link></Button>
    {manage && <Button asChild size="sm" variant="outline"><Link to={path + "/edit"}>Edit<span className="sr-only"> {employee.displayName}</span></Link></Button>}
  </div>;
}

function Filters({ initial, apply }: { initial: URLSearchParams; apply: (params: URLSearchParams) => void }) {
  const access = useEmployeeAccess();
  const [values, setValues] = useState(() => Object.fromEntries(initial));
  const [showCatalogs, setShowCatalogs] = useState(() => assignments.some(({ field }) => initial.has(field)));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value.trim()) next.set(key, value.trim());
    apply(next);
  }
  return <form aria-label="Employee filters" className={panel + " space-y-4"} onSubmit={submit}>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-medium">Search employees
        <input type="search" placeholder="Name, number or work email" maxLength={200} className={inputClass + " mt-1"}
          value={values.search ?? ""} onChange={(event) => setValues({ ...values, search: event.target.value })} />
      </label>
      <label className="text-sm font-medium">Employment status
        <select className={inputClass + " mt-1"} value={values.status ?? "ACTIVE"} onChange={(event) => setValues({ ...values, status: event.target.value })}>
          <option value="ALL">All statuses</option>
          {employmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Sort by
        <select className={inputClass + " mt-1"} value={values.sort ?? "name"} onChange={(event) => setValues({ ...values, sort: event.target.value })}>
          <option value="name">Name</option><option value="employeeNumber">Employee number</option>
          <option value="joinedOn">Joining date</option><option value="createdAt">Date created</option><option value="status">Employment status</option>
        </select>
      </label>
      <label className="text-sm font-medium">Sort direction
        <select className={inputClass + " mt-1"} value={values.direction ?? "asc"} onChange={(event) => setValues({ ...values, direction: event.target.value })}>
          <option value="asc">Ascending</option><option value="desc">Descending</option>
        </select>
      </label>
    </div>
    {access.catalogs && <details open={showCatalogs} onToggle={(event) => setShowCatalogs(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-primary">Organization filters</summary>
      {showCatalogs && <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assignments.map((definition) => <CatalogPicker key={definition.field} definition={definition} value={values[definition.field] ?? ""}
          department={definition.field === "designationId" ? values.departmentId : undefined}
          onChange={(value) => setValues({ ...values, [definition.field]: value, ...(definition.field === "departmentId" ? { designationId: "" } : {}) })} />)}
      </div>}
    </details>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit">Apply filters</Button>
      <Button type="button" variant="outline" onClick={() => { setValues({}); apply(new URLSearchParams()); }}>Reset filters</Button>
    </div>
  </form>;
}

export function EmployeeDirectory() {
  const access = useEmployeeAccess();
  const [params, setParams] = useSearchParams();
  const filters = new URLSearchParams(params);
  filters.delete("page");
  const apiParams = Object.fromEntries(params);
  const status = params.get("status") ?? "ACTIVE";
  if (status === "ALL") delete apiParams.status;
  else apiParams.status = status;
  const parsed = employeeListQuery.safeParse(apiParams);
  const query = new URLSearchParams();
  if (parsed.success) {
    for (const [key, value] of Object.entries(parsed.data)) if (value !== undefined) query.set(key, String(value));
  }
  const result = useQuery({
    queryKey: [...access.key, "directory", query.toString()],
    queryFn: () => access.request<Page<Employee>>(employeeApi + "?" + query),
    enabled: !!access.membership && parsed.success,
    retry: false,
  });
  const employees = result.data?.items ?? [];
  return <>
    <PageHeading title="Employee Directory" actions={access.manage &&
      <Button asChild><Link to={employeeHome + "/new"}>Add Employee</Link></Button>} />
    {parsed.success ? <Filters key={filters.toString()} initial={filters} apply={setParams} /> :
      <div className={panel}><Feedback error="These directory filters are invalid." />
        <Button variant="outline" onClick={() => setParams({})}>Reset filters</Button></div>}
    {result.isLoading && <Loading />}
    <Feedback error={result.error?.message} />
    {result.data && <section aria-label="Employees" className={panel}>
      <p className="mb-3 text-sm text-muted-foreground">{result.data.total} {result.data.total === 1 ? "employee" : "employees"}</p>
      {!employees.length && <p>No employees match the current filters.</p>}
      {employees.length > 0 && <>
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground"><tr>
              {columns.map(([label]) => <th scope="col" key={label} className="px-2 py-3 font-medium">{label}</th>)}
              <th scope="col" className="px-2 py-3 font-medium">Status</th><th scope="col" className="px-2 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{employees.map((employee) => <tr key={employee.id}>
              {columns.map(([label, value]) => <td key={label} className="max-w-44 break-words px-2 py-3">{value(employee) ?? "—"}</td>)}
              <td className="px-2 py-3"><EmployeeStatus status={employee.employmentStatus} /></td>
              <td className="px-2 py-3"><EmployeeActions employee={employee} manage={access.manage} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="divide-y divide-border xl:hidden" aria-label="Employee cards">{employees.map((employee) => <li key={employee.id} className="space-y-3 py-4">
          <h2 className="break-words font-semibold">{employee.displayName}</h2>
          <EmployeeStatus status={employee.employmentStatus} />
          <dl className="grid grid-cols-2 gap-3 text-sm">{columns.filter(([label]) => label !== "Name").map(([label, value]) =>
            <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value(employee) ?? "—"}</dd></div>)}</dl>
          <EmployeeActions employee={employee} manage={access.manage} />
        </li>)}</ul>
      </>}
      <Pagination {...result.data} change={(page) => setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("page", String(page));
        return next;
      })} />
    </section>}
  </>;
}
