/**
 * Hủy việc và phân công nhiều dòng:
 * - việc Hoàn thành / Đã hủy không nằm trong danh sách làm việc;
 * - KS/QL/Phòng hủy được cả ở "Chờ phân công";
 * - LS và cán bộ Phòng/PGD hủy trực tiếp trong phạm vi, không gửi chuông cho KS/QL;
 * - mỗi lần hủy chép một dòng sang sổ CanceledItems, không xóa dòng WorkItems;
 * - danh sách có ô chọn nhiều dòng + thanh "Phân công" hàng loạt.
 * Chạy: node verify-cancel-bulk-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const ctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(ctx);
vm.runInContext(read('TimeTracking.gs'), ctx);
vm.runInContext(read('Code.gs'), ctx);

const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }],
  WorkTypes: [{ type_code: 'B', sla_hours: 4, is_active: true, checklist_json: '[]' }],
  Users: [
    { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' },
    { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 2' },
    { user_id: 'KS', role: 'KS_LS', is_active: true, full_name: 'KS' },
    { user_id: 'QL', role: 'QUAN_LY_LS', is_active: true, full_name: 'QL' },
    { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true, full_name: 'PGD' }
  ],
  Requests: [{ request_id: 'R1', unit_id: 'U1', customer_name: 'Khách A', cif: '00123' }],
  WorkItems: [], Events: [], Inbox: [], CanceledItems: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: (n, limit, match) => { const all = (db[n] || []).filter((r) => !match || match(r)); return { rows: all.slice(-(limit || all.length)).reverse(), scanned: all.length, exhausted: true, nextBeforeRow: 1 }; }
};
ctx.DataRepository = { tx: (fn) => fn(t) };
ctx.markPlanDirty_ = () => {};
ctx.Notifications = { queue: () => 0 };
let actor = null;
ctx.requireActor_ = () => actor;
const as = (id) => { actor = db.Users.find((u) => u.user_id === id); };
const err = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const item = (extra) => {
  const i = Object.assign({ item_id: 'I' + db.WorkItems.length, request_id: 'R1', period_id: 'P1', work_type_code: 'B', version: 1,
    checklist_json: '[]', appointment_json: '', source_stt: 'U1_' + db.WorkItems.length }, extra);
  db.WorkItems.push(i);
  return i;
};

// 1. Lỗ hổng "Chờ phân công" đã vá, ở cả máy chủ và giao diện.
assert.deepEqual([...ctx.FLOW_SERVER.CHO_PHAN_CONG.HUY].sort(), ['KS_LS', 'PHONG_PGD', 'QUAN_LY_LS']);
as('PG');
let i = item({ status: 'CHO_PHAN_CONG' });
assert.equal(err(() => ctx.transitionItem(i.item_id, 'HUY', { reason: 'Tạo nhầm' })), '');
assert.equal(i.status, 'HUY');
const log1 = db.CanceledItems.find((c) => c.item_id === i.item_id);
assert.ok(log1, 'Canceling writes a row to the separate CanceledItems log');
assert.equal(log1.status_before, 'CHO_PHAN_CONG');
assert.equal(log1.reason, 'Tạo nhầm');
assert.equal(log1.customer_name, 'Khách A');
assert.ok(db.WorkItems.includes(i), 'The work item row is never deleted');

// 2. LS hủy trực tiếp việc của mình, vẫn bắt buộc lý do và phạm vi.
as('LS1');
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1' });
assert.match(err(() => ctx.requestCancel(i.item_id, '', 1)), /lý do/);
as('LS2');
assert.match(err(() => ctx.requestCancel(i.item_id, 'Không cần nữa', 1)), /được giao/);
as('LS1');
ctx.requestCancel(i.item_id, 'Khách không còn nhu cầu', 1);
assert.equal(i.status, 'HUY');
assert.equal(i.version,2);
assert.equal(i.pending_json,'');
assert.ok(db.CanceledItems.some(c=>c.item_id===i.item_id && c.canceled_by==='LS1'));
assert.ok(!db.Inbox.some(n=>n.item_id===i.item_id && ['KS','QL'].includes(n.user_id)));
assert.match(err(() => ctx.requestCancel(i.item_id, 'lần hai', 2)), /đã hủy|Không thể chuyển/);

// 3. Phòng/PGD hủy trực tiếp trong phạm vi; giữ tương thích đề nghị hủy cũ.
as('PG');
i = item({ status: 'DA_PHAN_CONG', assigned_user_id: 'LS1' });
ctx.requestCancel(i.item_id, 'Trùng hồ sơ đã gửi', 1);
assert.equal(i.status,'HUY');
assert.ok(!db.Inbox.some(n=>n.item_id===i.item_id && ['KS','QL'].includes(n.user_id)));
i = item({status:'DA_PHAN_CONG',assigned_user_id:'LS1',pending_json:JSON.stringify({kind:'CANCEL',by:'PG',reason:'Trùng hồ sơ đã gửi'})});
as('KS');
assert.equal(err(() => ctx.transitionItem(i.item_id, 'HUY', { reason: 'Duyệt đề nghị hủy của PGD', expected_version: 1 })), '');
assert.equal(i.status, 'HUY');
assert.equal(i.pending_json, '', 'Canceling clears the pending request');
const log2 = db.CanceledItems.find((c) => c.item_id === i.item_id);
assert.equal(log2.requested_by, 'PG');
assert.equal(log2.requested_reason, 'Trùng hồ sơ đã gửi');
assert.equal(log2.canceled_by, 'KS');
assert.ok(db.Inbox.some((n) => n.item_id === i.item_id && n.user_id === 'PG' && n.event === 'DUYET_HUY'));
as('PG');
assert.match(err(() => ctx.requestCancel(i.item_id, 'x', 2)), /đã hủy|Không thể chuyển/);

// 5. Sổ hủy ở Sheet kế hoạch: tab riêng, tab đơn vị không còn dòng hủy.
{
  const code = read('Code.gs');
  assert.match(code, /r\.unit_id === u\.unit_id && i\.status !== 'HUY'; \}\)\.map/, 'Unit tabs exclude canceled rows');
  assert.match(code, /var CANCELED_TAB_ = 'Hồ sơ đã hủy';/);
  assert.match(code, /'requestCancel'\]/, 'requestCancel is exposed through api() as an idempotent write');
  const setup = read('SetupSheetDB.gs');
  assert.match(setup, /CanceledItems: \['cancel_id'/);
}

// 6. Giao diện: ẩn việc đã đóng, có ô chọn nhiều dòng, nút hủy/đề nghị hủy trên dòng.
{
  const screens = read('js/screens.js');
  const domain = read('js/domain.js');
  const app = read('js/app.js');
  for (const fn of ['work', 'mine']) {
    // Danh sách gốc phải lấy từ visibleItems() và lọc theo isOpenItem để ẩn việc
    // đã hoàn thành/đã hủy. Cho phép thêm điều kiện (vd. work() lọc requestedByMe).
    const m = screens.match(new RegExp('function ' + fn + '\\(\\) \\{[\\s\\S]*?var all = (.+);'));
    assert.ok(m, fn + ' phải có dòng khởi tạo danh sách all');
    if (fn === 'mine') {
      const helper = screens.match(/function personalOpenItems\(\) \{([\s\S]*?)\n  \}/);
      assert.ok(/personalOpenItems\(\)/.test(m[1]) && helper && /visibleItems\(\)\.filter\(/.test(helper[1]) && /isOpenItem/.test(helper[1]),
        'mine hides completed/canceled and carried items through personalOpenItems');
    } else {
      assert.ok(/visibleItems\(\)\.filter\(/.test(m[1]) && /isOpenItem/.test(m[1]),
        fn + ' hides completed/canceled items (phải lọc visibleItems theo isOpenItem)');
    }
  }
  assert.match(screens, /inWindow = roomItems\(\)\.filter\(isOpenItem\)/);
  const client = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
  vm.runInNewContext(read('js/core.js'), client);
  vm.runInNewContext(domain, client);
  assert.ok(client.LS.domain.FLOW.CHO_PHAN_CONG.some((step) => step.to === 'HUY'), 'Client flow offers cancel in CHO_PHAN_CONG');
  assert.match(screens, /data-act="pick-row"/);
  assert.match(screens, /data-act="pick-all"/);
  assert.match(screens, /'Theo gợi ý: quy tắc và cân tải'/);
  assert.match(screens, /label: 'Hủy việc'/);
  assert.match(app, /if \(a === 'pick-row'\)/);
  assert.match(app, /'bulk-assign': S\.submitBulkAssign/);
}

console.log('Cancel & bulk-assign contract passed.');
