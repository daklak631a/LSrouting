/**
 * Hợp đồng về phạm vi quét dữ liệu và lưới an toàn của bộ máy gửi tin.
 *
 * Ba lỗi được chặn ở đây, tất cả đều từng lọt qua toàn bộ contract cũ:
 *
 * 1. Cắt đuôi bảng RỒI mới lọc theo người dùng. Inbox, Events và
 *    NotificationOutbox là bảng dùng chung cả chi nhánh, nên phần đuôi có thể
 *    toàn dòng của người khác và người đang đăng nhập thấy rỗng. Với tin gửi
 *    khách đang chờ xác nhận, điều đó nghĩa là tin kẹt vĩnh viễn: quản trị bị
 *    chặn xác nhận thay.
 *
 * 2. Quét trọn bảng chỉ-thêm trong lúc giữ khóa ghi toàn cục. Bảng chỉ lớn dần,
 *    nên mỗi lần bấm nút và mỗi lượt worker lại chậm thêm cho tới khi thao tác
 *    của người dùng hết hạn chờ khóa.
 *
 * 3. Lưới an toàn không có trigger. reconcile() được viết xong nhưng không nơi
 *    nào gọi, nên tin nghi ngờ vẫn được tính là đã gửi ở màn chi phí.
 */
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const notifications = read('Notifications.gs');
const repository = read('DataRepository.gs');

/** Phải có mặt. */
const required = [
  [repository, 'function tailWhere_', 'DataRepository phải có hàm quét ngược kèm bộ lọc.'],
  [repository, 'tailWhere: tailWhere_', 'tailWhere phải được expose ra ngoài DataRepository.'],
  [repository, 'tailWhere: tailWhere_, invalidate', 'tailWhere phải dùng được bên trong một giao dịch.'],

  [server, "DataRepository.tailWhere('Inbox', 200", 'Hộp thư phải lọc theo người nhận trong lúc quét.'],
  [server, "DataRepository.tailWhere('Events', limit", 'Nhật ký phải lọc theo phạm vi vai trò trong lúc quét.'],
  [server, 'stopWhen: function(e)', 'Nhật ký phải dừng quét khi đã qua đầu khoảng ngày.'],
  [server, "DataRepository.tailWhere('NotificationOutbox', 800", 'Hàng đợi tin của cán bộ phải lọc trong lúc quét.'],
  [server, "t.tailWhere('Events', 1", 'Kiểm tra bấm lặp phải quét ngược một đoạn, không đọc trọn bảng Events.'],
  [server, '!truthy_(n.is_read)', 'Đánh dấu đã đọc phải dùng chung bộ đọc cờ truthy_.'],
  [server, 'Notifications.ensureWorkerTriggers()', 'Kho đã migration vẫn phải được bổ sung trigger nền còn thiếu.'],

  [notifications, "t.tail('NotificationMetrics', 2000)", 'Hạn mức mỗi giờ chỉ được đọc phần đuôi bảng metrics.'],
  [notifications, 'function ensureWorkerTriggers', 'Phải có hàm bổ sung trigger mà không xóa trigger đang chạy.'],
  [notifications, 'reconcileTick_:', 'reconcileTick_ phải nằm trong danh sách trigger nền.'],
  [notifications, 'function reconcileTick', 'Phải có hàm trigger gọi reconcile().'],
  [notifications, 'Notifications.reconcile()', 'reconcileTick phải thực sự gọi reconcile().']
];

/** Không được phép quay lại. */
const forbidden = [
  [server, "DataRepository.tail('Inbox'", 'Hộp thư không được cắt đuôi rồi mới lọc theo người nhận.'],
  [server, "DataRepository.tail('Events'", 'Nhật ký không được cắt đuôi rồi mới lọc theo vai trò.'],
  [server, "t.rows('Events')", 'Không được đọc trọn bảng Events ở đường chuyển trạng thái.'],
  [server, "String(n.is_read) !== 'true'", 'Không được so sánh cờ đã đọc bằng chuỗi phân biệt hoa thường.'],
  [notifications, "t.rows('NotificationMetrics')", 'Không được đọc trọn bảng metrics mỗi lượt worker.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) throw new Error('Thiếu: ' + message + ' (không tìm thấy "' + marker + '")');
}

for (const [source, marker, message] of forbidden) {
  if (source.includes(marker)) throw new Error('Quay lại lỗi cũ: ' + message + ' (còn "' + marker + '")');
}

/* Quét ngược phải có trần, nếu không nó chỉ là đọc trọn bảng viết cách khác. */
if (!/maxScan/.test(repository)) throw new Error('tailWhere phải có trần maxScan.');
if (!/exhausted/.test(repository)) throw new Error('tailWhere phải báo khi chạm trần quét để biết cần lưu trữ bớt.');

console.log('Scan bounds contract passed.');
