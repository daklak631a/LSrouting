# Rà soát bộ đếm kết quả ngày — 07/10/2026

Phạm vi: nhận/tiếp nhận hồ sơ, hẹn ký, các phần việc TSBĐ, hoàn thành, sửa tick kết quả, bàn giao cán bộ và chuyển kỳ. Kiểm tra bằng máy chủ GAS và giao diện chạy với dữ liệu giả lập. Bản sửa đã [triển khai GAS v119](RELEASE_RESULT_COUNTING_2026-10-07.md); chưa thao tác hồ sơ thật để kiểm tra nghiệp vụ.

## Quy tắc ghi nhận

| Thao tác | Kết quả vào bảng ngày |
|---|---|
| Phân công, LS tiếp nhận hồ sơ | Chưa cộng kết quả soạn hợp đồng. Tồn bắt đầu khi có mốc LS nhận hồ sơ. |
| Hẹn ký việc tín dụng | Ghi một HĐTD cho cán bộ được giao, theo thời điểm LS thao tác hẹn ký. Hoàn thành sau đó không cộng lại. |
| Hoàn thành tín dụng chưa có ghi nhận HĐTD | Ghi một HĐTD tại ngày hoàn thành. RLOS theo tick kết quả. |
| Tín dụng dùng TSBĐ có sẵn/không có TSBĐ | Không tự ghi HĐ thế chấp. Vẫn cho xác nhận phần soạn thêm thực tế nếu có. |
| Tín dụng chọn TSBĐ mới | HĐ thế chấp được ghi tại việc TSBĐ kèm theo. Việc tín dụng chỉ ghi HĐTD/RLOS. |
| Hẹn ký việc TSBĐ | Không tự tick phần soạn HĐ thế chấp. |
| Tick phần soạn HĐ thế chấp của việc TSBĐ | Ghi số lượng thực tế cho người làm, theo ngày tick. Số dự kiến chỉ điền sẵn khi chưa có kết quả. |
| Bỏ tick phần việc TSBĐ | Gỡ kết quả của phần đó. Phải bỏ tick nhập/xuất kho trước khi gỡ phần soạn HĐ thế chấp. |
| Hoàn thành TSBĐ | Yêu cầu đủ các phần việc; giữ số lượng, người làm và ngày đã ghi nhận. Không cộng lại. |
| Bỏ tick HĐ thế chấp của khoản vay cũ đã tự ghi nhận khi hẹn ký | Loại kết quả đó khỏi báo cáo; tick lại khôi phục đúng ngày/người cũ. Phần bàn giao đã ghi cho cán bộ khác được giữ. |

## Lỗi đã sửa

1. TSBĐ có sẵn bị tự cộng HĐ thế chấp khi hẹn ký.
2. TSBĐ mới có thể cộng cùng phần thế chấp ở cả việc tín dụng và việc TSBĐ kèm theo. Bảng ngày cũng loại bản ghi thế chấp trùng tại việc cha cũ có liên kết xác định được.
3. Hẹn ký việc TSBĐ tự ghi một hợp đồng trước khi cán bộ tick phần soạn và khai số thực tế.
4. Kết quả thế chấp tự ghi khi hẹn ký bị ẩn khỏi ô sửa kết quả; bỏ tick không điều chỉnh được số đã tính.
5. Lưu một phần các tick thay thế toàn bộ tick cũ; chuyển kỳ không sao chép tick đã sửa.
6. Số lượng thực tế cũ bị thiếu được giao diện lấy từ số dự kiến, có thể làm số báo cáo tăng khi bấm hoàn thành. Bản ghi thiếu số lượng nay giữ mặc định một, khớp cách báo cáo đang đọc.
7. Bản gốc và bản chuyển kỳ cùng được tính tồn.
8. Kết quả biến mất khi cán bộ ngừng hoạt động, đổi vai trò hoặc không còn trong danh mục. Bảng ngày giữ cột của người có kết quả trong phạm vi xem.
9. Chi tiết có thể báo HĐTD chưa ghi nhận dù đã được tính khi hoàn thành; phần hiển thị nay dùng cùng kết quả có hiệu lực.

## Kiểm chứng

`verify-result-counting-contract.mjs` kiểm tra 14 tình huống xuyên từ thao tác GAS/giao diện tới tổng từng dòng bảng ngày: tiếp nhận, hẹn, hoàn thành, tick/bỏ tick, số thực tế, bấm lặp, bàn giao, chuyển kỳ thật trong kho giả lập, cán bộ ngừng hoạt động, liên kết cha/con cũ, lưu từng phần tick, kết quả khác ngày và mở lại hồ sơ.

Các kiểm tra liên quan: result-flags, warehouse-steps, handover-credit, team-daily, report, month-rollover, linked-item, concurrency-queue, background-writes, simplified-flow, workflow-hardening và request-catalog.

Kết quả: 15 script kiểm tra đều đạt, gồm bộ 14 tình huống mới, 12 bộ liên quan trên, GAS contract và mobile contract. Build `Index.gas.html` thành công; `prepare-clasp.mjs` xác nhận đủ bảy file, bundle khớp nguồn và clasp sẵn sàng. Kiểm tra cú pháp domain/screens đạt. Slop scan không có phát hiện critical/high.

Bảng hiển thị, xuất Excel và xuất ảnh cùng lấy dữ liệu từ `dailyMatrix`. Kiểm tra tổng số hiện thực hiện trên HTML bảng ngày trong môi trường giả lập.

Hai fixture cũ được chỉnh để phân biệt hồ sơ cũ chưa khai chế độ TSBĐ (`''`) với hồ sơ khai rõ không có TSBĐ (`NONE`). Trường hợp `NONE` không có tồn thế chấp để trừ khi bàn giao.

## Giới hạn

Chưa đối soát hồ sơ thật hoặc chạy thao tác có đăng nhập trên GAS đã triển khai. Không có tác vụ sửa/xóa dữ liệu lịch sử. Bản ghi TSBĐ cũ không có nguồn thao tác và số lượng không đủ để suy ra chắc chắn số thực tế; giữ mặc định một cho tới khi cán bộ điều chỉnh. Số tồn là trạng thái hồ sơ đang mở tại lúc xem, không phải ảnh chụp tồn cuối một ngày trong quá khứ.
