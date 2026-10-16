/**
 * Kiểm soát / Quản lý LS là người giao kế hoạch: nút "Giao kế hoạch" ở Tổng hợp → Kết quả thực hiện,
 * máy chủ chỉ nhận từ KS/QL (và Admin), cấu hình chung của Admin không còn ghi đè kế hoạch.
 * Chạy: node verify-work-plan-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/* ---------- Máy chủ ---------- */
const sctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);

const db = { Settings: [{ key: 'target_done_month', value: '10' }], ConfigLog: [] };
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row)
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [] };
let actor = { user_id: 'KS', role: 'KS_LS', is_active: true };
sctx.requireActor_ = () => actor;
const setting = (key) => (db.Settings.find((s) => s.key === key) || {}).value;

assert.ok(vm.runInContext('API_WRITE_', sctx).includes('saveWorkPlan'), 'saveWorkPlan là lệnh ghi');
assert.ok(vm.runInContext('Object.keys(apiFunctions_())', sctx).includes('saveWorkPlan'), 'saveWorkPlan đã đăng ký vào cổng api');

// Chỉ KS / QL (và Admin) được giao kế hoạch.
const plan = { daily_plan: { HD_TIN_DUNG: 31, RLOS: 12, HD_THE_CHAP: 5 }, target_done_month: 400, target_done_staff_month: 40 };
for (const role of ['CAN_BO_LS', 'PHONG_PGD', 'GIAM_SAT']) {
  actor = { user_id: 'X', role, is_active: true };
  assert.match(fail(() => sctx.saveWorkPlan(plan)), /Chỉ Kiểm soát LS hoặc Quản lý LS/, role + ' không được giao kế hoạch');
}
assert.equal(setting('daily_plan_json'), undefined, 'Bị từ chối thì không ghi gì');
assert.equal(setting('target_done_month'), '10', 'Bị từ chối thì chỉ tiêu cũ giữ nguyên');

// Dữ liệu sai bị từ chối trước khi ghi.
actor = { user_id: 'KS', role: 'KS_LS', is_active: true };
assert.match(fail(() => sctx.saveWorkPlan({ daily_plan: { THU_NO: 3 } })), /không hợp lệ/, 'Dòng kế hoạch lạ');
assert.match(fail(() => sctx.saveWorkPlan({ daily_plan: { RLOS: -1 } })), /số nguyên/, 'Số âm');
assert.match(fail(() => sctx.saveWorkPlan({ daily_plan: { RLOS: 1.5 } })), /số nguyên/, 'Số lẻ');
assert.match(fail(() => sctx.saveWorkPlan({ daily_plan: { RLOS: 'abc' } })), /số nguyên/, 'Không phải số');
assert.match(fail(() => sctx.saveWorkPlan({ daily_plan: {}, target_done_month: -5 })), /số nguyên/, 'Chỉ tiêu âm');
assert.equal(setting('daily_plan_json'), undefined, 'Dữ liệu sai không ghi gì');

// KS lưu: chỉ giữ dòng > 0, chỉ tiêu ghi dạng chuỗi như các cấu hình khác, có nhật ký.
const saved = sctx.saveWorkPlan({ daily_plan: { HD_TIN_DUNG: '31', RLOS: 12, HD_THE_CHAP: 5, TON_TIN_DUNG: 0, KHAC: '' }, target_done_month: 400, target_done_staff_month: '40' });
assert.deepEqual(JSON.parse(setting('daily_plan_json')), { HD_TIN_DUNG: 31, RLOS: 12, HD_THE_CHAP: 5 });
assert.equal(setting('target_done_month'), '400');
assert.equal(setting('target_done_staff_month'), '40');
assert.equal(saved.ok, true);
assert.equal(db.ConfigLog.length, 1);
assert.equal(db.ConfigLog[0].by, 'KS');
assert.equal(db.ConfigLog[0].area, 'Kế hoạch');

// Dòng đã bỏ khỏi bảng ngày (cầm cố, TSBĐ, giải ngân TP, tồn cầm cố): màn hình bản cũ còn gửi thì bỏ qua, không chặn lưu.
sctx.saveWorkPlan({ daily_plan: { HD_CAM_CO: 3, TSBD: 2, GIAI_NGAN: 1, TON_CAM_CO: 1, RLOS: 2 }, target_done_month: 400, target_done_staff_month: 40 });
assert.deepEqual(JSON.parse(setting('daily_plan_json')), { RLOS: 2 }, 'Dòng cũ bị bỏ, dòng còn lại được giữ');

