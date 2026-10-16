/**
 * Log dạng JSON một dòng cho mỗi sự kiện, hợp với Cloud Logging.
 *
 * Tin gửi khách chứa dữ liệu cá nhân. Không ghi `body`, không ghi số điện thoại
 * đầy đủ, không ghi token. Chỉ ghi đủ để đối soát với NotificationMetrics:
 * idempotency key, kênh, mã mẫu, mã tin của nhà cung cấp.
 */
// Danh sách chính xác, không phải khớp mờ: một biểu thức bắt mọi tên có chữ
// "key" sẽ nuốt luôn `idempotencyKey` — đúng thứ cần có trong log để đối soát.
const SECRET_FIELDS = new Set([
  'token', 'secret', 'authorization', 'password', 'apikey',
  'accesstoken', 'refreshtoken', 'bottoken', 'secretkey', 'gatewaytoken'
]);

/** Che số điện thoại: giữ 3 số cuối. */
export function maskAddress(value) {
  const raw = String(value == null ? '' : value);
  if (!raw) return '';
  if (raw.includes('@')) {
    const [name, domain] = raw.split('@');
    return `${name.slice(0, 2)}***@${domain || ''}`;
  }
  return raw.length <= 3 ? '***' : '*'.repeat(Math.max(0, raw.length - 3)) + raw.slice(-3);
}

function safe(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (SECRET_FIELDS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function emit(severity, message, fields) {
  process.stdout.write(JSON.stringify({
    severity,
    time: new Date().toISOString(),
    message,
    ...safe(fields)
  }) + '\n');
}

export const log = {
  info: (message, fields) => emit('INFO', message, fields),
  warn: (message, fields) => emit('WARNING', message, fields),
  error: (message, fields) => emit('ERROR', message, fields)
};
