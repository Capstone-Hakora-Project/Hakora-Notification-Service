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
        'Giao dịch đã được ghi nhận trên hệ thống Hakora.',
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
    const titleMap: Record<string, string> = {
      'order.created': 'Đặt hàng thành công',
      'order.confirmed': 'Shop đã xác nhận đơn hàng',
      'order.cancelled': 'Đơn hàng đã bị hủy',
      'order.shipped': 'Đơn hàng đang được giao',
      'order.delivered': 'Đơn hàng đã giao thành công',
      'order.completed': 'Đơn hàng đã hoàn tất',
      'delivery.shipped': 'Đơn đang trên đường giao',
      'delivery.delivered': 'Giao hàng thành công',
      'payment.succeeded': 'Thanh toán thành công',
      'payment.failed': 'Thanh toán thất bại',
      'payment.refunded': 'Đã hoàn tiền',
      'payment.rejected': 'Thanh toán bị từ chối',
    };
    const sellerTitleMap: Record<string, string> = {
      'order.created': 'Đơn mới đang chờ NCC xác nhận',
      'order.confirmed': 'NCC đã xác nhận đơn',
      'order.rejected': 'NCC đã từ chối đơn',
      'order.cancelled': 'NCC đã hủy đơn',
      'order.shipped': 'NCC đã bàn giao vận chuyển',
      'order.delivered': 'Đơn đã giao thành công',
      'order.completed': 'Đơn hàng hoàn tất',
      'delivery.shipped': 'Đơn hàng đang vận chuyển',
      'delivery.delivered': 'Đơn hàng đã giao cho khách',
    };
    const supplierTitleMap: Record<string, string> = {
      'order.created': 'Có đơn hàng mới cần xử lý',
      'order.confirmed': 'Đơn hàng đã xác nhận',
      'order.rejected': 'Bạn đã từ chối đơn hàng',
      'order.cancelled': 'Đơn hàng đã bị hủy',
      'order.shipped': 'Đơn hàng đã xuất kho',
      'order.delivered': 'Đơn hàng giao thành công',
      'order.completed': 'Đơn hàng hoàn tất',
      'delivery.shipped': 'Đơn hàng đang được giao',
      'delivery.delivered': 'Đơn hàng đã giao thành công',
      'order.confirmation_deadline': 'Đơn sắp quá hạn xác nhận',
      'order.confirm_deadline_soon': 'Đơn sắp quá hạn xác nhận',
      'order.deadline_soon': 'Đơn sắp quá hạn xác nhận',
      'delivery.failed': 'Giao hàng thất bại',
      'order.complaint': 'Đơn bị khiếu nại',
      'order.complained': 'Đơn bị khiếu nại',
      'order.disputed': 'Đơn bị khiếu nại',
      'payment.rejected': 'Thanh toán bị từ chối',
    };

    const roleAwareTitleMap =
      actorRole === 'seller'
        ? sellerTitleMap
        : actorRole === 'supplier'
          ? supplierTitleMap
          : titleMap;
    let title = roleAwareTitleMap[eventType] || 'Cập nhật đơn hàng';
    const isCustomer =
      actorRole !== 'seller' && actorRole !== 'supplier';
    if (isCustomer && eventType === 'order.rejected') {
      const shopName = this.resolveShopDisplayName(templateData);
      title = `${shopName} đã từ chối đơn hàng`;
    } else if (isCustomer && eventType === 'order.confirmed') {
      const shopName = this.resolveShopDisplayName(templateData);
      title = `${shopName} đã xác nhận đơn hàng`;
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
    if (url.startsWith('/seller/') || url.startsWith('/supplier/') || url.startsWith('/customer/')) {
      return url;
    }
    if (orderId) {
      if (actorRole === 'seller') return `/seller/orders/${orderId}`;
      if (actorRole === 'supplier') return `/supplier/orders/${orderId}`;
      return `/customer/account/my-purchases/order/${orderId}`;
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
    return name || 'Cửa hàng';
  }

  private resolveSupplierDisplayName(templateData: Record<string, string>): string {
    const name = String(
      templateData.supplierName || templateData.supplier_name || '',
    ).trim();
    return name || 'NCC';
  }

  private buildSellerTitle(
    eventType: string,
    templateData: Record<string, string>,
    fallback: string,
  ): string {
    const supplierName = this.resolveSupplierDisplayName(templateData);
    const map: Record<string, string> = {
      'order.created': `Đơn mới chờ ${supplierName} xác nhận`,
      'order.confirmed': `${supplierName} đã xác nhận đơn`,
      'order.rejected': `${supplierName} đã từ chối đơn`,
      'order.cancelled': `${supplierName} đã hủy đơn`,
      'order.shipped': `${supplierName} đã bàn giao vận chuyển`,
      'order.delivered': `${supplierName} đã giao đơn thành công`,
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
      parts.push(`Lý do: ${rejectReason}`);
    }
    return parts.join(' · ');
  }

  private extractRejectReason(templateData: Record<string, string>): string {
    const reason = String(templateData.reason || '').trim();
    if (reason && reason !== 'Rejected by supplier') {
      return reason;
    }
    const note = String(templateData.note || '').trim();
    const prefixed = note.match(/từ chối đơn:\s*(.+)$/i);
    if (prefixed?.[1]) return prefixed[1].trim();
    if (note && !/ncc/i.test(note)) return note;
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
      parts.push(`Lý do: ${rejectReason}`);
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
      parts.push(`Đơn ${ctx.orderIdDisplay}`);
    }
    const method = this.toPaymentMethodLabel(
      templateData.paymentMethod || templateData.payment_method || '',
    );
    if (method && method !== 'Thanh toán trực tuyến') {
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
      parts.push(`GD ${tx}`);
    }
    if (eventType === 'payment.failed') {
      const failNote = String(templateData.note || templateData.reason || '').trim();
      if (failNote) parts.push(failNote);
    }
    return parts.join(' · ') || ctx.statusLabel || 'Cập nhật thanh toán';
  }

  private toPaymentMethodLabel(raw: string): string {
    const key = String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/-/g, '_');
    const map: Record<string, string> = {
      CREDIT_CARD: 'Thẻ tín dụng / ghi nợ',
      DEBIT_CARD: 'Thẻ ghi nợ',
      EWALLET: 'Ví điện tử',
      CARD: 'Thẻ ngân hàng',
      COD: 'Thanh toán khi nhận (COD)',
    };
    return map[key] || (key ? raw : 'Thanh toán trực tuyến (Stripe)');
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
        ctx.itemCount > 1 ? ` (+${ctx.itemCount - 1} SP)` : '';
      parts.push(`${ctx.productName}${extra}`);
    } else if (ctx.itemCount > 0) {
      parts.push(`${ctx.itemCount} sản phẩm`);
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
      CREATED: 'Đơn hàng mới',
      PENDING: 'Chờ xác nhận',
      CONFIRMED: 'Đã xác nhận',
      REJECTED: 'Đã từ chối',
      SHIPPED: 'Đang giao hàng',
      DELIVERED: 'Đã giao hàng',
      COMPLETED: 'Hoàn tất',
      CANCELLED: 'Đã hủy',
      FAILED: 'Thất bại',
      SUCCEEDED: 'Thanh toán thành công',
      REFUNDED: 'Đã hoàn tiền',
      UPDATED: 'Đã cập nhật',
      PICKED_UP: 'Đã lấy hàng',
      DELIVERING: 'Đang giao đến bạn',
      IN_TRANSIT: 'Đang vận chuyển',
      OUT_FOR_DELIVERY: 'Đang giao đến bạn',
      PICKUP_READY: 'Sẵn sàng lấy hàng',
    };
    return map[status] || (statusRaw ? String(statusRaw) : 'Đã cập nhật');
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
    if (!value) return 'Đang cập nhật';
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
    if (!Number.isFinite(amount)) return String(amountRaw || '0 VNĐ');
    const formatted = new Intl.NumberFormat('vi-VN').format(Math.round(amount));
    return `${formatted} VNĐ`;
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
    return currency === 'VND' ? `${formatted} VNĐ` : `${formatted} ${currency}`;
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
