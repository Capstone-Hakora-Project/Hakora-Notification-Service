import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export async function validateDto<T extends object>(
  dtoClass: new () => T,
  data: unknown,
): Promise<T> {
  const dtoInstance = plainToInstance(dtoClass, data, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dtoInstance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((error) =>
      Object.values(error.constraints || {}).join(', '),
    );
    throw new BadRequestException(
      `Validation failed: ${messages.join('; ')}`,
    );
  }

  return dtoInstance;
}
