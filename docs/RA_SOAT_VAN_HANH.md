# Rà soát chuẩn bị vận hành — LS-Routing

> Ngày rà soát: **24/09/2026**. Nhánh `main`, thư mục `E:\bank routing\LS-Routing`.
> Tài liệu đi kèm: [HUONG_DAN_CAU_HINH_ZALO_SMS_EMAIL.docx](HUONG_DAN_CAU_HINH_ZALO_SMS_EMAIL.docx) — hướng dẫn cấu hình kênh thông báo.

---

## 0. Đã sửa sau lần rà soát này

Sáu lỗi dưới đây đã được sửa và có contract chặn hồi quy. Baseline sau khi sửa:
**30/30 contract đạt** (28 cũ + 2 mới), `Index.gas.html` đồng bộ, 12/12 file parse sạch.

| # | Lỗi | Sửa ở đâu |
| --- | --- | --- |
| 1 | Hộp thư, nhật ký và hàng đợi tin **cắt đuôi bảng rồi mới lọc** theo người dùng — cán bộ có thể thấy rỗng dù còn dữ liệu của mình. Nặng nhất là tin gửi khách chờ xác nhận: không hiện ra thì kẹt vĩnh viễn vì quản trị bị chặn xác nhận thay. | `DataRepository.tailWhere()` mới; ba chỗ gọi trong `getBootstrap` |
| 2 | `claimPending_` quét **trọn** bảng `NotificationMetrics` mỗi 5 phút trong lúc giữ khóa ghi toàn cục, chỉ để tính hạn mức mỗi giờ | `Notifications.gs` → `t.tail('NotificationMetrics', 2000)` |
| 3 | `transitionIdempotent_` quét **trọn** bảng `Events` ở mỗi lần bấm nút chuyển trạng thái, cũng trong lúc giữ khóa | `Code.gs` → `t.tailWhere('Events', 1, …, { maxScan: 5000 })` |
| 4 | `markInboxRead` so sánh cờ bằng chuỗi phân biệt hoa thường, lệch với `truthy_()` dùng ở mọi nơi khác | `Code.gs` → `!truthy_(n.is_read)` |
| 5 | `reconcile()` viết xong nhưng **không trigger nào gọi** — lưới an toàn nằm trên giấy | `reconcileTick` chạy mỗi 6 giờ |
| 6 | Trigger nền thêm về sau không tới được bản đã triển khai, vì kho đã migration thì không chạy lại setup | `Notifications.ensureWorkerTriggers()` gọi ở nhánh `ready` |

Hai contract mới:

- `verify-scan-bounds-contract.mjs` — kiểm chuỗi ký tự, chặn cả sáu lỗi quay lại. Đã kiểm bằng 5 đột biến, bắt được cả 5.
- `verify-tailwhere-contract.mjs` — nạp thẳng `DataRepository.gs` vào ngữ cảnh có stub API Apps Script rồi **gọi hàm thật**, 8 kịch bản. Kịch bản chính: 1.000 thông báo của 20 cán bộ thì người dùng vẫn nhận đủ 50 dòng của mình, trong khi cách cũ chỉ ra khoảng 10.

### Chưa sửa, có lý do

- **`claimPending_` vẫn quét trọn `NotificationOutbox`.** Giới hạn phạm vi quét ở đây sẽ đổi thứ tự gửi từ cũ-trước sang mới-trước khi hàng đợi dồn, làm tin cũ bị bỏ đói. Cách đúng là lưu trữ bớt dữ liệu cũ (mục 4.5), không phải lách bằng cách cắt cửa sổ quét.
- **Màn chi phí vẫn cắt ở 2.000 lượt** (mục 4.2). Sửa đúng là gộp số liệu ở máy chủ thay vì gửi từng dòng về trình duyệt — chạm vào `js/admin.js` và phần biểu đồ, nên tách thành một đợt riêng.

---

## 1. Baseline đã xác minh

| Hạng mục | Kết quả |
| --- | --- |
| Contract test (`verify-*.mjs`) | **28/28 đạt** |
| `node build-gas.mjs` | `Index.gas.html` đồng bộ với `js/`, không lệch |
| Trigger nền khai báo trong mã | 4: `outboxTick` (5 phút), `overdueTick` (1 giờ), `activateMonthlyPlans` (1 giờ), `maintenanceTick` (2h sáng, backup) |
| CI | GitHub Actions kiểm build sync + chạy toàn bộ contract trước khi `clasp push` |

Phần rà soát này **không** đánh giá lại nghiệp vụ điều phối việc (đã có contract phủ), mà tập trung vào những gì cản trở việc mở hệ thống cho người dùng thật.

