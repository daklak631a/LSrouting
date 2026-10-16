# Nguồn đơn vị và sửa chữ giao diện — 05/10/2026

## GBS và GDT

- `SetupSheetDB.gs`, hàm `seedCatalog_`, dòng 666–682: khi bảng Units chỉ có dòng tiêu đề, script nạp danh mục cố định gồm GBS, GDT, các phòng/PGD, LS và hệ thống.
- GBS/GDT được lưu với tên bằng chính mã; `kind=DON_VI_GUI`, `source_tab` bằng mã, `is_active=true`. Mã nguồn không ghi tên đầy đủ hay định nghĩa hai chữ viết tắt.
- `git log --reverse -S "['GBS', 'GBS'" -- SetupSheetDB.gs` xác định danh mục này đã có ở commit `3d83272`, ngày 20/09/2026, `chore: khởi tạo repo LS-Routing`. `git show` xác nhận cả hai dòng trong commit đó.
- Form người dùng lấy các đơn vị đang hoạt động từ bảng Units. Thứ tự trong ảnh khớp danh mục khởi tạo.
- Đây là bằng chứng về nguồn trong mã. Chưa đọc bảng Units/ConfigLog sản xuất, nên chưa xác định tài khoản chạy khởi tạo hoặc người có thể đã sửa danh mục sau đó. Không suy đoán tên đầy đủ hay gán trách nhiệm cho cá nhân từ ảnh.

## Chữ giao diện

Đã bỏ các đoạn hướng dẫn dài trong form người dùng, cấu hình, đăng ký hồ sơ, tiếp nhận, hẹn ký và hoàn thành. Nhãn trường, ràng buộc nhập liệu, lỗi, trạng thái thực tế và hậu quả chuyển hồ sơ đang làm vẫn hiển thị. Không thêm trường hoặc bước xử lý.

Cụ thể: bỏ mô tả đăng nhập Google, hướng dẫn đổi vai trò/bàn giao, câu dài trong ô mật khẩu, chỉ đường menu giao kế hoạch, hướng dẫn chọn sản phẩm/TSBĐ, hướng dẫn tick kết quả, hướng dẫn ghi mốc tiếp nhận và khẩu hiệu “Một hồ sơ, nhiều việc”. Thông tin phân công theo quy tắc được rút còn tên cán bộ. Cảnh báo thiếu email chỉ rõ người tạo đề nghị.

## Kiểm tra và phát hành

- `node --check` hai file JS đạt; build bundle GAS và `git diff --check` đạt.
- Không chạy thêm bộ test trong lượt sửa chữ này.
- Đã đẩy đủ 7 file và phát hành GAS83 lên hai deployment QR và hyperlink hiện có, giữ nguyên URL. Danh sách deployment xác nhận cả hai `@83`.
- GET `/exec` tránh cache: cả hai HTTP200, 854950bytes. HTML được giải mã escape do Google bọc; xác nhận có ô mật khẩu rút gọn, không còn hướng dẫn tiếp nhận/TSBĐ/tick hoàn thành, vẫn giữ bộ đếm popup.
- Chưa đọc nhật ký sản xuất hoặc nghiệm thu form sau đăng nhập. Version82 có thể dùng để rollback.
