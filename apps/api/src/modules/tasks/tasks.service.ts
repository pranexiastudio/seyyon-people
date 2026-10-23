import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus, TaskPriority } from '@seyyon/shared';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjects(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      include: {
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProject(tenantId: string, data: { name: string; code: string; description?: string; ownerId?: string }) {
    return this.prisma.project.create({
      data: {
        tenantId,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description,
        ownerId: data.ownerId,
      },
    });
  }

  async getTasks(tenantId: string, filters?: { projectId?: string; status?: TaskStatus; assigneeId?: string }) {
    const where: any = { tenantId };
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.status) where.status = filters.status;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;

    return this.prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
  }

  async createTask(
    tenantId: string,
    data: {
      title: string;
      description?: string;
      projectId?: string;
      assigneeId?: string;
      priority?: TaskPriority;
      dueDate?: string;
      estimatedHours?: number;
    },
    creatorId: string
  ) {
    if (data.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: data.projectId, tenantId },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    if (data.assigneeId) {
      const assignee = await this.prisma.employee.findFirst({
        where: { id: data.assigneeId, tenantId },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found');
      }
    }

    return this.prisma.task.create({
      data: {
        tenantId,
        title: data.title,
        description: data.description,
        projectId: data.projectId,
        assigneeId: data.assigneeId,
        priority: data.priority || TaskPriority.MEDIUM,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        estimatedHours: data.estimatedHours,
        creatorId,
      },
      include: {
        project: true,
        assignee: true,
      },
    });
  }

  async updateTaskStatus(tenantId: string, taskId: string, status: TaskStatus) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: {
        assignee: true,
        project: true,
      },
    });
  }

  async addComment(tenantId: string, taskId: string, authorId: string, content: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        content,
      },
    });
  }
}