---

## 2. Mức độ sẵn sàng theo từng trục

| Trục | Điểm | Nhận định |
| --- | --- | --- |
| Nghiệp vụ điều phối việc | 8/10 | State machine ở máy chủ, có lý do bắt buộc, có bàn giao khi đổi vai trò. Được contract phủ tốt. |
| Bộ máy gửi tin (thiết kế) | 8/10 | Outbox, idempotency, claim lease, backoff, đối soát — thiết kế đúng chuẩn. |
| Bộ máy gửi tin (sẵn sàng chạy) | **3/10** | Chỉ Email chạy được. Bốn kênh ra ngoài phụ thuộc một gateway **chưa tồn tại**. |
| Xác thực và phiên | **3/10** | Băm mật khẩu yếu, mật khẩu mặc định trong mã, nhóm phòng/PGD không cần mật khẩu, phiên không hạn. |
| Khả năng quan sát | 6/10 | Có heartbeat worker và nhật ký cấu hình, nhưng chưa có cảnh báo tự động. |
| Sức chứa dữ liệu | **4/10** | Không có tiến trình dọn dữ liệu; nhiều màn hình cắt dữ liệu theo `tail` toàn cục. |
| Sao lưu và phục hồi | 6/10 | Backup tự động hằng ngày có thật; chưa có bằng chứng diễn tập phục hồi. |

---

## 3. Chặn go-live (🔴)

### 3.1 Gateway gửi tin chưa tồn tại

Rà soát toàn bộ kho mã: không có mã nguồn gateway, không có đặc tả, không có bản mẫu. `Notifications.gs` chỉ biết `gateway_url` và một bearer token.

**Hệ quả:** ZBS (Zalo ZNS), SMS, GMF và TELEGRAM không thể bật. Điều kiện `gatewayBlocker_()` chặn cứng cả ở lúc xếp hàng lẫn lúc gửi.

**Việc cần làm:** xây dựng và triển khai gateway theo hợp đồng đã cố định ở `Notifications.gs:582-596`. Đặc tả đầy đủ nằm ở mục 3 của tài liệu .docx đi kèm.

### 3.2 Trigger và email chạy dưới tài khoản cá nhân

README ghi deployment chuẩn chạy dưới `daklak631a@gmail.com`. Trigger Apps Script chạy dưới quyền người cài, và `MailApp.sendEmail()` không nhận tham số người gửi.

**Hệ quả:**
- Mọi email thông báo gửi đi từ hộp thư Gmail cá nhân, không phải hộp thư tổ chức. Ô "Hộp thư gửi" trong cấu hình kênh **không** thay đổi được điều này.
- Hạn mức thư là hạn mức của tài khoản cá nhân (khoảng 100/ngày), không phải 1.500/ngày của Workspace.
- Khi tài khoản này bị khóa hoặc người này rời đơn vị, toàn bộ trigger dừng và **hệ thống im lặng không báo lỗi** cho người dùng.

**Việc cần làm:** triển khai lại web app và cài lại trigger bằng tài khoản dịch vụ của tổ chức trước khi mở cho người dùng thật.

### 3.3 Băm mật khẩu và mật khẩu mặc định

`Code.gs:108-111` — `passwordHash_()` dùng SHA-256 trần, không muối, không lặp vòng.

`Code.gs:203, 230` — mật khẩu khởi tạo nằm thẳng trong mã nguồn: `D@kl@k631` cho quản trị, `D@klak631` cho cán bộ. Kho mã có remote GitHub.

**Việc cần làm:** đổi sang thuật toán có muối và chi phí tính toán; đưa mật khẩu khởi tạo ra ngoài mã nguồn; rà soát không còn tài khoản nào giữ cờ `must_change_password`.

### 3.4 Tài khoản phòng/PGD đăng nhập không cần mật khẩu

`Code.gs:203` — chỉ nhóm `INTERNAL` bị kiểm mật khẩu. Nhóm `EXTERNAL` (mặc định của vai trò `PHONG_PGD`) chỉ cần đúng mã đăng nhập là vào được.

Vai trò này tạo việc, sửa việc và xem hồ sơ khách hàng của đơn vị mình. Mã đăng nhập không phải bí mật.

**Việc cần làm:** xác nhận đây có phải quyết định nghiệp vụ có chủ ý không. Nếu không, bổ sung mật khẩu cho nhóm này.

### 3.5 Không giới hạn số lần đăng nhập sai

`authenticateUser()` không đếm số lần thất bại. Web app mở ở chế độ `ANYONE_ANONYMOUS`, nên bất kỳ ai có đường dẫn đều thử được không giới hạn.

