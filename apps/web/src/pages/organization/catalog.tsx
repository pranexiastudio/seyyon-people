import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Navigate, useParams, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { z } from "zod";
import {
  branchSchema, departmentSchema, designationSchema, jobGradeSchema, organizationPermissions,
  workLocationKinds, workLocationSchema, type CatalogPage, type CatalogRow, type DepartmentHead,
} from "@seyyon/shared";
import { useAuth } from "@/auth/auth-provider";
import { apiRequest } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { Feedback, Loading, PageHeading, panel, Status, useOperation } from "../administration/layout";

const kinds = { OFFICE: "Office", REMOTE: "Remote", HYBRID: "Hybrid", CUSTOM: "Custom" };
const root = "/app/organization";
const apiRoot = "/workspace/organization";
type Field = {
  key: keyof CatalogRow;
  label: string;
  kind?: "textarea" | "email" | "tel" | "number" | "checkbox" | "kind" | "department" | "branch";
  max?: number;
  required?: boolean;
};
type Definition = {
  title: string;
  singular: string;
  schema?: z.ZodType;
  fields: Field[];
};
const common: Field[] = [
  { key: "name", label: "Name", required: true, max: 200 },
  { key: "code", label: "Code", required: true, max: 40 },
];
const description: Field = { key: "description", label: "Description", kind: "textarea", max: 1000 };
const address: Field = { key: "address", label: "Address", kind: "textarea", max: 500 };
const definitions = {
  branches: { title: "Branches", singular: "branch", schema: branchSchema, fields: [
    ...common, { ...address, required: true }, { key: "contactEmail", label: "Contact email", kind: "email", max: 320 },
    { key: "contactPhone", label: "Contact phone", kind: "tel", max: 40 },
    { key: "isPrimary", label: "Primary branch", kind: "checkbox" },
  ] },
  departments: { title: "Departments", singular: "department", schema: departmentSchema, fields: [...common, description] },
  designations: { title: "Designations", singular: "designation", schema: designationSchema, fields: [
    ...common, { key: "departmentId", label: "Department", kind: "department", required: true },
    { key: "jobLevel", label: "Job level", kind: "number", required: true },
  ] },
  "job-grades": { title: "Job grades", singular: "job grade", schema: jobGradeSchema, fields: [
    ...common, { key: "rank", label: "Grade rank", kind: "number", required: true }, description,
  ] },
  "employment-types": { title: "Employment types", singular: "employment type", fields: common },
  "work-locations": { title: "Work locations", singular: "work location", schema: workLocationSchema, fields: [
    ...common, { key: "kind", label: "Location type", kind: "kind", required: true },
    { key: "branchId", label: "Branch", kind: "branch" }, address,
  ] },
} satisfies Record<string, Definition>;
type Catalog = keyof typeof definitions;
type RequestCatalog = <T>(suffix: string, options?: RequestInit) => Promise<T>;

export function OrganizationPage() {
  const { profile } = useAuth();
  const { catalog } = useParams();
  const membershipId = profile?.contexts.find((context) => context.tenantId === profile.tenantId)?.id;
  if (!catalog) return <Navigate to={root + "/branches"} replace />;
  if (!Object.hasOwn(definitions, catalog)) return <Feedback error="Organization catalog not found." />;
  if (!membershipId || !profile?.permissions.includes(organizationPermissions.read)) {
    return <Feedback error="Organization access requires a workspace permission." />;
  }
  return <CatalogScreen key={membershipId + "/" + catalog} catalog={catalog as Catalog} membershipId={membershipId}
    canManage={profile.permissions.includes(organizationPermissions.manage)}
    canManageHeads={profile.permissions.includes(organizationPermissions.manageReporting)} />;
}

