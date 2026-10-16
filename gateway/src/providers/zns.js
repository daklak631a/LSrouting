/**
 * Zalo ZNS — gửi tin theo mẫu đã được Zalo duyệt, tới số điện thoại khách.
 *
 * Hai việc khó nằm ở đây:
 *
 * 1. Access token chỉ sống khoảng 1 giờ, và mỗi lần làm mới thì refresh token
 *    cũng bị xoay vòng. Mất refresh token hiện hành là phải cấp quyền lại bằng
 *    tay, nên token mới phải được ghi xuống kho bền vững TRƯỚC khi dùng.
 *
 * 2. Zalo không nhận văn bản tự do. Phần dựng `template_data` nằm ở templateMap.js.
 *
 * Địa chỉ API lấy từ biến môi trường để đổi được mà không sửa mã. Hãy đối chiếu
 * lại với tài liệu Zalo hiện hành trước khi chạy thật.
 */
import { upstream, badRequest, shorten } from '../errors.js';
import { buildTemplateData } from '../templateMap.js';
import { log } from '../logger.js';

const ACCESS_KEY = 'zns_access_token';
const REFRESH_KEY = 'zns_refresh_token';
const EXPIRY_KEY = 'zns_access_expires_at';

/** Zalo nhận số dạng 84xxxxxxxxx: bỏ dấu cộng, đổi số 0 đứng đầu thành 84. */
export function normalizeVnPhone(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  if (digits.length === 9) return '84' + digits;
  return digits;
}

export function createZnsProvider({ config, store, fetchImpl = fetch }) {
  let refreshing = null;

  async function readToken() {
    const [access, expiresAt] = await Promise.all([
      store.get(ACCESS_KEY),
      store.get(EXPIRY_KEY)
    ]);
    if (!access || !expiresAt) return '';
    // Làm mới sớm 5 phút để một tin đang bay không rơi đúng lúc token hết hạn.
    return Date.now() < Number(expiresAt) - 5 * 60 * 1000 ? access : '';
  }

  async function refreshToken(providerConfig) {
    const appId = String(providerConfig.app_id || '').trim();
    const secret = config.secretFromRef(providerConfig.secret_ref);
    if (!appId) throw badRequest('Kênh ZBS chưa khai App ID phía LS-Routing.');
    if (!secret) {
      throw badRequest(
        `Gateway chưa có bí mật cho secret_ref=${providerConfig.secret_ref || '(trống)'}; nạp biến môi trường cùng tên.`
      );
    }

    const stored = await store.get(REFRESH_KEY);
    const refresh = String(stored || config.zns.bootstrapRefreshToken || '').trim();
    if (!refresh) {
      throw badRequest('Chưa có refresh token ZNS. Nạp ZNS_REFRESH_TOKEN lần đầu rồi khởi động lại.');
    }

    const body = new URLSearchParams({
      refresh_token: refresh,
      app_id: appId,
      grant_type: 'refresh_token'
    });

    let response;
    try {
      response = await fetchImpl(config.zns.oauthUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: secret
        },
        body,
        signal: AbortSignal.timeout(config.zns.timeoutMs)
      });
    } catch (err) {
      throw upstream(`Không gọi được máy chủ cấp token Zalo: ${shorten(err.message, 90)}`);
    }

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }

    if (!response.ok || !data.access_token) {
      // Sai refresh token là lỗi phải người xử lý, không phải lỗi thử lại được.
      throw upstream(shorten(
        `Zalo từ chối cấp token (HTTP ${response.status}): ${data.error_description || data.message || text}`
      ));
    }

    const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    // Ghi refresh token mới TRƯỚC access token: mất access token chỉ tốn một
    // lần làm mới, mất refresh token là phải cấp quyền lại bằng tay.
    if (data.refresh_token) await store.set(REFRESH_KEY, String(data.refresh_token));
    await store.set(ACCESS_KEY, String(data.access_token));
    await store.set(EXPIRY_KEY, expiresAt);

    log.info('zns_token_refreshed', { expiresAt: new Date(expiresAt).toISOString() });
    return String(data.access_token);
  }

  /** Một lượt làm mới tại một thời điểm trong cùng tiến trình. */
  async function accessToken(providerConfig) {
    const cached = await readToken();
    if (cached) return cached;

    if (!refreshing) {
      refreshing = (async () => {
        // Đọc lại: có thể một bản sao khác vừa làm mới xong.
        const again = await readToken();
        if (again) return again;
        return refreshToken(providerConfig);
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  return {
    channel: 'ZBS',

    async send(payload) {
      if (!config.zns.enabled) throw badRequest('Kênh ZNS đang tắt ở gateway (ZNS_ENABLED=false).');

      const phone = normalizeVnPhone(payload.to);
      if (!/^84\d{8,11}$/.test(phone)) {
        throw badRequest(`Số điện thoại không hợp lệ cho ZNS: ${shorten(payload.to, 20)}`);
      }

      const { templateId, data } = buildTemplateData(payload.template, payload.body, config.templates);
      const token = await accessToken(payload.provider_config || {});

      let response;
      try {
        response = await fetchImpl(config.zns.sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', access_token: token },
          body: JSON.stringify({
            phone,
            template_id: templateId,
            template_data: data,
            // Dùng idempotency key làm mã đối soát hai chiều với LS-Routing.
            tracking_id: payload.idempotencyKey
          }),
          signal: AbortSignal.timeout(config.zns.timeoutMs)
        });
      } catch (err) {
        throw upstream(`Không gọi được Zalo ZNS: ${shorten(err.message, 100)}`);
      }

      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = {}; }

      if (!response.ok) {
        throw upstream(shorten(`Zalo trả HTTP ${response.status}: ${result.message || text}`));
      }
      if (Number(result.error) !== 0) {
        throw upstream(shorten(`Zalo báo lỗi ${result.error}: ${result.message || 'không rõ nguyên nhân'}`));
      }
      const messageId = result.data && result.data.msg_id;
      if (!messageId) {
        throw upstream('Zalo không trả msg_id; chưa coi là đã gửi.');
      }

      return {
        messageId: String(messageId),
        meta: {
          sentTime: result.data.sent_time || '',
          remainingQuota: (result.data.quota && result.data.quota.remainingQuota) || ''
        }
      };
    }
  };
}
