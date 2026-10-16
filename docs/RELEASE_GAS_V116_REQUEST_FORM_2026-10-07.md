# GAS v116 — Biểu mẫu đăng ký và số HĐ thế chấp

Ngày 07/10/2026, hai deployment hiện có được cập nhật lên **Version 116**, giữ nguyên URL:

- [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec)
- [Deployment thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec)

Mã trạng thái `CAN_BO_SUNG` giữ nguyên để bảo toàn quy trình, nhưng nhãn trên hồ sơ đổi thành **Chưa giao hồ sơ**. Biểu mẫu đăng ký có hàng TSBĐ và số HĐ cần soạn cạnh nhau, số HĐ mặc định là 1 khi áp dụng, ngày phát sinh mặc định là hôm nay theo giờ Việt Nam; chọn thứ hoặc ngày khác sẽ thay giá trị đó. Khoản vay dùng TSBĐ có sẵn vẫn không hỏi số HĐ mới.

Số HĐ dự kiến của việc TSBĐ mới đi kèm được chuyển cho LS xem và điền sẵn ở bước soạn HĐ. Trong hộp hoàn thành, LS có thể sửa số thực tế của bước đã tick; GAS lưu số cuối cùng và giữ người, giờ đã ghi nhận. Cán bộ nhận việc không được sửa số của phần đã ghi cho cán bộ khác; Kiểm soát/Quản lý LS có thể điều chỉnh.

## Kiểm tra

- Các hợp đồng `verify-warehouse-steps-contract.mjs`, `verify-workflow-hardening-contract.mjs`, `verify-requested-date-contract.mjs`, `verify-result-flags-contract.mjs`, `verify-mobile-contract.mjs`, `verify-request-catalog-contract.mjs` và `verify-ui-logic-review-contract.mjs` đạt.
- `build-gas.mjs` và `prepare-clasp.mjs` đạt. Nguồn v116 tải ngược từ Apps Script khớp SHA-256 **7/7 file** cục bộ.
- `clasp deployments` xác nhận cả hai ID ở v116. GET chống cache tới cả hai `/exec` trả HTTP 200 và có các dấu hiệu của biểu mẫu mới trong HTML đang phục vụ; [báo cáo kiểm tra](../outputs/gas-v116-app-health.json).
- Chưa chạy luồng nghiệp vụ bằng phiên đăng nhập thật hoặc thay đổi dữ liệu Sheet. Firefox 1.0.1 không nằm trong lượt kiểm tra theo yêu cầu trước đó.

## Quay lui

Bản v114 trước lượt sửa này lưu tại `C:\Users\DELL\AppData\Local\Temp\ls-routing-predeploy-v114-7bd83170b4e4433b80d403d994484f57`. Có thể đưa hai deployment về v114 mà giữ nguyên URL:

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 114
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 114
```

Không commit hoặc push Git trong lượt phát hành này.
