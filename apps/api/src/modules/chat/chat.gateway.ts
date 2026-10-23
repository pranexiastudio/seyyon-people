import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { getJwtSecret } from '../../common/config/jwt.config';
import { getAllowedOrigins } from '../../common/config/cors.config';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }
      try {
        const allowed = getAllowedOrigins();
        if (allowed.includes(origin)) {
          return callback(null, true);
        }
      } catch (err) {
        return callback(err as Error);
      }
      return callback(new Error(`WebSocket CORS origin '${origin}' not permitted`));
    },
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const authHeader =
        (client.handshake.auth && client.handshake.auth.token) ||
        client.handshake.headers?.authorization ||
        (client.handshake.query && client.handshake.query.token);

      if (!authHeader) {
        this.logger.warn(`Rejected WebSocket connection: missing token from ${client.id}`);
        client.emit('error', { message: 'Authentication token required' });
        client.disconnect(true);
        return;
      }

      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : String(authHeader).trim();

      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });

      if (!payload || !payload.sub || !payload.tenantId) {
        this.logger.warn(`Rejected WebSocket connection: invalid claims from ${client.id}`);
        client.emit('error', { message: 'Invalid token claims' });
        client.disconnect(true);
        return;
      }

      // Store verified identity derived strictly from verified token
      client.data.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId,
      };

      this.logger.log(`Client authenticated: ${client.id} (user: ${payload.sub}, tenant: ${payload.tenantId})`);
    } catch (err) {
      this.logger.warn(`Rejected WebSocket connection: auth failed for ${client.id}: ${(err as Error).message}`);
      client.emit('error', { message: 'Invalid or expired authentication token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_channel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string }
  ) {
    const user = client.data?.user;
    if (!user || !user.tenantId || !user.id) {
      client.emit('error', { message: 'Unauthorized WebSocket session' });
      return { error: 'Unauthorized' };
    }

    if (!data?.channelId) {
      return { error: 'Channel ID is required' };
    }

    // Authorize channel membership before joining room
    const canAccess = await this.chatService.canAccessChannel(
      user.tenantId,
      data.channelId,
      user.id,
      user.role
    );

    if (!canAccess) {
      this.logger.warn(`Socket ${client.id} unauthorized join attempt for channel ${data.channelId}`);
      client.emit('error', { message: 'Unauthorized channel access' });
      return { error: 'Forbidden' };
    }

    // Scope room strictly to authenticated tenant
    const room = `tenant:${user.tenantId}:channel:${data.channelId}`;
    client.join(room);
    this.logger.log(`Socket ${client.id} (user: ${user.id}) joined room ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave_channel')
  handleLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string }
  ) {
    const user = client.data?.user;
    if (!user || !user.tenantId) {
      return { error: 'Unauthorized' };
    }

    if (!data?.channelId) {
      return { error: 'Channel ID is required' };
    }

    const room = `tenant:${user.tenantId}:channel:${data.channelId}`;
    client.leave(room);
    return { event: 'left', room };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      channelId: string;
      content: string;
      attachmentUrl?: string;
    }
  ) {
    const user = client.data?.user;
    if (!user || !user.tenantId || !user.id) {
      client.emit('error', { message: 'Unauthorized WebSocket session' });
      return { error: 'Unauthorized' };
    }

    if (!data?.channelId || !data?.content) {
      return { error: 'Channel ID and content are required' };
    }

    // Authorize channel membership before sending message
    const canAccess = await this.chatService.canAccessChannel(
      user.tenantId,
      data.channelId,
      user.id,
      user.role
    );

    if (!canAccess) {
      this.logger.warn(`Socket ${client.id} unauthorized send attempt for channel ${data.channelId}`);
      client.emit('error', { message: 'Unauthorized channel access' });
      return { error: 'Forbidden' };
    }

    // Tenant and sender are derived strictly from verified token
    const message = await this.chatService.sendMessage(
      user.tenantId,
      data.channelId,
      user.id,
      data.content,
      data.attachmentUrl
    );

    const room = `tenant:${user.tenantId}:channel:${data.channelId}`;
    this.server.to(room).emit('new_message', message);

    return message;
  }
}
