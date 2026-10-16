/**
 * SMS brandname — bộ nối chung, khai bằng JSON thay vì viết mã cho từng nhà cung cấp.
 *
 * Hầu hết nhà cung cấp SMS ở Việt Nam đều là REST đơn giản: một URL, vài trường
 * form hoặc JSON, và một mã tin trong phản hồi. File `config/sms.json` mô tả
 * đúng những thứ đó nên đổi nhà cung cấp không phải sửa mã và không phải deploy lại.
 *
 * Nếu nhà cung cấp của bạn cần ký HMAC hay nhiều bước, hãy viết một bộ nối riêng
 * theo cùng giao diện `send(payload)` rồi đăng ký ở providers/index.js.
 */
import { upstream, badRequest, shorten } from '../errors.js';
import { normalizeVnPhone } from './zns.js';

/** Lấy giá trị theo đường dẫn kiểu "data.msg_id"; trả undefined nếu không có. */
export function getPath(object, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce(
    (acc, part) => (acc == null ? undefined : acc[part]),
    object
  );
}

/** Thay ${to}, ${text}, ${sender}, ${secret}, ${trackingId} và ${env.TEN_BIEN}. */
export function interpolate(template, vars, env) {
  return String(template).replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (all, name) => {
    if (name.startsWith('env.')) return String(env[name.slice(4)] ?? '');
    return vars[name] !== undefined ? String(vars[name]) : all;
  });
}

function formatPhone(raw, mode) {
  const intl = normalizeVnPhone(raw);
  if (mode === 'raw') return String(raw || '').trim();
  if (mode === '0') return intl.startsWith('84') ? '0' + intl.slice(2) : intl;
  return intl; // mặc định: 84xxxxxxxxx
}

export function createSmsProvider({ config, env = process.env, fetchImpl = fetch }) {
  const spec = config.sms;

  return {
    channel: 'SMS',

    async send(payload) {
      if (!spec || !spec.url) {
        throw badRequest('Gateway chưa có config/sms.json; chưa khai bộ nối nhà cung cấp SMS.');
      }

      const providerConfig = payload.provider_config || {};
      const secret = config.secretFromRef(providerConfig.secret_ref);
      if (spec.requireSecret !== false && !secret) {
        throw badRequest(
          `Gateway chưa có bí mật cho secret_ref=${providerConfig.secret_ref || '(trống)'}; nạp biến môi trường cùng tên.`
        );
      }

      const to = formatPhone(payload.to, spec.phoneFormat);
      if (!/^\d{9,15}$/.test(to)) {
        throw badRequest(`Số điện thoại không hợp lệ cho SMS: ${shorten(payload.to, 20)}`);
      }

      const vars = {
        to,
        text: payload.body,
        sender: providerConfig.sender_id || spec.defaultSender || '',
        secret,
        trackingId: payload.idempotencyKey
      };

      const fields = {};
      for (const [key, value] of Object.entries(spec.fields || {})) {
        fields[key] = interpolate(value, vars, env);
      }
      const headers = {};
      for (const [key, value] of Object.entries(spec.headers || {})) {
        headers[key] = interpolate(value, vars, env);
      }

      const isJson = (spec.contentType || 'json') === 'json';
      headers['Content-Type'] = isJson ? 'application/json' : 'application/x-www-form-urlencoded';

      let response;
      try {
        response = await fetchImpl(spec.url, {
          method: spec.method || 'POST',
          headers,
          body: isJson ? JSON.stringify(fields) : new URLSearchParams(fields),
          signal: AbortSignal.timeout(Number(spec.timeoutMs || 15000))
        });
      } catch (err) {
        throw upstream(`Không gọi được nhà cung cấp SMS: ${shorten(err.message, 100)}`);
      }

      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = { _raw: text }; }

      if (!response.ok) {
        throw upstream(shorten(`Nhà cung cấp SMS trả HTTP ${response.status}: ${text}`));
      }

      // Nhiều nhà cung cấp trả HTTP 200 kèm mã lỗi trong thân phản hồi.
      if (spec.successPath !== undefined) {
        const actual = getPath(result, spec.successPath);
        if (String(actual) !== String(spec.successEquals)) {
          throw upstream(shorten(
            `Nhà cung cấp SMS báo lỗi ${spec.successPath}=${actual}: ${getPath(result, spec.errorPath) || text}`
          ));
        }
      }

      const messageId = spec.messageIdPath ? getPath(result, spec.messageIdPath) : undefined;
      if (!messageId) {
        throw upstream('Nhà cung cấp SMS không trả mã tin; chưa coi là đã gửi.');
      }

      return { messageId: String(messageId), meta: {} };
    }
  };
}
