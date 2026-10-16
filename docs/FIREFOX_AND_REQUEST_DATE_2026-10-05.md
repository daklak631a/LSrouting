# Firefox và giữ ngày KH đề nghị — 05/10/2026

## Kết quả

- GAS **v85**, cập nhật cùng một phiên bản vào hai deployment hiện có, giữ nguyên URL QR và hyperlink.
- Firefox extension **1.0.0**, ZIP và XPI chưa ký tại `outputs/`.
- Link tải chia sẻ: thêm `?download=firefox` vào một trong hai URL `/exec`.

## Ngày đề nghị

Luồng phân công hiện có không trực tiếp ghi đè `occurrence_date`. Các đường mất ngày được xử lý:

1. Đồng bộ lại ô ngày DD/MM/YYYY sang trường ISO trước khi gửi đề nghị; không phụ thuộc việc trình duyệt có phát `input`/`change` khi tự điền.
2. Máy chủ kiểm tra ngày lịch hợp lệ trước khi ghi bất kỳ dòng nào; không tự thay ngày thiếu bằng hôm nay.
3. Việc TSBĐ/việc kèm giữ ngày của hồ sơ chính. Hồ sơ cũ thiếu ngày vẫn giữ trống khi thêm việc kèm, không tự sinh ngày hôm nay.
4. Phản hồi tạo, phân công từng dòng và phân công theo lô trả lại ngày đã lưu. Hộp thoại phân công hiển thị ngày KH đề nghị, riêng với giờ phân công.

Chưa xác định được hồ sơ thật mà người dùng gặp; không sửa hàng loạt ngày lịch sử hoặc khẳng định đã khôi phục hồ sơ đó. Kiểm tra hành vi trên dữ liệu giả lập dùng các hàm máy chủ/giao diện thật: T+1 → tạo → phân công đơn/lô/tự động → tải lại bootstrap, thêm việc kèm; đồng thời tái hiện ô ISO cũ với ô ngày hiển thị T+1.

## Extension

- Chỉ `KS_LS` và `QUAN_LY_LS`.
- Báo số hồ sơ chờ phân công trong kỳ hoạt động; nhiều việc cùng đề nghị tính một hồ sơ.
- Alarm mỗi phút, badge, popup thông báo, bấm mở hàng chờ.
- Đóng tab vẫn kiểm tra khi Firefox chạy và phiên đăng nhập còn hạn. Máy ngủ, mất mạng hoặc Firefox đóng thì không thể kiểm tra đúng mỗi phút.
- Mã riêng chỉ đọc tín hiệu hàng chờ, không dùng được như token API nghiệp vụ. Hết phiên, đăng xuất, khóa user, mất vai trò hoặc còn mật khẩu tạm đều chặn đọc. Không trả tên/CIF/liên hệ khách.
- Không đọc mật khẩu hay gửi mã phiên ứng dụng cho extension. Khai báo `authenticationInfo` vì mã đọc được gửi đến GAS.
- Snapshot lưu cục bộ tránh báo lặp. Phân công một phần không gây báo hồ sơ mới; thêm việc mới khi hồ sơ còn chờ thì báo lại một lần.
- Trang GAS tải ZIP có nội dung và SHA-256 khớp gói kiểm tra cục bộ. Gói không chứa cấu hình clasp/dữ liệu ứng dụng.

## Kiểm tra và triển khai

- `verify-requested-date-contract.mjs`: đạt.
- `verify-firefox-extension-contract.mjs`: đạt; bao gồm server token/role/expiry/revocation, polling, badge/dedup và phục hồi phiên trước khi trạng thái app được nạp.
- `verify-firefox-download-contract.mjs`: đạt, ZIP byte equality và SHA-256.
- Các contract auth, quick assignment, batch assignment, request catalog, linked item, work focus, sheet time, GAS, concurrency queue, notification routing, UI copy và background writes: đạt.
- `web-ext lint --source-dir extension-firefox --output json`: **0 errors, 0 warnings, 0 notices**.
- Build và `prepare-clasp.mjs`: đủ 7 file, bundle khớp, clasp 2.4.2, manifest/scopes sẵn sàng.
- `clasp deployments`: cả hai deployment **@85**.
- Cache-busted GET hai app `/exec`: HTTP 200, **875626 bytes**, có bridge mới và logic ngày mới.
- GET hai trang tải: HTTP 200, **29682 bytes**, có đúng tên gói và SHA-256.
- POST tín hiệu hàng chờ với token không hợp lệ: trả `{ok:false,code:"INVALID"}` trên cả hai deployment.
- Chi tiết HTTP: `outputs/gas-v85-firefox-date-health.json`.

v84 đã sửa logic ngày và bridge nhưng trang tải lỗi do Apps Script loại HTML comment chứa ZIP; v85 chuyển metadata ZIP sang script trong bundle và đã kiểm tra lại trực tiếp.

SHA-256 ZIP/XPI: `a3903259ee369e9ac46e429f4f76d6ce97b6762f0dcbfd9fb80be019abbc2dd6`.

## Giới hạn còn lại

Máy làm việc không có Firefox để thử thông báo hệ điều hành với tài khoản nghiệp vụ thật. Các bài kiểm tra extension dùng fake WebExtension APIs chạy mã thực tế; HTTP probe không chứng minh thao tác đăng nhập/phân công thật.

Gói chưa ký Mozilla. Cài tạm qua `about:debugging` dùng đến khi Firefox khởi động lại. Cài cố định cần chủ tài khoản Mozilla gửi gói ZIP theo kênh **On your own**, tải XPI đã ký để phân phối nội bộ. Chưa gửi gói cho Mozilla, chưa tạo tài khoản hay công bố trên cửa hàng.

## Rollback

Nếu cần, cập nhật cả hai deployment về v83 bằng cùng `--deploymentId` và `--versionNumber 83`; không tạo deployment mới. v83 chưa có extension endpoint/trang tải mới.
