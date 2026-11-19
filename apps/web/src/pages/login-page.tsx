import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginSchema } from "@seyyon/shared";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordField, inputClass } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const auth = useAuth();
  const [error, setError] = useState("");
  const form = useForm<z.input<typeof loginSchema>, unknown, z.output<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "", remember: false } });
  if (!auth.loading && auth.profile) return <Navigate to={auth.profile.platform ? "/platform" : "/app"} replace />;
  const submit = form.handleSubmit(async (input) => {
    setError("");
    try { await auth.login(input); } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to sign in."); }
  });
  return <AuthLayout>
    <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary"><LockKeyhole size={24} /></div>
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Welcome to Seyyon People</p>
    <h2 className="text-3xl font-semibold tracking-tight">Good to have you back.</h2>
    <p className="mb-9 mt-3 text-sm leading-relaxed text-muted-foreground">Sign in to your workspace and make today count.</p>
    <form onSubmit={submit} noValidate className="space-y-5">
      <div><label htmlFor="identifier" className="mb-2 block text-sm font-medium">Email or Employee ID</label><input id="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@company.com or Employee ID" className={inputClass} aria-invalid={!!form.formState.errors.identifier} aria-describedby="identifier-error" {...form.register("identifier")} /><p id="identifier-error" className="mt-1 text-xs text-red-700">{form.formState.errors.identifier?.message}</p></div>
      <div><label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label><PasswordField id="password" autoComplete="current-password" placeholder="Enter your password" aria-invalid={!!form.formState.errors.password} aria-describedby="password-error" {...form.register("password")} /><p id="password-error" className="mt-1 text-xs text-red-700">{form.formState.errors.password?.message}</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><label className="flex cursor-pointer items-center gap-2 text-muted-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" {...form.register("remember")} />Remember me</label><Link to="/forgot-password" className="font-medium text-primary hover:underline">Forgot password?</Link></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={form.formState.isSubmitting || auth.loading}>{form.formState.isSubmitting ? <><LoaderCircle size={18} className="animate-spin" />Signing in…</> : <>Sign in<ArrowRight size={17} /></>}</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">Remember me keeps this device signed in for up to 30 days. Leave it unchecked on shared devices.</p>
    </form>
    <div className="mt-9 border-t border-border pt-6 text-center text-sm text-muted-foreground">Need access? Contact your company administrator.</div>
  </AuthLayout>;
}

