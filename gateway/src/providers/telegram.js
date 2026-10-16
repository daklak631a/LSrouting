/**
 * Telegram Bot — kênh cảnh báo nội bộ.
 *
 * Bot chỉ nhắn được cho người đã chủ động bắt đầu trò chuyện, hoặc cho nhóm đã
 * thêm bot. LS-Routing đã ràng buộc điều này ở phía nó (telegram_chat_id phải
 * do cán bộ tự khai), nên ở đây chỉ cần gọi API và dịch lỗi cho dễ hiểu.
 */
import { upstream, badRequest, shorten } from '../errors.js';

export function createTelegramProvider({ config, fetchImpl = fetch }) {
  return {
    channel: 'TELEGRAM',

    async send(payload) {
      if (!config.telegram.enabled) {
        throw badRequest('Kênh Telegram đang tắt ở gateway (TELEGRAM_ENABLED=false).');
      }
      if (!config.telegram.botToken) {
        throw badRequest('Gateway chưa nạp TELEGRAM_BOT_TOKEN.');
      }

      const chatId = String(payload.to || '').trim();
      if (!chatId) throw badRequest('Thiếu chat id người nhận cho Telegram.');

      const url = `${config.telegram.apiBase}/bot${config.telegram.botToken}/sendMessage`;

      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: payload.body,
            disable_web_page_preview: true
          }),
          signal: AbortSignal.timeout(config.telegram.timeoutMs)
        });
      } catch (err) {
        throw upstream(`Không gọi được Telegram: ${shorten(err.message, 100)}`);
      }

      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = {}; }

      if (!response.ok || !result.ok) {
        const reason = result.description || text;
        // Lỗi hay gặp nhất, nói thẳng cách xử lý thay vì dán nguyên thông điệp Telegram.
        if (/chat not found|bot was blocked|user is deactivated/i.test(String(reason))) {
          throw upstream('Telegram: người nhận chưa bắt đầu trò chuyện với bot hoặc đã chặn bot.');
        }
        throw upstream(shorten(`Telegram trả lỗi: ${reason}`));
      }

      const messageId = result.result && result.result.message_id;
      if (!messageId) throw upstream('Telegram không trả message_id; chưa coi là đã gửi.');

      return { messageId: String(messageId), meta: {} };
    }
  };
}
