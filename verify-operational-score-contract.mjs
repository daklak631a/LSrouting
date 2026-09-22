import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };
const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {}, document: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/domain.js'), ctx);
const D = ctx.LS.domain;

const st = {
  users: [
    { user_id: 'U1', full_name: 'Đúng hạn', role: 'CAN_BO_LS', active: true, sort_order: 1 },
    { user_id: 'U2', full_name: 'Quá hạn', role: 'CAN_BO_LS', active: true, sort_order: 2 },
    { user_id: 'U3', full_name: 'Chưa có việc', role: 'CAN_BO_LS', active: true, sort_order: 3 },
    { user_id: 'U4', full_name: 'Đã khóa', role: 'CAN_BO_LS', is_active: false, sort_order: 4 }
  ],
  items: [
    { item_id: 'I1', assigned_user_id: 'U1', occurrence_date: '2026-09-01', status: 'HOAN_THANH_LS', due_at: '2026-09-02T10:00:00.000Z', completed_at: '2026-09-02T09:00:00.000Z' },
    { item_id: 'I2', assigned_user_id: 'U1', occurrence_date: '2026-09-02', status: 'HOAN_THANH_LS', due_at: '2026-09-03T10:00:00.000Z', completed_at: '2026-09-03T09:00:00.000Z' },
    { item_id: 'I3', assigned_user_id: 'U2', occurrence_date: '2026-09-03', status: 'HOAN_THANH_LS', due_at: '2026-09-04T10:00:00.000Z', completed_at: '2026-09-04T11:00:00.000Z' },
    { item_id: 'I4', assigned_user_id: 'U2', occurrence_date: '2026-09-04', status: 'DANG_THUC_HIEN', due_at: '2026-09-05T10:00:00.000Z' },
    { item_id: 'I5', assigned_user_id: 'U1', occurrence_date: '2026-08-30', status: 'HOAN_THANH_LS', due_at: '2026-08-31T10:00:00.000Z', completed_at: '2026-08-31T09:00:00.000Z' },
    { item_id: 'I6', assigned_user_id: 'U1', occurrence_date: '2026-09-04', status: 'HUY', due_at: '2026-09-05T10:00:00.000Z' }
  ]
};

const scores = D.operationalScorecard('2026-09-01', '2026-09-30', st, new Date('2026-09-10T12:00:00.000Z'));
if (!Array.isArray(scores) || scores.length !== 3 || scores.some((x) => x.user.user_id === 'U4')) fail('Phải chấm cán bộ LS đang hoạt động, kể cả người chưa có việc.');
const u1 = scores.find((x) => x.user.user_id === 'U1');
const u2 = scores.find((x) => x.user.user_id === 'U2');
const u3 = scores.find((x) => x.user.user_id === 'U3');
if (u1.score !== 100 || u1.onTime !== 2 || u1.lateOpen !== 0) fail('Hai việc hoàn thành đúng hạn phải đạt 100 điểm.');
if (u2.score !== 13 || u2.onTime !== 0 || u2.lateOpen !== 1) fail('Điểm phải cộng đúng hạn 60, hoàn thành 25 và tồn quá hạn 15 theo tỷ trọng công khai.');
if (u3.score !== null || u3.eligible !== 0) fail('Không có việc không được xếp điểm 0.');
if (scores[0].user.user_id !== 'U1' || scores[2].user.user_id !== 'U3') fail('Bảng điểm phải xếp điểm giảm dần, chưa đủ dữ liệu ở cuối.');

const missingSla = D.operationalScorecard('2026-09-01', '2026-09-30', {
  users: [{ user_id: 'U5', full_name: 'Thiếu SLA', role: 'CAN_BO_LS', active: true }],
  items: [{ item_id: 'I7', assigned_user_id: 'U5', occurrence_date: '2026-09-05',
    status: 'HOAN_THANH_LS', completed_at: '2026-09-05T10:00:00.000Z', due_at: '' }]
}, new Date('2026-09-10T12:00:00.000Z'))[0];
if (missingSla.score !== null || missingSla.dataQuality !== 'THIEU_HAN_SLA') fail('Thiếu SLA phải được đánh dấu dữ liệu, không chấm điểm ngầm.');

const admin = read('js/admin.js');
if (!/operationalScorecard/.test(admin) || !/Điểm vận hành/.test(admin)) fail('Quản trị phải hiển thị điểm vận hành tự động.');
const gas = read('Code.gs');
if (!/function operationalScorecard_\(/.test(gas) || !/result\.operationalScorecard\s*=\s*operationalScorecard_\(/.test(gas)) fail('GAS phải trả bảng điểm tự động từ máy chủ.');
if (!/function writeOperationalScoreSnapshot_\(/.test(gas) || !/SCORE_FORMULA_VERSION/.test(gas) || !/plan\.status !== 'ARCHIVED'/.test(gas)) fail('GAS phải chốt snapshot điểm theo kỳ đóng và version công thức.');
if (!/!U\.isGas\(\)\s*\?\s*ui\.btn\('Chạy hàng đợi'/.test(admin)) fail('Không để admin GAS phải chạy hàng đợi thủ công.');
const screens = read('js/screens.js');
['Kênh chỉ bật khi đủ điều kiện', 'Mẫu gửi khách phải được nhà cung cấp duyệt trước', 'Quy tắc nhận tin và thứ tự kênh', 'Hạn xử lý tính theo giờ làm việc thật'].forEach((copy) => {
  if (admin.includes(copy)) fail('Không giữ banner hướng dẫn ở quản trị: ' + copy);
});
['Đề xuất phân công nhanh', 'Bạn có thể bấm nút hoàn thành', 'Chọn phạm vi rồi bấm Chạy báo cáo', 'Bộ lọc đã đổi. Bấm Chạy báo cáo'].forEach((copy) => {
  if (screens.includes(copy)) fail('Không giữ lời chỉ điểm thao tác: ' + copy);
});
if (/banner\('info'/.test(admin) || /banner\('info'/.test(screens)) fail('Không giữ banner thông tin/hướng dẫn trong giao diện vận hành.');
if (/Khi bấm phân công nhanh/.test(admin) || /Bản trình duyệt không gửi ra ngoài/.test(admin)) fail('Không giữ chú thích thao tác dư thừa trong admin.');

console.log('Operational score and concise admin-copy contract OK');