// QL và Admin cũng lưu được; xóa hết kế hoạch là lưu rỗng chứ không giữ số cũ.
actor = { user_id: 'QL', role: 'QUAN_LY_LS', is_active: true };
sctx.saveWorkPlan({ daily_plan: { RLOS: 20 }, target_done_month: 0, target_done_staff_month: 0 });
assert.deepEqual(JSON.parse(setting('daily_plan_json')), { RLOS: 20 });
assert.equal(setting('target_done_month'), '0');
actor = { user_id: 'AD', role: 'ADMIN', is_active: true };
assert.equal(sctx.saveWorkPlan({ daily_plan: {} }).daily_plan_json, '{}');
assert.equal(setting('daily_plan_json'), '{}');

// Danh sách dòng kế hoạch khớp bảng Kết quả thực hiện của giao diện.
const client = { LS: {}, localStorage: { getItem: () => null, setItem() {} }, window: {} };
vm.runInNewContext(read('js/core.js'), client);
vm.runInNewContext(read('js/domain.js'), client);
assert.deepEqual(Array.from(vm.runInContext('DAILY_PLAN_KEYS_', sctx)), Array.from(client.LS.domain.DAILY_ROWS).filter((r) => !r.header).map((r) => r.key));

// Cấu hình chung của Admin không còn ghi đè kế hoạch (tránh bản cũ trên máy Admin xóa kế hoạch mới của KS).
actor = { user_id: 'AD', role: 'ADMIN', is_active: true };
sctx.adminSaveSettings({ daily_plan_json: '{"RLOS":999}', target_done_month: 999, bank_name: 'BIDV' });
assert.equal(setting('bank_name'), 'BIDV');
assert.equal(setting('daily_plan_json'), '{}', 'adminSaveSettings không được sửa kế hoạch');
assert.equal(setting('target_done_month'), '0', 'adminSaveSettings không được sửa chỉ tiêu');

// Mọi vai trò LS đều nhận kế hoạch trong bootstrap để so với kết quả (trước đây chỉ Admin nhận nên KS/QL không thấy cột kế hoạch).
const server = read('Code.gs');
const whitelist = server.slice(server.indexOf("settings: DataRepository.getAll('Settings').filter(function (s) {"), server.indexOf("if (u.role === 'ADMIN') {", server.indexOf("settings: DataRepository.getAll('Settings').filter(function (s) {")));
for (const key of ['daily_plan_json', 'target_done_month', 'target_done_staff_month']) assert.ok(whitelist.includes(`'${key}'`), key + ' phải nằm trong cấu hình gửi cho vai trò LS');
assert.ok(!/gateway|token/i.test(whitelist.replace(/gateway_auth_ref[^\n]*/g, '')), 'Danh sách cấu hình gửi xuống không lộ gateway');

/* ---------- Giao diện ---------- */
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form._fields; } get(k) { return k in this.fields ? this.fields[k] : null; } } };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens', 'admin']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain;
const toasts = [];
let dialog = '', renders = 0;
LS.app = { render() { renders++; }, background() {}, refreshServer: () => Promise.resolve() };
LS.ui.openDialog = (title, body) => { dialog = body; };
LS.ui.closeDialog = () => {};
LS.ui.toast = (message, kind) => { toasts.push([message, kind]); };
LS.load(D.seed);
const st = LS.db();
const as = (role) => { st.session = st.users.find((u) => u.role === role).user_id; };

// Nút Giao kế hoạch có ở KS, QL, Admin; không có ở các vai trò khác.
for (const role of ['KS_LS', 'QUAN_LY_LS', 'ADMIN']) {
  as(role);
  assert.match(LS.screens.board(), /data-act="plan-edit"/, role + ' phải thấy nút Giao kế hoạch ở Kết quả thực hiện');
  assert.ok(D.ROLES[role].nav.includes('board'), role + ' có màn Tổng hợp');
}
as('CAN_BO_LS');
LS.screens.planDialog();
assert.match(toasts[toasts.length - 1][0], /Chỉ Kiểm soát LS hoặc Quản lý LS/, 'Cán bộ LS không mở được hộp thoại giao kế hoạch');

