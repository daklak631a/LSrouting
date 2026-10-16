/**
 * Hợp đồng: tạm dừng là thao tác của cán bộ LS; đổi người giữa chừng thì phần cán bộ cũ
 * đã làm xong được tính kết quả cho họ, người nhận chỉ được tính phần còn lại.
 *
 * Tình huống: cán bộ A đang làm hồ sơ vay có TSĐB (HĐ tín dụng, HĐ thế chấp, Rlos), mới
 * soạn xong HĐ thế chấp thì có việc đột xuất. A tạm dừng; kiểm soát LS đổi sang B và tick
 * "A đã làm xong HĐ thế chấp". Bảng ngày: HĐ thế chấp tính cho A, HĐ tín dụng và Rlos cho B.
 * Chạy: node verify-handover-credit-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/* ---------- Client ---------- */
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
const toasts = [];
let dialog = '';
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
LS.ui.openDialog = (title, body) => { dialog = body; };
LS.ui.closeDialog = () => {};
LS.ui.toast = (message, kind) => { toasts.push([message, kind]); };
LS.load(D.seed);
const st = LS.db();

// 1. LS và QLKH tạo đề nghị được tạm dừng; chỉ LS tiếp tục xử lý.
Object.keys(D.FLOW).forEach((from) => (D.FLOW[from] || []).filter((s) => s.to === 'TAM_DUNG').forEach((s) => {
  assert.deepEqual(Array.from(s.roles), ['CAN_BO_LS','PHONG_PGD'], 'Tạm dừng ở ' + from + ' cho LS và QLKH tạo đề nghị');
}));
const fromPause = (to) => D.FLOW.TAM_DUNG.find((s) => s.to === to);
assert.deepEqual(Array.from(fromPause('DANG_THUC_HIEN').roles), ['CAN_BO_LS'], 'Tiếp tục xử lý chỉ cán bộ LS bấm');
assert.ok(fromPause('DA_PHAN_CONG').roles.includes('KS_LS') && fromPause('DA_PHAN_CONG').roles.includes('QUAN_LY_LS'), 'KS/QL vẫn đổi người hồ sơ đang dừng');
assert.ok(fromPause('HUY').roles.includes('KS_LS'), 'KS vẫn hủy được hồ sơ đang dừng');

// 2. Luật đếm: phần đã ghi nhận cho người cũ không tính lại cho người hoàn thành.
const wt = (code) => st.workTypes.find((w) => w.code === code);
const mortgageLoan = wt('LEGACY_05');
const base = { work_type_code: 'LEGACY_05', collateral_mode: 'NONE', dossier_received_at: '2026-10-05T01:00:00Z' };
assert.deepEqual(Array.from(D.handoverPartsFor(base, mortgageLoan)).map((p) => p.key), ['HD_TIN_DUNG', 'HD_THE_CHAP', 'RLOS']);
const credited = Object.assign({}, base, { result_credit: { HD_THE_CHAP: { user_id: 'A', at: '2026-10-05T03:00:00.000Z' } } });
assert.deepEqual(Array.from(D.handoverPartsFor(credited, mortgageLoan)).map((p) => p.key), ['HD_TIN_DUNG', 'RLOS'], 'Phần đã ghi nhận không tick lại');
assert.deepEqual(Array.from(D.resultFlagsFor(credited, mortgageLoan)).map((x) => x.key), ['RLOS'], 'Người hoàn thành không tick lại HĐ thế chấp');
assert.deepEqual(Array.from(D.dailyActivityKeys(credited, mortgageLoan)), ['HD_TIN_DUNG', 'RLOS']);
assert.deepEqual(Array.from(D.dailyBacklogKeys(credited, mortgageLoan)), ['TON_TIN_DUNG'], 'HĐ thế chấp đã soạn thì hết tồn');
assert.deepEqual(Array.from(D.creditedParts(Object.assign({}, base, { result_credit_json: '{"RLOS":{"user_id":"A","at":"x"}}' }))).map((p) => p.key), ['RLOS'], 'Đọc được dạng chuỗi JSON');
const collateral = st.workTypes.find((w) => /tsđb|tsbđ/i.test((w.group || '') + ' ' + w.name) && /nhập mới|nhập thêm/i.test(w.name));
if (collateral) {
  const tsdb = { work_type_code: collateral.code, collateral_mode: 'NONE', result_credit: { HD_THE_CHAP: { user_id: 'A', at: 'x' } } };
  assert.deepEqual(Array.from(D.dailyActivityKeys(tsdb, collateral)), [], 'Việc TSĐB đã tính HĐ thế chấp cho người cũ: người hoàn thành không tính thêm');
}

