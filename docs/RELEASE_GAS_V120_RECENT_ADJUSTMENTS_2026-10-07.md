# GAS v120 — Các điều chỉnh mới sau v119

Ngày 07/10/2026, hai deployment hiện có được cập nhật từ **v119** lên **v120**, giữ nguyên URL:

- [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec)
- [Ứng dụng thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec)

So với nguồn GAS v119 đã tải ngược, bốn file thay đổi là `Code.gs`, `TimeTracking.gs`, `SetupSheetDB.gs` và `Index.gas.html`; ba file GAS còn lại giữ nguyên. Bản mới cho cán bộ LS ghi **Việc khác** theo loại và số lượng, gắn việc vào lượt tạm dừng toàn bộ và chia thời gian khi kết thúc. Phòng/PGD tạo đề nghị có thể ghi **Hẹn bổ sung** cho hồ sơ đang mở đã giao cán bộ; lịch này không đổi trạng thái hoặc lịch ký LS đã báo. Nhật ký sửa việc ghi rõ giá trị cũ và mới. Giao diện cũng cập nhật tồn theo ngày xem, hồ sơ dời lịch, thao tác sửa nhanh và bảng kết quả cá nhân.

Báo cáo giờ cộng phần làm thêm của phiên đã khép trong cùng ngày, tối đa 4 giờ mỗi phiên/lượt, nhưng không cộng vào SLA. Lượt ngày nghỉ vẫn trừ giờ nghỉ trưa. Việc khác đã hủy chỉ trả kết quả lặp lại cho chính người ghi. Lịch mặc định của hạn xử lý được đồng bộ với lịch báo cáo khi Settings thiếu cấu hình.

Schema mới có bảng `OtherWork` và cột `WorkItems.supplement_json`. Runtime sẽ bổ sung schema khi cần; đợt phát hành này không chạy thủ công `setupSheetDB()`, trigger hoặc thao tác sửa dữ liệu hồ sơ thật.

## Kiểm tra

- `node build-gas.mjs`, `node prepare-clasp.mjs` và **68/68** bài `verify-*.mjs` cục bộ (không gồm Firefox và probe live) đạt. Hai hợp đồng mới xác nhận trừ nghỉ trưa ngày nghỉ và kiểm tra chủ sở hữu trước khi trả kết quả hủy đã lặp.
- `clasp deployments` xác nhận cả hai ID ở **v120**. Nguồn v120 tải ngược từ Apps Script khớp SHA-256 **7/7 file** cục bộ: [bằng chứng nguồn](../outputs/gas-v120-source-proof.json).
- GET chống cache tới cả hai `/exec` trả HTTP **200**, kiểm tra dấu hiệu gói giao diện mới đạt: [bằng chứng webapp](../outputs/gas-v120-app-health.json).
- Chưa kiểm tra luồng nghiệp vụ có đăng nhập trên dữ liệu thật. HTTP 200 và mã khớp không chứng minh trigger, migration hoặc thao tác người dùng đã chạy thành công trong môi trường thật. Firefox 1.0.1 không được kiểm tra lại theo yêu cầu trước đó.

## Quay lại v119

Có thể trỏ hai deployment về v119 mà giữ nguyên URL:

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 119
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 119
```

Quay lại mã không hoàn tác cột hoặc bảng mới nếu runtime đã bổ sung. Không commit hoặc push Git trong lượt phát hành này.