// Hộp thoại có đủ dòng kế hoạch ngày (trừ tiêu đề Hồ sơ tồn) và hai chỉ tiêu, điền sẵn giá trị đang có.
as('QUAN_LY_LS');
st.settings.daily_plan_json = JSON.stringify({ HD_TIN_DUNG: 31 });
st.settings.target_done_month = 400;
LS.screens.planDialog();
assert.match(dialog, /data-form="work-plan"/);
for (const row of D.DAILY_ROWS.filter((r) => !r.header)) assert.ok(dialog.includes(`name="plan_${row.key}"`), 'Thiếu ô kế hoạch ' + row.key);
assert.ok(!dialog.includes('name="plan_TON"'), 'Dòng tiêu đề Hồ sơ tồn không có kế hoạch');
assert.match(dialog, /name="plan_HD_TIN_DUNG"[^>]*value="31"/);
assert.match(dialog, /name="target_done_month"[^>]*value="400"/);
assert.match(dialog, /name="target_done_staff_month"/);

// Lưu (chế độ cục bộ): ghi vào cấu hình, bật cột Kế hoạch để thấy ngay.
const form = (fields) => {
  const attrs = {};
  return { _fields: fields, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
};
LS.screens.submitPlan(form({ plan_HD_TIN_DUNG: '31', plan_RLOS: '10', plan_HD_THE_CHAP: '', target_done_month: '450', target_done_staff_month: '45' }));
assert.deepEqual(JSON.parse(st.settings.daily_plan_json), { HD_TIN_DUNG: 31, RLOS: 10 });
assert.equal(st.settings.target_done_month, 450);
assert.equal(st.settings.target_done_staff_month, 45);
assert.match(toasts[toasts.length - 1][0], /Đã lưu kế hoạch/);
assert.match(LS.screens.board(), /KẾ HOẠCH NGÀY/, 'Sau khi giao, cột Kế hoạch tự hiện');

// Số sai bị chặn ở giao diện, không đổi gì.
const before = st.settings.daily_plan_json;
LS.screens.submitPlan(form({ plan_RLOS: '-3' }));
assert.match(toasts[toasts.length - 1][0], /số nguyên không âm/);
LS.screens.submitPlan(form({ plan_RLOS: '2.5' }));
assert.match(toasts[toasts.length - 1][0], /số nguyên không âm/);
LS.screens.submitPlan(form({ target_done_month: 'abc' }));
assert.match(toasts[toasts.length - 1][0], /số nguyên không âm/);
assert.equal(st.settings.daily_plan_json, before);

// Cán bộ LS không lưu được dù gọi thẳng hàm.
as('CAN_BO_LS');
LS.screens.submitPlan(form({ plan_RLOS: '99' }));
assert.equal(JSON.parse(st.settings.daily_plan_json).RLOS, 10);

// Cấu hình chung của Admin không còn ô kế hoạch / chỉ tiêu; nút giao kế hoạch nằm ở Tổng hợp.
as('ADMIN');
LS.admin.setSection('settings');
const adminView = LS.admin.view();
assert.doesNotMatch(adminView, /name="plan_|name="target_done_month"|name="target_done_staff_month"/);
assert.match(LS.screens.board(), /data-act="plan-edit"/, 'Admin giao kế hoạch qua Tổng hợp');

// Lưu cấu hình chung ở chế độ cục bộ không xóa kế hoạch do KS giao.
const planBefore = st.settings.daily_plan_json, targetBefore = st.settings.target_done_month;
LS.admin.saveSettings(form({ bank_name: 'BIDV', retention_months: '12' }));
assert.equal(st.settings.daily_plan_json, planBefore, 'Lưu cấu hình chung không được xóa kế hoạch');
assert.equal(st.settings.target_done_month, targetBefore, 'Lưu cấu hình chung không được xóa chỉ tiêu');

console.log('Work plan contract passed: KS/QL assign -> server guard -> visible to LS roles -> Admin settings no longer overwrite.');