// 3. Luồng thật trên màn hình: A làm dở, KS đổi sang B và tick phần A đã làm.
const [A, B] = st.users.filter((u) => u.role === 'CAN_BO_LS' && u.active);
const ks = st.users.find((u) => u.role === 'KS_LS');
const now = new Date().toISOString();
const item = { item_id: 'HANDOVER1', request_id: st.requests[0].request_id, period_id: st.items[0].period_id, work_type_code: 'LEGACY_05', product_name: mortgageLoan.name,
  collateral_mode: 'NONE', occurrence_date: now.slice(0, 10), status: 'TAM_DUNG', assigned_user_id: A.user_id, version: 3, checklist: [],
  submitted_at: now, assigned_at: now, first_assigned_at: now, dossier_received_at: now, processing_started_at: now, processing_sessions: [], sla_pause_log: [], pause_log: [] };
st.items.push(item);

function cells(html, label) {
  const staff = [...html.matchAll(/<th class="dm-staff">([^<]*)<\/th>/g)].map((m) => m[1]);
  const row = html.match(new RegExp('<td class="dm-act">(?:<button[\\s\\S]*?</button>)?(?:<i>)?' + label + '(?:</i>)?</td><td class="dm-unit">.*?</td>((?:<td class="num">\\d*</td>)+)'));
  const nums = [...row[1].matchAll(/<td class="num">(\d*)<\/td>/g)].map((m) => Number(m[1] || 0));
  const out = {};
  staff.forEach((s, n) => { out[s] = nums[n]; });
  return out;
}
const labels = Array.from(D.dailyStaffLabels(st.users.filter((u) => u.role === 'CAN_BO_LS')));
const staffIds = st.users.filter((u) => u.role === 'CAN_BO_LS').map((u) => u.user_id);
const lab = (u) => labels[staffIds.indexOf(u.user_id)];
const snapshot = () => {
  const html = LS.screens.board();
  return Object.fromEntries(['Soạn thảo HĐ thế chấp', 'Soạn thảo HĐ tín dụng', 'Giao dịch trên Rlos', 'Còn soạn HĐ thế chấp', 'Còn soạn HĐ tín dụng'].map((k) => [k, cells(html, k)]));
};
const delta = (a, b, row, u) => b[row][lab(u)] - a[row][lab(u)];

st.session = ks.user_id;
const s0 = snapshot();

dialog = '';
LS.screens.flow(item.item_id, 'DANG_THUC_HIEN');
assert.equal(dialog, '', 'KS không có nút Tiếp tục xử lý cho hồ sơ LS đang tạm dừng');

LS.screens.flow(item.item_id, 'DA_PHAN_CONG');
assert.match(dialog, /name="handover_HD_THE_CHAP"/, 'Hộp thoại đổi người có ô tick phần cán bộ cũ đã làm');
assert.match(dialog, new RegExp('Phần ' + A.full_name + ' đã làm xong'));
const form = (fields) => ({ _fields: fields, getAttribute: (k) => ({ 'data-id': item.item_id, 'data-to': 'DA_PHAN_CONG', 'data-from': 'TAM_DUNG', 'data-version': String(item.version) })[k] || null,
  setAttribute() {}, removeAttribute() {} });

// Chọn lại chính A mà tick phần đã làm: không hợp lệ.
toasts.length = 0;
LS.screens.submitFlow(form({ assignee: A.user_id, reason: 'x', handover_HD_THE_CHAP: 'on' }));
assert.match(toasts.map((t) => t[0]).join(' '), /chuyển sang cán bộ khác/);
assert.equal(item.assigned_user_id, A.user_id);

