import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

describe('ChatGateway - Security & Isolation Tests', () => {
  let gateway: ChatGateway;
  let mockChatService: any;
  let mockJwtService: any;
  let mockSocket: any;
  let mockServer: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockChatService = {
      canAccessChannel: jest.fn(),
      sendMessage: jest.fn(),
    };

    mockJwtService = {
      verifyAsync: jest.fn(),
    };

    mockSocket = {
      id: 'socket-test-123',
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
      data: { expiresAt: Date.now() + 60000 },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockPrisma = { user: { findUnique: jest.fn(async ({ where }) => ({
      id: where.id, email: 'alice@acme.com', role: 'EMPLOYEE', tenantId: 'tenant-acme',
      isActive: true, tenant: { status: 'ACTIVE' },
    })) } };
    gateway = new ChatGateway(mockChatService as ChatService, mockJwtService as JwtService, mockPrisma);
    gateway.server = mockServer;
  });

  describe('WebSocket Handshake JWT Authentication', () => {
    it('should reject unauthenticated connection when no token is present', async () => {
      await gateway.handleConnection(mockSocket as unknown as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Authentication token required',
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.data.user).toBeUndefined();
    });

    it('should reject connection when token is invalid or expired', async () => {
      mockSocket.handshake.auth.token = 'invalid-expired-jwt';
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await gateway.handleConnection(mockSocket as unknown as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid or expired authentication token',
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.data.user).toBeUndefined();
    });

    it('should reject connection when token claims lack tenantId or sub', async () => {
      mockSocket.handshake.headers['authorization'] = 'Bearer malformed-claims-jwt';
      mockJwtService.verifyAsync.mockResolvedValue({ email: 'user@example.com' }); // missing sub and tenantId

      await gateway.handleConnection(mockSocket as unknown as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid token claims',
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should successfully authenticate and store verified user identity derived from token', async () => {
      mockSocket.handshake.auth.token = 'valid-jwt-token';
      mockJwtService.verifyAsync.mockResolvedValue({
        exp: Math.floor(Date.now() / 1000) + 60,
        sub: 'user-001',
        email: 'alice@acme.com',
        role: 'EMPLOYEE',
        tenantId: 'tenant-acme',
      });

      await gateway.handleConnection(mockSocket as unknown as Socket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data.user).toEqual({
        id: 'user-001',
        email: 'alice@acme.com',
        role: 'EMPLOYEE',
        tenantId: 'tenant-acme',
      });
    });
  });

  describe('Channel Membership & Tenant Scoping (join_channel)', () => {
    it('should reject join_channel if socket session is unauthenticated', async () => {
      mockSocket.data.user = null;

      const result = await gateway.handleJoinChannel(mockSocket as unknown as Socket, {
        channelId: 'channel-001',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should reject join_channel when user is not authorized for channel', async () => {
      mockSocket.data.user = {
        id: 'user-001',
        tenantId: 'tenant-acme',
        role: 'EMPLOYEE',
      };
      mockChatService.canAccessChannel.mockResolvedValue(false);

      const result = await gateway.handleJoinChannel(mockSocket as unknown as Socket, {
        channelId: 'private-secret-channel',
      });

      expect(result).toEqual({ error: 'Forbidden' });
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized channel access',
      });
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockChatService.canAccessChannel).toHaveBeenCalledWith(
        'tenant-acme',
        'private-secret-channel',
        'user-001',
        'EMPLOYEE'
      );
    });

    it('should authorize and join room scoped strictly to authenticated tenant', async () => {
      mockSocket.data.user = {
        id: 'user-001',
        tenantId: 'tenant-acme',
        role: 'EMPLOYEE',
      };
      mockChatService.canAccessChannel.mockResolvedValue(true);

      const result = await gateway.handleJoinChannel(mockSocket as unknown as Socket, {
        channelId: 'general-channel',
      });

      const expectedRoom = 'tenant:tenant-acme:channel:general-channel';
      expect(result).toEqual({ event: 'joined', room: expectedRoom });
      expect(mockSocket.join).toHaveBeenCalledWith(expectedRoom);
    });
  });

  describe('Message Operations Authorization (send_message)', () => {
    it('should reject send_message if client is unauthenticated', async () => {
      mockSocket.data.user = null;

      const result = await gateway.handleSendMessage(mockSocket as unknown as Socket, {
        channelId: 'general-channel',
        content: 'Hello World',
      });

      expect(result).toEqual({ error: 'Unauthorized' });
      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject send_message if user is not authorized to post in channel', async () => {
      mockSocket.data.user = {
        id: 'user-002',
        tenantId: 'tenant-acme',
        role: 'EMPLOYEE',
      };
      mockChatService.canAccessChannel.mockResolvedValue(false);

      const result = await gateway.handleSendMessage(mockSocket as unknown as Socket, {
        channelId: 'exec-channel',
        content: 'Confidential leak attempt',
      });

      expect(result).toEqual({ error: 'Forbidden' });
      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });

    it('should derive sender and tenant strictly from token and emit strictly to tenant-scoped room', async () => {
      mockSocket.data.user = {
        id: 'verified-user-123',
        tenantId: 'tenant-acme',
        role: 'EMPLOYEE',
      };
      mockChatService.canAccessChannel.mockResolvedValue(true);
      mockChatService.sendMessage.mockResolvedValue({
        id: 'msg-01',
        content: 'Safe message',
        senderId: 'verified-user-123',
      });

      const result = await gateway.handleSendMessage(mockSocket as unknown as Socket, {
        channelId: 'general-channel',
        content: 'Safe message',
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'tenant-acme',
        'general-channel',
        'verified-user-123',
        'Safe message',
        undefined
      );
      expect(mockServer.to).toHaveBeenCalledWith('tenant:tenant-acme:channel:general-channel');
      expect(mockServer.emit).toHaveBeenCalledWith('new_message', result);
    });
  });
});
