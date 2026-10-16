/**
 * Phân công nhanh:
 *  - hộp thoại giao một hồ sơ: tick chọn cán bộ ngay trên bảng tải việc (không còn ô chọn riêng),
 *  - nút "Phân công nhanh" giao theo quy tắc đã cấu hình ở "Cấu hình phân công nhanh",
 *  - quy tắc = phòng → cán bộ + các sản phẩm đi theo; mặc định tick sẵn cầm cố, tick thêm sản phẩm khác.
 * Chạy: node verify-quick-assign-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
// FormData giả: get / getAll theo bảng giá trị (một khóa có thể có nhiều giá trị, như ô tick cùng tên).
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class {
    constructor(form) { this.f = form._fields; }
    get(k) { const v = this.f[k]; return v === undefined ? null : Array.isArray(v) ? (v.length ? v[0] : null) : v; }
    getAll(k) { const v = this.f[k]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
  } };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens', 'admin']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain, S = LS.screens;
const toasts = [];
let dialog = '', dialogTitle = '';
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
LS.ui.openDialog = (title, body) => { dialog = body; dialogTitle = title; };
LS.ui.closeDialog = () => {};
LS.ui.toast = (message, kind) => { toasts.push([message, kind]); };
LS.load(D.seed);
const st = LS.db();
const lastToast = () => (toasts[toasts.length - 1] || [''])[0];

/* ---------- Luật ghép quy tắc ---------- */
const wt = (code) => st.workTypes.find((w) => w.code === code);
assert.equal(D.isPledgeWorkType(wt('LEGACY_09')), true, 'Cầm cố STK/TG là cầm cố');
assert.equal(D.isPledgeWorkType(wt('LEGACY_05')), false);
assert.deepEqual(Array.from(D.ruleWorkTypeCodes({ work_type_codes: ['A', 'B', 'ALL', ''] })), ['A', 'B']);
assert.deepEqual(Array.from(D.ruleWorkTypeCodes({ work_type_code: 'A' })), ['A'], 'Quy tắc cũ một mã vẫn đọc được');
assert.deepEqual(Array.from(D.ruleWorkTypeCodes({ work_type_code: 'ALL' })), []);
assert.deepEqual(Array.from(D.ruleWorkTypeCodes({ work_type_codes: ['A'], work_type_code: 'B' })), ['A'], 'Danh sách mới thắng mã đơn cũ');
assert.ok(D.ruleMatches({ unit_id: 'U', work_type_codes: ['A', 'B'] }, 'U', { work_type_code: 'B' }));
assert.ok(!D.ruleMatches({ unit_id: 'U', work_type_codes: ['A', 'B'] }, 'U', { work_type_code: 'C' }));
assert.ok(!D.ruleMatches({ unit_id: 'U', work_type_codes: [] }, 'V', { work_type_code: 'A' }), 'Khác phòng không khớp');
assert.ok(D.ruleMatches({ unit_id: '', work_type_codes: [] }, 'V', { work_type_code: 'A' }), 'Quy tắc trống khớp mọi hồ sơ');
assert.ok(D.ruleScore({ unit_id: 'U', work_type_codes: ['A'] }) > D.ruleScore({ unit_id: 'U', work_type_codes: [] }), 'Có sản phẩm cụ thể thì cụ thể hơn quy tắc cả phòng');

/* ---------- Dữ liệu ---------- */
const staff = st.users.filter((u) => u.role === 'CAN_BO_LS');
assert.ok(staff.length >= 2, 'Seed cần ít nhất 2 cán bộ LS');
if (staff.length < 3) st.users.push(Object.assign({}, staff[0], { user_id: 'U_LS3', full_name: 'Cán bộ thứ ba', login_code: 'ls3_test', sort_order: 99 }));
const [ls1, ls2, ls3] = st.users.filter((u) => u.role === 'CAN_BO_LS');
const unitA = st.requests[0].unit_id;
const unitB = (st.units.find((x) => x.unit_id !== unitA && x.kind === 'PGD') || { unit_id: 'U_B', name: 'Phòng B', kind: 'PGD', active: true });
if (!st.units.includes(unitB)) st.units.push(unitB);
const requestB = Object.assign(JSON.parse(JSON.stringify(st.requests[0])), { request_id: 'REQ_B', unit_id: unitB.unit_id });
st.requests.push(requestB);
st.items.length = 0;
const mk = (id, request, code) => {
  const item = { item_id: id, source_stt: id, request_id: request.request_id, work_type_code: code, product_name: wt(code).name, status: 'CHO_PHAN_CONG', assigned_user_id: '',
    occurrence_date: LS.localDate(), checklist: [], pending: null, version: 1, carried_to_item_id: '', due_at: '', completed_at: '', appointment: null };
  st.items.push(item);
  return item;
};
const aPledge = mk('A_PLEDGE', st.requests[0], 'LEGACY_09');
const aThau = mk('A_THAU', st.requests[0], 'LEGACY_14');
const aMon = mk('A_MON', st.requests[0], 'LEGACY_05');
const bPledge = mk('B_PLEDGE', requestB, 'LEGACY_09');
st.catalogOptions = st.catalogOptions.filter((x) => x.catalog_key !== 'ASSIGNMENT_RULE');
const rule = (id, unit, assignee, metadata) => st.catalogOptions.push({ option_id: id, catalog_key: 'ASSIGNMENT_RULE', active: true, unit_id: unit, code: 'ALL', label: 'x', role_kind: assignee,
  sort_order: 1, metadata: Object.assign({ unit_id: unit, assignee_id: assignee, priority: 1, auto_assign: false }, metadata) });
