# GAS v122 — sửa lỗi dashboard, thời gian và việc tồn

Ngày phát hành: 08/10/2026. Mô tả deployment: `LS-Routing 2026-10-08: dashboard, timing, backlog and calendar fixes`.

v122 được phát hành bằng cách cập nhật hai deployment chính đang dùng, giữ nguyên ID và URL. Cả hai chuyển từ v121 sang v122:

| Deployment ID | URL `/exec` |
|---|---|
| `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` | [Mở app](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec) |
| `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` | [Mở app](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec) |

v122 sửa luồng ghi nhận kết quả cá nhân sau khi bàn giao hồ sơ, bảo toàn phần phiên đang chạy khi hiệu chỉnh mốc giờ cũ và đảm bảo một người chỉ có một việc ACTIVE qua các kỳ. Dashboard cập nhật tổng giờ đang chạy mỗi phút. Lịch làm và nghỉ được kiểm tra trước khi lưu ở giao diện lẫn máy chủ. Báo cáo tách SLA tính từ lúc nhận đủ hồ sơ khỏi thời gian toàn trình.

Việc tồn trên dashboard được chia theo loại, gọi rõ là tồn hiện tại và có phím `C` để hoàn thành qua cùng quy tắc quyền/checklist của nút thao tác. Chuyển kỳ giữ ngày dự kiến còn ở tương lai; snapshot cuối kỳ vẫn tính việc chưa hoàn tất sau khi đã sinh dòng chuyển tiếp. Tồn hiện tại được ghi nhãn riêng với kết quả lịch sử theo ngày.

## Bằng chứng phát hành

- `node build-gas.mjs` dựng bundle thành công; `node prepare-clasp.mjs` xác nhận đúng 7 tệp GAS, manifest, quyền và tính đồng nhất bundle.
- SHA-256 của cả 7 tệp trong snapshot phát hành và mã kéo ngược từ GAS khớp nhau: [gas-v122-source-proof.json](<E:/bank routing/LS-Routing/outputs/gas-v122-source-proof.json>).
- Hai GET cache-busted trên URL canonical trả HTTP 200; mỗi phản hồi khoảng 1,032,498 byte. Kiểm tra marker tồn theo loại, phím hoàn thành `C`, số lượng kết quả và phần nguồn dashboard tồn chính xác đều đạt: [gas-v122-personal-backlog-health.json](<E:/bank routing/LS-Routing/outputs/gas-v122-personal-backlog-health.json>) và [gas-v122-app-health.json](<E:/bank routing/LS-Routing/outputs/gas-v122-app-health.json>).
- Các hợp đồng cục bộ về tập trung việc, kết quả cá nhân, thời gian, SLA, chuyển kỳ và báo cáo đều đạt; ba audit probe dùng dữ liệu giả đạt. Edge headless xác nhận ô giờ từ 60 lên 120 phút sau một giờ, lịch đảo bị từ chối và tồn tháng vẫn còn sau chuyển kỳ.

## Quay lui

v121 đã được kéo ngược và lưu tại `outputs/gas-v121-personal-backlog-source`; bằng chứng nguồn trước phát hành nằm ở `outputs/gas-v121-source-proof.json`. Để chuyển từng deployment về v121, chạy tại thư mục dự án:

```powershell
clasp deploy -i AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH -V 121 -d "Rollback LS-Routing to v121"
clasp deploy -i AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 -V 121 -d "Rollback LS-Routing to v121"
clasp deployments
```

## Giới hạn xác minh

Chỉ kiểm tra GET công khai và nội dung phát hành; không đăng nhập, không ghi nghiệp vụ, không đọc hoặc sửa Google Sheets thật và không xác minh giá trị Settings trên production. Luồng có xác thực, trigger, dữ liệu thực và hành vi gửi thông báo cần được đánh giá riêng nếu cần xác nhận đầu-cuối.
