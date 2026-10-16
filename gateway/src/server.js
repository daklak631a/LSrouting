/**
 * Gateway gửi tin cho LS-Routing.
 *
 * Hợp đồng do Apps Script quy định (Notifications.gs, hàm sendClaimed_):
 *
 *   POST /send
 *   Authorization: Bearer <token>
 *   X-Idempotency-Key: <idem_key>
 *   { channel, provider, to, template, body, item_id, provider_config }
 *
 *   -> 2xx  { "message_id": "..." }     coi là ĐÃ GỬI
 *   -> lỗi trước khi gửi                 có thể thử lại theo chính sách
 *   -> kết quả chưa rõ                   giữ khóa; cần đối soát trước khi thử lại
 *
 * Thiếu message_id trong phản hồi 2xx cũng bị LS-Routing coi là chưa gửi. Vì
 * vậy nơi này không bao giờ trả 200 rỗng.
 */
import express from 'express';
import { loadConfig } from './config.js';
import { createStore } from './store/index.js';
import { createRegistry } from './providers/index.js';
import { requireBearer } from './auth.js';
import { GatewayError, badRequest, conflict, shorten } from './errors.js';
import { log, maskAddress } from './logger.js';

export function createApp({ config, store, registry }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      store: store.driver,
      channels: registry.channels(),
      mock: config.mockMode,
      time: new Date().toISOString()
    });
  });

  app.post('/send', requireBearer(config.authToken), async (req, res, next) => {
    const startedAt = Date.now();
    const idempotencyKey = String(req.get('x-idempotency-key') || '').trim();
    const { channel, provider, to, template, body, item_id: itemId, provider_config: providerConfig } = req.body || {};

    try {
      if (!idempotencyKey) {
        throw badRequest('Thiếu header X-Idempotency-Key; gateway từ chối gửi khi không chống trùng được.');
      }
      if (!channel) throw badRequest('Thiếu trường channel.');
      if (!to) throw badRequest('Thiếu địa chỉ người nhận.');
      if (!body) throw badRequest('Thiếu nội dung tin.');

      const adapter = registry.resolve(channel, provider);

      // Giữ chỗ trước khi gọi nhà cung cấp: hai lượt thử lại chạy song song sẽ
      // không cùng gửi một tin thật cho khách.
      const reserved = await store.reserve(idempotencyKey);

      if (reserved.state === 'DONE') {
        log.info('send_deduplicated', { channel, itemId, idempotencyKey, messageId: reserved.messageId });
        return res.json({ message_id: reserved.messageId, deduplicated: true });
      }
      if (reserved.state === 'IN_FLIGHT') {
        const err = conflict('Kết quả gửi tin này chưa xác định; cần đối soát trước khi xử lý tiếp.');
        err.deliveryUnknown = true;
        throw err;
      }

      let result;
      try {
        result = await adapter.send({
          to,
          body,
          template,
          item_id: itemId,
          provider_config: providerConfig || {},
          idempotencyKey
        });
      } catch (err) {
        // Provider có thể đã nhận tin trước khi timeout. Giữ IN_FLIGHT để lần
        // thử lại không phát sinh thêm một tin có thể bị gửi trùng.
        err.deliveryUnknown = true;
        throw err;
      }

      try { await store.complete(idempotencyKey, result.messageId); }
      catch (err) {
        // Provider đã trả thành công nhưng chưa ghi được khóa hoàn tất.
        err.deliveryUnknown = true;
        throw err;
      }

      log.info('send_ok', {
        channel,
        provider,
        itemId,
        template,
        idempotencyKey,
        messageId: result.messageId,
        to: maskAddress(to),
        durationMs: Date.now() - startedAt
      });

      return res.json({ message_id: result.messageId, ...(result.meta || {}) });
    } catch (err) {
      err.context = { channel, itemId, idempotencyKey, to: maskAddress(to), durationMs: Date.now() - startedAt };
      return next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Không có đường dẫn này. Dùng POST /send.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err instanceof GatewayError ? err.status : 500;
    const message = err instanceof GatewayError
      ? err.message
      : 'Gateway gặp lỗi không lường trước.';

    const level = status >= 500 ? 'error' : 'warn';
    log[level]('send_failed', { status, reason: shorten(err.message, 200), ...(err.context || {}) });

    // Thân phản hồi ngắn: LS-Routing cắt còn 200 ký tự để ghi vào cột note.
    res.status(status).json({ error: shorten(message, 200), ...(err.deliveryUnknown ? { outcome: 'unknown' } : {}) });
  });

  return app;
}

export async function start() {
  const config = loadConfig();
  const store = await createStore(config.store);
  const registry = createRegistry({ config, store });
  const app = createApp({ config, store, registry });

  if (config.store.driver === 'memory' && !config.mockMode) {
    log.warn('store_memory_in_use', {
      note: 'Khóa chống trùng chỉ có tác dụng trong một bản sao. Dùng STORE_DRIVER=firestore khi chạy thật.'
    });
  }

  const server = app.listen(config.port, () => {
    log.info('gateway_started', { port: config.port, store: store.driver, mock: config.mockMode });
  });

  const shutdown = () => {
    log.info('gateway_stopping', {});
    server.close(() => store.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

// Chỉ tự chạy khi gọi trực tiếp, để test import được createApp mà không mở cổng.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  start().catch((err) => {
    log.error('gateway_start_failed', { reason: err.message });
    process.exit(1);
  });
}