rule('R_PLEDGE', unitA, ls1.user_id, { work_type_codes: ['LEGACY_09'] });
rule('R_THAU', unitA, ls2.user_id, { work_type_codes: ['LEGACY_14', 'LEGACY_15'] });
st.session = st.users.find((u) => u.role === 'KS_LS').user_id;

const flowRadios = (item) => {
  S.flow(item.item_id, 'DA_PHAN_CONG');
  const radios = Array.from(dialog.matchAll(/<input type="radio"[^>]*name="assignee"[^>]*value="([^"]+)"([^>]*)>/g)).map((m) => ({ id: m[1], checked: /checked/.test(m[2]) }));
  return radios;
};
const picked = (item) => flowRadios(item).filter((r) => r.checked).map((r) => r.id);

/* ---------- Hộp thoại giao một hồ sơ: tick chọn trên bảng, không còn ô chọn rời ---------- */
const radios = flowRadios(aPledge);
assert.ok(radios.length >= 3, 'Mỗi cán bộ có một ô tick trong bảng');
assert.ok(!/<select[^>]*name="assignee"/.test(dialog), 'Không còn ô chọn xổ xuống cán bộ phụ trách');
assert.match(dialog, /Tích chọn cán bộ phụ trách/);
assert.match(dialog, /data-pick-assignee/, 'Dòng cán bộ bấm chọn được');
assert.deepEqual(picked(aPledge), [ls1.user_id], 'Cầm cố phòng A mặc định về cán bộ phụ trách phòng A');
assert.match(dialog, /Theo quy tắc/);
assert.deepEqual(picked(aThau), [ls2.user_id], 'Sản phẩm tick thêm đi về cán bộ của quy tắc đó');
assert.deepEqual(picked(aMon), [], 'Sản phẩm chưa có quy tắc thì chưa tick ai: người giao tự chọn');
assert.deepEqual(picked(bPledge), [], 'Quy tắc của phòng A không áp sang phòng B');

