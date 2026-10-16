# Đánh giá toàn dự án LS-Routing — 01/10/2026

## Kết luận

**Đã khắc phục cục bộ phần lớn lỗi có thể tái hiện, nhưng chưa đủ bằng chứng để xác nhận vận hành ổn định trên dữ liệu thật.** Trong 13 phát hiện của baseline, 10 đã có sửa đổi nguồn và hợp đồng hồi quy; 2 lỗi gửi thông báo đã được chặn retry mù nhưng còn thiếu quy trình đối soát thủ công; bản đang phục vụ người dùng vẫn chưa được đồng bộ theo xác minh sau audit. Rủi ro định danh PGD và các bước nghiệm thu trên GAS thật vẫn còn mở.

Đợt rà soát ghi nhận **13 phát hiện: 9 P1 và 4 P2**. Trong đó 12 tình huống được tái hiện bằng mã hiện tại với dữ liệu giả và lỗi được chủ động mô phỏng; một chênh lệch phát hành được xác minh qua `clasp deployments` và GET web app. Đây là bằng chứng về khả năng xảy ra lỗi, không phải khẳng định 12 sự cố đã xảy ra với dữ liệu production.

- **P1:** nên xử lý trước khi phát hành tiếp hoặc mở rộng sử dụng.
- **P2:** cần sửa trong đợt ổn định kế tiếp, có điều kiện kích hoạt cụ thể.
- Chưa xác nhận sự cố P0 hoặc việc dữ liệu thật đã bị lộ/mất.

## Trạng thái xử lý sau audit

| Phát hiện | Trạng thái hiện tại |
| --- | --- |
| A01 — bản GAS đang phục vụ | Còn mở: local đã build, chưa phát hành và xác minh bản mới trên URL chuẩn. |
| A02–A09, A12–A13 | Đã sửa trong workspace; các hợp đồng hồi quy tương ứng đạt. Chưa coi là đã nghiệm thu trên Sheet/dữ liệu thật. |
| A10–A11 — kết quả gửi chưa rõ | Đã chặn tự retry và đánh dấu `CAN_DOI_SOAT`; còn thiếu luồng xử lý/đóng đối soát an toàn cho người vận hành. |
| Định danh PGD | Còn mở theo đánh giá kiến trúc bên dưới. |
| F5 khi lỗi bootstrap | Đã sửa cục bộ: nếu token còn hiệu lực thì giữ phiên và cho thử khôi phục lại; chỉ về form đăng nhập khi token bị xóa/hết hạn. |

Các thay đổi này chưa được triển khai. Manifest đã khai báo Advanced Sheets service cho ghi giao dịch nhiều bảng; dự án Google Cloud gắn với Apps Script vẫn phải bật Google Sheets API nếu là standard project. Không dùng test giả để kết luận đã bật dịch vụ trên production.

## Phạm vi và bằng chứng

Đã xem các thành phần GAS (`Code.gs`, `DataRepository.gs`, `Notifications.gs`, `TimeTracking.gs`, `SetupSheetDB.gs`), giao diện/adapter trong `js/`, CSS và cơ chế dựng bundle, phân quyền sáu nhóm, import user, báo cáo, quy tắc phân công, chuyển tháng, gateway Node, cấu hình triển khai và tài liệu vận hành. Các phần có phát hiện được kiểm tra sâu hơn bằng tình huống chạy mã.

| Kiểm tra | Kết quả tại thời điểm rà soát |
| --- | --- |
| `verify-*.mjs` | 44/44 script đạt sau khắc phục |
| `node --test gateway/test/contract.test.js` | 16/16 test đạt |
| Cú pháp toàn bộ `.gs` và `js/*.js` | Đạt |
| Dựng bundle trong bộ nhớ, so sánh file hiện có | `Index.gas.html` và `TimeTracking.gs` khớp nguồn |
| `git diff --check` | Đạt |
| Tình huống audit ban đầu | 12/12 tái hiện lỗi trên mã baseline |
| Hợp đồng sửa lỗi audit | 12/12 đạt; gồm batch Sheets giả lập nguyên tử, carry chạy bù, dữ liệu carry, mốc SLA, redaction Admin và kết quả gửi chưa rõ |
| Gateway | 16/16 test đạt; kết quả provider chưa rõ không được gọi lại bằng cùng idempotency key |
| Deployment chuẩn tại baseline | `@53`, mô tả `Sua ban giao PGD, toi uu khoa theo dong` |
| GET URL `/exec` tại baseline | HTTP 200; 733.793 byte; còn `dossier-handover` |
| Git | HEAD `156359c`; nhiều cập nhật ứng dụng và test chưa commit |

