# Tồn chỉ tính sau LS tiếp nhận — GAS v88

## Quy tắc

`dailyBacklogKeys` trả danh sách rỗng nếu chưa có `dossier_received_at`. Phân công, gửi hồ sơ hoặc mốc bắt đầu cũ không thay thế mốc LS tiếp nhận. Sau tiếp nhận, phần hợp đồng còn chưa soạn xong được tính tồn; hồ sơ đang chờ làm tiếp hoặc tạm dừng vẫn còn tồn. Phần hợp đồng đã ghi nhận xong cho cán bộ hiện tại hoặc cán bộ cũ tiếp tục được loại khỏi tồn.

Bảng kết quả ngày, ảnh PNG và file Excel dùng chung `dailyMatrix` nên theo cùng quy tắc. Không thêm thao tác tiếp nhận mới, không sửa dữ liệu hồ sơ thật.

## Bằng chứng

- 64 script kiểm tra cục bộ đạt. Có ca kiểm bảng thật: phân công chưa nhận không tăng tồn; nhận hồ sơ tăng tồn HĐ tín dụng/thế chấp; tạm dừng sau nhận vẫn tồn. Ca phân loại kiểm cả hồ sơ vay, cầm cố và việc TSĐB mới.
- Build và prepare-clasp đạt; push 7 file, tạo v88.
- QR deployment `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` và hyperlink deployment `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` đều xác nhận `@88`, URL giữ nguyên.
- `node verify-gas-release-health.mjs 88 --warehouse --receipt-backlog` đạt trên cả hai link: HTTP 200, receipt gate có trong bộ giao diện đang phục vụ, tính năng kho còn đủ marker, XPI Firefox đã ký giữ nguyên 15.089 byte và hash gốc.
- Kết quả: `outputs/gas-v88-firefox-date-health.json`.

Chưa kiểm nghiệp vụ trên tài khoản/hồ sơ thật. Hồ sơ cũ thiếu mốc LS nhận cũng không tính tồn theo quy tắc này; không tự suy đoán mốc từ thời điểm phân công. Rollback nếu cần: cập nhật hai deployment về v87.
