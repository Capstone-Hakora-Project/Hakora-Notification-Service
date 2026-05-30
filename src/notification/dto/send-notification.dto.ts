export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';

export interface SendNotificationDto {
  eventId: string;
  eventType: string;
  channel: NotificationChannel;
  recipient: string;
  language?: string;
  templateData: Record<string, string>;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}
