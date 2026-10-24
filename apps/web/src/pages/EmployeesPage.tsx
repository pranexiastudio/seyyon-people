import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Upload, Users, X } from 'lucide-react';
import { EmployeeStatus, Permission, UserRole } from '@seyyon/shared';
import { useAuth } from '../context/AuthContext';
import { createEmployeesApi, employeeReadError, employeeTenantOptions, EmployeeCreated, EmployeeListQuery, EmployeeRow } from '../services/employees-api';

import { ImportEmployeesDialog } from '../components/employees/ImportEmployeesDialog';
import { EditEmployeeDialog } from '../components/employees/EditEmployeeDialog';
import { CreateEmployeeDialog } from '../components/employees/CreateEmployeeDialog';

const selectClass = 'py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const retryClass = 'ml-3 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50';
const initialFilters: EmployeeListQuery = { search: '', departmentId: '', status: '', page: 1, limit: 20 };
const statusClass: Record<EmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800', PROBATION: 'bg-blue-100 text-blue-800',
  NOTICE_PERIOD: 'bg-amber-100 text-amber-800', TERMINATED: 'bg-rose-100 text-rose-800', RESIGNED: 'bg-slate-100 text-slate-700',
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const StatusBadge = ({ status }: { status: EmployeeStatus }) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusClass[status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.replace(/_/g, ' ')}</span>;
const Avatar = ({ employee, large = false }: { employee: EmployeeRow; large?: boolean }) => employee.avatarUrl
  ? <img src={employee.avatarUrl} alt={employee.firstName} className={`${large ? 'h-14 w-14 ring-4 ring-blue-500/20' : 'h-9 w-9 ring-2 ring-slate-100 group-hover:ring-blue-400'} rounded-full object-cover shrink-0`} />
  : <span aria-hidden="true" className={`${large ? 'h-14 w-14' : 'h-9 w-9'} rounded-full bg-blue-50 text-blue-600 inline-flex items-center justify-center shrink-0`}><Users size={large ? 24 : 18} /></span>;

