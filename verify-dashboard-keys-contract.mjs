import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {}, document: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/charts.js'), ctx);
const C = ctx.LS.charts;

// Chia khoảng: tháng → ngày, quý → tuần, năm → tháng.
if (C.buckets('2026-09-01', '2026-09-30').labels.length !== 30) fail('Tháng phải chia theo ngày.');
if (C.buckets('2026-07-01', '2026-09-30').mode !== 'week') fail('Quý phải chia theo tuần.');
const year = C.buckets('2026-01-01', '2026-12-31');
if (year.mode !== 'month' || year.labels.length !== 12) fail('Năm phải chia 12 tháng.');
if (year.keyOf('2026-03-15') !== 2 || year.keyOf('2027-01-01') !== -1) fail('keyOf phải trả đúng ô và -1 khi ngoài kỳ.');

const col = C.columns({ title: 'T', labels: ['a', 'b'], series: [{ name: 'X', values: [1, 3] }, { name: 'Y', values: [2, 0], slot: 2 }] });
if (!/viz-legend/.test(col)) fail('Từ 2 chuỗi trở lên phải có chú giải.');
if (!/viz-table/.test(col)) fail('Đồ thị phải kèm bảng số liệu.');
if (!/var\(--viz-2\)/.test(col)) fail('Chuỗi slot 2 phải dùng --viz-2 (màu theo vai trò).');
if (/viz-legend/.test(C.columns({ title: 'T', labels: ['a'], series: [{ name: 'X', values: [1] }] }))) fail('Một chuỗi không cần hộp chú giải.');
if (!/viz-empty/.test(C.bars({ title: 'T', rows: [{ label: 'a' }], series: [{ name: 'X', values: [0] }] }))) fail('Không có số liệu phải báo trống, không vẽ thanh 0.');

const css = read('css/styles.css');
['--viz-1', '--viz-2', '--viz-3', '--teal:', '--brand-300:'].forEach((t) => { if (!css.includes(t)) fail('Thiếu biến CSS ' + t); });

const screens = read('js/screens.js');
if (/elapsedHours\(i\.assigned_at, i\.completed_at\)/.test(screens)) fail('Giờ xử lý phải là giờ làm (đồng hồ khách hàng), không phải giờ đồng hồ.');
if (/x\.avgReceiveHours \/ a\.length/.test(screens)) fail('Không lấy trung bình của các trung bình cán bộ.');

const app = read('js/app.js');
['shortcutHelp', "case 'j'", "case '/'", 'requestSubmit', 'skip-link', 'aria-keyshortcuts'].forEach((t) => { if (!app.includes(t)) fail('Phím tắt thiếu: ' + t); });
if (!/data-hotkey=/.test(screens)) fail('Nút thao tác trong chi tiết việc phải có số phím.');
if (!/data-row=/.test(screens) || !/r\.attrs/.test(read('js/ui.js'))) fail('Dòng việc phải nhận tiêu điểm bàn phím.');
if (!/js\/charts\.js/.test(read('index.html'))) fail('index.html phải nạp js/charts.js.');

console.log('Dashboard charts and keyboard shortcut contract OK');

// Báo cáo nhiều kỳ chỉ chạy khi bấm nút; lọc Tổng hợp theo cán bộ/đơn vị; chỉ tiêu; Excel.
const reportFn = screens.slice(screens.indexOf('  function report() {'), screens.indexOf('  function exportBoard()'));
if (/loadReport\(/.test(reportFn)) fail('Màn Báo cáo không được tự tải khi vẽ; chỉ chạy khi bấm "Chạy báo cáo".');
const setRep = screens.slice(screens.indexOf('function setReportFilter'), screens.indexOf('function num('));
if (/loadReport\(/.test(setRep)) fail('Đổi bộ lọc báo cáo không được tự tải.');
if (!/'report-run'/.test(app)) fail('Thiếu nút Chạy báo cáo.');
if (!/function boardItems\(\)/.test(screens) || !/draftAttrs\('board', 'staff'\)/.test(screens)) fail('Tổng hợp phải lọc được theo cán bộ / đơn vị.');
if (!/'target_done_month', 'target_done_staff_month'/.test(read('Code.gs'))) fail('Máy chủ phải cho lưu chỉ tiêu tháng.');
if (!/function downloadXlsx/.test(app) || !/exportBoard/.test(screens)) fail('Phải xuất được Excel.');
if (!/viz-target/.test(read('js/charts.js'))) fail('Đồ thị cột phải vẽ được đường chỉ tiêu.');
console.log('Report run button, board filters, targets and Excel contract OK');
