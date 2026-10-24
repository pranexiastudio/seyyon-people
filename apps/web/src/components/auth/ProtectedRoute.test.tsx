import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserRole } from '@seyyon/shared';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
const auth = vi.hoisted(() => ({ status: 'restoring', user: null as null | { role: string }, retry: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
const setup = () => render(<MemoryRouter initialEntries={['/platform-admin']}><Routes>
  <Route path="/platform-admin" element={<ProtectedRoute role={UserRole.PLATFORM_SUPER_ADMIN}><p>Private registry</p></ProtectedRoute>} />
  <Route path="/login" element={<p>Login screen</p>} />
</Routes></MemoryRouter>);
describe('Protected routes', () => {
  it.each(['restoring', 'unavailable', 'anonymous'])('blocks content while %s even with a forged user object', status => {
    auth.status = status; auth.user = { role: 'PLATFORM_SUPER_ADMIN' }; setup();
    expect(screen.queryByText('Private registry')).not.toBeInTheDocument();
  });
  it('denies non-platform identities and permits a backend-confirmed platform identity', () => {
    auth.status = 'authenticated'; auth.user = { role: 'EMPLOYEE' }; const view = setup();
    expect(screen.getByRole('alert')).toHaveTextContent('do not have access'); view.unmount();
    auth.user = { role: 'PLATFORM_SUPER_ADMIN' }; setup(); expect(screen.getByText('Private registry')).toBeInTheDocument();
  });
});
