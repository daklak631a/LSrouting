# Rà soát logic LS-Routing — 05/10/2026

> Đây là bằng chứng rà soát bản 81 trước khi sửa. Kết quả khép các lỗi và phát hành xem tại [LOGIC_FIXES_2026-10-05.md](LOGIC_FIXES_2026-10-05.md).

## Kết luận

**Luồng nghiệp vụ thông thường đã có nền tảng đúng, nhưng bản 81 còn lỗi cần sửa trước khi coi số giờ, SLA và thông báo là ổn định.** Rà soát xác nhận 10 lỗi/thiếu sót: **6 P1 và 4 P2**, cùng một giới hạn của popup. Các tình huống được tái hiện trên mã hiện tại với dữ liệu giả; chưa kết luận chúng đã xảy ra trên hồ sơ thật.

- **P1:** ưu tiên sửa ở đợt ổn định gần nhất; ảnh hưởng chức năng đang dùng hoặc số liệu/thông báo.
- **P2:** lỗi theo điều kiện hoặc thiếu sót giao diện; cần đưa vào kế hoạch sửa.
- Chưa phát hiện bằng chứng P0 trong phạm vi kiểm tra này; điều đó không thay thế nghiệm thu hệ thống thật.

## Phạm vi và bằng chứng

Đã đối chiếu tạo đề nghị, phân công, LS tiếp nhận, nhận vào hàng chờ, chuyển việc A/B, tiếp tục, tạm dừng ngoài, hẹn ký, hoàn thành, hủy, sửa thông tin/giờ/hạn, bàn giao, việc kèm, chuyển tháng, báo cáo, phân quyền, phiên đăng nhập, thông báo, popup, hàng đợi ghi, lưu Sheet và gateway. Mã giao diện, GAS và các hợp đồng liên quan được xem trong workspace hiện tại.

| Kiểm tra | Kết quả |
| --- | --- |
| Các script `verify-*.mjs` hiện có | 53/58 đạt; 5 bộ thất bại cần cập nhật kỳ vọng/fixture và chạy lại |
| Gateway với provider giả | 16/16 test đạt |
| Tái hiện bổ sung | 11/11 tình huống xác nhận bằng chạy mã thực với dữ liệu giả |
| Cú pháp tất cả JS và GAS | Đạt |
| Dựng bundle trong bộ nhớ | `Index.gas.html` và `TimeTracking.gs` khớp nguồn; không ghi lại bundle |
| `git diff --check` | Đạt; có cảnh báo CRLF của README |
| Deployment QR và hyperlink | Cả hai đang `@81`, xác nhận bằng `clasp deployments` |
| GET hai URL `/exec` có tham số mới | HTTP 200; mỗi phản hồi 854.415 byte; có mã focus và đoạn gây lỗi Bộ lọc |

Script tái hiện: [audit-logic-2026-10-05.mjs](<E:/bank routing/LS-Routing/outputs/audit-logic-2026-10-05.mjs>). Chạy từ thư mục dự án: `node outputs/audit-logic-2026-10-05.mjs`. Script không gọi API thật, không gửi tin và không sửa dữ liệu ứng dụng.

**Giới hạn nghiệm thu:** chưa đăng nhập từng vai trò trên production; chưa kiểm tra Sheet/schema/API ghi thật, trigger/backup/khôi phục, provider thật, hoặc tải nhiều người dùng. HTTP 200 chỉ xác nhận trang đang được phục vụ. Rà soát này chỉ thêm script bằng chứng và báo cáo; chưa sửa mã ứng dụng hoặc deploy.

## Các lỗi P1

### F01 — Bộ lọc văng lỗi JavaScript

