# Rà logic và giao diện — 29/09/2026

## Các lỗi đã tái hiện và sửa

- Mốc thời gian cũ không hợp lệ làm `timeInput()` ném `Invalid time value`,
  không mở được biểu mẫu sửa giờ. Giờ sai định dạng nay để trống trong biểu mẫu
  để người có quyền xác nhận lại, không tự thay bằng thời điểm hiện tại.
- Nhật ký `SUA_THOI_GIAN` có `before_json`/`after_json` là `null` làm trang lịch
  sử lỗi đọc `dossier_received_at`. Parse từng snapshot riêng, dùng đối tượng
  rỗng khi thiếu/hỏng; chỉ hiển thị thay đổi khi snapshot sau có trường đó.
  Không suy diễn snapshot hỏng thành thao tác xóa giờ cũ.
- Sửa giờ nhận chỉ so với `processing_started_at`, có thể bỏ sót một phiên
  xử lý đã lưu trước mốc đó. Máy chủ nay kiểm tra mọi mốc bắt đầu phiên đã lưu;
  rà soát cũng đánh dấu thứ tự sai và mốc nhận/hoàn thành ở tương lai. Gợi ý
  nhận từ nhật ký được kiểm tra với các phiên trước khi cho xác nhận.
- Màn báo cáo đang tải hoặc bị lỗi vẫn hiện trạng thái “Chưa chạy báo cáo”.
  Trạng thái rỗng chỉ hiện trước lượt chạy đầu, không chồng lên lỗi/loading.

## Câu chữ và bố cục

Bỏ khẩu hiệu và mô tả quảng bá ở đăng nhập; bỏ đoạn giải thích dài ở báo cáo,
phân công theo lô, xác nhận phiên cũ, hồ sơ và tổng quan quản trị. Giữ tên hành
động, trạng thái, lỗi nhập liệu, dấu hiệu thiếu dữ liệu, múi giờ và thông báo
tin đã gửi không thể thu hồi. Nhãn “Thông báo nội bộ” giữ nguyên giá trị gửi
`IN_APP`; không đổi quy tắc gửi hay quyền tài khoản.

Nút xác nhận mốc/người xử lý nằm trong hàng nút để tự xuống dòng. Nhật ký vẫn
ở trang riêng mở bằng “Hoạt động & lịch sử”. Tin gửi đi có thêm thời gian gửi
(hoặc thời gian tạo nếu chưa gửi) để phân biệt các tin có nội dung giống nhau.
Không thay dữ liệu khách hàng,
không sửa lịch sử thực tế hay gửi thông báo trong lượt kiểm tra.

## Kiểm chứng và triển khai

- Các regression trên UI và chronology thất bại trước sửa, đạt sau sửa.
- 36/36 script `verify*.mjs` đạt; bộ cũ kiểm tra chính các vai trò, phân quyền,
  quy trình, SLA, phân trang, báo cáo, đăng nhập và thông báo vẫn đạt.
- Build `Index.gas.html`, cú pháp JS và `git diff --check` đạt.
- Clasp push 7 file thành công; Version 41 chứa các sửa logic/câu chữ, bản bổ
  sung thời gian tin gửi đi là **Version 42** trên cùng deployment. Mốc rollback
  trước lượt rà: Version 40.
- Demo trên Version 41 đã đăng nhập, chạy báo cáo SLA và mở trang lịch sử
  thành công; câu chữ dài đã bỏ, không ghi nhận console error. Cột thời gian
  tin gửi đi được phát hiện thiếu trong lượt kiểm tra này và bổ sung ở Version 42.
- Đã tải lại Version 42, đăng nhập demo và mở trang lịch sử: từng tin có thời
  điểm riêng (24 dòng trong hồ sơ được kiểm tra), không ghi nhận console error.

Không coi kiểm tra local là bằng chứng sửa được mọi dữ liệu cũ hoặc mọi luồng
production. Các mốc thiếu vẫn cần người phụ trách xác nhận từ hồ sơ thực tế.