LS.screens.submitFlow(form({ assignee: B.user_id, reason: 'A có việc đột xuất', handover_HD_THE_CHAP: 'on' }));
assert.equal(item.assigned_user_id, B.user_id);
assert.equal(item.result_credit.HD_THE_CHAP.user_id, A.user_id, 'HĐ thế chấp ghi nhận cho A');
const s1 = snapshot();
assert.equal(delta(s0, s1, 'Soạn thảo HĐ thế chấp', A), 1, 'A được tính 1 HĐ thế chấp ngay ngày bàn giao');
assert.equal(delta(s0, s1, 'Soạn thảo HĐ thế chấp', B), 0);
assert.equal(delta(s0, s1, 'Còn soạn HĐ thế chấp', A), 0, 'Hồ sơ NONE không có tồn HĐ thế chấp trước bàn giao');
assert.equal(delta(s0, s1, 'Còn soạn HĐ thế chấp', B), 0, 'HĐ thế chấp đã soạn thì B không bị tính tồn');
assert.equal(delta(s0, s1, 'Còn soạn HĐ tín dụng', B), 1, 'Tồn HĐ tín dụng chuyển sang B');

// B hoàn thành phần còn lại.
item.status = 'HOAN_THANH_LS'; item.completed_at = new Date().toISOString();
const s2 = snapshot();
assert.equal(delta(s0, s2, 'Soạn thảo HĐ thế chấp', A), 1);
assert.equal(delta(s0, s2, 'Soạn thảo HĐ thế chấp', B), 0, 'B không được tính lại HĐ thế chấp');
assert.equal(delta(s0, s2, 'Soạn thảo HĐ tín dụng', B), 1);
assert.equal(delta(s0, s2, 'Giao dịch trên Rlos', B), 1);
assert.equal(delta(s0, s2, 'Soạn thảo HĐ tín dụng', A), 0);

// Chi tiết hồ sơ hiện phần cán bộ trước đã làm.
const detailHtml = (() => { let out = ''; LS.ui.openDialog = (t, b) => { out = b; }; LS.screens.detail(item.item_id); return out; })();
assert.match(detailHtml, new RegExp('<dt>Hợp đồng thế chấp</dt><dd>Đã soạn · ' + A.full_name), 'Chi tiết ghi cán bộ cũ được tính cho phần HĐ thế chấp đã soạn');

/* ---------- Máy chủ ---------- */
const sctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
vm.runInContext(read('SetupSheetDB.gs'), sctx);

assert.ok(vm.runInContext('SCHEMA.WorkItems', sctx).includes('result_credit_json'), 'Kho phải có cột result_credit_json');
assert.match(read('Code.gs'), /hasColumns_\('WorkItems', \[[^\]]*'result_credit_json'[^\]]*\]\)/, 'Nâng cấp kho phải kiểm cột mới');
assert.notEqual(vm.runInContext('RUNTIME_SCHEMA_VERSION_', sctx), 'runtime_v55_result_flags', 'Thêm cột phải đổi phiên bản schema');
assert.match(read('Code.gs'), /result_credit_json: old\.result_credit_json/, 'Chuyển tiếp sang tháng mới giữ phần đã ghi nhận');
assert.deepEqual(Array.from(vm.runInContext('HANDOVER_PART_KEYS_', sctx)), Array.from(D.HANDOVER_PARTS).map((p) => p.key), 'Client và máy chủ chung danh sách phần việc');

const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
  WorkTypes: [{ type_code: 'LOAN', display_name: 'Món - Vay mới', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' }],
  Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' }, { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 2' },
    { user_id: 'KS', role: 'KS_LS', is_active: true, full_name: 'KS' }, { user_id: 'QL', role: 'QUAN_LY_LS', is_active: true, full_name: 'QL' }],
  Units: [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }],
  Requests: [{ request_id: 'R1', unit_id: 'U1', period_id: 'P1' }], WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  select: (n, key, predicate) => (db[n] || []).filter((row) => predicate((column) => row[column] ?? '')).map((object) => ({ object, name: n })),
  tailWhere: () => ({ rows: [] })
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], find: (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; } };
sctx.markPlanDirty_ = () => {};
sctx.Notifications = { queue: () => 0 };
let actor = db.Users[0];
sctx.requireActor_ = () => actor;
const [ls1, , ksU, qlU] = db.Users;

