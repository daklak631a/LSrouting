/**
 * Phòng/PGD đổi ngày phát sinh sau khi hồ sơ đã giao LS, và giờ làm sau giờ hành chính:
 *  - Hồ sơ tồn trong bảng kết quả ngày tính theo ngày đang xem: dời sang ngày sau thì không còn tồn hôm nay, đến ngày mới mới tính;
 *  - hồ sơ LS đã nhận (hoặc đã giao cán bộ) mà ngày bị dời sang tuần sau vẫn nằm trong Quản lý hồ sơ;
 *  - Phòng/PGD có nút bút chì sửa nhanh ngay trên dòng; Kiểm soát/Quản lý không có;
 *  - "Hẹn bổ sung" đã gỡ: Phòng/PGD không còn thêm ghi chú khi hồ sơ đã giao LS; lịch hẹn bổ sung cũ vẫn xem được;
 *  - dashboard cá nhân có bảng Kết quả thực hiện chỉ của chính cán bộ đó;
 *  - nhật ký chỉ tải khi bấm "Xem nhật ký" (kiểm chi tiết ở verify-lazy-logs-contract);
 *  - báo cáo giờ: phiên/lượt tạm dừng đã khép trong ngày mà làm ngoài giờ được cộng cho người đó; lượt "Khác" chỉ tính khi có việc khác gắn vào.
 * Chạy: node verify-schedule-shift-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Ho_Chi_Minh';
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const plusDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };

/* ================= Giao diện ================= */
const node = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, querySelectorAll: () => [] });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: node, body: node(), querySelectorAll: () => [], querySelector: () => null };
const client = { LS: {}, document, console, Promise, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form._fields; } get(key) { return key in this.fields ? this.fields[key] : null; } } };
vm.createContext(client);
for (const file of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read('js/' + file + '.js'), client, { filename: file });
const LS = client.LS, D = LS.domain;
LS.load(D.seed);
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
let dialog = '';
LS.ui.openDialog = (title, body) => { dialog = body; };
LS.ui.closeDialog = () => {};
LS.ui.toast = () => {};
const st = LS.db();
const [officer, other] = st.users.filter((u) => u.role === 'CAN_BO_LS' && u.active);
const leader = st.users.find((u) => u.role === 'KS_LS');
const pgd = st.users.find((u) => u.role === 'PHONG_PGD');
st.workTypes.forEach((type) => { type.checklist = []; });
const request = st.requests.find((r) => r.unit_id === pgd.unit_id) || st.requests[0];
request.unit_id = pgd.unit_id; request.requestor_id = pgd.user_id; request.created_by = pgd.user_id;
const now = new Date().toISOString();
let seq = 0;
const item = (fields = {}) => {
  const row = { item_id: 'SHIFT_' + (++seq), source_stt: 'SHIFT_' + seq, request_id: request.request_id, period_id: 'P1', work_type_code: 'LEGACY_05', collateral_mode: 'CO_SAN',
    product_name: 'Vay', status: 'DANG_THUC_HIEN', assigned_user_id: officer.user_id, version: 3, checklist: [], result_credit: {}, result_flags: null,
    submitted_at: now, dossier_received_at: now, processing_started_at: now, execution_state: 'ACTIVE', occurrence_date: plusDays(0), due_at: '', ...fields };
  st.items.push(row);
  return row;
};
st.items.length = 0;
const as = (user) => { st.session = user.user_id; };
const cell = (html, label) => {
  const m = new RegExp('<td class="dm-act">(?:<button[\\s\\S]*?</button>)?(?:<i>)?' + label + '(?:</i>)?</td>[\\s\\S]*?<td class="num dm-total">([^<]*)</td>').exec(html);
  assert.ok(m, 'Có dòng ' + label);
  return Number(m[1] === '-' ? 0 : m[1]);
};

// 1. Tồn theo ngày xem.
{
  const a = item({ occurrence_date: plusDays(0) });
  as(leader);
  LS.screens.setFilter('board', 'anchor', plusDays(0));
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 1, 'Hồ sơ LS đã nhận, đúng ngày phát sinh: là tồn');
  a.occurrence_date = plusDays(1);
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 0, 'Phòng dời sang ngày mai: hôm nay hết tồn');
  LS.screens.setFilter('board', 'anchor', plusDays(1));
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 1, 'Đến ngày mới thì tính tồn');
  LS.screens.setFilter('board', 'anchor', plusDays(5));
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 1, 'Các ngày sau vẫn là tồn nếu chưa soạn xong');
  a.occurrence_date = '';
  LS.screens.setFilter('board', 'anchor', plusDays(0));
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 1, 'Thiếu ngày phát sinh thì vẫn tính tồn');
  a.occurrence_date = plusDays(-3);
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 1, 'Việc cũ chưa soạn vẫn là tồn');
  st.items.length = 0;
}

