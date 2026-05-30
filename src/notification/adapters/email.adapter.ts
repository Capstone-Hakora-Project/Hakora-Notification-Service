import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class EmailAdapter {
  private readonly logger = new Logger(EmailAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('MAIL_FROM') || 'noreply@hakora.com';

    if (!host || !user || !pass) {
      // Dev-safe fallback: do not crash service when SMTP is not ready.
      this.logger.warn(
        `[EmailAdapter] SMTP chưa cấu hình đầy đủ, giả lập gửi email tới ${to} với subject="${subject}"`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const configuredLogoPath = this.configService.get<string>('EMAIL_LOGO_PATH');
    const fallbackLogoPath = join(process.cwd(), '..', 'Droppshipping-client', 'public', 'Logoo.png');
    const logoPath = configuredLogoPath && configuredLogoPath.trim() ? configuredLogoPath.trim() : fallbackLogoPath;
    const hasLogo = existsSync(logoPath);

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      attachments: hasLogo
        ? [
            {
              filename: 'Hakora-Logo.png',
              path: logoPath,
              cid: 'hakora-logo',
            },
          ]
        : [],
    });
  }
}

