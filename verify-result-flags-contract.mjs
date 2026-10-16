/**
 * Cán bộ LS tick kết quả khi hoàn thành hồ sơ, bảng Kết quả thực hiện đếm theo tick:
 *  - hồ sơ vay: "Soạn HĐ thế chấp" (có tài sản bảo đảm) và "Giao dịch trên Rlos",
 *  - việc TSĐB: "Soạn HĐ thế chấp" khi làm TSĐB mới hoặc phụ lục TSĐB.
 * Hồ sơ hoàn thành trước khi có tick vẫn được phân loại theo tên loại việc.
 * Chạy: node verify-result-flags-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/* ---------- Luật tính bảng ngày (client) ---------- */
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

const wt = (code) => st.workTypes.find((w) => w.code === code);
// Việc đã hoàn thành trước khi có ô phần việc TSĐB (không có tick riêng) giữ cách đếm cũ.
const keys = (code, extra) => Array.from(D.dailyActivityKeys(Object.assign({ work_type_code: code, status: 'HOAN_THANH_LS' }, extra || {}), wt(code)));
const flagKeys = (code, extra) => Array.from(D.resultFlagsFor(Object.assign({ work_type_code: code }, extra || {}), wt(code))).map((x) => x.key);

// Các tick áp dụng: hồ sơ vay có HĐ thế chấp và Rlos; việc TSĐB chỉ có HĐ thế chấp; loại việc khác không có tick.
assert.deepEqual(Array.from(D.RESULT_FLAGS).map((x) => x.key), ['HD_THE_CHAP', 'RLOS']);
assert.deepEqual(flagKeys('LEGACY_05'), ['HD_THE_CHAP', 'RLOS']);
assert.deepEqual(flagKeys('LEGACY_26'), [], 'Việc TSĐB có ô phần việc riêng (soạn xong HĐ thế chấp, nhập kho) nên không tick lúc hoàn thành');
assert.deepEqual(flagKeys('LEGACY_24'), [], 'Xuất TSĐB có ô xuất kho riêng');
assert.deepEqual(flagKeys('LEGACY_26', { status: 'HOAN_THANH_LS' }), ['HD_THE_CHAP'], 'Việc TSĐB hoàn thành từ trước vẫn xem và sửa được tick cũ');
assert.deepEqual(flagKeys('LEGACY_27'), ['HD_THE_CHAP'], 'Mượn TSĐB không có ô phần việc: vẫn tick HĐ thế chấp nếu có soạn phụ lục');
assert.deepEqual(flagKeys('LEGACY_29'), []);

// Chưa có tick (hồ sơ cũ): phân loại theo tên loại việc.
assert.deepEqual(keys('LEGACY_05'), ['HD_TIN_DUNG', 'RLOS', 'HD_THE_CHAP'], 'Vay nhà ở có TSĐB: HĐ tín dụng + Rlos + HĐ thế chấp');
assert.deepEqual(keys('LEGACY_05', { collateral_mode: 'NONE' }), ['HD_TIN_DUNG', 'RLOS'], 'Khi ghi rõ không có TSĐB thì tên sản phẩm không ép cộng HĐ thế chấp');
assert.deepEqual(keys('LEGACY_10'), ['HD_TIN_DUNG', 'RLOS'], 'Vay tín chấp không có HĐ thế chấp');
assert.deepEqual(keys('LEGACY_09'), ['HD_TIN_DUNG', 'RLOS'], 'Cầm cố tính như hồ sơ vay, không còn dòng riêng');
assert.deepEqual(keys('LEGACY_13'), ['HD_TIN_DUNG', 'RLOS'], 'Giải ngân từng lần không còn dòng giải ngân TP');
assert.deepEqual(keys('LEGACY_26'), ['HD_THE_CHAP'], 'Nhập mới TSĐB = soạn HĐ thế chấp');
assert.deepEqual(keys('LEGACY_22'), ['HD_THE_CHAP'], 'Phụ lục TSĐB (nhập tăng) = soạn HĐ thế chấp');
assert.deepEqual(keys('LEGACY_24'), ['KHAC'], 'Xuất TSĐB / xóa thế chấp không soạn HĐ thế chấp');
assert.deepEqual(keys('LEGACY_29'), ['KHAC']);

