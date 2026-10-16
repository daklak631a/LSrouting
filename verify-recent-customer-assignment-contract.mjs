import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const screens = read('js/screens.js');
const admin = read('js/admin.js');
const api = read('js/gas-api.js');

const tables = {
  Requests: [
    { request_id: 'target-cif', cif: ' CIF-001 ', phone: '0912 345 678', customer_name: 'Nguyễn Văn An' },
    { request_id: 'same-cif-a', cif: 'cif-001', phone: '0900 000 000', customer_name: 'Tên khác' },
    { request_id: 'same-cif-b', cif: 'CIF-001', phone: '', customer_name: 'Nguyễn Văn An' },
    { request_id: 'phone-only', cif: '', phone: '+84 912-345-678', customer_name: 'Khác tên' },
    { request_id: 'wrong-cif-same-phone', cif: 'CIF-999', phone: '0912345678', customer_name: 'Nguyễn Văn An' },
    { request_id: 'name-target', cif: '', phone: '', customer_name: 'Khách Không Mã' },
    { request_id: 'name-match', cif: '', phone: '', customer_name: '  KHÁCH   KHÔNG MÃ ' },
    { request_id: 'name-has-phone', cif: '', phone: '0901 111 222', customer_name: 'Khách Không Mã' }
  ],
  WorkItems: [
    { item_id: 'target-item', request_id: 'target-cif', status: 'CHO_PHAN_CONG' },
    { item_id: 'target-name-item', request_id: 'name-target', status: 'CHO_PHAN_CONG' },
    { item_id: 'cif-current', request_id: 'same-cif-a', assigned_user_id: 'ls-a', status: 'HOAN_THANH_LS', completed_at: '2026-10-15T02:00:00.000Z' },
    { item_id: 'cif-prior', request_id: 'same-cif-b', assigned_user_id: 'ls-a', status: 'HOAN_THANH_LS', completed_at: '2026-10-12T02:00:00.000Z' },
    { item_id: 'phone-prior', request_id: 'phone-only', assigned_user_id: 'ls-phone', status: 'HOAN_THANH_LS', completed_at: '2026-10-11T02:00:00.000Z' },
    { item_id: 'week-start', request_id: 'same-cif-a', assigned_user_id: 'ls-week-start', status: 'HOAN_THANH_LS', completed_at: '2026-10-04T18:00:00.000Z' },
    { item_id: 'too-old', request_id: 'same-cif-a', assigned_user_id: 'ls-old', status: 'HOAN_THANH_LS', completed_at: '2026-10-03T18:00:00.000Z' },
    { item_id: 'future', request_id: 'same-cif-a', assigned_user_id: 'ls-future', status: 'HOAN_THANH_LS', completed_at: '2026-10-16T02:00:00.000Z' },
    { item_id: 'not-complete', request_id: 'same-cif-a', assigned_user_id: 'ls-open', status: 'DA_PHAN_CONG', completed_at: '' },
    { item_id: 'carried', request_id: 'same-cif-a', assigned_user_id: 'ls-carried', status: 'HOAN_THANH_LS', completed_at: '2026-10-14T02:00:00.000Z', carried_to_item_id: 'next-item' },
    { item_id: 'conflicting-cif', request_id: 'wrong-cif-same-phone', assigned_user_id: 'ls-conflict', status: 'HOAN_THANH_LS', completed_at: '2026-10-15T01:00:00.000Z' },
    { item_id: 'name-match-item', request_id: 'name-match', assigned_user_id: 'ls-name', status: 'HOAN_THANH_LS', completed_at: '2026-10-13T02:00:00.000Z' },
    { item_id: 'name-phone-item', request_id: 'name-has-phone', assigned_user_id: 'ls-name-phone', status: 'HOAN_THANH_LS', completed_at: '2026-10-13T03:00:00.000Z' }
  ],
  Users: [
    { user_id: 'ls-a', full_name: 'LS A', role: 'CAN_BO_LS', is_active: 'TRUE' },
    { user_id: 'ls-phone', full_name: 'LS Phone', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-week-start', full_name: 'LS Tuần đầu', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-old', full_name: 'LS Cũ', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-future', full_name: 'LS Tương lai', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-open', full_name: 'LS Đang làm', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-carried', full_name: 'LS Chuyển tiếp', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-conflict', full_name: 'LS Sai CIF', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-name', full_name: 'LS Tên', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'ls-name-phone', full_name: 'LS Có SĐT', role: 'CAN_BO_LS', is_active: true },
    { user_id: 'inactive', full_name: 'LS Ngừng', role: 'CAN_BO_LS', is_active: false },
    { user_id: 'manager', full_name: 'Quản lý', role: 'QUAN_LY_LS', is_active: true }
  ]
};

let actingUser = { user_id: 'manager', role: 'QUAN_LY_LS' };
const ctx = {
  DataRepository: { getAll: (name) => tables[name] || [] },
  currentUser_: () => actingUser,
  stamp_: () => '2026-10-15T05:00:00.000Z',
  LSTiming: { dayKey: (value) => new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) }
};
vm.createContext(ctx);
vm.runInContext(server, ctx, { filename: 'Code.gs' });
// Mô phỏng danh tính đã xác thực sau khi định nghĩa các hàm GAS trong context.
ctx.currentUser_ = () => actingUser;
ctx.stamp_ = () => '2026-10-15T05:00:00.000Z';

