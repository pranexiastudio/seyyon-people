import { describe, expect, it, vi } from 'vitest';
import { createEmployeesApi } from './employees-api';
import { ApiError } from './auth-api';
import { CSV_COLUMNS, employeeCsvTemplate, parseEmployeeCsv, validateCsvRelationships } from './employee-csv';

const header = 'firstName,lastName,email,departmentId,designationId';
const valid = 'New,Person,new@example.com,d,j';
describe('Employee CSV parsing and validation', () => {
  it('generates a header-only template with supported fields and no personal sample data', () => {
    expect(employeeCsvTemplate()).toBe(CSV_COLUMNS.join(',') + '\r\n'); expect(employeeCsvTemplate()).not.toMatch(/bank|panNumber|password|tenantId/);
  });
  it('accepts BOM, CRLF, quoted commas and escaped quotes with real CSV line numbers', () => {
    const rows = parseEmployeeCsv('\uFEFF' + header + '\r\n\r\n"New, ""Junior""",Person,NEW@example.com,d,j\r\n');
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ line: 3, errors: [], data: { firstName: 'New, "Junior"', email: 'new@example.com', departmentId: 'd', designationId: 'j' } });
  });
  it.each(['', 'firstName,lastName\nNew,Person', header, header + ',bankAccount\n' + valid + ',private', header + ',firstName\n' + valid + ',other'])('rejects missing/unsupported/duplicate headers or empty files %#', csv => {
    expect(() => parseEmployeeCsv(csv)).toThrow(/Missing|Unsupported|Duplicate|no employee/);
  });
  it.each([header + '\n"Unclosed,Person,new@example.com,d,j', header + '\n"New"bad,Person,new@example.com,d,j', header + '\nN"ew,Person,new@example.com,d,j'])('rejects malformed quoting %#', csv => {
    expect(() => parseEmployeeCsv(csv)).toThrow(/quoted|quoting/);
  });
  it('flags malformed row lengths, required fields and email validation without reflecting submitted values', () => {
    const rows = parseEmployeeCsv(header + '\nNew,Person,bad,d\n,Person,invalid,d,j,extra');
    expect(rows.every(row => row.errors.length > 0)).toBe(true); expect(rows[0].errors).toContain('Column count does not match the header.');
    expect(JSON.stringify(rows.map(row => row.errors))).not.toContain('extra');
  });
  it('parses multiline fields but rejects them for employee fields and preserves subsequent line numbers', () => {
    const rows = parseEmployeeCsv(header + '\n"New\nName",Person,new@example.com,d,j\nOther,Person,other@example.com,d,j');
    expect(rows[0].errors).toContain('Employee fields must not contain line breaks.'); expect(rows[1].line).toBe(4);
  });
  it('detects normalized duplicate emails and trimmed exact employee codes on all affected rows', () => {
    const rows = parseEmployeeCsv(header + ',employeeCode\n' + valid + ',EMP-1\nOther,Person,NEW@example.com,d,j, EMP-1 ');
    rows.forEach(row => { expect(row.errors).toContain('Duplicate email within this CSV.'); expect(row.errors).toContain('Duplicate employeeCode within this CSV.'); });
  });
  it('validates optional employment types and strict calendar dates and omits blank optional fields', () => {
    const rows = parseEmployeeCsv(header + ',employmentType,dateOfJoining,managerId\n' + valid + ',BAD,2026-02-30,\nOther,Person,other@example.com,d,j,,,');
    expect(rows[0].errors).toContain('employmentType is missing or invalid.'); expect(rows[0].errors).toContain('dateOfJoining is missing or invalid.');
    expect(rows[1].errors).toEqual([]); expect(rows[1].data?.managerId).toBeUndefined();
  });
  it('limits row counts, bytes and invalid encodings before submission', () => {
    expect(() => parseEmployeeCsv(header + '\n' + Array(101).fill(valid).join('\n'))).toThrow('100');
    expect(() => parseEmployeeCsv('x'.repeat(65537))).toThrow('64 KiB');
    expect(() => parseEmployeeCsv(header + '\n' + valid + '\u0000')).toThrow('UTF-8');
  });
  it('validates scoped department/designation membership and manager IDs via existing APIs', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/departments') return [{ id: 'd', name: 'Engineering', code: 'ENG' }];
      if (path === '/departments/designations') return [{ id: 'j', title: 'Engineer', code: 'ENG', departmentId: 'other' }];
      if (path === '/employees/m') throw new ApiError(404);
      throw new Error('Unexpected API');
    });
    const rows = parseEmployeeCsv(header + ',managerId\n' + valid + ',m');
    const result = await validateCsvRelationships(rows, createEmployeesApi(request, 't'));
    expect(result[0].errors).toHaveLength(2); expect(request.mock.calls.every(call => call[1].headers['X-Tenant-Id'] === 't')).toBe(true);
  });
  it('does not treat lookup outages as confirmed invalid or empty lookup results', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError(503));
    await expect(validateCsvRelationships(parseEmployeeCsv(header + '\n' + valid), createEmployeesApi(request))).rejects.toBeInstanceOf(ApiError);
  });
  it('accepts an organization-wide designation with a valid department', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => path === '/departments' ? [{ id: 'd', name: 'Engineering', code: 'ENG' }] : [{ id: 'j', title: 'Engineer', code: 'ENG', departmentId: null }]);
    const result = await validateCsvRelationships(parseEmployeeCsv(header + '\n' + valid), createEmployeesApi(request)); expect(result[0].errors).toEqual([]);
  });
});