function CatalogScreen({ catalog, membershipId, canManage, canManageHeads }: {
  catalog: Catalog; membershipId: string; canManage: boolean; canManageHeads: boolean;
}) {
  const definition: Definition = definitions[catalog];
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState<{ mode: "create" } | { mode: "view" | "edit"; id: string }>();
  const [confirmation, setConfirmation] = useState<CatalogRow>();
  const operation = useOperation();
  const baseKey = ["organization", membershipId];
  const readOnly = !definition.schema || !canManage;
  const search = (params.get("search") ?? "").slice(0, 200);
  const status = ["active", "inactive"].includes(params.get("status") ?? "") ? params.get("status")! : "";
  const kind = workLocationKinds.find((value) => value === params.get("kind")) ?? "";
  const departmentId = z.uuid().safeParse(params.get("departmentId")).data ?? "";
  const pageParam = Number(params.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 && pageParam <= 1_000_000 ? pageParam : 1;
  const listQuery = new URLSearchParams({ page: String(page), search });
  if (definition.schema && status) listQuery.set("status", status);
  if (catalog === "work-locations" && kind) listQuery.set("kind", kind);
  if (catalog === "designations" && departmentId) listQuery.set("departmentId", departmentId);
  const read: RequestCatalog = (suffix, options) => apiRequest(apiRoot + suffix, {
    ...options, headers: { "X-Expected-Membership": membershipId },
  });
  const list = useQuery({
    queryKey: [...baseKey, catalog, listQuery.toString()],
    queryFn: () => read<CatalogPage>("/" + catalog + "?" + listQuery),
  });
  const selectedId = selection && "id" in selection ? selection.id : undefined;
  const detail = useQuery({
    queryKey: [...baseKey, catalog, "detail", selectedId],
    queryFn: () => read<CatalogRow>("/" + catalog + "/" + selectedId),
    enabled: !!selectedId,
  });
  const filteredDepartment = useQuery({
    queryKey: [...baseKey, "departments", "detail", departmentId],
    queryFn: () => read<CatalogRow>("/departments/" + departmentId),
    enabled: catalog === "designations" && !!departmentId,
  });
  const departmentDetail = catalog === "departments" ? detail.data : undefined;
  const lastPage = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.limit ?? 15)));
  const resetPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  };
  async function save(input: unknown) {
    const editing = selection?.mode === "edit";
    await operation.run(async () => {
      await read("/" + catalog + (editing ? "/" + selectedId : ""), {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(input),
      });
      setSelection(undefined);
      await queryClient.invalidateQueries({ queryKey: baseKey });
      return editing ? "Changes saved." : definition.singular[0]!.toUpperCase() + definition.singular.slice(1) + " created.";
    });
  }
  async function updateStatus(row: CatalogRow) {
    const active = !row.active;
    await operation.run(async () => {
      await read("/" + catalog + "/" + row.id, { method: "PATCH", body: JSON.stringify({ active }) });
      setConfirmation(undefined);
      await queryClient.invalidateQueries({ queryKey: baseKey });
      return active ? "Record reactivated." : "Record deactivated.";
    });
  }
  return <>
    <PageHeading title={definition.title} actions={!readOnly && <Button onClick={() => {
      setSelection({ mode: "create" }); setConfirmation(undefined);
    }}><Plus size={17} /> Add {definition.singular}</Button>} />
    <nav aria-label="Organization catalogs" className="flex flex-wrap gap-2">
      {Object.entries(definitions).map(([key, config]) => <NavLink key={key} to={root + "/" + key}
        className={({ isActive }) => "rounded-lg px-3 py-2 text-sm font-medium " +
          (isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent")}>
        {config.title}
      </NavLink>)}
    </nav>
    <Feedback error={operation.error} success={operation.success} />
    {selection && <section className={panel} aria-label="Organization record">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{selection.mode === "create" ? "Add " + definition.singular
          : selection.mode === "edit" ? "Edit " + definition.singular : detail.data?.name ?? "Record details"}</h2>
        <Button variant="outline" disabled={operation.busy} onClick={() => setSelection(undefined)}>Close</Button>
      </div>
      {selectedId && detail.isPending && <Loading />}
      <Feedback error={detail.error?.message} />
      {selection.mode === "view" && detail.data && <dl className="grid gap-4 sm:grid-cols-2">
        {definition.fields.map((field) => <div key={field.key} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{field.label}</dt>
          <dd className="break-words font-medium">{present(detail.data, field)}</dd>
        </div>)}
      </dl>}
      {!readOnly && (selection.mode === "create" || selection.mode === "edit" && detail.data) &&
        <Editor key={selectedId ?? "new"} definition={definition} row={selection.mode === "edit" ? detail.data : undefined}
          read={read} membershipId={membershipId} busy={operation.busy} onSave={save} />}
      {departmentDetail && selection.mode !== "create" &&
        <DepartmentHeadPanel key={departmentDetail.id + "/" + (departmentDetail.head?.id ?? "")} row={departmentDetail}
          canManage={canManageHeads} read={read} membershipId={membershipId} busy={operation.busy}
          onSave={(headId) => operation.run(async () => {
            const updated = await read<CatalogRow>("/departments/" + departmentDetail.id + "/head", {
              method: "PUT", body: JSON.stringify({ headId }),
            });
            queryClient.setQueryData([...baseKey, catalog, "detail", updated.id], updated);
            await queryClient.invalidateQueries({ queryKey: baseKey });
            return headId === null ? "Department head cleared." : "Department head saved.";
          })} />}
    </section>}
    {confirmation && <section className={panel} role="group" aria-label="Confirm status change">
      <p className="mb-3 break-words">{confirmation.active ? "Deactivate" : "Reactivate"} {confirmation.name}?</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={operation.busy} onClick={() => void updateStatus(confirmation)}>Confirm {confirmation.active ? "deactivation" : "reactivation"}</Button>
        <Button variant="outline" disabled={operation.busy} onClick={() => setConfirmation(undefined)}>Cancel</Button>
      </div>
    </section>}
    <section className={panel} aria-label={definition.title + " list"}>
      <form key={search + "|" + status + "|" + kind + "|" + departmentId} className="mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const key of ["search", "status", "kind", "departmentId"]) {
          const value = String(data.get(key) ?? "").trim();
          if (value) next.set(key, value);
        }
        setParams(next);
      }}>
        <label className="min-w-40 flex-1 text-sm font-medium">Search by name or code
          <input className={inputClass + " mt-1"} type="search" name="search" defaultValue={search} maxLength={200} />
        </label>
        {definition.schema && <label className="text-sm font-medium">Status
          <select className={inputClass + " mt-1"} name="status" defaultValue={status}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </label>}
        {catalog === "work-locations" && <label className="text-sm font-medium">Location type
          <select className={inputClass + " mt-1"} name="kind" defaultValue={kind}>
            <option value="">All types</option>{workLocationKinds.map((value) => <option key={value} value={value}>{kinds[value]}</option>)}
          </select>
        </label>}
        {catalog === "designations" && <ReferenceField label="Filter by department" name="departmentId" kind="department"
          read={read} membershipId={membershipId} includeInactive selected={filteredDepartment.data} initialId={departmentId} />}
        <Button type="submit" variant="outline">Apply filters</Button>
      </form>
      {list.isPending && <Loading />}
      <Feedback error={list.error?.message} />
      {list.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No {definition.title.toLowerCase()} found.</p>}
      <ul className="divide-y divide-border">
        {list.data?.items.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <p className="break-words font-semibold">{row.name}</p>
            <p className="break-words text-sm text-muted-foreground">
              {[row.code, row.isPrimary && "Primary branch", row.department?.name, row.rank && "Rank " + row.rank,
                row.kind && kinds[row.kind], row.branch?.name].filter(Boolean).join(" · ")}
            </p>
            {row.active !== undefined && <Status active={row.active} label={row.active ? "Active" : "Inactive"} />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={operation.busy} onClick={() => {
              setConfirmation(undefined); setSelection({ mode: "view", id: row.id });
            }}>View<span className="sr-only"> {row.name}</span></Button>
            {!readOnly && <>
              <Button size="sm" variant="outline" disabled={operation.busy} onClick={() => {
                setConfirmation(undefined); setSelection({ mode: "edit", id: row.id });
              }}>Edit<span className="sr-only"> {row.name}</span></Button>
              <Button size="sm" variant="outline" disabled={operation.busy} onClick={() => {
                setSelection(undefined); setConfirmation(row);
              }}>{row.active ? "Deactivate" : "Reactivate"}<span className="sr-only"> {row.name}</span></Button>
            </>}
          </div>
        </li>)}
      </ul>
      {list.data && (lastPage > 1 || page > 1) && <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => resetPage(page - 1)}><ChevronLeft size={16} />Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} of {lastPage}</span>
        <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => resetPage(page + 1)}>Next<ChevronRight size={16} /></Button>
      </div>}
    </section>
  </>;
}

