import { useQuery } from "@tanstack/react-query";
import { healthSchema } from "@seyyon/shared";
import { ArrowUpRight, CheckCircle2, Circle, Layers3, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

async function checkReadiness() {
  const response = await fetch(`${import.meta.env.VITE_API_URL || "/api/v1"}/health/ready`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Database readiness is unavailable. Check the API and database services.");
  return healthSchema.parse(await response.json());
}

export function SetupPage() {
  const health = useQuery({ queryKey: ["readiness"], queryFn: checkReadiness, retry: false, refetchInterval: 30000 });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="rounded-xl bg-primary p-2 text-primary-foreground"><Users size={22} /></span>Seyyon <span className="font-normal text-muted-foreground">People</span></a>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Foundation · v0.1</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Layers3 size={16} /> Workspace foundation</div>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">A strong foundation.<br /><span className="text-muted-foreground">For everything people.</span></h1>
        <p className="mt-6 max-w-xl leading-relaxed text-muted-foreground">Seyyon People brings your people operations together. Infrastructure setup is the first step toward your company workspace.</p>
        <section aria-label="Infrastructure status" className="mt-12 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-border bg-card p-6 md:col-span-2">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Service connection</h2><p className="mt-1 text-sm text-muted-foreground">Live API and PostgreSQL readiness</p></div><ShieldCheck className="text-primary" /></div>
            <div role="status" aria-live="polite" className="my-8 flex items-center gap-3 rounded-xl bg-muted p-4">
              {health.isPending ? <RefreshCw className="animate-spin text-muted-foreground" size={20} /> : health.isError ? <Circle className="text-amber-600" size={20} /> : <CheckCircle2 className="text-primary" size={20} />}
              <div><p className="text-sm font-medium">{health.isPending ? "Checking services…" : health.isError ? "Connection needs attention" : "Services are ready"}</p><p className="mt-1 text-xs text-muted-foreground">{health.isError ? health.error.message : health.isPending ? "Contacting the API." : "API and database responded successfully."}</p></div>
            </div>
            <Button variant="outline" onClick={() => void health.refetch()} disabled={health.isFetching}><RefreshCw size={14} />Check connection</Button>
          </article>
          <article className="rounded-2xl bg-primary p-6 text-primary-foreground"><ShieldCheck size={28} /><h2 className="mt-8 text-xl font-semibold">Built around trust</h2><p className="mt-3 text-sm leading-relaxed opacity-80">The foundation includes tenant isolation, permission checks and separate platform administration.</p><span className="mt-8 flex items-center gap-2 text-xs opacity-80">Security architecture in place<ArrowUpRight size={14} /></span></article>
        </section>
        <section className="mt-8 rounded-2xl border border-dashed border-border p-6"><h2 className="font-medium">Your workspace starts here</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">No company has been provisioned through this application yet. Company onboarding and employee services will be introduced in the next development phase.</p></section>
        <footer className="mt-12 text-xs text-muted-foreground">Seyyon People · People operations, thoughtfully connected.</footer>
      </main>
    </div>
  );
}