// Có tick: theo tick của cán bộ.
assert.deepEqual(keys('LEGACY_05', { result_flags: { HD_THE_CHAP: true, RLOS: false } }), ['HD_TIN_DUNG', 'HD_THE_CHAP']);
assert.deepEqual(keys('LEGACY_05', { result_flags: { HD_THE_CHAP: false, RLOS: true } }), ['HD_TIN_DUNG', 'RLOS']);
assert.deepEqual(keys('LEGACY_10', { result_flags: { HD_THE_CHAP: true, RLOS: true } }), ['HD_TIN_DUNG', 'RLOS', 'HD_THE_CHAP'], 'Vay tín chấp nhưng có soạn HĐ thế chấp: tick thêm');
assert.deepEqual(keys('LEGACY_05', { result_flags: '{"HD_THE_CHAP":false,"RLOS":false}' }), ['HD_TIN_DUNG'], 'Tick lưu dạng chuỗi JSON vẫn đọc được; bỏ hết tick vẫn còn HĐ tín dụng');
assert.deepEqual(keys('LEGACY_05', { result_flags: { RLOS: false } }), ['HD_TIN_DUNG', 'HD_THE_CHAP'], 'Tick thiếu khóa nào thì khóa đó theo cách phân loại');
assert.deepEqual(keys('LEGACY_10', { result_flags: { GIAI_NGAN: true, RLOS: true } }), ['HD_TIN_DUNG', 'RLOS'], 'Tick giải ngân TP cũ không còn tác dụng');
assert.deepEqual(keys('LEGACY_26', { result_flags: { HD_THE_CHAP: false } }), ['KHAC'], 'Bỏ tick HĐ thế chấp của việc TSĐB: tính vào Khác');
assert.deepEqual(keys('LEGACY_24', { result_flags: { HD_THE_CHAP: true } }), ['HD_THE_CHAP']);
assert.deepEqual(keys('LEGACY_28', { collateral_mode: 'MOI' }), ['HD_THE_CHAP'], 'Việc kèm TSĐB mới luôn là HĐ thế chấp');
assert.deepEqual(keys('LEGACY_29', { result_flags: { RLOS: true } }), ['KHAC'], 'Loại việc không có tick thì tick lạ không đổi kết quả');

// Tồn: chỉ tính phần chưa làm của hồ sơ đã được LS tiếp nhận.
const received = (work_type_code) => ({ work_type_code, dossier_received_at: '2026-10-05T01:00:00Z' });
assert.deepEqual(Array.from(D.dailyBacklogKeys(received('LEGACY_26'), wt('LEGACY_26'))), ['TON_THE_CHAP']);
assert.deepEqual(Array.from(D.dailyBacklogKeys(received('LEGACY_24'), wt('LEGACY_24'))), []);
assert.deepEqual(Array.from(D.dailyBacklogKeys(received('LEGACY_05'), wt('LEGACY_05'))), ['TON_THE_CHAP', 'TON_TIN_DUNG']);
assert.deepEqual(Array.from(D.dailyBacklogKeys(received('LEGACY_09'), wt('LEGACY_09'))), ['TON_TIN_DUNG']);

assert.equal(D.savedResultFlags({ result_flags: 'không phải JSON' }), null);
assert.equal(D.savedResultFlags({}), null);