- **Vị trí:** [screens.js:1203](<E:/bank routing/LS-Routing/js/screens.js:1203>).
- `filterFields(screen, opts)` chứa đoạn tạo nút Làm ngay/Làm tiếp dùng `item` và `id`, nhưng hàm không có hai biến này. Đoạn này cần nằm ở hàm thao tác của từng dòng.
- **Tái hiện:** chạy hàm thật `openFilter('mine')` → `ReferenceError: item is not defined`. Đây là lỗi ở bản đang phục vụ, không chỉ ở fixture kiểm tra.
- **Ảnh hưởng:** mở Bộ lọc tại các màn dùng hàm này thất bại.
- **Sửa/ nghiệm thu:** đưa nút về dòng hồ sơ; mở và áp dụng Bộ lọc cho các màn/vai trò liên quan phải chạy được. Cần test thao tác mở Bộ lọc, không chỉ test dựng bảng.

### F03 — Đổi hạn xử lý không gọi được qua GAS

- **Vị trí:** [Code.gs:419](<E:/bank routing/LS-Routing/Code.gs:419>), [gas-api.js:360](<E:/bank routing/LS-Routing/js/gas-api.js:360>).
- Client gửi `rescheduleItem`; hàm server đã có nhưng thiếu trong `apiFunctions_` và `API_WRITE_`.
- **Tái hiện:** gọi dispatcher thật `api({name:'rescheduleItem',args:[]})` → `Thao tác không hợp lệ: rescheduleItem` trước khi đến kiểm tra quyền của hàm.
- **Ảnh hưởng:** chức năng Đổi hạn cho LS/QLKH không lưu được trên GAS dù local chạy được.
- **Sửa/ nghiệm thu:** đăng ký API đọc/ghi đúng tuyến; đi qua dispatcher để kiểm tra cả quyền chủ hồ sơ, version, lý do và chống gửi lặp.

### F04 — Sửa giờ hoàn thành có thể tạo giờ làm trùng với hồ sơ khác

- **Vị trí:** [Code.gs:1441](<E:/bank routing/LS-Routing/Code.gs:1441>).
- Sửa giờ hoàn thành có thể kéo dài phiên cuối của hồ sơ; chưa kiểm tra các phiên của cùng LS trên hồ sơ khác.
- **Tái hiện:** LS làm A 09:00–10:00, B 10:00–11:00. Sửa A hoàn thành lúc 11:00 được chấp nhận; tổng giờ theo hồ sơ thành **3 giờ**, trong khi thời gian chiếm dụng của cán bộ là **2 giờ**.
- **Ảnh hưởng:** thao tác sửa giờ có thể phá điều kiện một hồ sơ đang làm tại mỗi thời điểm và làm lệch báo cáo nghiệp vụ. Tổng chiếm dụng vẫn gộp khoảng trùng, nhưng không sửa được số giờ của từng hồ sơ.
- **Sửa/ nghiệm thu:** phát hiện xung đột trước khi sửa phiên; yêu cầu điều chỉnh có đối chiếu lịch sử. Cần kiểm tra cả trường hợp đổi giờ nhận làm phiên bắt đầu sớm hơn.

### F05 — Hẹn lại cùng hồ sơ có thể không có thông báo mới

- **Vị trí:** [Notifications.gs:507](<E:/bank routing/LS-Routing/Notifications.gs:507>).
- Khóa chống trùng chỉ gồm hồ sơ, loại sự kiện, đối tượng nhận và người nhận; không phân biệt các lần hẹn/hoàn thành hợp lệ của cùng hồ sơ.
- **Tái hiện:** lần đầu xếp một thông báo hẹn; thay lịch hẹn và tăng version rồi xếp lại → **0 thông báo mới**. Không phụ thuộc email hay trong app vì khóa nằm trước khâu chọn kênh.
- **Ảnh hưởng:** quay lại xử lý rồi hẹn ngày mới vẫn có thể giữ người nhận ở lịch cũ. Hồ sơ mở lại rồi hoàn thành lần nữa cũng dùng lại khóa sự kiện cũ khi không có throttle phù hợp.
- **Sửa/ nghiệm thu:** khóa theo lần chuyển nghiệp vụ/lịch hẹn, đồng thời giữ cùng khóa cho retry của một lần bấm. Test phải bao gồm hẹn lại và mở lại–hoàn thành.

