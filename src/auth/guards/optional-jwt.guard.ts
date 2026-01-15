import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Passport JWT guard that never blocks requests:
 * - If a valid token is present, attaches `req.user`
 * - If token is missing/invalid, proceeds with `req.user = null`
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err) return null;
    return user || null;
  }
}

