import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { AuditAction } from '@seyyon/shared';
import { getJwtSecret, getJwtRefreshSecret } from '../../common/config/jwt.config';
import { createHash, randomUUID } from 'crypto';

export const hashRefreshToken = (token: string) =>
  'sha256:' + createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email.toLowerCase().trim() },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            planTier: true,
            status: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive || (user.tenantId && !user.tenant)
      || (!user.tenantId && user.role !== 'PLATFORM_SUPER_ADMIN')) {
      throw new UnauthorizedException('This account has been deactivated. Please contact your organization administrator.');
    }

    if (user.tenant && user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your organization account is currently suspended. Please contact Pranexia Studio support.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      // Record failed login audit log
      if (user.tenantId) {
        await this.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            userEmail: user.email,
            action: AuditAction.LOGIN_FAILED,
            entityType: 'AUTH',
            ipAddress,
            userAgent,
          },
        }).catch(() => {});
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user);

    // Save refresh token hash and last login timestamp
    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
    });

    // Record successful login audit log
    if (user.tenantId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          userEmail: user.email,
          action: AuditAction.LOGIN,
          entityType: 'AUTH',
          ipAddress,
          userAgent,
        },
      }).catch(() => {});
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
        employeeId: user.employeeId,
        employee: user.employee,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: getJwtRefreshSecret(),
        algorithms: ['HS256'],
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });

      if (payload.type !== 'refresh' || !payload.jti || !user || !user.isActive
        || user.tenant?.status === 'SUSPENDED' || (user.tenantId && !user.tenant)
        || (!user.tenantId && user.role !== 'PLATFORM_SUPER_ADMIN')
        || !user.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh session');
      }

      // Legacy bcrypt sessions are deliberately invalidated: they cannot provide
      // full-token comparison due to bcrypt's 72-byte input limit. Log in again.
      const isRefreshTokenMatching = hashRefreshToken(refreshToken) === user.refreshTokenHash;
      if (!isRefreshTokenMatching) {
        throw new UnauthorizedException('Refresh token is invalid or has been revoked');
      }

      const tokens = await this.generateTokens(user);
      const newRefreshTokenHash = hashRefreshToken(tokens.refreshToken);
      const rotated = await this.prisma.user.updateMany({
        where: { id: user.id, isActive: true, refreshTokenHash: user.refreshTokenHash,
          ...(user.tenantId ? { tenant: { is: { status: { not: 'SUSPENDED' } } } } : {}) },
        data: { refreshTokenHash: newRefreshTokenHash },
      });
      if (rotated.count !== 1) throw new UnauthorizedException('Refresh session revoked');

      return tokens;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async logoutRefreshSession(token: string) {
    let payload: any;
    try {
      // Expired cookies can still revoke their exact stored session. No access is granted.
      payload = this.jwtService.verify(token, {
        secret: getJwtRefreshSecret(), algorithms: ['HS256'], ignoreExpiration: true,
      });
    } catch { return; }
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) return;
    await this.prisma.user.updateMany({
      where: { id: payload.sub, refreshTokenHash: hashRefreshToken(token) },
      data: { refreshTokenHash: null },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        tenantId: true, employeeId: true, avatarUrl: true, lastLoginAt: true,
        tenant: { select: { id: true, name: true, planTier: true, status: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
      employeeId: user.employeeId,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...payload, type: 'access' }, {
        secret: getJwtSecret(),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync({ ...payload, type: 'refresh', jti: randomUUID() }, {
        secret: getJwtRefreshSecret(),
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 mins in seconds
    };
  }
}
