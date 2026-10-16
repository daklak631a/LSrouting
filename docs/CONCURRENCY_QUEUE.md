# Nhiều người dùng đồng thời — hàng chờ ghi, chống trùng, đồng bộ nền

Áp dụng từ bản sau Version 51 (`RUNTIME_SCHEMA_VERSION_ = runtime_v52_queue`).
Mục tiêu: 10 người dùng thường xuyên, đỉnh 60 người cùng lúc, không lag, không sinh dòng trùng, hết lỗi HTTP 0 kiểu "báo lỗi nhưng thật ra đã lưu".

## Luồng một cú bấm

1. **Trình duyệt** (`js/gas-api.js`): cập nhật màn hình ngay, rồi xếp lệnh vào **hàng chờ ghi**. Mỗi trình duyệt gửi lần lượt từng lệnh theo đúng thứ tự bấm; lệnh sau chỉ gửi khi lệnh trước đã có kết quả. Nhãn "Đang lưu N thao tác…" hiện ở đáy màn hình.
2. Mỗi lệnh có một **`op_id`** sinh một lần. Gặp HTTP 0, `LS_BUSY` (hết lượt chờ khóa) hay Google báo quá tải, trình duyệt tự gửi lại với **cùng `op_id`**, giãn cách 0,8 → 15 giây và có thêm độ trễ ngẫu nhiên.
3. **Máy chủ** (`api()` trong `Code.gs`): nhận `{name, args, token, op_id}`.
   - `token` là mã phiên của riêng trình duyệt đó, không còn dùng chung một ô UserProperties cho mọi người.
   - `op_id` đã chạy xong thì trả lại kết quả cũ (`replayed: true`), không ghi lần hai. Lần chạy đầu còn đang chạy thì chờ tối đa 20 giây.
4. **Khóa ghi** (`DataRepository.tx`): các lệnh của mọi người lần lượt đi qua khóa, đây là hàng chờ phía máy chủ. Trong khóa chỉ đọc bảng cần dùng, gom mọi thay đổi và ghi xuống Sheet một lần khi giao dịch xong. Lỗi giữa chừng thì không ghi gì.
5. Sau khi ghi, thao tác chỉ **đánh dấu "kỳ cần đồng bộ"** (`markPlanDirty_`). Trigger `planSyncTick_` (5 phút) ghi lại workbook kế hoạch và các tab thời gian, lần lượt từng kỳ, không giữ khóa dữ liệu.

## Sau khi triển khai

- Lượt tải đầu tiên sau deploy tự cài trigger `planSyncTick_`, dọn trigger trùng và xóa ô phiên cũ `LS_AUTH_USER_ID`. Mọi người phải **đăng nhập lại một lần**, vì phiên cũ không còn dùng.
- Sheet kế hoạch tháng và các tab "Thời gian …" **trễ tối đa khoảng 5 phút** so với ứng dụng. Ứng dụng là nguồn dữ liệu gốc.
- Phiên đăng nhập sống 12 giờ. F5 khôi phục đúng người của trình duyệt đó. Phiên hết hạn được dọn mỗi ngày trong `maintenanceTick_`.
- Nhắc quá hạn (QUA_HAN) tối đa 1 lần/ngày cho mỗi hồ sơ và mỗi người nhận.

## Kiểm tra khi có sự cố

| Hiện tượng | Xem ở đâu |
| --- | --- |
| Sheet kế hoạch không cập nhật | Script Properties còn `LS_PLAN_DIRTY_*` lâu? Xem log `Plan sync:` của `planSyncTick_` trong Executions. |
| Người dùng thấy "Đang bận, tự thử lại" kéo dài | Executions có lượt nào chạy lâu giữ khóa (bảng Events/Outbox quá dài, trigger chạy chồng)? |
| Báo "chưa xác nhận được với máy chủ" | Mạng rớt quá khoảng 1 phút. App tự tải lại để đối chiếu; dặn người dùng không nhập lại. |
| Sửa tay Sheet danh mục (Users, Units, WorkTypes…) | App thấy thay đổi sau tối đa 5 phút (cache chia sẻ). Sửa qua màn quản trị thì thấy ngay. |

## Hạn mức Google cần để ý

- Webapp chạy dưới tài khoản triển khai, nên mọi người dùng chung giới hạn **30 lượt chạy đồng thời**. Hàng chờ phía trình duyệt bảo đảm mỗi người chỉ chiếm 1 lượt tại một thời điểm.
- Nếu tài khoản triển khai là Gmail cá nhân, tổng thời gian chạy trigger là 90 phút/ngày. Khi thấy trigger bị dừng giữa ngày, đổi `planSyncTick_` sang `everyMinutes(10)` trong `Notifications.gs`.
