import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from '../service/notification.service';
import { toTemplateData } from '../utils/kafka-payload.util';

@Controller()
export class OrderEventConsumer {
  private readonly logger = new Logger(OrderEventConsumer.name);

  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('order.events')
  async onOrderEvent(@Payload() payload: any): Promise<void> {
    const message = this.extractKafkaMessage(payload);
    const eventType = String(
      message?.eventType || message?.event_type || message?.data?.eventType || '',
    ).trim();
    if (!eventType.startsWith('order.')) {
      return;
    }

    const data = message?.data || message || {};
    const recipient = String(data.customerEmail || data.customer_email || '').trim();
    const baseEventId =
      message?.eventId ||
      message?.event_id ||
      `${eventType}-${data.orderId || data.order_id || Date.now()}`;
    const commonTemplateData = {
      orderId: data.orderId || data.order_id || '',
      orderCreatedAt:
        data.orderCreatedAt ||
        data.order_created_at ||
        data.createdAt ||
        data.created_at ||
        message?.timestamp ||
        '',
      customerName: data.customerName || data.customer_name || '',
      sellerName: String(data.sellerName || data.seller_name || '').trim(),
      subTotal: data.subTotal ?? data.sub_total ?? 0,
      shippingFee: data.shippingFee ?? data.shipping_fee ?? 0,
      totalAmount: data.totalAmount ?? data.total_amount ?? 0,
      currency: data.currency || 'VND',
      status: data.status || '',
      note: data.note || '',
      ctaUrl: data.ctaUrl || data.cta_url || '',
      itemsJson: JSON.stringify(Array.isArray(data.items) ? data.items : []),
    };

    try {
      const customerId = String(
        data.userId || data.customerId || data.customer_id || '',
      ).trim();
      const orderId = String(data.orderId || data.order_id || '').trim();
      const customerTemplate = toTemplateData({
        ...commonTemplateData,
        userId: customerId,
        actorRole: 'customer',
        ctaUrl:
          commonTemplateData.ctaUrl ||
          (orderId ? `/customer/account/my-purchases/order/${orderId}` : ''),
      });

      if (recipient) {
        await this.notificationService.sendNotification({
          eventId: baseEventId,
          eventType,
          channel: 'EMAIL',
          recipient,
          language: 'vi',
          templateData: customerTemplate,
        });
      } else if (customerId) {
        await this.notificationService.sendNotification({
          eventId: `${baseEventId}-customer-inapp`,
          eventType,
          channel: 'IN_APP',
          recipient: '',
          language: 'vi',
          templateData: customerTemplate,
        });
        this.logger.warn(
          `Skip customer email ${eventType}: missing email, sent in-app only`,
        );
      } else {
        this.logger.warn(
          `Skip customer notification ${eventType}: missing customer id/email`,
        );
      }

      await this.dispatchInAppToActor(baseEventId, eventType, 'seller', data.sellerId, {
        ...commonTemplateData,
        actorRole: 'seller',
        ctaUrl:
          (data.orderId || data.order_id || '')
            ? `/seller/orders/${data.orderId || data.order_id || ''}`
            : '/seller/orders',
        note: `Bạn có cập nhật đơn hàng ${String(data.orderId || '').slice(0, 8)}...`,
      });

      await this.dispatchInAppToActor(baseEventId, eventType, 'supplier', data.supplierId, {
        ...commonTemplateData,
        actorRole: 'supplier',
        ctaUrl:
          (data.orderId || data.order_id || '')
            ? `/supplier/orders/${data.orderId || data.order_id || ''}`
            : '/supplier/orders',
        note: `Đơn hàng mới/cập nhật cần xử lý`,
      });
    } catch (error) {
      this.logger.warn(
        `Skip order notification: ${error instanceof Error ? error.message : String(error)}`,
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
