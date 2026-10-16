# GAS v117 — Căn chỉnh biểu mẫu đăng ký việc

Ngày 07/10/2026, hai deployment hiện có được cập nhật lên **Version 117**, giữ nguyên URL:

- [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec)
- [Deployment thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec)

Trong hộp **Đăng ký việc mới**, nút xóa nằm ở đầu mỗi dòng việc. Loại việc và sản phẩm dùng cùng một lưới; tình trạng TSBĐ và số HĐ thế chấp cần soạn thẳng hàng khi số lượng áp dụng. Ngày phát sinh tiếp tục mặc định là hôm nay theo giờ Việt Nam. Chọn **TSBĐ mới** hiện số HĐ mặc định 1; chọn **TSBĐ có sẵn** hoặc **Không có TSBĐ** thì không hỏi số HĐ thế chấp mới. Với **Không có TSBĐ**, cả giao diện và GAS chỉ tính HĐ tín dụng dù tên sản phẩm có chữ TSBĐ.

## Kiểm tra

- Đạt các hợp đồng `verify-warehouse-steps-contract.mjs`, `verify-workflow-hardening-contract.mjs`, `verify-requested-date-contract.mjs`, `verify-mobile-contract.mjs`, `verify-request-catalog-contract.mjs`, `verify-result-flags-contract.mjs`, `verify-ui-logic-review-contract.mjs` và `verify-gas-contract.mjs`.
- Đã xem biểu mẫu trên bản thử cục bộ: hai ô TSBĐ mới thẳng hàng; chuyển sang không có TSBĐ làm ô số HĐ biến mất; không gửi dữ liệu thử lên GAS.
- `clasp deployments` xác nhận cả hai ID ở v117. Nguồn v117 tải ngược từ Apps Script khớp SHA-256 **7/7 file** cục bộ. GET chống cache tới cả hai `/exec` trả HTTP 200 và kiểm tra dấu hiệu biểu mẫu mới đạt; [báo cáo](../outputs/gas-v117-app-health.json).
- Chưa chạy luồng nghiệp vụ bằng phiên đăng nhập thật hoặc thay đổi dữ liệu Sheet. Firefox 1.0.1 không thuộc lượt kiểm tra này.

## Quay lui

Có thể đưa hai deployment về v116 mà giữ nguyên URL:

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 116
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 116
```

Không commit hoặc push Git trong lượt phát hành này.
