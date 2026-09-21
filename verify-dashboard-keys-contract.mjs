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