/* ---------- Hộp thoại hoàn thành và lưu tick (client, chế độ cục bộ) ---------- */
const officer = st.users.find((u) => u.role === 'CAN_BO_LS');
st.session = officer.user_id;
const request = st.requests[0];
let seq = 0;
const mk = (code, extra) => {
  const item = Object.assign(JSON.parse(JSON.stringify(st.items[0])), {
    item_id: 'TICK_' + (++seq), request_id: request.request_id, work_type_code: code, product_name: wt(code).name, status: 'DANG_THUC_HIEN',
    assigned_user_id: officer.user_id, checklist: [], completed_at: '', syncing: false, version: 3, pending: null, collateral_mode: '',
    execution_state:'ACTIVE', dossier_received_at:'2026-10-01T01:00:00Z', processing_started_at:'2026-10-01T01:00:00Z',
    processing_sessions:[{user_id:officer.user_id,start:'2026-10-01T01:00:00Z',end:''}],
    appointment: { at: '2026-10-01T02:00:00Z', date: '2026-10-01', time: '09:00', place: 'PGD', channel: 'SMS' }
  }, extra || {});
  delete item.result_flags;
  st.items.push(item);
  return item;
};
const box = (name) => new RegExp(`<input type="checkbox" name="flag_${name}"( checked)?>`).exec(dialog);

const mortgageLoan = mk('LEGACY_05');
LS.screens.flow(mortgageLoan.item_id, 'HOAN_THANH_LS');
assert.ok(box('HD_THE_CHAP') && box('RLOS'), 'Hồ sơ vay có hai ô tick khi hoàn thành');
assert.ok(box('HD_THE_CHAP')[1] && box('RLOS')[1], 'Vay nhà ở có TSĐB: tick sẵn cả hai');
assert.doesNotMatch(dialog, /giải ngân/i, 'Không còn tick giải ngân TP');
assert.match(dialog, /Đã soạn HĐ thế chấp/);
assert.match(dialog, /Đã làm giao dịch trên Rlos/);

const plainLoan = mk('LEGACY_10');
LS.screens.flow(plainLoan.item_id, 'HOAN_THANH_LS');
assert.ok(!box('HD_THE_CHAP')[1] && box('RLOS')[1], 'Vay tín chấp: Rlos tick sẵn, HĐ thế chấp không');

const newCollateral = mk('LEGACY_26');
LS.screens.flow(newCollateral.item_id, 'HOAN_THANH_LS');
assert.ok(!box('HD_THE_CHAP') && !box('RLOS'), 'Việc TSĐB mới không tick kết quả lúc hoàn thành');
assert.match(dialog, /name="step_HD_THE_CHAP"/, 'Việc TSĐB mới có ô soạn xong HĐ thế chấp');
assert.match(dialog, /name="step_NHAP_KHO"/, 'Việc TSĐB mới có ô nhập kho');