/* Giao với tick: lấy đúng người được tick. */
const form = (item, fields, to = 'DA_PHAN_CONG') => {
  const attrs = { 'data-id': item.item_id, 'data-to': to, 'data-from': item.status, 'data-version': String(item.version) };
  return { _fields: fields, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
};
S.submitFlow(form(aMon, {}));
assert.match(lastToast(), /Tích chọn cán bộ/, 'Chưa tick ai thì nhắc tick, không giao');
assert.equal(aMon.status, 'CHO_PHAN_CONG');
S.submitFlow(form(aMon, { assignee: ls3.user_id }));
assert.equal(aMon.status, 'DA_PHAN_CONG');
assert.equal(aMon.assigned_user_id, ls3.user_id);

/* ---------- Nút Phân công nhanh ở Hàng chờ ---------- */
S.setFilter('queue', 'view', ''); S.setFilter('queue', 'qunit', ''); S.setFilter('queue', 'page', 1);
const queue = S.queue();
assert.match(queue, /data-act="batch-assign-open"[^>]*>[^<]*(<svg[\s\S]*?<\/svg>)?\s*Phân công nhanh/, 'Nút giao theo quy tắc tên là Phân công nhanh');
assert.doesNotMatch(queue, /Phân công theo lô/, 'Không còn nút Phân công theo lô (tích nhiều hồ sơ đã là giao hàng loạt)');
assert.match(queue, /Cấu hình phân công nhanh/, 'Có nút sang cấu hình quy tắc');
assert.match(queue, /id="bulk-bar"/, 'Tích nhiều hồ sơ rồi giao vẫn còn');

S.openBatchAssign();
assert.equal(dialogTitle, 'Phân công nhanh');
assert.match(dialog, /3 hồ sơ · 2 có gợi ý · 1 chưa có gợi ý/, 'Hộp thoại nói rõ số hồ sơ có gợi ý');
const included = (html) => Array.from(html.matchAll(/data-batch-include data-item-id="([^"]+)"( checked)?/g)).filter((m) => m[2]).map((m) => m[1]).sort();
assert.deepEqual(included(dialog), ['A_PLEDGE', 'A_THAU'], 'Chỉ tick sẵn hồ sơ có quy tắc');
assert.match(dialog, /Cấu hình phân công nhanh/);
const pledgeSelect = new RegExp(`name="batch_assignee_A_PLEDGE"[\\s\\S]*?<option value="${ls1.user_id}" selected`);
assert.match(dialog, pledgeSelect, 'Dòng cầm cố phòng A chọn sẵn cán bộ phụ trách phòng A');

/* Quy tắc cả phòng (không chọn sản phẩm) lấy phần còn lại, cầm cố vẫn về người đã tick riêng. */
rule('R_ALL_A', unitA, ls3.user_id, { work_type_codes: [], priority: 5 });
aMon.status = 'CHO_PHAN_CONG'; aMon.assigned_user_id = '';
assert.deepEqual(picked(aMon), [ls3.user_id], 'Sản phẩm khác của phòng đi theo quy tắc cả phòng');
assert.deepEqual(picked(aPledge), [ls1.user_id], 'Cầm cố vẫn về cán bộ phụ trách cầm cố: quy tắc cụ thể thắng');
// Quy tắc cũ chỉ có một mã vẫn ghép được.
st.catalogOptions.push({ option_id: 'R_OLD', catalog_key: 'ASSIGNMENT_RULE', active: true, unit_id: unitB.unit_id, code: 'LEGACY_09', label: 'x', role_kind: ls2.user_id, sort_order: 1, metadata: { unit_id: unitB.unit_id, work_type_code: 'LEGACY_09', assignee_id: ls2.user_id, priority: 1 } });
assert.deepEqual(picked(bPledge), [ls2.user_id], 'Quy tắc cũ (một mã loại việc) vẫn chạy');

/* ---------- Cấu hình: quy tắc mới tick sẵn cầm cố, tick thêm sản phẩm khác ---------- */
const checkedCodes = (html) => Array.from(html.matchAll(/name="work_type_codes" value="([^"]+)"[^>]*?( checked)?>/g)).filter((m) => m[2]).map((m) => m[1]).sort();
LS.admin.assignmentRuleDialog('');
const pledges = Array.from(st.workTypes).filter((w) => w.active && D.isPledgeWorkType(w)).map((w) => w.code).sort();
assert.ok(pledges.length >= 1);
assert.deepEqual(checkedCodes(dialog), pledges, 'Quy tắc mới tick sẵn đúng các sản phẩm cầm cố');
assert.ok(!/name="all_products"[^>]*checked/.test(dialog), 'Mặc định không phải mọi sản phẩm');
assert.match(dialog, /Hồ sơ giao cho cán bộ này/);
assert.match(dialog, /cầm cố — mặc định đi theo cán bộ phụ trách phòng/);
assert.match(dialog, /data-rule-group="Thấu chi"/, 'Sản phẩm gom theo loại việc, có ô tick cả nhóm');
for (const w of st.workTypes.filter((x) => x.active)) assert.ok(dialog.includes(`value="${w.code}"`), 'Thiếu sản phẩm ' + w.code);
assert.doesNotMatch(dialog, /name="work_type_code"/, 'Không còn ô chọn một loại việc');

LS.admin.assignmentRuleDialog('R_THAU');
assert.deepEqual(checkedCodes(dialog), ['LEGACY_14', 'LEGACY_15'], 'Sửa quy tắc giữ đúng sản phẩm đã tick');
LS.admin.assignmentRuleDialog('R_ALL_A');
assert.match(dialog, /name="all_products"[^>]*checked/, 'Quy tắc cả phòng hiện là Mọi sản phẩm');
assert.match(dialog, /class="rule-products is-off"/);
LS.admin.assignmentRuleDialog('R_OLD');
assert.deepEqual(checkedCodes(dialog), ['LEGACY_09'], 'Quy tắc cũ mở lên thành một sản phẩm đã tick');

const ruleForm = (fields) => ({ _fields: fields, getAttribute: () => null, setAttribute() {}, removeAttribute() {} });
const rulesBefore = st.catalogOptions.filter((x) => x.catalog_key === 'ASSIGNMENT_RULE').length;
LS.admin.saveAssignmentRule(ruleForm({ unit_id: unitA, assignee_id: ls1.user_id, priority: '2', product_name: '' }));
assert.match(lastToast(), /Tick ít nhất một sản phẩm/, 'Không tick sản phẩm nào thì không lưu');
assert.equal(st.catalogOptions.filter((x) => x.catalog_key === 'ASSIGNMENT_RULE').length, rulesBefore);
LS.admin.saveAssignmentRule(ruleForm({ unit_id: unitA, assignee_id: ls1.user_id, priority: '2', product_name: '', work_type_codes: ['LEGACY_09', 'LEGACY_14', 'LEGACY_16'], auto_assign: 'on', active: 'on' }));
const created = st.catalogOptions.filter((x) => x.catalog_key === 'ASSIGNMENT_RULE').slice(-1)[0];
assert.deepEqual(Array.from(created.metadata.work_type_codes), ['LEGACY_09', 'LEGACY_14', 'LEGACY_16']);
assert.equal(created.metadata.work_type_code, '', 'Nhiều sản phẩm thì không còn mã đơn');
assert.equal(created.metadata.auto_assign, true);
LS.admin.saveAssignmentRule(ruleForm({ unit_id: unitB.unit_id, assignee_id: ls2.user_id, priority: '3', product_name: '', work_type_codes: ['LEGACY_09'], active: 'on' }));
const single = st.catalogOptions.filter((x) => x.catalog_key === 'ASSIGNMENT_RULE').slice(-1)[0];
assert.equal(single.metadata.work_type_code, 'LEGACY_09', 'Một sản phẩm thì giữ mã đơn cho màn hình bản cũ');
assert.equal(single.code, 'LEGACY_09');
LS.admin.saveAssignmentRule(ruleForm({ unit_id: unitB.unit_id, assignee_id: ls2.user_id, priority: '4', product_name: '', all_products: 'on', work_type_codes: ['LEGACY_09'], active: 'on' }));
const everything = st.catalogOptions.filter((x) => x.catalog_key === 'ASSIGNMENT_RULE').slice(-1)[0];
assert.deepEqual(Array.from(everything.metadata.work_type_codes), [], 'Mọi sản phẩm thì không giữ danh sách');
assert.equal(everything.code, 'ALL');

// Bảng quy tắc: một cột Sản phẩm / cấu phần, rút gọn khi nhiều.
const table = LS.admin.assignmentView();
assert.match(table, /Sản phẩm \/ cấu phần/);
assert.match(table, /Mọi sản phẩm/);
assert.match(table, /\+1/, 'Quy tắc 3 sản phẩm hiện hai tên đầu và +1');
assert.match(table, /Nút <b>Phân công nhanh<\/b>/, 'Cấu hình nói rõ liên hệ với nút Phân công nhanh');

/* ---------- Máy chủ: lưu quy tắc nhiều sản phẩm và tự giao khi tạo hồ sơ ---------- */
const sctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
assert.deepEqual(Array.from(sctx.ruleWorkTypeCodes_({ work_type_codes: ['A', 'A', 'B', 'ALL'] })), ['A', 'B']);
assert.deepEqual(Array.from(sctx.ruleWorkTypeCodes_({ work_type_code: 'C' }, 'ALL')), ['C']);
assert.deepEqual(Array.from(sctx.ruleWorkTypeCodes_({}, 'D')), ['D'], 'Cột code của quy tắc cũ vẫn được đọc');
assert.deepEqual(Array.from(sctx.ruleWorkTypeCodes_({}, 'ALL')), []);

const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
  WorkTypes: ['PLEDGE', 'MON', 'THAU'].map((c) => ({ type_code: c, display_name: c, sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' })).concat([{ type_code: 'OLD', display_name: 'OLD', is_active: false }]),
  Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' }, { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 2' },
    { user_id: 'KS', role: 'KS_LS', is_active: true }, { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true }],
  Units: [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }],
  CatalogOptions: [], Requests: [], WorkItems: [], Events: [], Inbox: [], ConfigLog: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row)
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], find: (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; } };
sctx.syncMonthlyPlanWorkbook_ = () => {};
sctx.markPlanDirty_ = () => {};
sctx.Notifications = { queue: () => 0 };
sctx.activePlan_ = () => ({ period_id: 'P1' });
sctx.nextSourceStt_ = () => 1;
let actor = db.Users[2];
sctx.requireActor_ = () => actor;
const saveRule = (id, metadata, extra) => sctx.adminSaveCatalog('catalogOption', id, Object.assign({ catalog_key: 'ASSIGNMENT_RULE', label: 'Quy tắc', metadata_json: JSON.stringify(metadata) }, extra || {}));

