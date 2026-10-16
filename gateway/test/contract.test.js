/**
 * Kiểm hợp đồng giữa gateway và Apps Script.
 *
 * Mỗi test ở đây tương ứng một giả định mà Notifications.gs đang dựa vào. Sửa
 * gateway mà làm hỏng một trong số này nghĩa là làm hỏng luồng gửi tin thật.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config.js';
import { createStore } from '../src/store/index.js';
import { createRegistry, createMockProvider } from '../src/providers/index.js';
import { createApp } from '../src/server.js';
import { parseBody, buildTemplateData } from '../src/templateMap.js';
import { normalizeVnPhone } from '../src/providers/zns.js';
import { interpolate, getPath } from '../src/providers/sms.js';

const TOKEN = 'k'.repeat(32);

async function harness() {
  const config = loadConfig({ GATEWAY_TOKEN: TOKEN, MOCK_PROVIDERS: 'true' });
  const store = await createStore(config.store);
  const registry = createRegistry({ config, store });
  const app = createApp({ config, store, registry });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    store,
    registry,
    async send(payload, { token = TOKEN, key = 'ITM_1:DA_PHAN_CONG:CAN_BO:U01' } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (key) headers['X-Idempotency-Key'] = key;
      const res = await fetch(`${base}/send`, { method: 'POST', headers, body: JSON.stringify(payload) });
      return { status: res.status, body: await res.json() };
    },
    async close() { await new Promise((r) => server.close(r)); }
  };
}

const validPayload = {
  channel: 'SMS',
  provider: 'sms_gateway',
  to: '0912345678',
  template: 'TPL_SMS_HEN_KY',
  body: 'Ngan hang moi Quy khach den ky ho so.',
  item_id: 'ITM_1',
  provider_config: { sender_id: 'NGANHANG', secret_ref: 'LS_SMS_TOKEN' }
};

test('healthz cho biết kho và danh sách kênh', async () => {
  const h = await harness();
  const res = await fetch(`${h.base}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.channels.sort(), ['GMF', 'SMS', 'TELEGRAM', 'ZBS']);
  await h.close();
});

test('từ chối khi thiếu hoặc sai token', async () => {
  const h = await harness();
  assert.equal((await h.send(validPayload, { token: '' })).status, 401);
  assert.equal((await h.send(validPayload, { token: 'sai' })).status, 401);
  await h.close();
});

test('từ chối khi thiếu X-Idempotency-Key', async () => {
  const h = await harness();
  const res = await h.send(validPayload, { key: '' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /X-Idempotency-Key/);
  await h.close();
});

test('gửi thành công trả message_id — điều kiện để LS-Routing ghi DA_GUI', async () => {
  const h = await harness();
  const res = await h.send(validPayload);
  assert.equal(res.status, 200);
  assert.ok(res.body.message_id, 'phản hồi 2xx bắt buộc có message_id');
  await h.close();
});

test('cùng một idempotency key trả đúng message_id cũ, không gửi lại', async () => {
  const h = await harness();
  let calls = 0;
  h.registry.register('SMS', {
    channel: 'SMS',
    async send() { calls += 1; return { messageId: 'sms_0001' }; }
  });

  const first = await h.send(validPayload);
  const second = await h.send(validPayload);

  assert.equal(first.body.message_id, 'sms_0001');
  assert.equal(second.body.message_id, 'sms_0001');
  assert.equal(second.body.deduplicated, true);
  assert.equal(calls, 1, 'nhà cung cấp chỉ được gọi đúng một lần');
  await h.close();
});

test('kết quả provider chưa xác định được giữ khóa để không gửi trùng', async () => {
  const h = await harness();
  let calls = 0;
  h.registry.register('SMS', {
    channel: 'SMS',
    async send() {
      calls += 1;
      if (calls === 1) {
        const { upstream } = await import('../src/errors.js');
        throw upstream('Nha cung cap SMS tu choi.');
      }
      return { messageId: 'sms_retry_ok' };
    }
  });

  const failed = await h.send(validPayload);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.outcome, 'unknown');
  assert.ok(failed.body.error.length <= 200, 'thông điệp phải vừa 200 ký tự LS-Routing lưu');

  const retried = await h.send(validPayload);
  assert.equal(retried.status, 409);
  assert.equal(retried.body.outcome, 'unknown');
  assert.equal(calls, 1, 'không gọi lại provider khi lượt đầu có thể đã gửi');
  await h.close();
});

test('kênh EMAIL và IN_APP bị từ chối vì Apps Script tự gửi', async () => {
  const h = await harness();
  for (const channel of ['EMAIL', 'IN_APP']) {
    const res = await h.send({ ...validPayload, channel }, { key: `k_${channel}` });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Apps Script/);
  }
  await h.close();
});

test('kênh không hỗ trợ bị từ chối rõ ràng', async () => {
  const h = await harness();
  const res = await h.send({ ...validPayload, channel: 'VIBER' }, { key: 'k_viber' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /không hỗ trợ/);
  await h.close();
});

test('thiếu người nhận hoặc nội dung bị chặn trước khi gọi nhà cung cấp', async () => {
  const h = await harness();
  assert.equal((await h.send({ ...validPayload, to: '' }, { key: 'k1' })).status, 400);
  assert.equal((await h.send({ ...validPayload, body: '' }, { key: 'k2' })).status, 400);
  await h.close();
});

/* ---------------- Đơn vị: chuyển đổi dữ liệu ---------------- */