const release = mk('LEGACY_27');
LS.screens.flow(release.item_id, 'HOAN_THANH_LS');
assert.ok(box('HD_THE_CHAP') && !box('HD_THE_CHAP')[1] && !box('RLOS'), 'Mượn TSĐB: ô HĐ thế chấp không tick sẵn');
assert.doesNotMatch(dialog, /name="step_/, 'Mượn TSĐB không có ô phần việc');

const other = mk('LEGACY_29');
LS.screens.flow(other.item_id, 'HOAN_THANH_LS');
assert.ok(!box('HD_THE_CHAP') && !box('RLOS'), 'Việc khác không có ô tick');

// Hộp thoại các bước khác không có ô tick.
LS.screens.flow(plainLoan.item_id, 'DANG_HEN_KH');
assert.ok(!box('RLOS'), 'Chỉ hộp thoại Hoàn thành có ô tick');

const form = (item, fields, to = 'HOAN_THANH_LS') => {
  const attrs = { 'data-id': item.item_id, 'data-to': to, 'data-from': item.status, 'data-version': String(item.version) };
  return { _fields: fields, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
};

// Vay tín chấp: tick HĐ thế chấp, bỏ tick Rlos.
LS.screens.submitFlow(form(plainLoan, { flag_HD_THE_CHAP: 'on', notification_mode: 'NONE' }));
assert.equal(plainLoan.status, 'HOAN_THANH_LS');
assert.deepEqual({ ...plainLoan.result_flags }, { HD_THE_CHAP: true, RLOS: false });
assert.deepEqual(Array.from(D.dailyActivityKeys(plainLoan, wt('LEGACY_10'))), ['HD_TIN_DUNG', 'HD_THE_CHAP']);

// Việc TSĐB mới: thiếu ô nhập kho thì chưa hoàn thành được; tick đủ thì ghi cho người đang giữ hồ sơ.
toasts.length = 0;
LS.screens.submitFlow(form(newCollateral, { step_HD_THE_CHAP: 'on', step_qty_HD_THE_CHAP: '1', notification_mode: 'NONE' }));
assert.equal(newCollateral.status, 'DANG_THUC_HIEN', 'Chưa tick nhập kho thì chưa hoàn thành');
assert.match(toasts[toasts.length - 1][0], /nhập kho/i);
LS.screens.submitFlow(form(newCollateral, { step_HD_THE_CHAP: 'on', step_qty_HD_THE_CHAP: '1', step_NHAP_KHO: 'on', notification_mode: 'NONE' }));
assert.equal(newCollateral.status, 'HOAN_THANH_LS');
assert.deepEqual(Object.keys(newCollateral.result_credit).sort(), ['HD_THE_CHAP', 'NHAP_KHO']);
assert.equal(newCollateral.result_credit.NHAP_KHO.user_id, officer.user_id);
assert.deepEqual(Array.from(D.dailyActivityKeys(newCollateral, wt('LEGACY_26'))), [], 'HĐ thế chấp và nhập kho đã tính theo ngày tick, không đếm lại lúc hoàn thành');

// Mượn TSĐB hoàn thành mà không tick: tính vào Khác.
LS.screens.submitFlow(form(release, { notification_mode: 'NONE' }));
assert.deepEqual({ ...release.result_flags }, { HD_THE_CHAP: false });
assert.deepEqual(Array.from(D.dailyActivityKeys(release, wt('LEGACY_27'))), ['KHAC']);

// Việc khác: không ghi tick.
LS.screens.submitFlow(form(other, { flag_RLOS: 'on', notification_mode: 'NONE' }));
assert.equal(other.status, 'HOAN_THANH_LS');
assert.equal(other.result_flags, undefined);

/* ---------- Sửa tick sau khi hoàn thành ---------- */
LS.screens.detail(plainLoan.item_id);
assert.match(dialog, /Kết quả ghi nhận/);
assert.match(dialog, /HĐ thế chấp: có · Rlos: không/, 'Chi tiết hiện kết quả đã ghi nhận');
assert.match(dialog, /data-act="edit-result-flags"/, 'Cán bộ xử lý sửa được ghi nhận của mình');
LS.screens.detail(release.item_id);
assert.match(dialog, /HĐ thế chấp: không/);
assert.doesNotMatch(dialog, /Rlos/, 'Việc TSĐB chỉ có HĐ thế chấp');
LS.screens.detail(other.item_id);
assert.doesNotMatch(dialog, /edit-result-flags|Kết quả ghi nhận/, 'Việc khác không có ghi nhận kết quả');

LS.screens.editResultFlags(plainLoan.item_id);
assert.ok(box('HD_THE_CHAP')[1] && !box('RLOS')[1], 'Hộp thoại sửa hiện đúng tick đã lưu');
LS.screens.submitResultFlags(form(plainLoan, { flag_RLOS: 'on' }));
assert.deepEqual({ ...plainLoan.result_flags }, { HD_THE_CHAP: false, RLOS: true });
assert.ok(st.events.some((e) => e.item_id === plainLoan.item_id && e.type === 'GHI_NHAN_GIAO_DICH'), 'Sửa tick ghi vào nhật ký');

// Mượn TSĐB: cán bộ có soạn phụ lục thì tick thêm sau.
LS.screens.editResultFlags(release.item_id);
LS.screens.submitResultFlags(form(release, { flag_HD_THE_CHAP: 'on' }));
assert.deepEqual(Array.from(D.dailyActivityKeys(release, wt('LEGACY_27'))), ['HD_THE_CHAP']);

const open = mk('LEGACY_05');
LS.screens.editResultFlags(open.item_id);
assert.match(toasts[toasts.length - 1][0], /Không thể sửa/, 'Hồ sơ chưa hoàn thành chưa sửa được tick');
const otherStaff = st.users.find((u) => u.role === 'CAN_BO_LS' && u.user_id !== officer.user_id);
if (otherStaff) { st.session = otherStaff.user_id; LS.screens.editResultFlags(plainLoan.item_id); assert.match(toasts[toasts.length - 1][0], /Không thể sửa/, 'Cán bộ khác không sửa được tick của người khác'); }
st.session = st.users.find((u) => u.role === 'QUAN_LY_LS').user_id;
LS.screens.editResultFlags(plainLoan.item_id);
assert.ok(box('RLOS'), 'Quản lý LS sửa được tick');

/* ---------- Máy chủ ---------- */
const sctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
vm.runInContext(read('SetupSheetDB.gs'), sctx);

assert.ok(vm.runInContext('SCHEMA.WorkItems', sctx).includes('result_flags_json'), 'Kho phải có cột result_flags_json');
assert.match(read('Code.gs'), /hasColumns_\('WorkItems', \[[^\]]*'result_flags_json'[^\]]*\]\)/, 'Nâng cấp kho phải kiểm cột mới');
assert.notEqual(vm.runInContext('RUNTIME_SCHEMA_VERSION_', sctx), 'runtime_v54_audit_fixes', 'Thêm cột phải đổi phiên bản schema để kho cũ tự nâng cấp');
const writes = vm.runInContext('API_WRITE_', sctx);
assert.ok(writes.includes('saveResultFlags') && vm.runInContext('Object.keys(apiFunctions_())', sctx).includes('saveResultFlags'), 'saveResultFlags là lệnh ghi và đã đăng ký vào cổng api');

