import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const screens = read('js/screens.js');
const api = read('js/gas-api.js');

// GAS phải chấp nhận các kiểu boolean mà Google Sheets/CSV thực tế trả về,
// thay vì chỉ chấp nhận đúng chuỗi "true".
if (!server.includes('function truthy_')) throw new Error('Thiếu bộ đọc cờ hoạt động thống nhất.');
if (!server.includes(".trim().toLowerCase()") || !server.includes("normalized === 'true'")) {
  throw new Error('Bộ đọc cờ hoạt động chưa xử lý giá trị TRUE từ Sheet.');
}
if (!server.includes('userAvailableForAssignment_')) {
  throw new Error('Luồng phân công chưa dùng guard cán bộ khả dụng.');
}
if (!server.includes('if (truthy_(u.must_change_password))')) {
  throw new Error('Cờ bắt buộc đổi mật khẩu chưa dùng cùng bộ đọc boolean.');
}
if (!server.includes("String(user.role || '').trim().toUpperCase() === 'CAN_BO_LS'")) {
  throw new Error('Guard phân công chưa chuẩn hóa vai trò cán bộ LS.');
}

// Nút phân công vẫn phải gửi assignee_id và rollback lỗi máy chủ cho người dùng.
if (!screens.includes('assignee_id: assigneeId') || !screens.includes('expected_version: expected')) {
  throw new Error('Form phân công chưa gửi đủ assignee_id/version.');
}
if (!screens.includes('rollback: function ()')) throw new Error('Luồng phân công thiếu rollback khi máy chủ từ chối.');
if (!api.includes("call('transitionItem'")) throw new Error('Adapter GAS chưa nối transitionItem.');

// Parse server để bắt lỗi cú pháp trước khi đẩy lên Apps Script.
vm.runInNewContext(server, {});
console.log('Assignment contract passed.');
