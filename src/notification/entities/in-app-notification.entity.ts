import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('in_app_notifications')
@Index(['userId', 'createdAt'])
@Index(['eventId', 'userId'], { unique: true })
export class InAppNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 80 })
  userId: string;

  @Column({ name: 'event_id', type: 'varchar', length: 120 })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  /** order-updates | payment-status | system-updates | seller-response */
  @Column({ type: 'varchar', length: 50, default: 'order-updates' })
  category: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'link_url', type: 'varchar', length: 500, default: '' })
  linkUrl: string;

  @Column({ name: 'order_id', type: 'varchar', length: 120, nullable: true })
  orderId?: string | null;

  @Column({ name: 'order_id_display', type: 'varchar', length: 40, default: '' })
  orderIdDisplay: string;

  @Column({ name: 'status_label', type: 'varchar', length: 80, default: '' })
  statusLabel: string;

  @Column({ name: 'total_amount_display', type: 'varchar', length: 40, default: '' })
  totalAmountDisplay: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255, default: '' })
  productName: string;

  @Column({ name: 'product_thumbnail_url', type: 'varchar', length: 500, default: '' })
  productThumbnailUrl: string;

  @Column({ name: 'item_count', type: 'int', default: 0 })
  itemCount: number;

  /** urgent | action_required | normal — chủ yếu cho supplier */
  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
