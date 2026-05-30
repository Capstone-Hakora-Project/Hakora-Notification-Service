import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SendNotificationRequest {
  @IsString()
  @IsNotEmpty({ message: 'event_id is required' })
  event_id: string;

  @IsString()
  @IsNotEmpty({ message: 'event_type is required' })
  event_type: string;

  @IsString()
  @IsNotEmpty({ message: 'channel is required' })
  channel: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsObject({ message: 'template_data must be an object' })
  template_data: Record<string, string>;
}

export class ListInAppNotificationsRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MarkInAppNotificationReadRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @IsString()
  @IsNotEmpty({ message: 'notification_id is required' })
  notification_id: string;
}

export class MarkAllInAppNotificationsReadRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;
}

export class DeleteReadInAppNotificationsRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;
}

export class GetUserNotificationPreferencesRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;
}

export class UpdateUserNotificationPreferenceRequest {
  @IsString()
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @IsString()
  @IsNotEmpty({ message: 'event_type is required' })
  event_type: string;

  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'email_enabled must be boolean' })
  email_enabled: boolean;
}
