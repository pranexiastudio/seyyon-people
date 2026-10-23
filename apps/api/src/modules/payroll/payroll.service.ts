import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollStatus, IndianStatutoryDeductionBreakdown, UserRole, Permission } from '@seyyon/shared';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  // Calculate Indian Statutory Components
  calculateStatutoryDeductions(
    basicSalary: number,
    da = 0,
    hra = 0,
    otherAllowances = 0,
    pfApplicable = true,
    esiApplicable = false,
    ptApplicable = true,
    tdsMonthly = 0
  ): IndianStatutoryDeductionBreakdown {
    const pfGross = basicSalary + da;
    const grossSalary = basicSalary + da + hra + otherAllowances;

    // PF: 12% of Basic + DA, statutory cap is ₹1,800 or actual
    let employeePf = 0;
    let employerPf = 0;
    if (pfApplicable) {
      const pfWageBase = Math.min(pfGross, 15000); // Standard statutory cap threshold
      employeePf = Math.round(pfWageBase * 0.12);
      employerPf = Math.round(pfWageBase * 0.12);
    }

    // ESI: 0.75% of Gross if Gross <= ₹21,000
    let employeeEsi = 0;
    let employerEsi = 0;
    if (esiApplicable || grossSalary <= 21000) {
      employeeEsi = Math.round(grossSalary * 0.0075 * 100) / 100;
      employerEsi = Math.round(grossSalary * 0.0325 * 100) / 100;
    }

    // Professional Tax: standard slab
    let professionalTax = 0;
    if (ptApplicable && grossSalary > 15000) {
      professionalTax = 208; // Average monthly PT
    }

    const totalStatutory = employeePf + employeeEsi + professionalTax + tdsMonthly;

    return {
      basicSalary,
      dearnessAllowance: da,
      pfGrossSalary: pfGross,
      employeePfDeduction: employeePf,
      employerPfContribution: employerPf,
      esiEligibleGross: grossSalary,
      employeeEsiDeduction: employeeEsi,
      employerEsiContribution: employerEsi,
      professionalTax,
      incomeTaxTds: tdsMonthly,
      totalStatutoryDeductions: totalStatutory,
    };
  }

  async getCycles(tenantId: string) {
    return this.prisma.payrollCycle.findMany({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async getCycleById(tenantId: string, cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, tenantId },
      include: {
        payslips: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
                department: true,
                designation: true,
              },
            },
          },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundException('Payroll cycle not found');
    }

    return cycle;
  }

  async executeMonthlyRun(tenantId: string, month: number, year: number, actorUserId: string) {
    const existing = await this.prisma.payrollCycle.findUnique({
      where: { tenantId_month_year: { tenantId, month, year } },
    });

    if (existing && existing.status === PayrollStatus.FINALIZED) {
      throw new BadRequestException('Payroll cycle for this month has already been finalized and cannot be reprocessed');
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const totalWorkingDays = endDate.getDate();

    // Fetch active employees with salary structures
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        salaryStructures: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const payslipData: any[] = [];

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const salary = emp.salaryStructures[0];

      const basic = salary ? Number(salary.basicSalary) : 35000;
      const hra = salary ? Number(salary.hra) : basic * 0.5;
      const da = salary ? Number(salary.da) : 0;
      const special = salary ? Number(salary.specialAllowance) : basic * 0.35;
      const conveyance = salary ? Number(salary.conveyance) : 3000;

      const deductions = this.calculateStatutoryDeductions(
        basic,
        da,
        hra,
        special + conveyance,
        salary ? salary.pfApplicable : true,
        salary ? salary.esiApplicable : false,
        salary ? salary.ptApplicable : true,
        salary ? Number(salary.tdsProjectedMonthly) : 0
      );

      const grossEarnings = basic + hra + da + special + conveyance;
      const totalEmpDeductions = deductions.totalStatutoryDeductions;
      const netPay = Math.round(grossEarnings - totalEmpDeductions);

      totalGross += grossEarnings;
      totalDeductions += totalEmpDeductions;
      totalNet += netPay;

      const payslipNumber = `PAY-${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`;

      payslipData.push({
        tenantId,
        employeeId: emp.id,
        payslipNumber,
        totalWorkingDays,
        daysPresent: totalWorkingDays,
        lossOfPayDays: 0,
        basicSalary: basic,
        hra,
        da,
        specialAllowance: special,
        otherAllowances: conveyance,
        grossEarnings,
        pfEmployee: deductions.employeePfDeduction,
        esiEmployee: deductions.employeeEsiDeduction,
        professionalTax: deductions.professionalTax,
        incomeTaxTds: deductions.incomeTaxTds,
        totalDeductions: totalEmpDeductions,
        netPay,
        paymentStatus: 'PENDING',
      });
    }

    // Upsert cycle
    const cycle = await this.prisma.payrollCycle.upsert({
      where: { tenantId_month_year: { tenantId, month, year } },
      update: {
        status: PayrollStatus.REVIEW,
        totalGross,
        totalDeductions,
        totalNet,
        processedById: actorUserId,
      },
      create: {
        tenantId,
        month,
        year,
        startDate,
        endDate,
        status: PayrollStatus.REVIEW,
        totalGross,
        totalDeductions,
        totalNet,
        processedById: actorUserId,
      },
    });

    // Delete non-finalized existing payslips for cycle
    await this.prisma.payslip.deleteMany({
      where: { tenantId, payrollCycleId: cycle.id },
    });

    // Insert new payslips
    for (const p of payslipData) {
      await this.prisma.payslip.create({
        data: {
          ...p,
          payrollCycleId: cycle.id,
        },
      });
    }

    return this.getCycleById(tenantId, cycle.id);
  }

  async finalizeCycle(tenantId: string, cycleId: string, actorUserId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, tenantId },
    });

    if (!cycle) {
      throw new NotFoundException('Payroll cycle not found');
    }

    if (cycle.status === PayrollStatus.FINALIZED) {
      throw new BadRequestException('Cycle has already been finalized');
    }

    const updated = await this.prisma.payrollCycle.update({
      where: { id: cycleId },
      data: {
        status: PayrollStatus.FINALIZED,
        approvedById: actorUserId,
        finalizedAt: new Date(),
      },
    });

    return updated;
  }

  async getMyPayslips(tenantId: string, employeeId: string) {
    if (!tenantId || !employeeId) throw new ForbiddenException('Tenant and employee profile required');
    return this.prisma.payslip.findMany({
      where: { tenantId, employeeId },
      include: {
        payrollCycle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayslipById(tenantId: string, id: string, user: any) {
    if (!tenantId || (user.role !== UserRole.PLATFORM_SUPER_ADMIN && user.tenantId !== tenantId)) {
      throw new ForbiddenException('Invalid tenant context');
    }
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          include: {
            department: true,
            designation: true,
          },
        },
        payrollCycle: true,
        tenant: true,
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    // Role check: employee can only view their own
    const canReadAll = user.role === UserRole.COMPANY_ADMIN
      || user.role === UserRole.PLATFORM_SUPER_ADMIN
      || user.permissions?.includes(Permission.PAYROLL_READ_ALL);
    if (!canReadAll && (!user.employeeId || payslip.employeeId !== user.employeeId)) {
      throw new ForbiddenException('You are not authorized to view another employee payslip');
    }

    return payslip;
  }
}
