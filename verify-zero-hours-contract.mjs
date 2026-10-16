import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = { LS: {}, window: {}, localStorage: { getItem: () => null, setItem() {} } };
for (const name of ['core', 'domain', 'ui', 'charts', 'screens']) vm.runInNewContext(fs.readFileSync('js/' + name + '.js', 'utf8'), ctx);
const T = ctx.LSTiming, D = ctx.LS.domain;
const cal = { days: [1,2,3,4,5], open:'07:30', close:'18:00', breakFrom:'11:30', breakTo:'13:30', holidays:[] };
const state = D.seed();
state.calendar = cal;
const ts = (time, day = '2026-10-05') => day + 'T' + time + ':00+07:00';
const base = { item_id:'X', status:'HOAN_THANH_LS', assigned_user_id:'LS1', work_type_code:'W', timing_source:'CONFIRMED', version:1 };
const done = (receipt, finish, sessions) => ({ ...base, dossier_received_at:ts(receipt), processing_started_at:sessions.length ? sessions[0].start : '',
  completed_at:ts(finish), processing_sessions:sessions });
const label = item => D.processingLabel(item, state, ts('23:00'));
const noise = /ngoài giờ|giây|\d giờ|\+ ?\d|chờ làm tiếp|đang dừng|Chưa ghi nhận/i;

// Thời lượng chỉ là số phút, không có chú thích riêng. Phiên đã khép trong ngày mà làm ngoài lịch (sau giờ vẫn bấm hoàn thành)
// vẫn là giờ làm của người đó; nghỉ trưa thì không tính.
const evening = done('19:00', '19:30', [{ user_id:'LS1', start:ts('19:00'), end:ts('19:30') }]);
assert.equal(T.metrics(evening, cal).xu_ly, 0.5, 'Làm sau giờ rồi hoàn thành: tính giờ làm thêm');
assert.equal(T.metrics(evening, cal).xu_ly_ngoai_gio, 0.5);
assert.equal(label(evening), '30 phút');
assert.equal(label(done('11:40', '12:30', [{ user_id:'LS1', start:ts('11:40'), end:ts('12:30') }])), '0 phút', 'Nghỉ trưa không phải giờ làm');
assert.equal(label(done('07:00', '08:00', [{ user_id:'LS1', start:ts('07:00'), end:ts('08:00') }])), '1 giờ', 'Phiên cắt ngang giờ mở cửa: 30 phút trong lịch + 30 phút trước giờ mở');
assert.equal(label(done('17:30', '18:45', [{ user_id:'LS1', start:ts('17:30'), end:ts('18:45') }])), '1 giờ 15 phút', 'Qua giờ đóng cửa rồi bấm hoàn thành: 30 phút trong lịch + 45 phút ngoài giờ');
// Giờ làm thêm không đụng SLA: toàn trình và nhận → xong vẫn theo lịch.
const lateDone = done('17:30', '18:45', [{ user_id:'LS1', start:ts('17:30'), end:ts('18:45') }]);
assert.equal(T.metrics(lateDone, cal).nhan_den_xong, 0.5, 'Mốc nhận → xong chỉ tính theo lịch');
// Ngày nghỉ: cả phiên đã khép là giờ làm.
const saturday = { ...base, dossier_received_at:ts('09:00', '2026-10-10'), completed_at:ts('10:00', '2026-10-10'), processing_started_at:ts('09:00', '2026-10-10'),
  processing_sessions:[{ user_id:'LS1', start:ts('09:00', '2026-10-10'), end:ts('10:00', '2026-10-10') }] };
assert.equal(label(saturday), '1 giờ', 'Thứ Bảy làm một giờ');
// Không tính cho phiên còn chạy, kéo qua đêm hoặc dài quá 4 giờ ngoài lịch.
const open = { ...base, status:'DANG_THUC_HIEN', completed_at:'', dossier_received_at:ts('17:00'), processing_started_at:ts('17:00'), execution_state:'ACTIVE',
  processing_sessions:[{ user_id:'LS1', start:ts('17:00'), end:'' }] };
assert.equal(T.metrics(open, cal, ts('21:00')).xu_ly, 1, 'Phiên chưa khép chỉ tính phần trong lịch');
assert.equal(T.workTime(open, cal, ts('21:00'), 'LS1').overtime, 0);
const overnight = done('16:00', '08:00', [{ user_id:'LS1', start:ts('16:00'), end:ts('08:00', '2026-10-06') }]);
assert.equal(T.metrics({ ...overnight, completed_at:ts('08:00', '2026-10-06') }, cal).xu_ly_ngoai_gio, 0, 'Quên tạm dừng qua đêm không cộng giờ');
assert.equal(T.metrics(done('18:00', '23:30', [{ user_id:'LS1', start:ts('18:00'), end:ts('23:30') }]), cal).xu_ly, 4, 'Tối đa 4 giờ ngoài lịch cho một phiên');
assert.equal(label(done('09:00', '09:20', [{ user_id:'LS1', start:ts('09:00'), end:ts('09:20') }])), '20 phút', 'Phiên trong lịch giữ nguyên');
assert.equal(label(done('09:00', '11:15', [{ user_id:'LS1', start:ts('09:00'), end:ts('11:15') }])), '2 giờ 15 phút', 'Từ 60 phút ghi giờ và phút');
assert.equal(label(done('09:00', '09:01', [{ user_id:'LS1', start:'2026-10-05T09:00:00+07:00', end:'2026-10-05T09:00:20+07:00' }])), '<1 phút');
assert.equal(D.durationLabel(25), '25 giờ', 'Số giờ lớn vẫn gọn');

