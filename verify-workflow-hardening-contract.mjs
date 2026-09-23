/**
 * Luật quy trình phía máy chủ chạy trên kho giả trong bộ nhớ: lý do bắt buộc,
 * duyệt KS theo loại việc, dừng hạn khi chờ bên ngoài, mở lại, đổi loại việc,
 * đề nghị sửa và bàn giao. Chạy: node verify-workflow-hardening-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);

function freshDb() {
  return {
    Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
    WorkTypes: [
      { type_code: 'A', sla_hours: 8, is_active: true, requires_appointment: 'TRUE', requires_ks_approval: true, checklist_json: '["x","y"]' },
      { type_code: 'B', sla_hours: 4, is_active: true, requires_appointment: false, requires_ks_approval: false, checklist_json: '["p","q","r"]' }
    ],
    Users: [
      { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' },
      { user_id: 'LS2', role: 'CAN_BO_LS', is_active: false, full_name: 'LS 2 (khóa)' },
      { user_id: 'KS', role: 'KS_LS', is_active: true }, { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true }
    ],
    Requests: [{ request_id: 'R1', unit_id: 'U1', phone: '090' }],
    WorkItems: [], Events: [], Inbox: []
  };
}
let db = freshDb();
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row)
};
ctx.DataRepository = { tx: (fn) => fn(t) };
ctx.syncMonthlyPlanWorkbook_ = () => {};
ctx.Notifications = { queue: () => 0 };
let actor = db.Users[2];
ctx.requireActor_ = () => actor;

let fails = 0;
const ok = (name, cond) => { if (!cond) { fails++; console.log('FAIL ' + name); } };
const err = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const item = (extra) => { const i = Object.assign({ item_id: 'I' + db.WorkItems.length, request_id: 'R1', work_type_code: 'A', version: 1, checklist_json: '[true,true]', appointment_json: '' }, extra); db.WorkItems.push(i); return i; };
const H = 3600000;

// 1. Lý do bắt buộc ở máy chủ khi đổi người
let i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', due_at: new Date(Date.now() + H).toISOString() });
ok('reassign without reason rejected', /lý do/.test(err(() => ctx.transitionItem(i.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' }))));
ok('reassign with reason ok', err(() => ctx.transitionItem(i.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1', reason: 'chia tải' })) === '');

// 2. Cán bộ không tự chốt loại việc cần KS duyệt
actor = db.Users[0];
i = item({ status: 'DANG_HEN_KH', assigned_user_id: 'LS1', appointment_json: '{"at":"x"}', due_at: new Date(Date.now() + H).toISOString() });
ok('officer cannot self-complete review type', /kiểm soát duyệt/.test(err(() => ctx.transitionItem(i.item_id, 'HOAN_THANH_LS', {}))));
ok('officer can submit for review', err(() => ctx.transitionItem(i.item_id, 'CHO_KS_DUYET', {})) === '');

// 3. requires_appointment dạng chữ "TRUE" vẫn có hiệu lực
actor = db.Users[2];
i = item({ status: 'CHO_KS_DUYET', assigned_user_id: 'LS1', appointment_json: '' });
ok('"TRUE" appointment flag enforced', /hẹn khách/.test(err(() => ctx.transitionItem(i.item_id, 'HOAN_THANH_LS', {}))));

// 4. Tạm dừng rồi tiếp tục: hạn lùi đúng thời gian chờ
actor = db.Users[0];
const due0 = new Date(Date.now() + 2 * H).toISOString();
i = item({ work_type_code: 'B', status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', due_at: due0, checklist_json: '[false,false,false]' });
ctx.transitionItem(i.item_id, 'TAM_DUNG', { reason: 'chờ khách' });
ok('pause records sla_paused_at', !!i.sla_paused_at);
i.sla_paused_at = new Date(Date.now() - 3 * H).toISOString(); // giả lập đã chờ 3 giờ
ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', { reason: 'khách đã bổ sung' });
const shift = (new Date(i.due_at) - new Date(due0)) / H;
ok('resume shifts due ~3h (got ' + shift.toFixed(2) + ')', Math.abs(shift - 3) < 0.05);
ok('resume clears pause mark', i.sla_paused_at === '');

// 5. Mở lại: hạn mới tính từ lúc mở, không quá hạn ngay
actor = db.Users[2];
i = item({ work_type_code: 'B', status: 'HOAN_THANH_LS', assigned_user_id: 'LS1', due_at: '2020-01-01T00:00:00.000Z', completed_at: '2020-01-01T00:00:00.000Z' });
ok('reopen without reason rejected', /lý do/.test(err(() => ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', {}))));
const r5 = ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', { reason: 'khách đổi hồ sơ' });
ok('reopen resets due into future', new Date(i.due_at) > new Date() && r5.due_at === i.due_at && i.completed_at === '');

// 6. Đổi loại việc làm lại checklist
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', assigned_at: new Date().toISOString(), checklist_json: '[true,true]' });
ctx.proposeRevision(i.item_id, { work_type_code: 'B', product_name: 'B' }, 'phân loại lại', 1);
ok('checklist reset to new type length', i.checklist_json === '[false,false,false]');
ok('assignee notified of KS edit', db.Inbox.some((n) => n.user_id === 'LS1' && n.event === 'SUA_THONG_TIN'));
ok('stale version rejected', /người khác/.test(err(() => ctx.proposeRevision(i.item_id, { product_name: 'X' }, 'r', 1))));

// 7. Đề nghị sửa của phòng: không đè đề nghị đang chờ; duyệt báo lại phòng; việc đã đóng chỉ từ chối
actor = db.Users[3];
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1' });
ctx.proposeRevision(i.item_id, { 'customer.phone': '091' }, 'đổi số');
ok('second pending proposal rejected', /đang có một đề nghị/.test(err(() => ctx.proposeRevision(i.item_id, { 'customer.phone': '092' }, 'đổi lại'))));
actor = db.Users[2];
ctx.resolveRevision(i.item_id, true, '');
ok('proposer told about approval', db.Inbox.some((n) => n.user_id === 'PG' && n.event === 'DUYET_SUA'));
actor = db.Users[3];
ctx.proposeRevision(i.item_id, { 'customer.phone': '093' }, 'lần 2');
i.status = 'HUY';
actor = db.Users[2];
ok('approve on closed item rejected', /đã đóng/.test(err(() => ctx.resolveRevision(i.item_id, true, ''))));
ok('reject on closed item allowed', err(() => ctx.resolveRevision(i.item_id, false, '')) === '');

// 8. Bàn giao cho tài khoản khóa bị chặn
ok('handover to locked user rejected', /nhận bàn giao/.test(err(() => ctx.handoverOpenWork_(t, 'LS1', 'LS2', 'KS', [], 'x'))));

// 9. Giao ở giây lẻ ngay trước nghỉ trưa/tan ca không được báo lỗi tính hạn
const officeT = { rows: () => [{ key: 'work_days', value: '1,2,3,4,5' }, { key: 'work_open', value: '08:00' }, { key: 'work_close', value: '17:30' }, { key: 'work_break', value: '11:30-13:00' }] };
const beforeLunch = new Date(2026, 8, 21, 11, 29, 40).toISOString();
ok('due at 11:29:40 + 4h = 16:59:40', ctx.dueAt_(officeT, beforeLunch, 4) === new Date(2026, 8, 21, 16, 59, 40).toISOString());
const beforeClose = new Date(2026, 8, 21, 17, 29, 40).toISOString();
ok('due at 17:29:40 + 4h = next day 13:29:40', ctx.dueAt_(officeT, beforeClose, 4) === new Date(2026, 8, 22, 13, 29, 40).toISOString());

// 10. Kiểm soát đăng ký hộ phải chọn phòng gửi; hồ sơ ghi vào đúng phòng đó
db.Units = [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }, { unit_id: 'LS', kind: 'LS', is_active: true }];
ctx.DataRepository.getAll = (n) => db[n] || [];
ctx.DataRepository.find = (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; };
ctx.activePlan_ = () => ({ period_id: 'P1' });
ctx.nextSourceStt_ = () => 1;
db.WorkTypes[1].type_code = 'B';
actor = Object.assign({}, db.Users[2], { unit_id: 'LS' });
const payload = (unit) => ({ unit_id: unit, customer: { name: 'KH' }, items: [{ work_type_code: 'B', product_name: 'B', occurrence_date: '2026-09-23' }] });
ok('KS must pick a sending unit', /PGD gửi hồ sơ/.test(err(() => ctx.createRequest(payload('')))));
ok('KS cannot file under LS unit', /PGD gửi hồ sơ/.test(err(() => ctx.createRequest(payload('LS')))));
ctx.createRequest(payload('U1'));
ok('KS request filed under chosen unit', db.Requests[db.Requests.length - 1].unit_id === 'U1');

// 11. Ô 'Cần kiểm soát duyệt hoàn thành' không bị máy chủ ép về true
ok('KS-approval checkbox not forced', !fs.readFileSync('Code.gs', 'utf8').includes('data.requires_ks_approval = true;'));

if (fails) throw new Error(fails + ' kiểm tra quy trình không đạt.');
console.log('Workflow hardening contract passed.');
