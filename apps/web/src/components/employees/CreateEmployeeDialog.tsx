import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmploymentType } from '@seyyon/shared';
import { X } from 'lucide-react';
import { ApiError } from '../../services/auth-api';
import { createEmployeesApi, EmployeeCreated, EmployeeCreateInput, employeeCreateSchema, employeeWriteError } from '../../services/employees-api';

type Props = {
  api: ReturnType<typeof createEmployeesApi>; scope: (string | undefined)[]; canResend: boolean;
  initialResult?: EmployeeCreated | null; onClose: () => void;
  onCreated: (result: EmployeeCreated) => void; onInvitationUpdate: (result: EmployeeCreated) => void;
};
const inputClass = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const secondaryClass = 'px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50';
const initialForm = { firstName: '', lastName: '', email: '', departmentId: '', designationId: '', employeeCode: '', phone: '', dateOfJoining: '', employmentType: EmploymentType.FULL_TIME };

export const CreateEmployeeDialog: React.FC<Props> = ({ api, scope, canResend, initialResult, onClose, onCreated, onInvitationUpdate }) => {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<EmployeeCreated | null>(initialResult || null);
  const [retryAt, setRetryAt] = useState(Date.now() + 60000);
  const [now, setNow] = useState(Date.now());
  const [managerSearch, setManagerSearch] = useState('');
  const [managerQuery, setManagerQuery] = useState({ search: '', page: 1 });
  const [manager, setManager] = useState<{ id: string; name: string } | null>(null);
  const departments = useQuery({ queryKey: ['employee-departments', ...scope], queryFn: ({ signal }) => api.departments(signal), enabled: !result, retry: false });
  const designations = useQuery({ queryKey: ['employee-create-designations', ...scope, form.departmentId],
    queryFn: ({ signal }) => api.designations(form.departmentId, signal), enabled: !result && !!form.departmentId, retry: false });
  const managers = useQuery({ queryKey: ['employee-create-managers', ...scope, managerQuery],
    queryFn: ({ signal }) => api.list({ ...managerQuery, departmentId: '', status: '', limit: 20 }, signal), enabled: !result, retry: false });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setManagerQuery(previous => previous.search === managerSearch.trim() ? previous : { search: managerSearch.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [managerSearch]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current) onClose(); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const set = (key: keyof typeof form, value: string) => {
    setForm(previous => ({ ...previous, [key]: value, ...(key === 'departmentId' ? { designationId: '' } : {}) }));
    setErrors(previous => ({ ...previous, [key]: '', ...(key === 'departmentId' ? { designationId: '' } : {}) }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (locked.current || result || uncertain) return;
    const parsed = employeeCreateSchema.safeParse({ ...form, managerId: manager?.id });
    const validation: Record<string, string> = {};
    if (!parsed.success) parsed.error.issues.forEach(issue => { validation[String(issue.path[0])] = issue.message; });
    if (!departments.data?.some(row => row.id === form.departmentId)) validation.departmentId = 'Select a department from the available choices.';
    if (!designations.data?.some(row => row.id === form.designationId && row.departmentId === form.departmentId)) validation.designationId = 'Select a designation for this department.';
    if (Object.keys(validation).length) { setErrors(validation); return; }
    locked.current = true; setBusy(true); setError(''); setErrors({});
    try {
      const created = await api.create(parsed.success ? parsed.data : form as EmployeeCreateInput);
      if (!mounted.current) return;
      setResult(created); setRetryAt(Date.now() + 60000); setNow(Date.now());
      setForm(initialForm); setManager(null); onCreated(created);
    } catch (failure) {
      if (!mounted.current) return;
      setError(employeeWriteError(failure, 'create'));
      // No automatic repeat of an uncertain write: the server may have committed it.
      setUncertain(!(failure instanceof ApiError && [400, 401, 403, 404, 409].includes(failure.status)));
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const resend = async () => {
    if (!result || !canResend || locked.current || cooldown) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await api.resendInvitation(result.id);
      if (!mounted.current) return;
      const updated: EmployeeCreated = { ...result, activationInvitation: 'SENT' };
      setResult(updated); onInvitationUpdate(updated);
    } catch (failure) { if (mounted.current) { setError(employeeWriteError(failure, 'invite')); const updated: EmployeeCreated = { ...result, activationInvitation: 'RETRY_REQUIRED' }; setResult(updated); onInvitationUpdate(updated); } }
    finally {
      locked.current = false;
      if (mounted.current) { setBusy(false); setRetryAt(Date.now() + 60000); setNow(Date.now()); }
    }
  };
  const fieldError = (name: string) => errors[name] && <p id={`create-${name}-error`} role="alert" className="mt-1 text-xs text-rose-700">{errors[name]}</p>;

  return <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="create-employee-title" className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100"><h3 id="create-employee-title" className="font-extrabold text-slate-900 text-base">{result ? 'Employee account created' : 'Onboard New Employee'}</h3>
        <button aria-label="Close employee creation" disabled={busy} onClick={onClose} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X size={18} /></button></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}
      {result ? <div className="mt-4 space-y-4 text-xs">
        <p className="font-semibold text-slate-800">{result.firstName} {result.lastName} · {result.employeeCode}</p>
        <p role="status" className={`p-3 rounded-xl border ${result.activationInvitation === 'SENT' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          {error ? 'Employee account exists. Invitation delivery needs attention; see the error above.' : result.activationInvitation === 'SENT' ? 'Employee created. Invitation sent. Ask the employee to check their email.' : 'Employee created and account exists. The invitation was not sent and needs retry. Do not create the employee again.'}
        </p>
        <p className="text-slate-500">The employee must activate their account before signing in. Sending another invitation replaces the previous activation link.</p>
        {canResend ? <button disabled={busy || cooldown > 0} onClick={() => void resend()} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Sending invitation...' : cooldown ? `Retry available in ${cooldown}s` : 'Send invitation again'}</button>
          : <p className="text-slate-500">An administrator with employee creation and update permissions can resend the invitation.</p>}
        <div className="flex justify-end"><button disabled={busy} className={secondaryClass} onClick={onClose}>Done</button></div>
      </div> : <form noValidate onSubmit={submit} className="mt-4 space-y-4">
        <fieldset disabled={busy || uncertain} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">{(['firstName', 'lastName'] as const).map(name => <div key={name}><label htmlFor={`create-${name}`} className="block text-[11px] font-bold uppercase text-slate-600 mb-1">{name === 'firstName' ? 'First Name' : 'Last Name'} *</label>
            <input id={`create-${name}`} required autoComplete={name === 'firstName' ? 'given-name' : 'family-name'} value={form[name]} onChange={event => set(name, event.target.value)} className={inputClass} aria-invalid={!!errors[name]} aria-describedby={`create-${name}-error`} />{fieldError(name)}</div>)}</div>
          <div><label htmlFor="create-email" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Work Email *</label><input id="create-email" type="email" required value={form.email} onChange={event => set('email', event.target.value)} className={inputClass} aria-invalid={!!errors.email} aria-describedby="create-email-error" />{fieldError('email')}</div>
          <div className="grid grid-cols-2 gap-3"><div><label htmlFor="create-department" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Department *</label>
            <select id="create-department" required value={form.departmentId} disabled={departments.isPending || departments.isError} onChange={event => set('departmentId', event.target.value)} className={inputClass} aria-invalid={!!errors.departmentId}>
              <option value="">{departments.isPending ? 'Loading departments...' : 'Select department'}</option>{departments.data?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{fieldError('departmentId')}
            {departments.isError && <p role="alert" className="text-xs text-rose-700">Unable to load departments.<button type="button" className={secondaryClass} onClick={() => void departments.refetch()}>Retry departments</button></p>}
          </div><div><label htmlFor="create-designation" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Designation *</label>
            <select id="create-designation" required value={form.designationId} disabled={!form.departmentId || designations.isPending || designations.isError} onChange={event => set('designationId', event.target.value)} className={inputClass} aria-invalid={!!errors.designationId}>
              <option value="">{form.departmentId && designations.isPending ? 'Loading designations...' : 'Select designation'}</option>{designations.data?.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>{fieldError('designationId')}
            {form.departmentId && designations.isSuccess && !designations.data.length && <p className="mt-1 text-xs text-slate-500">No designations in this department. Ask an administrator to configure one.</p>}
            {form.departmentId && designations.isError && <p role="alert" className="text-xs text-rose-700">Unable to load designations.<button type="button" className={secondaryClass} onClick={() => void designations.refetch()}>Retry designations</button></p>}
          </div></div>
          <div className="grid grid-cols-2 gap-3"><div><label htmlFor="create-code" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Employee Code (optional)</label><input id="create-code" value={form.employeeCode} onChange={event => set('employeeCode', event.target.value)} className={inputClass} placeholder="Assigned automatically if blank" /></div>
            <div><label htmlFor="create-phone" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Phone (optional)</label><input id="create-phone" type="tel" value={form.phone} onChange={event => set('phone', event.target.value)} className={inputClass} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label htmlFor="create-type" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Employment Type</label><select id="create-type" value={form.employmentType} onChange={event => set('employmentType', event.target.value)} className={inputClass}>{Object.values(EmploymentType).map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select></div>
            <div><label htmlFor="create-date" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Joining Date (optional)</label><input id="create-date" type="date" value={form.dateOfJoining} onChange={event => set('dateOfJoining', event.target.value)} className={inputClass} aria-invalid={!!errors.dateOfJoining} />{fieldError('dateOfJoining')}</div></div>
          <div className="rounded-xl border border-slate-200 p-3 space-y-2"><label htmlFor="create-manager-search" className="block text-[11px] font-bold uppercase text-slate-600">Reporting Manager (optional)</label>
            <input id="create-manager-search" type="search" maxLength={200} placeholder="Search employees for a manager" value={managerSearch} onChange={event => setManagerSearch(event.target.value)} className={inputClass} />
            <select aria-label="Reporting manager" value={manager?.id || ''} disabled={managers.isPending || managers.isError || managerSearch.trim() !== managerQuery.search} className={inputClass} onChange={event => {
              const row = managers.data?.items.find(item => item.id === event.target.value); setManager(row ? { id: row.id, name: `${row.firstName} ${row.lastName}` } : null);
            }}><option value="">No manager assigned</option>{manager && !managers.data?.items.some(row => row.id === manager.id) && <option value={manager.id}>{manager.name}</option>}
              {managers.data?.items.map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} ({row.employeeCode})</option>)}</select>
            {manager && <button type="button" className={secondaryClass} onClick={() => setManager(null)}>Clear manager</button>}
            {managers.isError && <p role="alert" className="text-xs text-rose-700">Unable to load manager choices. A manager is optional.<button type="button" className={secondaryClass} onClick={() => void managers.refetch()}>Retry managers</button></p>}
            {managers.isSuccess && !managers.data.items.length && <p className="text-xs text-slate-500">No employees match this manager search.</p>}
            <div className="flex items-center justify-between text-xs text-slate-500"><button type="button" disabled={managers.isFetching || managerQuery.page <= 1} className={secondaryClass} onClick={() => setManagerQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous managers</button>
              {managers.data && <span>Page {managerQuery.page} of {Math.max(1, managers.data.pagination.totalPages)}</span>}
              <button type="button" disabled={managers.isFetching || !managers.data || managerQuery.page >= managers.data.pagination.totalPages} className={secondaryClass} onClick={() => setManagerQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next managers</button></div>
          </div>
        </fieldset>
        <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100"><button type="button" disabled={busy} onClick={onClose} className={secondaryClass}>{uncertain ? 'Close and check directory' : 'Cancel'}</button>
          <button type="submit" disabled={busy || uncertain || departments.isPending || departments.isError || (!!form.departmentId && (designations.isPending || designations.isError))} className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md shadow-blue-600/20 disabled:opacity-50">{busy ? 'Creating employee...' : 'Save & Send Invite'}</button></div>
      </form>}
    </section>
  </div>;
};
