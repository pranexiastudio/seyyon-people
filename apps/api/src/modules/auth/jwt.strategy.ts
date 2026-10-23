import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getJwtSecret } from '../../common/config/jwt.config';
import { resolvePermissions } from '../../common/config/role-permissions';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub: string; email: string; tenantId?: string; role: string; type?: string }) {
    if (!payload.sub || (payload.type && payload.type !== 'access')) {
      throw new UnauthorizedException('Invalid access token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        tenant: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            departmentId: true,
            designationId: true,
          },
        },
      },
    });

    if (!user || !user.isActive || user.tenant?.status === 'SUSPENDED'
      || (user.tenantId && !user.tenant) || (!user.tenantId && user.role !== 'PLATFORM_SUPER_ADMIN')) {
      throw new UnauthorizedException('User account is invalid or deactivated');
    }

    // Load role permissions if available
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role: user.role,
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
      },
      select: { permission: true, tenantId: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      employeeId: user.employeeId,
      permissions: resolvePermissions(user.role as any,
        rolePermissions.some(rp => rp.tenantId === user.tenantId)
          ? rolePermissions.filter(rp => rp.tenantId === user.tenantId) : rolePermissions),
    };
  }
}
