import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const screens = read('js/screens.js');
const api = read('js/gas-api.js');
const app = read('js/app.js');

// Phân công theo lô phải là một API nguyên tử, không gọi transitionItem theo
// từng dòng rồi để lại nửa lô đã giao khi một hồ sơ lỗi.
if (!server.includes('function assignWorkItemsBatch(')) {
  throw new Error('Thiếu API phân công theo lô.');
}
if (!server.includes("item.status !== 'CHO_PHAN_CONG'")) {
  throw new Error('API theo lô chưa khóa đúng tập hồ sơ chờ phân công.');
}
if (!server.includes('Mỗi cán bộ được giao phải là cán bộ LS đang hoạt động.')) {
  throw new Error('API theo lô chưa kiểm tra người nhận từng dòng.');
}
if (!server.includes('expected_version')) {
  throw new Error('API theo lô chưa chống ghi đè khi hồ sơ đã thay đổi.');
}
if (!api.includes("call('assignWorkItemsBatch'")) {
  throw new Error('Adapter GAS chưa nối API phân công theo lô.');
}

// Danh sách phải lấy từ hàng đợi đã lọc, đề xuất theo quy tắc ưu tiên sẵn có,
// cho phép sửa từng dòng và xác nhận một lần.
if (!screens.includes('function openBatchAssign(')) {
  throw new Error('Thiếu hộp phân công theo lô.');
}
if (!screens.includes('assignmentRecommendation(item)')) {
  throw new Error('Danh sách theo lô chưa dùng quy tắc ưu tiên hiện có.');
}
if (!screens.includes('data-batch-assignee')) {
  throw new Error('Chưa thể đổi cán bộ cho từng dòng trong lô.');
}
if (!screens.includes('function submitBatchAssign(')) {
  throw new Error('Thiếu thao tác xác nhận phân công theo lô.');
}
if (!app.includes("'batch-assign-open'" ) || !app.includes("'batch-assign-submit'")) {
  throw new Error('Nút mở/xác nhận phân công theo lô chưa được nối sự kiện.');
}

console.log('Batch assignment contract passed.');
