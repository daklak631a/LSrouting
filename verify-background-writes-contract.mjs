/**
 * Thao tác chạy nền, coi như đã xong: Phòng/PGD gửi hồ sơ, cán bộ LS đổi trạng thái, KS/QL phân công, đề nghị hủy,
 * sửa/duyệt đề nghị, tick kết quả, giao kế hoạch. Hộp thoại đóng ngay, màn hình đổi ngay, không dòng mờ / "Đang gửi…" /
 * vạch tiến độ; lệnh ghi xếp hàng đúng thứ tự; chỉ khi máy chủ từ chối mới hoàn tác và báo lỗi.
 * Chạy: node verify-background-writes-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');

/* ---------- Không còn dấu hiệu "đang gửi" nhìn thấy được ---------- */
const screensSrc = read('js/screens.js'), css = read('css/styles.css');
assert.doesNotMatch(screensSrc, /Đang gửi…|Đang đăng ký/, 'Không còn nhãn "Đang gửi…" / "Đang đăng ký…"');
assert.doesNotMatch(css, /body\.is-syncing::before|tr\.is-pending/, 'Không còn vạch tiến độ và dòng mờ khi ghi nền');
assert.match(screensSrc, /Đã gửi ' \+ payload\.items\.length \+ ' đề nghị sang Kiểm soát LS để phân công\.', 'ok'\);\s*\n\s*\n\s*LS\.app\.background\(LS\.api\.createRequest/,
  'Phòng/PGD gửi hồ sơ: báo đã gửi ngay rồi mới đưa vào hàng chờ ghi');

/* ---------- Hàng chờ ghi chạy ngầm: nhãn chỉ hiện khi bận hoặc kéo dài ---------- */
{
  const app = read('js/app.js');
  const a = app.indexOf('  function mountQueueBadge()'), b = app.indexOf('  return {', a);
  const timers = [];
  const classes = new Set();
  const badge = { id: '', className: '', textContent: '', setAttribute() {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  let listener = null;
  const env = {
    LS: { api: { onQueueChange: (fn) => { listener = fn; } } },
    document: { getElementById: () => null, createElement: () => badge, body: { appendChild() {} } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, done: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].done = true; }
  };
  vm.runInNewContext('(function(){' + app.slice(a, b).trim() + '; mountQueueBadge(); })()', env);
  const runTimers = () => timers.filter((t) => !t.done).forEach((t) => { t.done = true; t.fn(); });
  listener({ pending: 1, retrying: false });
  assert.ok(!classes.has('is-on'), 'Một lệnh ghi đang chạy bình thường: không hiện nhãn');
  listener({ pending: 2, retrying: false });
  assert.ok(!classes.has('is-on'), 'Hai lệnh nối đuôi nhau vẫn không hiện nhãn');
  assert.ok(timers.some((t) => t.ms >= 5000), 'Hàng chờ kéo dài thì mới báo (đặt hẹn giờ vài giây)');
  runTimers();
  assert.ok(classes.has('is-on'), 'Kéo dài bất thường thì hiện nhãn "Đang lưu"');
  assert.match(badge.textContent, /Đang lưu 2 thao tác/);
  listener({ pending: 0, retrying: false });
  assert.ok(!classes.has('is-on'), 'Xong hết thì ẩn');
  listener({ pending: 1, retrying: true });
  assert.ok(classes.has('is-on') && classes.has('is-retry'), 'Máy chủ bận phải thử lại thì hiện ngay');
  assert.match(badge.textContent, /tự thử lại/);
  listener({ pending: 0, retrying: false });
  listener({ pending: 1, retrying: false });
  assert.ok(!classes.has('is-on'), 'Sau khi xong, lệnh mới lại chạy ngầm từ đầu');
}

/* ---------- Giao diện ở chế độ GAS với máy chủ giả có thể trả lời chậm hoặc từ chối ---------- */
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form._fields; } get(k) { return k in this.fields ? this.fields[k] : null; } } };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain;
LS.setBackend('GAS');
LS.load(D.seed);
const st = LS.db();

const toasts = [], closed = [], renders = [];
let refreshes = 0;
LS.ui.toast = (m, kind) => toasts.push([m, kind]);
LS.ui.closeDialog = () => closed.push(1);
LS.ui.openDialog = () => {};
LS.ui.dialogOpen = () => false;
const lastToast = () => (toasts[toasts.length - 1] || ['', ''])[0];

