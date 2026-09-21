import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/domain.js'), ctx);
const D = ctx.LS.domain;
const st = D.seed();
st.calendar = { days: [1, 2, 3, 4, 5], holidays: [] };

// Thứ Hai 21/09: bắt đầu 08:00, tạm dừng 09:00, tiếp tục 10:00, soạn xong,
// hẹn khách 11:00 (dừng), khách ký hôm sau 08:00 thì hoàn thành.
const item = { processing_started_at: '2026-09-21T08:00:00+07:00', completed_at: '', pause_log: [] };
D.applyClock(item, 'TAM_DUNG', '2026-09-21T09:00:00+07:00');
if (!D.clockPaused(item)) fail('Tạm dừng phải dừng đồng hồ.');
D.applyClock(item, 'DANG_THUC_HIEN', '2026-09-21T10:00:00+07:00');
if (D.clockPaused(item)) fail('Tiếp tục xử lý phải chạy lại đồng hồ.');
D.applyClock(item, 'DA_SOAN_XONG', '2026-09-21T10:30:00+07:00');
if (item.pause_log.length !== 1) fail('Soạn xong vẫn là đang làm, không mở khoảng dừng mới.');
D.applyClock(item, 'DANG_HEN_KH', '2026-09-21T11:00:00+07:00');
const waiting = D.processingHours(item, st, new Date('2026-09-22T08:00:00+07:00'));
if (Math.abs(waiting - 2) > 0.001) fail('Chờ khách ký không được tính giờ: cần 2 giờ, nhận ' + waiting + '.');
D.applyClock(item, 'HOAN_THANH_LS', '2026-09-22T08:00:00+07:00');
item.completed_at = '2026-09-22T08:00:00+07:00';
if (Math.abs(D.processingHours(item, st) - 2) > 0.001) fail('Hoàn thành sau khi khách ký vẫn phải là 2 giờ làm.');

const server = read('Code.gs');
const setup = read('SetupSheetDB.gs');
if (!/'pause_log_json'/.test(setup)) fail('WorkItems phải có cột pause_log_json.');
const serverRun = (server.match(/var CLOCK_RUNNING_ = (\[[^\]]+\])/) || [])[1];
const clientRun = (read('js/domain.js').match(/var CLOCK_RUNNING = (\[[^\]]+\])/) || [])[1];
if (!serverRun || serverRun !== clientRun) fail('Danh sách trạng thái chạy đồng hồ phải giống nhau ở máy chủ và giao diện.');
if (!/fields\.pause_log_json = pauses/.test(server)) fail('transitionItem phải ghi nhật ký dừng.');
if (!/pause_log: json\(i\.pause_log_json/.test(read('js/gas-api.js'))) fail('gas-api phải đọc pause_log_json.');

// Tab phòng trong file kế hoạch phải có tiêu đề.
if (!/ensurePlanTabHeader_\(tab, plan, u, copiedTemplate\)/.test(server)) fail('Tab phòng phải được bổ sung tiêu đề khi còn trống.');

// Mật khẩu khởi tạo thật không được nằm trong mã gửi xuống trình duyệt.
if (/D@kl/.test(read('js/app.js')) || /D@kl/.test(read('Index.gas.html'))) fail('Mật khẩu khởi tạo thật bị lộ trong mã trình duyệt.');

console.log('Clock pause, plan header and client-secret contract OK');
