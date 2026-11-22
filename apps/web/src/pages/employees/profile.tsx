import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router";
import { employmentStatuses } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { ApiError } from "@/lib/auth-api";
import { Feedback, Loading, PageHeading, panel } from "../administration/layout";
import { assignments, DirectoryLink, employeeApi, employeeHome, EmployeeStatus, Pagination, statusLabels,
  useEmployee, useEmployeeAccess, type Employee, type EmploymentStatus, type Page } from "./shared";

const actions: Record<EmploymentStatus, EmploymentStatus[]> = {
  DRAFT: ["ACTIVE"], ACTIVE: ["INACTIVE", "RESIGNED", "TERMINATED"],
  INACTIVE: ["ACTIVE", "RESIGNED", "TERMINATED"], RESIGNED: [], TERMINATED: [],
};
const actionLabels: Partial<Record<EmploymentStatus, string>> = {
  ACTIVE: "Activate", INACTIVE: "Deactivate", RESIGNED: "Mark resigned", TERMINATED: "Terminate",
};

export function EmployeeProfile() {
  const { id = "" } = useParams();
  const record = useEmployee(id);
  const location = useLocation();
  if (record.isLoading) return <Loading />;
  if (record.isError || !record.data) return <><DirectoryLink /><Feedback error={record.error?.message ?? "Employee not found."} /></>;
  return <Profile key={id} employee={record.data} initialSuccess={location.state?.success} />;
}

function Profile({ employee, initialSuccess }: { employee: Employee; initialSuccess?: string }) {
  const access = useEmployeeAccess();
  const cache = useQueryClient();
  const [operation, setOperation] = useState<"manager" | "status" | null>(null);
  const [failure, setFailure] = useState("");
  const [success, setSuccess] = useState(initialSuccess ?? "");
  const initials = employee.displayName.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
  async function change(kind: "manager" | "status", value: { managerId: string | null } | { status: EmploymentStatus }) {
    setOperation(kind);
    setFailure("");
    setSuccess("");
    try {
      await access.request(employeeApi + "/" + employee.id + "/" + kind, {
        method: kind === "manager" ? "PUT" : "PATCH",
        body: JSON.stringify({ ...value, version: employee.version }),
      });
      await cache.invalidateQueries({ queryKey: access.key });
      setSuccess(kind === "manager" ? ("managerId" in value && value.managerId === null ? "Manager cleared." : "Manager updated.") : "Employment status updated.");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMPLOYEE_VERSION_CONFLICT") {
        await cache.invalidateQueries({ queryKey: [...access.key, "profile", employee.id] });
        setFailure("This employee changed elsewhere. Review the current profile before retrying.");
      } else setFailure(error instanceof Error ? error.message : "Unable to update employee.");
      return false;
    } finally {
      setOperation(null);
    }
  }
  return <>
    <PageHeading title={employee.displayName} actions={<div className="flex flex-wrap gap-2">
      <DirectoryLink />
      {access.manage && <Button asChild><Link to={employeeHome + "/" + employee.id + "/edit"}>Edit Employee</Link></Button>}
    </div>} />
    <Feedback error={failure} success={success} />
    <section className={panel} aria-label="Employee details">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{initials || "?"}</span>
        <div><p className="font-medium">{employee.employeeNumber}</p><EmployeeStatus status={employee.employmentStatus} /></div>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Work email" value={employee.workEmail} />
        {access.privateRead && <>
          <Detail label="Personal email" value={employee.personalEmail} />
          <Detail label="Personal phone" value={employee.personalPhone} />
        </>}
        <Detail label="Joining date" value={employee.joinedOn} />
        {assignments.map(({ field, label, relation }) => <Detail key={field} label={label} value={employee[relation]?.name} />)}
      </dl>
      {access.manage && <Lifecycle employee={employee} busy={operation !== null} apply={(status) => change("status", { status })} />}
    </section>
    <section className={panel} aria-labelledby="manager-heading">
      <h2 id="manager-heading" className="text-lg font-semibold">Reporting manager</h2>
      <p className="mt-2 break-words">{employee.manager
        ? <Link className="text-primary underline" to={employeeHome + "/" + employee.manager.id}>{employee.manager.displayName}</Link>
        : "No manager assigned."}</p>
      {access.reporting && <ManagerPicker key={employee.managerId ?? "none"} employee={employee}
        busy={operation !== null} apply={(managerId) => change("manager", { managerId })} />}
    </section>
    <DirectReports id={employee.id} />
  </>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value ?? "—"}</dd></div>;
}

