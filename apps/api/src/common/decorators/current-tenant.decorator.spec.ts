import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentTenantId } from './current-tenant.decorator';

describe('Validated tenant parameter', () => {
  class Controller {
    method(@CurrentTenantId() tenant: string) { return tenant; }
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Controller, 'method');
  const factory = (Object.values(metadata)[0] as any).factory;
  const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) });
  it('rejects absent context even for platform super admin and never falls back to user claims', () => {
    expect(() => factory(undefined, context({ user: { role: 'PLATFORM_SUPER_ADMIN' } }))).toThrow();
    expect(() => factory(undefined, context({ user: { tenantId: 'unvalidated' } }))).toThrow();
  });
  it('returns tenant context validated by the guard', () => {
    expect(factory(undefined, context({ tenantId: 'validated' }))).toBe('validated');
  });
});
