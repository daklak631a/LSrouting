# Phát hành bộ đếm kết quả — GAS v119

Đã phát hành ngày 07/10/2026 theo yêu cầu người dùng. Hai deployment hiện có được cập nhật từ v118 lên **v119**, giữ nguyên URL:

| Webapp | Phiên bản | GET sau phát hành |
|---|---:|---|
| [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec) | 119 | HTTP 200, 954536 bytes |
| [Ứng dụng thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec) | 119 | HTTP 200, 954536 bytes |

## Phạm vi và bằng chứng

- Bản sửa gồm các lỗi ghi nhận HĐTD/TSBĐ, tick/bỏ tick, số lượng thực tế, bàn giao và chuyển kỳ đã mô tả trong [báo cáo rà soát](RESULT_COUNT_REVIEW_2026-10-07.md).
- Nguồn v118 tải từ Apps Script trước phát hành chỉ khác mã cục bộ tại `Code.gs` và `Index.gas.html`; năm file GAS còn lại giữ nguyên. Không dùng toàn bộ diff Git cũ để suy ra phạm vi phát hành.
- `prepare-clasp.mjs` đạt kiểm tra bảy file, bundle khớp nguồn, clasp 2.4.2 và cấu hình đăng nhập. Chạy lại bộ 14 tình huống đếm kết quả cùng GAS contract đều đạt.
- `clasp push --force` xác nhận **Pushed 7 files**. Tạo v119 rồi tải ngược nguồn: SHA-256 **7/7 file** khớp cục bộ. [Bằng chứng mã nguồn](../outputs/gas-v119-source-proof.json).
- `clasp deployments` sau cập nhật xác nhận cả hai ID chuẩn cùng `@119`.
- `node verify-gas-release-health.mjs 119 --app-only --result-counting` đạt: GET chống cache cả hai `/exec` trả HTTP 200 và có các dấu hiệu sửa bộ đếm trong HTML đang phục vụ. [Bằng chứng webapp](../outputs/gas-v119-app-health.json).

Kiểm tra HTTP/mã không thay thế kiểm tra nghiệp vụ có đăng nhập. Chưa thực hiện tạo, sửa, hoàn thành hồ sơ thật, gọi bootstrap có đăng nhập hay chạy tác vụ sửa dữ liệu lịch sử trong đợt phát hành này.

Người đang mở ứng dụng cần tải lại trang; trên máy tính có thể dùng Ctrl+F5 để nhận mã giao diện mới.

## Quay lại v118

Nguồn trước phát hành được lưu tại `outputs/gas-v118-result-counting-backup`. Có thể trỏ lại hai deployment về v118:

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 118
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 118
```

Quay lại mã giữ nguyên URL, không hoàn tác dữ liệu Sheet.
