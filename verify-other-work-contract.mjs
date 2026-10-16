/**
 * Việc khác cán bộ LS tự ghi kèm số lượng (Họp đầu ngày, Xem văn bản, Sắp xếp kho hồ sơ, Scan hoàn thiện hồ sơ,
 * Định giá lại TSBĐ, Xuất kho/thu nợ cầm cố), liên thông với nút Tạm dừng toàn bộ:
 *  - máy chủ: chỉ cán bộ LS ghi, loại và số lượng hợp lệ, hủy chỉ lượt của mình trong ngày, bảng OtherWork có trong SCHEMA;
 *  - liên thông giờ: ghi trong lúc tạm dừng thì thuộc lượt tạm dừng đó; kết thúc tạm dừng chia số phút làm việc của lượt
 *    cho các việc đã ghi (Họp đầu ngày cố định 15 phút mỗi lần, phần còn lại chia đều theo loại), máy chủ và giao diện chia giống nhau;
 *  - bootstrap: LS chỉ nhận lượt của mình, KS/QL/Admin nhận mọi lượt trong kỳ, lượt đã hủy hoặc ngoài kỳ không đi theo;
 *  - bảng kết quả ngày: tổng cộng vào dòng Khác theo từng người, chi tiết từng loại chỉ hiện khi bung dòng Khác;
 *  - báo cáo thời gian: bảng việc khác theo loại (số lượng và số phút);
 *  - nhật ký sửa việc ghi cả giá trị cũ lẫn mới.
 * Chạy: node verify-other-work-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/* ---------- Máy chủ ---------- */
const sctx = { console, Utilities: { getUuid: (() => { let n = 0; return () => String(++n).padStart(12, '0') + '-0000'; })(), formatDate: (d) => new Date(d).toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
const schema = {}; vm.runInNewContext(read('SetupSheetDB.gs'), schema);

const db = { OtherWork: [], Events: [], Settings: [], WorkItems: [], WorkTypes: [{ type_code: 'W1', display_name: 'Vay mới' }, { type_code: 'W2', display_name: 'Thẻ tín dụng' }] };
const reverseScan = (n, limit, match, opts) => {
  const rows = [];
  for (const r of (db[n] || []).slice().reverse()) {
    if (opts && opts.stopWhen && opts.stopWhen(r)) break;
    if (!match || match(r)) rows.push(r);
    if (rows.length >= limit) break;
  }
  return { rows, scanned: rows.length, exhausted: true };
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: reverseScan
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], tailWhere: reverseScan };
let actor = { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true };
sctx.requireActor_ = () => actor;
const TODAY = '2026-10-07';   // Thứ Tư
let NOW = TODAY + 'T03:00:00.000Z';
sctx.localBusinessDate_ = () => TODAY;
sctx.stamp_ = () => NOW;
sctx.markPlanDirty_ = () => {};

const api = vm.runInContext('Object.keys(apiFunctions_())', sctx);
const writes = vm.runInContext('API_WRITE_', sctx);
for (const name of ['recordOtherWork', 'cancelOtherWork', 'endGlobalPause']) {
  assert.ok(api.includes(name), name + ' đã đăng ký vào cổng api');
  assert.ok(writes.includes(name), name + ' là lệnh ghi (có op_id chống ghi trùng)');
}
assert.deepEqual(Array.from(schema.SCHEMA.OtherWork), ['work_id', 'user_id', 'work_date', 'category', 'quantity', 'minutes', 'operation_id', 'at', 'canceled_at', 'canceled_by'], 'SCHEMA có bảng OtherWork');
assert.match(read('Code.gs'), /hasColumns_\('OtherWork'/, 'Kho đã migration phải được bổ sung bảng OtherWork');

// Danh sách loại việc khớp giữa máy chủ và giao diện.
const server = JSON.parse(vm.runInContext('JSON.stringify(OTHER_WORK_CATEGORIES_)', sctx));
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
const cctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form._fields; } get(k) { return k in this.fields ? this.fields[k] : null; } } };
vm.createContext(cctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read(`js/${f}.js`), cctx, { filename: f });
const LS = cctx.LS, D = LS.domain;
assert.deepEqual({ ...Object.fromEntries(D.OTHER_WORK_TYPES.map((x) => [x.code, x.label])) }, { ...server }, 'Loại việc khác ở giao diện khớp máy chủ');
assert.deepEqual(Array.from(D.OTHER_WORK_TYPES.map((x) => x.label)), ['Họp đầu ngày', 'Xem văn bản', 'Sắp xếp kho hồ sơ', 'Scan hoàn thiện hồ sơ', 'Định giá lại TSBĐ', 'Xuất kho, thu nợ cầm cố']);
assert.equal(D.OTHER_WORK_MEETING_MINUTES, vm.runInContext('OTHER_WORK_MEETING_MINUTES_', sctx), 'Họp cố định cùng số phút ở máy chủ và giao diện');
assert.equal(D.OTHER_WORK_MEETING_MINUTES, 15);

