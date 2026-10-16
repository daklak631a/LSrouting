# Mẫu nhập danh sách user

Mẫu dùng được ngay trong **Quản trị → Người dùng → Nhập Excel/CSV**: [mau_nhap_users.xlsx](../templates/mau_nhap_users.xlsx). Trong hộp nhập, bấm **Tải mẫu Excel** để tải workbook có sheet `Users` và `Huong dan`. Ứng dụng nhập trực tiếp file `.xlsx`; vẫn nhận CSV/TSV cũ để tương thích.

Mẫu chỉ có hàng tiêu đề, không chứa user giả. Nhập dữ liệu từ dòng kế tiếp, mỗi dòng một user. Các ô được đặt dạng văn bản để không làm mất số 0 đầu ở mã cán bộ, số điện thoại hoặc mã phòng. Ba cột bắt buộc:

| Cột | Cách nhập |
| --- | --- |
| `login_code` | Mã đăng nhập duy nhất. Khi trùng user đã có, dòng đó cập nhật user theo mã này. |
| `full_name` | Họ và tên cán bộ. |
| `unit_id` | Mã đơn vị đã có trong danh mục Người dùng/Đơn vị; nhập mã, không nhập tên hiển thị. |
| `role` | `PHONG_PGD`, `CAN_BO_LS`, `KS_LS`, `QUAN_LY_LS`, `ADMIN`, hoặc `GIAM_SAT`. Để trống thì user cũ giữ vai trò; user mới dùng `CAN_BO_LS` cho `PHONG_LS`, còn lại mặc định `PHONG_PGD`. |
| `linked_email` | Email tài khoản Google liên kết với user; dùng để nhận diện user qua phiên Google. Không trùng email liên kết của user khác. User cũ có thể để trống để giữ email đang dùng. |
| `notification_email` | Email cán bộ nhận thông báo hoàn thành; không trùng email nhận thông báo của user khác. Bỏ trống khi sửa user cũ sẽ giữ email hiện có. Tên cột cũ `email` và `email_cong_vu` vẫn được chấp nhận. |
| `is_active` | `TRUE` hoặc `FALSE`; để trống thì giữ trạng thái user cũ, user mới mặc định `TRUE`. |
| `sort_order` | Số nguyên không âm để sắp xếp; có thể để trống. |
| `zalo_name`, `user_phone` | Tên và số điện thoại cán bộ dùng làm thông tin liên hệ Zalo. Số điện thoại được lưu dạng văn bản, nhập đủ số 0 đầu. Tên cột cũ `zalo_phone`, `phone` và `so_dien_thoai` vẫn được chấp nhận. Bỏ trống khi sửa để giữ thông tin cũ. |
| `receive_completion_email` | `TRUE` hoặc `FALSE`; áp dụng cho user `PHONG_PGD`. Bật `TRUE` cần có email cán bộ. |
| `availability_status` | `AVAILABLE` hoặc `OFF`; user cũ để trống sẽ giữ hiện trạng. |
| `off_from`, `off_to` | Ngày theo `YYYY-MM-DD`; để trống khi không cập nhật lịch nghỉ. |
| `off_reason` | Lý do nghỉ, nếu có. |
| `replacement_user_id` | Mã `user_id` nội bộ của cán bộ LS đang hoạt động, khi cần bàn giao việc đang mở trước lúc khóa/chuyển vai trò LS. |
| `telegram_chat_id` | Chat ID Telegram nếu đã cấu hình. |
| `source_tab` | Nguồn danh sách, có thể để trống. |

Các cột tùy chọn để trống sẽ không xóa dữ liệu đang có của user cũ. Muốn xóa thông tin phụ, mở hồ sơ user và sửa trực tiếp. Không thêm cột mật khẩu vào file; quản trị đặt mật khẩu tạm riêng sau khi nhập. Không điền thông tin mẫu giả rồi quên xóa trước khi nhập.

Ứng dụng kiểm tra mã user/đơn vị/vai trò/email liên kết/email thông báo, số điện thoại, ngày nghỉ, user thay thế và bảo vệ các user LS còn việc mở cùng tài khoản Admin cuối. Email liên kết và email nhận thông báo là hai cột riêng; với tệp cũ chỉ có `email`, ứng dụng tiếp tục dùng giá trị đó cho cả hai để giữ tương thích đăng nhập. Các lỗi dữ liệu được rà hết trước khi bắt đầu ghi. Khi tệp hợp lệ, hệ thống thêm/cập nhật các dòng và ghi nhật ký quản trị.
