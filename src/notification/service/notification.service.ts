import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { EmailAdapter } from '../adapters/email.adapter';
import {
  NotificationChannel,
  SendNotificationDto,
} from '../dto/send-notification.dto';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import {
  InAppNotificationService,
  ListInAppNotificationsQuery,
} from './in-app-notification.service';
import { TemplateService } from './template.service';
import { InAppRealtimePublisherService } from './in-app-realtime-publisher.service';
import { InAppNotificationEntity } from '../entities/in-app-notification.entity';
import { UserPreferenceEntity } from '../entities/user-preference.entity';
import { toHkrOrderDisplayId } from '../utils/order-display-id.util';

const SUPPORTED_CHANNELS: NotificationChannel[] = ['EMAIL', 'IN_APP'];

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationLogEntity)
    private readonly logRepo: Repository<NotificationLogEntity>,
    @InjectRepository(UserPreferenceEntity)
    private readonly userPreferenceRepo: Repository<UserPreferenceEntity>,
    private readonly templateService: TemplateService,
    private readonly emailAdapter: EmailAdapter,
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly inAppRealtimePublisher: InAppRealtimePublisherService,
  ) {}

  async listInAppNotifications(query: ListInAppNotificationsQuery): Promise<{
    items: InAppNotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    return this.inAppNotificationService.listByUser(query);
  }

  async markInAppNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<boolean> {
    return this.inAppNotificationService.markRead(userId, notificationId);
  }

  async markAllInAppNotificationsRead(userId: string): Promise<number> {
    return this.inAppNotificationService.markAllRead(userId);
  }

  async deleteReadInAppNotifications(userId: string): Promise<number> {
    return this.inAppNotificationService.deleteRead(userId);
  }

  async listUserPreferences(userId: string): Promise<UserPreferenceEntity[]> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      throw new AppError('VALIDATION_ERROR', 'userId is required');
    }
    return this.userPreferenceRepo.find({
      where: { userId: normalizedUserId },
      order: { eventType: 'ASC' },
    });
  }

  async updateUserPreference(
    userId: string,
    eventType: string,
    emailEnabled: boolean,
  ): Promise<UserPreferenceEntity> {
    const normalizedUserId = String(userId || '').trim();
    const normalizedEventType = String(eventType || '').trim();
    if (!normalizedUserId) {
      throw new AppError('VALIDATION_ERROR', 'userId is required');
    }
    if (!normalizedEventType) {
      throw new AppError('VALIDATION_ERROR', 'eventType is required');
    }

    const existing = await this.userPreferenceRepo.findOne({
      where: { userId: normalizedUserId, eventType: normalizedEventType },
    });
    if (existing) {
      existing.emailEnabled = Boolean(emailEnabled);
      return this.userPreferenceRepo.save(existing);
    }

    const row = this.userPreferenceRepo.create({
      userId: normalizedUserId,
      eventType: normalizedEventType,
      emailEnabled: Boolean(emailEnabled),
    });
    return this.userPreferenceRepo.save(row);
  }

  async sendNotification(
    dto: SendNotificationDto,
  ): Promise<{ logId: string; message: string }> {
    this.validateSendNotificationDto(dto);

    const channel = dto.channel.toUpperCase() as NotificationChannel;
    const language = dto.language?.trim() || 'vi';

    const existing = await this.logRepo.findOne({
      where: { eventId: dto.eventId, channel },
    });
    if (existing) {
      return {
        logId: existing.id,
        message: 'Event already processed, skipped duplicate notification',
      };
    }

    const userId = this.resolveUserId(dto.templateData);
    let emailEnabled = true;
    if (channel === 'EMAIL' && userId) {
      emailEnabled = await this.isEmailEnabledForEvent(userId, dto.eventType);
    }

    const log = this.logRepo.create({
      eventId: dto.eventId,
      eventType: dto.eventType,
      channel,
      recipient: dto.recipient,
      status: 'PENDING',
      subject: '',
      bodyPreview: '',
    });
    await this.logRepo.save(log);

    try {
      if (channel === 'EMAIL') {
        if (emailEnabled) {
          await this.dispatchEmail(dto.eventType, dto.recipient, language, dto.templateData, log);
        } else {
          log.subject = `[SKIPPED] ${dto.eventType}`;
          log.bodyPreview = 'Email skipped by user preference';
        }
        await this.dispatchInApp(dto.eventId, dto.eventType, dto.templateData);
      } else if (channel === 'IN_APP') {
        await this.dispatchInApp(dto.eventId, dto.eventType, dto.templateData);
      } else {
        throw new AppError(
          'VALIDATION_ERROR',
          `Channel "${channel}" is not supported yet`,
        );
      }

      log.status = 'SENT';
      log.errorMessage = null;
      await this.logRepo.save(log);

      return {
        logId: log.id,
        message: emailEnabled
          ? 'Notification sent successfully'
          : `Email skipped by user preference for ${dto.eventType}; in-app created`,
      };
    } catch (error) {
      log.status = 'FAILED';
      log.errorMessage = error instanceof Error ? error.message : String(error);
      await this.logRepo.save(log);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('INTERNAL_ERROR', 'Failed to send notification', {
        eventType: dto.eventType,
        channel,
        reason: log.errorMessage,
      });
    }
  }

  private resolveUserId(templateData: Record<string, string>): string {
    return String(
      templateData?.userId ||
        templateData?.customerId ||
        templateData?.customer_id ||
        '',
    ).trim();
  }

  private async isEmailEnabledForEvent(
    userId: string,
    eventType: string,
  ): Promise<boolean> {
    const preference = await this.userPreferenceRepo.findOne({
      where: { userId: String(userId).trim(), eventType: String(eventType).trim() },
    });
    if (!preference) return true;
    return Boolean(preference.emailEnabled);
  }

  private async dispatchEmail(
    eventType: string,
    recipient: string,
    language: string,
    templateData: Record<string, string>,
    log: NotificationLogEntity,
  ): Promise<void> {
    const orderIdRaw = templateData.orderId || '';
    const deliveryIdRaw = templateData.deliveryId || '';
    const subTotalRaw = templateData.subTotal || '';
    const shippingFeeRaw = templateData.shippingFee || '';
    const totalAmountRaw = templateData.totalAmount || '';
    const itemsJsonRaw = templateData.itemsJson || '[]';

    const estimatedDeliveryAtRaw = templateData.estimatedDeliveryAt || '';

    const orderCreatedAt =
      templateData.orderCreatedAt ||
      templateData.order_created_at ||
      templateData.createdAt ||
      templateData.timestamp ||
      '';
    const normalizedTemplateData = {
      ...templateData,
      statusLabel: this.toStatusLabel(templateData.status || ''),
      ctaUrl: templateData.ctaUrl || 'https://hakora.com',
      orderIdDisplay: orderIdRaw
        ? toHkrOrderDisplayId(orderIdRaw, orderCreatedAt)
        : this.toDisplayId(deliveryIdRaw),
      deliveryIdDisplay: this.toDisplayId(deliveryIdRaw),
      estimatedDeliveryAtDisplay: this.toEstimatedDeliveryDisplay(estimatedDeliveryAtRaw),
      subTotalDisplay: this.toVnd(subTotalRaw),
      shippingFeeDisplay: this.toVnd(shippingFeeRaw),
      totalAmountDisplay: this.toVnd(
        totalAmountRaw || templateData.amount || '',
      ),
      itemsTableRows: this.toItemsTableRows(itemsJsonRaw, templateData.currency || 'VND'),
      paymentMethodDisplay: this.toPaymentMethodLabel(
        templateData.paymentMethod || templateData.payment_method || '',
      ),
      transactionIdDisplay: this.toTransactionIdDisplay(
        templateData.stripePaymentIntentId ||
          templateData.stripe_payment_intent_id ||
          templateData.paymentId ||
          '',
      ),
      paidAtDisplay: this.toPaidAtDisplay(
        templateData.paidAt || templateData.timestamp || '',
      ),
      note:
        String(templateData.note || '').trim() ||
        'Transaction recorded on Hakora.',
    };
    const rendered = await this.templateService.renderEmailTemplate(
      eventType,
      normalizedTemplateData,
      language,
    );

    log.subject = rendered.subject;
    log.bodyPreview = rendered.body.slice(0, 400);

    await this.emailAdapter.sendEmail(recipient, rendered.subject, rendered.body);
  }

  private async dispatchInApp(
    eventId: string,
    eventType: string,
    templateData: Record<string, string>,
  ): Promise<void> {
    const userId = String(
      templateData.userId || templateData.customerId || templateData.customer_id || '',
    ).trim();
    if (!userId) return;

    const ctx = this.extractOrderContext(templateData);
    const copy = this.buildInAppCopy(eventType, ctx, templateData);
    const actorRole = String(templateData.actorRole || '').trim().toLowerCase();

    const { row, created } = await this.inAppNotificationService.create({
      userId,
      eventId: `${eventId}-inapp`,
      eventType,
      category: copy.category,
      title: copy.title,
      body: copy.body,
      linkUrl: copy.linkUrl,
      orderId: ctx.orderId || undefined,
      orderIdDisplay: ctx.orderIdDisplay,
      statusLabel: ctx.statusLabel,
      totalAmountDisplay: ctx.totalAmountDisplay,
      productName: ctx.productName,
      productThumbnailUrl: ctx.productThumbnailUrl,
      itemCount: ctx.itemCount,
      priority: this.resolveInAppPriority(eventType, actorRole, templateData),
    });

    if (created && row) {
      void this.inAppRealtimePublisher.publish(row);
    }
  }

  private extractOrderContext(templateData: Record<string, string>): {
    orderId: string;
    orderIdDisplay: string;
    statusLabel: string;
    totalAmountDisplay: string;
    productName: string;
    productThumbnailUrl: string;
    itemCount: number;
  } {
    const orderId = String(templateData.orderId || '').trim();
    const orderCreatedAt =
      templateData.orderCreatedAt ||
      templateData.order_created_at ||
      templateData.createdAt ||
      templateData.created_at ||
      '';
    const orderIdDisplay = orderId
      ? toHkrOrderDisplayId(orderId, orderCreatedAt)
      : '';
    const statusLabel = this.toStatusLabel(templateData.status || '');
    const totalAmountRaw = String(
      templateData.totalAmount || templateData.subTotal || templateData.amount || '',
    ).trim();
    const totalAmountDisplay = totalAmountRaw ? this.toVnd(totalAmountRaw) : '';

    let productName = String(
      templateData.productName || templateData.product_name || '',
    ).trim();
    let productThumbnailUrl = String(
      templateData.productThumbnailUrl ||
        templateData.product_thumbnail_url ||
        '',
    ).trim();
    let itemCount = Number(templateData.itemCount || templateData.item_count || 0);
    const itemsJson = String(templateData.itemsJson || '').trim();
    if (itemsJson) {
      try {
        const items = JSON.parse(itemsJson) as Array<Record<string, unknown>>;
        if (Array.isArray(items) && items.length > 0) {
          itemCount = items.length;
          const first = items[0] ?? {};
          if (!productName) {
            productName = String(
              first.productName || first.name || first.title || '',
            ).trim();
          }
          if (!productThumbnailUrl) {
            productThumbnailUrl = String(
              first.thumbnailUrl ||
                first.imageUrl ||
                first.productImageUrl ||
                '',
            ).trim();
          }
        }
      } catch {
        // ignore malformed items json
      }
    }

    return {
      orderId,
      orderIdDisplay,
      statusLabel,
      totalAmountDisplay,
      productName,
      productThumbnailUrl,
      itemCount,
    };
  }

  private buildInAppCopy(
    eventType: string,
    ctx: {
      orderIdDisplay: string;
      statusLabel: string;
      totalAmountDisplay: string;
      productName: string;
      itemCount: number;
    },
    templateData: Record<string, string>,
  ): { title: string; body: string; linkUrl: string; category: string } {
    const actorRole = String(templateData.actorRole || '').trim().toLowerCase();
    const customTitle = String(
      templateData.inAppTitle || templateData.notificationTitle || '',
    ).trim();
    const customBody = String(
      templateData.inAppBody || templateData.notificationBody || '',
    ).trim();
    const platformEvents = new Set([
      'system.announcement',
      'compliance.report.created',
      'chat.message.received',
    ]);
    if (customTitle || platformEvents.has(eventType)) {
      const platformTitleMap: Record<string, string> = {
        'system.announcement': 'Platform announcement',
        'compliance.report.created': 'New compliance report',
        'chat.message.received': 'New message',
      };
      const title = customTitle || platformTitleMap[eventType] || 'Notification';
      const body =
        customBody ||
        String(templateData.note || '').trim() ||
        title;
      const reportId = String(templateData.reportId || '').trim();
      const senderId = String(templateData.senderId || '').trim();
      let defaultLink = String(templateData.ctaUrl || templateData.cta_url || '').trim();
      if (!defaultLink && eventType === 'compliance.report.created' && reportId) {
        defaultLink = `/admin/complaints/${reportId}`;
      }
      if (!defaultLink && eventType === 'chat.message.received' && senderId) {
        defaultLink = `/admin/messages?userId=${encodeURIComponent(senderId)}`;
      }
      if (!defaultLink && actorRole === 'admin') {
        defaultLink = '/admin/notifications';
      }
      return {
        title,
        body,
        linkUrl: this.resolveInAppLinkUrl('', defaultLink, actorRole),
        category: 'system-updates',
      };
    }
    const titleMap: Record<string, string> = {
      'order.created': 'Order placed successfully',
      'order.confirmed': 'Store confirmed your order',
      'order.cancelled': 'Order cancelled',
      'order.shipped': 'Order is on the way',
      'order.delivered': 'Order delivered',
      'order.completed': 'Order completed',
      'delivery.shipped': 'Shipment in transit',
      'delivery.delivered': 'Delivery successful',
      'payment.succeeded': 'Payment successful',
      'payment.failed': 'Payment failed',
      'payment.refunded': 'Payment refunded',
      'payment.rejected': 'Payment declined',
    };
    const sellerTitleMap: Record<string, string> = {
      'order.created': 'New order awaiting supplier',
      'order.confirmed': 'Supplier confirmed order',
      'order.rejected': 'Supplier rejected order',
      'order.cancelled': 'Supplier cancelled order',
      'order.shipped': 'Supplier handed off to carrier',
      'order.delivered': 'Order delivered',
      'order.completed': 'Order completed',
      'delivery.shipped': 'Order in transit',
      'delivery.delivered': 'Order delivered to customer',
    };
    const supplierTitleMap: Record<string, string> = {
      'order.created': 'New order needs action',
      'order.confirmed': 'Order confirmed',
      'order.rejected': 'You rejected the order',
      'order.cancelled': 'Order cancelled',
      'order.shipped': 'Order shipped',
      'order.delivered': 'Order delivered',
      'order.completed': 'Order completed',
      'delivery.shipped': 'Order in transit',
      'delivery.delivered': 'Order delivered',
      'order.confirmation_deadline': 'Confirmation deadline soon',
      'order.confirm_deadline_soon': 'Confirmation deadline soon',
      'order.deadline_soon': 'Confirmation deadline soon',
      'delivery.failed': 'Delivery failed',
      'order.complaint': 'Order disputed',
      'order.complained': 'Order disputed',
      'order.disputed': 'Order disputed',
      'payment.rejected': 'Payment declined',
    };

    const roleAwareTitleMap =
      actorRole === 'seller'
        ? sellerTitleMap
        : actorRole === 'supplier'
          ? supplierTitleMap
          : titleMap;
    let title = roleAwareTitleMap[eventType] || 'Order update';
    const isCustomer =
      actorRole !== 'seller' && actorRole !== 'supplier';
    if (isCustomer && eventType === 'order.rejected') {
      const shopName = this.resolveShopDisplayName(templateData);
      title = `${shopName} rejected your order`;
    } else if (isCustomer && eventType === 'order.confirmed') {
      const shopName = this.resolveShopDisplayName(templateData);
      title = `${shopName} confirmed your order`;
    } else if (actorRole === 'seller') {
      title = this.buildSellerTitle(eventType, templateData, title);
    }

    const isOrderEvent =
      eventType.startsWith('order.') || eventType.startsWith('delivery.');
    const isPaymentEvent = eventType.startsWith('payment.');
    const note = String(templateData.note || '').trim();
    let body = isPaymentEvent
      ? this.buildPaymentInAppBody(ctx, templateData, eventType)
      : isOrderEvent
        ? this.buildInAppBody(ctx)
        : note || this.buildInAppBody(ctx);
    if (isCustomer && eventType === 'order.rejected') {
      body = this.buildCustomerRejectedBody(ctx, templateData);
    } else if (actorRole === 'seller' && eventType === 'order.rejected') {
      body = this.buildSellerRejectedBody(ctx, templateData);
    }

    let category = 'order-updates';
    if (eventType.startsWith('payment.')) {
      category = 'payment-status';
    } else if (eventType.startsWith('system.')) {
      category = 'system-updates';
    }

    const orderId = String(templateData.orderId || '').trim();
    const ctaUrl = String(templateData.ctaUrl || templateData.cta_url || '').trim();

    return {
      title,
      body,
      linkUrl: this.resolveInAppLinkUrl(orderId, ctaUrl, actorRole),
      category,
    };
  }

  /** Path nội bộ theo role (seller/supplier/customer). */
  private resolveInAppLinkUrl(
    orderId: string,
    ctaUrl: string,
    actorRole: string,
  ): string {
    const url = String(ctaUrl || '').trim();
    if (url.startsWith('/admin/')) {
      return url;
    }
    if (url.startsWith('/seller/') || url.startsWith('/supplier/') || url.startsWith('/customer/')) {
      return url;
    }
    if (orderId) {
      if (actorRole === 'admin') return `/admin/orders/${orderId}`;
      if (actorRole === 'seller') return `/seller/orders/${orderId}`;
      if (actorRole === 'supplier') return `/supplier/orders/${orderId}`;
      return `/customer/account/my-purchases/order/${orderId}`;
    }
    if (actorRole === 'admin') {
      return '/admin/notifications';
    }
    const match = url.match(/\/my-purchases\/order\/([^/?#]+)/i);
    if (match?.[1]) {
      return `/customer/account/my-purchases/order/${match[1]}`;
    }
    return '';
  }

  private resolveShopDisplayName(templateData: Record<string, string>): string {
    const name = String(
      templateData.sellerName || templateData.seller_name || '',
    ).trim();
    return name || 'Store';
  }

  private resolveSupplierDisplayName(templateData: Record<string, string>): string {
    const name = String(
      templateData.supplierName || templateData.supplier_name || '',
    ).trim();
    return name || 'Supplier';
  }

  private buildSellerTitle(
    eventType: string,
    templateData: Record<string, string>,
    fallback: string,
  ): string {
    const supplierName = this.resolveSupplierDisplayName(templateData);
    const map: Record<string, string> = {
      'order.created': `New order awaiting ${supplierName}`,
      'order.confirmed': `${supplierName} confirmed the order`,
      'order.rejected': `${supplierName} rejected the order`,
      'order.cancelled': `${supplierName} cancelled the order`,
      'order.shipped': `${supplierName} handed off to carrier`,
      'order.delivered': `${supplierName} delivered the order`,
    };
    return map[eventType] || fallback;
  }

  private buildSellerRejectedBody(
    ctx: {
      productName: string;
      itemCount: number;
      totalAmountDisplay: string;
    },
    templateData: Record<string, string>,
  ): string {
    const parts: string[] = [];
    const productLine = this.buildInAppBody(ctx);
    if (productLine) parts.push(productLine);
    const rejectReason = this.extractRejectReason(templateData);
    if (rejectReason) {
      parts.push(`Reason: ${rejectReason}`);
    }
    return parts.join(' · ');
  }

  private extractRejectReason(templateData: Record<string, string>): string {
    const reason = String(templateData.reason || '').trim();
    if (reason && reason !== 'Rejected by supplier') {
      return reason;
    }
    const note = String(templateData.note || '').trim();
    const prefixed =
      note.match(/(?:từ chối đơn|rejected order|reason):\s*(.+)$/i);
    if (prefixed?.[1]) return prefixed[1].trim();
    if (note && !/ncc|supplier/i.test(note)) return note;
    return '';
  }

  /** Customer: sản phẩm + tiền + lý do từ chối (không dùng thuật ngữ NCC). */
  private buildCustomerRejectedBody(
    ctx: {
      productName: string;
      itemCount: number;
      totalAmountDisplay: string;
    },
    templateData: Record<string, string>,
  ): string {
    const parts: string[] = [];
    const productLine = this.buildInAppBody(ctx);
    if (productLine) parts.push(productLine);
    const rejectReason = this.extractRejectReason(templateData);
    if (rejectReason) {
      parts.push(`Reason: ${rejectReason}`);
    }
    return parts.join(' · ');
  }

  /** Subtitle gọn — không lặp title, mã đơn, trạng thái (đã có ở field riêng). */
  private buildPaymentInAppBody(
    ctx: {
      orderIdDisplay: string;
      totalAmountDisplay: string;
      statusLabel: string;
    },
    templateData: Record<string, string>,
    eventType: string,
  ): string {
    const parts: string[] = [];
    if (ctx.orderIdDisplay) {
      parts.push(`Order ${ctx.orderIdDisplay}`);
    }
    const method = this.toPaymentMethodLabel(
      templateData.paymentMethod || templateData.payment_method || '',
    );
    if (method && method !== 'Online payment') {
      parts.push(method);
    }
    if (
      ctx.totalAmountDisplay &&
      !ctx.totalAmountDisplay.startsWith('0 ')
    ) {
      parts.push(ctx.totalAmountDisplay);
    }
    const tx = this.toTransactionIdDisplay(
      templateData.stripePaymentIntentId ||
        templateData.stripe_payment_intent_id ||
        '',
    );
    if (tx && tx !== 'N/A') {
      parts.push(`Txn ${tx}`);
    }
    if (eventType === 'payment.failed') {
      const failNote = String(templateData.note || templateData.reason || '').trim();
      if (failNote) parts.push(failNote);
    }
    return parts.join(' · ') || ctx.statusLabel || 'Payment update';
  }

  private toPaymentMethodLabel(raw: string): string {
    const key = String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/-/g, '_');
    const map: Record<string, string> = {
      CREDIT_CARD: 'Credit / debit card',
      DEBIT_CARD: 'Debit card',
      EWALLET: 'E-wallet',
      CARD: 'Bank card',
      COD: 'Cash on delivery (COD)',
    };
    return map[key] || (key ? raw : 'Online payment (Stripe)');
  }

  private toTransactionIdDisplay(raw: string): string {
    const id = String(raw || '').trim();
    if (!id) return 'N/A';
    if (id.startsWith('pi_') && id.length > 16) {
      return `${id.slice(0, 10)}…${id.slice(-6)}`;
    }
    return this.toDisplayId(id);
  }

  private toPaidAtDisplay(raw: string): string {
    const value = String(raw || '').trim();
    if (!value) {
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private buildInAppBody(ctx: {
    productName: string;
    itemCount: number;
    totalAmountDisplay: string;
  }): string {
    const parts: string[] = [];
    if (ctx.productName) {
      const extra =
        ctx.itemCount > 1 ? ` (+${ctx.itemCount - 1} more)` : '';
      parts.push(`${ctx.productName}${extra}`);
    } else if (ctx.itemCount > 0) {
      parts.push(`${ctx.itemCount} item${ctx.itemCount > 1 ? 's' : ''}`);
    }
    if (ctx.totalAmountDisplay && !ctx.totalAmountDisplay.startsWith('0 ')) {
      parts.push(ctx.totalAmountDisplay);
    }
    return parts.join(' · ');
  }

  /**
   * Supplier priority:
   * - action_required: đơn mới cần xử lý (order.created)
   * - urgent: sắp quá hạn xác nhận, giao thất bại, khiếu nại, thanh toán bị từ chối
   * - normal: cập nhật thông thường
   */
  private resolveInAppPriority(
    eventType: string,
    actorRole: string,
    templateData: Record<string, string> = {},
  ): string {
    if (actorRole === 'admin') {
      const explicitAdmin = String(
        templateData.notificationPriority || templateData.notification_priority || '',
      )
        .trim()
        .toLowerCase();
      if (['urgent', 'action_required', 'normal'].includes(explicitAdmin)) {
        return explicitAdmin;
      }
      if (
        eventType === 'compliance.report.created' ||
        eventType === 'chat.message.received'
      ) {
        return 'action_required';
      }
      return 'normal';
    }

    if (actorRole !== 'supplier') return 'normal';

    const explicit = String(
      templateData.notificationPriority || templateData.notification_priority || '',
    )
      .trim()
      .toLowerCase();
    if (['urgent', 'action_required', 'normal'].includes(explicit)) {
      return explicit;
    }

    const status = String(templateData.status || '').trim().toUpperCase();
    const isDeliveryFailed =
      eventType === 'delivery.failed' ||
      (eventType.startsWith('delivery.') && status === 'FAILED');

    const urgentEvents = new Set([
      'order.confirmation_deadline',
      'order.confirm_deadline_soon',
      'order.deadline_soon',
      'delivery.failed',
      'order.complaint',
      'order.complained',
      'order.disputed',
      'payment.rejected',
    ]);
    if (urgentEvents.has(eventType) || isDeliveryFailed) {
      return 'urgent';
    }

    const actionRequiredEvents = new Set(['order.created']);
    if (actionRequiredEvents.has(eventType)) {
      return 'action_required';
    }

    return 'normal';
  }

  private toStatusLabel(statusRaw: string): string {
    const status = String(statusRaw || '').trim().toUpperCase();
    const map: Record<string, string> = {
      CREATED: 'New order',
      PENDING: 'Pending confirmation',
      CONFIRMED: 'Confirmed',
      REJECTED: 'Rejected',
      SHIPPED: 'Shipped',
      DELIVERED: 'Delivered',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      FAILED: 'Failed',
      SUCCEEDED: 'Payment successful',
      REFUNDED: 'Refunded',
      UPDATED: 'Updated',
      PICKED_UP: 'Picked up',
      DELIVERING: 'Out for delivery',
      IN_TRANSIT: 'In transit',
      OUT_FOR_DELIVERY: 'Out for delivery',
      PICKUP_READY: 'Ready for pickup',
    };
    return map[status] || (statusRaw ? String(statusRaw) : 'Updated');
  }

  private toDisplayId(idRaw: string): string {
    const id = String(idRaw || '').trim();
    if (!id) return 'N/A';
    // UUID -> ngắn gọn để dễ đọc trong email
    if (id.length > 18) {
      return `${id.slice(0, 8)}...${id.slice(-4)}`;
    }
    return id;
  }

  private toEstimatedDeliveryDisplay(raw: string): string {
    const value = String(raw || '').trim();
    if (!value) return 'Updating soon';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private toVnd(amountRaw: string): string {
    const amount = Number(String(amountRaw || '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) return String(amountRaw || '0 VND');
    const formatted = new Intl.NumberFormat('en-US').format(Math.round(amount));
    return `${formatted} VND`;
  }

  private toItemsTableRows(itemsJsonRaw: string, currencyRaw: string): string {
    try {
      const parsed = JSON.parse(itemsJsonRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [
          '<tr>',
          '  <td colspan="4" style="padding:12px 10px;text-align:center;color:#6B7280;font-size:13px;">',
          '    Chưa có dữ liệu sản phẩm cho đơn hàng này.',
          '  </td>',
          '</tr>',
        ].join('');
      }

      return parsed
        .map((raw, index) => {
          const item = (raw ?? {}) as Record<string, unknown>;
          const productName = String(
            item.productName || item.name || item.title || `Sản phẩm ${index + 1}`,
          );
          const quantity = Number(item.quantity ?? 1);
          const unitPrice = this.toMoney(
            item.unitPrice ?? item.price ?? 0,
            String(currencyRaw || 'VND'),
          );
          const lineTotal = this.toMoney(
            item.lineTotal ?? Number(item.unitPrice ?? item.price ?? 0) * quantity,
            String(currencyRaw || 'VND'),
          );

          return [
            '<tr>',
            `  <td style="padding:10px 8px;border-top:1px solid #F1F5F9;color:#111827;font-size:13px;">${productName}</td>`,
            `  <td align="center" style="padding:10px 8px;border-top:1px solid #F1F5F9;color:#374151;font-size:13px;">${Number.isFinite(quantity) ? quantity : 1}</td>`,
            `  <td align="right" style="padding:10px 8px;border-top:1px solid #F1F5F9;color:#374151;font-size:13px;">${unitPrice}</td>`,
            `  <td align="right" style="padding:10px 8px;border-top:1px solid #F1F5F9;color:#111827;font-size:13px;font-weight:700;">${lineTotal}</td>`,
            '</tr>',
          ].join('');
        })
        .join('');
    } catch {
      return [
        '<tr>',
        '  <td colspan="4" style="padding:12px 10px;text-align:center;color:#6B7280;font-size:13px;">',
        '    Không thể đọc dữ liệu sản phẩm.',
        '  </td>',
        '</tr>',
      ].join('');
    }
  }

  private toMoney(amountRaw: unknown, currencyRaw: string): string {
    const amount = Number(String(amountRaw ?? '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) return '0';
    const formatted = new Intl.NumberFormat('vi-VN').format(Math.round(amount));
    const currency = String(currencyRaw || 'VND').toUpperCase();
    return currency === 'VND' ? `${formatted} VND` : `${formatted} ${currency}`;
  }

  private validateSendNotificationDto(dto: SendNotificationDto): void {
    if (!dto.eventId?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'eventId is required');
    }
    if (!dto.eventType?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'eventType is required');
    }
    if (!dto.channel?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'channel is required');
    }

    const channel = dto.channel.toUpperCase() as NotificationChannel;
    if (!SUPPORTED_CHANNELS.includes(channel)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `channel must be one of: ${SUPPORTED_CHANNELS.join(', ')}`,
      );
    }

    if (channel === 'EMAIL' && !dto.recipient?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'recipient is required');
    }

    if (!dto.templateData || typeof dto.templateData !== 'object') {
      throw new AppError('VALIDATION_ERROR', 'templateData is required');
    }
  }
}
