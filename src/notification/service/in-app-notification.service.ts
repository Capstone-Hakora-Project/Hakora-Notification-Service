import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { InAppNotificationEntity } from '../entities/in-app-notification.entity';

export interface CreateInAppNotificationInput {
  userId: string;
  eventId: string;
  eventType: string;
  category: string;
  title: string;
  body: string;
  linkUrl?: string;
  orderId?: string;
  orderIdDisplay?: string;
  statusLabel?: string;
  totalAmountDisplay?: string;
  productName?: string;
  productThumbnailUrl?: string;
  itemCount?: number;
  priority?: string;
}

export interface ListInAppNotificationsQuery {
  userId: string;
  category?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class InAppNotificationService {
  constructor(
    @InjectRepository(InAppNotificationEntity)
    private readonly inAppRepo: Repository<InAppNotificationEntity>,
  ) {}

  async create(
    input: CreateInAppNotificationInput,
  ): Promise<{ row: InAppNotificationEntity | null; created: boolean }> {
    const userId = String(input.userId || '').trim();
    if (!userId) return { row: null, created: false };

    const existing = await this.inAppRepo.findOne({
      where: { eventId: input.eventId, userId },
    });
    if (existing) return { row: existing, created: false };

    const row = this.inAppRepo.create({
      userId,
      eventId: input.eventId,
      eventType: input.eventType,
      category: input.category || 'order-updates',
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl || '',
      orderId: input.orderId || null,
      orderIdDisplay: input.orderIdDisplay || '',
      statusLabel: input.statusLabel || '',
      totalAmountDisplay: input.totalAmountDisplay || '',
      productName: input.productName || '',
      productThumbnailUrl: input.productThumbnailUrl || '',
      itemCount: input.itemCount ?? 0,
      priority: input.priority || 'normal',
      isRead: false,
    });
    const saved = await this.inAppRepo.save(row);
    return { row: saved, created: true };
  }

  async listByUser(query: ListInAppNotificationsQuery): Promise<{
    items: InAppNotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    const userId = String(query.userId || '').trim();
    if (!userId) {
      throw new AppError('VALIDATION_ERROR', 'userId is required');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.inAppRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC');

    const category = String(query.category || '').trim();
    if (category && category !== 'all') {
      qb.andWhere('n.category = :category', { category });
    }

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const unreadCount = await this.inAppRepo.count({
      where: { userId, isRead: false },
    });

    return { items, total, unreadCount };
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.inAppRepo.update(
      { id: notificationId, userId },
      { isRead: true },
    );
    return (result.affected ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.inAppRepo.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return result.affected ?? 0;
  }

  async deleteRead(userId: string): Promise<number> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      throw new AppError('VALIDATION_ERROR', 'userId is required');
    }
    const result = await this.inAppRepo.delete({
      userId: normalizedUserId,
      isRead: true,
    });
    return result.affected ?? 0;
  }
}
