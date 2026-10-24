import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
const auth = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), status: 'anonymous', message: '' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(() => { auth.login.mockReset(); auth.message = ''; auth.status = 'anonymous'; });
const renderLogin = (from = '/') => render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}><Routes>
  <Route path="/login" element={<LoginPage />} /><Route path="/" element={<p>Workspace</p>} />
</Routes></MemoryRouter>);
describe('Real login UI', () => {
  it('has no default credentials or demo personas and does not navigate after rejection', async () => {
    auth.login.mockResolvedValue(false); renderLogin();
    expect(screen.getByLabelText('Work email')).toHaveValue(''); expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByText(/demo|persona/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'employee@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('employee@example.com', 'test-password'));
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });
  it('rejects an external redirect destination after successful login', async () => {
    auth.login.mockResolvedValue(true); renderLogin('//attacker.example');
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'employee@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Workspace')).toBeInTheDocument();
  });
});