### F06 — Có đường đưa tin chưa rõ kết quả trở lại hàng gửi

- **Vị trí:** [Code.gs:4307](<E:/bank routing/LS-Routing/Code.gs:4307>).
- `CAN_DOI_SOAT` bị chặn gửi lại trực tiếp, nhưng CANCEL đổi nó thành `DA_HUY`; RETRY chấp nhận `DA_HUY` và đưa về `CHO_GUI`.
- **Tái hiện:** API thật với quyền Admin: `CAN_DOI_SOAT → CANCEL → RETRY → CHO_GUI`. Không gọi provider trong thử nghiệm.
- **Ảnh hưởng:** tin có thể đã gửi thành công được gửi lại mà chưa có kết luận đối soát. MailApp không có lớp chống trùng của gateway để ngăn lần gửi này. Không khẳng định đã có email thật bị gửi trùng.
- **Sửa/ nghiệm thu:** giữ dấu kết quả chưa rõ xuyên suốt đổi trạng thái; có thao tác đối soát rõ ràng. Kiểm tra cả hủy/gửi lại tin đã gửi và hủy tin đang được worker giữ claim.

### F11 — SLA báo cáo khác nhau theo vai trò

- **Vị trí:** [Code.gs:2107](<E:/bank routing/LS-Routing/Code.gs:2107>), [Code.gs:1635](<E:/bank routing/LS-Routing/Code.gs:1635>).
- `getTimeReport` dùng `sanitizeAdminItem_` cho Admin/Giám sát. Hàm này giữ phiên xử lý nhưng bỏ `sla_pause_log_json` và `pause_log_json` trước khi tính thời gian.
- **Tái hiện:** hồ sơ nhận 09:00, xong 11:00, có một giờ chờ ngoài 10:00–11:00: dữ liệu đầy đủ tính SLA **1 giờ**, dữ liệu đã lược bớt tính **2 giờ**.
- **Ảnh hưởng:** cùng hồ sơ nhưng KS và Admin/Giám sát thấy SLA trung bình khác nhau; hồ sơ cũ dùng fallback cũng có thể tính giờ khác do thiếu log dừng.
- **Sửa/ nghiệm thu:** tính tổng hợp trước khi lược thông tin khách, hoặc giữ các khoảng dừng cần cho phép tính. Kiểm tra số liệu bằng nhau ở các vai trò có cùng phạm vi.

## Các lỗi/thiếu sót P2

| ID | Điều kiện và bằng chứng | Hướng xử lý |
| --- | --- | --- |
| F02 | [screens.js:1401](<E:/bank routing/LS-Routing/js/screens.js:1401>): bảng Việc được giao không có nút `start-work` cho dòng đã nhận ở QUEUED. Nút ở chi tiết vẫn có; banner làm tiếp chỉ gợi ý hồ sơ WAITING. | Thêm Làm ngay/Làm tiếp ở đúng `actionRow`; kiểm tra dòng thật và màn hình nhỏ. Liên quan trực tiếp đoạn đặt sai tại F01. |
| F07 | [Code.gs:1340](<E:/bank routing/LS-Routing/Code.gs:1340>): chuyển tháng giữ `due_at` nhưng bỏ `due_at_override`. Fixture chuyển tháng xác nhận hạn chỉnh tay mất trường này. Lần tính lại deadline sau đó có thể quay về SLA mặc định. | Copy hạn chỉnh tay và xác nhận giữ nguyên qua chuyển tháng, tiếp tục, đổi người, sửa thông tin. F03 hiện làm người dùng khó tạo override qua UI GAS, nhưng dữ liệu nhập/API trực tiếp hoặc sau khi sửa F03 vẫn bị ảnh hưởng. |
| F08 | [app.js:1042](<E:/bank routing/LS-Routing/js/app.js:1042>): phản hồi bootstrap thay toàn bộ state, không so tuổi phản hồi/version với thao tác đã bắt đầu sau lượt đọc. Tái hiện đọc bắt đầu ở version 1, màn hình đã sang version 2, kết quả cũ trả về kéo lại version 1. | Bỏ phản hồi cũ hoặc hợp nhất dữ liệu theo version; bảo vệ cả callback chuyển trạng thái. Có thể làm màn hình lùi và lệnh tiếp theo lỗi version; chưa có bằng chứng mất dữ liệu server. |
| F10 | [Notifications.gs:186](<E:/bank routing/LS-Routing/Notifications.gs:186>): tác giả chuyển sang đơn vị khác không còn được chọn nhận thông báo vì còn ràng buộc `user.unit_id === request.unit_id`. Probe đổi đơn vị tác giả xác nhận không xếp tin mới. | Nếu nghiệp vụ vẫn yêu cầu gửi tác giả gốc, chọn theo định danh tác giả; dùng đơn vị để kiểm tra lúc tạo. Xử lý riêng tác giả bị khóa/xóa/đổi vai trò. |

