/** Mã đơn hiển thị: HKR-YYMMDD-XXX (ví dụ HKR-250529-001) */
export function toHkrOrderDisplayId(
  orderId: string,
  createdAt?: string | Date | null,
): string {
  const id = String(orderId || '').trim();
  if (!id) return '';

  const date = parseCreatedAt(createdAt) ?? new Date();
  const yymmdd = formatYyMmDd(date);
  const seq = sequenceFromUuid(id);
  return `HKR-${yymmdd}-${seq}`;
}

function parseCreatedAt(raw?: string | Date | null): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatYyMmDd(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Số thứ tự 001–999 ổn định theo UUID (không cần counter DB). */
function sequenceFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const slice = hex.length >= 8 ? hex.slice(-8) : hex;
  const num = (parseInt(slice, 16) % 999) + 1;
  return String(num).padStart(3, '0');
}
