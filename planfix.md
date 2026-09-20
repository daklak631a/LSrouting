# LS-Routing — kế hoạch sửa lỗi và đưa Email/ZBS/SMS chạy thật

## Mục tiêu

Hoàn thiện app GAS theo đúng phân quyền và luồng nghiệp vụ đã rà soát, bảo đảm dữ liệu khách hàng không lộ sai quyền, Email/ZBS/SMS có contract gửi thật, hàng đợi tự chạy, và toàn bộ page/role có kiểm thử nghiệm thu.

Phạm vi chỉ là app và kho dữ liệu do app tạo. **Không sửa workbook mẫu Google Sheet**; app chỉ đọc mẫu để copy workbook tháng mới. Guard công thức chỉ chạy trên bản copy tháng mới.

## Baseline đã xác nhận

- `build-gas.mjs`, `verify-gas-contract.mjs`, `verify-storage-schema.mjs`, `verify-monthly-plan-flow.mjs` đang đạt.
- Schema hiện có 17 bảng; Admin có 16 mục con.
- Baseline lỗi đã ghi nhận: Admin bootstrap lộ trường khách hàng; SMS chưa có channel thật; lựa chọn kênh hẹn khách bị bỏ qua ở server; ZBS chỉ gọi gateway tổng quát nhưng gateway chưa cấu hình được; Gmail API còn stub; outbox trigger còn cài thủ công; `sign_place` bị backend bỏ qua; README đã cũ.

## Đã triển khai trong lượt này

- Admin bootstrap đã che trường khách hàng, event chi tiết và recipient/body khách trong hàng đợi.
- Email chốt MailApp; ZBS và SMS tách riêng, tôn trọng kênh hẹn khách; gateway nhận provider config và token từ ScriptProperties.
- `createStorageWorkbook()`/`setupSheetDB()` tự cài worker; `sign_place` và gateway settings đã có round-trip.
- Thêm bảng `NotificationMetrics`, cập nhật theo outbox và trang Admin `Chi phí & hiệu quả`.
- Cập nhật README, schema contract và bundle GAS. Phần provider sandbox, E2E 5 role và deploy pilot vẫn cần nghiệm thu thật.

## Tasks triển khai

### 1. Khóa contract quyền và dữ liệu P0

- Sửa `getBootstrap()` để ADMIN không nhận `customer_name`, `cif`, `phone`, `email`, `priority_flags_json` trong payload; chỉ trả mã việc, đơn vị, loại việc, trạng thái và dữ liệu vận hành cần thiết.
- Giữ UI mask hiện có nhưng không coi UI là lớp bảo mật.
- Rà soát các API `detail`, `export`, `audit`, `transitionItem`, `proposeRevision`, `resolveRevision` theo cùng ma trận quyền.
- Thêm test âm tính: Admin không thể đọc dữ liệu khách; PGD không đọc đơn vị khác; cán bộ LS không đọc việc chưa được giao.

**Phụ thuộc:** không có.  
**Files chính:** `Code.gs`, `js/gas-api.js`, `js/screens.js`, test contract mới.  
**Nghiệm thu:** bootstrap giả lập cho ADMIN không chứa trường khách hàng; mọi API từ role sai trả lỗi; build/contract test đạt.

### 2. Chốt và chuẩn hóa contract notification

- Chọn `MailApp` làm đường Email mặc định cho phase đầu; bỏ trạng thái “Gmail API sẵn sàng” nếu chưa có implementation thật.
- Nếu giữ Gmail API, triển khai riêng OAuth/Advanced Gmail Service, scope, sender alias và test gửi thật; không cho UI báo ready khi backend vẫn ném lỗi.
- Chuẩn hóa interface provider: `send(channel, recipient, template, body, idem_key) -> message_id`.
- Bắt buộc mọi provider trả `message_id`; timeout, retry, lỗi 4xx/5xx và idempotency phải được ghi vào Outbox.

**Phụ thuộc:** Task 1 để không gửi nhầm dữ liệu khách.  
**Files chính:** `Notifications.gs`, `js/domain.js`, `js/admin.js`, `SetupSheetDB.gs`.  
**Nghiệm thu:** Email MailApp gửi được tới allowlist; Gmail API không còn xuất hiện như tính năng hoạt động nếu chưa triển khai; retry không tạo tin trùng.

### 3. Tách ZBS và SMS thành hai kênh thật

