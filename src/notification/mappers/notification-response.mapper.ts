import type { InAppNotificationEntity } from '../entities/in-app-notification.entity';

export interface InAppNotificationGrpcItem {
  id: string;
  event_type: string;
  category: string;
  title: string;
  body: string;
  link_url: string;
  is_read: boolean;
  created_at: string;
  order_id: string;
  order_id_display: string;
  status_label: string;
  total_amount_display: string;
  product_name: string;
  product_thumbnail_url: string;
  item_count: number;
  priority: string;
}

export function mapInAppNotificationToGrpcItem(
  item: InAppNotificationEntity,
): InAppNotificationGrpcItem {
  return {
    id: item.id,
    event_type: item.eventType,
    category: item.category,
    title: item.title,
    body: item.body,
    link_url: item.linkUrl,
    is_read: item.isRead,
    created_at: item.createdAt.toISOString(),
    order_id: item.orderId || '',
    order_id_display: item.orderIdDisplay || '',
    status_label: item.statusLabel || '',
    total_amount_display: item.totalAmountDisplay || '',
    product_name: item.productName || '',
    product_thumbnail_url: item.productThumbnailUrl || '',
    item_count: item.itemCount ?? 0,
    priority: item.priority || 'normal',
  };
}

export function mapInAppNotificationsToGrpcItems(
  items: InAppNotificationEntity[],
): InAppNotificationGrpcItem[] {
  return items.map(mapInAppNotificationToGrpcItem);
}
