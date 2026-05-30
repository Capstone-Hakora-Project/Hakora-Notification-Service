import {
  Controller,
  Logger,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { assertUserAccess } from '../../common/auth/assert-user-access.util';
import { extractAuth } from '../../common/auth/grpc-metadata.util';
import { GrpcAuthGuard } from '../../common/auth/grpc-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { validateDto } from '../../common/validation/validate-dto.util';
import type { NotificationChannel } from '../dto/send-notification.dto';
import {
  DeleteReadInAppNotificationsRequest,
  GetUserNotificationPreferencesRequest,
  ListInAppNotificationsRequest,
  MarkAllInAppNotificationsReadRequest,
  MarkInAppNotificationReadRequest,
  SendNotificationRequest,
  UpdateUserNotificationPreferenceRequest,
} from '../dto/notification-request.dto';
import { mapInAppNotificationsToGrpcItems } from '../mappers/notification-response.mapper';
import { NotificationService } from '../service/notification.service';

const USER_SCOPED_ROLES = [
  'CUSTOMER',
  'SELLER',
  'SUPPLIER',
  'ADMIN',
  'INTERNAL',
] as const;

@UseGuards(GrpcAuthGuard, RolesGuard)
@Controller()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'SendNotification')
  @Public()
  async sendNotification(data: unknown, _metadata: Metadata) {
    this.logger.log(`[SendNotification] received: ${JSON.stringify(data)}`);
    try {
      const dto = await validateDto(SendNotificationRequest, data);
      const result = await this.notificationService.sendNotification({
        eventId: dto.event_id,
        eventType: dto.event_type,
        channel: dto.channel.toUpperCase() as NotificationChannel,
        recipient: dto.recipient ?? '',
        language: dto.language ?? 'vi',
        templateData: dto.template_data ?? {},
      });

      return {
        success: true,
        message: result.message,
        log_id: result.logId,
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[SendNotification] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'ListInAppNotifications')
  @Roles(...USER_SCOPED_ROLES)
  async listInAppNotifications(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(ListInAppNotificationsRequest, data);
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const result = await this.notificationService.listInAppNotifications({
        userId: dto.user_id,
        category: dto.category,
        page: dto.page,
        limit: dto.limit,
      });

      return {
        success: true,
        message: 'OK',
        items: mapInAppNotificationsToGrpcItems(result.items),
        total: result.total,
        unread_count: result.unreadCount,
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[ListInAppNotifications] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'MarkInAppNotificationRead')
  @Roles(...USER_SCOPED_ROLES)
  async markInAppNotificationRead(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(MarkInAppNotificationReadRequest, data);
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const ok = await this.notificationService.markInAppNotificationRead(
        dto.user_id,
        dto.notification_id,
      );

      if (!ok) {
        throw new NotFoundException('Notification not found');
      }

      return {
        success: true,
        message: 'Marked as read',
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[MarkInAppNotificationRead] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'MarkAllInAppNotificationsRead')
  @Roles(...USER_SCOPED_ROLES)
  async markAllInAppNotificationsRead(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(MarkAllInAppNotificationsReadRequest, data);
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const count = await this.notificationService.markAllInAppNotificationsRead(
        dto.user_id,
      );

      return {
        success: true,
        message: 'All notifications marked as read',
        updated_count: count,
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[MarkAllInAppNotificationsRead] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'DeleteReadInAppNotifications')
  @Roles(...USER_SCOPED_ROLES)
  async deleteReadInAppNotifications(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(DeleteReadInAppNotificationsRequest, data);
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const deletedCount =
        await this.notificationService.deleteReadInAppNotifications(
          dto.user_id,
        );

      return {
        success: true,
        message: 'Read notifications deleted',
        deleted_count: deletedCount,
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[DeleteReadInAppNotifications] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'GetUserNotificationPreferences')
  @Roles(...USER_SCOPED_ROLES)
  async getUserNotificationPreferences(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(
        GetUserNotificationPreferencesRequest,
        data,
      );
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const items = await this.notificationService.listUserPreferences(
        dto.user_id,
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
      this.logger.error(
        `[GetUserNotificationPreferences] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }

  @GrpcMethod('NotificationService', 'UpdateUserNotificationPreference')
  @Roles(...USER_SCOPED_ROLES)
  async updateUserNotificationPreference(data: unknown, metadata: Metadata) {
    try {
      const dto = await validateDto(
        UpdateUserNotificationPreferenceRequest,
        data,
      );
      assertUserAccess(extractAuth(metadata), dto.user_id);

      const row = await this.notificationService.updateUserPreference(
        dto.user_id,
        dto.event_type,
        dto.email_enabled,
      );

      return {
        success: true,
        message: 'Preference updated',
        event_type: row.eventType,
        email_enabled: row.emailEnabled,
        error: '',
      };
    } catch (error) {
      this.logger.error(
        `[UpdateUserNotificationPreference] failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw error;
    }
  }
}
