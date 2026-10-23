import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { TaskPriority } from '@seyyon/shared';

describe('Tasks Cross-Tenant Security & Tenant Isolation', () => {
  let service: TasksService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      taskComment: {
        create: jest.fn(),
      },
      project: {
        findFirst: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
      },
    };

    service = new TasksService(mockPrisma as PrismaService);
  });

  describe('Task Comments Cross-Tenant Scoping (addComment)', () => {
    it('should reject adding comment to task belonging to a different tenant', async () => {
      // Attacker in tenant-acme tries to comment on taskId belonging to tenant-globex
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.addComment('tenant-acme', 'task-globex-999', 'user-001', 'Malicious comment')
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-globex-999', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('should succeed adding comment to task belonging to authenticated tenant', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-acme-001',
        tenantId: 'tenant-acme',
        title: 'Q4 Budget Review',
      });
      mockPrisma.taskComment.create.mockResolvedValue({
        id: 'tc-01',
        taskId: 'task-acme-001',
        authorId: 'emp-001',
        content: 'Review in progress',
      });

      const result = await service.addComment(
        'tenant-acme',
        'task-acme-001',
        'emp-001',
        'Review in progress'
      );

      expect(result.id).toBe('tc-01');
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-acme-001',
          authorId: 'emp-001',
          content: 'Review in progress',
        },
      });
    });
  });

  describe('Task Creation Foreign Key Validation (createTask)', () => {
    it('should reject creating task if referenced projectId belongs to another tenant', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.createTask(
          'tenant-acme',
          {
            title: 'Unauthorized Task',
            projectId: 'proj-alien-tenant',
            priority: TaskPriority.HIGH,
          },
          'user-001'
        )
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'proj-alien-tenant', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('should reject creating task if referenced assigneeId belongs to another tenant', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.createTask(
          'tenant-acme',
          {
            title: 'Unauthorized Task',
            assigneeId: 'emp-alien-tenant',
            priority: TaskPriority.MEDIUM,
          },
          'user-001'
        )
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith({
        where: { id: 'emp-alien-tenant', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });
  });
});
