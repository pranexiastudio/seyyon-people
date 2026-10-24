import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditEmployeeDialog } from './EditEmployeeDialog';
import { createEmployeesApi } from '../../services/employees-api';
import { ApiError } from '../../services/auth-api';

const raw = { id: 'e', tenantId: 't', employeeCode: 'EMP-001', firstName: 'Existing', lastName: 'Person', email: 'existing@example.com', avatarUrl: null,
  departmentId: 'd', designationId: 'j', managerId: 'm', department: { id: 'd', name: 'Engineering', code: 'ENG' }, designation: { id: 'j', title: 'Engineer', code: 'DEV' },
  manager: { id: 'm', firstName: 'Current', lastName: 'Manager' }, status: 'ACTIVE', employmentType: 'FULL_TIME', dateOfJoining: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', dateOfExit: null, subordinates: [] };
const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));
function setup(options: { failure?: number; pending?: Promise<unknown>; privateFields?: boolean; lookupFailure?: boolean } = {}) {
  const request = vi.fn().mockImplementation(async (path: string, init: RequestInit) => {
    if (init.method === 'PUT') { if (options.failure) throw new ApiError(options.failure); return options.pending || { ...raw, ...JSON.parse(init.body as string) }; }
    if (path === '/employees/e') return { ...raw, ...(options.privateFields ? { phone: '12345', address: 'Known address', emergencyContactName: 'Relative', emergencyContactPhone: '98765' } : {}) };
    if (path === '/departments') return [{ id: 'd', name: 'Engineering', code: 'ENG' }, { id: 'other', name: 'Sales', code: 'SALES' }];
    if (path.startsWith('/departments/designations?')) { if (options.lookupFailure) throw new ApiError(500); return path.endsWith('other') ? [{ id: 'other-job', title: 'Sales Representative', code: 'SR', departmentId: 'other' }] : [{ id: 'j', title: 'Engineer', code: 'DEV', departmentId: 'd' }]; }
    if (path.startsWith('/employees?')) return { items: [raw, { ...raw, id: 'm', firstName: 'Current', lastName: 'Manager' }], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } };
    throw new Error('Unexpected endpoint');
  });
  const onSaved = vi.fn(), onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><EditEmployeeDialog api={createEmployeesApi(request, 't')} scope={['user', 't']} employeeId="e" onSaved={onSaved} onClose={onClose} /></QueryClientProvider>);
  return { request, onSaved, onClose, ...view };
}
const puts = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(call => call[1].method === 'PUT');
async function ready() { await screen.findByLabelText('First Name *'); await screen.findByRole('option', { name: 'Engineer' }); }
describe('Employee edit form (mocked HTTP)', () => {
  it('loads real details and prepopulates IDs, names, status and current manager', async () => {
    setup(); expect(screen.getByText('Loading employee for editing...')).toBeInTheDocument(); await ready();
    expect(screen.getByLabelText('First Name *')).toHaveValue('Existing'); expect(screen.getByLabelText('Department *')).toHaveValue('d');
    expect(screen.getByLabelText('Designation *')).toHaveValue('j'); expect(screen.getByLabelText('Reporting Manager')).toHaveValue('m'); expect(screen.getByLabelText('Employment Status')).toHaveValue('ACTIVE');
    expect(screen.queryByLabelText('Home Address')).not.toBeInTheDocument(); expect(screen.queryByRole('option', { name: /Existing Person/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Work Email')).not.toBeInTheDocument();
  });
  it('only renders personal edit fields actually included by the server', async () => {
    setup({ privateFields: true }); await ready(); expect(screen.getByLabelText('Phone')).toHaveValue('12345'); expect(screen.getByLabelText('Home Address')).toHaveValue('Known address');
  });
  it('sends only changed supported fields, blocks double submits and waits for server confirmation', async () => {
    let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
    const { request, onSaved } = setup({ pending }); await ready();
    fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: ' Updated ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByRole('button', { name: 'Saving employee...' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('First Name *').closest('form')!); expect(puts(request)).toHaveLength(1); expect(onSaved).not.toHaveBeenCalled();
    expect(puts(request)[0][0]).toBe('/employees/e'); expect(JSON.parse(puts(request)[0][1].body)).toEqual({ firstName: 'Updated' });
    expect(puts(request)[0][1].headers['X-Tenant-Id']).toBe('t');
    await act(async () => resolve({ ...raw, firstName: 'Updated' })); expect(onSaved).toHaveBeenCalledOnce();
  });
  it('rejects blank names before sending an update', async () => {
    const { request } = setup(); await ready(); fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' })); expect(await screen.findByText('First name is required.')).toBeInTheDocument(); expect(puts(request)).toHaveLength(0);
  });
  it('requires a new valid designation after changing department', async () => {
    const { request } = setup(); await ready(); await screen.findByRole('option', { name: 'Sales' });
    fireEvent.change(screen.getByLabelText('Department *'), { target: { value: 'other' } }); await screen.findByRole('option', { name: 'Sales Representative' });
    expect(screen.getByLabelText('Designation *')).toHaveValue(''); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' })); expect(puts(request)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Designation *'), { target: { value: 'other-job' } }); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(puts(request)).toHaveLength(1)); expect(JSON.parse(puts(request)[0][1].body)).toEqual({ departmentId: 'other', designationId: 'other-job' });
  });
  it('supports removing a manager with explicit null', async () => {
    const { request } = setup(); await ready(); await waitFor(() => expect(screen.getByLabelText('Reporting Manager')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Reporting Manager'), { target: { value: '' } }); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(puts(request)).toHaveLength(1)); expect(JSON.parse(puts(request)[0][1].body)).toEqual({ managerId: null });
  });
  it.each(['TERMINATED', 'RESIGNED'])('requires confirmation before changing status to %s', async status => {
    const { request } = setup(); await ready(); fireEvent.change(screen.getByLabelText('Employment Status'), { target: { value: status } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' })); expect(await screen.findByText('Confirm the linked account will be disabled.')).toBeInTheDocument(); expect(puts(request)).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(puts(request)).toHaveLength(1)); expect(JSON.parse(puts(request)[0][1].body)).toEqual({ status });
  });
  it.each([400, 403, 404, 409])('displays safe server HTTP %s errors without success', async failure => {
    const { onSaved } = setup({ failure }); await ready(); fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid|permission|available|changed/); expect(onSaved).not.toHaveBeenCalled();
  });
  it('blocks repeating uncertain writes', async () => {
    const { onSaved } = setup({ failure: 500 }); await ready(); fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed'); expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled(); expect(onSaved).not.toHaveBeenCalled();
  });
  it('ignores a completed update after the editor is unmounted', async () => {
    let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
    const { unmount, onSaved } = setup({ pending }); await ready();
    fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    unmount(); await act(async () => resolve({ ...raw, lastName: 'Changed' })); expect(onSaved).not.toHaveBeenCalled();
  });
});
