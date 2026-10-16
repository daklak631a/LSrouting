# Điện thoại, email và thông báo hoàn thành

Điện thoại, CIF, mã đăng nhập và chat ID là chuỗi. Các lượt thêm/sửa dữ liệu luôn định dạng vùng ghi thành văn bản trước khi ghi Sheet; đồng bộ workbook tháng cũng giữ CIF dạng văn bản. Không dùng kiểu number cho các mã định danh.

Điện thoại Việt Nam có tiền tố +84 được chuẩn hóa về số 0 đầu. Trong cột phone/zalo_phone của kho cũ, dữ liệu dạng số hoặc chuỗi có mẫu di động 9 chữ số (đầu 3/5/7/8/9) hoặc cố định 10 chữ số (đầu 2) được khôi phục số 0 khi đọc. Số khác mẫu không được đoán. Khi nhập mới, chuỗi thiếu số 0 vẫn bị chặn để cán bộ kiểm tra lại; cơ chế khôi phục chỉ dành cho dữ liệu đã lưu trong cột điện thoại. Các chữ số đã mất hoặc bị làm tròn trong CIF dài không thể khôi phục chỉ bằng đổi định dạng.

Email khách hàng và email công vụ được kiểm tra định dạng khi nhập/sửa/import. Email trống vẫn được phép nếu không bật nhận thông báo của đơn vị; không tự điền địa chỉ giả.

## Khi LS hoàn thành

Lựa chọn mặc định: **Email Phòng/PGD và báo trong app**. Email gửi đến user Phòng/PGD đang hoạt động trong cùng đơn vị, gồm người gửi/người tạo hồ sơ và các user được bật **Nhận email hoàn thành của đơn vị**. User của đơn vị khác hoặc đã khóa không nhận. Quy tắc R9 dùng mẫu TPL_DONE_INTERNAL; bổ sung khi migration, không ghi đè cấu hình có sẵn hoặc gửi lại các hồ sơ đã hoàn thành trước triển khai.

Admin → Người dùng: nhập Email công vụ; bật Nhận email hoàn thành của đơn vị cho người phụ trách. Cờ này không dùng làm quyền quản trị và không mở thêm phạm vi xem hồ sơ. Admin → Kênh EMAIL: kiểm tra hộp thư gửi, MailApp, hạn mức và chế độ thử nghiệm/danh sách được phép. Không bật kênh hoặc gửi thư thật trong quá trình kiểm thử bản nâng cấp này.

Mẫu email chứa mã việc, loại việc, khách hàng, cán bộ LS, giờ hoàn thành và lịch hẹn đã lưu theo giờ Việt Nam. Chưa có lịch thì ghi rõ chưa có lịch; hệ thống không tự đặt ngày hẹn. Trước khi bấm hoàn thành, LS thấy danh sách email nhận và lịch hẹn; thiếu email có cảnh báo. Có thể chọn chỉ báo trong app hoặc không gửi.

## Hẹn khách hàng

LS lưu ngày, giờ, nơi hẹn tại thao tác Hẹn khách hàng. Sự kiện DANG_HEN_KH tạo tin khách theo kênh đã chọn, vẫn yêu cầu cán bộ xem trước và xác nhận. Thông báo hoàn thành cho Phòng/PGD không thay thế xác nhận gửi tin cho khách. Email thiếu/không hợp lệ, kênh tạm ngưng hoặc ngoài danh sách thử nghiệm được ghi KHONG_GUI kèm lý do; CHO_GUI chưa phải DA_GUI.

Kiểm chứng: 38 script verify đạt, gồm mô phỏng Sheet làm mất số 0 nếu chưa định dạng; đọc điện thoại cũ dạng số và chuỗi thiếu số 0; kiểm tra GAS và UI cùng chuẩn hóa; đúng người nhận nội bộ; không gửi sang đơn vị khác/user khóa; chống trùng; thiếu email/lịch hẹn; lựa chọn email mặc định trong hộp thoại thật. Kiểm tra thời gian trước/sau xác nhận người xử lý dùng cùng một mốc cố định, không phụ thuộc giờ chạy máy.

Ngày 29/09/2026 đã push 7 file và cập nhật deployment chuẩn lên Version 45. Đăng nhập trực tiếp bằng user demo U001, hồ sơ KHCN2_1/KHCN2_2 hiển thị 0942739739 trong danh sách và chi tiết; ô sửa dùng type tel. Không lưu sửa hồ sơ hoặc gửi thư/tin thật để thử. Email đã được kiểm chứng ở bước chọn người nhận và tạo hàng đợi; chưa xác minh thư đến hộp thư người nhận.

Báo cáo Thời gian & SLA chạy trực tiếp trên Version 45 không lỗi: kỳ 01–29/09/2026 có 4,50 giờ hồ sơ, 0 giờ đã xác định cán bộ, 0 hoàn thành. Dữ liệu cũ còn 5 hồ sơ thiếu giờ nhận và 1 phiên chưa rõ người xử lý; phải xác nhận các mốc/người thực hiện trước khi dùng đánh giá SLA hoặc năng suất cá nhân.

## Email cho cán bộ Phòng/PGD khi hẹn ký (R10)

Khi LS đặt lịch hẹn ký, hệ thống gửi email **"Đã hẹn khách ký hồ sơ"** (mẫu `TPL_APPT_INTERNAL`, quy tắc R10) cho cùng nhóm người nhận với email hoàn thành: người gửi/người tạo hồ sơ và user bật *Nhận email hoàn thành của đơn vị*. Email này luôn đi bằng EMAIL, không theo kênh khách chọn (Zalo/SMS). Khi hồ sơ hoàn thành, email R9 có tiêu đề **"Hồ sơ … đã hoàn thành"**. Migration chỉ bổ sung R10 và đổi lời văn R9 nếu mẫu còn nguyên bản gốc; mẫu Admin đã sửa được giữ nguyên.
