import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info, context: ExecutionContext) {
    if (!user) {
        return null;
    }

    if (err) {
      throw err || new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}
