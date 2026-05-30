import { Metadata } from '@grpc/grpc-js';
import type { GrpcAuthContext } from './auth.type';

export function extractAuth(metadata: Metadata): GrpcAuthContext {
  const userId = metadata.get('userid')?.[0]?.toString() || '';
  const role = metadata.get('userrole')?.[0]?.toString() || '';
  return { userId, role };
}
