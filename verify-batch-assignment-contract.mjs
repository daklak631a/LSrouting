import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const server = read('Code.gs');
const screens = read('js/screens.js');
const api = read('js/gas-api.js');
const app = read('js/app.js');
const admin = read('js/admin.js');

// Phân công theo lô phải là một API nguyên tử, không gọi transitionItem theo
// từng dòng rồi để lại nửa lô đã giao khi một hồ sơ lỗi.
if (!server.includes('function assignWorkItemsBatch(')) {
  throw new Error('Thiếu API phân công theo lô.');
}
if (!server.includes("['CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CHO_PHAN_CONG'].indexOf(item.status) === -1")) {
  throw new Error('API theo lô chưa khóa đúng tập hồ sơ chờ phân công.');
}
if (!server.includes("item.dossier_received_at\n          ? LSTiming.deadline")) {
  throw new Error('API theo lô phải để trống SLA cho tới khi LS ghi nhận nhận đủ hồ sơ.');
}
if (!server.includes("'sla_pause_log_json', 'is_priority'")) {
  throw new Error('Migration runtime phải thêm cột ưu tiên cho WorkItems hiện hữu.');
}
if (!server.includes('Mỗi cán bộ được giao phải là cán bộ LS đang hoạt động.')) {
  throw new Error('API theo lô chưa kiểm tra người nhận từng dòng.');
}
if (!server.includes('expected_version')) {
  throw new Error('API theo lô chưa chống ghi đè khi hồ sơ đã thay đổi.');
}
if (!api.includes("write('assignWorkItemsBatch'")) {
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
if (!screens.includes('data-batch-include') || !screens.includes('data-batch-priority')) {
  throw new Error('Chưa thể chọn nhiều dòng và đánh dấu ưu tiên riêng từng hồ sơ.');
}
if (!screens.includes('function submitBatchAssign(')) {
  throw new Error('Thiếu thao tác xác nhận phân công theo lô.');
}
if (!app.includes("'batch-assign-open'" ) || !app.includes("'batch-assign-submit'")) {
  throw new Error('Nút mở/xác nhận phân công theo lô chưa được nối sự kiện.');
}

const domain = read('js/domain.js');
if (!domain.includes("'assignment-rules'")) throw new Error('Màn cấu hình phân công nhanh chưa được cấp cho KS/Quản lý LS.');
if (!app.includes("case 'assignment-rules': return A.assignmentView();")) throw new Error('Màn cấu hình phân công nhanh chưa được nối vào ứng dụng.');
if (!admin.includes('assignmentView: assignment')) throw new Error('Thiếu view độc lập cho quy tắc phân công.');
if (!server.includes("['ADMIN', 'KS_LS', 'QUAN_LY_LS'].indexOf(caller.role) !== -1")) {
  throw new Error('Máy chủ chưa cấp quyền giới hạn cho KS/Quản lý LS lưu quy tắc.');
}
if (!server.includes("kind === 'catalogOption' && data && data.catalog_key === 'ASSIGNMENT_RULE'")) {
  throw new Error('Quyền KS/Quản lý LS phải chỉ giới hạn trong quy tắc phân công.');
}
if (!server.includes('function autoAssignmentFor(item)') || !server.includes('auto_assign: truthy_(metadata.auto_assign)')) {
  throw new Error('Tạo hồ sơ chưa áp dụng quy tắc tự phân công đã bật.');
}
if (!admin.includes("Tự động giao khi tạo hồ sơ") || !admin.includes('priority_processing')) {
  throw new Error('Thiếu cấu hình tự giao và ưu tiên xử lý.');
}

console.log('Batch assignment contract passed.');