// Chỉ cán bộ LS ghi; loại và số lượng phải hợp lệ.
const one = (category, quantity) => [{ category, quantity }];
for (const role of ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD', 'ADMIN']) {
  actor = { user_id: 'X', role, is_active: true };
  assert.match(fail(() => sctx.recordOtherWork(one('HOP_DAU_NGAY', 1))), /Chỉ cán bộ LS/, role + ' không được ghi việc khác');
}
actor = { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true };
assert.match(fail(() => sctx.recordOtherWork(one('KHONG_CO', 1))), /loại việc/i, 'Loại lạ');
assert.match(fail(() => sctx.recordOtherWork([])), /ít nhất một việc/, 'Danh sách rỗng');
assert.match(fail(() => sctx.recordOtherWork(null)), /ít nhất một việc/);
assert.match(fail(() => sctx.recordOtherWork([{ category: 'XEM_VAN_BAN', quantity: 1 }, { category: 'XEM_VAN_BAN', quantity: 2 }])), /một lần/, 'Một loại hai lần trong một lượt');
for (const bad of [0, -2, 1.5, 'abc', 1000, '', null]) assert.match(fail(() => sctx.recordOtherWork(one('SCAN_HOAN_THIEN', bad))), /số nguyên/, 'Số lượng sai: ' + bad);
assert.equal(db.OtherWork.length, 0, 'Dữ liệu sai không ghi gì');

// Ghi ngoài lượt tạm dừng: chỉ số lượng, chưa có giờ.
const first = sctx.recordOtherWork([{ category: 'SCAN_HOAN_THIEN', quantity: '12' }, { category: 'XEM_VAN_BAN', quantity: 4 }]);
assert.equal(first.ok, true);
assert.equal(first.works.length, 2);
assert.equal(db.OtherWork.length, 2, 'Mỗi loại một dòng');
assert.deepEqual({ ...db.OtherWork[0], work_id: 'x' }, { work_id: 'x', user_id: 'LS1', work_date: TODAY, category: 'SCAN_HOAN_THIEN', quantity: 12, minutes: 0, operation_id: '', at: NOW, canceled_at: '', canceled_by: '' },
  'Ngày ghi do máy chủ đặt, số lượng lưu dạng số, người ghi lấy từ phiên đăng nhập, ngoài lượt tạm dừng thì không có giờ');

// Hủy: chỉ lượt của mình, trong ngày; dòng được giữ lại.
actor = { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true };
assert.match(fail(() => sctx.cancelOtherWork(first.works[0].work_id)), /chính bạn/, 'Không hủy lượt của người khác');
actor = { user_id: 'KS', role: 'KS_LS', is_active: true };
assert.match(fail(() => sctx.cancelOtherWork(first.works[0].work_id)), /Chỉ cán bộ LS/, 'Kiểm soát không hủy qua cổng này');
actor = { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true };
db.OtherWork.push({ work_id: 'OLD', user_id: 'LS1', work_date: '2026-10-06', category: 'XEM_VAN_BAN', quantity: 2, minutes: 0, operation_id: '', at: '2026-10-06T03:00:00.000Z', canceled_at: '', canceled_by: '' });
assert.match(fail(() => sctx.cancelOtherWork('OLD')), /trong ngày/, 'Không hủy lượt của ngày trước');
assert.match(fail(() => sctx.cancelOtherWork('NOPE')), /Không tìm thấy/);
sctx.cancelOtherWork(first.works[0].work_id);
assert.equal(db.OtherWork.length, 3, 'Hủy không xóa dòng');
assert.ok(db.OtherWork[0].canceled_at && db.OtherWork[0].canceled_by === 'LS1');
actor = { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true };
assert.match(fail(() => sctx.cancelOtherWork(first.works[0].work_id)), /chính bạn/, 'Lượt đã hủy vẫn không tiết lộ kết quả cho cán bộ khác');
actor = { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true };
assert.equal(sctx.cancelOtherWork(first.works[0].work_id).replayed, true, 'Hủy lại là idempotent');

