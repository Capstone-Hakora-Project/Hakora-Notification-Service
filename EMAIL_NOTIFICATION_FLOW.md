# Email Notification Flow (Order + Delivery)

## 1) Kiến trúc tổng quan

- API Gateway expose REST tại `POST /notifications/send`.
- API Gateway gọi gRPC `SendNotification` sang `hakora-notification-service`.
- Notification Service xử lý business trong `notification/service/notification.service.ts`.
- `notification/controller/notification.controller.ts` chỉ làm nhiệm vụ gRPC endpoint mỏng (map request/response).
- Template được render bởi `template.service.ts`.
- Gửi email thông qua `adapters/email.adapter.ts` (SMTP/nodemailer).
- Lịch sử gửi email được lưu trong bảng `notification_logs`.

## 2) Luồng xử lý chi tiết

### A. Trigger từ REST (manual trigger / backoffice)

1. Client gọi REST API ở Gateway.
2. Gateway validate cơ bản payload và forward qua gRPC.
3. Notification gRPC controller nhận request và gọi `NotificationService`.
4. `NotificationService`:
   - validate nghiệp vụ,
   - chống gửi trùng theo `eventId + EMAIL`,
   - tạo log `PENDING`,
   - render template theo `eventType`,
   - gọi `EmailAdapter.sendEmail(...)`,
   - cập nhật log `SENT` hoặc `FAILED`.
5. Gateway trả response REST chuẩn `{ isSuccess, data, error }`.

### B. Trigger từ Kafka (event-driven)

1. Service khác publish vào topic `order.events`, `delivery.events`, hoặc `payment.succeeded` / `payment.failed` / `payment.refunded`.
2. Consumer trong notification-service nhận event:
   - `consumers/order-event.consumer.ts` — `order.created`, `order.confirmed`, `order.cancelled`, `order.shipped`, `order.delivered`, `order.completed`, ...
   - `consumers/delivery-event.consumer.ts` — `delivery.shipped`, `delivery.delivered`
   - `consumers/payment-event.consumer.ts` — `payment.succeeded`, `payment.failed`, `payment.refunded` (topic Kafka trùng tên event; checkout thẻ gửi `payment.succeeded` sau `finalize-card-payment` khi đã có `orderId`)
3. **Email giao hàng (Cách A):** `order-service` xử lý `DELIVERY_SUBMITTED` / `DELIVERY_UPDATED`, resolve email qua User gRPC, ghi outbox `DELIVERY_NOTIFICATION` → publish `delivery.events`.
4. Consumer map payload → `SendNotificationDto` và gọi `NotificationService.sendNotification()`.
5. Business flow bên trong service giống manual trigger.

### C. In-app notification

1. Khi gửi email thành công, `NotificationService` tự tạo bản ghi `in_app_notifications` (cần `userId` / `customerId` trong `template_data`).
2. REST API Gateway:
   - `GET /notifications` — danh sách theo user đăng nhập (query `type`, `page`, `limit`)
   - `PATCH /notifications/:id/read`
   - `POST /notifications/read-all`
3. gRPC: `ListInAppNotifications`, `MarkInAppNotificationRead`, `MarkAllInAppNotificationsRead`

## 3) Clean Architecture áp dụng

- Controller không phình: chỉ map I/O.
- Toàn bộ business + xử lý lỗi nằm ở service.
- Adapter tách riêng hạ tầng gửi email.
- Template tách riêng service để dễ thay đổi nội dung.
- Entity tách riêng để quản lý dữ liệu DB:
  - `notification-template.entity.ts`
  - `notification-log.entity.ts`
  - `user-preference.entity.ts`

## 4) Database migration (TypeORM code-first)

**Chuẩn bị:** tạo database `Hakora-NotificationService` trên PostgreSQL trước khi chạy migration.

```bash
# Lần đầu (đã có entity, chưa có bảng) — generate từ entity so với DB
yarn migration:generate InitNotificationSchema

# Chạy migration
yarn migration:run

# Rollback migration gần nhất
yarn migration:revert

# Tạo file migration trống (viết SQL tay)
yarn migration:create TenMigration
```

**Lưu ý:**
- `migration:generate` cần DB đã connect được và entity đã đổi so với schema hiện tại.
- File migration nằm tại: `src/notification/database/migrations/`.
- Data source: `src/notification/database/database-source.ts` (đọc biến `DATABASE_*` từ `.env`).

## 5) Cấu hình môi trường cần có

- `NOTIFICATION_SERVICE_GRPC_PORT` (default `50058`)
- `NOTIFICATION_SERVICE_URL` tại API Gateway (default `127.0.0.1:50058`)
- `KAFKA_BROKER` (default `localhost:9093`)
- SMTP:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `MAIL_FROM`

> Nếu SMTP chưa cấu hình đầy đủ, adapter đang chạy chế độ an toàn: log cảnh báo và giả lập gửi, không làm crash service.

## 6) Endpoint đã có

### REST tại API Gateway

- `POST /notifications/send` (map thẳng sang gRPC `SendNotification`)

### gRPC tại Notification Service

- `SendNotification(SendNotificationRequest)` → `SendNotificationResponse`

**SendNotificationRequest:**

| Field | Mô tả |
|-------|--------|
| `event_id` | Idempotency key |
| `event_type` | `order.created`, `delivery.delivered`, ... |
| `channel` | `EMAIL` (hiện tại) |
| `recipient` | Email người nhận |
| `language` | `vi` (default) |
| `template_data` | Map key/value render template |

