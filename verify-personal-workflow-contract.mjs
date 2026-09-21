import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/domain.js'), ctx);
const D = ctx.LS.domain;

if (typeof ctx.LS.addWorkingHours !== 'function' || typeof ctx.LS.workingHours !== 'function') {
  fail('Core phải cung cấp bộ tính giờ làm việc cộng/trừ để loại trừ giờ nghỉ.');
}
const cal = { days: [1, 2, 3, 4, 5], open: '07:30', close: '18:00', breakFrom: '11:30', breakTo: '13:30', holidays: [] };
const hours = ctx.LS.workingHours('2026-09-21T10:00:00+07:00', '2026-09-21T14:00:00+07:00', cal);
if (Math.abs(hours - 2) > 0.001) fail('10:00→14:00 phải chỉ tính 2 giờ làm, nhận ' + hours + '.');
const overnight = ctx.LS.workingHours('2026-09-21T18:00:00+07:00', '2026-09-22T08:00:00+07:00', cal);
if (Math.abs(overnight - 0.5) > 0.001) fail('Qua đêm phải chỉ tính 0,5 giờ từ 07:30→08:00, nhận ' + overnight + '.');

if (typeof D.processingHours !== 'function') fail('Domain phải có bộ tính thời gian xử lý hồ sơ.');
const st = D.seed();
st.calendar = cal;
const started = '2026-09-21T10:00:00+07:00';
const item = Object.assign({}, st.items[0], { processing_started_at: started, completed_at: '2026-09-21T14:00:00+07:00' });
if (Math.abs(D.processingHours(item, st, new Date('2026-09-21T14:00:00+07:00')) - 2) > 0.001) fail('Hồ sơ phải tính giờ từ processing_started_at và loại trừ nghỉ trưa.');

const server = read('Code.gs');
const setup = read('SetupSheetDB.gs');
const screens = read('js/screens.js');
const app = read('js/app.js');
const gasApi = read('js/gas-api.js');
const required = [
  [server, 'processing_started_at', 'WorkItems/server phải lưu mốc LS bắt đầu xử lý hồ sơ.'],
  [server, "if (u.role === 'CAN_BO_LS') return e.by === u.user_id", 'Bootstrap phải giới hạn nhật ký cán bộ LS theo chính người thực hiện.'],
  [server, 'function saveChecklist', 'Server phải có API lưu tick nhóm việc.'],
  [screens, 'function personalDashboard', 'Phải có dashboard cá nhân cho cán bộ LS.'],
  [screens, 'function saveChecklist', 'UI phải có thao tác lưu tick nhóm việc.'],
  [screens, 'processing_started_at', 'UI phải hiển thị bộ đếm thời gian xử lý khách hàng.'],
  [screens, 'Đang xử lý (giờ làm)', 'Dashboard cá nhân phải hiện số giờ làm thực tế.'],
  [app, "case 'my-dashboard'", 'App phải định tuyến tới dashboard cá nhân.'],
  [gasApi, 'saveChecklist', 'Adapter GAS phải gọi API lưu checklist.']
];
for (const [source, marker, message] of required) if (!source.includes(marker)) fail(message);
if (setup.indexOf("'processing_started_at'") === -1) fail('Schema WorkItems phải có cột processing_started_at.');
if (screens.includes("['Hạn xử lý', i.due_at ? i.due_at")) fail('Màn chi tiết không được dùng hạn xử lý làm đồng hồ khách hàng.');

console.log('Personal workflow contract passed.');