const loan = (status) => {
  const it = { item_id: 'I' + (db.WorkItems.length + 1), request_id: 'R1', period_id: 'P1', work_type_code: 'LOAN', status: status || 'DANG_THUC_HIEN', assigned_user_id: 'LS1', version: 4,
    checklist_json: '[]', dossier_received_at: '2026-09-30T01:00:00.000Z', processing_started_at: '2026-09-30T01:00:00.000Z' };
  db.WorkItems.push(it);
  return it;
};

// Tạm dừng / tiếp tục: KS/QL bị máy chủ từ chối, LS làm được.
let s = loan();
for (const who of [ksU, qlU]) {
  actor = who;
  assert.match(fail(() => sctx.transitionItem(s.item_id, 'TAM_DUNG', { reason: 'x' })), /Vai trò/, who.role + ' không tạm dừng được');
}
actor = ls1;
sctx.transitionItem(s.item_id, 'TAM_DUNG', { reason: 'việc đột xuất' });
assert.equal(s.status, 'TAM_DUNG');
for (const who of [ksU, qlU]) {
  actor = who;
  assert.match(fail(() => sctx.transitionItem(s.item_id, 'DANG_THUC_HIEN', { reason: 'x' })), /Vai trò/, who.role + ' không tiếp tục được');
}

// KS đổi người kèm phần LS1 đã làm.
actor = ksU;
assert.match(fail(() => sctx.transitionItem(s.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'x', handover_parts: ['THU_NO'] })), /không hợp lệ/);
assert.match(fail(() => sctx.transitionItem(s.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1', reason: 'x', handover_parts: ['HD_THE_CHAP'] })), /cán bộ khác/);
assert.match(fail(() => sctx.transitionItem(s.item_id, 'HUY', { reason: 'x', handover_parts: ['HD_THE_CHAP'] })), /đổi người/);
assert.equal(s.status, 'TAM_DUNG', 'Lệnh sai không đổi trạng thái');
const res = sctx.transitionItem(s.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'LS1 có việc đột xuất', handover_parts: ['HD_THE_CHAP', 'HD_THE_CHAP'] });
assert.equal(s.assigned_user_id, 'LS2');
const credit = JSON.parse(s.result_credit_json);
assert.deepEqual(Object.keys(credit), ['HD_THE_CHAP']);
assert.equal(credit.HD_THE_CHAP.user_id, 'LS1', 'Phần đã làm ghi cho người cũ');
assert.equal(credit.HD_THE_CHAP.by, 'KS');
assert.equal(res.result_credit_json, s.result_credit_json, 'Trả lại cho giao diện');
const ev = db.Events.filter((e) => e.item_id === s.item_id && e.type === 'DA_PHAN_CONG').pop();
assert.match(ev.reason, /LS 1 đã làm xong: HĐ thế chấp/, 'Nhật ký ghi rõ phần đã làm');

// Ghi nhận lại phần đã ghi: từ chối. Đổi người không tick gì: giữ nguyên phần cũ.
assert.match(fail(() => sctx.transitionItem(s.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1', reason: 'x', handover_parts: ['HD_THE_CHAP'] })), /đã được ghi nhận/);
sctx.transitionItem(s.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1', reason: 'trả lại' });
assert.equal(JSON.parse(s.result_credit_json).HD_THE_CHAP.user_id, 'LS1');

// Hồ sơ chưa bắt đầu xử lý thì chưa có gì để ghi nhận.
const fresh = loan('DA_PHAN_CONG');
fresh.processing_started_at = '';
assert.match(fail(() => sctx.transitionItem(fresh.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'x', handover_parts: ['RLOS'] })), /đang xử lý/);

assert.match(sctx.sanitizeAdminItem_(s).result_credit_json, /HD_THE_CHAP/, 'Bảng ngày của Quản trị cũng thấy phần ghi nhận');

console.log('Handover credit + LS-only pause contract passed.');
