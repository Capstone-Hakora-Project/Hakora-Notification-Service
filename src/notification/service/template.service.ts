import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import { RenderedTemplate } from '../dto/send-notification.dto';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly templateRepo: Repository<NotificationTemplateEntity>,
  ) {}

  async renderEmailTemplate(
    eventType: string,
    data: Record<string, unknown>,
    language: string = 'vi',
  ): Promise<RenderedTemplate> {
    const template = await this.templateRepo.findOne({
      where: {
        eventType,
        channel: 'EMAIL',
        language,
        isActive: true,
      },
    });

    const fallback = this.getFallbackTemplate(eventType);
    const subjectTemplate = template?.subjectTemplate || fallback.subjectTemplate;
    const bodyTemplate = template?.bodyTemplate || fallback.bodyTemplate;

    return {
      subject: this.interpolate(subjectTemplate, data),
      body: this.interpolate(bodyTemplate, data),
    };
  }

  private interpolate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      const value = data[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }

  private getFallbackTemplate(eventType: string): {
    subjectTemplate: string;
    bodyTemplate: string;
  } {
    if (eventType.startsWith('order.')) {
      const copy = this.getOrderStatusCopy(eventType);
      return {
        subjectTemplate: copy.subject,
        bodyTemplate: this.buildOrderEmailBody(copy.intro),
      };
    }

    if (eventType.startsWith('payment.')) {
      const copy = this.getPaymentStatusCopy(eventType);
      return {
        subjectTemplate: copy.subject,
        bodyTemplate: this.buildPaymentEmailBody(copy.intro),
      };
    }

    const isDelivered = eventType === 'delivery.delivered';
    const subjectTemplate = isDelivered
      ? '[Hakora] Đơn hàng đã giao thành công #{{orderIdDisplay}}'
      : '[Hakora] Đơn hàng đang được giao #{{orderIdDisplay}}';
    const introLine = isDelivered
      ? 'Đơn hàng <b>#{{orderIdDisplay}}</b> của bạn đã được giao thành công.'
      : 'Đơn hàng <b>#{{orderIdDisplay}}</b> đang được vận chuyển đến bạn.';

    return {
      subjectTemplate,
      bodyTemplate: [
        '<!doctype html>',
        '<html lang="vi">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<title>Hakora</title>',
        '</head>',
          '<body style="margin:0;padding:0;background:#EEF2F7;font-family:\'Segoe UI\',Arial,Helvetica,sans-serif;color:#111827;">',
        '  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">',
        '    Cập nhật giao hàng #{{deliveryId}}',
        '  </div>',
        '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EEF2F7;padding:32px 12px;">',
        '    <tr>',
        '      <td align="center">',
        '        <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;box-shadow:0 8px 24px rgba(15,23,42,0.08);">',
        '          <tr>',
        '            <td style="background:#1F2937;padding:18px 22px;">',
        '              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
        '                <tr>',
        '                  <td style="vertical-align:middle;">',
        '                    <img src="cid:hakora-logo" alt="Hakora" width="110" style="display:block;border:0;"/>',
        '                  </td>',
          '                  <td align="right" style="vertical-align:middle;color:#F9FAFB;font-size:13px;font-weight:700;letter-spacing:0.04em;">THÔNG BÁO GIAO HÀNG</td>',
        '                </tr>',
        '              </table>',
        '            </td>',
        '          </tr>',
        '          <tr>',
        '            <td style="padding:20px 22px 10px 22px;">',
        '              <div style="font-size:13px;color:#6B7280;">Xin chào</div>',
        '              <div style="font-size:22px;line-height:30px;font-weight:700;color:#111827;margin-top:2px;">{{customerName}}</div>',
        `              <div style="margin-top:10px;font-size:14px;line-height:22px;color:#374151;">${introLine}</div>`,
        '            </td>',
        '          </tr>',
        '          <tr>',
        '            <td style="padding:0 22px 0 22px;">',
        '              <div style="border:1px solid #F3D2CC;background:#FFF5F2;border-radius:10px;padding:12px 14px;">',
          '                <div style="font-size:12px;color:#9A3412;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Trạng thái giao hàng</div>',
        '                <div style="margin-top:6px;font-size:18px;font-weight:800;color:#EE4D2D;">{{statusLabel}}</div>',
        '              </div>',
        '            </td>',
        '          </tr>',
        '          <tr>',
        '            <td style="padding:14px 22px 0 22px;">',
        '              <div style="border:1px solid #E5E7EB;border-radius:10px;background:#FAFAFA;padding:12px 14px;">',
          '                <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:8px;">Thông tin giao hàng</div>',
        '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;">',
        '                  <tr><td style="padding:6px 0;color:#6B7280;">Mã đơn</td><td align="right" style="padding:6px 0;font-weight:700;">#{{orderIdDisplay}}</td></tr>',
        '                  <tr><td style="padding:6px 0;color:#6B7280;">Đơn vị vận chuyển</td><td align="right" style="padding:6px 0;font-weight:700;">{{provider}}</td></tr>',
        '                  <tr><td style="padding:6px 0;color:#6B7280;">Mã vận đơn</td><td align="right" style="padding:6px 0;font-weight:800;color:#EE4D2D;">{{trackingNumber}}</td></tr>',
        '                  <tr><td style="padding:6px 0;color:#6B7280;">Dự kiến giao</td><td align="right" style="padding:6px 0;font-weight:700;">{{estimatedDeliveryAtDisplay}}</td></tr>',
        '                </table>',
        '                <div style="margin-top:8px;padding-top:10px;border-top:1px solid #E5E7EB;font-size:13px;line-height:20px;color:#374151;">{{note}}</div>',
        '              </div>',
        '            </td>',
        '          </tr>',
        '          <tr>',
        '            <td style="padding:16px 22px 6px 22px;">',
          '              <a href="{{ctaUrl}}" style="display:block;width:100%;text-align:center;background:linear-gradient(90deg,#EE4D2D,#FF7A45);color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:800;padding:14px 16px;border-radius:10px;">Theo dõi giao hàng</a>',
        '            </td>',
        '          </tr>',
        '          <tr>',
        '            <td style="background:#F8FAFC;padding:18px 22px;text-align:center;">',
        '              <div style="font-size:13px;color:#6B7280;line-height:20px;">❤️ Hakora xin cảm ơn quý khách.</div>',
        '            </td>',
        '          </tr>',
        '        </table>',
        '      </td>',
        '    </tr>',
        '  </table>',
        '</body>',
        '</html>',
      ].join(''),
    };
  }

  private getPaymentStatusCopy(eventType: string): {
    subject: string;
    intro: string;
  } {
    const map: Record<string, { subject: string; intro: string }> = {
      'payment.succeeded': {
        subject: '[Hakora] Thanh toán thành công #{{orderIdDisplay}}',
        intro:
          'Thanh toán cho đơn <b>#{{orderIdDisplay}}</b> đã được xác nhận với số tiền <b>{{totalAmountDisplay}}</b>.',
      },
      'payment.failed': {
        subject: '[Hakora] Thanh toán thất bại',
        intro:
          'Giao dịch thanh toán không thành công. {{note}}',
      },
      'payment.refunded': {
        subject: '[Hakora] Hoàn tiền #{{orderIdDisplay}}',
        intro:
          'Khoản thanh toán cho đơn <b>#{{orderIdDisplay}}</b> đã được hoàn lại.',
      },
      'payment.rejected': {
        subject: '[Hakora] Thanh toán bị từ chối',
        intro: 'Thanh toán của bạn đã bị từ chối. {{note}}',
      },
    };
    return (
      map[eventType] ?? {
        subject: '[Hakora] Cập nhật thanh toán',
        intro: 'Trạng thái thanh toán của bạn đã được cập nhật.',
      }
    );
  }

  private buildPaymentEmailBody(introLine: string): string {
    return [
      '<!doctype html>',
      '<html lang="vi">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<title>Hakora</title>',
      '</head>',
      '<body style="margin:0;padding:0;background:#EEF2F7;font-family:\'Segoe UI\',Arial,Helvetica,sans-serif;color:#111827;">',
      '  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">',
      '    Biên lai thanh toán #{{orderIdDisplay}}',
      '  </div>',
      '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EEF2F7;padding:32px 12px;">',
      '    <tr>',
      '      <td align="center">',
      '        <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;box-shadow:0 8px 24px rgba(15,23,42,0.08);">',
      '          <tr>',
      '            <td style="background:#1F2937;padding:18px 22px;">',
      '              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
      '                <tr>',
      '                  <td style="vertical-align:middle;">',
      '                    <img src="cid:hakora-logo" alt="Hakora" width="110" style="display:block;border:0;"/>',
      '                  </td>',
      '                  <td align="right" style="vertical-align:middle;color:#F9FAFB;font-size:13px;font-weight:700;letter-spacing:0.04em;">BIÊN LAI THANH TOÁN</td>',
      '                </tr>',
      '              </table>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:20px 22px 10px 22px;">',
      '              <div style="font-size:13px;color:#6B7280;">Xin chào</div>',
      '              <div style="font-size:22px;line-height:30px;font-weight:700;color:#111827;margin-top:2px;">{{customerName}}</div>',
      `              <div style="margin-top:10px;font-size:14px;line-height:22px;color:#374151;">${introLine}</div>`,
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:0 22px 0 22px;">',
      '              <div style="border:1px solid #F3D2CC;background:#FFF5F2;border-radius:10px;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#9A3412;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Trạng thái giao dịch</div>',
      '                <div style="margin-top:6px;font-size:18px;font-weight:800;color:#EE4D2D;">{{statusLabel}}</div>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:14px 22px 0 22px;">',
      '              <div style="border:1px solid #E5E7EB;border-radius:12px;background:#FAFAFA;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:8px;">Chi tiết thanh toán</div>',
      '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;border-collapse:collapse;">',
      '                  <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #E5E7EB;">Mã đơn hàng</td><td align="right" style="padding:8px 0;font-weight:700;border-bottom:1px solid #E5E7EB;">#{{orderIdDisplay}}</td></tr>',
      '                  <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #E5E7EB;">Phương thức</td><td align="right" style="padding:8px 0;font-weight:700;border-bottom:1px solid #E5E7EB;">{{paymentMethodDisplay}}</td></tr>',
      '                  <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #E5E7EB;">Mã giao dịch</td><td align="right" style="padding:8px 0;font-family:Consolas,Monaco,monospace;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;">{{transactionIdDisplay}}</td></tr>',
      '                  <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #E5E7EB;">Thời gian</td><td align="right" style="padding:8px 0;font-weight:700;border-bottom:1px solid #E5E7EB;">{{paidAtDisplay}}</td></tr>',
      '                  <tr><td style="padding:10px 0;color:#111827;font-weight:700;">Tổng thanh toán</td><td align="right" style="padding:10px 0;font-size:18px;font-weight:900;color:#EE4D2D;">{{totalAmountDisplay}}</td></tr>',
      '                </table>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:12px 22px 0 22px;">',
      '              <div style="border-left:3px solid #EE4D2D;background:#FFFBFA;padding:10px 12px;border-radius:0 8px 8px 0;font-size:13px;line-height:20px;color:#374151;">',
      '                <strong style="color:#111827;">Lưu ý:</strong> {{note}}',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:16px 22px 6px 22px;">',
      '              <a href="{{ctaUrl}}" style="display:block;width:100%;text-align:center;background:linear-gradient(90deg,#EE4D2D,#FF7A45);color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:800;padding:14px 16px;border-radius:999px;">Xem đơn hàng</a>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="background:#F8FAFC;padding:18px 22px;text-align:center;">',
      '              <div style="font-size:13px;color:#6B7280;line-height:20px;">Giữ email này làm biên lai thanh toán. Nếu cần hỗ trợ, phản hồi email hoặc liên hệ Hakora.</div>',
      '            </td>',
      '          </tr>',
      '        </table>',
      '      </td>',
      '    </tr>',
      '  </table>',
      '</body>',
      '</html>',
    ].join('');
  }

  private getOrderStatusCopy(eventType: string): { subject: string; intro: string } {
    const defaults = {
      subject: '[Hakora] Cập nhật đơn hàng #{{orderIdDisplay}}',
      intro:
        'Đơn hàng <b>#{{orderIdDisplay}}</b> tại shop <b>{{sellerName}}</b> đã được cập nhật.',
    };
    const map: Record<string, { subject: string; intro: string }> = {
      'order.created': {
        subject: '[Hakora] Đặt hàng thành công #{{orderIdDisplay}}',
        intro:
          'Cảm ơn bạn! Đơn hàng <b>#{{orderIdDisplay}}</b> tại shop <b>{{sellerName}}</b> đã được tiếp nhận.',
      },
      'order.confirmed': {
        subject: '[Hakora] Đơn hàng đã xác nhận #{{orderIdDisplay}}',
        intro:
          'Đơn hàng <b>#{{orderIdDisplay}}</b> tại shop <b>{{sellerName}}</b> đã được xác nhận.',
      },
      'order.cancelled': {
        subject: '[Hakora] Đơn hàng đã hủy #{{orderIdDisplay}}',
        intro:
          'Đơn hàng <b>#{{orderIdDisplay}}</b> tại shop <b>{{sellerName}}</b> đã bị hủy.',
      },
      'order.rejected': {
        subject: '[Hakora] {{sellerName}} đã từ chối đơn #{{orderIdDisplay}}',
        intro:
          'Rất tiếc, shop <b>{{sellerName}}</b> đã từ chối đơn hàng <b>#{{orderIdDisplay}}</b>. Lý do: <b>{{note}}</b>',
      },
      'order.shipped': {
        subject: '[Hakora] Đơn hàng đang giao #{{orderIdDisplay}}',
        intro:
          'Đơn hàng <b>#{{orderIdDisplay}}</b> đã được bàn giao vận chuyển.',
      },
      'order.delivered': {
        subject: '[Hakora] Đơn hàng đã giao #{{orderIdDisplay}}',
        intro: 'Đơn hàng <b>#{{orderIdDisplay}}</b> đã được giao thành công.',
      },
      'order.completed': {
        subject: '[Hakora] Đơn hàng hoàn tất #{{orderIdDisplay}}',
        intro: 'Đơn hàng <b>#{{orderIdDisplay}}</b> đã hoàn tất.',
      },
      'order.updated': defaults,
    };
    return map[eventType] ?? defaults;
  }

  private buildOrderEmailBody(introLine: string): string {
    return [
      '<!doctype html>',
      '<html lang="vi">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<title>Hakora</title>',
      '</head>',
      '<body style="margin:0;padding:0;background:#EEF2F7;font-family:\'Segoe UI\',Arial,Helvetica,sans-serif;color:#111827;">',
      '  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">',
      '    Cập nhật đơn hàng #{{orderIdDisplay}}',
      '  </div>',
      '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EEF2F7;padding:32px 12px;">',
      '    <tr>',
      '      <td align="center">',
      '        <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;box-shadow:0 8px 24px rgba(15,23,42,0.08);">',
      '          <tr>',
      '            <td style="background:#1F2937;padding:18px 22px;">',
      '              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
      '                <tr>',
      '                  <td style="vertical-align:middle;">',
      '                    <img src="cid:hakora-logo" alt="Hakora" width="110" style="display:block;border:0;"/>',
      '                  </td>',
      '                  <td align="right" style="vertical-align:middle;color:#F9FAFB;font-size:13px;font-weight:700;letter-spacing:0.04em;">THÔNG BÁO ĐƠN HÀNG</td>',
      '                </tr>',
      '              </table>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:20px 22px 10px 22px;">',
      '              <div style="font-size:13px;color:#6B7280;">Xin chào</div>',
      '              <div style="font-size:22px;line-height:30px;font-weight:700;color:#111827;margin-top:2px;">{{customerName}}</div>',
      `              <div style="margin-top:10px;font-size:14px;line-height:22px;color:#374151;">${introLine}</div>`,
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:0 22px 0 22px;">',
      '              <div style="border:1px solid #F3D2CC;background:#FFF5F2;border-radius:10px;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#9A3412;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Trạng thái đơn hàng</div>',
      '                <div style="margin-top:6px;font-size:18px;font-weight:800;color:#EE4D2D;">{{statusLabel}}</div>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:14px 22px 0 22px;">',
      '              <div style="border:1px solid #E2E8F0;border-radius:12px;background:#FFFFFF;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:8px;">Chi tiết sản phẩm</div>',
      '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
      '                  <tr style="background:#F8FAFC;">',
      '                    <th align="left" style="padding:10px 8px;color:#475569;font-size:12px;font-weight:700;">Sản phẩm</th>',
      '                    <th align="center" style="padding:10px 8px;color:#475569;font-size:12px;font-weight:700;">SL</th>',
      '                    <th align="right" style="padding:10px 8px;color:#475569;font-size:12px;font-weight:700;">Đơn giá</th>',
      '                    <th align="right" style="padding:10px 8px;color:#475569;font-size:12px;font-weight:700;">Thành tiền</th>',
      '                  </tr>',
      '                  {{itemsTableRows}}',
      '                </table>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:12px 22px 0 22px;">',
      '              <div style="border:1px solid #E5E7EB;border-radius:12px;background:#FAFAFA;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:8px;">Thông tin đơn hàng</div>',
      '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;">',
      '                  <tr><td style="padding:6px 0;color:#6B7280;">Mã đơn</td><td align="right" style="padding:6px 0;font-weight:700;">#{{orderIdDisplay}}</td></tr>',
      '                  <tr><td style="padding:6px 0;color:#6B7280;">Shop</td><td align="right" style="padding:6px 0;font-weight:700;">{{sellerName}}</td></tr>',
      '                </table>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:12px 22px 0 22px;">',
      '              <div style="border:1px solid #E5E7EB;border-radius:12px;background:#FAFAFA;padding:12px 14px;">',
      '                <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:8px;">Tổng kết thanh toán</div>',
      '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;">',
      '                  <tr><td style="padding:6px 0;color:#6B7280;">Tạm tính</td><td align="right" style="padding:6px 0;font-weight:700;">{{subTotalDisplay}}</td></tr>',
      '                  <tr><td style="padding:6px 0;color:#6B7280;">Phí ship</td><td align="right" style="padding:6px 0;font-weight:700;">{{shippingFeeDisplay}}</td></tr>',
      '                  <tr><td colspan="2" style="padding:4px 0;"><div style="border-top:1px dashed #CBD5E1;"></div></td></tr>',
      '                  <tr><td style="padding:6px 0;color:#111827;font-weight:700;">Tổng cộng</td><td align="right" style="padding:6px 0;font-weight:900;color:#EE4D2D;">{{totalAmountDisplay}}</td></tr>',
      '                </table>',
      '                <div style="margin-top:8px;padding-top:10px;border-top:1px solid #E5E7EB;font-size:13px;line-height:20px;color:#374151;">{{note}}</div>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="padding:16px 22px 6px 22px;">',
      '              <a href="{{ctaUrl}}" style="display:block;width:100%;text-align:center;background:linear-gradient(90deg,#EE4D2D,#FF7A45);color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:800;padding:14px 16px;border-radius:999px;">Xem chi tiết đơn hàng</a>',
      '            </td>',
      '          </tr>',
      '          <tr>',
      '            <td style="background:#F8FAFC;padding:18px 22px;text-align:center;">',
      '              <div style="font-size:13px;color:#6B7280;line-height:20px;">❤️ Hakora xin cảm ơn quý khách.</div>',
      '            </td>',
      '          </tr>',
      '        </table>',
      '      </td>',
      '    </tr>',
      '  </table>',
      '</body>',
      '</html>',
    ].join('');
  }
}