function Lifecycle({ employee, busy, apply }: {
  employee: Employee; busy: boolean; apply: (status: EmploymentStatus) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<EmploymentStatus>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
  }, [pending]);
  function close() {
    dialog.current?.close();
    setPending(undefined);
  }
  if (!actions[employee.employmentStatus].length && !pending) return null;
  return <div className="mt-5 flex flex-wrap gap-2">
    {actions[employee.employmentStatus].map((status) => <Button key={status} variant={status === "ACTIVE" ? "default" : "outline"}
      disabled={busy} onClick={() => status === "ACTIVE" ? void apply(status) : setPending(status)}>
      {status === "ACTIVE" && employee.employmentStatus === "INACTIVE" ? "Reactivate" : actionLabels[status]}
    </Button>)}
    <dialog ref={dialog} aria-labelledby="lifecycle-title" className={panel + " m-auto w-[calc(100%-2rem)] max-w-md text-foreground backdrop:bg-black/40"}
      onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
      <h2 id="lifecycle-title" className="text-lg font-semibold">{pending ? actionLabels[pending] : ""} employee</h2>
      <p className="mt-2 text-sm text-muted-foreground">Change the employment status for {employee.displayName}?</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button autoFocus variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button disabled={busy} onClick={async () => { if (pending) await apply(pending); close(); }}>Confirm status change</Button>
      </div>
    </dialog>
  </div>;
}

function ManagerPicker({ employee, busy, apply }: {
  employee: Employee; busy: boolean; apply: (id: string | null) => Promise<boolean>;
}) {
  const access = useEmployeeAccess();
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams({ status: "ACTIVE", search, limit: "20" });
  const options = useQuery({
    queryKey: [...access.key, "manager-options", params.toString()],
    queryFn: () => access.request<Page<Employee>>(employeeApi + "?" + params),
    enabled: open && !!access.membership,
    retry: false,
  });
  const candidates = (options.data?.items ?? []).filter(({ id }) => id !== employee.id && id !== employee.managerId);
  const selectable = candidates.some(({ id }) => id === choice);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectable && await apply(choice)) setOpen(false);
  }
  return <div className="mt-4 space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>{employee.manager ? "Change manager" : "Assign manager"}</Button>
      {employee.manager && <Button variant="outline" disabled={busy} onClick={() => void apply(null)}>Clear manager</Button>}
    </div>
    {open && <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <label className="block text-sm font-medium">Find manager
        <input type="search" className={inputClass + " mt-1"} value={search} maxLength={200}
          onChange={(event) => { setSearch(event.target.value); setChoice(""); }} disabled={busy} />
      </label>
      <label className="block text-sm font-medium">New manager
        <select className={inputClass + " mt-1"} value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Choose an active employee</option>
          {candidates.map(({ id, displayName, employeeNumber }) => <option key={id} value={id}>{displayName} ({employeeNumber})</option>)}
        </select>
      </label>
      {options.isLoading && <Loading />}
      {options.data && !candidates.length && <p className="text-sm text-muted-foreground">No matching active employees.</p>}
      <Feedback error={options.error?.message} />
      <Button type="submit" disabled={!selectable || busy}>Save manager</Button>
    </form>}
  </div>;
}

function DirectReports({ id }: { id: string }) {
  const access = useEmployeeAccess();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ACTIVE");
  const params = new URLSearchParams({ page: String(page), status });
  const reports = useQuery({
    queryKey: [...access.key, "direct-reports", id, page, status],
    queryFn: () => access.request<Page<Employee>>(employeeApi + "/" + id + "/direct-reports?" + params),
    enabled: !!access.membership,
    retry: false,
  });
  return <section className={panel} aria-labelledby="reports-heading">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 id="reports-heading" className="text-lg font-semibold">Direct reports</h2>
      <label className="text-sm font-medium">Report status
        <select className={inputClass + " mt-1"} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          {employmentStatuses.map((entry) => <option key={entry} value={entry}>{statusLabels[entry]}</option>)}
          <option value="HISTORICAL">Inactive, resigned or terminated reports</option><option value="ALL">All statuses</option>
        </select>
      </label>
    </div>
    {reports.isLoading && <Loading />}
    <Feedback error={reports.error?.message} />
    {reports.data && <>
      {reports.data.items.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No direct reports match this status.</p>}
      <ul className="mt-3 divide-y divide-border">{reports.data.items.map((report) => <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <Link className="break-words text-primary underline" to={employeeHome + "/" + report.id}>{report.displayName} ({report.employeeNumber})</Link>
        <EmployeeStatus status={report.employmentStatus} />
      </li>)}</ul>
      <Pagination {...reports.data} change={setPage} />
    </>}
  </section>;
}
