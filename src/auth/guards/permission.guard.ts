import {
    Injectable,
    Inject,
    CanActivate,
    ExecutionContext,
    HttpException,
    Logger,
    HttpStatus,
  } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger('PermissionsGuard');
  constructor(private reflector: Reflector) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      'permission',
      [context.getHandler(), context.getClass()],
    );

    if (!permissions || !permissions.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user =
      request?.user ??
      request?.tokenData?.user; // support legacy shape if still used somewhere

    if (!user) {
      throw new HttpException(
        { message: 'User is not authorized to access this service' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userPermissions =
      user?.roleData?.permissions ?? request?.tokenData?.user?.roleData?.permissions;

    if (!userPermissions) {
      throw new HttpException(
        {
          message: 'permission denied',
          data: null,
          errors: "Don't have permission to access this route",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const hasPermissions = permissions.every((permission) => {
      const [resource, action] = permission.split('.');
      const matchedIndex = userPermissions.findIndex((upm) => upm.name === resource);
      if (matchedIndex === -1) return false;

      const matchedPermission = userPermissions[matchedIndex]?.types?.includes(action);
      return Boolean(matchedPermission);
    });

    if (!hasPermissions) {
      throw new HttpException(
        {
          message: 'permission denied',
          data: null,
          errors: "Don't have permission to access this route",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}