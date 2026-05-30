import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from '../service/notification.service';
import { toTemplateData } from '../utils/kafka-payload.util';

@Controller()
export class DeliveryEventConsumer {
  private readonly logger = new Logger(DeliveryEventConsumer.name);

  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('delivery.events')
  async onDeliveryEvent(@Payload() payload: any): Promise<void> {
    const message = this.extractKafkaMessage(payload);
    const eventType = String(
      message?.eventType || message?.event_type || message?.data?.eventType || '',
    ).trim();
    if (!eventType.startsWith('delivery.')) {
      return;
    }

    const data = message?.data || message || {};
    const recipient = String(data.customerEmail || data.customer_email || '').trim();
    const customerId = String(
      data.userId || data.customerId || data.customer_id || '',
    ).trim();
    const orderId = String(data.orderId || data.order_id || '').trim();
    const baseEventId =
      message?.eventId ||
      message?.event_id ||
      `${eventType}-${data.deliveryId || data.delivery_id || Date.now()}`;
    const customerCtaUrl =
      String(data.ctaUrl || data.cta_url || '').trim() ||
      (orderId
        ? `/customer/account/my-purchases/order/${orderId}`
        : '/customer/account/notifications?type=all');
    const commonTemplateData = {
      deliveryId: data.deliveryId || data.delivery_id || '',
      orderId,
      orderCreatedAt:
        data.orderCreatedAt ||
        data.order_created_at ||
        data.createdAt ||
        message?.timestamp ||
        '',
      customerName: data.customerName || data.customer_name || '',
      provider: data.provider || 'GHN',
      trackingNumber: data.trackingNumber || data.tracking_number || '',
      status: data.status || '',
      estimatedDeliveryAt:
        data.estimatedDeliveryAt || data.estimated_delivery_at || '',
      note: data.note || '',
      ctaUrl: customerCtaUrl,
      itemsJson: JSON.stringify(Array.isArray(data.items) ? data.items : []),
      subTotal: String(data.subTotal ?? data.sub_total ?? ''),
      totalAmount: String(data.totalAmount ?? data.total_amount ?? ''),
    };

    try {
      if (recipient) {
        await this.notificationService.sendNotification({
          eventId: baseEventId,
          eventType,
          channel: 'EMAIL',
          recipient,
          language: 'vi',
          templateData: toTemplateData({
            ...commonTemplateData,
            userId: customerId,
            actorRole: 'customer',
          }),
        });
      } else if (customerId) {
        await this.notificationService.sendNotification({
          eventId: `${baseEventId}-customer-inapp`,
          eventType,
          channel: 'IN_APP',
          recipient: '',
          language: 'vi',
          templateData: toTemplateData({
            ...commonTemplateData,
            userId: customerId,
            actorRole: 'customer',
          }),
        });
        this.logger.warn(
          `Skip delivery email ${eventType}: missing email, sent in-app only`,
        );
      } else {
        this.logger.warn(`Skip delivery email ${eventType}: missing customer email`);
      }

      await this.dispatchInAppToActor(baseEventId, eventType, 'seller', data.sellerId, {
        ...commonTemplateData,
        actorRole: 'seller',
        ctaUrl:
          (data.orderId || data.order_id || '')
            ? `/seller/orders/${data.orderId || data.order_id || ''}`
            : '/seller/orders',
      });
    } catch (error) {
      this.logger.warn(
        `Skip delivery notification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async dispatchInAppToActor(
    baseEventId: string,
    eventType: string,
    actor: 'seller' | 'supplier',
    actorIdRaw: unknown,
    templateData: Record<string, unknown>,
  ): Promise<void> {
    const actorId = String(actorIdRaw || '').trim();
    if (!actorId) return;
    await this.notificationService.sendNotification({
      eventId: `${baseEventId}-${actor}-${actorId}`,
      eventType,
      channel: 'IN_APP',
      recipient: '',
      language: 'vi',
      templateData: toTemplateData({
        ...templateData,
        userId: actorId,
      }),
    });
  }

  private extractKafkaMessage(payload: any): any {
    const raw = payload?.value ?? payload;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return payload;
      }
    }
    return raw;
  }
}