---

## 4. Cần sửa trước pilot (🟡)

### 4.1 Thông báo cá nhân có thể không hiển thị

`Code.gs:1240`:

```js
inbox: DataRepository.tail('Inbox', 200).filter(n => n.user_id === u.user_id)
```

Lấy 200 dòng cuối **của toàn hệ thống** rồi mới lọc theo người dùng. Với 20 cán bộ đang hoạt động, một người chỉ thấy phần nhỏ thông báo của mình; nếu 200 thông báo gần nhất đều thuộc người khác, người đó thấy **rỗng** dù vẫn còn thông báo chưa đọc.

Cùng kiểu lỗi ở `Code.gs:1234` với `Events` (tail 800 toàn cục rồi lọc theo việc).

**Cách sửa:** lọc theo `user_id` trước rồi mới cắt, hoặc đánh chỉ mục riêng cho Inbox theo người dùng.

### 4.2 Màn chi phí cắt ở 2.000 lượt

`Code.gs:1261` — `NotificationMetrics` lấy `tail(2000)`. Màn Quản trị → Chi phí và hiệu quả (`js/admin.js:810`) tính trên đúng mảng này.

Khi tổng số lượt gửi vượt 2.000, báo cáo chi phí **âm thầm thiếu** phần cũ mà không có cảnh báo nào. Với 600 tin/tháng, ngưỡng này chạm sau khoảng 3 tháng.

### 4.3 Cờ môi trường không chặn gì

`Settings.env` (`THU_NGHIEM` / `THAT`) chỉ được đọc ở `js/admin.js:138` để hiện một dải banner. Không có điểm nào trong mã chặn hành vi theo giá trị này.

**Hệ quả:** để ở `THU_NGHIEM` vẫn gửi tin thật cho khách hàng. Chốt chặn thật sự duy nhất là `test_mode` + `allowlist` của từng kênh.

### 4.4 Thời hạn lưu dữ liệu khai báo nhưng không thực thi

`Settings.retention_months = 60` tồn tại, và `maintenanceTick` có ghi `retention_last_check_at`, nhưng **không có tiến trình nào xóa dữ liệu hết hạn**.

### 4.5 Không có dọn hay lưu trữ dữ liệu chỉ thêm

`NotificationOutbox`, `NotificationMetrics`, `Events`, `Inbox`, `NotificationIdempotency` đều chỉ thêm, không bao giờ xóa. Google Sheets có trần 10 triệu ô cho mỗi workbook.

Ước lượng thô với 200 việc/tháng và 3 tin mỗi việc:

| Bảng | Cột | Dòng/tháng | Ô/năm |
| --- | --- | --- | --- |
| NotificationOutbox | 20 | ~600 | ~144.000 |
| NotificationMetrics | 22 | ~600 | ~158.000 |
| Events | 8 | ~2.000 | ~192.000 |
| Inbox | 6 | ~1.200 | ~86.000 |

Chưa chạm trần trong vài năm, nhưng hiệu năng `tail_()` và thời gian giữ khóa sẽ xấu dần. Cần kế hoạch lưu trữ theo kỳ trước khi mở rộng ra nhiều đơn vị.

### 4.6 Phiên đăng nhập không có hạn

`LS_AUTH_USER_ID` lưu trong `UserProperties` và giữ nguyên tới khi đăng nhập lại. Không có thời hạn, không có cơ chế thu hồi phiên khi quản trị khóa tài khoản giữa chừng — `activeUserById_()` có kiểm `is_active`, nhưng chỉ ở lần gọi kế tiếp.

### 4.7 Khóa ghi tuần tự hóa toàn hệ thống

`DataRepository.gs:16` — `LOCK_MS = 20000`. Mọi giao dịch ghi đều qua một `LockService.getScriptLock()` duy nhất.

Ở quy mô một chi nhánh thì chấp nhận được, nhưng chưa có số đo dưới tải thật. Cần đo trước khi mở cho nhiều đơn vị đồng thời: thời gian chờ khóa khi worker đang chạy lô 20 tin trùng với lúc cán bộ thao tác.

---

## 5. Theo dõi sau khi chạy (🟢)

| Việc | Cách làm |
| --- | --- |
| Worker còn sống | Đọc `Settings.worker_last_run_at`. Quá 15 phút không đổi là worker đã chết. |
| Hàng đợi dồn | `Settings.worker_last_run_remaining` vượt `backlog_alert` (mặc định 20). |
| Tin không gửi được | Lọc `NotificationOutbox` theo `status = KHONG_GUI`, đọc cột `note`. |
| Backup chạy đủ | `Settings.backup_last_at` và `backup_last_error`. |
| Chi phí khớp hóa đơn | Đối chiếu `NotificationMetrics` với hóa đơn nhà cung cấp hằng tuần. |

