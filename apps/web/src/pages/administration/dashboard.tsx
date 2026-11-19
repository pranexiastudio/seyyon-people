import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, CircleCheck, CirclePause, Plus, Users } from "lucide-react";
import { Link } from "react-router";
import type { PlatformDashboard } from "@seyyon/shared";
import { apiRequest } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { actionLabel, dateLabel, Feedback, Loading, PageHeading, panel, Status } from "./layout";

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["platform", "dashboard"], queryFn: () => apiRequest<PlatformDashboard>("/platform/dashboard") });
  const data = dashboard.data;
  const cards = data && [
    { label: "Total companies", value: data.total, icon: Building2 },
    { label: "Active companies", value: data.active, icon: CircleCheck },
    { label: "Suspended companies", value: data.suspended, icon: CirclePause },
    { label: "Registered users", value: data.users, icon: Users },
  ];
  const share = data?.total ? Math.round(data.active / data.total * 100) : 0;
  return <>
    <PageHeading title="Platform dashboard" subtitle="Monitor company registrations, tenant health and administrative activity."
      actions={<Button asChild><Link to="/platform/companies/new"><Plus size={17} />Add company</Link></Button>} />
    {dashboard.isPending && <Loading />}
    <Feedback error={dashboard.error?.message} />
    {data && cards && <>
      <section aria-label="Platform metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => <article key={label} className={panel}>
          <span className="mb-4 inline-flex rounded-lg bg-muted p-2 text-primary"><Icon size={18} aria-hidden="true" /></span>
          <p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        </article>)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Recent company registrations</h2>
            <Link className="text-sm font-medium text-primary hover:underline" to="/platform/companies">View companies</Link></div>
          {!data.recent.length && <p className="mt-5 text-sm text-muted-foreground">No companies registered yet.</p>}
          <ul className="mt-2 divide-y divide-border">{data.recent.map((company) => <li key={company.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><Link className="block truncate font-medium hover:underline" to={"/platform/companies/" + company.id}>{company.name}</Link>
              <p className="text-xs text-muted-foreground">{dateLabel(company.createdAt)} · {company.memberCount} {company.memberCount === 1 ? "member" : "members"}</p></div>
            <Status active={company.status === "ACTIVE"} label={actionLabel(company.status)} /></li>)}</ul>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Tenant statistics</h2>
          <div className="mt-5 flex justify-between gap-3 text-sm"><span>Active share</span><strong>{share}%</strong></div>
          <progress aria-label="Active share" className="mt-2 h-3 w-full accent-primary" max={100} value={share} />
          <dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-sm text-muted-foreground">Tenant memberships</dt><dd className="mt-1 text-2xl font-semibold">{data.memberships.toLocaleString()}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Members per tenant</dt><dd className="mt-1 text-2xl font-semibold">{(data.total ? data.memberships / data.total : 0).toFixed(1)}</dd></div></dl>
        </section>
      </div>
      <section className={panel}><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19} />Platform activity</h2>
        {!data.activity.length && <p className="mt-4 text-sm text-muted-foreground">No activity recorded yet.</p>}
        <ul className="mt-2 divide-y divide-border">{data.activity.map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
          <span>{actionLabel(item.action)}</span><time dateTime={item.createdAt} className="shrink-0 text-muted-foreground">{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
        </li>)}</ul>
      </section>
    </>}
  </>;
}

