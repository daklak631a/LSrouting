/**
 * Sổ đăng ký bộ nối theo kênh.
 *
 * LS-Routing gửi kèm cả `channel` và `provider`. Kênh quyết định loại bộ nối;
 * `provider` chỉ dùng khi một kênh có nhiều nhà cung cấp song song — lúc đó
 * đăng ký thêm khóa "SMS:ten_nha_cung_cap".
 */
import { createZnsProvider } from './zns.js';
import { createSmsProvider } from './sms.js';
import { createTelegramProvider } from './telegram.js';
import { createZaloGroupProvider } from './zaloGroup.js';
import { badRequest } from '../errors.js';

/** Bộ nối giả cho kiểm thử và diễn tập; không gọi ra ngoài. */
export function createMockProvider(channel) {
  return {
    channel,
    async send(payload) {
      if (String(payload.to).includes('FAIL')) {
        const { upstream } = await import('../errors.js');
        throw upstream('Bộ nối giả được yêu cầu trả lỗi.');
      }
      return { messageId: `mock_${channel}_${payload.idempotencyKey}`.slice(0, 64), meta: { mock: true } };
    }
  };
}

const SUPPORTED = ['ZBS', 'SMS', 'GMF', 'TELEGRAM'];

export function createRegistry({ config, store, fetchImpl = fetch, env = process.env }) {
  const registry = new Map();

  if (config.mockMode) {
    for (const channel of SUPPORTED) registry.set(channel, createMockProvider(channel));
  } else {
    registry.set('ZBS', createZnsProvider({ config, store, fetchImpl }));
    registry.set('SMS', createSmsProvider({ config, env, fetchImpl }));
    registry.set('TELEGRAM', createTelegramProvider({ config, fetchImpl }));
    registry.set('GMF', createZaloGroupProvider({ config, fetchImpl }));
  }

  return {
    resolve(channel, provider) {
      const key = String(channel || '').toUpperCase();
      const named = provider ? `${key}:${String(provider).toLowerCase()}` : '';
      if (named && registry.has(named)) return registry.get(named);
      if (registry.has(key)) return registry.get(key);
      // EMAIL và IN_APP do chính Apps Script xử lý, không bao giờ tới gateway.
      if (key === 'EMAIL' || key === 'IN_APP') {
        throw badRequest(`Kênh ${key} do Apps Script tự gửi, không đi qua gateway.`);
      }
      throw badRequest(`Kênh không hỗ trợ: ${key || '(trống)'}`);
    },
    register(key, provider) { registry.set(key, provider); },
    channels: () => [...registry.keys()]
  };
}