function DepartmentHeadPanel({ row, canManage, read, membershipId, busy, onSave }: {
  row: CatalogRow; canManage: boolean; read: RequestCatalog; membershipId: string; busy: boolean;
  onSave: (headId: string | null) => Promise<void>;
}) {
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const path = "/departments/" + row.id + "/head-candidates";
  const options = useQuery({
    queryKey: ["organization", membershipId, "department-head-candidates", row.id, search],
    queryFn: () => read<{ items: DepartmentHead[] }>(path + "?" + new URLSearchParams({ search, limit: "20" })),
    enabled: canManage && !!row.active && choosing,
    retry: false,
  });
  const candidates = options.data?.items.filter(({ id }) => id !== row.head?.id) ?? [];
  return <section className="mt-5 space-y-3 border-t border-border pt-4" aria-label="Department head">
    <h3 className="font-semibold">Department head</h3>
    <p className="break-words">{row.head ? row.head.displayName + " (" + row.head.employeeNumber + ")" : "No department head assigned."}</p>
    {canManage && <div className="flex flex-wrap gap-2">
      {row.active && <Button type="button" variant="outline" disabled={busy} aria-expanded={choosing}
        onClick={() => setChoosing(!choosing)}>{choosing ? "Cancel selection" : row.head ? "Reassign department head" : "Assign department head"}</Button>}
      {row.head && <Button type="button" variant="outline" disabled={busy}
        onClick={() => void onSave(null)}>Clear department head</Button>}
    </div>}
    {choosing && canManage && row.active && <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (candidates.some(({ id }) => id === candidateId)) void onSave(candidateId);
    }}>
      <label className="block text-sm font-medium">Find eligible employee
        <input type="search" className={inputClass + " mt-1"} value={search} maxLength={200} disabled={busy}
          onChange={(event) => { setSearch(event.target.value); setCandidateId(""); }} />
      </label>
      <label className="block text-sm font-medium">New department head
        <select className={inputClass + " mt-1"} value={candidateId} disabled={busy} onChange={(event) => setCandidateId(event.target.value)}>
          <option value="">Choose an active employee</option>
          {candidates.map(({ id, displayName, employeeNumber }) => <option key={id} value={id}>{displayName} ({employeeNumber})</option>)}
        </select>
      </label>
      {options.isFetching && <Loading />}
      <Feedback error={options.error?.message} />
      {options.data && !candidates.length && <p className="text-sm text-muted-foreground">No eligible employees match this search.</p>}
      <Button type="submit" disabled={busy || !candidates.some(({ id }) => id === candidateId)}>Save department head</Button>
    </form>}
  </section>;
}

