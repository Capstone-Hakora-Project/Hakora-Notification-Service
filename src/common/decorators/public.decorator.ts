import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';

/** Bỏ qua GrpcAuthGuard — chỉ dùng cho RPC nội bộ (vd. SendNotification từ gateway chưa gắn JWT). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