/* ---------- Liên thông với Tạm dừng toàn bộ ---------- */
// Cách chia giờ: máy chủ và giao diện cho cùng kết quả.
const split = (total, rows) => ({ server: Array.from(sctx.splitPauseMinutes_(total, rows)), client: Array.from(D.splitPauseMinutes(total, rows)) });
const same = (total, rows, expected, note) => { const r = split(total, rows); assert.deepEqual(r.server, expected, note + ' (máy chủ)'); assert.deepEqual(r.client, expected, note + ' (giao diện)'); };
const row = (category, quantity) => ({ category, quantity });
same(60, [row('HOP_DAU_NGAY', 1), row('SCAN_HOAN_THIEN', 12), row('DINH_GIA_LAI', 3), row('XEM_VAN_BAN', 5)], [15, 15, 15, 15], 'Họp 15 phút, 45 phút còn lại chia đều 3 loại');
same(60, [row('HOP_DAU_NGAY', 1), row('SCAN_HOAN_THIEN', 12), row('DINH_GIA_LAI', 3)], [15, 23, 22], 'Phần lẻ về loại đứng trước, tổng vẫn đúng 60');
same(47, [row('SCAN_HOAN_THIEN', 12), row('DINH_GIA_LAI', 3)], [24, 23], 'Không họp: chia đều theo loại');
same(60, [row('SCAN_HOAN_THIEN', 12), row('SCAN_HOAN_THIEN', 4), row('DINH_GIA_LAI', 3)], [23, 7, 30], 'Cùng một loại thì chia theo số lượng, loại không bị tính hai phần');
same(60, [row('HOP_DAU_NGAY', 2)], [30], 'Họp 2 lần là 30 phút');
same(10, [row('HOP_DAU_NGAY', 1), row('XEM_VAN_BAN', 1)], [10, 0], 'Họp không vượt thời gian đã dừng');
same(0, [row('HOP_DAU_NGAY', 1), row('XEM_VAN_BAN', 1)], [0, 0], 'Dừng 0 phút (ngoài giờ làm việc) thì không chia');
same(40, [row('HOP_DAU_NGAY', 1)], [15], 'Chỉ họp: phần còn lại không gán cho việc nào');
same(30, [], [], 'Không có việc nào thì không chia');
for (let n = 0; n < 200; n++) {
  const total = Math.floor(Math.random() * 300), rows = D.OTHER_WORK_TYPES.filter(() => Math.random() < 0.6).map((x) => row(x.code, 1 + Math.floor(Math.random() * 20)));
  const r = split(total, rows);
  assert.deepEqual(r.server, r.client, 'Máy chủ và giao diện chia như nhau');
  const others = rows.filter((x) => x.category !== 'HOP_DAU_NGAY');
  const spent = r.server.reduce((a, b) => a + b, 0);
  assert.ok(spent <= total, 'Không chia quá thời gian đã dừng');
  if (others.length) assert.equal(spent, total, 'Có việc khác họp thì chia hết thời gian');
}

