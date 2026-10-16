/**
 * Đọc và kiểm tra cấu hình từ biến môi trường.
 *
 * Nguyên tắc: thiếu cấu hình bắt buộc thì dừng ngay lúc khởi động, không để
 * tới lúc có tin thật mới phát hiện. Bí mật chỉ đọc từ môi trường, không bao
 * giờ ghi ra log.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function readJson(file, fallback) {
  const full = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

export function loadConfig(env = process.env) {
  const authToken = String(env.GATEWAY_TOKEN || '').trim();
  if (!authToken) throw new Error('Thiếu biến môi trường bắt buộc: GATEWAY_TOKEN');
  if (authToken.length < 24) {
    throw new Error('GATEWAY_TOKEN quá ngắn; dùng chuỗi ngẫu nhiên tối thiểu 24 ký tự.');
  }

  return {
    port: Number(env.PORT || 8080),
    authToken,

    // Kho lưu khóa chống trùng và token xoay vòng của Zalo.
    store: {
      driver: String(env.STORE_DRIVER || 'memory'),          // memory | firestore
      collection: String(env.STORE_COLLECTION || 'ls_gateway'),
      ttlDays: Number(env.IDEMPOTENCY_TTL_DAYS || 45)
    },

    // Bí mật tra theo secret_ref mà LS-Routing gửi sang.
    // Ví dụ secret_ref = "LS_ZBS_SECRET" -> đọc env LS_ZBS_SECRET.
    secretFromRef(ref) {
      const key = String(ref || '').trim();
      if (!key || !/^[A-Z0-9_]{3,64}$/.test(key)) return '';
      return String(env[key] || '').trim();
    },

    zns: {
      enabled: String(env.ZNS_ENABLED || 'true') !== 'false',
      oauthUrl: String(env.ZNS_OAUTH_URL || 'https://oauth.zaloapp.com/v4/oa/access_token'),
      sendUrl: String(env.ZNS_SEND_URL || 'https://business.openapi.zalo.me/message/template'),
      // Refresh token khởi tạo; sau lần làm mới đầu tiên, giá trị mới nằm ở store.
      bootstrapRefreshToken: String(env.ZNS_REFRESH_TOKEN || '').trim(),
      timeoutMs: Number(env.ZNS_TIMEOUT_MS || 15000)
    },

    telegram: {
      enabled: String(env.TELEGRAM_ENABLED || 'true') !== 'false',
      apiBase: String(env.TELEGRAM_API_BASE || 'https://api.telegram.org'),
      botToken: String(env.TELEGRAM_BOT_TOKEN || '').trim(),
      timeoutMs: Number(env.TELEGRAM_TIMEOUT_MS || 15000)
    },

    sms: readJson(env.SMS_CONFIG_FILE || 'config/sms.json', null),

    templates: readJson(env.TEMPLATE_MAP_FILE || 'config/templates.json', {}),

    // GMF chỉ bật khi tổ chức đã xác nhận có quyền gửi nhóm.
    zaloGroup: {
      enabled: String(env.GMF_ENABLED || 'false') === 'true',
      sendUrl: String(env.GMF_SEND_URL || '').trim()
    },

    // Bật để chạy kiểm thử mà không gọi nhà cung cấp thật.
    mockMode: String(env.MOCK_PROVIDERS || 'false') === 'true'
  };
}

export { requireEnv, readJson };