Các hợp đồng mới bao phủ lỗi ghi giữa chừng, phục hồi chuyển tháng, sửa hồ sơ từ tab cũ, chỉnh giờ nhận, việc kèm, che dữ liệu Admin và retry gửi thông báo. Kết quả atomic batch dùng Sheets API giả lập; việc API có bật và batch chạy trên Sheet thật vẫn chưa được kiểm chứng.

**Giới hạn:** chưa xác minh giao diện desktop/mobile, đăng nhập đủ sáu vai trò, schema Sheet thật, trigger đang chạy, giao nhận email/Zalo/SMS thật, tải nhiều người dùng hay phục hồi từ backup. GET 200 chỉ xác nhận trang được phục vụ. Đợt khắc phục chỉ sửa workspace; không thay hồ sơ thật và không gửi thông báo ra ngoài.

## Phát hiện baseline và trạng thái xử lý

### A01 — P1: Bản đang phục vụ người dùng chưa có luồng rút gọn mới

- **Bằng chứng:** canonical deployment đang là Version 53. HTML trả về vẫn có `dossier-handover`; nguồn và bundle local đã loại bỏ thao tác này, được kiểm tra bởi `verify-simplified-flow-contract.mjs`.
- **Ảnh hưởng:** người dùng mở đúng URL vẫn có thể thấy luồng cũ, trong khi tài liệu/mã mới mô tả tạo → phân công → LS tiếp nhận. README còn ghi Version 51.
- **Xử lý:** chốt một bản phát hành đã xử lý các lỗi P1 liên quan, gắn mã phiên bản/build vào giao diện và cập nhật đúng deployment chuẩn; lưu bằng chứng sau đăng nhập từng vai trò. Không dùng việc build local thành công để kết luận người dùng đã nhận bản mới.
- **Nghiệm thu:** URL chuẩn có build ID dự kiến; tạo hồ sơ ở Phòng/PGD vào hàng chờ phân công; quản lý phân ngay được; LS tiếp nhận mới bắt đầu SLA.

### A02 — P1: Giao dịch nhiều bảng có thể ghi thành công một phần — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [DataRepository.gs:452](../DataRepository.gs), `flushTable_`, `flushAll_` (494), `tx` (539–544).
- **Tái hiện:** sửa WorkItems thành `DANG_THUC_HIEN`, version 2; mô phỏng lỗi khi ghi Events. Hàm trả lỗi nhưng trạng thái/version đã nằm trong Sheet giả, không có sự kiện tương ứng.
- **Nguyên nhân:** các `setValues`/`appendRow` được thực hiện tuần tự; nhánh bắt lỗi chỉ bỏ thay đổi còn trong bộ nhớ. Không hoàn tác các lệnh Sheet đã thành công.
- **Ảnh hưởng:** trạng thái, sự kiện, outbox, sổ hủy hoặc một phần lô phân công có thể lệch nhau. Cơ chế thử lại có thể làm tình trạng khó nhận biết hơn.
- **Khắc phục:** `flushAll_` gửi toàn bộ update/append trong một `Sheets.Spreadsheets.batchUpdate`; Apps Script runtime không có Advanced Sheets service thì dừng an toàn. Manifest khai báo dịch vụ. Test giả lập lỗi xác nhận các bảng đều giữ trạng thái cũ khi batch thất bại.
- **Còn cần nghiệm thu:** bật API trên Google Cloud nếu cần; chạy giao dịch kiểm soát trên bản sao Sheet thật và xác minh rollback nguyên tử trước khi phát hành.

