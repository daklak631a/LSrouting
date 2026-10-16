# Gateway gửi tin — LS-Routing

Dịch vụ HTTPS trung gian giữa Apps Script và các nhà cung cấp Zalo ZNS, SMS, Telegram.

Apps Script không giữ được bí mật an toàn cho nhiều nhà cung cấp, không làm mới được
token xoay vòng của Zalo, và gọi ra từ dải IP dùng chung của Google nên không khai
báo whitelist được. Gateway giải quyết cả ba việc đó, đồng thời là nơi duy nhất nhìn
thấy nội dung gửi khách ở dạng đầy đủ — nên cũng là nơi đặt kiểm soát tuân thủ.

**Email và thông báo trong ứng dụng không đi qua đây.** Apps Script tự gửi bằng
`MailApp`; gateway từ chối thẳng hai kênh đó để lỗi đấu nối lộ ra ngay.

---

## 1. Hợp đồng với Apps Script

Do `Notifications.gs` hàm `sendClaimed_()` quy định. Không đổi được bằng cấu hình.

```
POST /send
Authorization: Bearer <GATEWAY_TOKEN>
X-Idempotency-Key: <idem_key>
Content-Type: application/json

{
  "channel": "ZBS" | "SMS" | "GMF" | "TELEGRAM",
  "provider": "zbs_gateway",
  "to": "0912345678",
  "template": "TPL_HEN_KY",
  "body": "noi dung da thay bien",
  "item_id": "ITM_00012",
  "provider_config": { "oa_id": "", "app_id": "", "sender_id": "", "secret_ref": "" }
}
```

| Phản hồi | Apps Script hiểu là |
| --- | --- |
| `2xx` + `{"message_id":"..."}` | **Đã gửi** → ghi `DA_GUI`, lưu `provider_msg_id` |
| `2xx` nhưng thiếu `message_id` | **Chưa gửi** → `THAT_BAI`, thử lại |
| Ngoài `2xx` | **Chưa gửi** → `THAT_BAI`, thử lại theo lịch 5/15/45/135/240 phút |
| Không phản hồi | **Chưa gửi** → `THAT_BAI` |

Thân phản hồi lỗi bị Apps Script cắt còn **200 ký tự đầu** để ghi vào cột `note`
của `NotificationOutbox`. Vì vậy mọi thông điệp lỗi ở đây đều ngắn, tiếng Việt, và
nói đúng việc người vận hành cần làm.

### Chống trùng là hợp đồng hai chiều

Apps Script gửi `X-Idempotency-Key` ở **mọi** lượt, kể cả lượt thử lại. Gateway
phải trả lại đúng `message_id` cũ khi gặp lại khóa đó. Không làm được điều này thì
mỗi lần thử lại là một tin thật gửi tới khách và một lượt tính phí thật.

Gateway giữ chỗ khóa **trước** khi gọi nhà cung cấp, nên hai lượt chạy song song
không thể cùng gửi một tin. Lượt thứ hai nhận `409` và Apps Script sẽ thử lại sau.

---

## 2. Chạy thử trong 5 phút

```bash
cd gateway
npm install
cp .env.example .env
```

Sửa `.env`: đặt `GATEWAY_TOKEN` bất kỳ (≥ 24 ký tự) và `MOCK_PROVIDERS=true`.

```bash
npm start
```

Thử một tin:

```bash
curl -s -X POST http://localhost:8080/send \
  -H "Authorization: Bearer <GATEWAY_TOKEN cua ban>" \
  -H "X-Idempotency-Key: ITM_1:DANG_HEN_KH:KHACH:REQ_1" \
  -H "Content-Type: application/json" \
  -d '{"channel":"SMS","to":"0912345678","template":"TPL_SMS_HEN_KY","body":"thu","item_id":"ITM_1","provider_config":{}}'
```

Gọi lại đúng lệnh trên sẽ thấy `"deduplicated": true` và **cùng** `message_id`.

Chạy bộ kiểm hợp đồng:

```bash
npm test     # 16 test
```

---

## 3. Cấu trúc

```
gateway/
├─ src/
│  ├─ server.js            điểm vào: /send, /healthz, xử lý lỗi
│  ├─ config.js            đọc và kiểm tra biến môi trường
│  ├─ auth.js              kiểm Bearer token, so sánh không phụ thuộc thời gian
│  ├─ templateMap.js       cầu nối mẫu LS-Routing  ->  template_id ZNS
│  ├─ errors.js            lỗi kèm mã HTTP, rút gọn thông điệp
│  ├─ logger.js            log JSON một dòng, che số điện thoại
│  ├─ store/
│  │  ├─ memory.js         cho phát triển
│  │  └─ firestore.js      cho chạy thật, reserve nguyên tử giữa nhiều bản sao
│  └─ providers/
│     ├─ zns.js            Zalo ZNS + quản lý token xoay vòng
│     ├─ sms.js            bộ nối chung, khai bằng JSON
│     ├─ telegram.js       Telegram Bot API
│     ├─ zaloGroup.js      GMF, mặc định tắt
│     └─ index.js          sổ đăng ký theo kênh
├─ config/
│  ├─ templates.example.json
│  └─ sms.example.json
├─ test/contract.test.js
└─ Dockerfile
```

