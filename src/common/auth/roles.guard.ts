import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const rpc = context.switchToRpc();
    const metadata = rpc.getContext<Metadata>();
    const userRole = metadata.get('userrole')?.[0]?.toString();

    if (!userRole) {
      throw new RpcException('Unauthorized');
    }

    if (!requiredRoles.includes(userRole)) {
      throw new RpcException('Forbidden');
    }

    return true;
  }
}
