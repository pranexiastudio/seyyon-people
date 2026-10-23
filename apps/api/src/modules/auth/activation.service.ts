import { BadRequestException, GoneException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivationMailService } from './activation-mail.service';
import { ActivateAccountDto } from './dto/activate-account.dto';

export const hashActivationToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new BadRequestException('This activation link is invalid or no longer available. Request a new invitation from your administrator.');
const deliveryFailed = () => new ServiceUnavailableException('Invitation could not be sent. Please try again later.');
const eligible = (user: any, tenantId: string) => user && user.tenantId === tenantId
  && user.tenant && user.tenant.status !== 'SUSPENDED' && !user.isActive
  && user.activationPending && user.lastLoginAt === null && user.employee?.tenantId === tenantId
  && ['ACTIVE', 'PROBATION'].includes(user.employee.status);
const include = { tenant: true, employee: true } as const;

@Injectable()
export class ActivationService {
  constructor(private readonly prisma: PrismaService, private readonly mail: ActivationMailService) {}

  async invite(tenantId: string, employeeId: string) {
    if (!tenantId || !employeeId) throw invalid();
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashActivationToken(token);
    const now = new Date();
    let recipient: string;
    try {
      recipient = await this.prisma.$transaction(async tx => {
        const target = await tx.user.findFirst({ where: { employeeId, tenantId }, include });
        if (!target) throw invalid();
        // Serialize all invitations/redemptions for this account across API instances.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target.id} FOR UPDATE`;
        const user = await tx.user.findFirst({ where: { id: target.id, tenantId, employeeId }, include });
        if (!eligible(user, tenantId)) throw invalid();
        const old = await tx.employeeActivationToken.findUnique({ where: { userId: user.id } });
        const inWindow = old && now.getTime() - old.requestWindowStart.getTime() < 3600000;
        if (old && (now.getTime() - old.lastRequestedAt.getTime() < 60000
          || (inWindow && old.requestCount >= 5))) {
          throw new HttpException('Too many invitations. Please try again later.', 429);
        }
        const data = { tenantId, tokenHash, expiresAt: new Date(now.getTime() + 86400000),
          sentAt: null, consumedAt: null, lastRequestedAt: now,
          requestWindowStart: inWindow ? old.requestWindowStart : now,
          requestCount: inWindow ? old.requestCount + 1 : 1 };
        // A single row per user replaces every previous outstanding token.
        await tx.employeeActivationToken.upsert({ where: { userId: user.id },
          create: { ...data, userId: user.id }, update: data });
        return user.email;
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof HttpException) throw error;
      throw deliveryFailed();
    }
    try {
      await this.mail.sendInvitation(recipient, token);
      const delivered = await this.prisma.employeeActivationToken.updateMany({
        where: { tokenHash, tenantId, consumedAt: null, sentAt: null, expiresAt: { gt: new Date() } },
        data: { sentAt: new Date() },
      });
      if (delivered.count !== 1) throw deliveryFailed();
    } catch {
      // A failed/uncertain SMTP delivery must never leave a redeemable token.
      await this.prisma.employeeActivationToken.updateMany({
        where: { tokenHash, tenantId, consumedAt: null }, data: { consumedAt: new Date() },
      }).catch(() => undefined);
      throw deliveryFailed();
    }
    return { message: 'Invitation sent. Ask the employee to check their email.' };
  }

  async activate(dto: ActivateAccountDto) {
    const tokenHash = hashActivationToken(dto.token);
    try {
      // Check existence first to avoid costly password hashing for random tokens.
      const record = await this.prisma.employeeActivationToken.findUnique({ where: { tokenHash } });
      if (!record || record.consumedAt || !record.sentAt) throw invalid();
      if (record.expiresAt <= new Date()) throw new GoneException('This activation link has expired. Request a new invitation from your administrator.');
      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE`;
        const user = await tx.user.findFirst({ where: { id: record.userId, tenantId: record.tenantId }, include });
        if (!eligible(user, record.tenantId)) throw invalid();
        const now = new Date();
        const consumed = await tx.employeeActivationToken.updateMany({
          where: { id: record.id, tokenHash, tenantId: record.tenantId, userId: user.id,
            consumedAt: null, sentAt: { not: null }, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw invalid();
        const activated = await tx.user.updateMany({
          where: { id: user.id, tenantId: record.tenantId, isActive: false, activationPending: true,
            lastLoginAt: null, tenant: { is: { status: { not: 'SUSPENDED' } } },
            employee: { is: { tenantId: record.tenantId, status: { in: ['ACTIVE', 'PROBATION'] } } } },
          data: { passwordHash, isActive: true, activationPending: false, refreshTokenHash: null },
        });
        if (activated.count !== 1) throw invalid();
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof GoneException) throw error;
      throw new ServiceUnavailableException('Activation is temporarily unavailable. Please try again later.');
    }
    return { message: 'Account activated. You can now sign in with your chosen password.' };
  }
}
