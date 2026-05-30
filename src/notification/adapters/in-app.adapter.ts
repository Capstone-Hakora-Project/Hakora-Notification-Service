import { Injectable } from '@nestjs/common';
import {
  CreateInAppNotificationInput,
  InAppNotificationService,
} from '../service/in-app-notification.service';

@Injectable()
export class InAppAdapter {
  constructor(private readonly inAppNotificationService: InAppNotificationService) {}

  async publishInApp(input: CreateInAppNotificationInput): Promise<void> {
    await this.inAppNotificationService.create(input);
  }
}