const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
  WorkTypes: [{ type_code: 'LOAN', display_name: 'Món - Vay mới', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' }],
  Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' }, { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 2' },
    { user_id: 'KS', role: 'KS_LS', is_active: true }, { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true }],
  Units: [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }],
  Requests: [{ request_id: 'R1', unit_id: 'U1', period_id: 'P1' }], WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: () => ({ rows: [] })
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], find: (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; } };
sctx.syncMonthlyPlanWorkbook_ = () => {};
sctx.markPlanDirty_ = () => {};
sctx.Notifications = { queue: () => 0 };
let actor = db.Users[0];
sctx.requireActor_ = () => actor;

const loan = () => {
  const item = { item_id: 'I' + (db.WorkItems.length + 1), request_id: 'R1', period_id: 'P1', work_type_code: 'LOAN', status: 'DANG_HEN_KH', assigned_user_id: 'LS1', version: 4,
    checklist_json: '[]', appointment_json: '{"at":"2026-10-01T02:00:00Z"}', dossier_received_at: '2026-09-30T01:00:00.000Z', processing_started_at: '2026-09-30T01:00:00.000Z' };
  db.WorkItems.push(item);
  return item;
};

// Hoàn thành kèm tick: lưu đúng, trả lại cho giao diện.
actor = db.Users[0];
let item = loan();
const done = sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: false } });
assert.equal(item.status, 'HOAN_THANH_LS');
assert.deepEqual(JSON.parse(item.result_flags_json), { HD_THE_CHAP: true, RLOS: false });
assert.deepEqual(JSON.parse(done.result_flags_json), { HD_THE_CHAP: true, RLOS: false });

// Việc TSĐB chỉ gửi tick HĐ thế chấp: chỉ lưu khóa được gửi.
item = loan();
sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true } });
assert.deepEqual(JSON.parse(item.result_flags_json), { HD_THE_CHAP: true });

// Không gửi tick (giao diện cũ, hoặc việc không có tick): giữ nguyên, không bịa tick.
item = loan();
const noFlags = sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', {});
assert.equal(item.result_flags_json, undefined);
assert.equal(noFlags.result_flags_json, '');

// Màn hình bản cũ còn gửi tick giải ngân TP: bỏ khóa đó, không chặn hoàn thành.
item = loan();
sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { GIAI_NGAN: true, RLOS: true } });
assert.equal(item.status, 'HOAN_THANH_LS');
assert.deepEqual(JSON.parse(item.result_flags_json), { RLOS: true });
item = loan();
sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { GIAI_NGAN: true } });
assert.equal(item.status, 'HOAN_THANH_LS');
assert.equal(item.result_flags_json, undefined, 'Chỉ có khóa cũ thì không ghi gì');

