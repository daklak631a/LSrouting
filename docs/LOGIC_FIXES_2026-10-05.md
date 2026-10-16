# Sửa logic sau rà soát ngày 05/10/2026

Yêu cầu: sửa các lỗi đã rà soát, không thêm bước xác nhận hoặc nhập liệu bắt buộc cho người dùng. Báo cáo `LOGIC_REVIEW_2026-10-05.md` giữ nguyên bằng chứng của bản trước khi sửa.

## Những lỗi đã sửa

| Mã | Kết quả |
| --- | --- |
| F01–F02 | Bộ lọc mở bình thường; Làm ngay/Làm tiếp nằm trực tiếp trên dòng hồ sơ đã nhận. |
| F03 | Đổi hạn đi qua dispatcher GAS và cơ chế chống ghi lặp, giữ kiểm tra quyền và phiên bản. |
| F04 | Sửa giờ tự loại khoảng trùng với phiên của cùng LS ở hồ sơ khác. Giữ nguyên mốc nhận/hoàn thành và phiên của hồ sơ khác; ghi `overlap_trimmed` trong lịch sử. Không tự gán người làm cho dữ liệu cũ thiếu người. |
| F05 | Mỗi lần chuyển trạng thái có khóa thông báo theo phiên bản; gửi lại cùng lần không sinh tin thứ hai, hẹn lại ở lần mới sinh tin mới. Nhắc quá hạn vẫn dùng giới hạn theo ngày. |
| F06 | Tin đã hủy không thể đưa lại vào hàng đợi bằng RETRY/CONFIRM; hủy xóa token giữ chỗ để worker đang chạy không ghi đè trạng thái hủy. Tin gửi chưa rõ kết quả không được thử lại mù. |
| F07 | Chuyển tháng giữ `due_at_override`, không mất hạn đã chỉnh. |
| F08 | Bootstrap kiểm tra thế hệ ghi, thứ tự lượt đọc và tài khoản. Phản hồi cũ bị bỏ, lượt đọc mới được hẹn tự động. Callback chuyển trạng thái cũ không xóa mốc hoàn thành/phiên mới. |
| F09 | Bộ đếm popup nằm ở server, dùng chung cho tài khoản trên các thiết bị và cả hai deployment. Tối đa 3 lần, được gọi tự động, không cần thao tác mới. Bộ đếm cũ trên trình duyệt vẫn giữ để hạn chế lặp; không thể dựng lại những lượt hiển thị đã xảy ra trước khi có bộ đếm server. |
| F10 | Thông báo kết quả chọn đúng tác giả theo định danh, không lệ thuộc phòng hiện tại và không chọn cả phòng. Tài khoản bị khóa hoặc không còn vai trò Phòng/PGD vẫn không nhận. |
| F11 | Dữ liệu lược cho Admin/Giám sát giữ các khoảng dừng hợp lệ, chỉ gồm timestamp. SLA thống nhất với vai trò vận hành mà không lộ nội dung khách hàng. |

## Bằng chứng kiểm tra

- 59/59 script `verify-*.mjs` đạt, gồm `verify-logic-fixes-contract.mjs` mới.
- 16/16 kiểm tra gateway đạt với provider giả.
- Cú pháp toàn bộ JS/GAS hợp lệ; build và kiểm tra bundle clasp đạt; `git diff --check` đạt.
- Cập nhật năm bộ kiểm tra cũ theo quy trình đã được yêu cầu: hủy trực tiếp, tab mặc định chỉ hồ sơ mở, thanh hồ sơ đang làm, và fixture có phiên ACTIVE đúng nghiệp vụ. Không bỏ kiểm tra phân quyền, lịch sử hủy, tab hồ sơ đóng hoặc tính điểm.
- Bộ kiểm tra nền xác nhận kết quả bước trước không xóa giờ hoàn thành/phiên của bước sau.

## Giới hạn bằng chứng

- Kiểm tra trên dữ liệu giả, không sửa mốc thời gian của hồ sơ sản xuất, không gửi email thật.
- Những phiên cũ chạy song song hoặc chưa xác định người thực hiện không được tự viết lại. Chỉ phiên thuộc hồ sơ đang được sửa được khử trùng; số thời gian chiếm dụng vẫn gộp khoảng trùng trong báo cáo.
- Hoàn thành B không tự coi LS đang làm A. Cơ chế hiện có giữ A trong Chờ làm tiếp và hiển thị nút trên dòng/thanh hồ sơ để chọn đúng việc đang làm.
- Tin đã gọi provider khi đang gửi có thể đã tới người nhận trước khi hủy; thao tác hủy ngăn thử lại, không thể thu hồi tin đó.
- Kiểm tra HTTP và danh sách deployment xác nhận phát hành, không thay thế nghiệm thu sau đăng nhập, Sheet, trigger và email/provider thật.

## Phát hành

Đã đẩy đủ 7 file và phát hành **GAS 82**. Danh sách `clasp deployments` xác nhận cả hai deployment ở `@82`, giữ nguyên URL. Version trước: 81, có thể dùng để rollback.

| Link | Deployment | GET `/exec` tránh cache |
| --- | --- | --- |
| QR / đang dùng | `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` | HTTP 200, 856900 bytes |
| Hyperlink trong tài liệu | `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` | HTTP 200, 856900 bytes |

Cả hai phản hồi có `claimUpdateNotice`, `pendingUpdateNotice`, `refreshSequence`, `latest.epoch` và nút `start-work`. Apps Script mã hóa toán tử `!==` thành `!\x3d\x3d` trong HTML bọc, vì vậy lượt kiểm tra marker lần đầu không khớp chuỗi nguyên văn; kiểm tra lại đoạn mã phục vụ xác nhận guard đã có ở cả hai link.
