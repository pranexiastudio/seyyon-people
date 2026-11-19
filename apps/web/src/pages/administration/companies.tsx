import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, Plus, Search, Upload } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { companySchema, companySizes, tenantStatuses, type Company, type CompanySummary } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { useAuth } from "@/auth/auth-provider";
import { apiRequest } from "@/lib/auth-api";
import { actionLabel, dateLabel, Feedback, Loading, PageHeading, panel, Status, useOperation } from "./layout";

export function useCompanyPath(workspace = false) {
  const { companyId } = useParams();
  const { profile } = useAuth();
  const membershipId = workspace ? profile?.contexts.find((entry) => entry.tenantId === profile.tenantId)?.id : undefined;
  const href = workspace ? "/app/company" : "/platform/companies/" + companyId;
  const path = workspace ? "/workspace/company" : href;
  const key = membershipId ? ["company", path, membershipId] : ["company", path];
  function companyRequest<T>(suffix = "", options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    if (membershipId) headers.set("X-Expected-Membership", membershipId);
    return apiRequest<T>(path + suffix, { ...options, headers });
  }
  return { path, href, key, companyRequest };
}

export function CompanyListPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const rawStatus = params.get("status");
  const status = tenantStatuses.find((value) => value === rawStatus) || "";
  const rawPage = Number(params.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;
  const query = new URLSearchParams({ page: String(page), search });
  if (status) query.set("status", status);
  const companies = useQuery({
    queryKey: ["platform", "companies", query.toString()],
    queryFn: () => apiRequest<{ items: CompanySummary[]; total: number; limit: number }>("/platform/companies?" + query),
  });
  function navigate(nextPage: number, searchValue = search, statusValue = status) {
    const next = new URLSearchParams();
    if (searchValue) next.set("search", searchValue);
    if (statusValue) next.set("status", statusValue);
    if (nextPage > 1) next.set("page", String(nextPage));
    setParams(next);
  }
  const data = companies.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 15)));
  return <>
    <PageHeading title="Companies" subtitle="Find and manage companies registered on Seyyon People."
      actions={<Button asChild><Link to="/platform/companies/new"><Plus size={17} />Add company</Link></Button>} />
    <section className={panel}>
      <form key={search + "|" + status} className="mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        navigate(1, String(form.get("search")).trim(), String(form.get("status")));
      }}>
        <label className="min-w-44 flex-1 text-sm font-medium">Search companies
          <input type="search" name="search" maxLength={200} defaultValue={search} placeholder="Company name or email" className={inputClass + " mt-1"} /></label>
        <div><label htmlFor="company-status-filter" className="block text-sm font-medium">Status</label>
          <select id="company-status-filter" name="status" defaultValue={status} className={inputClass + " mt-1"}>
            <option value="">All statuses</option>{tenantStatuses.map((value) => <option key={value} value={value}>{actionLabel(value)}</option>)}
          </select></div>
        <Button type="submit" variant="outline"><Search size={16} />Apply filters</Button>
        {(search || status) && <Button type="button" variant="outline" onClick={() => navigate(1, "", "")}>Clear</Button>}
      </form>
      {companies.isPending && <Loading />}
      <Feedback error={companies.error?.message} />
      {data && <>
        {!data.items.length ? <p className="py-6 text-sm text-muted-foreground">No companies match these filters.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-135 text-left text-sm">
            <thead className="border-y border-border bg-muted text-muted-foreground"><tr>{["Company", "Status", "Members", "Registered"].map((label) =>
              <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{data.items.map((company) => <tr key={company.id}>
              <td className="px-3 py-4"><Link className="font-semibold text-primary hover:underline" to={"/platform/companies/" + company.id}>{company.name}</Link>
                {company.companyEmail && <p className="mt-1 break-all text-xs text-muted-foreground">{company.companyEmail}</p>}</td>
              <td className="px-3 py-4"><Status active={company.status === "ACTIVE"} label={actionLabel(company.status)} /></td>
              <td className="px-3 py-4 tabular-nums">{company.memberCount}</td><td className="px-3 py-4">{dateLabel(company.createdAt)}</td>
            </tr>)}</tbody>
          </table></div>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>{data.total.toLocaleString()} {data.total === 1 ? "company" : "companies"} · Page {page} of {pageCount}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate(Math.min(page - 1, pageCount))}><ChevronLeft size={15} />Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => navigate(page + 1)}>Next<ChevronRight size={15} /></Button>
          </div>
        </div>
      </>}
    </section>
  </>;
}

