import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmployeeStatus } from '@seyyon/shared';
import { X } from 'lucide-react';
import { ApiError } from '../../services/auth-api';
import { createEmployeesApi, EmployeeEditDetails, EmployeeUpdateInput, employeeUpdateSchema, employeeUpdateError, employeeReadError } from '../../services/employees-api';

type Props = { api: ReturnType<typeof createEmployeesApi>; scope: (string | undefined)[]; employeeId: string; onClose: () => void; onSaved: () => void };
const inputClass = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const buttonClass = 'px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50';
const privateFields = ['phone', 'address', 'emergencyContactName', 'emergencyContactPhone'] as const;
const labels = { phone: 'Phone', address: 'Home Address', emergencyContactName: 'Emergency Contact Name', emergencyContactPhone: 'Emergency Contact Phone' };

export const EditEmployeeDialog: React.FC<Props> = props => {
  const detail = useQuery({ queryKey: ['employee-edit', ...props.scope, props.employeeId], queryFn: ({ signal }) => props.api.editDetail(props.employeeId, signal), retry: false, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
      {detail.isPending ? <><h3 id="edit-employee-title" className="font-extrabold text-slate-900 text-base">Edit Employee</h3><p role="status" className="mt-4 text-xs text-slate-500">Loading employee for editing...</p><button className={buttonClass} onClick={props.onClose}>Cancel</button></>
        : detail.isError ? <><h3 id="edit-employee-title">Edit Employee</h3><p role="alert" className="mt-4 text-xs text-rose-700">{employeeReadError(detail.error, 'profile')}</p><button className={buttonClass} onClick={() => void detail.refetch()}>Retry employee</button><button className={buttonClass} onClick={props.onClose}>Cancel</button></>
          : <EditForm {...props} employee={detail.data} />}
    </section>
  </div>;
};

function EditForm({ api, scope, employee, onClose, onSaved }: Props & { employee: EmployeeEditDetails }) {
  const initial = (): EmployeeUpdateInput => ({ firstName: employee.firstName, lastName: employee.lastName,
    departmentId: employee.departmentId, designationId: employee.designationId, managerId: employee.managerId, status: employee.status,
    ...Object.fromEntries(privateFields.filter(field => employee[field] !== undefined).map(field => [field, employee[field] || ''])) });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const locked = useRef(false), mounted = useRef(true);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerQuery, setManagerQuery] = useState({ search: '', page: 1 });
  const [managerName, setManagerName] = useState(employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : 'Current manager');
  const departments = useQuery({ queryKey: ['employee-departments', ...scope], queryFn: ({ signal }) => api.departments(signal), retry: false });
  const designations = useQuery({ queryKey: ['employee-edit-designations', ...scope, form.departmentId], queryFn: ({ signal }) => api.designations(form.departmentId!, signal), retry: false });
  const managers = useQuery({ queryKey: ['employee-edit-managers', ...scope, managerQuery], queryFn: ({ signal }) => api.list({ ...managerQuery, departmentId: '', status: '', limit: 20 }, signal), retry: false });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setManagerQuery(previous => previous.search === managerSearch.trim() ? previous : { search: managerSearch.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [managerSearch]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current) onClose(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [onClose]);
  const set = (field: keyof EmployeeUpdateInput, value: string | null) => {
    setForm(previous => ({ ...previous, [field]: value, ...(field === 'departmentId' ? { designationId: '' } : {}) }));
    setErrors(previous => ({ ...previous, [field]: '' })); if (field === 'status') setConfirmed(false);
  };
  const leaving = form.status !== employee.status && (form.status === EmployeeStatus.TERMINATED || form.status === EmployeeStatus.RESIGNED);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (locked.current || uncertain) return;
    const parsed = employeeUpdateSchema.safeParse(form), validation: Record<string, string> = {};
    if (!parsed.success) parsed.error.issues.forEach(issue => { validation[String(issue.path[0])] = issue.message; });
    if (form.departmentId !== employee.departmentId && !departments.data?.some(row => row.id === form.departmentId)) validation.departmentId = 'Select an available department.';
    const unchangedDesignation = form.departmentId === employee.departmentId && form.designationId === employee.designationId && !!employee.designation;
    if (!unchangedDesignation && !designations.data?.some(row => row.id === form.designationId && (row.departmentId === null || row.departmentId === form.departmentId))) validation.designationId = 'Select a designation for this department.';
    if (leaving && !confirmed) validation.status = 'Confirm the linked account will be disabled.';
    if (Object.keys(validation).length || !parsed.success) { setErrors(validation); return; }
    const original = initial();
    const changes = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => value !== original[key as keyof EmployeeUpdateInput])) as EmployeeUpdateInput;
    if (!Object.keys(changes).length) { setError('No changes to save.'); return; }
    locked.current = true; setBusy(true); setError(''); setErrors({});
    try { await api.update(employee.id, changes); if (mounted.current) onSaved(); }
    catch (failure) { if (mounted.current) { setError(employeeUpdateError(failure)); setUncertain(!(failure instanceof ApiError && [400, 401, 403, 404, 409].includes(failure.status))); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const fieldError = (field: string) => errors[field] && <p role="alert" className="mt-1 text-xs text-rose-700">{errors[field]}</p>;
  return <>
    <div className="flex items-center justify-between pb-4 border-b border-slate-100"><h3 id="edit-employee-title" className="font-extrabold text-slate-900 text-base">Edit Employee</h3><button aria-label="Close employee editing" disabled={busy} onClick={onClose} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X size={18} /></button></div>
    <p className="mt-3 text-xs text-slate-500">{employee.employeeCode} · {employee.email}</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}
    <form noValidate onSubmit={submit} className="mt-4 space-y-4"><fieldset disabled={busy || uncertain} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">{(['firstName', 'lastName'] as const).map(field => <div key={field}><label htmlFor={`edit-${field}`} className="block text-[11px] font-bold uppercase text-slate-600 mb-1">{field === 'firstName' ? 'First Name' : 'Last Name'} *</label><input id={`edit-${field}`} required value={form[field]} onChange={event => set(field, event.target.value)} aria-invalid={!!errors[field]} className={inputClass} />{fieldError(field)}</div>)}</div>
      <div className="grid grid-cols-2 gap-3"><div><label htmlFor="edit-department" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Department *</label><select id="edit-department" value={form.departmentId} disabled={departments.isPending || departments.isError} onChange={event => set('departmentId', event.target.value)} className={inputClass}>
        <option value="">Select department</option>{!departments.data?.some(row => row.id === employee.departmentId) && employee.department && <option value={employee.departmentId}>{employee.department.name}</option>}{departments.data?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{fieldError('departmentId')}
        {departments.isError && <p role="alert" className="text-xs text-rose-700">Unable to load departments.<button type="button" className={buttonClass} onClick={() => void departments.refetch()}>Retry departments</button></p>}</div>
        <div><label htmlFor="edit-designation" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Designation *</label><select id="edit-designation" value={form.designationId} disabled={designations.isPending || designations.isError} onChange={event => set('designationId', event.target.value)} className={inputClass}>
          <option value="">Select designation</option>{form.departmentId === employee.departmentId && employee.designation && !designations.data?.some(row => row.id === employee.designationId) && <option value={employee.designationId}>{employee.designation.title}</option>}{designations.data?.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>{fieldError('designationId')}
          {designations.isError && <p role="alert" className="text-xs text-rose-700">Unable to load designations.<button type="button" className={buttonClass} onClick={() => void designations.refetch()}>Retry designations</button></p>}</div></div>
      <div className="rounded-xl border border-slate-200 p-3 space-y-2"><label htmlFor="edit-manager-search" className="block text-[11px] font-bold uppercase text-slate-600">Search reporting managers</label><input id="edit-manager-search" type="search" maxLength={200} value={managerSearch} onChange={event => setManagerSearch(event.target.value)} className={inputClass} />
        <label htmlFor="edit-manager" className="block text-[11px] font-bold uppercase text-slate-600">Reporting Manager</label><select id="edit-manager" value={form.managerId || ''} disabled={managers.isPending || managers.isError || managerSearch.trim() !== managerQuery.search} onChange={event => { const row = managers.data?.items.find(row => row.id === event.target.value); set('managerId', row?.id || null); if (row) setManagerName(`${row.firstName} ${row.lastName}`); }} className={inputClass}>
          <option value="">No manager assigned</option>{form.managerId && !managers.data?.items.some(row => row.id === form.managerId) && <option value={form.managerId}>{managerName}</option>}{managers.data?.items.filter(row => row.id !== employee.id).map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} ({row.employeeCode})</option>)}</select>
        {managers.isError && <p role="alert" className="text-xs text-rose-700">Unable to load managers.<button type="button" className={buttonClass} onClick={() => void managers.refetch()}>Retry managers</button></p>}
        <div className="flex justify-between"><button type="button" disabled={managers.isFetching || managerQuery.page <= 1} className={buttonClass} onClick={() => setManagerQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous managers</button><button type="button" disabled={managers.isFetching || !managers.data || managerQuery.page >= managers.data.pagination.totalPages} className={buttonClass} onClick={() => setManagerQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next managers</button></div></div>
      {privateFields.filter(field => form[field] !== undefined).map(field => <div key={field}><label htmlFor={`edit-${field}`} className="block text-[11px] font-bold uppercase text-slate-600 mb-1">{labels[field]}</label><input id={`edit-${field}`} value={form[field] || ''} onChange={event => set(field, event.target.value)} className={inputClass} /></div>)}
      <div><label htmlFor="edit-status" className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Employment Status</label><select id="edit-status" value={form.status} onChange={event => set('status', event.target.value)} className={inputClass}>{Object.values(EmployeeStatus).map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>{fieldError('status')}</div>
      <p className="text-xs text-slate-500">Terminated and resigned employees lose linked account access and outstanding activation links. Other statuses preserve account access; returning to ACTIVE does not enable an inactive account.</p>
      {leaving && <label className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this employment change disables the linked account.</label>}
    </fieldset><div className="pt-3 border-t border-slate-100 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={buttonClass}>{uncertain ? 'Close and reload employee' : 'Cancel'}</button><button type="submit" disabled={busy || uncertain} className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md shadow-blue-600/20 disabled:opacity-50">{busy ? 'Saving employee...' : 'Save Changes'}</button></div></form>
  </>;
}
