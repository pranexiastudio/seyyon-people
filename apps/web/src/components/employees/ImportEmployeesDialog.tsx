import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmploymentType } from '@seyyon/shared';
import { X } from 'lucide-react';
import { ApiError } from '../../services/auth-api';
import { createEmployeesApi, employeeImportError, EmployeeImportResult } from '../../services/employees-api';
import { CSV_COLUMNS, CSV_REQUIRED, EmployeeCsvRow, employeeCsvTemplate, MAX_CSV_BYTES, parseEmployeeCsv, validateCsvRelationships } from '../../services/employee-csv';

type Props = { api: ReturnType<typeof createEmployeesApi>; scope: (string | undefined)[]; organizationName: string; onClose: () => void; onCompleted: (result: EmployeeImportResult) => void; onUncertain: () => void };
const inputClass = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 disabled:opacity-50';
const buttonClass = 'px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read CSV.')); reader.readAsText(file, 'UTF-8'); });
}
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([employeeCsvTemplate()], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'seyyon-employee-template.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ImportEmployeesDialog({ api, scope, organizationName, onClose, onCompleted, onUncertain }: Props) {
  const [rows, setRows] = useState<EmployeeCsvRow[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [lookupFailed, setLookupFailed] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const parsedRows = useRef<EmployeeCsvRow[] | null>(null);
  const generation = useRef(0), mounted = useRef(true), locked = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; controller.current?.abort(); }; }, []);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current) onClose(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [onClose]);
  const validate = async (parsed: EmployeeCsvRow[], epoch: number) => {
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const checked = await validateCsvRelationships(parsed, api, controller.current.signal);
      if (mounted.current && epoch === generation.current) { setRows(checked); setLoading(false); }
    } catch {
      if (mounted.current && epoch === generation.current) { setError('Unable to verify organization lookup IDs. Retry validation before importing.'); setLookupFailed(true); setLoading(false); }
    }
  };
  const choose = async (files: FileList | null) => {
    if (locked.current || uncertain || result) return;
    const epoch = ++generation.current; controller.current?.abort(); parsedRows.current = null;
    setRows([]); setError(''); setReview(false); setLookupFailed(false); setLoading(false);
    if (!files?.length) return;
    const file = files[0];
    if (files.length !== 1 || !/\.csv$/i.test(file.name)) { setError('Select one .csv file.'); return; }
    if (file.size > MAX_CSV_BYTES) { setError('CSV files must be 64 KiB or smaller.'); return; }
    setLoading(true);
    let parsed: EmployeeCsvRow[];
    try { parsed = parseEmployeeCsv(await readFile(file)); }
    catch (failure) { if (mounted.current && epoch === generation.current) { setError(failure instanceof Error ? failure.message : 'Unable to read CSV.'); setLoading(false); } return; }
    if (!mounted.current || epoch !== generation.current) return;
    parsedRows.current = parsed; setRows(parsed);
    await validate(parsed, epoch);
  };
  const submit = async () => {
    if (locked.current || uncertain || result || !review || loading || lookupFailed || !rows.length || rows.some(row => row.errors.length || !row.data)) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const confirmed = await api.importEmployees(rows.map(row => row.data!));
      if (!mounted.current) return;
      setResult(confirmed); parsedRows.current = null;
      // Keep only the public preview fields after submitting personal CSV data.
      setRows(previous => previous.map(row => ({ line: row.line, values: { firstName: row.values.firstName, lastName: row.values.lastName, email: row.values.email, employeeCode: row.values.employeeCode }, errors: [] })));
      onCompleted(confirmed);
    } catch (failure) {
      if (!mounted.current) return;
      setError(employeeImportError(failure));
      if (!(failure instanceof ApiError && [400, 401, 403, 413].includes(failure.status))) { setUncertain(true); onUncertain(); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const valid = rows.length > 0 && !rows.some(row => row.errors.length || !row.data) && !loading && !lookupFailed;
  const rejected = new Map(result?.errors.map(row => [row.row, row.message]) || []);
  return <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="employee-import-title" className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
    <div className="flex items-center justify-between pb-4 border-b border-slate-100"><h3 id="employee-import-title" className="font-extrabold text-slate-900 text-base">Import Employees</h3><button aria-label="Close employee import" disabled={busy} onClick={onClose} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X size={18} /></button></div>
    <p className="mt-3 text-xs text-slate-600">Organization: {organizationName}</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}
    {!result && <fieldset disabled={busy || uncertain} className="mt-4 space-y-4">
      {!review && <>
        <button className={buttonClass} onClick={downloadTemplate}>Download CSV template</button>
        <div className="text-xs text-slate-600 space-y-2"><p>UTF-8 CSV, up to 100 employees and 64 KiB. Use the exact template headers. Required: {CSV_REQUIRED.join(', ')}.</p>
          <p>Use existing department, designation and manager IDs from this organization. A designation must belong to its department or be organization-wide. Managers must already exist; this import cannot link employees to other new rows.</p>
          <p>Optional: {CSV_COLUMNS.filter(field => !(CSV_REQUIRED as readonly string[]).includes(field)).join(', ')}. Blank employeeCode is assigned by the server. Blank managerId means no manager. Blank joining date uses the server date; otherwise use YYYY-MM-DD. Employment type: {Object.values(EmploymentType).join(', ')}; blank uses FULL_TIME.</p>
          <p>Do not include bank, statutory identifiers, home addresses or emergency contacts. Duplicate emails/codes within this CSV are blocked. Existing-record conflicts and seat limits are checked by the server during import.</p></div>
        <LookupIds api={api} scope={scope} />
        <label className="block text-xs font-semibold text-slate-700">Employee CSV<input aria-label="Employee CSV" type="file" accept=".csv,text/csv" onChange={event => void choose(event.target.files)} className={`${inputClass} mt-2`} /></label>
      </>}
      {loading && <p role="status" className="text-xs text-slate-500">Reading CSV and validating lookup IDs...</p>}
      {lookupFailed && <button className={buttonClass} disabled={loading} onClick={() => { if (!parsedRows.current) return; setError(''); setLookupFailed(false); setLoading(true); void validate(parsedRows.current, ++generation.current); }}>Retry validation</button>}
      {review && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2 text-xs text-amber-900"><p className="font-semibold">Review import: {rows.length} employees into {organizationName}.</p><p>This is a partial import. Accepted rows remain saved even if other rows fail. The server checks seat limits per row and attempts account invitations. Email failures leave accounts created and are reported as an aggregate count.</p><p>Confirm only after reviewing every row below. A lost connection can leave some rows saved; there is no automatic retry.</p></div>}
    </fieldset>}
    {result && <div className="mt-4 space-y-2 text-xs"><p role="status" className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">Server confirmed: {result.created} imported, {result.failed} rejected, {result.total} processed.</p><p>{result.invitationsPending} created accounts need invitation retry. The API does not identify those accounts or provide per-row delivery receipts.</p><p className="text-slate-500">Do not resubmit imported rows. Correct rejected rows in a new CSV. No existing records were edited by this import.</p></div>}
    {!!rows.length && <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl"><table className="w-full text-left text-xs" aria-label="CSV employee preview"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">CSV line</th><th className="p-3">Employee</th><th className="p-3">Work email / code</th>{!result && <th className="p-3">Assignments</th>}<th className="p-3">{result ? 'Server result' : 'Validation'}</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.line}><td className="p-3">{row.line}</td><td className="p-3 break-words">{row.values.firstName} {row.values.lastName}</td><td className="p-3 break-all">{row.values.email}<br />{row.values.employeeCode || 'Assigned by server'}</td>{!result && <td className="p-3 break-all">Department: {row.values.departmentId}<br />Designation: {row.values.designationId}<br />Manager: {row.values.managerId || 'Not assigned'}<br />{row.values.employmentType || 'FULL_TIME'} ? {row.values.dateOfJoining || 'Server joining date'}{row.values.phone && <><br />Phone provided</>}</td>}<td className="p-3">{result ? rejected.has(index + 1) ? <span className="text-rose-700">Rejected: {rejected.get(index + 1)}</span> : <span className="text-emerald-700">Imported</span> : row.errors.length ? <ul className="text-rose-700">{row.errors.map((message, i) => <li key={i}>{message}</li>)}</ul> : loading || lookupFailed ? 'Lookup validation pending' : 'Ready for review'}</td></tr>)}</tbody></table></div>}
    <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
      <button disabled={busy} className={buttonClass} onClick={onClose}>{result ? 'Done' : uncertain ? 'Close and check directory' : 'Cancel'}</button>
      {!result && review && !uncertain && <button disabled={busy} className={buttonClass} onClick={() => { setReview(false); setError(''); }}>Back to preview</button>}
      {!result && !uncertain && <button disabled={busy || !valid} onClick={() => review ? void submit() : setReview(true)} className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md shadow-blue-600/20 disabled:opacity-50">{busy ? 'Importing employees...' : review ? 'Confirm import' : 'Review import'}</button>}
    </div>
    {busy && <p role="status" className="mt-3 text-xs text-slate-500">Keep this dialog open. Employees and invitations are processed one row at a time.</p>}
  </section></div>;
}