// Luồng thật: bắt đầu tạm dừng 09:00, ghi việc trong lúc dừng, kết thúc 10:00 kèm việc ghi thêm.
db.OtherWork.length = 0; db.Events.length = 0;
const OP = 'EVT_OP1', STARTED = TODAY + 'T02:00:00.000Z';
db.Events.push({ event_id: OP, item_id: '', type: 'TAM_DUNG_TOAN_BO_BAT_DAU', by: 'LS1', at: STARTED, reason: 'Báo cáo',
  after_json: JSON.stringify({ operation_id: OP, category: 'BAO_CAO', started_at: STARTED, paused_item_id: '' }) });
NOW = TODAY + 'T02:20:00.000Z';
const during = sctx.recordOtherWork([{ category: 'HOP_DAU_NGAY', quantity: 1 }, { category: 'SCAN_HOAN_THIEN', quantity: 12 }]);
assert.deepEqual(Array.from(during.works.map((w) => w.operation_id)), [OP, OP], 'Ghi trong lúc tạm dừng thì thuộc lượt tạm dừng đang chạy');
assert.deepEqual(db.OtherWork.map((w) => w.minutes), [0, 0], 'Chưa kết thúc thì chưa chia giờ');
NOW = TODAY + 'T03:00:00.000Z';   // 10:00 giờ Việt Nam: lượt dừng 60 phút làm việc
actor = { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true };
assert.match(fail(() => sctx.endGlobalPause(OP, [])), /đã thay đổi/, 'Không kết thúc lượt tạm dừng của người khác');
actor = { user_id: 'LS1', role: 'CAN_BO_LS', is_active: true };
assert.match(fail(() => sctx.endGlobalPause(OP, [{ category: 'KHONG_CO', quantity: 1 }])), /loại việc/i, 'Việc ghi lúc kết thúc cũng bị kiểm tra');
assert.equal(db.Events.length, 1, 'Lỗi thì lượt tạm dừng chưa kết thúc');
const ended = sctx.endGlobalPause(OP, [{ category: 'DINH_GIA_LAI', quantity: 3 }, { category: 'XEM_VAN_BAN', quantity: 5 }]);
assert.equal(ended.operation, null);
const byCategory = Object.fromEntries(db.OtherWork.map((w) => [w.category, w]));
assert.equal(db.OtherWork.length, 4);
assert.deepEqual(['HOP_DAU_NGAY', 'XEM_VAN_BAN', 'SCAN_HOAN_THIEN', 'DINH_GIA_LAI'].map((c) => byCategory[c].minutes), [15, 15, 15, 15], 'Họp 15 phút, 45 phút còn lại chia đều cho 3 loại');
assert.equal(db.OtherWork.reduce((n, w) => n + w.minutes, 0), 60, 'Tổng phút chia đúng bằng thời gian làm việc của lượt tạm dừng');
assert.deepEqual(Array.from(ended.other_work.map((w) => w.minutes)).sort((a, b) => a - b), [15, 15, 15, 15], 'Kết quả trả về cho giao diện có số phút đã chia');
assert.ok(db.OtherWork.every((w) => w.operation_id === OP), 'Mọi lượt thuộc lượt tạm dừng');
assert.ok(db.Events.some((e) => e.type === 'TAM_DUNG_TOAN_BO_KET_THUC'), 'Đã kết thúc lượt tạm dừng');

// Lượt dừng khép trong ngày nhưng ngoài giờ làm việc (22:00-23:00): giờ làm thêm cũng được chia cho việc.
db.OtherWork.length = 0;
const OP2 = 'EVT_OP2', START2 = TODAY + 'T15:00:00.000Z';
db.Events.push({ event_id: OP2, item_id: '', type: 'TAM_DUNG_TOAN_BO_BAT_DAU', by: 'LS1', at: START2, reason: 'Báo cáo',
  after_json: JSON.stringify({ operation_id: OP2, category: 'BAO_CAO', started_at: START2, paused_item_id: '' }) });
NOW = TODAY + 'T16:00:00.000Z';
sctx.endGlobalPause(OP2, [{ category: 'SCAN_HOAN_THIEN', quantity: 2 }]);
assert.deepEqual(db.OtherWork.map((w) => [w.category, w.quantity, w.minutes]), [['SCAN_HOAN_THIEN', 2, 60]], 'Ngoài giờ làm việc đã khép trong ngày: 60 phút làm thêm');

