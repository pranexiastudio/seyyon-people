import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDepartments(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId },
      include: {
        designations: true,
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(tenantId: string, data: { name: string; code: string; description?: string }) {
    const existing = await this.prisma.department.findUnique({
      where: { tenantId_code: { tenantId, code: data.code.toUpperCase().trim() } },
    });
    if (existing) {
      throw new ConflictException(`Department code ${data.code} already exists`);
    }

    return this.prisma.department.create({
      data: {
        tenantId,
        name: data.name.trim(),
        code: data.code.toUpperCase().trim(),
        description: data.description,
      },
    });
  }

  async getDesignations(tenantId: string, departmentId?: string) {
    return this.prisma.designation.findMany({
      where: {
        tenantId,
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { level: 'desc' },
    });
  }

  async createDesignation(tenantId: string, data: { title: string; code: string; departmentId?: string; level?: number }) {
    if (data.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: data.departmentId, tenantId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    const existing = await this.prisma.designation.findUnique({
      where: { tenantId_code: { tenantId, code: data.code.toUpperCase().trim() } },
    });
    if (existing) {
      throw new ConflictException(`Designation code ${data.code} already exists`);
    }

    return this.prisma.designation.create({
      data: {
        tenantId,
        title: data.title.trim(),
        code: data.code.toUpperCase().trim(),
        departmentId: data.departmentId,
        level: data.level || 1,
      },
    });
  }
}
