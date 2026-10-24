import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, browserAuth, profile, ApiError } from './auth-api';
afterEach(() => vi.unstubAllGlobals());
describe('Browser authentication API', () => {
  it('uses JSON, credentials, CSRF header and no-store without token persistence', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', fetch);
    await browserAuth('refresh');
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/refresh', expect.objectContaining({
      credentials: 'include', cache: 'no-store', body: '{}',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'seyyon-browser' },
    }));
    await profile('test-access-token');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer test-access-token');
  });
  it('does not expose server diagnostics and refuses external API paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('//attacker.example')).rejects.toThrow('Invalid API path');
  });
});
