import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { TaskStatus, TaskPriority } from '@seyyon/shared';

@ApiTags('Tasks & Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('projects')
  @ApiOperation({ summary: 'List all tenant projects' })
  async getProjects(@CurrentTenantId() tenantId: string) {
    return this.tasksService.getProjects(tenantId);
  }

  @Post('projects')
  @ApiOperation({ summary: 'Create new project' })
  async createProject(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; code: string; description?: string }
  ) {
    return this.tasksService.createProject(tenantId, { ...body, ownerId: user.employeeId });
  }

  @Get()
  @ApiOperation({ summary: 'List tasks with status, project, and assignee filters' })
  async getTasks(
    @CurrentTenantId() tenantId: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: TaskStatus,
    @Query('assigneeId') assigneeId?: string
  ) {
    return this.tasksService.getTasks(tenantId, { projectId, status, assigneeId });
  }

  @Post()
  @ApiOperation({ summary: 'Create new task' })
  async createTask(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      title: string;
      description?: string;
      projectId?: string;
      assigneeId?: string;
      priority?: TaskPriority;
      dueDate?: string;
      estimatedHours?: number;
    }
  ) {
    return this.tasksService.createTask(tenantId, body, user.employeeId || user.id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update task progress status' })
  async updateStatus(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { status: TaskStatus }
  ) {
    return this.tasksService.updateTaskStatus(tenantId, id, body.status);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add discussion comment to task' })
  async addComment(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { content: string }
  ) {
    return this.tasksService.addComment(tenantId, id, user.employeeId || user.id, body.content);
  }
}
