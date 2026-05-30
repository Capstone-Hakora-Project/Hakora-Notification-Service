import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { NotificationController } from './notification.controller';
import { NotificationService } from '../service/notification.service';
import { GrpcAuthGuard } from '../../common/auth/grpc-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { InAppNotificationEntity } from '../entities/in-app-notification.entity';

jest.mock('../../common/validation/validate-dto.util', () => ({
  validateDto: jest.fn(async (_cls: unknown, data: unknown) => data),
}));

describe('NotificationController', () => {
  let controller: NotificationController;
  let notificationService: jest.Mocked<
    Pick<
      NotificationService,
      | 'sendNotification'
      | 'listInAppNotifications'
      | 'markInAppNotificationRead'
      | 'markAllInAppNotificationsRead'
      | 'deleteReadInAppNotifications'
      | 'listUserPreferences'
      | 'updateUserPreference'
    >
  >;

  const authMetadata = (): Metadata => {
    const metadata = new Metadata();
    metadata.set('userid', 'user-1');
    metadata.set('userrole', 'CUSTOMER');
    return metadata;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: {
            sendNotification: jest.fn(),
            listInAppNotifications: jest.fn(),
            markInAppNotificationRead: jest.fn(),
            markAllInAppNotificationsRead: jest.fn(),
            deleteReadInAppNotifications: jest.fn(),
            listUserPreferences: jest.fn(),
            updateUserPreference: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(GrpcAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(NotificationController);
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should return proto-shaped success response', async () => {
      notificationService.sendNotification.mockResolvedValue({
        message: 'Sent',
        logId: 'log-1',
      });

      const result = await controller.sendNotification(
        {
          event_id: 'evt-1',
          event_type: 'ORDER_CREATED',
          channel: 'EMAIL',
          recipient: 'a@b.com',
          template_data: { name: 'Test' },
        },
        authMetadata(),
      );

      expect(notificationService.sendNotification).toHaveBeenCalledWith({
        eventId: 'evt-1',
        eventType: 'ORDER_CREATED',
        channel: 'EMAIL',
        recipient: 'a@b.com',
        language: 'vi',
        templateData: { name: 'Test' },
      });
      expect(result).toEqual({
        success: true,
        message: 'Sent',
        log_id: 'log-1',
        error: '',
      });
    });
  });

  describe('listInAppNotifications', () => {
    it('should map in-app notifications to grpc items', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const entity = {
        id: 'n-1',
        eventType: 'ORDER_CREATED',
        category: 'order-updates',
        title: 'Order',
        body: 'Body',
        linkUrl: '/orders/1',
        isRead: false,
        createdAt,
        orderId: 'o-1',
        orderIdDisplay: 'HKR-1',
        statusLabel: 'Pending',
        totalAmountDisplay: '100 VNĐ',
        productName: 'Product',
        productThumbnailUrl: 'https://img',
        itemCount: 2,
        priority: 'normal',
      } as InAppNotificationEntity;

      notificationService.listInAppNotifications.mockResolvedValue({
        items: [entity],
        total: 1,
        unreadCount: 1,
      });

      const result = await controller.listInAppNotifications(
        { user_id: 'user-1', page: 1, limit: 20 },
        authMetadata(),
      );

      expect(result).toEqual({
        success: true,
        message: 'OK',
        items: [
          {
            id: 'n-1',
            event_type: 'ORDER_CREATED',
            category: 'order-updates',
            title: 'Order',
            body: 'Body',
            link_url: '/orders/1',
            is_read: false,
            created_at: createdAt.toISOString(),
            order_id: 'o-1',
            order_id_display: 'HKR-1',
            status_label: 'Pending',
            total_amount_display: '100 VNĐ',
            product_name: 'Product',
            product_thumbnail_url: 'https://img',
            item_count: 2,
            priority: 'normal',
          },
        ],
        total: 1,
        unread_count: 1,
        error: '',
      });
    });
  });

  describe('markInAppNotificationRead', () => {
    it('should throw NotFoundException when notification is missing', async () => {
      notificationService.markInAppNotificationRead.mockResolvedValue(false);

      await expect(
        controller.markInAppNotificationRead(
          { user_id: 'user-1', notification_id: 'missing' },
          authMetadata(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
