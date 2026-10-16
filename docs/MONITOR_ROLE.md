# Quyền Giám sát

Mã vai trò: `GIAM_SAT`. Phạm vi: toàn hệ thống, chỉ xem số liệu tổng hợp.

Đã triển khai GAS Version 43 ngày 29/09/2026 trên deployment hiện hữu; Version 42 là mốc quay lại.

Quy tắc hàm nội bộ được xác nhận trong [tài liệu Apps Script của Google](https://developers.google.com/apps-script/guides/html/communication#private_functions).

| Nội dung | Giám sát |
| --- | --- |
| Tổng số việc, hoàn thành, đang mở, hủy, quá hạn của kỳ hiện hành | Xem |
| Tổng hợp theo đơn vị, nghiệp vụ và cán bộ LS | Xem |
| Giờ xử lý mỗi ngày, cán bộ, nghiệp vụ; chất lượng mốc thời gian | Xem |
| Báo cáo nhiều kỳ và xuất số liệu tổng hợp | Xem |
| Tên khách, CIF, liên hệ, chi tiết hồ sơ, lịch sử thao tác | Không |
| Liên kết workbook tháng và dữ liệu Sheet gốc | Không cung cấp |
| Tạo, tiếp nhận, giao việc, xử lý, duyệt, sửa mốc thời gian | Không |
| Cấu hình, quản lý user, gửi tin, bảo trì thủ công | Không |
| Đổi mật khẩu chính mình và đăng xuất | Có |

Admin chọn **Giám sát** tại Quản trị → Người dùng → Thêm/Sửa người dùng. Không tự tạo tài khoản hoặc đổi quyền các tài khoản đang dùng. Khi đổi một cán bộ LS còn việc mở sang Giám sát, vẫn phải chọn cán bộ thay thế; bàn giao và đổi quyền thực hiện trong cùng giao dịch. Import user cũng công nhận `GIAM_SAT`.

Nhóm xác thực được suy ra từ vai trò: PGD là EXTERNAL, các nhóm còn lại là INTERNAL. Dữ liệu auth_group cũ không được dùng để bỏ qua mật khẩu. User nội bộ phải đăng nhập bằng mã và mật khẩu; nhận diện email Google không thay thế bước này. Phiên ứng dụng đọc lại user hiện hành ở mỗi lời gọi để áp dụng ngay việc khóa hoặc đổi quyền.

Giám sát có API bootstrap riêng với danh mục tối thiểu và các bộ đếm. Máy chủ không gửi hồ sơ thô rồi trông cậy vào giao diện ẩn dữ liệu. Báo cáo thời gian xóa tên sản phẩm tự nhập trước khi tổng hợp để tránh mang thông tin khách hàng vào các dòng báo cáo. Các API ghi từ chối Giám sát trước khi mở giao dịch; API lịch sử và rà soát chi tiết không nằm trong quyền của nhóm này.

Các hàm công khai phục vụ cấu hình/bảo trì thủ công yêu cầu Admin. Trigger dùng hàm kết thúc bằng `_`, không gọi được từ `google.script.run`. Lần bootstrap sau triển khai thay các trigger tên cũ bằng tên nội bộ, giữ chu kỳ hiện có và không tạo trùng. Khởi tạo kho từ trình soạn thảo dùng `createStorageWorkbook_()` hoặc `setupSheetDBEditor_()`; các hàm này không mở qua web app.

Giới hạn: quyền ứng dụng không thu hồi quyền Drive/Sheet đã cấp riêng. Nếu tài khoản Giám sát đang được chia sẻ trực tiếp workbook hoặc đã biết một đường dẫn Sheet công khai, cần quản lý quyền Drive độc lập. Bản này không thay đổi chia sẻ các workbook đang vận hành.

Kiểm chứng: `verify-monitor-role-contract.mjs` chạy mã GAS và UI thật trong VM, kiểm tra bootstrap/báo cáo không chứa dữ liệu khách, bắt đăng nhập nội bộ, chặn các API ghi/cấu hình/worker, chặn mở hồ sơ, lựa chọn vai trò trong form Admin, và chuyển trigger không trùng. Bộ kiểm tra toàn dự án có 37 script. Kiểm thử bằng dữ liệu giả lập không thay thế đăng nhập thử bằng tài khoản Giám sát thật.

Kiểm tra sau triển khai: đăng nhập bằng user demo KS_LS do người dùng cấp và chạy báo cáo SLA thành công trên Version 43. Báo cáo trả 4,50 giờ hồ sơ, 0 hoàn thành, 5 hồ sơ thiếu giờ nhận và 1 phiên chưa rõ người xử lý. Không phát sinh lỗi toFixed. Chưa có tài khoản Giám sát thật để xác nhận đăng nhập đầu cuối; chưa tạo hoặc đổi quyền tài khoản nào trên kho thật.
