/**
 * Kiểm hợp đồng báo cáo nhiều kỳ.
 *
 * Điểm mấu chốt: việc mở sang tháng sau được nhân thành một dòng WorkItems mới
 * ở kỳ đó. Một việc kéo dài ba tháng tồn tại dưới dạng ba dòng. Mọi chỉ số cộng
 * dồn qua nhiều kỳ phải đếm nó đúng một lần.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/domain.js'), ctx);
const D = ctx.LS.domain;
const fail = (msg) => { throw new Error(msg); };

const st = D.seed();
const base = st.items[0];
const row = (id, month, carryFrom, carryTo, status) => Object.assign({}, base, {
  item_id: id, occurrence_date: month + '-05', status,
  carryover_from_item_id: carryFrom, carried_to_item_id: carryTo,
  assigned_at: month + '-05T01:00:00.000Z',
  completed_at: status === 'HOAN_THANH_LS' ? month + '-20T03:00:00.000Z' : '',
  due_at: month + '-10T10:00:00.000Z'
});

// Một việc chạy từ tháng 7 sang tháng 9 rồi xong, cộng một việc mới trong tháng 9.
st.items = [
  row('A_T7', '2026-07', '', 'A_T8', 'DANG_THUC_HIEN'),
  row('A_T8', '2026-08', 'A_T7', 'A_T9', 'DANG_THUC_HIEN'),
  row('A_T9', '2026-09', 'A_T8', '', 'HOAN_THANH_LS'),
  row('B_T9', '2026-09', '', '', 'HOAN_THANH_LS')
];

const quy3 = D.reportFromItems('2026-07', '2026-09', 'unit', st);

if (quy3.total.phat_sinh !== 2) {
  fail('Bốn dòng dữ liệu là hai việc thật; phát sinh phải là 2, nhận ' + quy3.total.phat_sinh + '.');
}
if (quy3.total.chuyen_tiep_vao !== 2) {
  fail('Hai lượt chuyển tiếp phải được đếm riêng, nhận ' + quy3.total.chuyen_tiep_vao + '.');
}
if (quy3.total.hoan_thanh !== 2) fail('Hoàn thành phải là 2, nhận ' + quy3.total.hoan_thanh + '.');
if (quy3.total.qua_han !== 2) {
  fail('Một việc trễ chỉ được chấm trễ một lần ở dòng cuối, nhận ' + quy3.total.qua_han + '.');
}

const thang7 = quy3.months.find((m) => m.month_key === '2026-07');
if (thang7.qua_han !== 0) fail('Kỳ đã chuyển tiếp việc đi không được tính trễ cho việc đó.');
if (thang7.ton_cuoi_ky !== 0) fail('Việc đã sang kỳ sau không còn là tồn của kỳ cũ.');

// Tồn là ảnh chụp: cộng dồn qua các tháng sẽ sai.
st.items.push(row('C_T9', '2026-09', '', '', 'DANG_THUC_HIEN'));
st.items.push(row('C_T8', '2026-08', '', '', 'DANG_THUC_HIEN'));
const lai = D.reportFromItems('2026-08', '2026-09', 'unit', st);
if (lai.total.ton_cuoi_ky !== 1) {
  fail('Tồn cuối kỳ phải lấy ảnh chụp của kỳ cuối (1), không cộng dồn, nhận ' + lai.total.ton_cuoi_ky + '.');
}

// Giờ trung bình phải tính lại từ tổng giờ, không phải trung bình của trung bình.
const theoThang = D.reportFromItems('2026-09', '2026-09', 'unit', st);
const tb = theoThang.total.hoan_thanh
  ? Math.round((theoThang.total.tong_gio_xu_ly / theoThang.total.hoan_thanh) * 10) / 10 : 0;
if (theoThang.total.gio_xu_ly_tb !== tb) fail('Giờ xử lý trung bình phải suy từ tổng giờ chia số việc xong.');

// Các mốc khoảng thời gian
if (D.monthsInRange('2026-01', '2026-12').length !== 12) fail('Khoảng một năm phải ra 12 tháng.');
if (D.monthsInRange('2025-11', '2026-02').join(',') !== '2025-11,2025-12,2026-01,2026-02') {
  fail('Khoảng vắt qua năm phải liệt kê đúng thứ tự tháng.');
}
const quy = D.presetRange('quarter');
if (!/^\d{4}-\d{2}$/.test(quy.from) || !/^\d{4}-\d{2}$/.test(quy.to)) fail('Mốc quý phải trả về dạng YYYY-MM.');
if (D.monthsInRange(quy.from, quy.to).length !== 3) fail('Một quý phải gồm đúng 3 tháng.');

// Một hồ sơ có đủ bốn mốc phải tách đúng từng đoạn thời gian, không gộp
// submitted -> completed vào giờ xử lý.
const timed = row('TIMED_T9', '2026-09', '', '', 'HOAN_THANH_LS');
timed.submitted_at = '2026-09-05T00:00:00.000Z';
timed.accepted_at = '2026-09-05T02:00:00.000Z';
timed.assigned_at = '2026-09-05T05:00:00.000Z';
timed.completed_at = '2026-09-06T05:00:00.000Z';
st.items.push(timed);
const timingState = Object.assign({}, st, { items: [timed] });
const timing = D.reportFromItems('2026-09', '2026-09', 'unit', timingState).total;
if (timing.tong_gio_tiep_nhan !== 2 || timing.tong_gio_phan_cong !== 3 || timing.tong_gio_xu_ly !== 24 || timing.tong_gio_toan_trinh !== 29) {
  fail('Các đoạn thời gian nhận/phân công/xử lý/toàn trình không được tính đúng: ' + JSON.stringify(timing));
}
if (timing.gio_tiep_nhan_tb !== 2 || timing.gio_phan_cong_tb !== 3 || timing.gio_xu_ly_tb !== 24 || timing.gio_toan_trinh_tb !== 29) {
  fail('Thời gian trung bình phải suy từ tổng và số mẫu của từng đoạn.');
}

// Ma trận phải giữ đủ mọi cán bộ LS, kể cả người chưa phát sinh việc, và
// đếm theo đúng nhóm việc để đối chiếu với bảng LS Time Log.
const staffA = { user_id: 'LS_A', full_name: 'Cán bộ A', role: 'CAN_BO_LS', active: true };
const staffB = { user_id: 'LS_B', full_name: 'Cán bộ B', role: 'CAN_BO_LS', active: true };
const workloadState = Object.assign({}, st, {
  users: [staffA, staffB],
  workTypes: [
    { code: 'WT_A', name: 'Nhóm A', group: 'Nhóm A', active: true },
    { code: 'WT_B', name: 'Nhóm B', group: 'Nhóm B', active: true }
  ],
  items: [
    Object.assign({}, base, { item_id: 'W_A1', assigned_user_id: 'LS_A', work_type_code: 'WT_A', occurrence_date: '2026-09-02', status: 'DANG_THUC_HIEN' }),
    Object.assign({}, base, { item_id: 'W_A2', assigned_user_id: 'LS_A', work_type_code: 'WT_B', occurrence_date: '2026-09-03', status: 'HOAN_THANH_LS' })
  ]
});
const workload = D.staffWorkloadByGroup(workloadState.items, workloadState, '2026-09-01', '2026-09-30');
if (workload.groups.join('|') !== 'Nhóm A|Nhóm B') fail('Ma trận phải giữ đúng danh sách nhóm việc.');
const rowA = workload.rows.find((x) => x.user.user_id === 'LS_A');
const rowB = workload.rows.find((x) => x.user.user_id === 'LS_B');
if (!rowA || rowA.total !== 2 || rowA.byGroup['Nhóm A'] !== 1 || rowA.byGroup['Nhóm B'] !== 1 || rowA.done !== 1) {
  fail('Ma trận phải đếm đủ tổng, nhóm việc và hoàn thành của cán bộ có việc.');
}
if (!rowB || rowB.total !== 0 || rowB.byGroup['Nhóm A'] !== 0 || rowB.byGroup['Nhóm B'] !== 0) {
  fail('Ma trận phải hiển thị cán bộ chưa phát sinh việc với số 0.');
}

/* ---------------------------- Phía máy chủ ---------------------------- */

