/**
 * GMF — nhắn vào nhóm Zalo nội bộ.
 *
 * Zalo không có API công khai cho phép Official Account gửi tin tùy ý vào một
 * nhóm chat thông thường. Kênh này chỉ chạy được khi tổ chức đã được cấp quyền
 * riêng, hoặc đi qua một đối tác có khả năng đó.
 *
 * Mặc định kênh tắt và trả về lỗi nói rõ lý do, thay vì im lặng nuốt tin. Khi
 * đã có đường gửi thật, bật GMF_ENABLED=true và khai GMF_SEND_URL.
 */
import { upstream, notImplemented, badRequest, shorten } from '../errors.js';

export function createZaloGroupProvider({ config, fetchImpl = fetch }) {
  return {
    channel: 'GMF',

    async send(payload) {
      if (!config.zaloGroup.enabled || !config.zaloGroup.sendUrl) {
        throw notImplemented(
          'Kênh nhóm Zalo chưa được đấu nối ở gateway. Xác nhận quyền gửi nhóm với Zalo rồi bật GMF_ENABLED.'
        );
      }

      const groupId = String(payload.to || '').trim();
      if (!groupId) throw badRequest('Thiếu mã nhóm cho kênh GMF.');

      const secret = config.secretFromRef(payload.provider_config?.secret_ref);

      let response;
      try {
        response = await fetchImpl(config.zaloGroup.sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { Authorization: `Bearer ${secret}` } : {})
          },
          body: JSON.stringify({
            group_id: groupId,
            text: payload.body,
            tracking_id: payload.idempotencyKey
          }),
          signal: AbortSignal.timeout(15000)
        });
      } catch (err) {
        throw upstream(`Không gọi được dịch vụ nhóm Zalo: ${shorten(err.message, 100)}`);
      }

      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = {}; }

      if (!response.ok) throw upstream(shorten(`Dịch vụ nhóm Zalo trả HTTP ${response.status}: ${text}`));

      const messageId = result.message_id || result.msg_id || (result.data && result.data.msg_id);
      if (!messageId) throw upstream('Dịch vụ nhóm Zalo không trả mã tin; chưa coi là đã gửi.');

      return { messageId: String(messageId), meta: {} };
    }
  };
}