assert.equal(typeof ctx.getRecentCustomerAssignees, 'function', 'GAS cần API chỉ đọc gợi ý LS từng hoàn thành hồ sơ cùng khách trong tuần này/tuần trước.');
assert.equal(typeof ctx.apiFunctions_().getRecentCustomerAssignees, 'function', 'API gợi ý phải được đăng ký trong gateway.');

const recent = JSON.parse(JSON.stringify(ctx.getRecentCustomerAssignees('target-item')));
assert.deepEqual(recent.map((x) => x.user_id), ['ls-a', 'ls-phone', 'ls-week-start'], 'Khớp CIF/SĐT và sắp theo ngày hoàn thành gần nhất; tuần trước tính từ thứ Hai.');
assert.deepEqual(recent[0], { user_id: 'ls-a', full_name: 'LS A', completed_count: 2, last_completed_at: '2026-10-15T02:00:00.000Z' });
assert.doesNotMatch(JSON.stringify(recent), /"(?:cif|phone|customer_name|request_id|item_id)"\s*:/i, 'Kết quả chỉ trả tổng hợp cán bộ, không trả dữ liệu nhận diện khách hoặc mã hồ sơ.');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.getRecentCustomerAssignees('target-name-item'))).map((x) => x.user_id), ['ls-name'], 'Chỉ dùng tên khớp chính xác khi cả hai hồ sơ thiếu CIF và SĐT.');
actingUser = { user_id: 'staff', role: 'CAN_BO_LS' };
assert.throws(() => ctx.getRecentCustomerAssignees('target-item'), /Không có quyền/, 'Chỉ QL/KS LS được xem gợi ý giao việc.');

assert.doesNotMatch(screens, /Không tính quá hạn \(HĐTC\)/, 'Bảng công việc không còn hiện nhãn miễn quá hạn HĐTC.');
assert.doesNotMatch(admin, /Không tính quá hạn \(HĐTC\)/, 'Bảng bàn giao không còn hiện nhãn miễn quá hạn HĐTC.');
assert.doesNotMatch(server, /Không tính quá hạn \(HĐTC\)/, 'Kết quả SLA xuất Excel không còn hiện nhãn miễn quá hạn HĐTC.');
assert.match(api, /getRecentCustomerAssignees: function \(itemId\) \{ return read\('getRecentCustomerAssignees', itemId\); \}/, 'Adapter GAS phải nối API lịch sử khách hàng.');
assert.match(screens, /LS\.api\.getRecentCustomerAssignees\(item\.item_id\)/, 'Hộp giao việc phải gọi API lịch sử trong GAS.');
assert.match(screens, /recentAssigneesLocal\(item\)/, 'Bản local phải có gợi ý tương ứng từ dữ liệu đang lưu.');

console.log('Recent customer assignment contract passed.');
