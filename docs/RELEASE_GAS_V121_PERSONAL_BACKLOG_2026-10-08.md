# GAS v121 — Việc tồn trên dashboard LS

Ngày 08/10/2026, cập nhật hai deployment hiện có từ **v120** lên **v121**, giữ nguyên URL:

- [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec)
- [Ứng dụng thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec)

Dashboard cá nhân hiển thị việc tồn trước báo cáo, chia theo từng loại việc, có số đã nhận, chờ tiếp nhận và quá hạn. Từng dòng có thao tác theo trạng thái: tiếp nhận, bắt đầu/làm tiếp, hẹn ký và hoàn thành. Phím **C** mở hộp hoàn thành của dòng đang chọn; checklist có thể tick ngay trong hộp này. Danh sách tồn và Việc tôi loại dòng cũ đã chuyển tháng để không đếm trùng.

## Phạm vi

Nguồn v120 tải ngược trước phát hành được lưu tại `outputs/gas-v120-before-personal-backlog`. So với bản đó, **chỉ `Index.gas.html` thay đổi**; sáu file còn lại của gói GAS khớp SHA-256. Gói phát hành được cố định tại `outputs/gas-personal-backlog-stage`, kèm manifest và hash từng file.

Không chạy setup, migration, trigger, đăng nhập nghiệp vụ hoặc lệnh ghi dữ liệu hồ sơ thật trong đợt phát hành. Không commit/push Git.

## Bằng chứng

- Build, kiểm tra gói bảy file và hợp đồng việc tồn đạt trước khi đẩy mã. Luồng desktop/mobile, phím C, checklist, đếm kết quả và các bước xử lý đã được kiểm tra cục bộ ở lượt triển khai giao diện.
- `clasp deployments` xác nhận cả hai ID ở **v121**.
- Nguồn v121 tải ngược khớp SHA-256 **7/7 file** với gói cố định: [bằng chứng nguồn](../outputs/gas-v121-source-proof.json).
- GET chống cache tới cả hai `/exec` trả HTTP **200**; đoạn mã các hàm danh sách tồn khớp nguồn phát hành và có dấu hiệu phím C/số lượng kết quả: [bằng chứng trang thực tế](../outputs/gas-v121-personal-backlog-health.json).
- Chưa thử hoàn thành hồ sơ thật sau đăng nhập. Kiểm tra GET và mã nguồn không chứng minh nghiệp vụ hoặc thông báo đã chạy trên dữ liệu thật.

## Rollback về v120

```powershell
clasp deploy --deploymentId AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH --versionNumber 120
clasp deploy --deploymentId AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2 --versionNumber 120
```

Rollback giữ nguyên URL và không thao tác với dữ liệu hồ sơ.