- Thêm `SMS` vào `CHANNELS`, schema seed, cấu hình Admin, template validation, blocker và `NotifyRules`.
- Đổi `REACH_CHANNELS.SMS.out` thành `SMS`; không ánh xạ SMS sang ZBS.
- Truyền `appointment.channel` vào server khi xử lý `DANG_HEN_KH`; rule phải tôn trọng kênh người dùng chọn hoặc ghi rõ fallback có chủ đích.
- Quyết định adapter ZBS: gọi trực tiếp Zalo OA hay gọi gateway nội bộ. Nếu gateway, định nghĩa payload, xác thực, timeout, response `message_id`, retry và allowlist.
- Định nghĩa adapter SMS với provider cụ thể, chuẩn hóa số điện thoại Việt Nam, giới hạn nội dung và chống gửi trùng.
- Secret chỉ lưu trong `PropertiesService`/secret store; không lưu token trong Sheet hoặc bundle client.

**Phụ thuộc:** Task 2.  
**Files chính:** `js/domain.js`, `js/screens.js`, `Notifications.gs`, `Code.gs`, `SetupSheetDB.gs`, `js/admin.js`.  
**Nghiệm thu:** chọn ZBS gửi ZBS; chọn SMS gửi SMS; không có provider thì Outbox ghi `KHONG_GUI` kèm lý do; test số điện thoại giả lập nhận đúng một tin.

### 4. Làm cấu hình gateway/provider có thể vận hành

- Bổ sung API lưu `gateway_url` và tham chiếu secret, nhưng không trả secret về client.
- Thêm màn Admin hiển thị trạng thái cấu hình, endpoint health, provider đang dùng, thời điểm kiểm tra cuối và lỗi cuối.
- Không dùng cờ `gateway_token_set=true` nếu request thực tế không gắn credential.
- Thêm nút “Kiểm tra kết nối” chỉ gửi probe an toàn, không tạo tin khách thật.

**Phụ thuộc:** Task 2 và 3.  
**Files chính:** `Code.gs`, `Notifications.gs`, `js/admin.js`, `js/gas-api.js`, `SetupSheetDB.gs`.  
**Nghiệm thu:** Admin cấu hình được URL/provider; request có auth đúng; token không xuất hiện trong bootstrap/log/client; probe thất bại hiện lỗi rõ ràng.

### 5. Tự động hóa Outbox và giám sát

- Cài `outboxTick` trong `createStorageWorkbook()`/`setupSheetDB()` với cơ chế dedupe trigger.
- Giữ trigger kỳ tháng hiện có; không tạo trigger trùng khi chạy setup nhiều lần.
- Ghi `last_run`, `sent`, `failed`, `remaining`, lỗi provider và thời gian chạy.
- Admin overview/outbox phải phân biệt `CHO_GUI`, `THAT_BAI`, `KHONG_GUI`, `DA_GUI` và cho retry/cancel đúng quyền.

**Phụ thuộc:** Task 2–4.  
**Files chính:** `SetupSheetDB.gs`, `Notifications.gs`, `Code.gs`, `js/admin.js`.  
**Nghiệm thu:** setup hai lần chỉ có một trigger; hàng chờ tự xử lý trong 5 phút; lỗi không mất tin và retry không gửi trùng.

### 6. Sửa các cấu hình bị rơi và đồng bộ schema/tài liệu

- Thêm `sign_place` vào allowlist `adminSaveSettings()` và kiểm tra round-trip UI → GAS → bootstrap.
- Cập nhật README theo 17 bảng, 16 mục Admin, SMS/provider status và runbook trigger tự động.
- Sửa tài liệu nói về Sheet mẫu: chỉ đọc/copy, không sửa trực tiếp workbook mẫu.
- Ghi rõ Email hiện dùng MailApp; ZBS/SMS chỉ gọi được sau khi provider health đạt.

**Phụ thuộc:** Task 1–5.  
**Files chính:** `Code.gs`, `README.md`, `KE_HOACH_VA_QUY_TRINH_LS.md`.  
**Nghiệm thu:** cấu hình `sign_place` lưu và đọc lại đúng; tài liệu khớp schema/code; không còn hướng dẫn thao tác sửa Sheet mẫu.

### 7. Xây bộ đếm lượt gửi, chi phí và hiệu quả

- Tạo bảng/sổ `NotificationMetrics` hoặc projection tương đương, không sửa workbook mẫu; mỗi bản ghi phải gắn `period_id`, `month_key`, `channel`, `provider`, `template_code`, `event`, `audience`, `unit_id`, `work_type_code`, `sent_at`, `status`, `provider_msg_id`.
- Ghi nhận tối thiểu các trạng thái `QUEUED`, `SENT`, `DELIVERED` (nếu provider hỗ trợ), `FAILED`, `CANCELLED`, `KHONG_GUI`; không đếm lại khi retry cùng `idem_key`.
- Lưu đơn giá theo provider/kênh và phiên bản bảng giá (`unit_cost`, `currency`, `effective_from`); không hard-code chi phí trong giao diện.
- Tính các chỉ số theo tháng và kỳ: số lượt gửi, số người nhận, thành công/thất bại, tỷ lệ thành công, chi phí ước tính/thực tế, chi phí theo đơn vị/loại việc/mẫu tin và số lần retry.
- Thêm màn Admin báo cáo gửi tin với bộ lọc tháng, kênh, provider, đơn vị, loại việc, mẫu tin và trạng thái; cho xuất CSV nhưng không xuất secret hay nội dung nhạy cảm ngoài phạm vi quyền.
- Nếu provider có webhook delivery, xử lý idempotent và liên kết về `provider_msg_id`; nếu không có thì chỉ báo `SENT`, không giả định khách đã nhận/đọc.
- Đặt retention và cơ chế snapshot tháng để số liệu lịch sử không thay đổi khi cấu hình đơn giá mới.

