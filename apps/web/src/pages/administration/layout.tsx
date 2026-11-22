import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { companyAdminRole, employeePermissions, organizationPermissions, type TenantConfig } from "@seyyon/shared";
import { apiRequest } from "@/lib/auth-api";
import { NavLink, Outlet } from "react-router";
import { Building2, LayoutDashboard, LogOut, Network, Settings2, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";

export const panel = "rounded-2xl border border-border bg-card p-5 sm:p-6";
export const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
export const actionLabel = (value: string) => {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function AdministrationLayout({ platform, organization = false, employees = false }: { platform: boolean; organization?: boolean; employees?: boolean }) {
  const { profile, logout } = useAuth();
  const [failure, setFailure] = useState("");
  const canManageCompany = !platform && !!profile?.roles.includes(companyAdminRole);
  const canReadOrganization = !platform && !!profile?.permissions.includes(organizationPermissions.read);
  const canReadEmployees = !platform && !!profile?.permissions.includes(employeePermissions.read);
  const membershipId = profile?.contexts.find((entry) => entry.tenantId === profile.tenantId)?.id;
  const configuration = useQuery({
    queryKey: ["company", "/workspace/company", membershipId, "configuration"],
    queryFn: () => apiRequest<TenantConfig>("/workspace/company/configuration", { headers: { "X-Expected-Membership": membershipId || "" } }),
    enabled: canManageCompany,
  });
  const branding = canManageCompany ? configuration.data?.branding : undefined;
  if (!platform && !(employees ? canReadEmployees : organization ? canReadOrganization : canManageCompany)) {
    return <main className="p-8"><Feedback error={employees ? "Employee access requires a workspace permission." : organization ? "Organization access requires a workspace permission." : "Company administrator access required."} />
      <Button variant="outline" asChild><NavLink to="/app">Back to your account</NavLink></Button></main>;
  }
  const nav = platform
    ? [{ to: "/platform", name: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/platform/companies", name: "Companies", icon: Building2 },
      { to: "/platform/account", name: "Account & security", icon: ShieldCheck }]
    : [...(canManageCompany ? [{ to: "/app/company", name: "Company profile", icon: Building2, end: true },
      { to: "/app/company/configuration", name: "Configuration", icon: Settings2 }] : []),
      ...(canReadOrganization ? [{ to: "/app/organization", name: "Organization", icon: Network }] : []),
      ...(canReadEmployees ? [{ to: "/app/employees", name: "Employees", icon: Users }] : []),
      { to: "/app", name: "Account & security", icon: ShieldCheck, end: true }];
  return <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
    <aside className="flex flex-col gap-5 border-b border-border bg-card px-5 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:px-4 lg:py-8">
      <div className="flex items-center gap-3"><span className="rounded-xl border-b-4 border-primary bg-primary p-2.5 text-primary-foreground" style={branding ? { borderBottomColor: branding.primaryColor } : undefined}><Users size={21} /></span>
        <div className="min-w-0"><p className="font-semibold">Seyyon People</p><p className="truncate text-xs text-muted-foreground">{platform ? "Platform administration" : branding?.displayName || profile?.companyName}</p></div>
      </div>
      <nav aria-label={platform ? "Platform navigation" : "Company navigation"} className="flex flex-wrap gap-1 lg:flex-col">
        {nav.map(({ to, name, icon: Icon, end }) => <NavLink key={to} to={to} end={end}
          className={({ isActive }) => "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium " + (isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <Icon size={17} aria-hidden="true" />{name}</NavLink>)}
      </nav>
      <div className="lg:mt-auto"><p className="mb-3 break-all text-xs text-muted-foreground">{profile?.user.email}</p>
        <Button variant="outline" onClick={() => void logout().catch((error: Error) => setFailure(error.message))}><LogOut size={16} />Sign out</Button>
        <Feedback error={failure} />
      </div>
    </aside>
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-8 lg:px-10 lg:py-10"><Outlet /></main>
  </div>;
}

export function PageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}</div>{actions}
  </header>;
}

export function Feedback({ error, success }: { error?: string; success?: string }) {
  return <>{error && <p role="alert" className="my-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="my-3 rounded-lg bg-muted px-3 py-2 text-sm text-primary">{success}</p>}</>;
}

export function Loading() { return <p role="status" className="text-sm text-muted-foreground">Loading…</p>; }

export function Status({ active, label }: { active: boolean; label: string }) {
  return <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
    (active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label}</span>;
}

export function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(work: () => Promise<string | void>) {
    setBusy(true); setError(""); setSuccess("");
    try { setSuccess((await work()) || ""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The request failed."); }
    finally { setBusy(false); }
  }
  return { busy, error, success, run };
}