Hiện **chưa có cảnh báo tự động** cho bất kỳ mục nào ở trên — tất cả đều phải mở màn Quản trị xem bằng mắt. Nên bổ sung một trigger gửi email cho quản trị khi worker im quá 15 phút hoặc hàng đợi vượt ngưỡng.

---

## 6. Những phần làm tốt — giữ nguyên khi sửa

- **Hàng đợi gửi tin có claim lease.** Worker giữ chỗ 15 phút bằng `claim_token`, gọi nhà cung cấp **ngoài** phạm vi khóa, rồi mới ghi kết quả. Đây là cách đúng để không giữ khóa Sheets trong lúc chờ mạng.
- **Chống trùng bằng chỉ mục bền vững.** `NotificationIdempotency` là bảng riêng, không phụ thuộc việc quét đuôi outbox — chống trùng đúng trên toàn bộ lịch sử.
- **Không tự gửi lại email treo.** Khi một lượt email quá hạn giữ chỗ, hệ thống chuyển `KHONG_GUI` kèm ghi chú cần kiểm tra tay thay vì gửi lại. Đánh đổi có chủ ý: thà bỏ sót còn hơn gửi trùng cho khách.
- **Không coi 2xx là đã gửi.** Thiếu `message_id` thì tin vẫn tính là thất bại. Không có mã nhà cung cấp thì không có gì để đối soát.
- **Điều kiện bật kênh kiểm hai lần**, ở cả lúc xếp hàng và lúc worker chuẩn bị gửi. Kênh bị tạm ngưng giữa chừng không làm tin trôi lọt.
- **Danh sách biến cấm theo kênh**, thực thi ở máy chủ chứ không chỉ ở giao diện. Tin nhóm nội bộ không thể chứa tên khách hay số điện thoại.
- **Quản trị không xác nhận thay tin gửi khách.** Vai trò này không đọc được nội dung gửi khách nên bấm xác nhận cũng là bấm mù — mã nguồn chặn thẳng.
- **Sửa mẫu đã duyệt tự mất hiệu lực duyệt**, luật nằm ở máy chủ nên không lách được bằng cách gọi API.
- **Metrics một dòng cho mỗi `outbox_id`.** Thử lại cập nhật dòng cũ, không sinh lượt tính phí mới.
- **CI kiểm tính đồng bộ của file build.** Sửa thẳng `Index.gas.html` thay vì sửa `js/` sẽ bị chặn ở PR.

---

## 7. Thứ tự đề nghị

```text
ĐỢT 1 — Mở được cho người dùng thật              (chặn go-live)
  ├─ Triển khai lại web app + trigger bằng tài khoản tổ chức   [3.2]
  ├─ Đổi băm mật khẩu, đưa mật khẩu mặc định ra khỏi mã        [3.3]
  ├─ Chốt chính sách mật khẩu cho nhóm phòng/PGD               [3.4]
  └─ Thêm giới hạn đăng nhập sai                               [3.5]
        → Sau đợt này: chạy được với Email + thông báo trong app

ĐỢT 2 — Bật kênh ra ngoài
  ├─ Xây dựng gateway theo đặc tả ở tài liệu .docx             [3.1]
  ├─ Song song: nộp hồ sơ OA + mẫu ZNS (đường găng dài nhất)
  └─ Nghiệm thu từng kênh theo mục 9 của tài liệu .docx

ĐỢT 3 — Sửa lỗi hiển thị và sức chứa
  ├─ Lọc trước rồi mới cắt cho Inbox và Events                 [4.1]
  ├─ Bỏ trần 2.000 ở màn chi phí                               [4.2]
  ├─ Cho cờ env thực sự chặn hành vi, hoặc bỏ hẳn              [4.3]
  └─ Thêm tiến trình lưu trữ và xóa theo retention             [4.4, 4.5]

ĐỢT 4 — Quan sát và chịu tải
  ├─ Cảnh báo tự động khi worker im hoặc hàng đợi dồn          [5]
  ├─ Thời hạn phiên đăng nhập                                  [4.6]
  └─ Đo thời gian chờ khóa dưới tải thật                       [4.7]
```

Sau mỗi đợt: chạy lại `node build-gas.mjs` và toàn bộ `verify-*.mjs`, cập nhật trạng thái ở tài liệu này.