test('chuẩn hóa số điện thoại về dạng 84', () => {
  assert.equal(normalizeVnPhone('0912345678'), '84912345678');
  assert.equal(normalizeVnPhone('+84 912 345 678'), '84912345678');
  assert.equal(normalizeVnPhone('84912345678'), '84912345678');
  assert.equal(normalizeVnPhone(''), '');
});

test('tách tham số từ mẫu dạng khoa=gia tri', () => {
  const parsed = parseBody('ten_khach=NGUYEN VAN A\nnoi_ky=Chi nhanh 1\ngio_ky=09:00\ndong rac');
  assert.deepEqual(parsed, { ten_khach: 'NGUYEN VAN A', noi_ky: 'Chi nhanh 1', gio_ky: '09:00' });
});

test('dựng template_data theo ánh xạ đã khai', () => {
  const templates = {
    TPL_HEN_KY: { zns_template_id: '999', params: { customer_name: 'ten_khach', place: 'noi_ky' } }
  };
  const built = buildTemplateData('TPL_HEN_KY', 'ten_khach=A\nnoi_ky=B', templates);
  assert.equal(built.templateId, '999');
  assert.deepEqual(built.data, { customer_name: 'A', place: 'B' });
});

test('thiếu tham số bắt buộc thì dừng, không gửi tin khuyết nội dung', () => {
  const templates = {
    TPL_HEN_KY: { zns_template_id: '999', params: { customer_name: 'ten_khach', place: 'noi_ky' } }
  };
  assert.throws(
    () => buildTemplateData('TPL_HEN_KY', 'ten_khach=A', templates),
    /thiếu tham số/
  );
});

test('mẫu chưa khai ánh xạ thì báo đúng chỗ phải khai', () => {
  assert.throws(() => buildTemplateData('TPL_LA', 'a=b', {}), /config\/templates\.json/);
});

test('bộ nối SMS thay biến và đọc được đường dẫn lồng nhau', () => {
  const out = interpolate('${to}|${sender}|${env.FOO}', { to: '84900', sender: 'BANK' }, { FOO: 'bar' });
  assert.equal(out, '84900|BANK|bar');
  assert.equal(getPath({ data: { msg_id: 'm1' } }, 'data.msg_id'), 'm1');
  assert.equal(getPath({}, 'a.b.c'), undefined);
});

test('bộ nối giả dùng được để diễn tập mà không gọi ra ngoài', async () => {
  const mock = createMockProvider('ZBS');
  const ok = await mock.send({ to: '84912345678', idempotencyKey: 'abc' });
  assert.match(ok.messageId, /^mock_ZBS_/);
  await assert.rejects(() => mock.send({ to: 'FAIL', idempotencyKey: 'abc' }));
});