// Không có phiên làm nào thì không có căn cứ: không suy từ lúc nhận đến lúc xong, hiện "—".
const noSession = { ...base, dossier_received_at:ts('09:00'), completed_at:ts('15:00'), processing_sessions:[] };
assert.equal(T.metrics(noSession, cal).xu_ly, null, 'Không được bịa giờ xử lý từ khoảng nhận → xong');
assert.equal(T.metrics(noSession, cal).nhan_den_xong, 4, 'Khoảng nhận → xong vẫn hiện riêng');
assert.equal(label(noSession), '—');
// Phiên đã được sửa và cắt hết do trùng là số 0 xác định, khác dữ liệu cũ thiếu phiên.
const correctedZero = { ...noSession, timing_source:'CORRECTED', processing_started_at:ts('09:00') };
assert.equal(T.metrics(correctedZero, cal).xu_ly, 0);
assert.equal(T.metrics(correctedZero, cal).xu_ly_thuc_te, 0);
assert.equal(label(correctedZero), '0 phút');
assert.equal(T.metrics({ ...noSession, timing_source:'CORRECTED' }, cal).xu_ly, null, 'Không có mốc xử lý vẫn là thiếu dữ liệu');
assert.equal(label({ ...noSession, completed_at:ts('09:00') }), '—');
assert.equal(label({ ...noSession, dossier_received_at:ts('18:30'), completed_at:ts('19:30') }), '—');
assert.equal(D.receiptDurationLabel(noSession, state), '4 giờ');
assert.equal(D.receiptDurationLabel({ ...noSession, dossier_received_at:'' }, state), '—');

// Đang chạy: chỉ số phút, không giây, không hậu tố trạng thái.
const running = { ...base, status:'DANG_THUC_HIEN', completed_at:'', dossier_received_at:ts('09:00'), processing_started_at:ts('09:00'),
  execution_state:'ACTIVE', processing_sessions:[{ user_id:'LS1', start:ts('09:00'), end:'' }] };
assert.equal(D.processingLabel(running, state, ts('09:10')), '10 phút');
assert.equal(D.processingLabel({ ...running, execution_state:'WAITING', processing_sessions:[{ user_id:'LS1', start:ts('09:00'), end:ts('09:10') }] }, state, ts('09:40')), '10 phút', 'Chờ làm tiếp không thêm chữ');
assert.equal(D.processingLabel({ ...running, status:'TAM_DUNG', processing_sessions:[{ user_id:'LS1', start:ts('09:00'), end:ts('09:10') }] }, state, ts('09:40')), '10 phút', 'Đang dừng không thêm chữ');
assert.equal(D.processingLabel({ ...running, processing_started_at:'', processing_sessions:[], execution_state:'QUEUED' }, state, ts('09:10')), '—', 'Chưa bắt đầu hiện "—"');

// Giờ của riêng một cán bộ trên hồ sơ có nhiều người làm; phiên chưa rõ người không gán cho ai.
const shared = done('09:00', '15:00', [
  { user_id:'LS1', start:ts('09:00'), end:ts('09:30') },
  { user_id:'LS2', start:ts('10:00'), end:ts('10:20') },
  { user_id:'', start:ts('14:00'), end:ts('14:10') }]);
assert.equal(T.workTime(shared, cal, ts('23:00'), 'LS1').hours, 0.5);
assert.equal(T.workTime(shared, cal, ts('23:00'), 'LS2').hours, 1 / 3);
assert.equal(T.workTime(shared, cal, ts('23:00'), 'LS3').sessions, 0);
assert.equal(Math.round(T.metrics(shared, cal).xu_ly * 60), 60, 'Cả hồ sơ cộng đủ ba phiên');

// Trung bình: phút, không làm tròn về 0, hồ sơ 0 giờ trong lịch không kéo trung bình xuống.
assert.equal(D.averageDurationLabel(0.04, 1), '2 phút');
assert.equal(D.averageDurationLabel(1.2, 1), '1 giờ 12 phút');
assert.equal(D.averageDurationLabel(0, 0), '—');
state.requests = []; state.items = [];
const add = (id, sessions, finish) => state.items.push({ ...done('09:00', finish, sessions), item_id:id, occurrence_date:'2026-10-05', request_id:'R' + id });
add('A', [{ user_id:'LS1', start:ts('09:00'), end:ts('09:30') }], '09:30');
add('B', [{ user_id:'LS1', start:ts('19:00'), end:ts('19:30') }], '19:30');
add('C', [], '15:00');
const report = D.reportFromItems('2026-10', '2026-10', 'unit', state);
assert.equal(report.total.hoan_thanh, 3);
assert.equal(report.total.so_xu_ly, 2, 'Hồ sơ A (trong lịch) và B (làm sau giờ rồi hoàn thành) đều có giờ; C không có phiên');
assert.equal(report.total.tong_gio_xu_ly, 1);