// Kết thúc không ghi việc nào vẫn kết thúc được như trước.
db.OtherWork.length = 0;
const OP3 = 'EVT_OP3';
db.Events.push({ event_id: OP3, item_id: '', type: 'TAM_DUNG_TOAN_BO_BAT_DAU', by: 'LS1', at: TODAY + 'T16:10:00.000Z', reason: 'Khác',
  after_json: JSON.stringify({ operation_id: OP3, category: 'KHAC', started_at: TODAY + 'T16:10:00.000Z', paused_item_id: '' }) });
assert.equal(sctx.endGlobalPause(OP3).ok, true);
assert.equal(db.OtherWork.length, 0);

// Bootstrap: phạm vi theo vai trò và theo kỳ.
db.OtherWork.length = 0;
const mk = (id, user, date, category, quantity, canceled) => db.OtherWork.push({ work_id: id, user_id: user, work_date: date, category, quantity, minutes: 0, operation_id: '', at: date + 'T03:00:00.000Z', canceled_at: canceled || '', canceled_by: '' });
mk('A0', 'LS1', '2026-09-30', 'HOP_DAU_NGAY', 1);          // trước kỳ
mk('A1', 'LS1', '2026-10-01', 'HOP_DAU_NGAY', 1);
mk('A2', 'LS2', '2026-10-05', 'XEM_VAN_BAN', 3);
mk('A3', 'LS1', '2026-10-06', 'SCAN_HOAN_THIEN', 8, '2026-10-06T05:00:00.000Z'); // đã hủy
mk('A4', 'LS1', '2026-10-07', 'DINH_GIA_LAI', 2);
const plan = { start_date: '2026-10-01', end_date: '2026-10-31' };
const ids = (u) => Array.from(sctx.otherWorkForBootstrap_(u, plan).map((r) => r.work_id)).sort();
assert.deepEqual(ids({ user_id: 'LS1', role: 'CAN_BO_LS' }), ['A1', 'A4'], 'Cán bộ LS chỉ nhận lượt của mình trong kỳ, bỏ lượt đã hủy');
for (const role of ['KS_LS', 'QUAN_LY_LS', 'ADMIN']) assert.deepEqual(ids({ user_id: 'K', role }), ['A1', 'A2', 'A4'], role + ' nhận mọi lượt trong kỳ');
for (const role of ['PHONG_PGD', 'GIAM_SAT']) assert.deepEqual(ids({ user_id: 'P', role }), [], role + ' không nhận việc khác');
assert.match(read('Code.gs'), /result\.other_work = otherWorkForBootstrap_\(u, activePlan\)/, 'getBootstrap phải trả other_work');
assert.match(read('Code.gs'), /tailWhere\('OtherWork', 5000[\s\S]*stopWhen/, 'Bootstrap quét ngược có điểm dừng, không đọc trọn bảng');
assert.match(read('Code.gs'), /report\.other_work = opts\.work_type_code \? \[\] : otherWorkSummary_/, 'Báo cáo thời gian có bảng việc khác');

// Báo cáo thời gian: gộp theo loại, cộng số phút.
db.OtherWork.length = 0;
const mkm = (id, user, date, category, quantity, minutes, canceled) => db.OtherWork.push({ work_id: id, user_id: user, work_date: date, category, quantity, minutes, operation_id: '', at: date + 'T03:00:00.000Z', canceled_at: canceled || '', canceled_by: '' });
mkm('B6', 'LS1', '2026-09-01', 'XEM_VAN_BAN', 9, 9); mkm('B1', 'LS1', '2026-10-05', 'SCAN_HOAN_THIEN', 12, 23); mkm('B2', 'LS1', '2026-10-06', 'SCAN_HOAN_THIEN', 4, 7);
mkm('B3', 'LS1', '2026-10-06', 'HOP_DAU_NGAY', 1, 15); mkm('B4', 'LS2', '2026-10-06', 'HOP_DAU_NGAY', 1, 15);
mkm('B5', 'LS1', '2026-10-06', 'XEM_VAN_BAN', 9, 9, '2026-10-06T08:00:00.000Z');
const summary = (user) => Array.from(sctx.otherWorkSummary_('2026-10-01', '2026-10-31', user)).map((g) => [g.category, g.quantity, g.minutes]);
assert.deepEqual(summary('LS1'), [['HOP_DAU_NGAY', 1, 15], ['SCAN_HOAN_THIEN', 16, 30]], 'Gộp theo loại, bỏ lượt hủy và lượt ngoài khoảng');
assert.deepEqual(summary(''), [['HOP_DAU_NGAY', 2, 30], ['SCAN_HOAN_THIEN', 16, 30]], 'Không chọn cán bộ thì gộp mọi người');
assert.deepEqual(Array.from(D.otherWorkSummary(db.OtherWork, '2026-10-01', '2026-10-31', 'LS1')).map((g) => [g.category, g.quantity, g.minutes]), summary('LS1'), 'Giao diện gộp giống máy chủ');

/* ---------- Bảng kết quả ngày ---------- */
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
LS.load(D.seed);
const st = LS.db();
const [A, B] = st.users.filter((u) => u.role === 'CAN_BO_LS' && u.active);
const ks = st.users.find((u) => u.role === 'KS_LS');
st.session = ks.user_id;
const today = LS.localDate();
const labels = Array.from(D.dailyStaffLabels(st.users.filter((u) => u.role === 'CAN_BO_LS')));
const staffIds = st.users.filter((u) => u.role === 'CAN_BO_LS').map((u) => u.user_id);
const lab = (u) => labels[staffIds.indexOf(u.user_id)];

function rowCells(html, label) {
  const staff = [...html.matchAll(/<th class="dm-staff">([^<]*)<\/th>/g)].map((m) => m[1]);
  const re = new RegExp('<tr[^>]*><td class="dm-act">(?:<button[\\s\\S]*?</button>)?(?:<i>)?' + label + '(?:</i>)?</td><td class="dm-unit">.*?</td>((?:<td class="num">\\d*</td>)+)<td class="num dm-total">([^<]*)</td>');
  const m = html.match(re);
  if (!m) return null;
  const nums = [...m[1].matchAll(/<td class="num">(\d*)<\/td>/g)].map((x) => Number(x[1] || 0));
  const out = { total: m[2] === '-' ? 0 : Number(m[2]) };
  staff.forEach((s, n) => { out[s] = nums[n]; });
  return out;
}
const board = () => LS.screens.board();

st.other_work = [];
const base = rowCells(board(), 'Khác');
assert.ok(base, 'Có dòng Khác');
assert.match(board(), /data-act="board-khac"[^>]*aria-expanded="false"/, 'Mũi tên bung dòng Khác, mặc định thu gọn');
assert.equal(rowCells(board(), 'Họp đầu ngày'), null, 'Chi tiết việc khác ẩn khi chưa bung');

const mkWork = (id, user, category, quantity, extra) => Object.assign({ work_id: id, user_id: user.user_id, work_date: today, category, quantity, minutes: 0, operation_id: '', at: LS.now(), canceled_at: '' }, extra || {});
st.other_work = [
  mkWork('W1', A, 'HOP_DAU_NGAY', 1), mkWork('W2', A, 'SCAN_HOAN_THIEN', 12), mkWork('W3', B, 'SCAN_HOAN_THIEN', 5),
  mkWork('W4', B, 'XEM_VAN_BAN', 4, { canceled_at: LS.now() }), mkWork('W5', A, 'DINH_GIA_LAI', 2, { work_date: '2020-01-01' })
];
const collapsed = rowCells(board(), 'Khác');
assert.equal(collapsed[lab(A)] - base[lab(A)], 13, 'Tổng việc khác (1 + 12) cộng vào Khác của người A; lượt ngày khác không tính');
assert.equal(collapsed[lab(B)] - base[lab(B)], 5, 'Lượt đã hủy không tính cho B');
assert.equal(collapsed.total - base.total, 18);
assert.equal(rowCells(board(), 'Scan hoàn thiện hồ sơ'), null, 'Chi tiết vẫn ẩn khi thu gọn');

LS.screens.toggleKhac();
const open = board();
assert.match(open, /data-act="board-khac"[^>]*aria-expanded="true"/, 'Bung dòng Khác');
const parent = rowCells(open, 'Khác');
assert.deepEqual({ ...parent }, { ...collapsed }, 'Bung ra không đổi tổng của dòng Khác');
const scan = rowCells(open, 'Scan hoàn thiện hồ sơ'), meeting = rowCells(open, 'Họp đầu ngày'), view = rowCells(open, 'Xem văn bản'), dossiers = rowCells(open, 'Hồ sơ loại khác');
assert.equal(scan[lab(A)], 12); assert.equal(scan[lab(B)], 5); assert.equal(scan.total, 17);
assert.equal(meeting[lab(A)], 1); assert.equal(meeting.total, 1);
assert.equal(view.total, 0, 'Lượt đã hủy không hiện ở chi tiết');
assert.equal(dossiers.total + scan.total + meeting.total + view.total + rowCells(open, 'Định giá lại TSBĐ').total + rowCells(open, 'Sắp xếp kho hồ sơ').total + rowCells(open, 'Xuất kho, thu nợ cầm cố').total, parent.total,
  'Các dòng chi tiết cộng đúng bằng dòng Khác');
assert.match(open, /<tr class="dm-child"><td class="dm-act"><i>Scan hoàn thiện hồ sơ<\/i>/, 'Dòng chi tiết là dòng con thụt vào');
LS.screens.toggleKhac();

/* ---------- Hộp thoại ghi việc khác và kết thúc tạm dừng (cán bộ LS) ---------- */
let dialog = '';
const toasts = [];
LS.ui.openDialog = (title, body) => { dialog = title + '|' + body; };
LS.ui.closeDialog = () => {};
LS.ui.toast = (message, kind) => { toasts.push([message, kind]); };
st.session = A.user_id;
st.other_work = [];
LS.screens.openOtherWork();
assert.match(dialog, /^Ghi việc khác\|/);
for (const type of D.OTHER_WORK_TYPES) {
  assert.ok(dialog.includes(type.label), 'Có loại ' + type.label);
  assert.ok(dialog.includes('name="qty_' + type.code + '"'), 'Có ô số lượng cho ' + type.label);
}
assert.ok(!/Đã ghi hôm nay/.test(dialog), 'Chưa ghi gì thì không có bảng đã ghi');

const form = (fields, attrs) => ({ _fields: fields, setAttribute() {}, getAttribute: (k) => (attrs || {})[k] || null });
LS.screens.submitOtherWork(form({}));
assert.deepEqual(toasts.pop(), ['Nhập số lượng cho ít nhất một việc.', 'err'], 'Không nhập gì thì không ghi');
LS.screens.submitOtherWork(form({ qty_SCAN_HOAN_THIEN: '-1' }));
assert.equal(toasts.pop()[1], 'err', 'Số lượng âm bị từ chối');
LS.screens.submitOtherWork(form({ qty_SCAN_HOAN_THIEN: '1.5' }));
assert.equal(toasts.pop()[1], 'err', 'Số lẻ bị từ chối');
assert.equal(st.other_work.length, 0);
LS.screens.submitOtherWork(form({ qty_SCAN_HOAN_THIEN: '7', qty_HOP_DAU_NGAY: '1', qty_XEM_VAN_BAN: '0', qty_DINH_GIA_LAI: '' }));
assert.equal(st.other_work.length, 2, 'Một lượt ghi nhiều loại; ô trống hoặc 0 bị bỏ qua');
assert.deepEqual(st.other_work.map((w) => [w.category, w.quantity, w.operation_id]), [['HOP_DAU_NGAY', 1, ''], ['SCAN_HOAN_THIEN', 7, '']]);
LS.screens.openOtherWork();
assert.match(dialog, /Đã ghi hôm nay/, 'Lần mở sau thấy lượt vừa ghi');
assert.match(dialog, /data-act="other-work-cancel"/, 'Có nút hủy lượt vừa ghi');
LS.screens.cancelOtherWork(st.other_work[0].work_id);
assert.ok(st.other_work[0].canceled_at, 'Hủy đánh dấu lượt, không xóa');

// Đang tạm dừng: ghi việc thuộc lượt tạm dừng; kết thúc thì chia giờ và đóng lượt.
st.other_work = [];
const startedAt = new Date(Date.now() - 60 * 60000).toISOString();
st.global_pause = { operation_id: 'LOCAL_OP_T', category: 'BAO_CAO', started_at: startedAt, paused_item_id: '' };
LS.screens.submitOtherWork(form({ qty_HOP_DAU_NGAY: '1' }));
assert.equal(st.other_work[0].operation_id, 'LOCAL_OP_T', 'Ghi lúc đang tạm dừng thì thuộc lượt tạm dừng đó');
LS.screens.openEndGlobalPause('LOCAL_OP_T');
assert.match(dialog, /^Kết thúc tạm dừng\|/);
assert.match(dialog, /data-form="end-pause"/);
assert.match(dialog, /Đã ghi trong lượt tạm dừng này/, 'Hiện các việc đã ghi trong lượt');
for (const type of D.OTHER_WORK_TYPES) assert.ok(dialog.includes('name="qty_' + type.code + '"'), 'Có ô nhập việc làm trong lượt: ' + type.label);
LS.app.refreshServer = () => Promise.resolve();
LS.screens.submitEndGlobalPause(form({ qty_SCAN_HOAN_THIEN: '12' }, { 'data-operation-id': 'LOCAL_OP_T' }));
await new Promise((r) => setTimeout(r, 20));
assert.equal(st.global_pause, null, 'Đã kết thúc lượt tạm dừng');
assert.equal(st.other_work.length, 2);
assert.ok(st.other_work.every((w) => w.operation_id === 'LOCAL_OP_T'));
const mins = Object.fromEntries(st.other_work.map((w) => [w.category, w.minutes]));
assert.ok(mins.HOP_DAU_NGAY >= 0 && mins.HOP_DAU_NGAY <= 15, 'Họp không quá 15 phút một lần');
assert.ok(mins.HOP_DAU_NGAY + mins.SCAN_HOAN_THIEN <= 60, 'Không chia quá thời gian đã dừng');

// Vai trò khác không có nút và không mở được hộp thoại.
st.session = ks.user_id;
dialog = '';
LS.screens.openOtherWork();
assert.equal(dialog, '', 'Kiểm soát không ghi việc khác');
assert.ok(/act:'other-work'/.test(read('js/screens.js')), 'Có nút Ghi việc khác trên màn của cán bộ LS');
assert.match(read('js/app.js'), /'global-pause-end': function \(el\) \{ S\.openEndGlobalPause/, 'Nút Kết thúc tạm dừng mở hộp thoại ghi việc đã làm');

/* ---------- Nhật ký sửa việc ghi cả giá trị cũ ---------- */
const before = sctx.revisionBefore_({ occurrence_date: '2026-10-08', product_name: 'Vay mới' }, { object: { phone: '0905123456', customer_name: 'Lan' } },
  { occurrence_date: '2026-10-12', 'customer.phone': '0912345678' });
assert.deepEqual({ ...before }, { occurrence_date: '2026-10-08', 'customer.phone': '0905123456' });
assert.equal(sctx.revisionChangeText_(t, before, { occurrence_date: '2026-10-12', 'customer.phone': '0912345678' }),
  'Ngày phát sinh: 08/10/2026 → 12/10/2026; Điện thoại: 0905123456 → 0912345678');
assert.equal(sctx.revisionChangeText_(t, { work_type_code: 'W1' }, { work_type_code: 'W2' }), 'Loại việc: Vay mới → Thẻ tín dụng', 'Loại việc hiện tên, không hiện mã');
assert.equal(sctx.joinReason_('Khách đổi lịch', 'Ngày phát sinh: a → b'), 'Khách đổi lịch · Ngày phát sinh: a → b');
assert.equal(sctx.joinReason_('', 'Ngày phát sinh: a → b'), 'Ngày phát sinh: a → b');

console.log('verify-other-work-contract: đạt');