// Máy chủ giả: mỗi lệnh ghi là một lời hứa do bài kiểm tra tự trả lời; ghi lại thứ tự và đối số.
const calls = [];
const server = (name) => (...args) => new Promise((resolve, reject) => { calls.push({ name, args, resolve, reject }); });
for (const name of ['transitionItem', 'requestCancel', 'proposeRevision', 'resolveRevision', 'saveResultFlags', 'saveWorkPlan', 'confirmDossierReceipt', 'assignWorkItemsBatch']) LS.api[name] = server(name);

// Bản thật của LS.app.background (app.js), nối với các phần giả của trang.
{
  const app = read('js/app.js');
  const a = app.indexOf('  function background(promise, opts)'), b = app.indexOf('  /** Nhãn nhỏ cho biết', a);
  let flag = 0;
  const env = { setSyncFlag: (on) => { flag += on ? 1 : -1; }, scheduleRefresh: () => { refreshes += 1; }, render: () => renders.push(1), ui: LS.ui };
  env.background = vm.runInNewContext('(' + app.slice(a, b).trim() + ')', env);
  LS.app = { render: () => renders.push(1), background: env.background, refreshServer: () => Promise.resolve() };
  LS.__flag = () => flag;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const form = (item, to, fields) => {
  const attrs = { 'data-id': item.item_id, 'data-to': to, 'data-from': item.status, 'data-version': String(item.version) };
  return { _fields: fields || {}, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
};
const as = (role) => { st.session = st.users.find((u) => u.role === role).user_id; };
const wt = (code) => st.workTypes.find((w) => w.code === code);

// Hồ sơ mẫu: một việc đã giao cho LS, loại không cần khách ký để đi thẳng Tiếp nhận → Hoàn thành.
const officer = st.users.find((u) => u.role === 'CAN_BO_LS');
const request = st.requests[0];
wt('LEGACY_29').needs_appointment = false;
const mk = (id, status, extra) => {
  const item = Object.assign(JSON.parse(JSON.stringify(st.items[0])), { item_id: id, source_stt: id, request_id: request.request_id, work_type_code: 'LEGACY_29', product_name: 'Công việc tín dụng khác',
    status, assigned_user_id: officer.user_id, checklist: [], pending: null, version: 5, completed_at: '', appointment: null, syncing: false, due_at: '' }, extra || {});
  delete item.result_flags;
  st.items.push(item);
  return item;
};

/* 1. LS đổi trạng thái: màn hình đổi ngay, hộp thoại đóng, bước sau bấm được ngay, hai lệnh xếp hàng đúng thứ tự. */
as('CAN_BO_LS');
const job = mk('BG_1', 'DA_PHAN_CONG');
S_check: {
  const S = LS.screens;
  S.submitFlow(form(job, 'DANG_THUC_HIEN'));
  assert.equal(job.status, 'DANG_THUC_HIEN', 'Tiếp nhận: màn hình đổi ngay');
  assert.equal(closed.length, 1, 'Hộp thoại đóng ngay, không chờ máy chủ');
  assert.ok(!job.syncing, 'Dòng việc không bị khóa/đánh dấu đang gửi');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[2].expected_version, 5);
  const rowOf = (id) => (new RegExp('<tr[^>]*data-row="' + id + '"[\\s\\S]*?</tr>').exec(S.mine()) || [''])[0];
  const row = rowOf(job.item_id);
  assert.ok(row, 'Dòng việc vẫn hiện bình thường, thao tác được (không khóa)');
  for (const to of ['DANG_HEN_KH', 'HOAN_THANH_LS']) assert.ok(row.includes(`data-to="${to}"`), 'Bước kế tiếp ' + to + ' bấm được ngay khi lệnh đầu còn đang gửi');
  assert.doesNotMatch(row, /Đang gửi|is-pending/, 'Dòng việc trông như đã xong');

  // Bấm tiếp Hoàn thành khi lệnh đầu chưa được trả lời.
  S.submitFlow(form(job, 'HOAN_THANH_LS', { notification_mode: 'NONE' }));
  assert.equal(job.status, 'HOAN_THANH_LS');
  assert.equal(calls.length, 2, 'Lệnh sau cũng được nhận, xếp hàng sau lệnh trước');
  assert.equal(calls[1].args[2].expected_version, 6, 'Lệnh sau mang phiên bản đã cộng của lệnh trước');
  assert.equal(job.version, 7);
  const optimisticCompletion = job.completed_at;
  const optimisticSessions = JSON.stringify(job.processing_sessions);

  // Máy chủ trả lời lệnh đầu chậm: không được kéo phiên bản lùi lại.
  calls[0].resolve({ ok: true, version: 6, due_at: '', completed_at: '', execution_state:'ACTIVE', processing_sessions_json:'[]' });
  await settle();
  assert.equal(job.version, 7, 'Kết quả của lệnh trước không làm lùi phiên bản');
  assert.equal(job.status, 'HOAN_THANH_LS');
  assert.equal(job.completed_at, optimisticCompletion, 'Kết quả cũ không xóa giờ hoàn thành mới');
  assert.equal(JSON.stringify(job.processing_sessions), optimisticSessions, 'Kết quả cũ không xóa phiên xử lý mới');
  assert.notEqual(job.execution_state,'ACTIVE','Kết quả cũ không bật lại đồng hồ đã hoàn thành');
  calls[1].resolve({ ok: true, version: 7, completed_at: '2026-10-01T03:00:00.000Z' });
  await settle();
  assert.equal(job.completed_at, '2026-10-01T03:00:00.000Z', 'Mốc giờ chuẩn của máy chủ được cập nhật khi có kết quả');
  assert.equal(LS.__flag(), 0);
}

/* 2. Máy chủ từ chối: hoàn tác đúng bước đó, báo lỗi, tải lại dữ liệu thật. */
{
  const S = LS.screens;
  const bad = mk('BG_2', 'DA_PHAN_CONG');
  calls.length = 0; refreshes = 0;
  S.submitFlow(form(bad, 'DANG_THUC_HIEN'));
  assert.equal(bad.status, 'DANG_THUC_HIEN');
  calls[0].reject(new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.'));
  await settle();
  assert.equal(bad.status, 'DA_PHAN_CONG', 'Bị từ chối thì trả về trạng thái cũ');
  assert.equal(bad.version, 5);
  assert.match(lastToast(), /không lưu được: Việc đã được người khác cập nhật/);
  assert.ok(refreshes >= 1, 'Sau lỗi phải tải lại dữ liệu thật từ máy chủ');
}

/* 3. Phòng/PGD hủy trực tiếp: đóng ngay, không tạo đề nghị chờ duyệt. */
{
  const S = LS.screens;
  as('PHONG_PGD');
  const pgd = st.users.find((u) => u.role === 'PHONG_PGD');
  const onUnit = mk('BG_3', 'DANG_THUC_HIEN');
  st.requests.find((r) => r.request_id === onUnit.request_id).unit_id = pgd.unit_id;
  calls.length = 0; closed.length = 0;
  S.submitCancelRequest({ _fields: { item_id: onUnit.item_id, version: String(onUnit.version), reason: 'Khách rút yêu cầu' }, getAttribute: () => null, setAttribute() {}, removeAttribute() {} });
  assert.equal(onUnit.status, 'HUY', 'Hủy trực tiếp hiện ngay');
  assert.equal(onUnit.pending, null, 'Hủy không tạo đề nghị chờ KS/QL');
  assert.equal(closed.length, 1);
  assert.equal(calls[0].name, 'requestCancel');
  assert.equal(calls[0].args[2], 5, 'Gửi kèm phiên bản lúc mở hộp thoại');
  calls[0].reject(new Error('Việc đã được cập nhật.'));
  await settle();
  assert.equal(onUnit.status, 'DANG_THUC_HIEN', 'Máy chủ từ chối thì trả trạng thái hồ sơ cũ');
  assert.equal(onUnit.pending, null);
  assert.match(lastToast(), /Hủy việc không lưu được/);
}

/* 4. KS duyệt / từ chối đề nghị sửa. */
{
  const S = LS.screens;
  as('KS_LS');
  const edited = mk('BG_4', 'DA_PHAN_CONG');
  const customerName = () => st.requests.find((r) => r.request_id === edited.request_id).customer.name;
  const oldName = customerName();
  edited.pending = { fields: { 'customer.name': 'Tên Mới Của Khách' }, by: st.users.find((u) => u.role === 'PHONG_PGD').user_id, at: '2026-10-01T01:00:00Z', reason: 'Sửa tên' };
  calls.length = 0;
  S.revision(edited.item_id, true);
  assert.equal(customerName(), 'Tên Mới Của Khách', 'Duyệt: thay đổi áp dụng ngay trên màn hình');
  assert.equal(edited.pending, null);
  assert.equal(edited.version, 6);
  assert.equal(calls[0].name, 'resolveRevision');
  calls[0].reject(new Error('Việc đã đóng từ lúc gửi đề nghị.'));
  await settle();
  assert.equal(customerName(), oldName, 'Máy chủ từ chối thì tên khách trở lại như cũ');
  assert.ok(edited.pending && edited.pending.fields['customer.name'], 'Đề nghị quay lại danh sách chờ duyệt');
  assert.equal(edited.version, 5);
  calls.length = 0;
  S.revision(edited.item_id, false);
  assert.equal(edited.pending, null, 'Từ chối: bỏ đề nghị ngay');
  calls[0].resolve({ ok: true, approved: false });
  await settle();
}

/* 5. Cán bộ sửa tick kết quả: đổi ngay; bị từ chối thì trả lại. */
{
  const S = LS.screens;
  as('CAN_BO_LS');
  wt('LEGACY_26').needs_appointment = false;
  const done = mk('BG_5', 'HOAN_THANH_LS', { work_type_code: 'LEGACY_26', product_name: wt('LEGACY_26').name, version: 8 });
  done.result_flags = { HD_THE_CHAP: true };
  calls.length = 0;
  S.submitResultFlags(form(done, 'HOAN_THANH_LS', {}));
  assert.deepEqual({ ...done.result_flags }, { HD_THE_CHAP: false }, 'Bỏ tick: đổi ngay');
  assert.equal(done.version, 9);
  assert.equal(calls[0].args[2], 8);
  calls[0].reject(new Error('Chỉ người được giao mới sửa ghi nhận kết quả.'));
  await settle();
  assert.deepEqual({ ...done.result_flags }, { HD_THE_CHAP: true }, 'Bị từ chối thì trả lại tick cũ');
  assert.equal(done.version, 8);
}

/* 6. KS giao kế hoạch: đổi ngay, bật cột kế hoạch; bị từ chối thì trả lại số cũ. */
{
  const S = LS.screens;
  as('KS_LS');
  st.settings.daily_plan_json = JSON.stringify({ RLOS: 7 });
  st.settings.target_done_month = 100;
  calls.length = 0;
  S.submitPlan({ _fields: { plan_RLOS: '12', plan_HD_TIN_DUNG: '4', target_done_month: '200', target_done_staff_month: '20' }, getAttribute: () => null, setAttribute() {}, removeAttribute() {} });
  assert.deepEqual(JSON.parse(st.settings.daily_plan_json), { HD_TIN_DUNG: 4, RLOS: 12 }, 'Kế hoạch mới hiện ngay');
  assert.equal(st.settings.target_done_month, 200);
  assert.equal(calls[0].name, 'saveWorkPlan');
  calls[0].reject(new Error('Chỉ Kiểm soát LS hoặc Quản lý LS được giao kế hoạch.'));
  await settle();
  assert.deepEqual(JSON.parse(st.settings.daily_plan_json), { RLOS: 7 }, 'Bị từ chối thì trả lại kế hoạch cũ');
  assert.equal(st.settings.target_done_month, 100);
}

/* 7. Cán bộ tiếp nhận bằng ô tick: ghi nhận ngay, lỗi thì hoàn tác. */
{
  const S = LS.screens;
  as('CAN_BO_LS');
  const legacy = mk('BG_7', 'DANG_THUC_HIEN', { dossier_received_at: '', processing_started_at: '2026-09-30T01:00:00.000Z' });
  calls.length = 0;
  S.confirmDossierReceipt(legacy.item_id);
  assert.ok(legacy.dossier_received_at, 'Ghi nhận giờ nhận ngay trên màn hình');
  assert.ok(!legacy.syncing);
  assert.equal(calls[0].name, 'confirmDossierReceipt');
  calls[0].reject(new Error('Hồ sơ đã có giờ nhận đủ.'));
  await settle();
  assert.equal(legacy.dossier_received_at, '', 'Bị từ chối thì bỏ giờ nhận vừa ghi');
}

console.log('Background writes contract passed: closed dialog, instant screen, silent queue, rollback only on refusal.');