// 2. Hồ sơ dời sang tuần sau vẫn nằm trong Quản lý hồ sơ khi LS đã nhận hoặc đã giao cán bộ.
{
  const received = item({ item_id: 'ZZ_REC', source_stt: 'ZZ_REC', occurrence_date: plusDays(15) });
  const assigned = item({ item_id: 'ZZ_ASG', source_stt: 'ZZ_ASG', status: 'DA_PHAN_CONG', dossier_received_at: '', processing_started_at: '', execution_state: '', occurrence_date: plusDays(15) });
  const waiting = item({ item_id: 'ZZ_WAIT', source_stt: 'ZZ_WAIT', status: 'CHO_PHAN_CONG', assigned_user_id: '', dossier_received_at: '', processing_started_at: '', execution_state: '', occurrence_date: plusDays(15) });
  const done = item({ item_id: 'ZZ_DONE', source_stt: 'ZZ_DONE', status: 'HOAN_THANH_LS', completed_at: now, occurrence_date: plusDays(15) });
  as(leader);
  const tracking = LS.screens.tracking();
  assert.ok(tracking.includes('ZZ_REC'), 'LS đã nhận: vẫn trong danh sách dù ngày dời sang tuần sau');
  assert.ok(tracking.includes('ZZ_ASG'), 'Đã giao cán bộ: vẫn trong danh sách');
  assert.ok(!tracking.includes('ZZ_WAIT'), 'Chưa giao thì thuộc Hàng chờ của tuần đó, không kéo sang');
  assert.ok(!tracking.includes('ZZ_DONE'), 'Việc đã xong ngoài tuần không kéo sang');
  as(officer);
  assert.ok(LS.screens.mine().includes('ZZ_REC') && LS.screens.mine().includes('ZZ_ASG'), 'LS vẫn thấy trong Việc được giao');
  assert.ok(!LS.screens.queue().includes('ZZ_WAIT'), 'Việc chưa giao ngoài tuần không vào Hàng chờ tuần này');
  void received; void assigned; void waiting; void done;
  st.items.length = 0;
}

// 3. Bút chì sửa nhanh cho Phòng/PGD.
{
  st.items.length = 0;
  const editable = item({ item_id: 'PEN_OPEN', source_stt: 'PEN_OPEN' });
  const closed = item({ item_id: 'PEN_DONE', source_stt: 'PEN_DONE', status: 'HOAN_THANH_LS', completed_at: now });
  as(pgd);
  const work = LS.screens.work();
  assert.ok(work.includes('data-act="edit-item" data-id="PEN_OPEN"'), 'Dòng việc đang mở có bút chì');
  assert.ok(!work.includes('data-act="edit-item" data-id="PEN_DONE"'), 'Việc đã xong không có bút chì');
  assert.match(work, /data-act="edit-item" data-id="PEN_OPEN"[^>]*aria-label="Sửa thông tin"|aria-label="Sửa thông tin"[^>]*data-act="edit-item" data-id="PEN_OPEN"/, 'Bút chì có nhãn cho trình đọc màn hình');
  assert.ok(work.indexOf('data-act="edit-item" data-id="PEN_OPEN"') < work.indexOf('data-act="detail" data-id="PEN_OPEN"'), 'Bút chì nằm trước con mắt');
  as(leader);
  assert.ok(!LS.screens.tracking().includes('data-act="edit-item"'), 'Kiểm soát không thêm bút chì trên dòng');
  void editable; void closed;
  st.items.length = 0;
}

