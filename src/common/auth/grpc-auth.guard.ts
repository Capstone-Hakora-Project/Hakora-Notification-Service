import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class GrpcAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const rpc = context.switchToRpc();
    const metadata = rpc.getContext<Metadata>();

    if (!metadata) {
      throw new RpcException('Missing metadata');
    }

    const userId = metadata.get('userid')?.[0]?.toString();
    const role = metadata.get('userrole')?.[0]?.toString();

    if (!userId || !role) {
      throw new RpcException('Unauthorized');
    }

    return true;
  }
}
