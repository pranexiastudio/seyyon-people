import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import logoImg from '../assets/logo.png';

export const ActivateAccountPage: React.FC = () => {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [unusable, setUnusable] = useState(!/^[a-f0-9]{64}$/.test(token));
  const [error, setError] = useState(unusable ? 'This activation link is invalid. Ask your administrator for a new invitation.' : '');

  useEffect(() => {
    // The token arrives in a fragment, never a server request or referrer URL.
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const valid = Array.from(password).length >= 12 && new TextEncoder().encode(password).length <= 72
      && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
    if (!valid) { setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol; maximum 72 UTF-8 bytes.'); return; }
    if (password !== confirmation) { setError('Passwords do not match. Please check both fields.'); return; }
    setBusy(true); setError('');
    try {
      const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
      const response = await fetch(`${base}/auth/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (response.ok) {
        setSuccess(true); setToken(''); setPassword(''); setConfirmation('');
      } else if (response.status === 410) {
        setUnusable(true); setError('This activation link has expired. Ask your administrator for a new invitation.');
      } else if (response.status === 400) {
        setUnusable(true); setError('This activation link is invalid or has already been used. Ask your administrator for a new invitation.');
      } else if (response.status === 429) {
        setError('Too many attempts. Wait a minute before trying again.');
      } else { setError('Activation is temporarily unavailable. Please try again later.'); }
    } catch { setError('We could not connect. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 py-12 font-sans">
      <div className="rounded-2xl bg-white p-3 shadow-xl mb-6"><img src={logoImg} alt="Seyyon People" className="h-12 w-auto object-contain" /></div>
      <main className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl border border-slate-100">
        <ShieldCheck className="text-blue-600 mb-3" size={28} />
        <h1 className="text-xl font-extrabold text-slate-900">{success ? 'Account activated' : 'Set your password'}</h1>
        {success ? <div role="status" className="mt-4 text-sm text-slate-600">
          <p>Your password is ready. You can now sign in to Seyyon People.</p>
          <Link to="/login" className="inline-block mt-5 font-bold text-blue-600 hover:text-blue-700">Continue to sign in</Link>
        </div> : <>
          <p className="mt-2 text-sm text-slate-500">Activate your employee account. Your invitation is valid for 24 hours.</p>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!unusable && <form onSubmit={submit} className="mt-5 space-y-4">
            <p id="password-policy" className="text-xs text-slate-500">Use 12 or more characters with uppercase, lowercase, a number, and a symbol. Maximum 72 UTF-8 bytes.</p>
            <div>
              <label htmlFor="activation-password" className="block text-xs font-bold text-slate-600 mb-1">New password</label>
              <div className="relative"><Lock className="absolute left-3 top-3 text-slate-400" size={16} />
                <input id="activation-password" type="password" autoComplete="new-password" required aria-describedby="password-policy" value={password} onChange={event => setPassword(event.target.value)} disabled={busy}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
            </div>
            <div>
              <label htmlFor="activation-confirmation" className="block text-xs font-bold text-slate-600 mb-1">Confirm password</label>
              <input id="activation-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <button disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'Activating…' : 'Activate account'}</button>
          </form>}
          <p className="mt-5 text-xs text-slate-500">Need another invitation? Contact your organization administrator. Open the latest email link to retry.</p>
        </>}
      </main>
    </div>
  );
};