---

## 4. Đấu nối từng kênh

### 4.1 Zalo ZNS

Phần khó nhất không phải gọi API mà là **ánh xạ mẫu**. Zalo không nhận văn bản tự
do; nó nhận `template_id` kèm một đối tượng tham số rời. Apps Script lại gửi sang
một chuỗi `body` đã thay biến.

Cách giải quyết ở đây: soạn mẫu phía LS-Routing thành **từng dòng `khóa=giá trị`**,
gateway tách ra chắc chắn.

Nội dung mẫu `TPL_HEN_KY` trong Quản trị → Mẫu tin:

```
ten_khach={{ten_khach}}
noi_ky={{noi_ky}}
gio_ky={{gio_ky}}
ngay_ky={{ngay_ky}}
hotline={{hotline}}
```

`config/templates.json`:

```json
{
  "TPL_HEN_KY": {
    "zns_template_id": "123456",
    "params": {
      "customer_name": "ten_khach",
      "place": "noi_ky",
      "time": "gio_ky",
      "date": "ngay_ky"
    }
  }
}
```

Bên trái `params` là tên tham số **Zalo quy định** khi duyệt mẫu; bên phải là tên
biến bạn tự đặt trong nội dung mẫu LS-Routing.

> **Không** dùng biểu thức chính quy tách tham số ra khỏi câu văn xuôi. Chỉ cần ai
> đó sửa câu chữ là tham số sai, mà Zalo vẫn trả `msg_id` hợp lệ nên lỗi không hề
> lộ ra ở LS-Routing.

Biến môi trường cần có: `LS_ZBS_SECRET` (App Secret) và `ZNS_REFRESH_TOKEN` để mồi
lần đầu. Sau lần làm mới đầu tiên, refresh token mới được ghi xuống kho — **ghi
trước access token**, vì mất access token chỉ tốn một lần làm mới, còn mất refresh
token là phải cấp quyền lại bằng tay.

### 4.2 SMS

Không viết mã cho từng nhà cung cấp. Khai `config/sms.json`:

```json
{
  "url": "https://api.nha-cung-cap.vn/sms/send",
  "method": "POST",
  "contentType": "json",
  "phoneFormat": "84",
  "headers": { "Authorization": "Bearer ${secret}" },
  "fields": {
    "to": "${to}",
    "from": "${sender}",
    "message": "${text}",
    "client_ref": "${trackingId}"
  },
  "successPath": "error",
  "successEquals": "0",
  "errorPath": "message",
  "messageIdPath": "data.msg_id"
}
```

Biến dùng được: `${to}` `${text}` `${sender}` `${secret}` `${trackingId}` `${env.TEN_BIEN}`.

`successPath` xử lý trường hợp hay gặp: nhà cung cấp trả HTTP 200 nhưng mã lỗi nằm
trong thân phản hồi.

Nhà cung cấp cần ký HMAC hoặc nhiều bước thì viết một bộ nối riêng theo cùng giao
diện `send(payload)` rồi đăng ký ở `providers/index.js`.

### 4.3 Telegram

Chỉ cần `TELEGRAM_BOT_TOKEN`. Bot chỉ nhắn được cho người đã chủ động bắt đầu trò
chuyện; gateway dịch lỗi hay gặp của Telegram thành câu nói rõ nguyên nhân.

### 4.4 GMF (nhóm Zalo nội bộ)

Mặc định **tắt**, trả `501` kèm lý do. Zalo không có API công khai cho phép OA gửi
tùy ý vào nhóm chat thường. Chỉ bật `GMF_ENABLED=true` sau khi đã xác nhận tổ chức
được cấp quyền và đã gửi thử thành công vào nhóm thật.

---

## 5. Triển khai lên Cloud Run

```bash
PROJECT=ten-project
REGION=asia-southeast1

# 1. Nạp bí mật
printf '%s' "$(openssl rand -base64 36)" | gcloud secrets create ls-gateway-token --data-file=-
printf '%s' "<App Secret Zalo>"          | gcloud secrets create ls-zbs-secret     --data-file=-
printf '%s' "<khoa API nha mang>"        | gcloud secrets create ls-sms-token      --data-file=-

# 2. Firestore cho khóa chống trùng
gcloud firestore databases create --location=$REGION
gcloud firestore fields ttls update expireAt \
  --collection-group=ls_gateway --enable-ttl

# 3. Build và deploy
gcloud run deploy ls-gateway \
  --source . \
  --region $REGION \
  --no-allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars STORE_DRIVER=firestore,ZNS_ENABLED=true,TELEGRAM_ENABLED=true \
  --set-secrets GATEWAY_TOKEN=ls-gateway-token:latest,LS_ZBS_SECRET=ls-zbs-secret:latest,LS_SMS_TOKEN=ls-sms-token:latest
```

Vài lựa chọn có lý do:

- **`--min-instances 1`** — giữ một bản sao luôn sống. Token ZNS được nhớ trong bộ
  nhớ tiến trình, nên khởi động nguội liên tục sẽ làm mới token nhiều hơn cần thiết.
  Refresh token của Zalo xoay vòng mỗi lần làm mới, nên càng ít lượt càng an toàn.
- **Firestore thay vì bộ nhớ** — `reserve` cần một thao tác đọc-ghi nguyên tử giữa
  các bản sao. Thiếu tính chất này thì hai bản sao nhận cùng một lượt thử lại sẽ
  cùng gọi nhà cung cấp và khách nhận tin hai lần.
- **`--no-allow-unauthenticated`** cộng với Bearer token là hai lớp. Nếu Apps Script
  không dùng được IAM thì mở public và dựa vào Bearer token, nhưng phải đặt Cloud
  Armor hoặc giới hạn tần suất ở phía trước.

Nhà mạng yêu cầu khai báo IP thì gắn Cloud NAT với IP tĩnh — IP ra của Cloud Run
mặc định không cố định.

---

## 6. Nối vào LS-Routing

**Phía gateway:** lấy URL sau khi deploy, ví dụ
`https://ls-gateway-xxxx.a.run.app/send`.

**Phía Apps Script:**

1. Quản trị → Cấu hình chung → Gateway gửi tin ngoài
   - Địa chỉ gateway: dán URL đầy đủ, **kèm `/send`**
   - Tên thuộc tính token: giữ `LS_GATEWAY_TOKEN`
2. Apps Script → Project Settings → Script properties → thêm `LS_GATEWAY_TOKEN`
   với đúng giá trị `GATEWAY_TOKEN`
3. Tải lại LS-Routing. Ở Quản trị → Kênh gửi tin, dòng "Gateway và credential đã
   cấu hình" phải chuyển sang đạt.
4. Bật chế độ thử nghiệm cho kênh, thêm số của bạn vào danh sách cho phép, bấm
   **Gửi thử**.

> Ô "Tham chiếu khóa" trong LS-Routing phải **trùng tên** biến môi trường ở gateway.
> Mặc định: `LS_ZBS_SECRET` cho ZNS, `LS_SMS_TOKEN` cho SMS.

### Diễn tập trước khi đấu nhà cung cấp thật

Deploy một bản với `MOCK_PROVIDERS=true`, nối vào LS-Routing và chạy hết kịch bản
nghiệm thu. Toàn bộ luồng hàng đợi, thử lại, chống trùng và ghi chi phí đều chạy
thật; chỉ lượt gọi ra ngoài là giả.

---

## 7. Vận hành

`GET /healthz` trả kho đang dùng, danh sách kênh và cờ mock — không cần token.

Log là JSON một dòng, hợp Cloud Logging:

| `message` | Nghĩa |
| --- | --- |
| `send_ok` | Gửi thành công, kèm `messageId` để đối soát với `NotificationMetrics` |
| `send_deduplicated` | Gặp lại khóa cũ, trả mã tin cũ, không gọi nhà cung cấp |
| `send_failed` | Có `status` và `reason`; `status ≥ 500` ghi mức ERROR |
| `zns_token_refreshed` | Đã làm mới token Zalo, kèm thời điểm hết hạn |
| `store_memory_in_use` | Cảnh báo đang chạy kho bộ nhớ ở môi trường thật |

Log **không** chứa nội dung tin, token hay số điện thoại đầy đủ (chỉ giữ 3 số cuối).

Đối soát hằng tuần: lọc `send_ok` theo khoảng thời gian rồi so số lượt với
`NotificationMetrics` trong LS-Routing và với hóa đơn nhà cung cấp. Ba con số này
phải khớp.

---

## 8. Còn phải tự làm

| Việc | Vì sao chưa làm sẵn được |
| --- | --- |
| Điền `zns_template_id` thật | Chỉ có sau khi Zalo duyệt mẫu |
| Hoàn thiện `config/sms.json` | Phụ thuộc nhà cung cấp bạn ký hợp đồng |
| Xác nhận endpoint Zalo | Địa chỉ API để ở biến môi trường; hãy đối chiếu tài liệu Zalo hiện hành trước khi chạy thật |
| Quyền gửi nhóm Zalo (GMF) | Phải xác nhận với Zalo hoặc đối tác |
| Whitelist IP | Chỉ biết sau khi chọn nơi triển khai |

---

## 9. Bảo mật

- Bí mật chỉ đọc từ biến môi trường, không bao giờ ghi ra log.
- `secret_ref` mà LS-Routing gửi sang chỉ là **tên tham chiếu**; giá trị thật nằm ở
  gateway. Người xem được Google Sheet vẫn không đọc được bí mật.
- Token so sánh bằng `crypto.timingSafeEqual`.
- Thân yêu cầu giới hạn 64 KB.
- Container chạy bằng người dùng `node`, không phải root.
- Xoay `GATEWAY_TOKEN` định kỳ: cập nhật Secret Manager, deploy lại, rồi đổi Script
  property. Trong khoảng giữa hai bước, tin sẽ `THAT_BAI` và tự thử lại — không mất tin.
