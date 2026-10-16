# Rà soát nhập/xuất kho và phát hành GAS v87

## Kết luận

Logic hiện tại khớp mô tả nghiệp vụ đã gửi: tạm dừng dừng SLA và giờ cán bộ; chuyển làm hồ sơ khác đưa hồ sơ đang làm sang Chờ làm tiếp. Hai dòng nhập/xuất kho tính theo ngày tick, đơn vị tài sản, mỗi việc ghi một tài sản. Máy chủ kiểm quyền, hồ sơ đã tiếp nhận, phiên bản, loại phần việc, thứ tự và tick đủ trước khi hoàn thành. Phần đã ghi cho cán bộ cũ được giữ khi đổi người. Hồ sơ hoàn thành cũ giữ cách đếm cũ.

Thay đổi TSĐB vẫn thuộc nhóm nhập kho theo quy tắc người dùng cung cấp. Không thêm ô số lượng hay thao tác mới trong lần rà này.

## Sửa sau rà soát

1. Tái hiện bằng test GAS chậm: tick HĐ thế chấp rồi tick nhập kho liên tiếp, phản hồi đầu ghi đè toàn bộ credit và xóa dấu nhập kho đang chờ. `recordStepToggle` nay bỏ qua phản hồi cũ khi màn hình đã có phiên bản mới hơn, giữ thao tác chạy nền như cũ.
2. Tick lại giá trị không đổi không gửi lệnh và không tăng phiên bản cục bộ; tránh lệch phiên bản vì máy chủ trả thành công idempotent.
3. Cán bộ nhận bàn giao không được gỡ tick do cán bộ cũ làm qua hàm giao diện; quyền máy chủ vốn đã chặn việc này.
4. Máy chủ kiểm phần bàn giao đúng loại việc; không nhận tick xuất kho cho việc nhập kho hoặc phần kho cho hồ sơ vay.
5. Hai test cũ yêu cầu câu hướng dẫn đã bỏ khỏi giao diện được cập nhật để kiểm ô cán bộ thay thế và nút giao kế hoạch hiện hành. Không đổi các kiểm tra quyền, bàn giao và dữ liệu kế hoạch.

## Kiểm tra

- 64 script `verify-*.mjs` cục bộ đạt, gồm warehouse, handover, role-change, work-plan, SLA/focus, ngày đề nghị, notification và signed Firefox contracts. Loại riêng health script khỏi vòng cục bộ vì nó cần phiên bản và truy cập deployment.
- `node build-gas.mjs`, `prepare-clasp.mjs`, `git diff --check` đạt. Gói XPI ký Mozilla 1.0.0 giữ nguyên byte.
- Đã push 7 file GAS, tạo v87 và cập nhật hai deployment hiện có; URL không đổi. `clasp deployments` xác nhận cả hai `@87`.
- GET chống cache trên cả hai `/exec`: HTTP 200, có marker phần tick, nhập/xuất kho và sửa tick liên tiếp trong bundle đã giải mã.
- Trang tải Firefox trên cả hai URL: HTTP 200; XPI 15.089 byte khớp file gốc và SHA-256 `0b4f3099148cb29c3697a00ac9437435df45c8b75f651398b6d984a06313e995`.
- Feed từ chối token sai. Bằng chứng: `outputs/gas-v87-firefox-date-health.json`, tạo bởi `node verify-gas-release-health.mjs 87 --warehouse`.

## Deployment

| Link | ID | Phiên bản |
| --- | --- | --- |
| QR | `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` | 87 |
| Hyperlink | `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` | 87 |

Nếu cần rollback, cập nhật hai deployment này về v86. Lần rà không chạy thao tác nghiệp vụ trên hồ sơ/tài khoản thật; HTTP và marker bundle không xác nhận thao tác tick, số liệu Sheet hay thông báo trên tài khoản thật.
