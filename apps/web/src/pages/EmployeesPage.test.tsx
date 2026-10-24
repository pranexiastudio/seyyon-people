import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeesPage } from './EmployeesPage';
import { ApiError } from '../services/auth-api';

const auth = vi.hoisted(() => ({ request: vi.fn(), user: { id: 'user-1', tenantId: 'tenant-1' as string | null, role: 'COMPANY_ADMIN' } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
const departmentId = 'cb87a9af-36f5-4c6c-b2d2-04a78214a306';
const rawEmployee = (overrides: Record<string, unknown> = {}) => ({
  id: 'e-1', tenantId: 'tenant-1', employeeCode: 'EMP-101', firstName: 'API', lastName: 'Person', email: 'api.person@example.com',
  avatarUrl: null, departmentId, designationId: 'j-1', managerId: null,
  department: { id: departmentId, name: 'Research', code: 'RND' }, designation: { id: 'j-1', title: 'Research Engineer', code: 'RE' }, manager: null,
  status: 'PROBATION', employmentType: 'FULL_TIME', dateOfJoining: '2026-02-01T00:00:00.000Z',
  createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', ...overrides,
});
const listResponse = (items = [rawEmployee()], page = 1, limit = 20, total = items.length) => ({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
let clients: QueryClient[];
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><EmployeesPage /></QueryClientProvider>);
};
const listCalls = () => auth.request.mock.calls.filter(call => call[0].startsWith('/employees?'));
const latestParams = () => { const calls = listCalls(); return new URLSearchParams(calls[calls.length - 1][0].split('?')[1]); };
beforeEach(() => {
  clients = []; auth.user = { id: 'user-1', tenantId: 'tenant-1', role: 'COMPANY_ADMIN' };
  auth.request.mockReset().mockImplementation(async (path: string) => {
    if (path === '/departments') return [{ id: departmentId, name: 'Research', code: 'RND' }];
    if (path === '/tenants/platform/all') return [{ id: 'tenant-2', name: 'Second Organization', status: 'ACTIVE' }];
    if (path.startsWith('/employees?')) return listResponse();
    return { ...rawEmployee({ firstName: 'Detailed', email: 'detail@example.com' }), dateOfExit: null, subordinates: [] };
  });
});
afterEach(() => { clients.forEach(client => client.clear()); vi.useRealTimers(); });

describe('Real read-only Employees directory', () => {
  it('opens editing from real details and refreshes both directory and profile after saving', async () => {
    let firstName = 'Existing';
    auth.request.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/departments') return [{ id: departmentId, name: 'Research', code: 'RND' }];
      if (path.startsWith('/departments/designations?')) return [{ id: 'j-1', title: 'Research Engineer', code: 'RE', departmentId }];
      if (path.startsWith('/employees?')) return listResponse([rawEmployee({ firstName })]);
      if (path === '/employees/e-1') {
        if (init.method === 'PUT') firstName = JSON.parse(init.body as string).firstName;
        return { ...rawEmployee({ firstName }), dateOfExit: null, subordinates: [] };
      }
      throw new Error('Unexpected endpoint');
    });
    setup(); await screen.findByText('Existing Person'); fireEvent.click(screen.getByRole('button', { name: 'View profile for Existing Person' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Employee' }));
    expect(await screen.findByLabelText('First Name *')).toHaveValue('Existing');
    await screen.findByRole('option', { name: 'Research Engineer' });
    fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Updated' } });
    const before = listCalls().length; fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('Employee updated successfully.')).toBeInTheDocument();
    expect(await within(screen.getByRole('dialog', { name: 'Employee Profile' })).findByText('Updated Person')).toBeInTheDocument();
    expect(await within(screen.getByRole('table')).findByText('Updated Person')).toBeInTheDocument(); expect(listCalls().length).toBeGreaterThan(before);
  });
  it('does not offer editing to an employee without update permission', async () => {
    auth.user.role = 'EMPLOYEE'; setup(); await screen.findByText('API Person');
    fireEvent.click(screen.getByRole('button', { name: 'View profile for API Person' }));
    await screen.findByText('Detailed Person'); expect(screen.queryByRole('button', { name: 'Edit Employee' })).not.toBeInTheDocument();
  });
  it('refreshes the real directory after creation and preserves the invitation receipt on close', async () => {
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') return [{ id: departmentId, name: 'Research', code: 'RND' }];
      if (path.startsWith('/departments/designations?')) return [{ id: 'j-1', title: 'Research Engineer', code: 'RE', departmentId }];
      if (path.startsWith('/employees?')) return listResponse();
      if (path === '/employees') return { id: 'new-id', employeeCode: 'EMP-102', firstName: 'New', lastName: 'Person', email: 'new@example.com', activationInvitation: 'RETRY_REQUIRED' };
      throw new Error('Unexpected endpoint');
    });
    setup(); await screen.findByText('API Person'); fireEvent.click(screen.getByRole('button', { name: 'Add Employee' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('First Name *'), { target: { value: 'New' } });
    fireEvent.change(dialog.getByLabelText('Last Name *'), { target: { value: 'Person' } });
    fireEvent.change(dialog.getByLabelText('Work Email *'), { target: { value: 'new@example.com' } });
    await dialog.findByRole('option', { name: 'Research' });
    fireEvent.change(dialog.getByLabelText('Department *'), { target: { value: departmentId } });
    await dialog.findByRole('option', { name: 'Research Engineer' });
    fireEvent.change(dialog.getByLabelText('Designation *'), { target: { value: 'j-1' } });
    const before = listCalls().length;
    fireEvent.click(dialog.getByRole('button', { name: 'Save & Send Invite' }));
    expect(await dialog.findByText(/account exists.*not sent/)).toBeInTheDocument();
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
    fireEvent.click(dialog.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Employee account created. Invitation needs retry/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage invitation' }));
    expect(await screen.findByRole('dialog', { name: 'Employee account created' })).toBeInTheDocument();
    expect(auth.request.mock.calls.filter(call => call[0] === '/employees')).toHaveLength(1);
  });
  it('does not enable creation for an employee without create permission', async () => {
    auth.user.role = 'EMPLOYEE'; setup(); await screen.findByText('API Person');
    expect(screen.getByRole('button', { name: 'Add Employee' })).toBeDisabled();
  });
  it('opens real creation lookups without changing directory data or posting immediately', async () => {
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') return [{ id: departmentId, name: 'Research', code: 'RND' }];
      if (path.startsWith('/employees?')) return listResponse();
      throw new Error('Unexpected endpoint');
    });
    setup(); await screen.findByText('API Person'); fireEvent.click(screen.getByRole('button', { name: 'Add Employee' }));
    expect(await screen.findByRole('dialog', { name: 'Onboard New Employee' })).toBeInTheDocument();
    expect(screen.getByLabelText('First Name *')).toHaveValue('');
    expect(auth.request.mock.calls.every(call => call[1].method === 'GET')).toBe(true);
  });
  it('shows loading, then maps API records without demo data or enabled mutation controls', async () => {
    const pending = deferred<ReturnType<typeof listResponse>>();
    auth.request.mockImplementation(async (path: string) => path.startsWith('/employees?') ? pending.promise : []);
    setup(); expect(screen.getByText('Loading employees…')).toBeInTheDocument();
    expect(screen.queryByText('No employees yet.')).not.toBeInTheDocument();
    pending.resolve(listResponse());
    expect(await screen.findByText('API Person')).toBeInTheDocument(); expect(screen.getByText('Research Engineer')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('PROBATION')).toBeInTheDocument(); expect(screen.getByText('1 Members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Employee' })).toBeEnabled(); expect(screen.getByRole('button', { name: 'Import CSV' })).toBeDisabled();
    expect(screen.queryByText(/Alex Morgan|150 Seats|Acme Technologies/)).not.toBeInTheDocument();
    expect(auth.request.mock.calls.every(call => call[1].method === 'GET')).toBe(true);
  });

  it('debounces search and sends the search to the server rather than filtering local records', async () => {
    setup(); await screen.findByText('API Person');
    const initial = listCalls().length;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search employees' }), { target: { value: 'not a local match' } });
    expect(listCalls()).toHaveLength(initial);
    await waitFor(() => expect(latestParams().get('search')).toBe('not a local match'));
    // The API remains authoritative even if a returned record doesn't locally match.
    expect(await screen.findByText('API Person')).toBeInTheDocument();
  });

  it('populates department options and sends department/status filters with page reset', async () => {
    setup(); await screen.findByRole('option', { name: 'Research' }); await screen.findByText('API Person');
    fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), { target: { value: departmentId } });
    await waitFor(() => expect(latestParams().get('departmentId')).toBe(departmentId));
    fireEvent.change(screen.getByRole('combobox', { name: 'Employment status' }), { target: { value: 'RESIGNED' } });
    await waitFor(() => expect(latestParams().get('status')).toBe('RESIGNED'));
    expect(latestParams().get('page')).toBe('1');
  });

  it('uses server pagination metadata and resets the page on page-size/filter changes', async () => {
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') return [{ id: departmentId, name: 'Research', code: 'RND' }];
      const params = new URLSearchParams(path.split('?')[1]); return listResponse([rawEmployee()], Number(params.get('page')), Number(params.get('limit')), 45);
    });
    setup(); await screen.findByText('45 Members');
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); await screen.findByText(/Page 2 of 3/);
    expect(latestParams().get('page')).toBe('2'); expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } });
    await waitFor(() => expect(latestParams().get('limit')).toBe('50')); await screen.findByText(/Page 1 of 1/);
    expect(latestParams().get('page')).toBe('1'); expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '20' } }); await screen.findByText(/Page 1 of 3/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); await screen.findByText(/Page 2 of 3/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Employment status' }), { target: { value: 'ACTIVE' } });
    await waitFor(() => expect(latestParams().get('status')).toBe('ACTIVE')); expect(latestParams().get('page')).toBe('1');
  });

  it('loads profiles from the detail endpoint and does not display unauthorized/private fields', async () => {
    const pending = deferred<object>();
    const base = auth.request.getMockImplementation()!;
    auth.request.mockImplementation((path: string, init: unknown) => path === '/employees/e-1' ? pending.promise : base(path, init));
    setup(); await screen.findByText('API Person'); fireEvent.click(screen.getByRole('button', { name: 'View profile for API Person' }));
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('Loading employee profile…')).toBeInTheDocument();
    expect(within(dialog).queryByText('API Person')).not.toBeInTheDocument();
    pending.resolve({ ...rawEmployee({ firstName: 'Detailed', address: 'private-home', bankAccount: 'private-bank' }), dateOfExit: null, subordinates: [] });
    expect(await within(dialog).findByText('Detailed Person')).toBeInTheDocument(); expect(within(dialog).getByText('EMP-101')).toBeInTheDocument();
    expect(within(dialog).queryByText(/private-|encrypted|CEO/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([403, 500])('shows HTTP %s directory errors rather than successful empty results and supports retry', async status => {
    let fail = true; auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') return [];
      if (fail) throw new ApiError(status); return listResponse();
    });
    setup(); expect(await screen.findByRole('alert')).toHaveTextContent(status === 403 ? 'permission' : 'Unable to load employees');
    expect(screen.queryByText('No employees yet.')).not.toBeInTheDocument(); fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry employees' })); expect(await screen.findByText('API Person')).toBeInTheDocument();
  });

  it('distinguishes empty directory from filtered no-results and can clear filters', async () => {
    auth.request.mockResolvedValue(listResponse([]));
    // Lookup shape is different from list shape.
    auth.request.mockImplementation(async (path: string) => path === '/departments' ? [] : listResponse([]));
    setup(); expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Employment status' }), { target: { value: 'ACTIVE' } });
    expect(await screen.findByText('No employees match your search or filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
  });

  it('keeps department lookup errors visible while allowing the directory to load', async () => {
    let fail = true; auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') { if (fail) throw new Error('offline'); return [{ id: departmentId, name: 'Research', code: 'RND' }]; }
      return listResponse();
    });
    setup(); expect(await screen.findByText('API Person')).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Unable to load departments');
    expect(screen.getByRole('combobox', { name: 'Department' })).toBeDisabled(); fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry departments' })); expect(await screen.findByRole('option', { name: 'Research' })).toBeInTheDocument();
  });

  it('shows detail failures and retries the actual detail endpoint', async () => {
    let fail = true; const base = auth.request.getMockImplementation()!;
    auth.request.mockImplementation((path: string, init: unknown) => path === '/employees/e-1'
      ? fail ? Promise.reject(new ApiError(404)) : Promise.resolve({ ...rawEmployee({ firstName: 'Recovered' }), dateOfExit: null, subordinates: [] }) : base(path, init));
    setup(); await screen.findByText('API Person'); fireEvent.click(screen.getByRole('button', { name: 'View profile for API Person' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available'); fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry profile' })); expect(await screen.findByText('Recovered Person')).toBeInTheDocument();
  });

  it('does not let an older search response overwrite the newest results', async () => {
    const older = deferred<ReturnType<typeof listResponse>>();
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/departments') return [];
      const search = new URLSearchParams(path.split('?')[1]).get('search');
      if (search === 'older') return older.promise;
      return listResponse([rawEmployee({ firstName: search === 'newer' ? 'Newest' : 'Initial' })]);
    });
    setup(); await screen.findByText('Initial Person');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'older' } }); await waitFor(() => expect(latestParams().get('search')).toBe('older'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'newer' } }); await screen.findByText('Newest Person');
    await act(async () => { older.resolve(listResponse([rawEmployee({ firstName: 'Outdated' })])); });
    expect(screen.getByText('Newest Person')).toBeInTheDocument(); expect(screen.queryByText('Outdated Person')).not.toBeInTheDocument();
  });

  it('requires explicit platform organization selection and sends tenant headers', async () => {
    auth.user = { id: 'platform', tenantId: null, role: 'PLATFORM_SUPER_ADMIN' }; setup();
    await screen.findByRole('option', { name: 'Second Organization' }); expect(listCalls()).toHaveLength(0);
    expect(screen.getByText('Select an organization to view its employees.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Organization' }), { target: { value: 'tenant-2' } });
    await screen.findByText('API Person');
    expect(listCalls()[0][1].headers).toEqual({ 'X-Tenant-Id': 'tenant-2' });
    expect(auth.request.mock.calls.find(call => call[0] === '/departments')![1].headers).toEqual({ 'X-Tenant-Id': 'tenant-2' });
  });
});
