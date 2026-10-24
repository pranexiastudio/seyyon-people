import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportEmployeesDialog } from './ImportEmployeesDialog';
import { createEmployeesApi } from '../../services/employees-api';
import { ApiError } from '../../services/auth-api';
import { employeeCsvTemplate } from '../../services/employee-csv';

const csv = 'firstName,lastName,email,departmentId,designationId\nNew,Person,new@example.com,d,j';
const confirmed = { total: 1, created: 1, failed: 0, invitationsPending: 0, errors: [] };
const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });
function setup(options: { outcome?: object; failure?: number; pending?: Promise<unknown>; lookupFailure?: boolean } = {}) {
  const request = vi.fn().mockImplementation(async (path: string, init: RequestInit) => {
    if (init.method === 'POST') { if (options.failure) throw new ApiError(options.failure); return options.pending || options.outcome || confirmed; }
    if (options.lookupFailure) throw new ApiError(503);
    if (path === '/departments') return [{ id: 'd', name: 'Engineering', code: 'ENG' }];
    if (path === '/departments/designations') return [{ id: 'j', title: 'Engineer', code: 'DEV', departmentId: 'd' }];
    throw new Error('Unexpected endpoint');
  });
  const onCompleted = vi.fn(), onUncertain = vi.fn(), onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><ImportEmployeesDialog api={createEmployeesApi(request, 't')} scope={['u', 't']} organizationName="Organization One" onCompleted={onCompleted} onUncertain={onUncertain} onClose={onClose} /></QueryClientProvider>);
  return { request, onCompleted, onUncertain, onClose, ...view };
}
async function upload(text = csv) {
  fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File([text], 'employees.csv', { type: 'text/csv' })] } });
  await screen.findByText('Ready for review');
}
async function review(text = csv) { await upload(text); fireEvent.click(screen.getByRole('button', { name: 'Review import' })); }
const posts = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(call => call[1].method === 'POST');

describe('Employee CSV import workflow (mocked HTTP)', () => {
  it('downloads the supported template and displays column instructions', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:template');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Download CSV template' }));
    expect(createObjectURL).toHaveBeenCalledOnce(); expect(createObjectURL.mock.calls[0][0].size).toBe(new Blob([employeeCsvTemplate()]).size); expect(click).toHaveBeenCalled();
    expect(screen.getByText(/Required: firstName/)).toBeInTheDocument();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  });
  it('requires preview and explicit confirmation, locks duplicate submissions and only shows server-confirmed results', async () => {
    let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
    const { request, onCompleted } = setup({ pending }); await review(); expect(posts(request)).toHaveLength(0);
    expect(screen.getByText(/Review import: 1 employees into Organization One/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' })); expect(screen.getByRole('button', { name: 'Importing employees...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Importing employees...' })); expect(posts(request)).toHaveLength(1); expect(onCompleted).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Server confirmed:/)).not.toBeInTheDocument();
    expect(posts(request)[0][0]).toBe('/employees/bulk-import'); expect(posts(request)[0][1].headers['X-Tenant-Id']).toBe('t');
    expect(JSON.parse(posts(request)[0][1].body)).toEqual([{ firstName: 'New', lastName: 'Person', email: 'new@example.com', departmentId: 'd', designationId: 'j' }]);
    await act(async () => resolve(confirmed)); expect(await screen.findByText('Server confirmed: 1 imported, 0 rejected, 1 processed.')).toBeInTheDocument(); expect(onCompleted).toHaveBeenCalledWith(confirmed);
  });
  it('maps partial failure indices to original CSV lines and reports aggregate pending invitations honestly', async () => {
    setup({ outcome: { total: 2, created: 1, failed: 1, invitationsPending: 1, errors: [{ row: 2, message: 'Employee operation not permitted or organization seat limit reached' }] } });
    const text = csv + '\n\nOther,Person,other@example.com,d,j';
    fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File([text], 'employees.csv')] } });
    await waitFor(() => expect(screen.getAllByText('Ready for review')).toHaveLength(2)); fireEvent.click(screen.getByRole('button', { name: 'Review import' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    await screen.findByText('Server confirmed: 1 imported, 1 rejected, 2 processed.');
    expect(screen.getByText(/1 created accounts need invitation retry/)).toBeInTheDocument();
    const row = screen.getByText(/Rejected: Employee operation not permitted/).closest('tr')!; expect(within(row).getByText('4')).toBeInTheDocument(); expect(screen.getAllByText('Imported')).toHaveLength(1);
  });
  it('blocks invalid rows and duplicates rather than silently importing a subset', async () => {
    const { request } = setup();
    fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File([csv + '\nNew,Person,NEW@example.com,d,j'], 'employees.csv')] } });
    await screen.findAllByText('Duplicate email within this CSV.'); expect(screen.getByRole('button', { name: 'Review import' })).toBeDisabled(); expect(posts(request)).toHaveLength(0);
  });
  it('rejects oversized files before lookup requests', async () => {
    const { request } = setup(); fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File(['x'.repeat(65537)], 'large.csv')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('64 KiB'); expect(request).not.toHaveBeenCalled();
  });
  it('shows parsing errors for missing columns without posting', async () => {
    const { request } = setup(); fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File(['email\nnew@example.com'], 'bad.csv')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing required columns'); expect(posts(request)).toHaveLength(0);
  });
  it('requires successful lookup validation and allows retrying a read failure', async () => {
    const options = { lookupFailure: true }; const { request } = setup(options);
    fireEvent.change(screen.getByLabelText('Employee CSV'), { target: { files: [new File([csv], 'employees.csv')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify'); expect(screen.getByRole('button', { name: 'Review import' })).toBeDisabled();
    options.lookupFailure = false; fireEvent.click(screen.getByRole('button', { name: 'Retry validation' })); await screen.findByText('Ready for review'); expect(posts(request)).toHaveLength(0);
  });
  it.each([400, 403, 413])('shows a safe HTTP %s error without confirming any imported rows', async failure => {
    const { onCompleted } = setup({ failure }); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected|permitted/); expect(onCompleted).not.toHaveBeenCalled(); expect(screen.queryByText(/^Server confirmed:/)).not.toBeInTheDocument();
  });
  it('blocks retry after a lost response and refreshes for reconciliation without claiming success', async () => {
    const { request, onCompleted, onUncertain } = setup({ failure: 500 }); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unconfirmed'); expect(onCompleted).not.toHaveBeenCalled(); expect(onUncertain).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Close and check directory' })).toBeEnabled(); expect(posts(request)).toHaveLength(1);
  });
  it('does not claim success from an inconsistent server result', async () => {
    const { onCompleted, onUncertain } = setup({ outcome: { total: 1, created: 1, failed: 1, invitationsPending: 0, errors: [] } });
    await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unconfirmed'); expect(onCompleted).not.toHaveBeenCalled(); expect(onUncertain).toHaveBeenCalledOnce();
  });
  it('ignores completed imports after the dialog/session becomes obsolete', async () => {
    let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
    const { onCompleted, unmount } = setup({ pending }); await review(); fireEvent.click(screen.getByRole('button', { name: 'Confirm import' })); unmount();
    await act(async () => resolve(confirmed)); expect(onCompleted).not.toHaveBeenCalled();
  });
});