saveRule('R1', { unit_id: 'U1', assignee_id: 'LS1', work_type_codes: ['PLEDGE'], auto_assign: true, priority: 1 });
const saved = db.CatalogOptions.find((x) => x.option_id === 'R1');
assert.deepEqual(JSON.parse(saved.metadata_json).work_type_codes, ['PLEDGE']);
assert.equal(JSON.parse(saved.metadata_json).work_type_code, 'PLEDGE', 'Một sản phẩm: giữ mã đơn cho bản cũ');
saveRule('R2', { unit_id: 'U1', assignee_id: 'LS2', work_type_codes: ['THAU', 'MON'], auto_assign: true, priority: 1 });
assert.equal(JSON.parse(db.CatalogOptions.find((x) => x.option_id === 'R2').metadata_json).work_type_code, '');
assert.equal(db.CatalogOptions.find((x) => x.option_id === 'R2').code, 'ALL');
assert.match(fail(() => saveRule('R3', { unit_id: 'U1', assignee_id: 'LS1', work_type_codes: ['PLEDGE', 'OLD'] })), /không còn hoạt động/, 'Sản phẩm đã ngừng không được dùng trong quy tắc');
assert.match(fail(() => saveRule('R3', { unit_id: 'U1', assignee_id: 'LS1', work_type_codes: ['KHONG_CO'] })), /không còn hoạt động/);
assert.match(fail(() => saveRule('R3', { unit_id: 'U1', assignee_id: 'LS1', work_type_codes: Array.from({ length: 81 }, (_, i) => 'W' + i) })), /tối đa 80/);
assert.match(fail(() => saveRule('R3', { unit_id: 'U9', assignee_id: 'LS1', work_type_codes: ['PLEDGE'] })), /Phòng trong quy tắc/);
assert.match(fail(() => saveRule('R3', { unit_id: 'U1', assignee_id: 'PG', work_type_codes: ['PLEDGE'] })), /cán bộ LS/);
actor = db.Users[0];
assert.match(fail(() => saveRule('R4', { unit_id: 'U1', assignee_id: 'LS1' })), /quản trị|Admin|cấu hình/i, 'Cán bộ LS không lưu được quy tắc');
actor = db.Users[3];
assert.match(fail(() => saveRule('R4', { unit_id: 'U1', assignee_id: 'LS1' })), /quản trị|Admin|cấu hình/i, 'Phòng/PGD không lưu được quy tắc');

