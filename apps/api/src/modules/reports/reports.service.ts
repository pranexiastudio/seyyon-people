import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHeadcountReport(tenantId: string) {
    const [total, byDepartment, byEmploymentType, byStatus] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.department.findMany({
        where: { tenantId },
        select: { name: true, _count: { select: { employees: true } } },
      }),
      this.prisma.employee.groupBy({
        by: ['employmentType'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return {
      totalEmployees: total,
      departmentBreakdown: byDepartment.map((d) => ({ department: d.name, count: d._count.employees })),
      employmentTypeBreakdown: byEmploymentType.map((e) => ({ type: e.employmentType, count: e._count })),
      statusBreakdown: byStatus.map((s) => ({ status: s.status, count: s._count })),
    };
  }

  async getAttendanceSummaryReport(tenantId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const records = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
      },
      _count: true,
    });

    return {
      month,
      year,
      breakdown: records.map((r) => ({ status: r.status, count: r._count })),
    };
  }

  async getPayrollSummaryReport(tenantId: string, year: number) {
    return this.prisma.payrollCycle.findMany({
      where: { tenantId, year },
      orderBy: { month: 'asc' },
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        totalGross: true,
        totalDeductions: true,
        totalNet: true,
        finalizedAt: true,
        _count: { select: { payslips: true } },
      },
    });
  }
}