### A03 — P1: Chuyển kỳ lỗi sau khi kích hoạt không tự chạy bù — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:595](../Code.gs), `activateDueMonthlyPlans_`, đặc biệt 617–625.
- **Tái hiện:** kỳ cũ đã `ARCHIVED`, kỳ mới đã `ACTIVE`; bước `carryOpenWorkToPlan_` lỗi. Chạy lại activation không gọi carry lần nữa vì không còn kỳ `SCHEDULED`. Hồ sơ vẫn ở tháng 9 trong khi bootstrap lấy tháng 10.
- **Ảnh hưởng:** hồ sơ đang mở biến mất khỏi danh sách kỳ hiện tại dù vẫn tồn tại trong kho.
- **Khắc phục:** lưu `handoff_from_period_id`/`handoff_status`; kỳ `PENDING` được thử lại và chỉ hoàn tất sau carry. Thứ tự carry ổn định theo tháng.
- **Nghiệm thu cục bộ:** mô phỏng lần carry đầu lỗi, chạy lại thành công; cần chạy thêm trên kho thử thật.

### A04 — P1: Tab cũ vẫn sửa/hoàn thành được bản hồ sơ đã chuyển tháng — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:1283](../Code.gs), `transitionItem` (2441–2455); cần rà cùng nhóm API ghi hồ sơ.
- **Tái hiện:** chuyển hồ sơ tháng 9 sang tháng 10, rồi gửi lệnh hoàn thành từ bản tháng 9 với version 1. Máy chủ chấp nhận; dòng cũ hoàn thành, dòng mới vẫn `DANG_THUC_HIEN`.
- **Nguyên nhân:** carry chỉ ghi `carried_to_item_id`, không tăng version; transition không chặn dòng đã chuyển tiếp/kỳ đã đóng. `correctItemTimes` có chặn riêng, nhưng chặn này chưa áp dụng chung.
- **Ảnh hưởng:** trạng thái, số hoàn thành và thông báo có thể phát sinh trên hai bản của một hồ sơ.
- **Khắc phục:** thêm kiểm tra chung ở transition, chỉnh giờ, thêm việc kèm và tầng ghi WorkItems; từ chối ghi dòng đã carry hoặc thuộc kỳ archive. Carry tăng version dòng cũ.
- **Nghiệm thu cục bộ:** transition từ dòng cũ bị chặn; kiểm thử thao tác mọi vai trò trên nhiều tab vẫn cần chạy ở GAS thật.

### A05 — P1: Carry làm mất ưu tiên, đề nghị chờ duyệt và liên kết cha mới — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:1270](../Code.gs), object tạo WorkItems ở `carryOpenWorkToPlan_`.
- **Tái hiện:** `is_priority=true` không được copy; `pending_json` của đề nghị hủy bị đổi thành rỗng; dòng con tháng mới vẫn trỏ `parent_item_id` tới dòng cha tháng cũ.
- **Ảnh hưởng:** việc ưu tiên mất cờ; đề nghị hủy/sửa biến mất khỏi hàng chờ hiện tại; quan hệ việc chính–việc kèm bị đứt trong kỳ mới và có thể thêm trùng việc kèm.
- **Khắc phục:** carry hai lượt để tạo ánh xạ cha/con trước khi append; giữ ưu tiên và đề nghị đang chờ. Test xác nhận các thuộc tính này.
- **Nghiệm thu cục bộ:** ưu tiên/đề nghị/quan hệ cha-con giữ đúng trong fixture; lịch sử Sheet thật chưa được chuyển thử.

### A06 — P2: Kích hoạt kỳ lấy ngày UTC, trễ 7 giờ so với ngày Việt Nam — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:564](../Code.gs), cùng cách tính tại `activePlan_` (644).
- **Tái hiện:** `2026-10-01 01:00 +07:00` tương ứng `2026-09-30T18:00Z`; `stamp_().substring(0,10)` vẫn là 30/9, trả kỳ tháng 9.
- **Ảnh hưởng:** hồ sơ nhập trong 00:00–06:59 ngày đầu tháng có thể được ghi vào kỳ cũ. Một số chỗ tạo ngày phát sinh như `addLinkedItem` cũng cắt ngày UTC.
- **Khắc phục:** dùng `localBusinessDate_()` và `monthKey_()` với múi giờ `Asia/Ho_Chi_Minh` cho kích hoạt kỳ và ngày tạo việc.
- **Nghiệm thu cục bộ:** test biên `2026-09-30T18:00Z` → ngày/tháng 1/10 theo giờ Việt Nam đạt.