const fields = [
  { name: "name", label: "Company name", max: 200, required: true },
  { name: "legalName", label: "Legal name", max: 200 },
  { name: "companyEmail", label: "Company email", max: 320, type: "email", required: true },
  { name: "contactNumber", label: "Contact number", max: 40, type: "tel" },
  { name: "industry", label: "Industry", max: 120 },
  { name: "companySize", label: "Company size" },
  { name: "website", label: "Website", max: 2048, type: "url" },
  { name: "address", label: "Address", max: 500 },
  { name: "country", label: "Country", max: 120 },
  { name: "state", label: "State", max: 120 },
  { name: "city", label: "City", max: 120 },
  { name: "postalCode", label: "Postal code", max: 24 },
] as const;

export function CompanyEditor({ workspace = false, create = false }: { workspace?: boolean; create?: boolean }) {
  const { href, key, companyRequest } = useCompanyPath(workspace);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const operation = useOperation();
  const detail = useQuery({ queryKey: key, queryFn: () => companyRequest<Company>(), enabled: !create });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void operation.run(async () => {
      const raw = Object.fromEntries(fields.map(({ name }) => [name, String(form.get(name) || "").trim() || null]));
      const parsed = companySchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = fields.find(({ name }) => name === issue?.path[0]);
        throw new Error("Check " + (field?.label.toLowerCase() || "the company details") + " and try again.");
      }
      const body = JSON.stringify(parsed.data);
      if (create) {
        const company = await apiRequest<Pick<Company, "id">>("/platform/companies", { method: "POST", body });
        await cache.invalidateQueries({ queryKey: ["platform"] });
        navigate("/platform/companies/" + company.id, { replace: true });
        return;
      }
      await companyRequest("", { method: "PUT", body });
      await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ["platform"] })]);
      return "Company information saved.";
    });
  }
  const back = create ? "/platform/companies" : href;
  return <>
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" to={back}><ArrowLeft size={16} />{create ? "Companies" : "Company profile"}</Link>
    <PageHeading title={create ? "Add company" : "Edit company"} subtitle={create ? "Register a company and open its profile to add branding and administrators." : detail.data?.name} />
    {!create && detail.isPending && <Loading />}
    <Feedback error={detail.error?.message} />
    {(create || detail.data) && <form onSubmit={submit} className={panel} key={detail.data?.id || "new"}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map((field) => <label key={field.name} className="block text-sm font-medium">
        {field.label}{("required" in field && field.required) ? " *" : ""}
        {field.name === "companySize" ? <select name={field.name} className={inputClass + " mt-1"} defaultValue={detail.data?.companySize || ""}>
          <option value="">Select size</option>{companySizes.map((size) => <option value={size} key={size}>{size}</option>)}
        </select> : <input name={field.name} className={inputClass + " mt-1"} type={"type" in field ? field.type : "text"}
          required={"required" in field && field.required} maxLength={field.max} defaultValue={detail.data?.[field.name] || ""} />}
      </label>)}</div>
      <Feedback error={operation.error} success={operation.success} />
      <div className="mt-5 flex gap-2"><Button type="submit" disabled={operation.busy}>{create ? "Register company" : "Save changes"}</Button>
        <Button variant="outline" asChild><Link to={back}>Cancel</Link></Button></div>
    </form>}
  </>;
}

