# GAS v123 — bảng cán bộ và việc tồn gọn hơn

Ngày phát hành: 09/10/2026. Mô tả deployment: `LS-Routing 2026-10-09: compact staff workload and categorized backlog`.

v123 cập nhật hai deployment chuẩn tại chỗ, giữ nguyên ID và URL `/exec`:

| Deployment ID | URL `/exec` |
|---|---|
| `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` | [Mở app](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec) |
| `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` | [Mở app](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec) |

Trong “Kết quả & kế hoạch”, Quản lý LS và Kiểm soát LS có nút xem việc đang mở của từng cán bộ. Bảng chỉ giữ hồ sơ, phần việc và tiến độ; tên việc rút còn nhóm + sản phẩm. Dashboard cá nhân LS hiển thị số hồ sơ tồn theo TSĐB, HĐTD, RLOS và Khác. Danh sách chi tiết thu gọn mặc định, vẫn giữ nút bắt đầu, hẹn ký và hoàn thành cho từng việc. Việc vay chưa tiếp nhận vẫn được tính trong nhóm HĐTD/RLOS; một hồ sơ có thể xuất hiện ở nhiều nhóm nếu còn nhiều phần việc.

## Bằng chứng phát hành

- `node build-gas.mjs` và `node prepare-clasp.mjs` đạt; bundle đồng nhất với 8 tệp JS và manifest gồm đúng 7 tệp GAS.
- So với v122, manifest và 5 tệp máy chủ đều không đổi; chỉ `Index.gas.html` đổi. Kéo ngược v123 khớp SHA-256 cả 7/7 tệp: [gas-v123-source-proof.json](<E:/bank routing/LS-Routing/outputs/gas-v123-source-proof.json>); nguồn kéo ngược: `outputs/gas-v123-source-proof/`.
- Hai GET có cache-busting trên URL chuẩn trả HTTP 200 và có marker cho dashboard gọn cùng các sửa đổi LS: [gas-v123-app-health.json](<E:/bank routing/LS-Routing/outputs/gas-v123-app-health.json>).
- 72/72 hợp đồng GAS cục bộ đạt; bài audit gateway 12/12 đạt khi chạy ngoài sandbox. Bài Edge headless xác nhận thao tác chi tiết cán bộ, bốn tổng nhóm việc tồn, nút thao tác, không tràn ngang ở 390/320 px và vùng chạm từ 44 px.

## Quay lui

Nguồn v122 đã được lưu trong `outputs/gas-v122-before-compact/`. Có thể chuyển từng deployment về v122 bằng:

```powershell
clasp deploy -i AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH -V 122 -d "Rollback LS-Routing to v122"
clasp deploy -i AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 -V 122 -d "Rollback LS-Routing to v122"
clasp deployments
```

## Giới hạn xác minh

Chỉ kiểm tra GET công khai, marker giao diện và mã kéo ngược; không đăng nhập, không chạy luồng nghiệp vụ đã xác thực, không đọc hoặc sửa Google Sheets thật và không kiểm tra trigger hay gửi thông báo production. Bộ kiểm tra gói Firefox đã ký nằm ngoài lần phát hành GAS này.
