/**
 * Luật quy trình phía máy chủ chạy trên kho giả trong bộ nhớ: lý do bắt buộc,
 * không có bước trình/duyệt, dừng hạn khi chờ bên ngoài, mở lại, đổi loại việc,
 * đề nghị sửa và bàn giao. Chạy: node verify-workflow-hardening-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('TimeTracking.gs', 'utf8'), ctx);
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
      { user_id: 'KS', role: 'KS_LS', is_active: true }, { user_id: 'PG', role: 'PHONG_PGD', unit_id: 'U1', is_active: true },
      { user_id: 'PG2', role: 'PHONG_PGD', unit_id: 'U1', is_active: true }
    ],
    Requests: [{ request_id: 'R1', unit_id: 'U1', requestor_id: 'PG', created_by: 'PG', phone: '090' }],
    WorkItems: [], Events: [], Inbox: []
  };
}
let db = freshDb();
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: (n, limit, match) => { const all = (db[n] || []).filter((r) => !match || match(r)); return { rows: all.slice(-(limit || all.length)).reverse(), scanned: all.length, exhausted: true, nextBeforeRow: 1 }; }
};
t.scan=(n,fn)=>t.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));t.select=(n,idCol,match)=>t.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>t.find(n,idCol,o[idCol]));
ctx.DataRepository = { tx: (fn) => fn(t), scanSnapshot:(n,fn)=>{const r=t.rows(n);r.forEach(o=>fn(c=>o[c]===undefined?"":o[c]));return r.length;} };
ctx.syncMonthlyPlanWorkbook_ = () => {};
ctx.Notifications = { queue: () => 0 };
ctx.localBusinessDate_ = () => '2026-09-22';
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
ok('reassign with reason ok', err(() => ctx.transitionItem(i.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1', reason: 'chia tải', dossier_received_at:new Date().toISOString() })) === '');

// 2. Không có bước trình/duyệt: cán bộ tự hoàn thành sau khi hẹn khách, kể cả khi loại việc
// còn cờ requires_ks_approval từ dữ liệu cũ.
actor = db.Users[0];
i = item({ status: 'DANG_HEN_KH', assigned_user_id: 'LS1', appointment_json: '{"at":"x"}', due_at: new Date(Date.now() + H).toISOString() });
ok('officer can complete after the customer appointment', err(() => ctx.transitionItem(i.item_id, 'HOAN_THANH_LS', {})) === '');
i = item({ status: 'DANG_HEN_KH', assigned_user_id: 'LS1', appointment_json: '{"at":"x"}', due_at: new Date(Date.now() + H).toISOString() });
ok('there is no submit-for-review step', /Không thể chuyển/.test(err(() => ctx.transitionItem(i.item_id, 'CHO_KS_DUYET', {}))));
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', execution_state:'ACTIVE', processing_started_at:new Date().toISOString(), due_at: new Date(Date.now() + H).toISOString() });
ok('there is no "báo soạn xong" step', /Không thể chuyển/.test(err(() => ctx.transitionItem(i.item_id, 'DA_SOAN_XONG', {}))));
ok('a type that needs the customer to sign cannot complete without an appointment', /hẹn khách/.test(err(() => ctx.transitionItem(i.item_id, 'HOAN_THANH_LS', {}))));

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

// 5. Mở lại không reset SLA toàn trình để che việc đã quá hạn.
actor = db.Users[2];
i = item({ work_type_code: 'B', status: 'HOAN_THANH_LS', assigned_user_id: 'LS1', due_at: '2020-01-01T00:00:00.000Z', completed_at: '2020-01-01T00:00:00.000Z' });
ok('reopen without reason rejected', /lý do/.test(err(() => ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', {}))));
const r5 = ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', { reason: 'khách đổi hồ sơ' });
ok('reopen preserves legacy deadline pending handoff correction', i.due_at === '2020-01-01T00:00:00.000Z' && r5.due_at === i.due_at && i.completed_at === '');

// 6. Đổi loại việc làm lại checklist
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', assigned_at: new Date().toISOString(), checklist_json: '[true,true]' });
ctx.proposeRevision(i.item_id, { work_type_code: 'B', product_name: 'B' }, 'phân loại lại', 1);
ok('checklist reset to new type length', i.checklist_json === '[false,false,false]');
ok('assignee notified of KS edit', db.Inbox.some((n) => n.user_id === 'LS1' && n.event === 'SUA_THONG_TIN'));
ok('stale version rejected', /người khác/.test(err(() => ctx.proposeRevision(i.item_id, { product_name: 'X' }, 'r', 1))));

// 7. Đề nghị sửa của phòng: không đè đề nghị đang chờ; duyệt báo lại phòng; việc đã đóng chỉ từ chối
actor = db.Users[3];
i = item({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1' });
ctx.proposeRevision(i.item_id, { 'customer.phone': '0912345678' }, 'đổi số');
ok('second pending proposal rejected', /đang có một đề nghị/.test(err(() => ctx.proposeRevision(i.item_id, { 'customer.phone': '0922345678' }, 'đổi lại'))));
actor = db.Users[2];
ctx.resolveRevision(i.item_id, true, '');
ok('proposer told about approval', db.Inbox.some((n) => n.user_id === 'PG' && n.event === 'DUYET_SUA'));
actor = db.Users[3];
ctx.proposeRevision(i.item_id, { 'customer.phone': '0932345678' }, 'lần 2');
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

// 11. QLKH phải nhập số lượng dự kiến cho việc thế chấp / xuất TSĐB; máy chủ tự kiểm tra và lưu riêng.
actor = db.Users.find((x) => x.user_id === 'PG');
db.WorkTypes.push({ type_code: 'C', group_name: 'TSĐB', display_name: 'Xuất TSĐB / Xóa thế chấp', is_active: true, checklist_json: '[]' });
const exportPayload = (count) => ({ customer: { name: 'KH TSBD' }, items: [{ work_type_code: 'C', product_name: 'Xuất TSĐB / Xóa thế chấp', occurrence_date: '2026-09-23', collateral_mode: 'NONE', requested_export_folder_count: count }] });
ok('server requires positive export folder quantity', /bìa tài sản cần xuất.*số nguyên/.test(err(() => ctx.createRequest(exportPayload('')))));
ok('server rejects fractional export folder quantity', /bìa tài sản cần xuất.*số nguyên/.test(err(() => ctx.createRequest(exportPayload(1.5)))));
ctx.createRequest(exportPayload(3));
const savedExport = db.WorkItems.find((x) => x.work_type_code === 'C');
ok('request-time export folder quantity persisted', savedExport && savedExport.requested_export_folder_count === 3);
ok('request event includes planned quantity', db.Events.some((x) => x.item_id === savedExport.item_id && JSON.parse(x.after_json).requested_export_folder_count === 3));
db.WorkTypes.push({ type_code: 'D', group_name: 'TSĐB', display_name: 'Nhập mới TSĐB', is_active: true, checklist_json: '[]' });
const mortgagePayload = (count) => ({ customer: { name: 'KH TSBD' }, items: [{ work_type_code: 'D', product_name: 'Nhập mới TSĐB', occurrence_date: '2026-09-23', collateral_mode: 'NONE', requested_mortgage_contract_count: count }] });
ok('server requires mortgage contract quantity', /HĐ thế chấp cần soạn.*số nguyên/.test(err(() => ctx.createRequest(mortgagePayload('')))));
ctx.createRequest(mortgagePayload(2));
const savedMortgage = db.WorkItems.find((x) => x.work_type_code === 'D');
ok('request-time mortgage contract quantity persisted', savedMortgage && savedMortgage.requested_mortgage_contract_count === 2);
db.WorkTypes.push({ type_code: 'E', group_name: 'Món', display_name: 'Vay mới TSBĐ - Tiêu dùng', is_active: true, checklist_json: '[]' });
db.WorkTypes.push({ type_code: 'LEGACY_26', group_name: 'TSĐB', display_name: 'Nhập mới TSĐB', is_active: true, checklist_json: '[]' });
const collateralLoanPayload = (mode, count) => ({ customer: { name: 'KH vay co TSBD' }, items: [{ work_type_code: 'E', product_name: 'Vay mới TSBĐ - Tiêu dùng', occurrence_date: '2026-09-23', collateral_mode: mode, requested_mortgage_contract_count: count }] });
ok('existing collateral loan does not require a new mortgage draft count', err(() => ctx.createRequest(collateralLoanPayload('CO_SAN', ''))) === '');
const savedExistingCollateral = db.WorkItems.find((x) => x.work_type_code === 'E');
ok('existing collateral loan stores no requested new mortgage count', savedExistingCollateral && savedExistingCollateral.requested_mortgage_contract_count === '');
ok('existing collateral loan rejects a non-applicable new mortgage count', /không áp dụng/.test(err(() => ctx.createRequest(collateralLoanPayload('CO_SAN', 1)))));
ok('loan without collateral needs no mortgage count despite its product name', err(() => ctx.createRequest(collateralLoanPayload('NONE', ''))) === '');
ok('loan without collateral drafts credit agreement only', JSON.stringify(ctx.draftContractPartKeys_(db.WorkTypes.find((x) => x.type_code === 'E'), { collateral_mode: 'NONE', product_name: 'Vay mới TSBĐ - Tiêu dùng' })) === JSON.stringify(['HD_TIN_DUNG']));
ok('loan without collateral rejects mortgage count', /không áp dụng/.test(err(() => ctx.createRequest(collateralLoanPayload('NONE', 1)))));
ok('new collateral loan still requires mortgage draft count', /HĐ thế chấp cần soạn.*số nguyên/.test(err(() => ctx.createRequest(collateralLoanPayload('MOI', '')))));
ok('new collateral loan accepts its mortgage draft count', err(() => ctx.createRequest(collateralLoanPayload('MOI', 1))) === '');
const linkedMortgage = db.WorkItems.find((x) => x.parent_item_id && x.work_type_code === 'LEGACY_26');
ok('linked collateral work inherits planned mortgage count for LS', linkedMortgage && linkedMortgage.requested_mortgage_contract_count === 1);

// 12. Ô 'Cần kiểm soát duyệt hoàn thành' không bị máy chủ ép về true
ok('KS-approval checkbox not forced', !fs.readFileSync('Code.gs', 'utf8').includes('data.requires_ks_approval = true;'));

// 13. Phòng/PGD chỉ tạo việc: không còn bước "Đã bàn giao". Phân công lần đầu không cần lý do.
actor = db.Users.find((x) => x.user_id === 'PG');
i = item({ status: 'CHO_PHAN_CONG' });
ok('PGD cannot push a request past KS assignment', /không được thực hiện|Không thể chuyển/.test(err(() => ctx.transitionItem(i.item_id, 'DANG_THUC_HIEN', {}))));
ok('there is no separate handover step', /Không thể chuyển/.test(err(() => ctx.transitionItem(i.item_id, 'CHO_TIEP_NHAN', {}))));
actor = db.Users[2];
i = item({ status: 'CHO_PHAN_CONG' });
ok('first assignment from CHO_PHAN_CONG needs no reason', err(() => ctx.transitionItem(i.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' })) === '');
i = item({ status: 'CHO_HOAN_THIEN' });
ok('legacy CHO_HOAN_THIEN can still be assigned', err(() => ctx.transitionItem(i.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS1' })) === '');
i = item({ status: 'CAN_BO_SUNG' });
actor = db.Users[2];
ok('KS cannot resend a returned dossier', /Vai trò/.test(err(() => ctx.transitionItem(i.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-23' }))));
actor = db.Users.find((x) => x.user_id === 'PG2');
ok('another user in the same unit cannot resend it', /người tạo/.test(err(() => ctx.transitionItem(i.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-23' }))));
actor = db.Users.find((x) => x.user_id === 'PG');
ok('resend requires the original requester to choose a date', /ngày/i.test(err(() => ctx.transitionItem(i.item_id, 'CHO_PHAN_CONG', {}))));
ok('resend date cannot be in the past', /trước hôm nay/.test(err(() => ctx.transitionItem(i.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-21' }))));
const resent = ctx.transitionItem(i.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-23', expected_version: i.version });
ok('requester can resend without a reason and choose a date', err(() => resent) === '' && i.occurrence_date === '2026-09-23' && resent.occurrence_date === '2026-09-23');
ok('resend updates status and version on the server', i.status === 'CHO_PHAN_CONG' && i.version === 2 && resent.status === 'CHO_PHAN_CONG');
let returned = item({ status: 'CHUA_GIAO_HO_SO', occurrence_date: '2026-09-21', assigned_user_id: '', last_assignee_id: 'LS1' });
actor = db.Users[2];
ok('KS cannot resend a not-handed-over dossier', /Vai trò/.test(err(() => ctx.transitionItem(returned.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-22' }))));
actor = db.Users.find((x) => x.user_id === 'PG');
ok('not-handed-over resend requires a date', /ngày/i.test(err(() => ctx.transitionItem(returned.item_id, 'CHO_PHAN_CONG', {}))));
ok('not-handed-over resend rejects past dates', /trước hôm nay/.test(err(() => ctx.transitionItem(returned.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-21' }))));
const todayResent = ctx.transitionItem(returned.item_id, 'CHO_PHAN_CONG', { occurrence_date: '2026-09-22' });
ok('requester can return it to today queue without a reason', err(() => todayResent) === '' && returned.occurrence_date === '2026-09-22' && returned.assigned_user_id === '');

// 13. Bước nào máy chủ bắt lý do thì hộp thoại phải có ô lý do (hoặc tự điền)
{
  // Đọc FLOW đã dựng (không đọc mã nguồn) để mọi bước, kể cả phần dựng bằng hàm, đều bị kiểm tra.
  const client = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
  vm.runInNewContext(fs.readFileSync('js/core.js', 'utf8'), client);
  vm.runInNewContext(fs.readFileSync('js/domain.js', 'utf8'), client);
  const flow = client.LS.domain.FLOW;
  let steps = 0;
  Object.keys(flow).forEach((from) => flow[from].forEach((step) => {
    steps++;
    const gives = !!(step.reason || step.assignee || step.appointment);
    ok('UI gives a reason for ' + from + ' -> ' + step.to, !ctx.reasonRequired_(from, step.to) || gives);
  }));
  const resend = flow.CAN_BO_SUNG.find((step) => step.to === 'CHO_PHAN_CONG');
  ok('resend UI is restricted to PHONG_PGD and has no reason field', resend && JSON.stringify(Array.from(resend.roles)) === '["PHONG_PGD"]' && !resend.reason);
  const notHandedOverResend = flow.CHUA_GIAO_HO_SO.find((step) => step.to === 'CHO_PHAN_CONG');
  ok('not-handed-over UI returns only through the requester, with no reason field', notHandedOverResend && JSON.stringify(Array.from(notHandedOverResend.roles)) === '["PHONG_PGD"]' && !notHandedOverResend.reason);
  ok('client flow was read', steps > 20);
}

// 14. QLKH tiếp tục hồ sơ do chính mình tạm dừng, về đúng cán bộ LS đang giữ
{
  const [LS1, , KS, PG, PG2] = db.Users;
  let queued = 0;
  ctx.Notifications = { queue: () => { queued++; return 0; } };
  const held = (extra) => item(Object.assign({ status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', execution_state: 'ACTIVE',
    dossier_received_at: new Date(Date.now() - 2 * H).toISOString(), processing_started_at: new Date(Date.now() - 2 * H).toISOString(),
    due_at: new Date(Date.now() + 2 * H).toISOString() }, extra));

  actor = PG; const a = held();
  ctx.transitionItem(a.item_id, 'TAM_DUNG', {});
  ok('requester can pause own dossier', a.status === 'TAM_DUNG');
  actor = PG2;
  ok('another officer of the same unit cannot resume it', /tạo đề nghị này mới được tiếp tục/.test(err(() => ctx.transitionItem(a.item_id, 'DANG_THUC_HIEN', { reason: 'x' }))));
  actor = KS;
  ok('control still cannot resume a paused dossier', /không được thực hiện/.test(err(() => ctx.transitionItem(a.item_id, 'DANG_THUC_HIEN', { reason: 'x' }))));
  actor = PG;
  ok('requester cannot use the paused dossier for other steps', /chỉ được tiếp tục/.test(err(() => ctx.transitionItem(a.item_id, 'HOAN_THANH_LS', { reason: 'x' }))));
  a.sla_paused_at = new Date(Date.now() - H).toISOString();
  queued = 0;
  const resumed = ctx.transitionItem(a.item_id, 'DANG_THUC_HIEN', { reason: 'ghi chú tự do của QLKH' });
  ok('requester resume keeps no free-text note on an assigned dossier', db.Events.some((e) => e.item_id === a.item_id && e.type === 'DANG_THUC_HIEN' && /QLKH tiếp tục hồ sơ/.test(e.reason) && !/tự do/.test(e.reason)));
  ok('requester resume returns the dossier to the same LS officer', a.status === 'DANG_THUC_HIEN' && a.assigned_user_id === 'LS1' && resumed.status === 'DANG_THUC_HIEN');
  ok('requester resume queues the dossier for the officer instead of starting it', a.execution_state === 'QUEUED');
  ok('requester resume restarts the SLA clock', a.sla_paused_at === '');
  ok('officer is told, no customer notification is queued', db.Inbox.some((n) => n.user_id === 'LS1' && n.item_id === a.item_id && n.event === 'QLKH_TIEP_TUC') && queued === 0);

  actor = LS1; const b = held();
  ctx.transitionItem(b.item_id, 'TAM_DUNG', {});
  actor = PG;
  ok('requester cannot resume a pause made by the LS officer', /do cán bộ LS tạm dừng/.test(err(() => ctx.transitionItem(b.item_id, 'DANG_THUC_HIEN', { reason: 'x' }))));
  ok('officer resumes own pause as before', (actor = LS1, err(() => ctx.transitionItem(b.item_id, 'DANG_THUC_HIEN', { reason: 'x' })) === ''));

  actor = PG; const c = held({ status: 'DA_PHAN_CONG', execution_state: '', dossier_received_at: '', processing_started_at: '', due_at: '' });
  ctx.transitionItem(c.item_id, 'TAM_DUNG', {});
  ctx.transitionItem(c.item_id, 'DANG_THUC_HIEN', { reason: 'tiếp tục' });
  ok('before LS receipt the dossier goes back to the assigned step, not to processing', c.status === 'DA_PHAN_CONG' && c.assigned_user_id === 'LS1' && !c.dossier_received_at);
  ok('that return is not a new assignment', !db.Inbox.some((n) => n.item_id === c.item_id && ['DA_PHAN_CONG', 'DOI_NGUOI'].indexOf(n.event) !== -1) && queued === 0);
}

if (fails) throw new Error(fails + ' kiểm tra quy trình không đạt.');
console.log('Workflow hardening contract passed.');
