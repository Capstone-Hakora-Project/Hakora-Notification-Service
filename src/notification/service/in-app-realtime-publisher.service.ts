import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InAppNotificationEntity } from '../entities/in-app-notification.entity';

@Injectable()
export class InAppRealtimePublisherService {
  private readonly logger = new Logger(InAppRealtimePublisherService.name);

  constructor(private readonly configService: ConfigService) {}

  async publish(row: InAppNotificationEntity): Promise<void> {
    const baseUrl = String(
      this.configService.get<string>('API_GATEWAY_URL') ||
        this.configService.get<string>('API_GATEWAY_INTERNAL_URL') ||
        'http://localhost:3000',
    ).replace(/\/$/, '');
    const serviceKey =
      this.configService.get<string>('INTERNAL_SERVICE_KEY') ||
      this.configService.get<string>('NOTIFICATION_REALTIME_KEY') ||
      '';

    if (!serviceKey) {
      this.logger.debug('Skip realtime push: INTERNAL_SERVICE_KEY not set');
      return;
    }

    const url = `${baseUrl}/api/internal/notifications/push`;
    const notification = {
      id: row.id,
      userId: row.userId,
      eventId: row.eventId,
      eventType: row.eventType,
      category: row.category,
      title: row.title,
      body: row.body,
      linkUrl: row.linkUrl,
      orderId: row.orderId,
      orderIdDisplay: row.orderIdDisplay,
      statusLabel: row.statusLabel,
      totalAmountDisplay: row.totalAmountDisplay,
      productName: row.productName,
      productThumbnailUrl: row.productThumbnailUrl,
      itemCount: row.itemCount,
      priority: row.priority,
      isRead: row.isRead,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': serviceKey,
        },
        body: JSON.stringify({ userId: row.userId, notification }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `Realtime push failed (${response.status}): ${text.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Realtime push error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
