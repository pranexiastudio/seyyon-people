import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

afterEach(() => vi.unstubAllGlobals());
describe('Authentication provider', () => {
  it('restores through backend validation under StrictMode and clears cached data on logout', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, operation: () => unknown) => operation() } });
    vi.stubGlobal('BroadcastChannel', class { onmessage = null; postMessage() {} close() {} });
    const response = (body: unknown) => ({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => response(path.endsWith('/me')
      ? { id: 'u', role: 'EMPLOYEE', permissions: [], tenant: null }
      : { accessToken: 'test-access', expiresIn: 900 })));
    const queryClient = new QueryClient();
    const Probe = () => { const auth = useAuth(); return <><p>{auth.status}</p><button onClick={() => void auth.logout()}>Logout</button></>; };
    render(<React.StrictMode><QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider></React.StrictMode>);
    await screen.findByText('authenticated');
    queryClient.setQueryData(['private', 'u'], { secret: 'test-data' });
    await act(async () => { screen.getByText('Logout').click(); });
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(queryClient.getQueryData(['private', 'u'])).toBeUndefined();
  });
});
