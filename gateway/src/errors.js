/**
 * Lỗi có mã HTTP kèm sẵn.
 *
 * LS-Routing cắt phần thân phản hồi còn 200 ký tự đầu để ghi vào cột `note`
 * của NotificationOutbox. Vì vậy thông điệp phải ngắn, tiếng Việt, và nói đúng
 * việc người vận hành cần làm — không dán nguyên phản hồi của nhà cung cấp.
 */
export class GatewayError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.detail = detail;
  }
}

export const badRequest = (m, d) => new GatewayError(400, m, d);
export const unauthorized = (m) => new GatewayError(401, m);
export const conflict = (m) => new GatewayError(409, m);
export const notImplemented = (m) => new GatewayError(501, m);
export const upstream = (m, d) => new GatewayError(502, m, d);

/** Rút gọn để chắc chắn vừa 200 ký tự LS-Routing lưu lại. */
export function shorten(text, max = 180) {
  const one = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : one.slice(0, max - 1) + '…';
}
