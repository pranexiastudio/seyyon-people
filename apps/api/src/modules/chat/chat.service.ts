import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelType } from '@seyyon/shared';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getChannels(tenantId: string, userId: string) {
    return this.prisma.chatChannel.findMany({
      where: {
        tenantId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId } } },
        ],
      },
      include: {
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createChannel(tenantId: string, userId: string, data: { name: string; type?: ChannelType; description?: string; isPrivate?: boolean }) {
    const channel = await this.prisma.chatChannel.create({
      data: {
        tenantId,
        name: data.name.toLowerCase().replace(/\s+/g, '-'),
        type: data.type || ChannelType.DEPARTMENT,
        description: data.description,
        isPrivate: data.isPrivate || false,
        createdById: userId,
        members: {
          create: {
            userId,
            role: 'ADMIN',
          },
        },
      },
    });

    return channel;
  }

  async canAccessChannel(tenantId: string, channelId: string, userId: string, role?: string): Promise<boolean> {
    const channel = await this.prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId },
      include: {
        members: { where: { userId } },
      },
    });

    if (!channel) {
      return false;
    }

    if (!channel.isPrivate) {
      return true;
    }

    // For private channels, check membership, creator, or admin role
    if (channel.createdById === userId || channel.members.length > 0) {
      return true;
    }

    if (role === 'COMPANY_ADMIN' || role === 'PLATFORM_SUPER_ADMIN') {
      return true;
    }

    return false;
  }

  async getMessages(tenantId: string, channelId: string, userId?: string, limit = 50) {
    const channel = await this.prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (userId) {
      const canAccess = await this.canAccessChannel(tenantId, channelId, userId);
      if (!canAccess) {
        throw new ForbiddenException('Access denied to channel');
      }
    }

    return this.prisma.chatMessage.findMany({
      where: { channelId, isDeleted: false },
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });
  }

  async sendMessage(tenantId: string, channelId: string, senderId: string, content: string, attachmentUrl?: string) {
    const channel = await this.prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const canAccess = await this.canAccessChannel(tenantId, channelId, senderId);
    if (!canAccess) {
      throw new ForbiddenException('Access denied to channel');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        senderId,
        content,
        attachmentUrl,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    return message;
  }
}
