import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { UserRole, Permission } from '@seyyon/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If neither roles nor permissions are specified, allow access (open to authenticated user)
    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Access denied: unauthenticated request');
    }

    // Platform Super Admin has universal platform privileges
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      return true;
    }

    // Role check if required
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole) {
        throw new ForbiddenException(`Access denied: required role in [${requiredRoles.join(', ')}]`);
      }
    }

    // Permissions check if required
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions: string[] = user.permissions || [];
      const hasAllPermissions = requiredPermissions.every((perm) =>
        userPermissions.includes(perm)
      );

      // Company Admin inherently possesses all permissions within their tenant
      if (user.role === UserRole.COMPANY_ADMIN) {
        return true;
      }

      if (!hasAllPermissions) {
        throw new ForbiddenException(
          `Access denied: missing required permissions [${requiredPermissions.join(', ')}]`
        );
      }
    }

    return true;
  }
}
