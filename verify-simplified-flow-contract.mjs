/**
 * Luồng chính: Phòng/PGD tạo việc → KS/Quản lý LS phân công → cán bộ LS Tiếp nhận hồ sơ
 * → Hẹn khách ký → Hoàn thành. Không có bước bàn giao, soạn xong hay trình/duyệt.
 * Chạy: node verify-simplified-flow-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');

/* ---------- Client ---------- */
const client = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), client);
vm.runInNewContext(read('js/domain.js'), client);
const D = client.LS.domain;
const LEGACY = ['CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];

// 1. Không bước nào (client lẫn máy chủ) còn đưa hồ sơ vào các trạng thái cũ.
const server = {};
vm.runInNewContext(read('TimeTracking.gs'), server);
vm.runInNewContext(read('Code.gs'), server);
Object.keys(D.FLOW).forEach((from) => D.FLOW[from].forEach((step) => {
  assert.ok(!LEGACY.includes(step.to), `client ${from} -> ${step.to} must not exist`);
}));
Object.keys(server.FLOW_SERVER).forEach((from) => Object.keys(server.FLOW_SERVER[from]).forEach((to) => {
  assert.ok(!LEGACY.includes(to), `server ${from} -> ${to} must not exist`);
}));
LEGACY.forEach((code) => assert.equal(D.STATUS[code].legacy, true, code + ' is marked legacy'));
LEGACY.forEach((code) => assert.ok(D.FLOW[code] && server.FLOW_SERVER[code], code + ' keeps an exit for old rows'));

// 2. Client và máy chủ cho cùng một tập (từ → đến, vai trò).
Object.keys(D.FLOW).forEach((from) => {
  const byTo = {};
  D.FLOW[from].forEach((step) => { (byTo[step.to] = byTo[step.to] || new Set()); step.roles.forEach((r) => byTo[step.to].add(r)); });
  const serverSide = server.FLOW_SERVER[from] || {};
  assert.deepEqual(Object.keys(byTo).sort(), Object.keys(serverSide).sort(), `${from}: same targets on client and server`);
  Object.keys(byTo).forEach((to) => {
    assert.deepEqual([...byTo[to]].sort(), [...serverSide[to]].sort(), `${from} -> ${to}: same roles on client and server`);
  });
});

// 3. Đường đi chính đúng thứ tự và đúng người.
const step = (from, to) => D.FLOW[from].find((s) => s.to === to);
assert.deepEqual(Array.from(step('CHO_PHAN_CONG', 'DA_PHAN_CONG').roles), ['KS_LS', 'QUAN_LY_LS']);
assert.ok(step('CHO_PHAN_CONG', 'DA_PHAN_CONG').assignee && step('CHO_PHAN_CONG', 'DA_PHAN_CONG').primary);
assert.deepEqual(Array.from(step('DA_PHAN_CONG', 'DANG_THUC_HIEN').roles), ['CAN_BO_LS']);
assert.equal(step('DA_PHAN_CONG', 'DANG_THUC_HIEN').label, 'Tiếp nhận hồ sơ');
assert.equal(D.STATUS.DANG_THUC_HIEN.label, 'Đã tiếp nhận hồ sơ');
assert.ok(step('DANG_THUC_HIEN', 'DANG_HEN_KH').appointment && step('DANG_THUC_HIEN', 'DANG_HEN_KH').primary);
assert.deepEqual(Array.from(step('DANG_THUC_HIEN', 'DANG_HEN_KH').roles), ['CAN_BO_LS']);
assert.deepEqual(Array.from(step('DANG_HEN_KH', 'HOAN_THANH_LS').roles), ['CAN_BO_LS']);
assert.equal(D.STATUS.HOAN_THANH_LS.open, false);
assert.deepEqual(Array.from(D.PRE_ASSIGN).sort(), ['CHO_HOAN_THIEN', 'CHO_PHAN_CONG', 'CHO_TIEP_NHAN']);

// 4. Phòng/PGD gửi lại sau bổ sung và được tạm dừng đề nghị của mình; LS tiếp tục xử lý.
const pgdSteps = [];
Object.keys(D.FLOW).forEach((from) => D.FLOW[from].forEach((s) => { if (s.roles.includes('PHONG_PGD')) pgdSteps.push(`${from}>${s.to}`); }));
assert.deepEqual(Array.from(pgdSteps).filter((x) => !x.endsWith('>HUY')).sort(), [
  'CAN_BO_SUNG>CHO_PHAN_CONG','CHUA_GIAO_HO_SO>CHO_PHAN_CONG','DANG_HEN_KH>TAM_DUNG','DANG_THUC_HIEN>TAM_DUNG','DA_PHAN_CONG>TAM_DUNG'
]);

// 5. Giao diện không còn nút bàn giao / trình duyệt.
const screens = read('js/screens.js'), app = read('js/app.js'), admin = read('js/admin.js'), api = read('js/gas-api.js');
assert.doesNotMatch(screens + app + api, /dossier-handover|markHandover|markDossierHandover/);
assert.doesNotMatch(read('Code.gs'), /function markDossierHandover/);
assert.doesNotMatch(admin, /ui\.checkbox\('needs_ks_approval'/);
assert.doesNotMatch(screens, /Trình kiểm soát duyệt|Báo soạn xong/);
assert.ok(client.LSTiming.awaitingReceipt('DA_PHAN_CONG') && !client.LSTiming.awaitingReceipt('DANG_THUC_HIEN'));

/* ---------- Máy chủ: chạy thật một vòng đời ---------- */
const ctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(ctx);
vm.runInContext(read('TimeTracking.gs'), ctx);
vm.runInContext(read('Code.gs'), ctx);
const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
  WorkTypes: [{ type_code: 'A', display_name: 'A', sla_hours: 8, is_active: true, requires_appointment: true, requires_ks_approval: true, checklist_json: '["x","y"]' }],
  Users: [
    { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' },
    { user_id: 'KS', role: 'KS_LS', is_active: true }, { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true }
  ],
  Units: [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }],
  Requests: [], WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  select: (n, key, predicate) => (db[n] || []).filter((row) => predicate((column) => row[column])).map((object) => ({ object, name: n })),
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: (n, limit, match) => { const all = (db[n] || []).filter((r) => !match || match(r)); return { rows: all.slice(-(limit || all.length)).reverse(), scanned: all.length, exhausted: true, nextBeforeRow: 1 }; }
};
ctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], find: (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; } };
ctx.syncMonthlyPlanWorkbook_ = () => {};
ctx.Notifications = { queue: () => 0 };
ctx.activePlan_ = () => ({ period_id: 'P1' });
ctx.nextSourceStt_ = () => 1;
let actor = db.Users[2];
ctx.requireActor_ = () => actor;
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