## Giới hạn thiết kế và quyết định nghiệp vụ

### F09 — Popup ba lần tính theo tài khoản trong từng trình duyệt

- [app.js:24](<E:/bank routing/LS-Routing/js/app.js:24>) lưu số lần trong localStorage; Admin có thể chọn 1–20 lần, mặc định 3.
- Probe hai kho trình duyệt: kho thứ nhất đã thấy 3 lần, kho thứ hai vẫn có bộ đếm 0. Đổi thiết bị, trình duyệt, xóa lưu trữ hoặc chế độ riêng tư có thể thấy thêm.
- Nếu yêu cầu chỉ là tối đa 3 lần trên trình duyệt đang dùng thì cơ chế hiện tại phù hợp. Nếu yêu cầu đúng 3 lần trên mọi thiết bị của một user, cần bộ đếm ở server và giới hạn cấu hình tương ứng.

### Ghi giờ thực tế

- Cơ chế mới lưu phiên theo timestamp và lịch làm việc. 09:33 → 10:45 trong cùng buổi, không dừng, đúng là **1 giờ 12 phút**.
- Nhận B vào QUEUED không dừng A. Làm B ngay đóng A/mở B cùng mốc; hoàn thành B giữ A ở WAITING và cho bấm làm tiếp.
- Khoảng từ khi xong B đến khi bấm làm tiếp A là khoảng chưa chọn việc; hiện không tự tính cho A. Hệ thống không thể biết LS đang làm thật nếu họ quên bấm hoặc để hồ sơ chạy. Không tự chia thời gian đều cho các hồ sơ.
- Phiên cũ đã chạy song song không được tự viết lại; báo cáo chiếm dụng gộp khoảng trùng. Cần rà hồ sơ cũ riêng và sửa có lịch sử, đặc biệt sau khi khép F04.

### Định danh Phòng/PGD

- Luồng đăng nhập Phòng/PGD bằng mã cán bộ không mật khẩu là quyết định đã có của hệ thống. Việc chọn tác giả theo tài khoản đăng nhập là đúng về mã, nhưng tính chính xác phụ thuộc người dùng đăng nhập đúng tài khoản.
- Cần nghiệm thu riêng nếu dùng cơ chế này để khẳng định ai tạo đề nghị; không coi mã cán bộ là bằng chứng xác thực mạnh chỉ từ việc test phân quyền đạt.

## Những phần đã kiểm tra đạt và cần giữ

