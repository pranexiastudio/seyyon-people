import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, ShieldCheck, Users } from "lucide-react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
    <aside className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col xl:p-16">
      <Link to="/login" className="relative z-10 flex items-center gap-3 text-xl font-semibold"><Users size={30} />Seyyon <span className="font-normal opacity-70">People</span></Link>
      <div className="pointer-events-none absolute -right-44 top-28 h-[600px] w-[600px] rounded-full border border-white/10" /><div className="pointer-events-none absolute -right-24 top-48 h-[440px] w-[440px] rounded-full border-[65px] border-white/5" />
      <div className="relative z-10 my-auto max-w-lg py-24"><span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Your people. Your possibilities.</span>
        <h1 className="text-5xl font-medium leading-[1.12] tracking-tight xl:text-6xl">Great work<br />starts with<br /><span className="text-emerald-200">your people.</span></h1>
        <p className="mt-7 max-w-sm text-base leading-relaxed text-white/65">A connected workspace for the people who move your business forward.</p>
        <div className="mt-12 flex items-center gap-4 border-t border-white/15 pt-7"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ShieldCheck /></span><div><p className="text-sm font-medium">Your workspace, protected.</p><p className="mt-1 text-xs text-white/60">Secure access. Built around trust.</p></div></div>
      </div>
      <footer className="relative z-10 flex justify-between text-xs text-white/50"><span>© {new Date().getFullYear()} Seyyon People</span><span className="flex items-center gap-1">People first. Always.<ArrowUpRight size={13} /></span></footer>
    </aside>
    <div className="flex min-h-screen flex-col bg-card px-6 py-8 sm:px-12">
      <Link to="/login" className="flex items-center gap-2 text-lg font-semibold text-primary lg:hidden"><Users />Seyyon People</Link>
      <main className="m-auto w-full max-w-[400px] py-12">{children}</main>
      <footer className="text-center text-xs text-muted-foreground">Seyyon People · Secure workspace access</footer>
    </div>
  </div>;
}