// Phòng/PGD tạo hồ sơ: quy tắc đã bật tự giao thì cầm cố về LS1, thấu chi và món về LS2, loại không có quy tắc chờ phân công.
sctx.CAN_BO_LS_NOOP = 0;
actor = db.Users[3];
db.WorkTypes.push({ type_code: 'KHAC', display_name: 'KHAC', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' });
const created2 = sctx.createRequest({ customer: { name: 'KH', phone: '0912345678' }, items: ['PLEDGE', 'THAU', 'MON', 'KHAC'].map((c) => ({ work_type_code: c, product_name: c, occurrence_date: '2026-10-01' })) });
const rowOf = (code) => db.WorkItems.find((i) => i.work_type_code === code);
assert.equal(rowOf('PLEDGE').assigned_user_id, 'LS1');
assert.equal(rowOf('PLEDGE').status, 'DA_PHAN_CONG');
assert.equal(rowOf('THAU').assigned_user_id, 'LS2');
assert.equal(rowOf('MON').assigned_user_id, 'LS2', 'Sản phẩm tick thêm đi theo quy tắc');
assert.equal(rowOf('KHAC').status, 'CHO_PHAN_CONG', 'Không có quy tắc thì nằm lại Hàng chờ');
assert.ok(created2.item_ids.length === 4);

console.log('Quick assign contract passed: tick-to-assign dialog -> Phân công nhanh by rules -> pledge default + per-product ticks -> server auto-assign.');
