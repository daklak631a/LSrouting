import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const screens = read('js/screens.js');
const api = read('js/gas-api.js');
const app = read('js/app.js');

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
if (!api.includes("write('transitionItem'")) throw new Error('Adapter GAS chưa nối transitionItem.');

// Cửa sổ phân công phải giữ nguyên lựa chọn khi mở phần xem việc của cán bộ.
const loadRowsStart = screens.indexOf('var loadRows = staff.map(function (x) {');
const loadRowsEnd = screens.indexOf("body += '<div class=\"assignment-load-section\">", loadRowsStart);
if (loadRowsStart < 0 || loadRowsEnd <= loadRowsStart) throw new Error('Không tìm thấy danh sách cán bộ trong hộp phân công.');
const assignmentStaffRows = screens.slice(loadRowsStart, loadRowsEnd);
if (assignmentStaffRows.includes('unitName(x.unit_id)')) {
  throw new Error('Danh sách phân công vẫn hiện vị trí/đơn vị sau tên cán bộ.');
}
if (!assignmentStaffRows.includes("ui.btn('Xem việc (' + load.open + ')'") ||
    !assignmentStaffRows.includes("act: 'assignment-staff-work-preview'")) {
  throw new Error('Danh sách phân công chưa có nút xem việc riêng cho từng cán bộ.');
}
if (!app.includes("'assignment-staff-work-preview': function (el) { S.assignmentStaffWorkPreview(el); }")) {
  throw new Error('Nút xem việc trong hộp phân công chưa được nối sự kiện.');
}
if (!screens.includes('function staffOpenWorkItems(userId, sourceItems)') ||
    !screens.includes('D.STATUS[item.status].open && !item.carried_to_item_id')) {
  throw new Error('Phần xem việc phải chỉ liệt kê việc đang mở, chưa được chuyển tiếp.');
}
const openItemsStart = screens.indexOf('function staffOpenWorkItems(userId, sourceItems) {');
const openItemsEnd = screens.indexOf('\n  function ', openItemsStart + 1);
const openItemsCode = screens.slice(openItemsStart, openItemsEnd);
const openItemsContext = { D: { STATUS: {
  DA_PHAN_CONG: { open: true }, DANG_XU_LY: { open: true }, HOAN_THANH_LS: { open: false }
} } };
vm.runInNewContext(openItemsCode + '\nglobalThis.staffOpenWorkItems = staffOpenWorkItems;', openItemsContext);
const visibleOpenItems = openItemsContext.staffOpenWorkItems('ls-1', [
  { item_id: 'open-1', assigned_user_id: 'ls-1', status: 'DA_PHAN_CONG' },
  { item_id: 'done-1', assigned_user_id: 'ls-1', status: 'HOAN_THANH_LS' },
  { item_id: 'carried-1', assigned_user_id: 'ls-1', status: 'DA_PHAN_CONG', carried_to_item_id: 'next-1' },
  { item_id: 'other-user', assigned_user_id: 'ls-2', status: 'DANG_XU_LY' },
  { item_id: 'unknown-state', assigned_user_id: 'ls-1', status: 'UNKNOWN' }
]);
if (visibleOpenItems.map((item) => item.item_id).join(',') !== 'open-1') {
  throw new Error('Danh sách xem việc không lọc đúng cán bộ, việc mở và hồ sơ đã chuyển tiếp.');
}
const previewStart = screens.indexOf('function assignmentStaffWorkPreview(el) {');
const previewEnd = screens.indexOf('\n  function ', previewStart + 1);
const previewCode = previewStart < 0 ? '' : screens.slice(previewStart, previewEnd < 0 ? undefined : previewEnd);
if (!previewCode.includes('staffWorkDetail(userId, { sourceItems: visibleItems(), inlineRow: row })')) {
  throw new Error('Nút xem việc phải dùng toàn bộ việc mở và bung chi tiết dưới đúng dòng cán bộ.');
}
if (previewCode.includes('ui.openDialog(') || previewCode.includes('ui.closeDialog(')) {
  throw new Error('Xem việc không được thay hộp phân công hoặc làm mất lựa chọn đang tick.');
}
const detailStart = screens.indexOf('function staffWorkDetail(userId, options) {');
const detailEnd = screens.indexOf('\n  function ', detailStart + 1);
const detailCode = detailStart < 0 ? '' : screens.slice(detailStart, detailEnd < 0 ? undefined : detailEnd);
if (!detailCode.includes("options.inlineRow.insertAdjacentHTML('afterend'")) {
  throw new Error('Chi tiết việc chưa có nhánh hiển thị nội tuyến trong hộp phân công.');
}

// Parse server để bắt lỗi cú pháp trước khi đẩy lên Apps Script.
vm.runInNewContext(server, {});
console.log('Assignment contract passed.');
