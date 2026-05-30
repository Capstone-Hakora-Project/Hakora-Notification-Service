import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationService } from '../service/notification.service';
import type { NotificationChannel } from '../dto/send-notification.dto';

interface SendNotificationGrpcRequest {
  event_id?: string;
  event_type?: string;
  channel?: string;
  recipient?: string;
  language?: string;
  template_data?: Record<string, string>;
}

interface ListInAppNotificationsGrpcRequest {
  user_id?: string;
  category?: string;
  page?: number;
  limit?: number;
}

interface MarkInAppNotificationReadGrpcRequest {
  user_id?: string;
  notification_id?: string;
}

interface MarkAllInAppNotificationsReadGrpcRequest {
  user_id?: string;
}

interface DeleteReadInAppNotificationsGrpcRequest {
  user_id?: string;
}

interface GetUserNotificationPreferencesGrpcRequest {
  user_id?: string;
}

interface UpdateUserNotificationPreferenceGrpcRequest {
  user_id?: string;
  event_type?: string;
  email_enabled?: boolean;
}

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'SendNotification')
  async sendNotification(request: SendNotificationGrpcRequest): Promise<{
    success: boolean;
    message: string;
    log_id: string;
    error: string;
  }> {
    try {
      const result = await this.notificationService.sendNotification({
        eventId: request.event_id || '',
        eventType: request.event_type || '',
        channel: (request.channel || 'EMAIL').toUpperCase() as NotificationChannel,
        recipient: request.recipient || '',
        language: request.language || 'vi',
        templateData: request.template_data || {},
      });

      return {
        success: true,
        message: result.message,
        log_id: result.logId,
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, message: '', log_id: '', error: err };
    }
  }

  @GrpcMethod('NotificationService', 'ListInAppNotifications')
  async listInAppNotifications(request: ListInAppNotificationsGrpcRequest): Promise<{
    success: boolean;
    message: string;
    items: Array<{
      id: string;
      event_type: string;
      category: string;
      title: string;
      body: string;
      link_url: string;
      is_read: boolean;
      created_at: string;
    }>;
    total: number;
    unread_count: number;
    error: string;
  }> {
    try {
      const result = await this.notificationService.listInAppNotifications({
        userId: request.user_id || '',
        category: request.category,
        page: request.page,
        limit: request.limit,
      });

      return {
        success: true,
        message: 'OK',
        items: result.items.map((item) => ({
          id: item.id,
          event_type: item.eventType,
          category: item.category,
          title: item.title,
          body: item.body,
          link_url: item.linkUrl,
          is_read: item.isRead,
          created_at: item.createdAt.toISOString(),
          order_id: item.orderId || '',
          order_id_display: item.orderIdDisplay || '',
          status_label: item.statusLabel || '',
          total_amount_display: item.totalAmountDisplay || '',
          product_name: item.productName || '',
          product_thumbnail_url: item.productThumbnailUrl || '',
          item_count: item.itemCount ?? 0,
          priority: item.priority || 'normal',
        })),
        total: result.total,
        unread_count: result.unreadCount,
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: '',
        items: [],
        total: 0,
        unread_count: 0,
        error: err,
      };
    }
  }

  @GrpcMethod('NotificationService', 'MarkInAppNotificationRead')
  async markInAppNotificationRead(
    request: MarkInAppNotificationReadGrpcRequest,
  ): Promise<{ success: boolean; message: string; error: string }> {
    try {
      const ok = await this.notificationService.markInAppNotificationRead(
        request.user_id || '',
        request.notification_id || '',
      );
      return {
        success: ok,
        message: ok ? 'Marked as read' : 'Notification not found',
        error: ok ? '' : 'NOT_FOUND',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, message: '', error: err };
    }
  }

  @GrpcMethod('NotificationService', 'MarkAllInAppNotificationsRead')
  async markAllInAppNotificationsRead(
    request: MarkAllInAppNotificationsReadGrpcRequest,
  ): Promise<{
    success: boolean;
    message: string;
    updated_count: number;
    error: string;
  }> {
    try {
      const count = await this.notificationService.markAllInAppNotificationsRead(
        request.user_id || '',
      );
      return {
        success: true,
        message: 'All notifications marked as read',
        updated_count: count,
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, message: '', updated_count: 0, error: err };
    }
  }

  @GrpcMethod('NotificationService', 'DeleteReadInAppNotifications')
  async deleteReadInAppNotifications(
    request: DeleteReadInAppNotificationsGrpcRequest,
  ): Promise<{
    success: boolean;
    message: string;
    deleted_count: number;
    error: string;
  }> {
    try {
      const deletedCount = await this.notificationService.deleteReadInAppNotifications(
        request.user_id || '',
      );
      return {
        success: true,
        message: 'Read notifications deleted',
        deleted_count: deletedCount,
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, message: '', deleted_count: 0, error: err };
    }
  }

  @GrpcMethod('NotificationService', 'GetUserNotificationPreferences')
  async getUserNotificationPreferences(
    request: GetUserNotificationPreferencesGrpcRequest,
  ): Promise<{
    success: boolean;
    message: string;
    items: Array<{ event_type: string; email_enabled: boolean }>;
    error: string;
  }> {
    try {
      const items = await this.notificationService.listUserPreferences(
        request.user_id || '',
      );
      return {
        success: true,
        message: 'OK',
        items: items.map((item) => ({
          event_type: item.eventType,
          email_enabled: item.emailEnabled,
        })),
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, message: '', items: [], error: err };
    }
  }

  @GrpcMethod('NotificationService', 'UpdateUserNotificationPreference')
  async updateUserNotificationPreference(
    request: UpdateUserNotificationPreferenceGrpcRequest,
  ): Promise<{
    success: boolean;
    message: string;
    event_type: string;
    email_enabled: boolean;
    error: string;
  }> {
    try {
      const row = await this.notificationService.updateUserPreference(
        request.user_id || '',
        request.event_type || '',
        Boolean(request.email_enabled),
      );
      return {
        success: true,
        message: 'Preference updated',
        event_type: row.eventType,
        email_enabled: row.emailEnabled,
        error: '',
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: '',
        event_type: '',
        email_enabled: false,
        error: err,
      };
    }
  }
}