// Tick bị từ chối khi sai khóa, sai kiểu hoặc không phải lúc hoàn thành.
item = loan();
assert.match(fail(() => sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { THU_NO: true } })), /không hợp lệ/);
assert.match(fail(() => sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: ['RLOS'] })), /không hợp lệ/);
assert.match(fail(() => sctx.transitionItem(item.item_id, 'DANG_THUC_HIEN', { result_flags: { RLOS: true } })), /khi hoàn thành/);
assert.equal(item.status, 'DANG_HEN_KH', 'Tick sai không làm đổi trạng thái');
// Chuỗi "true" từ giao diện cũ vẫn được hiểu đúng; mọi giá trị khác là không tick.
sctx.transitionItem(item.item_id, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: 'true', RLOS: 'yes' } });
assert.deepEqual(JSON.parse(item.result_flags_json), { HD_THE_CHAP: true, RLOS: false });

// Sửa tick sau hoàn thành.
const sid = item.item_id, v = item.version;
assert.match(fail(() => sctx.saveResultFlags(sid, { RLOS: true }, v - 1)), /người khác cập nhật/);
actor = db.Users[1];
assert.match(fail(() => sctx.saveResultFlags(sid, { RLOS: true }, v)), /Chỉ người được giao/, 'Cán bộ khác không sửa được');
actor = db.Users[3];
assert.match(fail(() => sctx.saveResultFlags(sid, { RLOS: true }, v)), /Vai trò/, 'Phòng/PGD không sửa được');
actor = db.Users[0];
assert.match(fail(() => sctx.saveResultFlags(sid, null, v)), /Thiếu ghi nhận/);
assert.match(fail(() => sctx.saveResultFlags(sid, { GIAI_NGAN: true }, v)), /Thiếu ghi nhận/, 'Chỉ có khóa cũ thì coi như không có tick');
assert.match(fail(() => sctx.saveResultFlags(sid, { LA: true }, v)), /không hợp lệ/);
const open2 = loan();
assert.match(fail(() => sctx.saveResultFlags(open2.item_id, { RLOS: true }, open2.version)), /sau khi hồ sơ đã hoàn thành/);
const saved = sctx.saveResultFlags(sid, { HD_THE_CHAP: false, RLOS: true }, v);
assert.deepEqual(JSON.parse(item.result_flags_json), { HD_THE_CHAP: false, RLOS: true });
assert.equal(saved.version, v + 1);
assert.equal(item.status, 'HOAN_THANH_LS', 'Sửa tick không đổi trạng thái');
const ev = db.Events.filter((e) => e.item_id === sid && e.type === 'GHI_NHAN_GIAO_DICH');
assert.equal(ev.length, 1, 'Sửa tick ghi một sự kiện');
assert.equal(ev[0].by, 'LS1');
assert.match(ev[0].reason, /HĐ thế chấp: không · Rlos: có/);
actor = db.Users[2];
sctx.saveResultFlags(sid, { HD_THE_CHAP: true, RLOS: true }, saved.version);
assert.deepEqual(JSON.parse(item.result_flags_json), { HD_THE_CHAP: true, RLOS: true }, 'Kiểm soát LS sửa được');

// Quản trị chỉ thấy bản đã lọc, nhưng bảng ngày của Quản trị vẫn đếm đúng theo tick.
assert.match(sctx.sanitizeAdminItem_(item).result_flags_json, /HD_THE_CHAP/);

// Client và máy chủ dùng chung một danh sách kết quả.
assert.deepEqual(Array.from(vm.runInContext('RESULT_FLAG_KEYS_', sctx)), Array.from(D.RESULT_FLAGS).map((x) => x.key));

console.log('Result flags contract passed: tick at completion -> daily matrix (HĐ thế chấp / Rlos) -> correction.');
