import { DepartmentsService } from './departments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, Permission } from '@seyyon/shared';

describe('Departments & Designations Authorization & Tenant Scoping', () => {
  let service: DepartmentsService;
  let permissionsGuard: PermissionsGuard;
  let mockPrisma: any;
  let reflector: Reflector;

  beforeEach(() => {
    mockPrisma = {
      department: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      designation: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new DepartmentsService(mockPrisma as PrismaService);
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

  describe('PermissionsGuard on Department Creation', () => {
    it('should deny employee without department:manage from creating a department', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.DEPARTMENT_MANAGE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-emp',
        role: UserRole.EMPLOYEE,
        permissions: [],
      });

      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny employee without designation:manage from creating a designation', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.DESIGNATION_MANAGE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-emp',
        role: UserRole.EMPLOYEE,
        permissions: [Permission.DEPARTMENT_MANAGE], // missing designation:manage
      });

      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow user with required permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === 'permissions') return [Permission.DEPARTMENT_MANAGE];
        return null;
      });

      const ctx = createMockContext({
        id: 'u-hr',
        role: UserRole.HR_ADMIN,
        permissions: [Permission.DEPARTMENT_MANAGE],
      });

      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('DepartmentsService - Target Record Tenant Validation', () => {
    it('should reject creating designation if target departmentId belongs to another tenant', async () => {
      // Alien department check returns null
      mockPrisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.createDesignation('tenant-acme', {
          title: 'Senior Engineer',
          code: 'SR-ENG',
          departmentId: 'dept-globex-alien',
        })
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-globex-alien', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.designation.create).not.toHaveBeenCalled();
    });

    it('should allow creating designation when target department belongs to authenticated tenant', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({
        id: 'dept-acme-eng',
        tenantId: 'tenant-acme',
        name: 'Engineering',
      });
      mockPrisma.designation.findUnique.mockResolvedValue(null);
      mockPrisma.designation.create.mockResolvedValue({
        id: 'desig-01',
        title: 'Senior Engineer',
        code: 'SR-ENG',
        departmentId: 'dept-acme-eng',
        tenantId: 'tenant-acme',
      });

      const result = await service.createDesignation('tenant-acme', {
        title: 'Senior Engineer',
        code: 'SR-ENG',
        departmentId: 'dept-acme-eng',
      });

      expect(result.id).toBe('desig-01');
      expect(mockPrisma.designation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-acme',
            departmentId: 'dept-acme-eng',
          }),
        })
      );
    });
  });
});