function present(row: CatalogRow | undefined, field: Field) {
  const value = row?.[field.key];
  if (field.kind === "checkbox") return value ? "Yes" : "No";
  if (field.kind === "branch") return row?.branch?.name ?? "—";
  if (field.kind === "department") return row?.department?.name ?? "—";
  if (field.kind === "kind") return row?.kind ? kinds[row.kind] : "—";
  return value == null || value === "" ? "—" : String(value);
}

function Editor({ definition, row, read, membershipId, busy, onSave }: {
  definition: Definition; row?: CatalogRow; read: RequestCatalog; membershipId: string; busy: boolean;
  onSave: (input: unknown) => Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const input = Object.fromEntries(definition.fields.map(({ key, kind, required }) => {
      const value = String(values.get(key) ?? "").trim();
      return [key, kind === "checkbox" ? values.has(key) : kind === "number" ? Number(value) : value || (required ? "" : null)];
    }));
    const result = definition.schema?.safeParse(input);
    if (!result?.success) {
      setErrors(Object.fromEntries(result?.error.issues.map((issue) => [String(issue.path[0]), issue.message]) ?? []));
      return;
    }
    setErrors({});
    void onSave(result.data);
  }
  return <form onSubmit={submit} aria-label="Catalog form">
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      {definition.fields.map(({ key, label, kind, required, max }) => {
        const value = row?.[key];
        const defaultValue = String(value ?? "");
        const className = inputClass + " mt-1";
        const commonProps = { name: key, required, maxLength: max, className, "aria-invalid": !!errors[key] };
        return <div key={key} className="min-w-0">
          {kind === "department" || kind === "branch" ? <ReferenceField label={label} name={key} kind={kind}
            required={required} read={read} membershipId={membershipId} selected={kind === "department" ? row?.department : row?.branch}
            initialId={defaultValue} /> : <label className="block text-sm font-medium">
              {kind === "checkbox" ? <><input type="checkbox" name={key} defaultChecked={!!value} className="mr-2" />{label}</>
                : <>{label}{kind === "textarea" ? <textarea {...commonProps} defaultValue={defaultValue} rows={3} />
                  : kind === "kind" ? <select {...commonProps} defaultValue={defaultValue || "OFFICE"}>
                    {workLocationKinds.map((option) => <option key={option} value={option}>{kinds[option]}</option>)}
                  </select> : <input {...commonProps} type={kind ?? "text"} defaultValue={defaultValue}
                    min={kind === "number" ? 1 : undefined} max={kind === "number" ? 2147483647 : undefined} />}</>}
            </label>}
          {errors[key] && <p role="alert" className="mt-1 text-sm text-destructive">{errors[key]}</p>}
        </div>;
      })}
    </fieldset>
    <Button type="submit" disabled={busy} className="mt-4">{busy ? "Saving…" : row ? "Save changes" : "Create " + definition.singular}</Button>
  </form>;
}

