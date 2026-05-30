import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppError } from './app-error';

export function toHttpException(err: unknown): never {
  if (err instanceof BadRequestException) throw err;
  if (err instanceof NotFoundException) throw err;
  if (err instanceof ConflictException) throw err;
  if (err instanceof UnauthorizedException) throw err;
  if (err instanceof ForbiddenException) throw err;
  if (err instanceof InternalServerErrorException) throw err;

  if (err instanceof AppError) {
    switch (err.code) {
      case 'VALIDATION_ERROR':
        throw new BadRequestException({ message: err.message, details: err.details });
      case 'NOT_FOUND':
        throw new NotFoundException({ message: err.message, details: err.details });
      case 'CONFLICT':
        throw new ConflictException({ message: err.message, details: err.details });
      case 'UNAUTHORIZED':
        throw new UnauthorizedException({ message: err.message, details: err.details });
      case 'FORBIDDEN':
        throw new ForbiddenException({ message: err.message, details: err.details });
      default:
        throw new InternalServerErrorException({ message: err.message, details: err.details });
    }
  }

  throw new InternalServerErrorException({
    message: 'Unexpected error',
    details: err instanceof Error ? err.message : err,
  });
}

