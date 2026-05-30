import { ForbiddenException } from '@nestjs/common';
import type { GrpcAuthContext } from './auth.type';

const ELEVATED_ROLES = new Set(['ADMIN', 'INTERNAL']);

export function assertUserAccess(
  auth: GrpcAuthContext,
  requestedUserId: string,
): void {
  const targetUserId = String(requestedUserId || '').trim();
  if (!targetUserId) {
    return;
  }

  const role = String(auth.role || '').trim().toUpperCase();
  if (ELEVATED_ROLES.has(role)) {
    return;
  }

  if (auth.userId !== targetUserId) {
    throw new ForbiddenException(
      'Cannot access notifications for another user',
    );
  }
}
