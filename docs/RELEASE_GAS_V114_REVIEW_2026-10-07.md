# GAS v114 — Gửi lại hồ sơ, cờ tự trả và số lượng HĐ thế chấp

Ngày 07/10/2026, hai deployment chuẩn được cập nhật lên **Version 114**, giữ nguyên deployment ID và URL:

- Ứng dụng chính: [mở web app](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec).
- Deployment thứ hai: [mở web app](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec).

## Thay đổi

- Gửi lại từ **Cần bổ sung** hoặc **Chưa giao hồ sơ** vẫn yêu cầu đúng người tạo đề nghị chọn ngày. Giao diện chỉ báo thành công sau khi máy chủ xác nhận và đồng bộ lại trạng thái/ngày đã lưu.
- Các cờ `CAN_BO_SUNG` cũ chỉ được tự sửa khi nhật ký có sự kiện `TU_TRA_QLKH` của `SYSTEM`, trạng thái trước là `DA_PHAN_CONG`, trạng thái sau là `CAN_BO_SUNG`, và thời điểm sự kiện khớp `updated_at` của hồ sơ. Việc phát sinh hôm nay về `CHO_PHAN_CONG`; việc của ngày làm việc liền trước về `CHUA_GIAO_HO_SO`. Hồ sơ cần bổ sung thật không đổi.
- Khoản vay chọn **TSBĐ có sẵn** không cần khai số HĐ thế chấp mới. Chọn **TSBĐ mới** vẫn cần số lượng; kiểm tra máy chủ giữ cùng quy tắc.

Job `autoReturnTick_` không được chạy thủ công trong lần phát hành này. Các hồ sơ thật chỉ được rà/sửa khi job lịch trình kế tiếp chạy; hồ sơ có sự kiện không khớp vẫn được giữ nguyên. Không đọc hoặc ghi dữ liệu Sheet để kiểm tra.

## Kiểm tra

- `verify-auto-return-contract.mjs`: 7/7 ca đạt, gồm cờ tự trả cũ có nhật ký khớp, giữ nguyên hồ sơ bổ sung thật, lần chạy lặp và lịch trigger.
- `verify-warehouse-steps-contract.mjs` và `verify-workflow-hardening-contract.mjs` đều đạt; bao gồm gửi lại đúng ngày/đúng phiên bản và hai chế độ TSBĐ có sẵn/mới.
- Build GAS và `prepare-clasp.mjs` đạt. Mã Version 114 tải về khớp SHA-256 **7/7 file** với bundle đã đẩy.
- `clasp deployments` xác nhận cả hai ID chuẩn ở v114. GET chống cache tới cả hai `/exec` trả HTTP 200; kiểm tra bundle sửa lỗi và cờ phục hồi đều đạt.
- Firefox 1.0.1 không được kiểm tra theo yêu cầu. GET không xác minh luồng người dùng đã đăng nhập, trigger thực tế hay kết quả trên từng hồ sơ thật.

Bằng chứng GET: [gas-v114-app-health.json](../outputs/gas-v114-app-health.json). Bản phát hành trước: [GAS v113](RELEASE_GAS_RECOVER_2026-10-07.md).

## Quay lui

Nguồn v113 tải về trước khi phát hành được lưu tại `C:\Users\DELL\AppData\Local\Temp\ls-routing-predeploy-review-20261007-56c3d096923c4ba294f79c99605c2636`.
Để đưa từng deployment về v113 mà vẫn giữ nguyên URL:

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 113
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 113
```

Quay lui mã không hoàn tác dữ liệu Sheet. Không commit/push Git trong lần phát hành này.
