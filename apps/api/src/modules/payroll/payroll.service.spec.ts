import { PayrollService } from './payroll.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PayrollService - Indian Statutory Calculations & Decimal Precision', () => {
  let service: PayrollService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      payrollCycle: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      employee: {
        findMany: jest.fn(),
      },
      payslip: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new PayrollService(mockPrisma as PrismaService);
  });

  it('should calculate statutory PF correctly with ₹15,000 statutory cap', () => {
    // When Basic + DA is ₹45,000 (above cap of ₹15,000), employee PF is capped at ₹1,800 (12% of 15,000)
    const breakdown = service.calculateStatutoryDeductions(
      45000, // Basic
      0,     // DA
      22500, // HRA
      15000, // Other Allowances
      true,  // PF applicable
      false, // ESI applicable
      true,  // PT applicable
      3200   // TDS
    );

    expect(breakdown.employeePfDeduction).toBe(1800);
    expect(breakdown.employerPfContribution).toBe(1800);
    expect(breakdown.professionalTax).toBe(208);
    expect(breakdown.employeeEsiDeduction).toBe(0); // ESI not applicable for > 21,000
    expect(breakdown.totalStatutoryDeductions).toBe(1800 + 0 + 208 + 3200);
  });

  it('should calculate ESI correctly for employees earning gross <= ₹21,000', () => {
    // Junior intern earning gross ₹18,000
    const basic = 10000;
    const hra = 5000;
    const other = 3000; // Total Gross = 18000
    const breakdown = service.calculateStatutoryDeductions(
      basic,
      0,
      hra,
      other,
      true,
      true,
      false,
      0
    );

    expect(breakdown.esiEligibleGross).toBe(18000);
    // 0.75% of 18000 = 135
    expect(breakdown.employeeEsiDeduction).toBe(135);
    // 3.25% of 18000 = 585
    expect(breakdown.employerEsiContribution).toBe(585);
  });
});
