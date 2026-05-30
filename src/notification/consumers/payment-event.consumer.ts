import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from '../service/notification.service';
import { toTemplateData } from '../utils/kafka-payload.util';

type PaymentTopic =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded';

@Controller()
export class PaymentEventConsumer {
  private readonly logger = new Logger(PaymentEventConsumer.name);

  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('payment.succeeded')
  async onPaymentSucceeded(@Payload() payload: unknown): Promise<void> {
    await this.handlePaymentEvent('payment.succeeded', payload);
  }

  @EventPattern('payment.failed')
  async onPaymentFailed(@Payload() payload: unknown): Promise<void> {
    await this.handlePaymentEvent('payment.failed', payload);
  }

  @EventPattern('payment.refunded')
  async onPaymentRefunded(@Payload() payload: unknown): Promise<void> {
    await this.handlePaymentEvent('payment.refunded', payload);
  }

  private async handlePaymentEvent(
    eventType: PaymentTopic,
    payload: unknown,
  ): Promise<void> {
    const message = this.extractKafkaMessage(payload);
    const data = message?.data || message || {};
    const recipient = String(
      data.customerEmail || data.customer_email || '',
    ).trim();
    const userId = String(
      data.userId || data.customerId || data.customer_id || '',
    ).trim();
    const orderId = String(data.orderId || data.order_id || '').trim();
    const paymentId = String(data.paymentId || data.payment_id || '').trim();

    const baseEventId =
      message?.eventId ||
      message?.event_id ||
      message?._idempotencyKey ||
      `${eventType}-${paymentId || orderId || Date.now()}`;

    const paidAt = String(
      data.paidAt || data.timestamp || new Date().toISOString(),
    );

    const templateData = toTemplateData({
      paymentId,
      orderId,
      orderCreatedAt: data.orderCreatedAt || data.order_created_at || paidAt,
      stripePaymentIntentId:
        data.stripePaymentIntentId || data.stripe_payment_intent_id || '',
      paymentMethod: data.paymentMethod || data.payment_method || 'CREDIT_CARD',
      payment_method: data.paymentMethod || data.payment_method || 'CREDIT_CARD',
      amount: data.amount ?? data.totalAmount ?? '',
      totalAmount: data.totalAmount ?? data.amount ?? '',
      currency: data.currency || 'VND',
      paidAt,
      status:
        data.status ||
        (eventType === 'payment.succeeded'
          ? 'SUCCEEDED'
          : eventType === 'payment.refunded'
            ? 'REFUNDED'
            : 'FAILED'),
      note:
        data.note ||
        data.reason ||
        data.error ||
        (eventType === 'payment.failed' ? 'Thanh toán không thành công' : ''),
      customerName: data.customerName || data.customer_name || 'Quý khách',
      productName: data.productName || data.product_name || '',
      product_name: data.productName || data.product_name || '',
      productThumbnailUrl:
        data.productThumbnailUrl || data.product_thumbnail_url || '',
      product_thumbnail_url:
        data.productThumbnailUrl || data.product_thumbnail_url || '',
      itemCount: String(data.itemCount ?? data.item_count ?? 0),
      item_count: String(data.itemCount ?? data.item_count ?? 0),
      userId,
      actorRole: 'customer',
      ctaUrl: orderId
        ? `/customer/account/my-purchases/order/${orderId}`
        : '/customer/account/my-purchases',
    });

    try {
      if (recipient) {
        await this.notificationService.sendNotification({
          eventId: baseEventId,
          eventType,
          channel: 'EMAIL',
          recipient,
          language: 'vi',
          templateData,
        });
        return;
      }

      if (userId) {
        await this.notificationService.sendNotification({
          eventId: `${baseEventId}-inapp`,
          eventType,
          channel: 'IN_APP',
          recipient: '',
          language: 'vi',
          templateData,
        });
        this.logger.warn(
          `Payment ${eventType}: missing email, sent in-app only for user ${userId}`,
        );
        return;
      }

      this.logger.warn(
        `Skip payment notification ${eventType}: missing email and userId`,
      );
    } catch (error) {
      this.logger.warn(
        `Skip payment notification ${eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private extractKafkaMessage(payload: unknown): Record<string, any> {
    const raw =
      (payload as { value?: unknown })?.value !== undefined
        ? (payload as { value: unknown }).value
        : payload;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, any>;
      } catch {
        return {};
      }
    }
    return (raw as Record<string, any>) || {};
  }
}
