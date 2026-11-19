import { useState } from "react";
import { Link } from "react-router";
import { forgotPasswordSchema, resetPasswordSchema } from "@seyyon/shared";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordField, inputClass } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { forgotPassword, resetPassword } from "@/lib/auth-api";

export function PasswordPage({ reset = false }: { reset?: boolean }) {
  const [token] = useState(() => {
    const value = window.location.hash.slice(1);
    if (reset && value) window.history.replaceState(null, "", window.location.pathname);
    return value;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  return <AuthLayout>
    <h1 className="text-3xl font-semibold tracking-tight">{reset ? "Choose a new password." : "Let’s get you back in."}</h1>
    <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">{reset ? "Use a unique password with at least 12 characters." : "Enter your account email to request a password reset link."}</p>
    {success ? <p role="status" className="rounded-lg bg-muted p-4 text-sm">{reset ? "Password updated. All previous sessions have been signed out." : "If the account is eligible, a password reset link will be sent."}</p> :
      <form className="space-y-5" noValidate onSubmit={async (event) => {
        event.preventDefault(); setError("");
        const input = reset ? resetPasswordSchema.safeParse({ token, password }) : forgotPasswordSchema.safeParse({ email });
        if (!input.success) { setError(input.error.issues[0]?.message || "Please check your input."); return; }
        if (reset && password !== confirmation) { setError("Passwords do not match."); return; }
        setBusy(true);
        try { if (reset) await resetPassword(token, password); else await forgotPassword(email); setSuccess(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to complete your request."); }
        finally { setBusy(false); }
      }}>
        {reset ? <><div><label className="mb-2 block text-sm font-medium" htmlFor="new-password">New password</label><PasswordField id="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><div><label className="mb-2 block text-sm font-medium" htmlFor="confirm-password">Confirm password</label><PasswordField id="confirm-password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div></> : <div><label htmlFor="email" className="mb-2 block text-sm font-medium">Account email</label><input id="email" type="email" autoComplete="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></div>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full">{busy ? "Please wait…" : reset ? "Update password" : "Send reset link"}</Button>
      </form>}
    <Link to="/login" className="mt-7 inline-block text-sm font-medium text-primary hover:underline">← Back to sign in</Link>
  </AuthLayout>;
}