### A07 — P2: LS không sửa được giờ nhận muộn hơn lần bấm tiếp nhận — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:1354](../Code.gs), [js/screens.js:1520](../js/screens.js).
- **Tái hiện:** LS bấm nhận lúc 08:00, muốn sửa nhận thực tế thành 08:30. Bị chặn vì `processing_started_at` và phiên đầu vẫn là 08:00; form chỉ sửa giờ nhận/hoàn thành.
- **Ảnh hưởng:** chức năng chỉnh giờ có tồn tại nhưng không xử lý được tình huống bấm tiếp nhận sớm, đúng trường hợp người dùng cần điều chỉnh.
- **Khắc phục:** nếu phiên xử lý đầu được tự sinh cùng mốc nhận cũ, chỉnh giờ nhận sẽ dời mốc/phiên đó cùng nhau; phiên do cán bộ ghi riêng vẫn giữ nguyên và được kiểm tra thứ tự.
- **Nghiệm thu cục bộ:** test chỉnh giờ muộn và xác nhận phiên tự sinh đi theo mốc nhận; các trường hợp nhiều cán bộ/tạm dừng cần kiểm tra thêm trên bản thử.

### A08 — P1: Thêm việc kèm tự bắt đầu SLA dù LS chưa tiếp nhận — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:2856](../Code.gs), `addLinkedItem` (2872, 2895–2899).
- **Tái hiện:** hồ sơ cha ở `DA_PHAN_CONG`, chưa có giờ nhận. KS thêm việc kèm; dòng con lập tức `DANG_THUC_HIEN`, có giờ nhận, người xác nhận là KS, có deadline và phiên xử lý gán cho LS.
- **Ảnh hưởng:** không thống nhất với luồng mới “LS tiếp nhận mới tính SLA”; có thể tính giờ công LS khi cán bộ chưa nhận hồ sơ đó.
- **Khắc phục:** việc kèm do KS/QL tạo ở trạng thái đã phân công nhưng không có mốc nhận/SLA/phiên; LS tạo khi việc cha đã được nhận mới bắt đầu xử lý ngay.
- **Nghiệm thu cục bộ:** test xác nhận việc do quản lý tạo chờ nhận và không có deadline/phiên.

### A09 — P2: Chỉ số tiếp nhận/phân công vẫn dùng thứ tự mốc của luồng cũ — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [TimeTracking.gs:68](../TimeTracking.gs), nguồn sinh tại `js/core.js`; các cột xuất tại `Code.gs:1040–1065`.
- **Tái hiện:** gửi 07:30, phân 07:45, LS nhận 08:00. `tiep_nhan` tính từ giờ nhận đến giờ accepted trước đó nên ra null; `phan_cong` từ accepted đến assigned cùng một lúc nên ra 0.
- **Ảnh hưởng:** các chỉ số chờ tiếp nhận/phân công và nhãn cột không còn mô tả đúng quy trình mới, dù tổng thời gian xử lý có thể vẫn tính được.
- **Khắc phục:** thống nhất `gửi → phân công`, `phân công → LS nhận`, giờ xử lý theo phiên và toàn trình từ LS nhận; đổi nhãn báo cáo/XLSX tương ứng.
- **Nghiệm thu cục bộ:** case theo giờ làm việc xác nhận hai đoạn độc lập; thiếu mốc trả null thay vì giờ 0.

### A10 — P1: Email đã gửi vẫn bị tự gửi lại nếu lỗi ghi kết quả — ĐÃ CHẶN RETRY MÙ; CÒN ĐỐI SOÁT

- **Vị trí:** [Notifications.gs:660](../Notifications.gs), `runOutbox`; `failClaim_` (644–655).
- **Tái hiện:** gửi MailApp thành công, nhưng `finishClaim_` lỗi lưu Sheet. Chung một khối `try/catch` khiến `failClaim_` đặt tin về `THAT_BAI` và lên lịch retry.
- **Ảnh hưởng:** có thể gửi email hoàn thành/hẹn khách nhiều lần. Cơ chế chống retry mù cho lease email hết hạn đã có, nhưng chưa che phủ nhánh lỗi này.
- **Khắc phục:** MailApp thành công nhưng lưu kết quả lỗi, hoặc lỗi truyền tải không xác định, chuyển `CAN_DOI_SOAT`; không đưa vào retry tự động.
- **Nghiệm thu cục bộ:** mô phỏng lưu lỗi sau khi gửi và xác nhận không gọi MailApp lần hai. Còn thiếu thao tác an toàn để người quản lý đối chiếu/đóng kết quả.

