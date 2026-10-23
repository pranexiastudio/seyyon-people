import { LeaveService } from './leave.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, Permission, LeaveStatus } from '@seyyon/shared';

describe('Leave Authorization & Scoping Security', () => {
  let leaveService: LeaveService;
  let permissionsGuard: PermissionsGuard;
  let mockPrisma: any;
  let reflector: Reflector;

  beforeEach(() => {
    mockPrisma = {
      leaveRequest: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      leaveBalance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
    };

    leaveService = new LeaveService(mockPrisma as PrismaService);
    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
  });

  const createMockContext = (user: any) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('PermissionsGuard on Leave Approval Endpoints', () => {
    it('should deny employees without leave:approve permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.LEAVE_APPROVE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-emp',
        role: UserRole.EMPLOYEE,
        permissions: ['leave:apply', 'leave:read'],
      });

      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow users possessing explicit leave:approve permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.LEAVE_APPROVE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-hr',
        role: UserRole.HR_ADMIN,
        permissions: [Permission.LEAVE_APPROVE],
      });

      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow Company Admin inherently within their tenant', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.LEAVE_APPROVE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-admin',
        role: UserRole.COMPANY_ADMIN,
        permissions: [],
      });

      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('LeaveService - Self-Approval & Cross-Tenant Boundary Enforcement', () => {
    it('should reject approval when the request belongs to a different tenant', async () => {
      // Attacker is in tenant-acme, attempting to approve request in tenant-globex
      mockPrisma.leaveRequest.findFirst.mockResolvedValue(null);

      await expect(
        leaveService.updateRequestStatus(
          'tenant-acme',
          'req-globex-001',
          LeaveStatus.APPROVED,
          'emp-acme-001'
        )
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.leaveRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'req-globex-001', tenantId: 'tenant-acme' },
        include: { leaveType: true },
      });
    });

    it('should reject employee attempting to approve their own leave request', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'req-001',
        tenantId: 'tenant-acme',
        employeeId: 'emp-001',
        status: LeaveStatus.PENDING,
        totalDays: 2,
        startDate: new Date('2026-11-01'),
        leaveTypeId: 'lt-01',
      });

      // Approver ID matches request employee ID
      await expect(
        leaveService.updateRequestStatus(
          'tenant-acme',
          'req-001',
          LeaveStatus.APPROVED,
          'emp-001' // same as request.employeeId
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should succeed when valid approver within same tenant approves employee request', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: 'req-001',
        tenantId: 'tenant-acme',
        employeeId: 'emp-applicant',
        status: LeaveStatus.PENDING,
        totalDays: 2,
        startDate: new Date('2026-11-01'),
        leaveTypeId: 'lt-01',
      });

      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        id: 'bal-01',
        pendingDays: 2,
        usedDays: 0,
        remainingDays: 10,
      });

      const result = await leaveService.updateRequestStatus(
        'tenant-acme',
        'req-001',
        LeaveStatus.APPROVED,
        'emp-manager-002',
        'Approved by team manager'
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
