import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import { UserRole, AuditAction } from '@seyyon/shared';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { search?: string; departmentId?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
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
        include: {
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, title: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      items: items.map((emp) => this.sanitizeEmployee(emp, false)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(tenantId: string, id: string, requestingUser: any) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        department: true,
        designation: true,
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        subordinates: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found in this organization`);
    }

    const isSelf = requestingUser.employeeId === employee.id;
    const isHrOrAdmin = [UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN, UserRole.PLATFORM_SUPER_ADMIN].includes(requestingUser.role);

    return this.sanitizeEmployee(employee, isSelf || isHrOrAdmin);
  }

  async create(tenantId: string, dto: CreateEmployeeDto, actorUser: any) {
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
      throw new ConflictException(`An employee with email ${dto.email} already exists in your organization`);
    }

    // Auto-generate employee code if missing
    let code = dto.employeeCode;
    if (!code) {
      const count = tenant._count.employees + 1;
      code = `EMP-${count.toString().padStart(3, '0')}`;
    }

    // 3. Create Employee Record
    const employee = await this.prisma.employee.create({
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
      include: {
        department: true,
        designation: true,
      },
    });

    // 4. Create User Login Account for Employee
    const defaultPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: UserRole.EMPLOYEE,
        employeeId: employee.id,
      },
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

    return this.sanitizeEmployee(employee, true);
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto, actorUser: any) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        departmentId: dto.departmentId,
        designationId: dto.designationId,
        managerId: dto.managerId,
        status: dto.status,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        address: dto.address,
      },
      include: {
        department: true,
        designation: true,
      },
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

    return this.sanitizeEmployee(updated, true);
  }

  async importBulk(tenantId: string, employees: CreateEmployeeDto[], actorUser: any) {
    const results = {
      total: employees.length,
      created: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (let i = 0; i < employees.length; i++) {
      const row = employees[i];
      try {
        await this.create(tenantId, row, actorUser);
        results.created++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          email: row.email,
          message: err.message || 'Validation error',
        });
      }
    }

    return results;
  }

  private sanitizeEmployee(employee: any, includeSensitive = false) {
    if (includeSensitive) return employee;
    const { panNumber, aadharNumber, uanNumber, bankAccount, bankIfsc, ...safe } = employee;
    return safe;
  }
}
