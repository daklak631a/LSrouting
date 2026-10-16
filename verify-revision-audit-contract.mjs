/**
 * Phòng/PGD sửa hồ sơ đã giao xuống LS:
 *  - chỉ đổi ngày phát sinh thì ghi nhận ngay; sửa nội dung khác đi qua đề nghị chờ duyệt, nhật ký ghi cả giá trị cũ lẫn mới;
 *  - đổi ngày phát sinh: phần HĐ đã soạn (result_credit_json, tính theo ngày tick), mốc LS nhận hồ sơ,
 *    hạn xử lý và trạng thái giữ nguyên, nên hồ sơ không quay lại "tồn" và không bị tính lại kết quả;
 *  - Kiểm soát sửa trực tiếp thì áp dụng ngay và cũng ghi giá trị cũ.
 * Chạy: node verify-revision-audit-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const sctx = { console, Utilities: { getUuid: (() => { let n = 0; return () => 'uuid-' + String(++n).padStart(12, '0'); })() }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);

const credit = JSON.stringify({ HD_TIN_DUNG: { user_id: 'LS1', at: '2026-10-07T03:00:00.000Z', by: 'LS1' } });
const db = {
  Requests: [{ request_id: 'R1', unit_id: 'PGD1', customer_name: 'Lan', phone: '0905123456', email: '', cif: '', priority_flags_json: '[]' }],
  WorkTypes: [{ type_code: 'W1', display_name: 'Vay mới', is_active: true, checklist_json: '[]', sla_hours: 8 }],
  WorkItems: [{ item_id: 'I1', request_id: 'R1', period_id: 'P', work_type_code: 'W1', product_name: 'Vay mới', occurrence_date: '2026-10-08', status: 'DANG_THUC_HIEN',
    assigned_user_id: 'LS1', dossier_received_at: '2026-10-07T02:00:00.000Z', due_at: '2026-10-08T10:00:00.000Z', result_credit_json: credit, version: 4, pending_json: '' }],
  Events: [], Inbox: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row)
};
t.scan=(n,fn)=>t.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));t.select=(n,idCol,match)=>t.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>t.find(n,idCol,o[idCol]));
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [] };
sctx.markPlanDirty_ = () => {};
sctx.Notifications = { queue() {} };
sctx.stamp_ = () => '2026-10-07T04:00:00.000Z';
let actor = { user_id: 'PG1', role: 'PHONG_PGD', unit_id: 'PGD1', is_active: true };
sctx.requireActor_ = () => actor;

const item = () => db.WorkItems[0];
const frozen = () => ({ credit: item().result_credit_json, received: item().dossier_received_at, due: item().due_at, status: item().status, assignee: item().assigned_user_id });
const before = frozen();

// 1. Phòng/PGD chỉ đổi ngày phát sinh (khách đổi ngày ký): ghi nhận ngay, không chờ duyệt;
//    phần HĐ đã soạn, mốc nhận hồ sơ, hạn xử lý, trạng thái và người phụ trách giữ nguyên.
const moved = sctx.proposeRevision('I1', { occurrence_date: '2026-10-12' }, 'Khách hẹn lại sang thứ Hai', 4);
assert.equal(moved.applied, true, 'Chỉ đổi ngày: Phòng/PGD ghi nhận ngay');
assert.equal(item().occurrence_date, '2026-10-12');
assert.equal(item().pending_json, '', 'Không tạo đề nghị chờ duyệt');
assert.deepEqual(frozen(), before, 'HĐ đã soạn, mốc nhận hồ sơ, hạn xử lý, trạng thái và người phụ trách không đổi khi đổi ngày');
const e1 = db.Events.filter((e) => e.type === 'SUA_THONG_TIN').pop();
assert.equal(e1.reason, 'Khách hẹn lại sang thứ Hai · Ngày phát sinh: 08/10/2026 → 12/10/2026', 'Nhật ký ghi lý do và giá trị cũ → mới');
assert.deepEqual({ ...JSON.parse(e1.before_json) }, { occurrence_date: '2026-10-08' }, 'Sửa trực tiếp: nhật ký ghi giá trị cũ thật, không phải bản đã áp dụng');

// 2. Sửa nội dung khác của hồ sơ đã giao: thành đề nghị chờ Kiểm soát duyệt, duyệt xong mới áp dụng.
const proposed = sctx.proposeRevision('I1', { product_name: 'Vay lại' }, 'Sai sản phẩm', 5);
assert.equal(proposed.applied, false, 'Hồ sơ đã giao: đề nghị chờ duyệt, không sửa trực tiếp');
assert.equal(item().product_name, 'Vay mới', 'Chưa duyệt thì giữ nguyên');
assert.ok(item().pending_json, 'Đề nghị nằm ở pending_json');
const e2a = db.Events.find((e) => e.type === 'DE_NGHI_SUA');
assert.match(e2a.reason, /^Sai sản phẩm · .*Vay mới → Vay lại$/, 'Nhật ký đề nghị ghi lý do và giá trị cũ → mới');
assert.match(String((() => { try { sctx.proposeRevision('I1', { product_name: 'Khác' }, 'lần hai', 5); return ''; } catch (e) { return e.message; } })()), /đề nghị sửa chờ/, 'Không gửi đề nghị thứ hai khi đề nghị đầu chưa duyệt');
actor = { user_id: 'KS1', role: 'KS_LS', is_active: true };
sctx.resolveRevision('I1', true, '');
assert.equal(item().product_name, 'Vay lại', 'Duyệt xong mới áp dụng');
assert.equal(item().pending_json, '', 'Hết đề nghị chờ duyệt');
const e2 = db.Events.find((e) => e.type === 'DUYET_SUA');
assert.match(e2.reason, /Vay mới → Vay lại/, 'Nhật ký duyệt ghi cả giá trị cũ lẫn mới');
assert.deepEqual({ ...JSON.parse(e2.before_json) }, { product_name: 'Vay mới' }, 'Giá trị cũ lấy trước khi áp dụng');

// 3. Từ chối: giữ nguyên, nhật ký vẫn ghi nội dung đã bị từ chối.
actor = { user_id: 'PG1', role: 'PHONG_PGD', unit_id: 'PGD1', is_active: true };
sctx.proposeRevision('I1', { product_name: 'Vay mới' }, 'đổi tiếp', item().version);
actor = { user_id: 'KS1', role: 'KS_LS', is_active: true };
sctx.resolveRevision('I1', false, 'Chưa rõ');
assert.equal(item().product_name, 'Vay lại', 'Từ chối thì giữ nguyên');
const e3 = db.Events.find((e) => e.type === 'TU_CHOI_SUA');
assert.match(e3.reason, /^Chưa rõ · .*Vay lại → Vay mới$/);

// 4. Kiểm soát sửa trực tiếp: áp dụng ngay, nhật ký ghi giá trị cũ.
sctx.proposeRevision('I1', { occurrence_date: '2026-10-09' }, 'KS chỉnh theo điện thoại', item().version);
assert.equal(item().occurrence_date, '2026-10-09');
const e4 = db.Events.filter((e) => e.type === 'SUA_THONG_TIN').pop();
assert.equal(e4.reason, 'KS chỉnh theo điện thoại · Ngày phát sinh: 12/10/2026 → 09/10/2026');
assert.equal(frozen().credit, before.credit, 'Sửa trực tiếp cũng không đụng phần HĐ đã soạn');

console.log('verify-revision-audit-contract: đạt');