const server = read('Code.gs');
const setup = read('SetupSheetDB.gs');
vm.runInNewContext(setup, {});

const must = [
  [server, 'function getReport', 'Phải có API báo cáo nhiều kỳ phía máy chủ.'],
  [server, 'function periodSummaryRows_', 'Phải có hàm tính số liệu một kỳ.'],
  [server, 'function writePeriodSummary_', 'Phải chốt được số liệu kỳ.'],
  [server, 'function rebuildPeriodSummaries', 'Phải có lệnh dựng lại số liệu khi nghi lệch.'],
  [server, 'carried_to_item_id: newItemId', 'Chuyển tiếp phải đánh dấu dòng cũ.'],
  [server, '!i.carried_to_item_id', 'Dòng đã chuyển tiếp không được tính tồn và trễ.'],
  [setup, "'carried_to_item_id'", 'Bảng WorkItems phải có cột đánh dấu chuyển tiếp.'],
  [setup, 'PeriodSummary:', 'Phải có bảng số liệu chốt theo kỳ.']
];
for (const [source, needle, message] of must) if (!source.includes(needle)) fail(message);

// Báo cáo không được trả dòng việc thô về trình duyệt.
if (!/return \{ from: from, to: to, group: group, months: months, rows: rows, total: total/.test(server)) {
  fail('getReport phải trả số liệu đã tổng hợp, không trả danh sách việc.');
}
if (!/\['KS_LS', 'QUAN_LY_LS', 'ADMIN'\]\.indexOf\(u\.role\) === -1/.test(server)) {
  fail('Báo cáo phải giới hạn theo vai trò.');
}

// Hai bản tính phải dùng chung một bộ tên chỉ số.
const metrics = ['phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'ton_cuoi_ky', 'qua_han', 'tong_gio_xu_ly'];
const clientSource = read('js/domain.js');
for (const m of metrics) {
  if (!clientSource.includes(m)) fail('Bản tính trình duyệt thiếu chỉ số ' + m + '.');
  if (!server.includes(m)) fail('Bản tính máy chủ thiếu chỉ số ' + m + '.');
}

// Thời gian phải tách được ba đoạn nghiệp vụ, không gộp hết vào "giờ xử lý":
// nhận hồ sơ (submitted -> accepted), phân công (accepted -> assigned),
// và xử lý đến hoàn thành (assigned -> completed).
const timingMetrics = [
  'tong_gio_tiep_nhan', 'tong_gio_phan_cong', 'tong_gio_xu_ly', 'tong_gio_toan_trinh',
  'gio_tiep_nhan_tb', 'gio_phan_cong_tb', 'gio_xu_ly_tb', 'gio_toan_trinh_tb'
];
for (const m of timingMetrics) {
  if (!clientSource.includes(m)) fail('Bản tính trình duyệt thiếu chỉ số thời gian ' + m + '.');
  if (!server.includes(m)) fail('Bản tính máy chủ thiếu chỉ số thời gian ' + m + '.');
}
if (!server.includes('function itemTiming_')) fail('Máy chủ thiếu hàm tính mốc nhận/phân công/hoàn thành.');
if (!setup.includes('tong_gio_tiep_nhan')) fail('PeriodSummary chưa có cột thời gian nhận hồ sơ.');
if (!server.includes('hasTimingColumns')) fail('Báo cáo chưa có fallback cho kho PeriodSummary cũ chưa migrate.');

console.log('Report contract passed.');