function LookupIds({ api, scope }: Pick<Props, 'api' | 'scope'>) {
  const [open, setOpen] = useState(false), [departmentId, setDepartmentId] = useState(''), [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', page: 1 });
  useEffect(() => { const timer = setTimeout(() => setFilter(previous => previous.search === search.trim() ? previous : { search: search.trim(), page: 1 }), 300); return () => clearTimeout(timer); }, [search]);
  const departments = useQuery({ queryKey: ['employee-import-departments', ...scope], queryFn: ({ signal }) => api.departments(signal), enabled: open, retry: false });
  const designations = useQuery({ queryKey: ['employee-import-designations', ...scope], queryFn: ({ signal }) => api.designations(undefined, signal), enabled: open, retry: false });
  const managers = useQuery({ queryKey: ['employee-import-managers', ...scope, filter], queryFn: ({ signal }) => api.list({ ...filter, departmentId: '', status: '', limit: 20 }, signal), enabled: open, retry: false });
  return <div className="text-xs"><button className={buttonClass} onClick={() => setOpen(!open)}>{open ? 'Hide lookup IDs' : 'Show lookup IDs'}</button>{open && <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
    {(departments.isError || designations.isError || managers.isError) && <p role="alert">Unable to load lookup IDs.<button className={buttonClass} onClick={() => { void departments.refetch(); void designations.refetch(); void managers.refetch(); }}>Retry lookup IDs</button></p>}
    <label className="block">Department IDs<select aria-label="Import reference department" value={departmentId} onChange={event => setDepartmentId(event.target.value)} className={inputClass}><option value="">Select department for designations</option>{departments.data?.map(row => <option key={row.id} value={row.id}>{row.name}: {row.id}</option>)}</select></label>
    {departmentId && <ul className="space-y-1 break-all">{designations.data?.filter(row => row.departmentId === departmentId || row.departmentId === null).map(row => <li key={row.id}>{row.title}: <code>{row.id}</code></li>)}</ul>}
    <label className="block">Find manager IDs<input aria-label="Find manager IDs" type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} className={inputClass} /></label>
    {managers.isFetching ? <p>Loading manager IDs...</p> : <ul className="space-y-1 break-all">{managers.data?.items.map(row => <li key={row.id}>{row.firstName} {row.lastName} ({row.employeeCode}): <code>{row.id}</code></li>)}</ul>}
    <div className="flex gap-2"><button className={buttonClass} disabled={managers.isFetching || filter.page <= 1} onClick={() => setFilter(previous => ({ ...previous, page: previous.page - 1 }))}>Previous manager IDs</button><button className={buttonClass} disabled={managers.isFetching || !managers.data || filter.page >= managers.data.pagination.totalPages} onClick={() => setFilter(previous => ({ ...previous, page: previous.page + 1 }))}>Next manager IDs</button></div>
  </div>}</div>;
}
