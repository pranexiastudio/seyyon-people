import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CurrentTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId;
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new UnauthorizedException('Tenant context is missing from request');
    }
    return tenantId;
  },
);
