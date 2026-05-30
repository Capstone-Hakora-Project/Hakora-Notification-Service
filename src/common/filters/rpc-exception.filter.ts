import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Observable, throwError } from 'rxjs';
import { AppError } from '../errors/app-error';

function extractHttpMessage(exception: HttpException): string {
  const res = exception.getResponse();
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object' && 'message' in res) {
    const msg = (res as { message?: string | string[] }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return exception.message || 'Request failed';
}

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): Observable<unknown> | void {
    if (host.getType() !== 'rpc') {
      throw exception;
    }

    if (exception instanceof RpcException) {
      return throwError(() => exception);
    }

    let message = 'Internal server error';
    let code = GrpcStatus.INTERNAL;

    if (exception instanceof AppError) {
      switch (exception.code) {
        case 'VALIDATION_ERROR':
          code = GrpcStatus.INVALID_ARGUMENT;
          break;
        case 'NOT_FOUND':
          code = GrpcStatus.NOT_FOUND;
          break;
        case 'CONFLICT':
          code = GrpcStatus.ALREADY_EXISTS;
          break;
        case 'UNAUTHORIZED':
          code = GrpcStatus.UNAUTHENTICATED;
          break;
        case 'FORBIDDEN':
          code = GrpcStatus.PERMISSION_DENIED;
          break;
        default:
          code = GrpcStatus.INTERNAL;
      }
      message = exception.message;
    } else if (exception instanceof BadRequestException) {
      code = GrpcStatus.INVALID_ARGUMENT;
      message = extractHttpMessage(exception);
    } else if (exception instanceof NotFoundException) {
      code = GrpcStatus.NOT_FOUND;
      message = extractHttpMessage(exception);
    } else if (exception instanceof ForbiddenException) {
      code = GrpcStatus.PERMISSION_DENIED;
      message = extractHttpMessage(exception);
    } else if (exception instanceof UnauthorizedException) {
      code = GrpcStatus.UNAUTHENTICATED;
      message = extractHttpMessage(exception);
    } else if (exception instanceof HttpException) {
      const httpStatus = exception.getStatus();
      if (httpStatus === 404) code = GrpcStatus.NOT_FOUND;
      else if (httpStatus === 403) code = GrpcStatus.PERMISSION_DENIED;
      else if (httpStatus === 401) code = GrpcStatus.UNAUTHENTICATED;
      else if (httpStatus >= 400 && httpStatus < 500) {
        code = GrpcStatus.INVALID_ARGUMENT;
      }
      message = extractHttpMessage(exception);
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    this.logger.error(
      `RPC Error [code=${code}]: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    return throwError(() => new RpcException({ code, message }));
  }
}