**Phụ thuộc:** Task 2–5.  
**Files chính:** `SetupSheetDB.gs`, `Notifications.gs`, `Code.gs`, `js/admin.js`, `js/gas-api.js`, `js/domain.js`.  
**Nghiệm thu:** một lần gửi chỉ tạo một lượt tính phí dù retry; dashboard khớp Outbox; tổng theo tháng = tổng theo kênh = tổng theo đơn vị; chi phí dùng đúng phiên bản đơn giá; webhook trùng không làm tăng bộ đếm.

### 8. Kiểm thử toàn bộ page và nhóm quyền

- Chạy static route check: mọi route trong `ROLES` có case trong `app.js`; mọi mục Admin có renderer hoặc default hợp lệ.
- Tạo bộ tài khoản test cho 5 role: `PHONG_PGD`, `KS_LS`, `CAN_BO_LS`, `QUAN_LY_LS`, `ADMIN`.
- Với từng role, kiểm tra page được phép, page bị ẩn, thao tác được phép/từ chối, dữ liệu theo kỳ ACTIVE và lịch sử tháng.
- Kiểm tra luồng chính: tạo việc → tiếp nhận → phân công → xử lý → hẹn khách → gửi kênh đã chọn → hoàn thành → chuyển tháng.
- Kiểm tra mobile/desktop ở 320, 390, 768, 1440 px và trạng thái rỗng/lỗi/loading.

**Phụ thuộc:** Task 1–7.  
**Files/test:** `js/domain.js`, `js/app.js`, `js/screens.js`, `js/admin.js`, test E2E GAS.  
**Nghiệm thu:** có ma trận pass/fail cho cả 5 role; không có route mồ côi; không có quyền vượt scope.

### 9. Kiểm thử tích hợp provider và triển khai pilot

- Chạy Email với allowlist nội bộ.
- Chạy ZBS với OA/template test đã duyệt.
- Chạy SMS với số test và provider sandbox.
- Kiểm tra idempotency, retry, rate limit, provider message ID, log và đối soát.
- Đối chiếu bộ đếm sau mỗi provider test: Outbox, metrics, chi phí và dashboard phải cùng một số lượt gửi.
- Deploy pilot cho nhóm Workspace nhỏ; theo dõi ít nhất một chu kỳ outbox và một lần tạo/kích hoạt tháng mới.
- Chuẩn bị rollback: phiên bản GAS trước, tắt channel ngoài, giữ nguyên kho dữ liệu và workbook mẫu.

**Phụ thuộc:** tất cả task trước.  
**Nghiệm thu:** có bằng chứng gửi thật/sandbox, log tương ứng, không lộ secret, không mất hoặc gửi trùng tin; pilot đạt mới bật `env=THAT`.

## Lệnh kiểm chứng bắt buộc

```powershell
node build-gas.mjs
node verify-gas-contract.mjs
node verify-storage-schema.mjs
node verify-monthly-plan-flow.mjs
node --check js\app.js
node --check js\screens.js
node --check js\gas-api.js
node --check js\domain.js
```

Sau khi deploy GAS, bổ sung kiểm thử authenticated bằng 5 tài khoản test và bằng chứng Outbox/provider; build xanh hoặc HTTP 200 không được coi là production proof.

## Done when

- [ ] Admin không nhận dữ liệu khách hàng trong bootstrap/API.
- [ ] ZBS và SMS là hai channel độc lập; kênh chọn khi hẹn khách được tôn trọng.
- [ ] Email có đúng một đường gửi đã triển khai và được kiểm thử.
- [ ] Provider có auth/secret an toàn, idempotency và `message_id`.
- [ ] Outbox tự chạy, có retry/đối soát/giám sát.
- [ ] Bộ đếm lượt gửi, trạng thái delivery, chi phí và hiệu quả hoạt động đúng theo tháng/kênh/đơn vị/loại việc.
- [ ] `sign_place`, schema, README và runbook đồng bộ.
- [ ] Cả 5 role và toàn bộ page đạt ma trận nghiệm thu.
- [ ] Pilot Workspace đạt trước khi bật chạy thật.
