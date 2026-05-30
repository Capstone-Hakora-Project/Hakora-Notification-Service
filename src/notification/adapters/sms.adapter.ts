import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);

  async sendSms(phone: string, message: string): Promise<void> {
    this.logger.log(`[SmsAdapter] TODO: send sms to ${phone}. message="${message.slice(0, 80)}"`);
  }
}

