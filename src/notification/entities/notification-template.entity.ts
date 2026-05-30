import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_templates')
@Index(['eventType', 'channel', 'language'], { unique: true })
export class NotificationTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'varchar', length: 30 })
  channel: string;

  @Column({ type: 'varchar', length: 10, default: 'vi' })
  language: string;

  @Column({ name: 'subject_template', type: 'varchar', length: 255, default: '' })
  subjectTemplate: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