function ReferenceField({ label, name, kind, read, membershipId, selected, initialId, includeInactive, required }: {
  label: string; name: string; kind: "department" | "branch"; read: RequestCatalog; membershipId: string;
  selected?: Pick<CatalogRow, "id" | "name" | "code"> | null; initialId?: string; includeInactive?: boolean; required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState(initialId ?? "");
  const [chosen, setChosen] = useState(selected);
  const catalog = kind === "department" ? "departments" : "branches";
  const params = new URLSearchParams({ search, limit: "20" });
  if (!includeInactive) params.set("status", "active");
  const options = useQuery({
    queryKey: ["organization", membershipId, catalog, "options", search, !!includeInactive],
    queryFn: () => read<CatalogPage>("/" + catalog + "?" + params),
  });
  const items = options.data?.items ?? [];
  const retained = chosen?.id === choice ? chosen : selected?.id === choice ? selected : undefined;
  return <div className="space-y-1">
    <label className="block text-sm font-medium">Find {kind}
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200}
        className={inputClass + " mt-1"} placeholder="Search by name or code" />
    </label>
    <label className="block text-sm font-medium">{label}
      <select name={name} className={inputClass + " mt-1"} required={required} value={choice} onChange={(event) => {
        setChoice(event.target.value);
        setChosen(items.find((item) => item.id === event.target.value));
      }}>
        <option value="">{required ? "Select a " + kind : "None"}</option>
        {choice && !items.some((item) => item.id === choice) && <option value={choice}>{retained?.name ?? "Selected " + kind}</option>}
        {items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
      </select>
    </label>
    {options.isPending && <Loading />}
    <Feedback error={options.error?.message} />
    {options.data && !items.length && <p className="text-sm text-muted-foreground">No matching {catalog}.</p>}
    {(options.data?.total ?? 0) > items.length &&
      <p className="text-sm text-muted-foreground">Showing the first {items.length} matches. Search to narrow the list.</p>}
  </div>;
}
