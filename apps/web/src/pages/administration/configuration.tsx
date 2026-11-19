import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { tenantConfigSchema, type TenantConfig } from "@seyyon/shared";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/auth/password-field";

import { useCompanyPath } from "./companies";
import { Feedback, Loading, PageHeading, panel, useOperation } from "./layout";

export function TenantConfigurationPage({ workspace = false }: { workspace?: boolean }) {
  const { href, key, companyRequest } = useCompanyPath(workspace);
  const operation = useOperation();
  const configuration = useQuery({ queryKey: [...key, "configuration"], queryFn: () => companyRequest<TenantConfig>("/configuration") });
  const config = configuration.data;
  return <>
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" to={href}><ArrowLeft size={16} />Company profile</Link>
    <PageHeading title="Tenant configuration" subtitle="Manage branding, regional settings and preferences for each HR module." />
    {configuration.isPending && <Loading />}
    <Feedback error={configuration.error?.message} />
    {config && <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const text = (key: string) => String(values.get(key) || "").trim();
      const number = (key: string) => Number(values.get(key));
      const checked = (key: string) => values.has(key);
      void operation.run(async () => {
        const parsed = tenantConfigSchema.safeParse({
          branding: { displayName: text("displayName"), primaryColor: text("primaryColor") },
          regional: { timezone: text("timezone"), locale: text("locale"), firstDayOfWeek: text("firstDayOfWeek") },
          modules: { attendance: checked("attendance"), leave: checked("leave"), payroll: checked("payroll") },
          attendance: { workingMinutesPerDay: number("workingMinutesPerDay"), graceMinutes: number("graceMinutes") },
          leave: { yearStartMonth: number("yearStartMonth"), carryForward: checked("carryForward") },
          payroll: { currency: text("currency").toUpperCase(), frequency: text("frequency") },
        });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Check your configuration values.");
        await companyRequest("/configuration", { method: "PUT", body: JSON.stringify(parsed.data) });
        await configuration.refetch();
        return "Configuration saved.";
      });
    }}>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={panel}><h2 className="text-lg font-semibold">Branding</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Display name<input name="displayName" defaultValue={config.branding.displayName} maxLength={200} className={inputClass + " mt-1"} /></label>
            <label className="text-sm font-medium">Primary color<input name="primaryColor" type="color" defaultValue={config.branding.primaryColor} className={inputClass + " mt-1 h-10 p-1"} /></label>
          </div>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Regional settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Timezone<input name="timezone" defaultValue={config.regional.timezone} placeholder="Asia/Kolkata" list="company-timezones" required className={inputClass + " mt-1"} />
              <datalist id="company-timezones">{Intl.supportedValuesOf("timeZone").map((zone) => <option key={zone} value={zone} />)}<option value="UTC" /></datalist></label>
            <label className="text-sm font-medium">Locale<input name="locale" defaultValue={config.regional.locale} placeholder="en-IN" required className={inputClass + " mt-1"} /></label>
            <Select name="firstDayOfWeek" label="First day of the week" value={config.regional.firstDayOfWeek} options={[["MONDAY", "Monday"], ["SUNDAY", "Sunday"], ["SATURDAY", "Saturday"]]} />
          </div>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Modules</h2>
          <div className="mt-4 grid gap-4">
            <Toggle name="attendance" label="Enable attendance" checked={config.modules.attendance} />
            <Toggle name="leave" label="Enable leave" checked={config.modules.leave} />
            <Toggle name="payroll" label="Enable payroll" checked={config.modules.payroll} />
          </div>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Attendance preferences</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField name="workingMinutesPerDay" label="Working minutes per day" value={config.attendance.workingMinutesPerDay} min={1} max={1440} />
            <NumberField name="graceMinutes" label="Grace period in minutes" value={config.attendance.graceMinutes} min={0} max={120} />
          </div>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Leave preferences</h2>
          <div className="mt-4 grid gap-4">
            <Select name="yearStartMonth" label="Leave year starts in" value={String(config.leave.yearStartMonth)} options={Array.from({ length: 12 }, (_, index) => [
              String(index + 1), new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(Date.UTC(2026, index, 1)),
            ])} />
            <Toggle name="carryForward" label="Allow leave carry-forward" checked={config.leave.carryForward} />
          </div>
        </section>
        <section className={panel}><h2 className="text-lg font-semibold">Payroll preferences</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Currency code<input name="currency" defaultValue={config.payroll.currency} maxLength={3} required className={inputClass + " mt-1 uppercase"} /></label>
            <Select name="frequency" label="Pay frequency" value={config.payroll.frequency} options={[["MONTHLY", "Monthly"], ["SEMIMONTHLY", "Twice a month"], ["BIWEEKLY", "Every two weeks"], ["WEEKLY", "Weekly"]]} />
          </div>
        </section>
      </div>
      <Feedback error={operation.error} success={operation.success} />
      <Button type="submit" disabled={operation.busy}>Save configuration</Button>
    </form>}
  </>;
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return <label className="text-sm font-medium">{label}<select name={name} defaultValue={value} className={inputClass + " mt-1"}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}
function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return <label className="flex items-center gap-2 text-sm font-medium"><input name={name} type="checkbox" defaultChecked={checked} className="size-4 accent-primary" />{label}</label>;
}
function NumberField({ name, label, value, min, max }: { name: string; label: string; value: number; min: number; max: number }) {
  return <label className="text-sm font-medium">{label}<input name={name} type="number" defaultValue={value} min={min} max={max} required className={inputClass + " mt-1"} /></label>;
}

