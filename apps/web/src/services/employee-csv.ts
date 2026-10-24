import { ApiError } from './auth-api';
import { createEmployeesApi, EmployeeCreateInput, employeeCreateSchema } from './employees-api';

export const MAX_CSV_BYTES = 64 * 1024;
export const MAX_CSV_ROWS = 100;
export const CSV_REQUIRED = ['firstName', 'lastName', 'email', 'departmentId', 'designationId'] as const;
export const CSV_COLUMNS = [...CSV_REQUIRED, 'employeeCode', 'phone', 'managerId', 'employmentType', 'dateOfJoining'] as const;
export const employeeCsvTemplate = () => CSV_COLUMNS.join(',') + '\r\n';
export type EmployeeCsvRow = { line: number; values: Record<string, string>; errors: string[]; data?: EmployeeCreateInput };

// Strict CSV reader: quoted commas, escaped quotes, CRLF, UTF-8 BOM and multiline
// fields are parsed without evaluating spreadsheet formulas or rendering HTML.
export function parseEmployeeCsv(text: string): EmployeeCsvRow[] {
  if (new Blob([text]).size > MAX_CSV_BYTES) throw new Error('CSV files must be 64 KiB or smaller.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(text)) throw new Error('Use a UTF-8 CSV file without invalid control characters.');
  text = text.replace(/^\uFEFF/, '');
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
  const finish = () => {
    cells.push(cell.trim());
    if (cells.length > 1 || cells[0]) records.push({ line: start, cells });
    if (records.length > MAX_CSV_ROWS + 1) throw new Error('Import at most 100 employees at a time.');
    cells = []; cell = ''; closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else { cell += char; if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++; }
      continue;
    }
    if (char === ',') { cells.push(cell.trim()); cell = ''; closed = false; }
    else if (char === '\n' || char === '\r') { finish(); if (char === '\r' && text[i + 1] === '\n') i++; line++; start = line; }
    else if (char === '"') { if (cell || closed) throw new Error(`Malformed CSV quoting at line ${line}.`); quoted = true; }
    else if (closed && char.trim()) throw new Error(`Unexpected text after a quoted field at line ${line}.`);
    else if (!closed) cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cells.length || cell || closed) finish();
  const header = records.shift()?.cells;
  if (!header || CSV_REQUIRED.some(field => !header.includes(field))) throw new Error('Missing required columns: firstName, lastName, email, departmentId, designationId.');
  if (new Set(header).size !== header.length) throw new Error('Duplicate CSV column names are not allowed.');
  if (header.some(field => !(CSV_COLUMNS as readonly string[]).includes(field))) throw new Error('Unsupported columns. Use the downloaded template; personal statutory and bank fields are not accepted.');
  if (!records.length) throw new Error('The CSV has no employee rows.');
  const rows = records.map(record => {
    const values = Object.fromEntries(header.map((field, index) => [field, record.cells[index] || '']));
    const errors: string[] = [];
    if (record.cells.length !== header.length) errors.push('Column count does not match the header.');
    if (record.cells.some(value => /[\r\n]/.test(value))) errors.push('Employee fields must not contain line breaks.');
    const input = Object.fromEntries(header.map(field => [field, values[field] || (CSV_REQUIRED.includes(field as typeof CSV_REQUIRED[number]) ? '' : undefined)]));
    const parsed = employeeCreateSchema.safeParse(input);
    if (!parsed.success) parsed.error.issues.forEach(issue => errors.push(`${String(issue.path[0])} is missing or invalid.`));
    return { line: record.line, values, errors, ...(parsed.success ? { data: parsed.data } : {}) };
  });
  for (const field of ['email', 'employeeCode'] as const) {
    const seen = new Map<string, EmployeeCsvRow[]>();
    rows.forEach(row => { const value = field === 'email' ? row.values[field]?.toLowerCase() : row.values[field]; if (value) seen.set(value, [...(seen.get(value) || []), row]); });
    seen.forEach(group => { if (group.length > 1) group.forEach(row => row.errors.push(`Duplicate ${field} within this CSV.`)); });
  }
  if (new Blob([JSON.stringify(rows.map(row => row.data || {}))]).size > MAX_CSV_BYTES) throw new Error('Mapped import payload exceeds 64 KiB. Split this CSV into smaller batches.');
  return rows;
}

export async function validateCsvRelationships(rows: EmployeeCsvRow[], api: ReturnType<typeof createEmployeesApi>, signal?: AbortSignal): Promise<EmployeeCsvRow[]> {
  const [departments, designations] = await Promise.all([api.departments(signal), api.designations(undefined, signal)]);
  const managers = [...new Set(rows.map(row => row.data?.managerId).filter((id): id is string => !!id))];
  const missing = new Set<string>(); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, managers.length) }, async () => {
    while (next < managers.length) {
      const id = managers[next++];
      try { await api.detail(id, signal); }
      catch (error) { if (error instanceof ApiError && error.status === 404) missing.add(id); else throw error; }
    }
  }));
  return rows.map(row => {
    const errors = [...row.errors];
    if (row.data) {
      if (!departments.some(department => department.id === row.data!.departmentId)) errors.push('departmentId is not available in this organization.');
      if (!designations.some(designation => designation.id === row.data!.designationId && (designation.departmentId === null || designation.departmentId === row.data!.departmentId))) errors.push('designationId must belong to the selected department or be organization-wide.');
      if (row.data.managerId && missing.has(row.data.managerId)) errors.push('managerId is not available in this organization.');
    }
    return { ...row, errors };
  });
}
