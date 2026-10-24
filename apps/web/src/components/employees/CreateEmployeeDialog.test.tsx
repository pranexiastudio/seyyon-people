import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateEmployeeDialog } from './CreateEmployeeDialog';
import { createEmployeesApi } from '../../services/employees-api';
import { ApiError } from '../../services/auth-api';

const saved = { id: 'employee-real', employeeCode: 'EMP-123', firstName: 'New', lastName: 'Person', email: 'new@example.com', activationInvitation: 'SENT' as const };
const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); });
function setup(options: { outcome?: 'SENT' | 'RETRY_REQUIRED'; failure?: number; pending?: Promise<unknown>; receipt?: boolean; canResend?: boolean; resendFailure?: number } = {}) {
  const request = vi.fn().mockImplementation(async (path: string) => {
    if (path === '/departments') return [{ id: 'dept', name: 'Engineering', code: 'ENG' }];
    if (path.startsWith('/departments/designations?')) return [{ id: 'job', title: 'Engineer', code: 'DEV', departmentId: 'dept' }];
    if (path.startsWith('/employees?')) return { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    if (path.endsWith('/activation-invitation')) { if (options.resendFailure) throw new ApiError(options.resendFailure); return { message: 'Invitation sent.' }; }
    if (path === '/employees') { if (options.failure) throw new ApiError(options.failure); return options.pending || { ...saved, activationInvitation: options.outcome || 'SENT' }; }
    throw new Error('Unexpected endpoint');
  });
  const onCreated = vi.fn(), onInvitationUpdate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><CreateEmployeeDialog api={createEmployeesApi(request, 'tenant')} scope={['user', 'tenant']} canResend={options.canResend ?? true}
    initialResult={options.receipt ? { ...saved, activationInvitation: 'RETRY_REQUIRED' } : null} onClose={vi.fn()} onCreated={onCreated} onInvitationUpdate={onInvitationUpdate} /></QueryClientProvider>);
  return { request, onCreated, onInvitationUpdate };
}
async function fill() {
  await screen.findByRole('option', { name: 'Engineering' });
  fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: ' New ' } });
  fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Person' } });
  fireEvent.change(screen.getByLabelText('Work Email *'), { target: { value: 'NEW@example.com' } });
  fireEvent.change(screen.getByLabelText('Department *'), { target: { value: 'dept' } });
  await screen.findByRole('option', { name: 'Engineer' });
  fireEvent.change(screen.getByLabelText('Designation *'), { target: { value: 'job' } });
}
describe('Employee creation and invitation (mocked HTTP)', () => {
  it('validates required fields without posting', async () => {
    const { request } = setup(); await screen.findByRole('option', { name: 'Engineering' });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Send Invite' }));
    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
    expect(request.mock.calls.some(call => call[0] === '/employees')).toBe(false);
  });
  it('posts real lookup IDs, normalizes input, locks duplicate submissions and waits for confirmation', async () => {
    let resolve!: (value: unknown) => void; const pending = new Promise(r => { resolve = r; });
    const { request, onCreated } = setup({ pending }); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Send Invite' }));
    expect(screen.getByRole('button', { name: 'Creating employee...' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('First Name *').closest('form')!);
    expect(request.mock.calls.filter(call => call[0] === '/employees')).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
    const init = request.mock.calls.find(call => call[0] === '/employees')![1];
    expect(JSON.parse(init.body)).toEqual({ firstName: 'New', lastName: 'Person', email: 'new@example.com', departmentId: 'dept', designationId: 'job', employmentType: 'FULL_TIME' });
    expect(init.headers['X-Tenant-Id']).toBe('tenant');
    await act(async () => resolve(saved));
    expect(await screen.findByText(/Employee created. Invitation sent/)).toBeInTheDocument(); expect(onCreated).toHaveBeenCalledWith(saved);
  });
  it.each([400, 403, 409])('shows safe HTTP %s errors without a success state', async failure => {
    const { onCreated } = setup({ failure }); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Save & Send Invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid|permission|limit|already|conflict/i);
    expect(onCreated).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Save & Send Invite' })).toBeEnabled();
  });
  it('keeps the saved account when delivery fails and retries only the invitation after cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { request, onInvitationUpdate } = setup({ outcome: 'RETRY_REQUIRED' }); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Send Invite' }));
    expect(await screen.findByText(/account exists.*not sent/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation again' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/Employee created. Invitation sent/)).toBeInTheDocument();
    expect(request.mock.calls.filter(call => call[0] === '/employees')).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('/employees/employee-real/activation-invitation', expect.objectContaining({ method: 'POST' }));
    expect(onInvitationUpdate).toHaveBeenCalledWith(saved);
  });
  it.each([429, 503])('reports invitation retry HTTP %s without claiming delivery', async resendFailure => {
    vi.useFakeTimers({ shouldAdvanceTime: true }); setup({ receipt: true, resendFailure });
    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation again' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.queryByText(/Invitation sent. Ask/)).not.toBeInTheDocument();
  });
  it('requires update permission for invitation retry', () => {
    setup({ receipt: true, canResend: false }); expect(screen.getByText(/creation and update permissions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry available|Send invitation again/ })).not.toBeInTheDocument();
  });
  it('blocks repeating an uncertain creation and directs the user to check the directory', async () => {
    setup({ failure: 500 }); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Save & Send Invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the directory');
    expect(screen.getByRole('button', { name: 'Save & Send Invite' })).toBeDisabled();
  });
});
