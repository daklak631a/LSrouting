# GAS v89 — Chọn ngày theo thứ

## Thay đổi

- Trong Đăng ký việc mới, mỗi dòng có các ô Thứ 2 đến Thứ 6, kèm ngày cụ thể.
- Chọn Tuần này hoặc Tuần sau rồi tick thứ để điền ngày phát sinh. Mỗi dòng chỉ chọn một ngày.
- Đổi tuần giữ nguyên thứ đã chọn và cập nhật ngày tương ứng.
- Lịch và nhập ngày theo DD/MM/YYYY vẫn dùng được; các ô thứ đồng bộ theo ngày nhập. Ngày ngoài hai tuần mặc định hiện thêm tuần tương ứng; Thứ 7/Chủ nhật không đánh dấu ô thứ trong tuần làm việc.
- Ngày ban đầu để trống, cần chọn trước khi gửi, tránh vô tình gửi ngày mặc định.
- Các dòng có nhóm chọn riêng; chọn ngày một dòng không đổi dòng khác.

## Kiểm tra

- 64 tập kiểm tra hợp đồng cục bộ đạt (không gồm probe mạng cần tham số phiên bản).
- Kiểm tra mới trong verify-requested-date-contract.mjs: tuần chuyển năm, ngày không hợp lệ, ngày ban đầu trống, nhóm chọn riêng, chuyển tuần, đồng bộ ngày gõ tay. Các kiểm tra giữ ngày T+1 khi phân công vẫn đạt.
- Giao diện localhost: chọn Thứ 3 điền 06/10/2026; chuyển Tuần sau điền 13/10/2026; gõ 09/10/2026 tự đánh dấu Thứ 6 và Tuần này. Không gửi hồ sơ kiểm tra.
- Ảnh: ../outputs/weekday-selector-preview.jpg.
- node build-gas.mjs và prepare-clasp.mjs đạt; đẩy đủ 7 file GAS.

## Deployment

Cả hai deployment đã cập nhật tại chỗ lên v89, xác nhận bằng clasp deployments:

- QR: AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH.
- Hyperlink: AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2.

GET /exec với tham số tránh cache ở hai link: HTTP 200, có mã chọn thứ, phần tick nhập/xuất kho và điều kiện tồn sau khi nhận hồ sơ. Gói Firefox đã ký giữ nguyên 15.089 byte, SHA256 0b4f3099148cb29c3697a00ac9437435df45c8b75f651398b6d984a06313e995; byte tải về khớp. Feed HTTP từ chối token không hợp lệ.

Bằng chứng máy đọc: ../outputs/gas-v89-firefox-date-health.json.

Kiểm tra trên production giới hạn ở HTTP và bundle; chưa gửi hồ sơ thật hoặc xác minh luồng đăng nhập nghiệp vụ trên production. Kiểm tra giao diện dùng dữ liệu demo cục bộ.
