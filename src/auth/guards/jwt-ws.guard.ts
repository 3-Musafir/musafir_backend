import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Cryptr from 'cryptr';
import { Socket } from 'socket.io';

@Injectable()
export class JwtWsGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const cryptr = new Cryptr(process.env.ENCRYPT_JWT_SECRET);
      const decrypted = cryptr.decrypt(token);
      const payload = await this.jwtService.verifyAsync(decrypted, {
        secret: process.env.JWT_SECRET,
      });

      (client as any).user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
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
}