### A11 — P1: Gateway chưa bảo đảm chống trùng khi nhà cung cấp timeout — ĐÃ CHẶN RETRY MÙ; CÒN ĐỐI SOÁT

- **Vị trí:** [gateway/src/server.js:68](../gateway/src/server.js); `store.release` trong catch của `adapter.send`.
- **Tái hiện:** provider giả lập đã nhận tin rồi timeout phản hồi. Gateway xóa khóa; lượt retry cùng idempotency key gọi provider lần hai.
- **Ảnh hưởng:** có thể gửi trùng và tính phí hai lần nếu provider không hỗ trợ chống trùng riêng. Đây là lỗi thiết kế đường retry; chưa xác nhận gateway/kênh thật đang bật trên production.
- **Khắc phục:** gateway giữ idempotency ở `IN_FLIGHT` khi provider hoặc ghi kết quả lỗi; các retry cùng khóa trả kết quả chưa rõ thay vì gọi nhà cung cấp lần nữa. Firestore chỉ đặt TTL sau khi hoàn tất.
- **Nghiệm thu cục bộ:** timeout/provider lỗi không phát sinh lần gọi thứ hai. Còn thiếu giao diện/quy trình đối soát tracking ID và giải phóng khóa chỉ sau xác minh.

### A12 — P1: Bộ lọc dữ liệu Admin còn để lọt thông tin khách qua trường lồng — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:1912](../Code.gs), `sanitizeAdminOutbox_`, `sanitizeAdminItem_` (1924), bootstrap (2111, 2145).
- **Tái hiện:** tên khách trong `pending_json`, nội dung `note`, tên sản phẩm trong `processing_sessions_json` vẫn được trả; nội dung email gửi cán bộ nội bộ vẫn nguyên dù chứa thông tin khách. Chỉ `product_name` cấp ngoài và outbox loại `KHACH` được xóa tương ứng.
- **Ảnh hưởng:** trái với ranh giới đã thiết kế “Admin vận hành, không đọc hồ sơ khách”. Dữ liệu đã xuống trình duyệt dù giao diện không hiện. Đây là phát hiện của **Admin**, không quy kết nhầm cho `GIAM_SAT` vốn có bootstrap riêng.
- **Khắc phục:** sanitizer Admin dùng allowlist cho request/item/event/outbox; bỏ payload JSON, ghi chú provider, người nhận và nội dung khách khỏi DTO. Báo cáo thời gian chỉ trả trường phiên cần thiết.
- **Nghiệm thu cục bộ:** test chèn chuỗi khách giả vào snapshot, session, body và ghi chú provider; DTO Admin không trả các chuỗi này. Cần chạy phân quyền từng vai trò trên GAS thật.

### A13 — P2: Tài khoản còn mật khẩu tạm vẫn sửa được quy tắc phân công — ĐÃ SỬA CỤC BỘ

- **Vị trí:** [Code.gs:3242](../Code.gs), `adminSaveCatalog`.
- **Tái hiện:** `KS_LS` có `must_change_password=true` vẫn lưu thành công một `ASSIGNMENT_RULE`. Nhánh này lấy `currentUser_` trực tiếp, bỏ qua `requireActor_`/kiểm tra bắt đổi mật khẩu.
- **Ảnh hưởng:** một đường ghi cấu hình có thể làm thay đổi phân công tự động trước khi tài khoản hoàn tất bước bảo vệ bắt buộc.
- **Khắc phục:** `adminSaveCatalog` gọi `requireActor_()` trước kiểm tra quyền/ghi danh mục.
- **Nghiệm thu cục bộ:** test mật khẩu tạm không thể sửa quy tắc phân công.

## Đánh giá theo thành phần

