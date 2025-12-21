import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtWsGuard } from 'src/auth/guards/jwt-ws.guard';
import Cryptr from 'cryptr';
import { JwtService } from '@nestjs/jwt';
import { NotificationDto } from './dto/notification.dto';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*', credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationsGateway');

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const userId = await this.authenticate(client);
      client.join(this.userRoom(userId));
      this.logger.debug(`Client connected for user ${userId}`);
    } catch (error) {
      this.logger.warn(`Socket connection rejected: ${error.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    this.logger.debug(`Client disconnected${userId ? ` for user ${userId}` : ''}`);
  }

  @UseGuards(JwtWsGuard)
  @SubscribeMessage('notifications:read')
  async handleClientRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { id: string },
  ) {
    // The REST endpoint will persist read state; this is a soft ack only
    const userId = (client as any).user?.userId;
    if (userId && payload?.id) {
      client.to(this.userRoom(userId)).emit('notifications:read', payload.id);
    }
  }

  sendToUser(userId: string, notification: NotificationDto) {
    this.server.to(this.userRoom(userId)).emit('notifications:new', notification);
  }

  private async authenticate(client: Socket): Promise<string> {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Missing token');
    }
    const cryptr = new Cryptr(process.env.ENCRYPT_JWT_SECRET);
    const decrypted = cryptr.decrypt(token);
    const payload = await this.jwtService.verifyAsync(decrypted, {
      secret: process.env.JWT_SECRET,
    });
    if (!payload?.userId) {
      throw new Error('Invalid token payload');
    }
    (client as any).userId = payload.userId;
    return payload.userId;
  }

  private extractToken(client: Socket): string | null {
    const fromHeader = client.handshake.headers.authorization;
    if (fromHeader?.startsWith('Bearer ')) {
      return fromHeader.replace('Bearer ', '').trim();
    }
    if (client.handshake.auth && typeof client.handshake.auth.token === 'string') {
      return client.handshake.auth.token;
    }
    if (client.handshake.query && typeof client.handshake.query.token === 'string') {
      return client.handshake.query.token as string;
    }
    return null;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
