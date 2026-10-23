import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantId } from '../../common/decorators/current-tenant.decorator';
import { ChannelType } from '@seyyon/shared';

@ApiTags('Team Collaboration & Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('channels')
  @ApiOperation({ summary: 'List chat channels accessible by user' })
  async getChannels(@CurrentTenantId() tenantId: string, @CurrentUser() user: any) {
    return this.chatService.getChannels(tenantId, user.id);
  }

  @Post('channels')
  @ApiOperation({ summary: 'Create new chat channel' })
  async createChannel(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; type?: ChannelType; description?: string; isPrivate?: boolean }
  ) {
    return this.chatService.createChannel(tenantId, user.id, body);
  }

  @Get('channels/:channelId/messages')
  @ApiOperation({ summary: 'Get message history for channel' })
  async getMessages(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: any,
    @Param('channelId') channelId: string,
    @Query('limit') limit?: number
  ) {
    return this.chatService.getMessages(tenantId, channelId, user.id, limit ? Number(limit) : 50);
  }

  @Post('channels/:channelId/messages')
  @ApiOperation({ summary: 'Send message to channel via REST API fallback' })
  async sendMessage(
    @CurrentTenantId() tenantId: string,
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Body() body: { content: string; attachmentUrl?: string }
  ) {
    return this.chatService.sendMessage(tenantId, channelId, user.id, body.content, body.attachmentUrl);
  }
}