// 4. Hẹn bổ sung đã gỡ: hồ sơ đã giao LS thì Phòng/PGD không thêm được ghi chú; lịch hẹn bổ sung cũ vẫn hiện cho mọi người xem.
{
  const target = item({ item_id: 'SUP_1', source_stt: 'SUP_1', due_at: '2026-10-09T10:00:00.000Z',
    supplement: { at: '2026-10-12T02:30:00.000Z', note: 'Khách hẹn lại sau khi đổi ngày', by: pgd.user_id, created_at: now } });
  const stranger = st.users.find((u) => u.role === 'PHONG_PGD' && u.user_id !== pgd.user_id);
  as(pgd);
  LS.screens.detail('SUP_1');
  assert.ok(!dialog.includes('data-act="supplement"'), 'Phòng/PGD không còn nút Hẹn bổ sung');
  assert.ok(dialog.includes('Hẹn bổ sung') && dialog.includes('Khách hẹn lại sau khi đổi ngày'), 'Lịch hẹn bổ sung cũ vẫn hiển thị trong chi tiết');
  assert.ok(!LS.screens.work().includes('data-act="supplement"'));
  assert.equal(LS.screens.openSupplement, undefined, 'Không còn hộp thoại Hẹn bổ sung');
  assert.equal(LS.screens.submitSupplement, undefined, 'Không còn hàm lưu Hẹn bổ sung');
  assert.equal(LS.api.addSupplementAppointment, undefined, 'Không còn lệnh gọi máy chủ');
  as(officer);
  LS.screens.detail('SUP_1');
  assert.ok(!dialog.includes('data-act="supplement"'), 'Cán bộ LS không có nút');
  assert.ok(dialog.includes('Khách hẹn lại sau khi đổi ngày'), 'LS vẫn xem được lịch hẹn bổ sung cũ');
  as(leader);
  LS.screens.detail('SUP_1');
  assert.ok(!dialog.includes('data-act="supplement"'), 'Kiểm soát không có nút');
  if (stranger) { as(stranger); LS.screens.detail('SUP_1'); assert.ok(!dialog.includes('data-act="supplement"'), 'Phòng khác không có nút'); }
  assert.equal(D.label('HEN_BO_SUNG'), 'Hẹn bổ sung', 'Nhật ký cũ vẫn có nhãn');
  void target;
  st.items.length = 0;
}

// 5. Dashboard cá nhân: bảng Kết quả thực hiện chỉ có cột của chính LS.
{
  item({ item_id: 'MINE_1', source_stt: 'MINE_1', assigned_user_id: officer.user_id });
  item({ item_id: 'THEIR_1', source_stt: 'THEIR_1', assigned_user_id: other.user_id });
  as(leader);
  LS.screens.setFilter('board', 'anchor', plusDays(0));
  assert.equal(cell(LS.screens.board(), 'Còn soạn HĐ tín dụng'), 2, 'Điều hành thấy cả hai người');
  as(officer);
  const personal = LS.screens.personalDashboard();
  const section = personal.slice(personal.indexOf('personal-result-report'), personal.indexOf('viz-pair'));
  assert.ok(section.includes('Kết quả thực hiện'));
  assert.equal((section.match(/class="dm-staff"/g) || []).length, 1, 'Chỉ một cột cán bộ');
  assert.equal(cell(section, 'Còn soạn HĐ tín dụng'), 1, 'Chỉ tính phần của mình');
  assert.ok(!section.includes('KẾ HOẠCH NGÀY'), 'Không có cột kế hoạch của phòng');
  assert.match(section, /name="result-date"/, 'Có chọn ngày xem');
  assert.ok(section.includes('data-act="board-khac"'), 'Dòng Khác bung được như bảng điều hành');
  LS.screens.setFilter('my-dashboard', 'result-date', plusDays(-2));
  const past = LS.screens.personalDashboard();
  const pastSection = () => { const h = LS.screens.personalDashboard(); return h.slice(h.indexOf('personal-result-report'), h.indexOf('viz-pair')); };
  assert.equal(cell(past.slice(past.indexOf('personal-result-report'), past.indexOf('viz-pair')), 'Còn soạn HĐ tín dụng'), 0, 'Hồ sơ phát sinh hôm nay chưa là tồn của hai ngày trước');
  st.items.find((x) => x.item_id === 'MINE_1').occurrence_date = plusDays(-4);
  assert.equal(cell(pastSection(), 'Còn soạn HĐ tín dụng'), 1, 'Hồ sơ đã phát sinh từ trước là tồn của ngày đó');
  st.items.length = 0;
}