| Thành phần | Điểm đã có cơ sở | Việc còn thiếu để xác nhận vận hành |
| --- | --- | --- |
| Luồng hồ sơ | State machine client/server khớp; carry chạy bù, khóa dòng cũ, việc kèm chờ LS nhận; contract đạt | Phát hành luồng mới và chạy thao tác nhiều vai trò trên Sheet thử |
| Phân công | Theo lô, kiểm tra version/người nhận khả dụng; rule theo phòng/loại/sản phẩm; ưu tiên được giữ qua kỳ | Xác nhận atomic batch trên dịch vụ Sheets thật |
| SLA và giờ công | Engine chung frontend/GAS; lịch làm/nghỉ; phiên theo user; report tách gửi→phân công→nhận→xử lý; chỉnh giờ có audit | Đối chiếu số liệu lịch sử và tính giờ trên dữ liệu thử thật |
| Tài khoản | Token riêng từng trình duyệt, hạn 12 giờ; bootstrap lỗi giữ phiên để retry; kiểm tra vai trò server | Chính sách định danh PGD, thu hồi toàn bộ phiên sau đổi/reset mật khẩu, chống thử đăng nhập liên tục |
| Quyền Giám sát | Bootstrap tổng hợp riêng, chặn API ghi, test vai trò đạt | Đăng nhập đầu cuối trên deployment thật và kiểm tra quyền chia sẻ Sheet độc lập |
| Admin | Danh mục, import, bàn giao khi đổi vai trò, cấu hình kênh; DTO allowlist bỏ JSON/ghi chú/email/body khách | Kiểm tra payload và quyền trên deployment thật; hoàn thiện xử lý outbox cần đối soát |
| Import user/liên hệ | Mẫu XLSX thật, cột text, giữ số 0 đầu, kiểm tra email/điện thoại, test đạt | Thử round-trip bằng Excel và import vào bản sao Sheet thực; không dùng test giả thay bằng chứng đó |
| Thông báo | Outbox, lease, retry, idempotency key, worker; kết quả gửi không rõ bị giữ và không tự retry | Quy trình đối soát/đóng trạng thái; kiểm thử provider, hạn mức và cấu hình thật |
| Kho dữ liệu | Atomic `batchUpdate` trong một request, khóa script, đọc lại dòng, cache danh mục; bộ test concurrency đạt | Bật/xác minh Advanced Sheets trên cloud thật; bootstrap vẫn đọc toàn bộ Requests/WorkItems trước lọc kỳ |
| Kế hoạch tháng | Tạo/scheduled/archive/carry, chạy bù `PENDING`, múi giờ VN và quan hệ/ưu tiên được giữ | Chạy carry/migration trên bản sao Sheet thật, đối chiếu tồn và snapshot |
| Backup | Có mã tạo bản sao và ghi dấu vết backup, maintenance | Chưa diễn tập khôi phục, chưa xác minh bản sao hiện hữu/trigger và quyền mở file |
| Giao diện/mobile | Thành phần escape text, CSS responsive, ẩn lịch sử sau nút, test hợp đồng UI | Chưa có quan sát màn hình trực tiếp trong phiên này; không xác nhận hết lỗi hiển thị |
| Release | Bundle local khớp nguồn, cú pháp đạt, canonical URL hoạt động | Build ID, release notes đúng phiên bản, snapshot Git cho release, smoke sau đăng nhập |

## Rủi ro thiết kế và điểm cần chốt

1. **Định danh Phòng/PGD:** manifest cho truy cập `ANYONE_ANONYMOUS`; `authenticateUser` chỉ yêu cầu mật khẩu cho nhóm INTERNAL. Nhánh PGD không buộc đối chiếu tài khoản Google với email liên kết. Ngoài ra bootstrap thông thường trả danh sách `login_code` của Users. Vì vậy mã cán bộ đang đóng vai trò thông tin đăng nhập duy nhất, người biết mã có thể nhận danh tính PGD tương ứng. Đây là lựa chọn nghiệp vụ đã có từ trước, không tự ý đổi trong audit; cần chốt lớp định danh tin cậy (ví dụ Google của tổ chức đã liên kết) nếu tiếp tục giữ trải nghiệm PGD không nhập mật khẩu. Không thử mạo danh tài khoản thật.
2. **Mật khẩu và phiên:** `passwordHash_` dùng SHA-256 trực tiếp; chưa thấy giới hạn số lần thử ở `authenticateUser`. Đổi/reset mật khẩu không thu hồi các token khác của user. Cần chính sách vô hiệu hóa phiên và bảo vệ đăng nhập phù hợp; không in lại mật khẩu khởi tạo trong báo cáo.
3. **F5 lúc máy chủ lỗi:** baseline đưa mọi lỗi bootstrap về form đăng nhập. Đã thêm màn retry; lỗi bootstrap tạm thời giữ token và không giả lập đăng xuất. Contract kiểm tra hành vi này; cần thử trên trình duyệt khi GAS tạm mất kết nối.
4. **Gateway nhiều instance:** khóa refresh ZNS chỉ nằm trong một tiến trình; Firestore chưa khóa việc xoay refresh token giữa các instance. Kho memory vẫn được phép chạy khi mock tắt, chỉ cảnh báo. Chưa nên kết luận gateway sẵn sàng production chỉ từ 16 test mock.
5. **Lịch sử chỉ tiêu:** mã hiện tính gửi → phân công, phân công → LS nhận, phiên xử lý, toàn trình từ LS nhận; giờ chiếm dụng cán bộ được gộp khoảng trùng. Cần đối chiếu với dữ liệu lịch sử và thống nhất cách sửa hồi tố. Không cộng giờ hồ sơ song song thành số giờ thực tế của người dùng.
6. **Khả năng tải:** nhiều đường báo cáo/khởi tạo quét bảng toàn bộ trước khi lọc; khóa ghi là khóa chung dù có tối ưu đọc dòng. Chưa đo đủ để đưa ra số người dùng/hồ sơ tối đa. Cần thử bằng dữ liệu tương đương 6–12 tháng và tải thao tác đồng thời trên môi trường thử.

