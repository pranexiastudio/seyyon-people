import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { employeeCreateSchema, employeeUpdateSchema } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { ApiError } from "@/lib/auth-api";
import { Feedback, Loading, PageHeading, panel } from "../administration/layout";
import { assignments, CatalogPicker, DirectoryLink, employeeApi, employeeHome, EmployeeStatus,
  useEmployee, useEmployeeAccess, type Employee } from "./shared";

const basicFields = [
  { name: "employeeNumber", label: "Employee number", type: "text", max: 40, required: true },
  { name: "firstName", label: "First name", type: "text", max: 100, required: true },
  { name: "lastName", label: "Last name", type: "text", max: 100, required: true },
  { name: "workEmail", label: "Work email", type: "email", max: 320 },
  { name: "joinedOn", label: "Joining date", type: "date" },
  { name: "personalEmail", label: "Personal email", type: "email", max: 320, private: true },
  { name: "personalPhone", label: "Personal phone", type: "tel", max: 40, private: true },
] as const;

export function EmployeeEditor({ editing = false }: { editing?: boolean }) {
  const { id = "" } = useParams();
  const access = useEmployeeAccess();
  const record = useEmployee(editing && access.manage ? id : "");
  if (!access.manage) return <><DirectoryLink /><Feedback error="Employee management permission required." /></>;
  if (editing && record.isLoading) return <Loading />;
  if (editing && (record.isError || !record.data)) return <><DirectoryLink /><Feedback error={record.error?.message ?? "Employee not found."} /></>;
  return <EmployeeForm key={editing ? id : "new"} employee={editing ? record.data : undefined} />;
}

function EmployeeForm({ employee }: { employee?: Employee }) {
  const access = useEmployeeAccess();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [version] = useState(employee?.version);
  const [initial] = useState(() => Object.fromEntries(
    [...basicFields.map(({ name }) => name), ...assignments.map(({ field }) => field)].map((key) => [key, employee?.[key] ?? ""]),
  ));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const profilePath = employee ? employeeHome + "/" + employee.id : employeeHome;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFailure("");
    const payload: Record<string, unknown> = {};
    for (const field of basicFields) {
      if ("private" in field && !access.privateWrite) continue;
      const value = values[field.name]?.trim() ?? "";
      if (employee && value === initial[field.name]) continue;
      if (value || "required" in field || employee) payload[field.name] = "required" in field ? value : value || null;
    }
    if (access.catalogs) for (const { field } of assignments) {
      if (values[field] !== initial[field]) payload[field] = values[field] || null;
    }
    if (employee && !Object.keys(payload).length) {
      setFailure("Change at least one field before saving.");
      return;
    }
    const first = String(payload.firstName ?? initial.firstName ?? "");
    const last = String(payload.lastName ?? initial.lastName ?? "");
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      if (!first || !last) {
        setErrors({ ...(!first ? { firstName: "Enter a first name." } : {}), ...(!last ? { lastName: "Enter a last name." } : {}) });
        return;
      }
      if ([...first, " ", ...last].length > 200) {
        setErrors({ lastName: "First and last names must fit within 200 characters including the space." });
        return;
      }
    }
    const result = employee
      ? employeeUpdateSchema.safeParse({ ...payload, version })
      : employeeCreateSchema.safeParse(payload);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map(({ path, message }) => [String(path[0]), message])));
      return;
    }
    setBusy(true);
    try {
      const stored = await access.request<Employee>(employeeApi + (employee ? "/" + employee.id : ""), {
        method: employee ? "PATCH" : "POST", body: JSON.stringify(result.data),
      });
      await cache.invalidateQueries({ queryKey: access.key });
      navigate(employeeHome + "/" + stored.id, { replace: true, state: { success: employee ? "Employee updated." : "Draft employee created." } });
    } catch (error) {
      if (error instanceof ApiError && error.code === "DUPLICATE_EMPLOYEE_NUMBER") setErrors({ employeeNumber: error.message });
      else if (error instanceof ApiError && error.code === "EMPLOYEE_VERSION_CONFLICT") {
        setConflict(true);
        setFailure("This employee changed elsewhere. Reload the latest record before saving again.");
      } else setFailure(error instanceof Error ? error.message : "Unable to save employee.");
    } finally { setBusy(false); }
  }
  return <>
    <PageHeading title={employee ? "Edit Employee" : "Add Employee"} actions={<DirectoryLink />} />
    <form aria-label={employee ? "Edit employee" : "Add employee"} className="space-y-5" noValidate onSubmit={(event) => void save(event)}>
      <Feedback error={failure} />
      {conflict && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload latest record</Button>}
      <fieldset disabled={busy} className={panel}>
        <h2 className="mb-4 text-lg font-semibold">Basic details</h2>
        <div className="mb-4"><EmployeeStatus status={employee?.employmentStatus ?? "DRAFT"} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {basicFields.filter((field) => !("private" in field) || access.privateRead).map((field) => {
            const error = errors[field.name];
            return <div key={field.name} className="min-w-0">
              <label className="block text-sm font-medium">{field.label}
                <input className={inputClass + " mt-1"} type={field.type} maxLength={"max" in field ? field.max : undefined}
                  required={"required" in field && (!employee || !!initial[field.name])}
                  aria-invalid={!!error} aria-describedby={error ? "error-" + field.name : undefined}
                  value={values[field.name] ?? ""} readOnly={"private" in field && !access.privateWrite}
                  onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} />
              </label>
              {error && <p role="alert" id={"error-" + field.name} className="mt-1 text-sm text-destructive">{error}</p>}
            </div>;
          })}
        </div>
      </fieldset>
      <fieldset disabled={busy} className={panel}>
        <h2 className="mb-4 text-lg font-semibold">Organization details</h2>
        {!access.catalogs && <p className="mb-4 text-sm text-muted-foreground">Organization catalog access is required to change assignments.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {assignments.map((definition) => <CatalogPicker key={definition.field} definition={definition} activeOnly
            value={values[definition.field] ?? ""} selected={employee?.[definition.relation]}
            department={definition.field === "designationId" ? values.departmentId ?? "" : undefined}
            onChange={(value) => setValues({ ...values, [definition.field]: value,
              ...(definition.field === "departmentId" && value !== values.departmentId ? { designationId: "" } : {}) })} />)}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || conflict}>{busy ? "Saving…" : employee ? "Save changes" : "Save draft"}</Button>
        <Button asChild variant="outline"><Link to={profilePath}>Cancel</Link></Button>
      </div>
    </form>
  </>;
}
