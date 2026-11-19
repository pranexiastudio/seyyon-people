import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users, LogOut, Monitor } from "lucide-react";
import { Link } from "react-router";
import { companyAdminRole, organizationPermissions } from "@seyyon/shared";
import { z } from "zod";
import { useAuth } from "@/auth/auth-provider";
import { authRequest } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";

const sessionsSchema = z.array(z.object({ id: z.uuid(), createdAt: z.string(), expiresAt: z.string(), platform: z.boolean(), tenantId: z.uuid().nullable() }));
export function AccountPage() {
  const auth = useAuth();
  const profile = auth.profile!;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const sessions = useQuery({ queryKey: ["sessions", profile.sessionId], queryFn: async () => sessionsSchema.parse(await authRequest("/sessions")) });
  const scope = useQuery({ queryKey: ["auth-scope", profile.tenantId, profile.platform], queryFn: () => authRequest(profile.platform ? "/platform" : "/workspace") });
  async function action(operation: () => Promise<unknown>) {
    setError(""); setBusy(true);
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5"><span className="flex items-center gap-2 font-semibold text-primary"><Users />Seyyon People</span><Button variant="outline" disabled={busy} onClick={() => void action(() => auth.logout())}><LogOut size={16} />Sign out</Button></div></header>
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{profile.platform ? "Platform administration" : profile.companyName}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Your account & security</h1>
      <p className="text-sm text-muted-foreground">Signed in as {profile.user.email}</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <section className="rounded-2xl border border-border bg-card p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} />Workspace access</h2>
        <p className="mt-3 text-sm text-muted-foreground">{profile.roles.length ? profile.roles.join(" · ") : "No roles assigned. Contact your administrator."}</p>
        <label htmlFor="context" className="mb-2 mt-5 block text-sm font-medium">Current workspace</label>
        <select id="context" className={inputClass + " max-w-md"} disabled={busy} value={profile.platform ? "platform" : profile.contexts.find((entry) => entry.tenantId === profile.tenantId)?.id || ""} onChange={(event) => void action(() => auth.selectContext(event.target.value === "platform" ? null : event.target.value))}>
          {profile.canAccessPlatform && <option value="platform">Seyyon platform · Super Admin</option>}
          {profile.contexts.map((context) => <option key={context.id} value={context.id}>{context.name}</option>)}
        </select>
        <p className="mt-4 text-xs text-muted-foreground" role="status">{scope.isPending ? "Verifying access…" : scope.isError ? scope.error.message : "Access verified by the server."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(profile.platform || profile.roles.includes(companyAdminRole)) && <Button variant="outline" asChild><Link to={profile.platform ? "/platform" : "/app/company"}>{profile.platform ? "Platform dashboard" : "Manage company"}</Link></Button>}
          {!profile.platform && profile.permissions.includes(organizationPermissions.read) &&
            <Button variant="outline" asChild><Link to="/app/organization">Organization</Link></Button>}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Monitor size={20} />Active sessions</h2><Button variant="outline" disabled={busy} onClick={() => void action(() => auth.logout(true))}>Sign out everywhere</Button></div>
        {sessions.isPending ? <p role="status" className="mt-5 text-sm">Loading sessions…</p> : sessions.isError ? <div className="mt-5"><p role="alert" className="text-sm text-red-800">{sessions.error.message}</p><Button variant="outline" onClick={() => void sessions.refetch()}>Retry</Button></div> : !sessions.data.length ? <p className="mt-5 text-sm">No active sessions.</p> : <ul className="mt-4 divide-y divide-border">{sessions.data.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{session.id === profile.sessionId ? "This session" : "Another signed-in session"}</p><p className="mt-1 text-xs text-muted-foreground">Started {new Date(session.createdAt).toLocaleString()} · Expires {new Date(session.expiresAt).toLocaleString()}</p></div>{session.id !== profile.sessionId && <Button variant="outline" size="sm" disabled={busy} onClick={() => void action(async () => { await authRequest("/sessions/" + session.id, { method: "DELETE" }); await sessions.refetch(); })}>Revoke</Button>}</li>)}</ul>}
      </section>
      {profile.platform && <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Account activation</h2><p className="mt-2 text-sm text-muted-foreground">Enable or disable access for an existing account. Disabling immediately revokes all its sessions.</p><form className="mt-5 flex flex-wrap gap-3" onSubmit={(event) => event.preventDefault()}><label className="w-full text-sm font-medium" htmlFor="account-id">Account ID</label><input id="account-id" placeholder="Account UUID" className={inputClass + " max-w-md"} value={accountId} onChange={(event) => setAccountId(event.target.value)} />{[false, true].map((disabled) => <Button key={String(disabled)} variant="outline" disabled={busy} onClick={() => void action(async () => { z.uuid().parse(accountId); await authRequest("/accounts/" + accountId + "/status", { method: "PATCH", body: JSON.stringify({ disabled }) }); setStatusMessage(disabled ? "Account disabled and sessions revoked." : "Account activated. The user can sign in again."); })}>{disabled ? "Deactivate" : "Activate"}</Button>)}</form>{statusMessage && <p role="status" className="mt-4 text-sm text-primary">{statusMessage}</p>}</section>}
    </main>
  </div>;
}

