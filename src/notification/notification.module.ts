import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';
import { LoggingInterceptor } from '../common/interceptor/logging.interceptor';
import { GrpcAuthGuard } from '../common/auth/grpc-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { NotificationController } from './controller/notification.controller';
import { EmailAdapter } from './adapters/email.adapter';
import { InAppAdapter } from './adapters/in-app.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { DeliveryEventConsumer } from './consumers/delivery-event.consumer';
import { OrderEventConsumer } from './consumers/order-event.consumer';
import { PaymentEventConsumer } from './consumers/payment-event.consumer';
import { InAppNotificationEntity } from './entities/in-app-notification.entity';
import { NotificationLogEntity } from './entities/notification-log.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { InAppNotificationService } from './service/in-app-notification.service';
import { NotificationService } from './service/notification.service';
import { TemplateService } from './service/template.service';
import { InAppRealtimePublisherService } from './service/in-app-realtime-publisher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationTemplateEntity,
      NotificationLogEntity,
      InAppNotificationEntity,
      UserPreferenceEntity,
    ]),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: RpcExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    GrpcAuthGuard,
    RolesGuard,
    NotificationService,
    InAppNotificationService,
    TemplateService,
    InAppRealtimePublisherService,
    EmailAdapter,
    SmsAdapter,
    PushAdapter,
    InAppAdapter,
  ],
  controllers: [
    NotificationController,
    OrderEventConsumer,
    DeliveryEventConsumer,
    PaymentEventConsumer,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