## Việc còn lại theo thứ tự

1. **Phát hành có kiểm soát:** chốt snapshot đầy đủ các thay đổi có sẵn trong workspace; bật Google Sheets API cho standard Cloud project nếu cần; đồng bộ canonical deployment, gắn build ID và kiểm tra GET. Sau đó đăng nhập thử sáu vai trò trên dữ liệu thử. Chưa phát hành trước khi chốt rủi ro định danh PGD.
2. **Hoàn tất đối soát gửi tin:** thêm thao tác có phân quyền để đối chiếu trạng thái provider/email, ghi người và lý do xử lý, rồi chỉ mở lại retry khi xác minh chắc chắn chưa gửi. Không xóa khóa `IN_FLIGHT`/`CAN_DOI_SOAT` chỉ để chạy lại.
3. **Nghiệm thu trên bản sao Sheet:** kiểm tra batchUpdate nhiều bảng, migration schema, chuyển kỳ chạy bù, chỉnh giờ, thao tác nhiều tab và phân công theo lô. Xác nhận backup có thể khôi phục.
4. **Đóng rủi ro tài khoản và tải:** quyết định định danh PGD, rate limit đăng nhập và thu hồi phiên; sửa trải nghiệm F5 để phân biệt hết phiên với lỗi bootstrap; đo tải tương đương 6–12 tháng dữ liệu và thao tác đồng thời.

Không cần viết lại toàn bộ hệ thống. Các sửa đổi cục bộ xử lý phần lớn lỗi đã tái hiện; bước tiếp theo là hoàn thiện đối soát và nghiệm thu ở môi trường có cùng dịch vụ, schema và quyền như production.

## Cách tái hiện và dấu vết

- [Mã tái hiện](../outputs/audit-2026-10-01/audit-probes.mjs)
- [Kết quả chạy](../outputs/audit-2026-10-01/probe-results.txt)

```powershell
node outputs/audit-2026-10-01/audit-probes.mjs
```

`reproduced: true` nghĩa là **đã quan sát được lỗi**, không phải chức năng đạt nghiệm thu. Script chỉ dùng dữ liệu giả trong bộ nhớ và gateway localhost với provider giả; không gọi Google hay gửi tin thật.

SHA-256 nguồn tại thời điểm audit baseline trước khắc phục:

| File | SHA-256 |
| --- | --- |
| Code.gs | `2464B2C330877E67A9BE1B10C89C1498A1FF29D5E6647386BBFE01D4CBAA0298` |
| DataRepository.gs | `DF867E2A82D1A7EE8835100D0E35626F9BA81650B569934BD6E7320138224501` |
| TimeTracking.gs | `96E88700C8DD1C600AE608EBCD6B052111DC42AF677E8DF56EB5C485004B0DCD` |
| Notifications.gs | `E744168F54053270BB4241EFB3F49B57A4C4A753BEF33CF85B9756F2EC6D8398` |
| Index.gas.html | `C86A3BF8794BA3EF8A65B719AC41BBED0D0BDD4FE6F026A18F2B3E299FACD2AD` |