- Chuyển việc và tiếp tục cùng cán bộ có phiên riêng, đóng/mở cùng timestamp trong giao dịch có khóa; có kiểm tra người được giao, hồ sơ đã nhận, version và dòng đã chuyển tháng.
- WAITING nội bộ không đổi business status, không dừng SLA; TAM_DUNG/hẹn/chờ bổ sung có log dừng ngoài riêng.
- Bàn giao và việc kèm không tự mở đồng hồ thứ hai; các hợp đồng focus, handover, SLA và báo cáo thời gian đạt trong lượt chạy này.
- Danh sách mặc định ưu tiên hồ sơ còn mở; hoàn thành/hủy có tab riêng. Đề nghị cá nhân và Toàn bộ phòng vẫn tách phạm vi.
- Hủy trực tiếp, có lý do; bootstrap loại thông báo DE_NGHI_HUY cũ khỏi chuông.
- Thông báo hẹn/hoàn thành thông thường chọn tác giả hồ sơ trong đơn vị, không phát cho toàn bộ user phòng. F05/F10 là các ngoại lệ cần khép.
- Tầng kho dùng batch nhiều bảng; có kiểm tra dòng carry/kỳ archive và bỏ thay đổi chưa ghi khi lỗi. Test giả đạt; runtime Sheets API thật còn cần nghiệm thu.
- Admin được lược dữ liệu khách; Giám sát chỉ đọc; báo cáo LS cưỡng chế phạm vi người dùng. Cần giữ phân quyền này khi sửa F11.
- Gateway có xác thực, khóa chống gửi trùng và giữ kết quả provider chưa rõ; 16 test provider giả đạt.

## Năm bộ kiểm tra hiện chưa đạt

| Bộ kiểm tra | Phân loại tại điểm thất bại |
| --- | --- |
| `verify-cancel-bulk-contract.mjs` | Còn kỳ vọng LS không hủy trực tiếp và phải gửi đề nghị chờ duyệt; trái yêu cầu hủy mới. |
| `verify-leader-nav-contract.mjs` | Còn kỳ vọng hồ sơ hoàn thành nằm trong tab mặc định/Tất cả; trái yêu cầu chỉ hồ sơ mở ở màn chính. |
| `verify-operational-score-contract.mjs` | Cấm toàn bộ banner thông tin trừ popup; banner hồ sơ đang làm/chờ làm tiếp mới kích hoạt assertion này. |
| `verify-result-flags-contract.mjs` | Fixture hồ sơ đang xử lý thiếu trạng thái/phiên bắt đầu; cơ chế mới xem là chưa bắt đầu và không mở hộp hoàn thành. Cần tạo fixture qua luồng nhận/làm thật. |
| `verify-workflow-hardening-contract.mjs` | Fixture không có phiên bắt đầu nên bị chặn Làm ngay trước khi đến guard hẹn ký; assertion chỉ mong lỗi hẹn khách. |

Đây là phân loại tại điểm thất bại quan sát được, không khẳng định toàn bộ phần còn lại của năm script sẽ đạt sau sửa fixture. Các lỗi F01/F03/F04/F05/F11 cũng cho thấy số test đạt chưa đủ đại diện cho toàn bộ luồng thật.

## Thứ tự sửa đề xuất và nghiệm thu

1. **Chức năng đang dùng:** F01, F03 và F02 cùng đợt; kiểm tra mở Bộ lọc, nút Làm ngay/Làm tiếp ngoài dòng, Đổi hạn đi qua dispatcher.
2. **Độ tin cậy thời gian:** F04 và F11; kiểm tra sửa giờ không tạo phiên trùng và SLA của cùng hồ sơ nhất quán giữa vai trò. Giữ lịch sử/phiên cũ, không tự gán giờ thiếu.
3. **Thông báo:** F05, F06, F10; test hẹn lại, mở lại–hoàn thành, tác giả chuyển đơn vị và kết quả gửi chưa rõ.
4. **Đồng bộ/chuyển tháng:** F07, F08; test bootstrap trả chậm khi đang ghi và carry có hạn chỉnh tay.
5. Cập nhật các hợp đồng cũ; diễn tập vai trò trên kho thử GAS với nhiều tab/người dùng, lỗi mạng, trigger và provider thử nghiệm. Sau đó phát hành cùng phiên bản trên hai deployment đang dùng và nghiệm thu lại các luồng sau đăng nhập.
