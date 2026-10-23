import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Meetings & Calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  @ApiOperation({ summary: 'List scheduled meetings for employee / organization' })
  async getMeetings(@CurrentTenantId() tenantId: string, @CurrentUser() user: any) {
    return this.meetingsService.getMeetings(tenantId, user.employeeId);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule new meeting with calendar conflict detection' })
  async createMeeting(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      title: string;
      description?: string;
      startTime: string;
      endTime: string;
      locationOrUrl?: string;
      attendeeIds?: string[];
    }
  ) {
    return this.meetingsService.createMeeting(tenantId, user.employeeId || user.id, body);
  }

  @Post(':id/respond')
  @ApiOperation({ summary: 'Respond to meeting invitation (Accept / Decline)' })
  async respond(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { status: 'ACCEPTED' | 'DECLINED'; notes?: string }
  ) {
    return this.meetingsService.respondInvitation(tenantId, id, user.employeeId, body.status, body.notes);
  }
}