// Phòng/PGD tạo việc: vào thẳng hàng chờ phân công, có giờ gửi, chưa có giờ LS nhận.
const created = ctx.createRequest({ customer: { name: 'KH', phone: '0912345678' }, items: [{ work_type_code: 'A', product_name: 'Vay', occurrence_date: '2026-09-30' }] });
const row = db.WorkItems.find((i) => i.item_id === created.item_ids[0]);
assert.equal(row.status, 'CHO_PHAN_CONG');
assert.ok(row.submitted_at, 'Creating the request records when the branch sent it');
assert.equal(row.dossier_received_at, '');
assert.equal(created.items[0].submitted_at, row.submitted_at, 'The response carries the submit time');
assert.equal(db.Requests[0].unit_id, 'U1');

// Phòng/PGD không thể tự đẩy hồ sơ đi tiếp; LS không nhận được hồ sơ chưa giao.
assert.match(fail(() => ctx.transitionItem(row.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' })), /không được thực hiện/);
actor = db.Users[0];
assert.match(fail(() => ctx.transitionItem(row.item_id, 'DANG_THUC_HIEN', {})), /Không thể chuyển/);

// KS phân công: chưa bắt đầu SLA.
actor = db.Users[1];
ctx.transitionItem(row.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' });
assert.equal(row.status, 'DA_PHAN_CONG');
assert.equal(row.dossier_received_at, '');
assert.equal(row.due_at, '');

// Chưa tiếp nhận thì chưa hẹn khách được; KS không tiếp nhận thay.
actor = db.Users[0];
assert.match(fail(() => ctx.transitionItem(row.item_id, 'DANG_HEN_KH', { appointment: { at: '2026-10-01T02:00:00Z', channel: 'SMS' } })), /Không thể chuyển/);
actor = db.Users[1];
assert.match(fail(() => ctx.transitionItem(row.item_id, 'DANG_THUC_HIEN', {})), /không được thực hiện/);

// LS Tiếp nhận hồ sơ: ghi mốc nhận và bắt đầu SLA.
actor = db.Users[0];
ctx.transitionItem(row.item_id, 'DANG_THUC_HIEN', {});
assert.equal(row.status, 'DANG_THUC_HIEN');
assert.ok(row.dossier_received_at && row.due_at, 'Receiving the dossier starts the SLA');
assert.equal(row.dossier_received_by, 'LS1');
assert.ok(row.processing_started_at);

// Loại việc cần khách ký: phải hẹn trước khi hoàn thành. Không có bước trình duyệt dù cờ cũ còn bật.
row.checklist_json = '[true,true]';
assert.match(fail(() => ctx.transitionItem(row.item_id, 'HOAN_THANH_LS', {})), /hẹn khách/);
assert.match(fail(() => ctx.transitionItem(row.item_id, 'CHO_KS_DUYET', {})), /Không thể chuyển/);
ctx.transitionItem(row.item_id, 'DANG_HEN_KH', { appointment: { at: '2026-10-01T02:00:00Z', channel: 'SMS', via_group: false } });
assert.equal(row.status, 'DANG_HEN_KH');
ctx.transitionItem(row.item_id, 'HOAN_THANH_LS', {});
assert.equal(row.status, 'HOAN_THANH_LS');
assert.ok(row.completed_at);

// Hồ sơ cũ còn ở các trạng thái đã bỏ vẫn đi tiếp được.
const legacy = (status, extra) => { const i = Object.assign({ item_id: 'L' + db.WorkItems.length, request_id: db.Requests[0].request_id, work_type_code: 'A', version: 1, checklist_json: '[true,true]', appointment_json: '' }, extra, { status }); db.WorkItems.push(i); return i; };
actor = db.Users[1];
assert.equal(fail(() => ctx.transitionItem(legacy('CHO_TIEP_NHAN').item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' })), '');
assert.equal(fail(() => ctx.transitionItem(legacy('CHO_HOAN_THIEN').item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' })), '');
actor = db.Users[0];
const soan = legacy('DA_SOAN_XONG', { assigned_user_id: 'LS1', dossier_received_at: '2026-09-29T01:00:00.000Z', processing_started_at: '2026-09-29T01:00:00.000Z' });
assert.equal(fail(() => ctx.transitionItem(soan.item_id, 'DANG_HEN_KH', { appointment: { at: '2026-10-01T02:00:00Z', channel: 'SMS' } })), '');
actor = db.Users[1];
const duyet = legacy('CHO_KS_DUYET', { assigned_user_id: 'LS1', appointment_json: '{"at":"x"}', dossier_received_at: '2026-09-29T01:00:00.000Z', processing_started_at: '2026-09-29T01:00:00.000Z' });
assert.equal(fail(() => ctx.transitionItem(duyet.item_id, 'HOAN_THANH_LS', {})), '');

console.log('Simplified flow contract passed: create -> assign -> receive -> appointment -> complete.');
