import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus } from "lucide-react";
import { Link } from "react-router";
import type { Company, TenantAdmin } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";
import { apiRequest } from "@/lib/auth-api";
import { useCompanyPath } from "./companies";
import { Feedback, Loading, PageHeading, panel, Status, useOperation } from "./layout";

export function TenantAdminsPage() {
  const { path, href } = useCompanyPath();
  const api = path + "/admins";
  const cache = useQueryClient();
  const operation = useOperation();
  const company = useQuery({ queryKey: ["company", path], queryFn: () => apiRequest<Company>(path) });
  const admins = useQuery({ queryKey: ["company", path, "admins"], queryFn: () => apiRequest<TenantAdmin[]>(api) });
  function refresh() {
    return Promise.all([cache.invalidateQueries({ queryKey: ["company", path, "admins"] }), cache.invalidateQueries({ queryKey: ["platform"] })]);
  }
  async function sendLink(admin: TenantAdmin, invitation: boolean) {
    const result = await apiRequest<{ delivery: "queued" | "failed" }>(api + "/" + admin.id + "/password-link",
      { method: "POST", body: JSON.stringify({ invitation }) });
    await refresh();
    if (result.delivery === "failed") throw new Error("The password link could not be delivered. Try sending it again.");
    return invitation ? "Invitation queued in the local outbox." : "Password reset queued in the local outbox.";
  }

  return <>
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" to={href}><ArrowLeft size={16} />Company profile</Link>
    <PageHeading title="Company administrators" subtitle={company.data?.name} />
    {company.isPending && <Loading />}
    <Feedback error={company.error?.message || admins.error?.message || operation.error} success={operation.success} />
    {company.data && <>
      <section className={panel}><h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus size={19} />Add an administrator</h2>
        <p className="mt-2 text-sm text-muted-foreground">Invite a new account with a password setup link, or assign an existing account by email.</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          const action = values.get("action");
          void operation.run(async () => {
            const result = await apiRequest<{ delivery: "queued" | "failed" | null }>(api, { method: "POST",
              body: JSON.stringify({ email: values.get("email"), action }) });
            form.reset();
            await refresh();
            if (result.delivery === "failed") throw new Error("Administrator created. Use Resend invitation to retry delivery.");
            return result.delivery === "queued" ? "Administrator created and invitation queued in the local outbox." : "Administrator assigned.";
          });
        }}>
          <label className="min-w-44 flex-1 text-sm font-medium">Administrator email<input autoComplete="off" type="email" name="email" required maxLength={320} className={inputClass + " mt-1"} /></label>
          <label className="text-sm font-medium">Action<select name="action" className={inputClass + " mt-1"}><option value="invite">Invite new account</option><option value="assign">Assign existing account</option></select></label>
          <Button type="submit" disabled={operation.busy}>Add administrator</Button>
        </form>
      </section>
      <section className={panel}><h2 className="text-lg font-semibold">Administrators</h2>
        {admins.isPending && <Loading />}
        {admins.data?.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No administrators assigned yet.</p>}
        <ul className="mt-2 divide-y divide-border">{admins.data?.map((admin) => {
          const active = admin.status === "ACTIVE" && !admin.accountDisabled;
          const label = admin.accountDisabled ? "Account disabled" : !active ? "Tenant access disabled" : admin.invitationPending ? "Invitation pending" : "Active";
          return <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="space-y-2"><p className="break-all text-sm font-medium">{admin.email}</p><Status active={active && !admin.invitationPending} label={label} /></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={operation.busy || admin.accountDisabled} onClick={() => void operation.run(async () => {
                const status = active ? "DISABLED" : "ACTIVE";
                await apiRequest(api + "/" + admin.id + "/status", { method: "PATCH", body: JSON.stringify({ status }) });
                await refresh();
                return active ? "Administrator access deactivated." : "Administrator access activated.";
              })}>{active ? "Deactivate access" : "Activate access"}</Button>
              <Button variant="outline" size="sm" disabled={operation.busy || !active} onClick={() => void operation.run(() => sendLink(admin, admin.invitationPending))}>{admin.invitationPending ? "Resend invitation" : "Reset password"}</Button>
            </div>
          </li>;
        })}</ul>
      </section>
    </>}
  </>;
}