// Dashboard cá nhân: giờ của chính người đăng nhập trên từng hồ sơ hoàn thành trong ngày.
const officer = state.users.find(u => u.role === 'CAN_BO_LS');
const o = officer.user_id;
const mine = (id, sessions, finish, extra = {}) => ({ ...done('09:00', finish, sessions), item_id:id, assigned_user_id:o,
  occurrence_date:'2026-10-05', request_id:'', ...extra });
state.items = [
  mine('IN', [{ user_id:o, start:ts('09:00'), end:ts('09:45') }], '16:00'),
  mine('LATE', [{ user_id:o, start:ts('19:00'), end:ts('19:30') }], '19:30'),
  mine('SHARED', [{ user_id:'OTHER', start:ts('08:00'), end:ts('08:30') }, { user_id:o, start:ts('09:00'), end:ts('09:20') }], '16:00'),
  mine('EMPTY', [], '17:00'),
  mine('YESTERDAY', [{ user_id:o, start:ts('09:00', '2026-10-04'), end:ts('10:00', '2026-10-04') }], '10:00', { completed_at:ts('10:00', '2026-10-04') })
];
state.session = o;
ctx.LS.replace(state);
ctx.LS.app = { render() {} };
ctx.LS.screens.setFilter('my-dashboard', 'done-date', '2026-10-05');
const html = ctx.LS.screens.personalDashboard();
const section = html.slice(html.indexOf('personal-done-report'));
assert.ok(section.includes('Giờ tôi làm'), 'Cột giờ phải là giờ của chính người làm');
assert.ok(section.includes('45 phút'), 'Hồ sơ trong lịch: 45 phút');
assert.ok(section.includes('20 phút') && !section.includes('50 phút'), 'Hồ sơ có người khác làm chỉ hiện phần của tôi');
assert.ok(section.includes('30 phút'), 'Hồ sơ làm sau giờ rồi hoàn thành: 30 phút làm thêm, không chú thích');
assert.ok(/Tổng giờ tôi làm<\/div><div class="metric-v [^"]*">1 giờ 35 phút<\/div><\/div>/.test(section), 'Tổng giờ: 45 + 30 (sau giờ) + 20 phút, không dòng phụ');
assert.ok(/Trung bình mỗi hồ sơ<\/div><div class="metric-v [^"]*">32 phút<\/div><\/div>/.test(section), 'Trung bình chỉ tính hồ sơ đo được, không dòng phụ');
assert.ok(!section.includes('YESTERDAY'), 'Chỉ hồ sơ hoàn thành đúng ngày đã chọn');
assert.ok(!noise.test(section.replace(/Giờ (nhận|hoàn thành|tôi làm)/g, '')), 'Không còn chú thích giờ/ngoài giờ/giây');

console.log('Minutes-only display, no-evidence handling, personal completed-today minutes and averages passed.');

// "Giờ làm hôm nay": số phút (cả phần làm sau giờ đã khép), không dòng phụ. Đồng hồ cố định 20:00 ngày 05/10/2026.
const RealDate = Date;
const frozen = new RealDate(ts('20:00')).getTime();
class FrozenDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(frozen); }
  static now() { return frozen; }
}
const clock = { LS: {}, window: {}, localStorage: ctx.localStorage, Date: FrozenDate };
for (const name of ['core', 'domain', 'ui', 'charts', 'screens']) vm.runInNewContext(fs.readFileSync('js/' + name + '.js', 'utf8'), clock);
const today = clock.LS.domain.seed();
today.calendar = cal;
const me = today.users.find(u => u.role === 'CAN_BO_LS').user_id;
today.items = [{ ...done('09:00', '09:45', [{ user_id:me, start:ts('09:00'), end:ts('09:45') }]), item_id:'D1', assigned_user_id:me, request_id:'', occurrence_date:'2026-10-05' },
  { ...done('19:00', '19:30', [{ user_id:me, start:ts('19:00'), end:ts('19:30') }]), item_id:'D2', assigned_user_id:me, request_id:'', occurrence_date:'2026-10-05' }];
today.session = me;
clock.LS.replace(today); clock.LS.app = { render() {} };
const top = clock.LS.screens.personalDashboard();
assert.match(top, /Giờ làm hôm nay<\/div><div class="metric-v [^"]*">1 giờ 15 phút<\/div><\/div>/, 'Giờ làm hôm nay là số phút, gồm 30 phút làm sau giờ đã hoàn thành');
assert.ok(!top.includes('ngoài giờ'), 'Không có chú thích ngoài giờ');

console.log('Today minutes display passed.');
