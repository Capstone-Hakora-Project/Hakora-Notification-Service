import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_logs')
@Index(['eventId', 'channel'], { unique: true })
export class NotificationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 120, default: '' })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  @Column({ type: 'varchar', length: 30 })
  channel: string;

  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  subject: string;

  @Column({ name: 'body_preview', type: 'text', default: '' })
  bodyPreview: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

