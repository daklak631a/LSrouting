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

console.log('Report contract passed.');
