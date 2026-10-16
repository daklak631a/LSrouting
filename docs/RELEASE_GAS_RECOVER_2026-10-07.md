# GAS v113 — Phục hồi hồ sơ phát sinh hôm nay

Ngày 07/10/2026, cả hai deployment hiện có đã được cập nhật từ Version 112 lên **Version 113**, giữ nguyên URL.

- [Ứng dụng chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec).
- [Ứng dụng thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec).

## Hành vi

Job `autoReturnTick_` tự đưa hồ sơ có ngày phát sinh bằng ngày chạy và trạng thái `CHUA_GIAO_HO_SO` về `CHO_PHAN_CONG`. Hệ thống giữ `last_assignee_id`, tăng version và ghi sự kiện `TU_VAO_PHAN_CONG`. Chạy lại không tăng version hay ghi sự kiện trùng.

Hồ sơ ngày làm việc liền trước chưa được LS tiếp nhận vẫn tự về **Chưa giao hồ sơ**. Đúng người đề nghị Phòng/PGD chọn ngày gửi lại; KS/QL không có nút gửi lại thủ công. Hồ sơ cần bổ sung thật, ngày tương lai và dòng đã chuyển tháng không được phục hồi theo nhánh này. Ngày nghỉ không chạy.

## Lịch chạy và giới hạn

Trigger đang được khai báo hằng ngày khoảng 7h, theo múi giờ `Asia/Ho_Chi_Minh`. Deploy chỉ cập nhật mã; không thực thi job và không xác nhận hồ sơ thật đã đổi trạng thái.

Nhánh phục hồi so ngày phát sinh với ngày job chạy. Hồ sơ bị kẹt sau lượt chạy 7h hôm nay sẽ không còn khớp điều kiện “hôm nay” khi job chạy sáng hôm sau. Muốn xử lý ngay trong ngày cần thực thi riêng `autoReturnTick_` bằng tài khoản quản trị Apps Script. Lần phát hành này không thực thi thao tác đó.

## Kiểm tra và bằng chứng

- 64/64 bộ kiểm tra GAS local đạt; Firefox được loại khỏi phạm vi theo yêu cầu của người dùng.
- Bộ auto-return có 6 ca đạt, bao gồm ngày lễ/cuối tuần, phục hồi hôm nay, chạy lặp, các hồ sơ phải bỏ qua và cấu hình trigger 7h gọi đúng handler.
- Build, kiểm tra cú pháp client/GAS và kiểm tra diff đạt. Clasp 2.4.2 xác nhận thông tin đăng nhập, bundle và các quyền khai báo phù hợp.
- Đã đẩy đúng 7 file, tải lại mã nguồn Version 113 và đối chiếu SHA-256: cả 7 file khớp bản local.
- Danh sách deployment đọc lại xác nhận cả hai ID ở Version 113. Danh sách ngay sau cập nhật từng trả phiên bản cũ; không dựa vào lần đọc đó để chốt phát hành.
- GET chống cache trên cả hai webapp trả HTTP 200. HTML đã giải mã có nhãn sự kiện phục hồi mới và luồng gửi lại chỉ dành cho Phòng/PGD.

Bằng chứng: [kiểm tra local](../outputs/gas-recover-review-2026-10-07-local-checks.json), [deployment và mã băm](../outputs/gas-recover-2026-10-07-release.json), [webapp](../outputs/gas-v113-app-health.json).

Chưa xác minh trigger thực tế hoặc luồng nghiệp vụ bằng tài khoản thật. Không gọi bootstrap, setup hay API ghi hồ sơ để kiểm tra bản phát hành. Không commit/push Git.

## Quay lại v112

Nguồn v112 được lưu theo `RollbackSource` trong báo cáo phát hành. Có thể trỏ từng deployment về v112 bằng `clasp deploy --deploymentId <ID> --versionNumber 112`, giữ nguyên URL. Việc quay lại mã không hoàn tác dữ liệu Sheet.
