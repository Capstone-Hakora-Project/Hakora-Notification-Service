import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushAdapter {
  private readonly logger = new Logger(PushAdapter.name);

  async sendPush(token: string, title: string, body: string): Promise<void> {
    this.logger.log(
      `[PushAdapter] TODO: send push token=${token.slice(0, 8)}..., title="${title}", body="${body.slice(0, 80)}"`,
    );
  }
}

