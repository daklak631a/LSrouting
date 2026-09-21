import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (msg) => { throw new Error(msg); };
const server = read('Code.gs');
const setup = read('SetupSheetDB.gs');
const repo = read('DataRepository.gs');
const api = read('js/gas-api.js');
const domain = read('js/domain.js');
const screens = read('js/screens.js');
const admin = read('js/admin.js');

const must = [
  [setup, "'availability_status'", 'Users phải lưu trạng thái nhận việc.'],
  [setup, "'off_from'", 'Users phải lưu ngày bắt đầu nghỉ.'],
  [setup, "'off_to'", 'Users phải lưu ngày kết thúc nghỉ.'],
  [setup, "'replacement_user_id'", 'Users phải lưu cán bộ thay thế.'],
  [repo, "'off_from'", 'DataRepository phải chuẩn hóa ngày nghỉ.'],
  [server, 'function userOff_', 'Máy chủ phải xác định cán bộ đang nghỉ.'],
  [server, 'function userAvailableForAssignment_', 'Máy chủ phải có guard nhận việc.'],
  [server, 'userAvailableForAssignment_(staff && staff.object', 'Không được giao việc trực tiếp cho cán bộ đang nghỉ.'],
  [server, 'replacement_user_id', 'Máy chủ phải nhận cấu hình cán bộ thay thế.'],
  [api, 'availability_status', 'UI phải nhận trạng thái nghỉ từ GAS.'],
  [domain, 'function userOff', 'UI phải có cùng quy tắc hiển thị trạng thái nghỉ.'],
  [screens, 'D.userAvailable', 'Danh sách phân công phải loại cán bộ đang nghỉ.'],
  [screens, 'replacement_user_id', 'Quy tắc phân công phải biết cán bộ thay thế khi người chính nghỉ.'],
  [admin, 'off_from', 'Admin phải chỉnh được ngày nghỉ.'],
  [admin, 'off_to', 'Admin phải chỉnh được ngày kết thúc nghỉ.'],
  [admin, 'replacement_user_id', 'Admin phải chọn được cán bộ thay thế.']
];
for (const [source, needle, message] of must) if (!source.includes(needle)) fail(message);

const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(domain, ctx);
const D = ctx.LS.domain;
const shortLeave = { user_id: 'LS_OFF', role: 'CAN_BO_LS', active: true, availability_status: 'OFF', off_from: '2026-09-20', off_to: '2026-09-22' };
if (!D.userOff(shortLeave, '2026-09-21') || D.userAvailable(shortLeave, '2026-09-21')) {
  fail('Cán bộ nghỉ ngắn ngày phải bị loại khỏi phân công trong khoảng nghỉ.');
}
if (D.userOff(shortLeave, '2026-09-23') || !D.userAvailable(shortLeave, '2026-09-23')) {
  fail('Cán bộ phải nhận việc lại sau ngày kết thúc nghỉ.');
}
const longLeave = { user_id: 'LS_LONG', role: 'CAN_BO_LS', active: true, availability_status: 'OFF' };
if (!D.userOff(longLeave, '2026-09-21')) fail('Nghỉ dài ngày không có ngày kết thúc phải được coi là nghỉ vô thời hạn.');

console.log('Availability contract passed.');