export const EmployeesPage: React.FC = () => {
  const { user, request } = useAuth();
  const queryClient = useQueryClient();
  const admin = user?.role === UserRole.COMPANY_ADMIN || user?.role === UserRole.PLATFORM_SUPER_ADMIN;
  const canCreate = admin || !!user?.permissions?.includes(Permission.EMPLOYEE_CREATE);
  const canEdit = admin || !!user?.permissions?.includes(Permission.EMPLOYEE_UPDATE);
  const [importContext, setImportContext] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; context: string } | null>(null);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const canResend = canCreate && (admin || !!user?.permissions?.includes(Permission.EMPLOYEE_UPDATE));
  const [creation, setCreation] = useState<{ receipt: EmployeeCreated | null; context: string } | null>(null);
  const [receipt, setReceipt] = useState<{ result: EmployeeCreated; context: string } | null>(null);
  const platform = user?.role === UserRole.PLATFORM_SUPER_ADMIN;
  const [selectedTenant, setSelectedTenant] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<EmployeeListQuery>(initialFilters);
  const [profileId, setProfileId] = useState<string | null>(null);
  const tenantId = platform ? selectedTenant : user?.tenantId || '';
  const context = `${user?.id}:${tenantId}`;
  const ready = !!user && !!tenantId;
  const scope = [user?.id, user?.role, tenantId];
  const api = useMemo(() => createEmployeesApi(request, platform ? tenantId : undefined), [request, platform, tenantId]);
  const pendingSearch = searchInput.trim() !== filters.search;

  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.search === searchInput.trim() ? previous : { ...previous, search: searchInput.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const organizations = useQuery({ queryKey: ['employee-organizations', user?.id],
    queryFn: ({ signal }) => employeeTenantOptions(request, signal), enabled: platform, retry: false });
  const departments = useQuery({ queryKey: ['employee-departments', ...scope],
    queryFn: ({ signal }) => api.departments(signal), enabled: ready, retry: false });
  const directory = useQuery({ queryKey: ['employee-directory', ...scope, filters],
    queryFn: ({ signal }) => api.list(filters, signal), enabled: ready, retry: false });
  const profile = useQuery({ queryKey: ['employee-profile', ...scope, profileId],
    queryFn: ({ signal }) => api.detail(profileId!, signal), enabled: ready && !!profileId, retry: false, staleTime: 0, gcTime: 0 });

  useEffect(() => {
    if (!profileId || editing || importContext) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileId(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [profileId, editing, importContext]);

  const changeFilter = (change: Partial<EmployeeListQuery>) => setFilters(previous => ({ ...previous, ...change, page: 1 }));
  const filtered = !!filters.search || !!filters.departmentId || !!filters.status;
  const loading = directory.isPending || directory.isFetching || pendingSearch;
  const data = !loading && !directory.isError ? directory.data : undefined;
  const pagination = data?.pagination;
  const resetFilters = () => { setSearchInput(''); setFilters(previous => ({ ...initialFilters, limit: previous.limit })); };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-1 flex-wrap items-center gap-3 max-w-2xl">
        {platform && <select aria-label="Organization" value={selectedTenant} disabled={!!creation || !!editing || !!importContext || organizations.isPending || organizations.isError}
          onChange={event => { setSelectedTenant(event.target.value); resetFilters(); setProfileId(null); setCreation(null); setReceipt(null); setEditing(null); setUpdateNotice(null); setImportContext(null); }} className={selectClass}>
          <option value="">Select organization</option>
          {organizations.data?.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select>}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search employees" type="search" placeholder="Search by name, code, email..." maxLength={200}
            value={searchInput} onChange={event => setSearchInput(event.target.value)} disabled={!ready}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" />
        </div>
        <select aria-label="Department" value={filters.departmentId} onChange={event => changeFilter({ departmentId: event.target.value })}
          disabled={!ready || departments.isPending || departments.isError} className={selectClass}>
          <option value="">{ready && departments.isPending ? 'Loading departments…' : 'All Departments'}</option>
          {departments.data?.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select aria-label="Employment status" value={filters.status} disabled={!ready} onChange={event => changeFilter({ status: event.target.value as EmployeeStatus | '' })} className={selectClass}>
          <option value="">All Statuses</option>{Object.values(EmployeeStatus).map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={!ready || !canCreate} onClick={() => { setProfileId(null); setImportContext(context); }} className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={14} /><span>Import CSV</span></button>
        <button disabled={!ready || !canCreate} onClick={() => { setProfileId(null); setCreation({ receipt: null, context }); }} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"><UserPlus size={14} /><span>Add Employee</span></button>
      </div>
    </div>

    {importContext === context && ready && canCreate && <ImportEmployeesDialog key={context} api={api} scope={scope} organizationName={(platform ? organizations.data?.find(tenant => tenant.id === tenantId)?.name : user?.tenant?.name) || 'Current organization'}
      onClose={() => setImportContext(null)} onCompleted={result => { if (result.created > 0) { void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); void queryClient.invalidateQueries({ queryKey: ['employee-departments', ...scope] }); } }}
      onUncertain={() => { void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); }} />}
    {updateNotice === context && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">Employee updated successfully.</p>}
    {editing && editing.context === context && ready && canEdit && <EditEmployeeDialog key={`${context}:${editing.id}`} api={api} scope={scope} employeeId={editing.id}
      onClose={() => { setEditing(null); void queryClient.invalidateQueries({ queryKey: ['employee-profile', ...scope] }); void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); }}
      onSaved={() => { setEditing(null); setUpdateNotice(context); void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); void queryClient.invalidateQueries({ queryKey: ['employee-profile', ...scope] }); void queryClient.invalidateQueries({ queryKey: ['employee-departments', ...scope] }); }} />}
    {receipt && receipt.context === context && <div role="status" className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">Employee account created. {receipt.result.activationInvitation === 'SENT' ? 'Invitation sent.' : 'Invitation needs retry.'}{canCreate && <button className={retryClass} onClick={() => setCreation({ receipt: receipt.result, context })}>Manage invitation</button>}</div>}
    {creation && creation.context === context && ready && canCreate && <CreateEmployeeDialog key={context} api={api} scope={scope} canResend={canResend} initialResult={creation.receipt}
      onClose={() => { setCreation(null); void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); }}
      onCreated={result => { setReceipt({ result, context }); void queryClient.invalidateQueries({ queryKey: ['employee-directory', ...scope] }); }}
      onInvitationUpdate={result => setReceipt({ result, context })} />}
    {platform && organizations.isPending && <p role="status" className="text-xs text-slate-500">Loading organizations…</p>}
    {platform && organizations.isError && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{employeeReadError(organizations.error, 'organizations')}<button className={retryClass} onClick={() => void organizations.refetch()}>Retry organizations</button></div>}
    {platform && organizations.isSuccess && !organizations.data.length && <p className="text-xs text-slate-500">No organizations are available.</p>}
    {ready && departments.isError && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{employeeReadError(departments.error, 'departments')}<button className={retryClass} onClick={() => void departments.refetch()}>Retry departments</button></div>}

    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2"><h3 className="font-bold text-slate-900 text-sm">Staff Directory</h3>
          {pagination && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">{pagination.total} Members</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Employee directory" aria-busy={ready && loading}>
          <thead><tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            <th className="py-3.5 px-6">Employee</th><th className="py-3.5 px-4">Code</th><th className="py-3.5 px-4">Department & Role</th><th className="py-3.5 px-4">Reporting Manager</th><th className="py-3.5 px-4">Status</th><th className="py-3.5 px-6 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {!ready ? <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">{platform ? 'Select an organization to view its employees.' : 'Organization context is unavailable.'}</td></tr>
              : loading ? <tr><td colSpan={6} role="status" className="px-6 py-10 text-center text-slate-500">Loading employees…</td></tr>
              : directory.isError ? <tr><td colSpan={6} className="px-6 py-10 text-center"><div role="alert" className="text-rose-700">{employeeReadError(directory.error, 'employees')}<button className={retryClass} onClick={() => void directory.refetch()}>Retry employees</button></div></td></tr>
              : data?.items.length === 0 ? <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                {pagination && pagination.page > pagination.totalPages && pagination.page > 1 ? <>This page has no employees.<button className={retryClass} onClick={() => setFilters(previous => ({ ...previous, page: 1 }))}>Back to first page</button></>
                  : filtered ? <>No employees match your search or filters.<button className={retryClass} onClick={resetFilters}>Clear filters</button></> : 'No employees yet.'}
              </td></tr>
              : data?.items.map(employee => <tr key={employee.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer group" onClick={() => setProfileId(employee.id)}>
                <td className="py-3.5 px-6"><div className="flex items-center gap-3"><Avatar employee={employee} /><div><p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{employee.firstName} {employee.lastName}</p><p className="text-[11px] text-slate-400">{employee.email}</p></div></div></td>
                <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">{employee.employeeCode}</td>
                <td className="py-3.5 px-4"><p className="font-medium text-slate-800">{employee.designation ?? 'Not provided'}</p><p className="text-[11px] text-slate-400">{employee.department ?? 'Not provided'}</p></td>
                <td className="py-3.5 px-4 text-slate-600">{employee.manager ?? <span className="text-slate-400 italic">Not assigned</span>}</td>
                <td className="py-3.5 px-4"><StatusBadge status={employee.status} /></td>
                <td className="py-3.5 px-6 text-right"><button onClick={event => { event.stopPropagation(); setProfileId(employee.id); }} aria-label={`View profile for ${employee.firstName} ${employee.lastName}`} className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-semibold text-xs transition-colors">View Profile</button></td>
              </tr>)}
          </tbody>
        </table>
      </div>
      {ready && <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-2">Rows per page<select aria-label="Rows per page" className={selectClass} value={filters.limit} onChange={event => changeFilter({ limit: Number(event.target.value) })}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        {pagination && <span>{pagination.total ? `${data?.items.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–${data?.items.length ? Math.min(pagination.page * pagination.limit, pagination.total) : 0} of ${pagination.total} · Page ${pagination.page} of ${pagination.totalPages}` : '0 employees'}</span>}
        <div className="flex items-center gap-2"><button className={`${retryClass} disabled:opacity-40`} disabled={loading || directory.isError || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button>
          <button className={`${retryClass} disabled:opacity-40`} disabled={loading || directory.isError || !pagination || filters.page >= pagination.totalPages || filters.page >= 1000000} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button></div>
      </div>}
    </div>

    {profileId && ready && !editing && <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="employee-profile-title" className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-4 border-b border-slate-100"><h3 id="employee-profile-title" className="font-extrabold text-slate-900 text-base">Employee Profile</h3><button aria-label="Close employee profile" onClick={() => setProfileId(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
        {profile.isFetching || profile.isPending ? <p role="status" className="mt-4 text-xs text-slate-500">Loading employee profile…</p>
          : profile.isError ? <div role="alert" className="mt-4 text-xs text-rose-700">{employeeReadError(profile.error, 'profile')}<button className={retryClass} onClick={() => void profile.refetch()}>Retry profile</button></div>
          : profile.data && <>
            <div className="flex items-center gap-3.5 mt-4"><Avatar employee={profile.data} large /><div><h4 className="font-extrabold text-slate-900 text-base">{profile.data.firstName} {profile.data.lastName}</h4><p className="text-xs text-blue-600 font-semibold">{profile.data.designation ?? 'Not provided'}</p><p className="text-[11px] text-slate-400">{profile.data.department ?? 'Not provided'}</p></div></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
              <div><dt className="text-slate-400 font-medium">Employee Code</dt><dd className="font-mono font-bold text-slate-800">{profile.data.employeeCode}</dd></div>
              <div><dt className="text-slate-400 font-medium">Date of Joining</dt><dd className="font-bold text-slate-800">{dateLabel(profile.data.dateOfJoining)}</dd></div>
              <div><dt className="text-slate-400 font-medium">Reporting Manager</dt><dd className="font-bold text-slate-800">{profile.data.manager ?? 'Not assigned'}</dd></div>
              <div><dt className="text-slate-400 font-medium">Employment Type</dt><dd className="font-bold text-slate-800">{profile.data.employmentType.replace(/_/g, ' ')}</dd></div>
              <div className="col-span-2"><dt className="text-slate-400 font-medium">Work Email</dt><dd className="font-bold text-slate-800 break-all">{profile.data.email}</dd></div>
              <div><dt className="text-slate-400 font-medium mb-1">Status</dt><dd><StatusBadge status={profile.data.status} /></dd></div>
              {profile.data.dateOfExit && <div><dt className="text-slate-400 font-medium">Date of Exit</dt><dd className="font-bold text-slate-800">{dateLabel(profile.data.dateOfExit)}</dd></div>}
            </dl>
          </>}
        <div className="mt-5 flex justify-end gap-2">{canEdit && profile.data && !profile.isFetching && !profile.isError && <button className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg" onClick={() => { setUpdateNotice(null); setEditing({ id: profileId, context }); }}>Edit Employee</button>}<button onClick={() => setProfileId(null)} className="px-4 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg">Done</button></div>
      </section>
    </div>}
  </div>;
};
