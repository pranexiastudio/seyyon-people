import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import { UserRole, AuditAction } from '@seyyon/shared';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ActivationService } from '../auth/activation.service';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';
import { canViewEmployeePrivate, EmployeeActor, employeeDetailsResponse, employeeDetailsSelect, employeeDirectoryResponse, employeeDirectorySelect } from './employee-response';
import { employeeConflictMessage, safeEmployeeError, safeEmployeeImportMessage } from './employee-errors';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService, private readonly activation: ActivationService) {}

  async resendInvitation(tenantId: string, employeeId: string) {
    return this.activation.invite(tenantId, employeeId);
  }

  async findAll(tenantId: string, query: EmployeeListQueryDto) {
    this.requireTenant(tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { employeeCode: 'asc' },
        select: employeeDirectorySelect,
      }),
    ]).catch(error => { throw safeEmployeeError(error); });

    return {
      items: items.map(employeeDirectoryResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(tenantId: string, id: string, requestingUser: EmployeeActor) {
    this.requireTenant(tenantId);
    const includePrivate = canViewEmployeePrivate(requestingUser, tenantId, id);
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      select: employeeDetailsSelect(includePrivate, tenantId),
    }).catch(error => { throw safeEmployeeError(error); });

    if (!employee) {
      throw new NotFoundException('Employee not found in this organization');
    }

    return employeeDetailsResponse(employee, includePrivate);
  }

  async create(tenantId: string, dto: CreateEmployeeDto, actorUser: EmployeeActor) {
    try { return await this.createEmployee(tenantId, dto, actorUser); }
    catch (error) { throw safeEmployeeError(error); }
  }

  private async createEmployee(tenantId: string, dto: CreateEmployeeDto, actorUser: EmployeeActor) {
    await this.validateReferences(tenantId, dto);
    const includePrivate = canViewEmployeePrivate(actorUser, tenantId);
    // 1. Check Tenant Subscription Employee Limit
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxEmployees: true, _count: { select: { employees: true } } },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant organization not found');
    }

    if (tenant._count.employees >= tenant.maxEmployees) {
      throw new ForbiddenException(`Employee limit reached for current subscription plan (${tenant.maxEmployees} seats). Please upgrade your plan.`);
    }

    // 2. Check duplicate email or code in this tenant
    const existingEmail = await this.prisma.employee.findFirst({
      where: { tenantId, email: dto.email.toLowerCase().trim() },
    });
    if (existingEmail) {
      throw new ConflictException(employeeConflictMessage);
    }

    // Auto-generate employee code if missing
    let code = dto.employeeCode;
    if (!code) {
      const count = tenant._count.employees + 1;
      code = `EMP-${count.toString().padStart(3, '0')}`;
    }

    // Provision the employee and login atomically; failed account creation must
    // not leave an orphan employee record.
    const employee = await this.prisma.$transaction(async tx => {
      const employee = await tx.employee.create({
        data: {
          tenantId,
          employeeCode: code,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          managerId: dto.managerId,
          employmentType: dto.employmentType || 'FULL_TIME',
          dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : new Date(),
          panNumber: dto.panNumber,
          bankAccount: dto.bankAccount,
          bankIfsc: dto.bankIfsc,
        },
        select: employeeDetailsSelect(includePrivate, tenantId),
      });

      // 4. Create User Login Account for Employee
      // Pending accounts have no usable password and cannot authenticate.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      await tx.user.create({
        data: {
          tenantId,
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.EMPLOYEE,
          employeeId: employee.id,
          isActive: false,
          activationPending: true,
        },
      });
      return employee;
    });

    // 5. Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorUser.id,
        userEmail: actorUser.email,
        action: AuditAction.CREATE,
        entityType: 'EMPLOYEE',
        entityId: employee.id,
        newValuesJson: { code: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}` },
      },
    }).catch(() => {});

    let activationInvitation: 'SENT' | 'RETRY_REQUIRED' = 'SENT';
    try { await this.activation.invite(tenantId, employee.id); }
    catch { activationInvitation = 'RETRY_REQUIRED'; }
    return { ...employeeDetailsResponse(employee, includePrivate), activationInvitation };
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto, actorUser: EmployeeActor) {
    try { return await this.updateEmployee(tenantId, id, dto, actorUser); }
    catch (error) { throw safeEmployeeError(error); }
  }

  private async updateEmployee(tenantId: string, id: string, dto: UpdateEmployeeDto, actorUser: EmployeeActor) {
    this.requireTenant(tenantId);
    const includePrivate = canViewEmployeePrivate(actorUser, tenantId, id);
    const { employee, updated } = await this.prisma.$transaction(async tx => {
      // Serialize hierarchy edits so two concurrent edits cannot introduce a cycle.
      if (dto.managerId !== undefined) {
        await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      }
      // Match activation's account lock order. Never locate a login by email.
      const linked = await tx.user.findFirst({ where: { employeeId: id, tenantId }, select: { id: true } });
      if (linked) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${linked.id} AND "tenantId" = ${tenantId} AND "employeeId" = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const employee = await tx.employee.findFirst({
        where: { id, tenantId }, select: { id: true, status: true, departmentId: true, designationId: true },
      });
      if (!employee) throw new NotFoundException('Employee not found in this organization');
      await this.validateReferences(tenantId, dto, tx);
      if (dto.departmentId !== undefined || dto.designationId !== undefined) {
        const designation = await tx.designation.findFirst({ where: { id: dto.designationId ?? employee.designationId, tenantId } });
        if (!designation || (designation.departmentId != null && designation.departmentId !== (dto.departmentId ?? employee.departmentId))) {
          throw new BadRequestException('Designation does not belong to the selected department');
        }
      }
      if (dto.managerId) {
        const seen = new Set([id]);
        let cursor: string | null = dto.managerId;
        while (cursor) {
          if (seen.has(cursor)) throw new BadRequestException('Invalid reporting hierarchy');
          seen.add(cursor);
          const manager = await tx.employee.findFirst({ where: { id: cursor, tenantId }, select: { managerId: true } });
          if (!manager) throw new BadRequestException('Invalid managerId for this organization');
          cursor = manager.managerId;
        }
      }
      const updated = await tx.employee.update({
        where: { id, tenantId },
        data: {
          firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone,
          departmentId: dto.departmentId, designationId: dto.designationId, managerId: dto.managerId,
          status: dto.status, emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone, address: dto.address,
        },
        select: employeeDetailsSelect(includePrivate, tenantId),
      });
      const offboarded = ['TERMINATED', 'RESIGNED'].includes(updated.status);
      if (linked && (offboarded || dto.firstName !== undefined || dto.lastName !== undefined)) {
        const changed = await tx.user.updateMany({
          where: { id: linked.id, tenantId, employeeId: id },
          data: { firstName: dto.firstName, lastName: dto.lastName,
            ...(offboarded ? { isActive: false, refreshTokenHash: null } : {}) },
        });
        if (changed.count !== 1) throw new ConflictException('Linked account changed. Reload the employee before retrying');
      }
      if (linked && offboarded) {
        await tx.employeeActivationToken.updateMany({ where: { userId: linked.id, tenantId, consumedAt: null }, data: { consumedAt: new Date() } });
      }
      // Returning to an employed status never activates an inactive or pending login.
      return { employee, updated };
    });

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorUser.id,
        userEmail: actorUser.email,
        action: AuditAction.UPDATE,
        entityType: 'EMPLOYEE',
        entityId: id,
        oldValuesJson: { status: employee.status },
        newValuesJson: { status: updated.status },
      },
    }).catch(() => {});

    return employeeDetailsResponse(updated, includePrivate);
  }

  async importBulk(tenantId: string, employees: CreateEmployeeDto[], actorUser: EmployeeActor) {
    const results = {
      total: employees.length,
      created: 0,
      failed: 0,
      invitationsPending: 0,
      errors: [] as { row: number; message: string }[],
    };

    for (let i = 0; i < employees.length; i++) {
      const row = employees[i];
      try {
        const created = await this.create(tenantId, row, actorUser);
        results.created++;
        if (created.activationInvitation === 'RETRY_REQUIRED') results.invitationsPending++;
      } catch (err: unknown) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          message: safeEmployeeImportMessage(err),
        });
      }
    }

    return results;
  }

  private async validateReferences(tenantId: string, dto: { departmentId?: string; designationId?: string; managerId?: string | null }, db: Prisma.TransactionClient = this.prisma) {
    this.requireTenant(tenantId);
    for (const [field, find] of [
      ['departmentId', (id: string) => db.department.findFirst({ where: { id, tenantId } })],
      ['designationId', (id: string) => db.designation.findFirst({ where: { id, tenantId } })],
      ['managerId', (id: string) => db.employee.findFirst({ where: { id, tenantId } })],
    ] as const) {
      const id = dto[field];
      if (field === 'managerId' && id === null) continue;
      if (id !== undefined && (typeof id !== 'string' || !id.trim()
        || !await find(id))) {
        throw new BadRequestException(`Invalid ${field} for this organization`);
      }
    }
  }

  private requireTenant(tenantId: string) {
    if (typeof tenantId !== 'string' || !tenantId.trim()) throw new ForbiddenException('Tenant context required');
  }
}
