import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import logoImg from '../assets/logo.png';

export const LoginPage: React.FC = () => {
  const { login, logout, status, message } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const from = (location.state as { from?: unknown } | null)?.from;
  const destination = typeof from === 'string' && /^\/(?!\/)/.test(from) && !/[\\\r\n]/.test(from) ? from : '/';
  if (status === 'authenticated') return <Navigate to={destination} replace />;
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true);
    try { if (await login(email, password)) { setPassword(''); navigate(destination, { replace: true }); } }
    finally { setLoading(false); }
  };
  return <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6 py-12">
    <main className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
      <img src={logoImg} alt="Seyyon People" className="h-12 mx-auto mb-6" />
      <h1 className="text-xl font-bold text-slate-900">Sign in to your workspace</h1>
      {message && <p role="alert" className="my-4 text-sm text-red-700">{message}</p>}
      {status === 'restoring' && <p role="status">Verifying your session…</p>}
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold">Work email
          <span className="flex items-center gap-2 mt-1"><Mail size={16} /><input aria-label="Work email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-lg border p-2" /></span>
        </label>
        <label className="block text-sm font-semibold">Password
          <span className="flex items-center gap-2 mt-1"><Lock size={16} /><input aria-label="Password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border p-2" /></span>
        </label>
        <button disabled={loading || status === 'restoring'} className="w-full rounded-lg bg-blue-600 py-3 text-white flex items-center justify-center gap-2 disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></button>
      </form>
      {message?.includes('Server sign-out') && <button className="mt-4 text-sm text-blue-700" onClick={() => void logout().catch(() => undefined)}>Retry sign-out</button>}
    </main>
  </div>;
};