/* ================= Máy chủ ================= */
const sctx = { console, Utilities: { getUuid: (() => { let n = 0; return () => String(++n).padStart(12, '0') + '-0000'; })(), formatDate: (d) => new Date(d).toISOString() },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
const schema = {}; vm.runInNewContext(read('SetupSheetDB.gs'), schema);
const db = { Events: [], Inbox: [], OtherWork: [], Settings: [], Users: [{ user_id: 'LS1', full_name: 'Cán bộ 1' }], WorkTypes: [{ type_code: 'W1', display_name: 'Vay mới' }],
  Requests: [{ request_id: 'R1', unit_id: 'U1', requestor_id: 'P1', created_by: 'P1' }],
  WorkItems: [{ item_id: 'I1', request_id: 'R1', period_id: 'PER', status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', version: 3, due_at: '2026-10-09T10:00:00.000Z', appointment_json: '{"at":"x"}' }] };
const reverseScan = (n, limit, match, opts) => {
  const rows = [];
  for (const r of (db[n] || []).slice().reverse()) {
    if (opts && opts.stopWhen && opts.stopWhen(r)) break;
    if (!match || match(r)) rows.push(r);
    if (rows.length >= limit) break;
  }
  return { rows, scanned: rows.length, exhausted: true };
};
const tx = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: reverseScan
};
sctx.DataRepository = { tx: (fn) => fn(tx), getAll: (n) => db[n] || [], tailWhere: reverseScan, find: (n, k, v) => (tx.find(n, k, v) || {}).object || null };
let actor = { user_id: 'P1', role: 'PHONG_PGD', unit_id: 'U1', is_active: true };
sctx.requireActor_ = () => actor;
sctx.currentUser_ = () => actor;
let NOW = '2026-10-07T03:00:00.000Z';
sctx.stamp_ = () => NOW;
sctx.markPlanDirty_ = () => {};

assert.ok(!vm.runInContext('API_WRITE_', sctx).includes('addSupplementAppointment'), 'Hẹn bổ sung đã gỡ khỏi các lệnh ghi');
assert.ok(!vm.runInContext('Object.keys(apiFunctions_())', sctx).includes('addSupplementAppointment'), 'Không còn gọi được từ trình duyệt');
assert.equal(typeof sctx.addSupplementAppointment, 'undefined', 'Máy chủ không còn hàm ghi hẹn bổ sung');
assert.ok(Array.from(schema.SCHEMA.WorkItems).includes('supplement_json'), 'Cột supplement_json giữ lại cho dữ liệu cũ');
assert.match(read('Code.gs'), /hasColumns_\('WorkItems'[^)]*'supplement_json'/, 'Kho cũ vẫn có cột');
assert.match(read('Code.gs'), /supplement_json: old\.supplement_json \|\| ''/, 'Chuyển kỳ giữ hẹn bổ sung cũ');
assert.match(read('js/gas-api.js'), /supplement: json\(i\.supplement_json, null\)/, 'Giao diện vẫn đọc được hẹn bổ sung cũ');
assert.ok(!/addSupplementAppointment/.test(read('js/gas-api.js')), 'Trình duyệt không còn lệnh gọi');

/* ================= Báo cáo giờ: làm thêm ngoài giờ ================= */
// Thứ Tư 07/10/2026, lịch 07:30–11:30, 13:30–18:00 (mặc định).
db.Events.length = 0; db.WorkItems.length = 0; db.OtherWork.length = 0;
const vn = (time) => '2026-10-07T' + time + ':00+07:00';
const iso = (time) => new Date(vn(time)).toISOString();
db.WorkItems.push({ item_id: 'T1', request_id: 'R1', period_id: 'PER', work_type_code: 'W1', product_name: 'Vay', status: 'HOAN_THANH_LS', assigned_user_id: 'LS1',
  occurrence_date: '2026-10-07', dossier_received_at: iso('09:00'), completed_at: iso('18:45'), processing_started_at: iso('09:00'), timing_source: 'CONFIRMED', version: 5,
  processing_sessions_json: JSON.stringify([{ user_id: 'LS1', work_type_code: 'W1', start: iso('09:00'), end: iso('10:00') }, { user_id: 'LS1', work_type_code: 'W1', start: iso('17:30'), end: iso('18:45') }]) });
const start = (id, category, at) => db.Events.push({ event_id: 'S' + id, item_id: '', type: 'TAM_DUNG_TOAN_BO_BAT_DAU', by: 'LS1', at: iso(at), reason: category,
  after_json: JSON.stringify({ operation_id: id, category, started_at: iso(at), paused_item_id: '' }) });
const end = (id, at) => db.Events.push({ event_id: 'E' + id, item_id: '', type: 'TAM_DUNG_TOAN_BO_KET_THUC', by: 'LS1', at: iso(at), reason: '', before_json: JSON.stringify({ operation_id: id }) });
start('OP_KHAC_WORK', 'KHAC', '18:50'); end('OP_KHAC_WORK', '19:50');          // có việc khác gắn: tính, toàn bộ ngoài giờ
start('OP_KHAC_IDLE', 'KHAC', '14:00'); end('OP_KHAC_IDLE', '14:30');          // không ghi việc nào: chỉ là thời gian dừng
start('OP_BC', 'BAO_CAO', '20:00');                                            // đang chạy: chưa khép nên chưa tính giờ ngoài lịch
db.OtherWork.push({ work_id: 'W', user_id: 'LS1', work_date: '2026-10-07', category: 'SCAN_HOAN_THIEN', quantity: 2, minutes: 60, operation_id: 'OP_KHAC_WORK', at: iso('19:50'), canceled_at: '' });
NOW = iso('21:00');
actor = { user_id: 'LS1', role: 'CAN_BO_LS', unit_id: 'U9', is_active: true };
const report = sctx.getTimeReport({ from: '2026-10-07', to: '2026-10-07' });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg + ': ' + a + ' !== ' + b);
const holidayOvertime = sctx.LSTiming.overtime(new Date(vn('11:00')).getTime(), new Date(vn('14:00')).getTime(), { holidays: ['2026-10-07'] });
near(holidayOvertime.reduce((n, span) => n + (span[1] - span[0]) / 3600000, 0), 1, 'Ngày nghỉ vẫn trừ 11:30–13:30 khi tính làm thêm');
near(report.total.overtime_hours, 0.75 + 1, 'Giờ làm thêm: 45 phút của hồ sơ + 60 phút của lượt Khác đã gắn việc');
near(report.total.processing_hours, 1 + 0.5 + 0.75, 'Giờ hồ sơ gồm phiên 09:00–10:00 và phiên 17:30–18:45');
near(report.total.other_operation_hours, 1, 'Chỉ lượt Khác có việc gắn vào được tính');
assert.equal(report.total.other_operation_count, 1);
near(report.total.occupied_hours, 1 + 0.5 + 0.75 + 1, 'Giờ cán bộ cộng mọi khoảng đã khép, không gộp trùng giả');
assert.equal(report.formula_version, 'sla_time_v5');
// Phiên đang chạy hôm nay chưa tính phần sau giờ; đóng lại rồi mới cộng.
db.WorkItems.push({ item_id: 'T2', request_id: 'R1', period_id: 'PER', work_type_code: 'W1', product_name: 'Vay', status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1',
  occurrence_date: '2026-10-07', dossier_received_at: iso('16:30'), processing_started_at: iso('16:30'), timing_source: 'CONFIRMED', version: 2, execution_state: 'ACTIVE',
  processing_sessions_json: JSON.stringify([{ user_id: 'LS1', work_type_code: 'W1', start: iso('16:30'), end: '' }]) });
near(sctx.getTimeReport({ from: '2026-10-07', to: '2026-10-07' }).total.overtime_hours, 1.75, 'Phiên còn chạy không cộng giờ ngoài lịch');
Object.assign(db.WorkItems[1], { processing_sessions_json: JSON.stringify([{ user_id: 'LS1', work_type_code: 'W1', start: iso('16:30'), end: iso('18:20') }]) });
near(sctx.getTimeReport({ from: '2026-10-07', to: '2026-10-07' }).total.overtime_hours, 1.75 + 20 / 60, 'Khép 18:20: 20 phút sau giờ đóng cửa');
// Hạn xử lý dùng cùng lịch với báo cáo khi Settings thiếu khóa.
const cal = vm.runInContext('JSON.stringify(workCalendar_({ rows: function () { return []; } }))', sctx);
assert.deepEqual(JSON.parse(cal).open, [7, 30]);
assert.deepEqual(JSON.parse(cal).close, [18, 0]);
assert.deepEqual(JSON.parse(cal).breakEnd, [13, 30]);

console.log('verify-schedule-shift-contract: đạt');