export function CompanyDetailsPage({ workspace = false }: { workspace?: boolean }) {
  const { href, key, companyRequest } = useCompanyPath(workspace);
  const cache = useQueryClient();
  const operation = useOperation();
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const detail = useQuery({ queryKey: key, queryFn: () => companyRequest<Company>() });
  const logo = useQuery({ queryKey: [...key, "logo"], queryFn: () => companyRequest<{ logo: string | null }>("/logo"), enabled: !!detail.data?.hasLogo });
  async function refresh() {
    await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ["platform"] })]);
  }
  const company = detail.data;
  const nextStatus = company?.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return <>
    {!workspace && <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" to="/platform/companies"><ArrowLeft size={16} />Companies</Link>}
    <PageHeading title={company?.name || "Company profile"} subtitle={company && "Registered " + dateLabel(company.createdAt)}
      actions={company && <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to={href + "/edit"}>Edit information</Link></Button>
        <Button asChild variant="outline"><Link to={href + "/configuration"}>Configuration</Link></Button>
        {!workspace && <Button asChild><Link to={href + "/admins"}>Manage admins</Link></Button>}
      </div>} />
    {detail.isPending && <Loading />}
    <Feedback error={detail.error?.message || operation.error} success={operation.success} />
    {company && <>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Company information</h2><Status active={company.status === "ACTIVE"} label={actionLabel(company.status)} /></div>
          <dl className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{fields.map(({ name, label }) =>
            <div key={name}><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 wrap-anywhere text-sm">{company[name] || "—"}</dd></div>)}</dl>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Company logo</h2>
          <div className="my-4 flex h-28 items-center justify-center rounded-xl border border-border bg-background">
            {company.hasLogo && logo.data?.logo ? <img className="max-h-full max-w-full object-contain p-2" src={logo.data.logo} alt={company.name + " logo"} />
              : <Building2 size={30} className="text-muted-foreground" aria-hidden="true" />}
          </div>
          <Feedback error={logo.error?.message} />
          <form onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            if (!selectedLogo) return;
            void operation.run(async () => {
              if (selectedLogo.size > 512 * 1024) throw new Error("Choose an image no larger than 512 KB.");
              await companyRequest("/logo", { method: "PUT", body: selectedLogo, headers: { "Content-Type": selectedLogo.type } });
              form.reset();
              setSelectedLogo(null);
              await refresh();
              return "Company logo updated.";
            });
          }}>
            <label className="text-sm font-medium">Logo file<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setSelectedLogo(event.target.files?.[0] || null)}
              className="mt-2 block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1" /></label>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPEG or WebP, up to 512 KB.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!selectedLogo || operation.busy}><Upload size={14} />Upload logo</Button>
              {company.hasLogo && <Button type="button" size="sm" variant="outline" disabled={operation.busy} onClick={() => void operation.run(async () => {
                await companyRequest("/logo", { method: "DELETE" }); await refresh(); return "Company logo removed.";
              })}>Remove logo</Button>}</div>
          </form>
        </section>
      </div>
      <section className={panel}><div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Tenant status history</h2>
          {!workspace && <p className="mt-1 text-sm text-muted-foreground">Suspension signs tenant users out and blocks their company access.</p>}</div>
        {!workspace && <Button variant="outline" disabled={operation.busy} onClick={() => void operation.run(async () => {
          await companyRequest("/status", { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
          await refresh();
          return nextStatus === "ACTIVE" ? "Company activated." : "Company suspended.";
        })}>{nextStatus === "ACTIVE" ? "Activate company" : "Suspend company"}</Button>}
      </div>
        {!company.history.length && <p className="mt-4 text-sm text-muted-foreground">No status changes recorded.</p>}
        <ul className="mt-2 divide-y divide-border">{company.history.map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
          <span>{actionLabel(item.action)}</span><time dateTime={item.createdAt} className="text-muted-foreground">{dateLabel(item.createdAt)}</time>
        </li>)}</ul>
      </section>
    </>}
  </>;
}

