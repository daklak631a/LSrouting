# LS-Routing

Điều phối việc tín dụng LS: phòng/PGD gửi việc → kiểm soát tiếp nhận và phân công →
cán bộ LS xử lý → hẹn khách khi loại việc yêu cầu → báo cáo.
Nghiệp vụ gốc ở [KE_HOACH_VA_QUY_TRINH_LS.md](KE_HOACH_VA_QUY_TRINH_LS.md).

## Chạy thử

```
npx http-server . -p 4173 -c-1
```

Mở `http://localhost:4173`, chọn một tài khoản mẫu. Dữ liệu nằm trong `localStorage`.
Màn Quản trị → Dữ liệu có nút khôi phục mẫu.

Bản trình duyệt không gửi ra ngoài; chỉ GAS gọi provider thật.

## Triển khai Apps Script

```
node build-gas.mjs
```

Lệnh này gộp `index.html` + `css/styles.css` + toàn bộ `js/*.js` thành `Index.gas.html`.
Đừng sửa `Index.gas.html` trực tiếp.

Đẩy lên Apps Script: `Code.gs`, `DataRepository.gs`, `Notifications.gs`, `SetupSheetDB.gs`,
`Index.gas.html`. Chạy `createStorageWorkbook()` một lần để tạo một file Google Sheet
lưu trữ độc lập, gồm toàn bộ 17 bảng dữ liệu và danh mục đơn vị/loại việc/dropdown theo mẫu kế
hoạch. Mỗi việc còn giữ `source_stt`/`source_tab` để hiển thị lại số thứ tự theo phòng giống file gốc.
Hàm trả về URL file và lưu ID vào thuộc tính `LS_SHEET_ID` của dự án GAS.

Sau khi tạo kho, chạy `setupSheetDB()` để bổ sung cột đăng nhập và tài khoản `admin` nếu
còn thiếu. Người dùng đăng nhập trong webapp bằng `login_code`: phòng/PGD chỉ cần mã cán
bộ; LS, kiểm soát và quản trị cần mã kèm mật khẩu. Mật khẩu chỉ được lưu dưới dạng SHA-256
ở phía GAS. Tài khoản `admin` dùng mật khẩu khởi tạo riêng; cán bộ nội bộ dùng mật khẩu
khởi tạo chung, sau đó quản trị đặt lại mật khẩu riêng ở màn Người dùng.

Mật khẩu khởi tạo chung và mật khẩu do quản trị cấp đều là mật khẩu tạm: lần đăng
nhập kế tiếp hệ thống bắt đổi mật khẩu trước khi vào, và máy chủ chặn mọi thao tác
ghi cho tới khi đổi xong.

Quản trị → Người dùng cho phép thêm/sửa từng cán bộ hoặc nhập lô file CSV/TSV UTF-8 xuất
từ Excel. Cột bắt buộc là `login_code`, `full_name`, `unit_id`; có thể thêm `role`, `email`,
`password`, `is_active`. Mỗi mã chỉ gắn với một phòng/PGD; đổi `unit_id` là đổi phạm vi
nhìn thấy ở lần đăng nhập kế tiếp. Không cần sửa workbook kế hoạch gốc.

Web app vẫn nên giới hạn người được phép mở bằng Google Workspace của tổ chức; mã cán bộ
là lớp đăng nhập nghiệp vụ của app, còn quyền ghi dữ liệu và kiểm tra vai trò vẫn nằm ở
`Code.gs`. App GAS không dùng `localStorage` làm nguồn dữ liệu.

`createStorageWorkbook()` và `setupSheetDB()` tự cài trigger worker 5 phút/lượt. Có thể
chạy lại `installOutboxWorker()` khi cần thay trigger. Chỉ bật kênh sau khi kiểm thử;
tin khách cần xác nhận vẫn đứng ở hàng chờ trước khi worker gửi.

Nếu kho đã tạo từ phiên bản cũ và màn Kênh gửi tin chưa có SMS, sau khi cập nhật mã hãy
chạy lại `setupSheetDB()`. Hàm sẽ bổ sung dòng `SMS` vào `Channels` và mẫu
`TPL_SMS_HEN_KY` ở trạng thái nháp nếu còn thiếu; không ghi đè cấu hình hoặc dữ liệu đã có.

Chạy lại `setupSheetDB()` cũng bổ sung cột `telegram_chat_id` cho `Users`, cột
`next_try_at` cho `NotificationOutbox`, mẫu `TPL_MAIL_HEN_KY` và `TPL_NHOM_HEN_KY`,
quy tắc `R8` báo nhóm nội bộ, và đánh dấu quy tắc hẹn khách `R6` là đường báo thẳng
khách. Sau đó chạy `installOutboxWorker()` một lần để cài thêm trigger quét quá hạn.

### Cấu hình email, ZBS, SMS và Telegram

1. Quản trị → Cấu hình chung: nhập `Địa chỉ gateway` và tên thuộc tính token
   (mặc định `LS_GATEWAY_TOKEN`). Không lưu token vào Sheet.
2. Apps Script → Project Settings → Script properties: nạp token đúng tên đó.
   Bootstrap Admin chỉ trả cờ đã nạp, không trả giá trị token.
3. Quản trị → Kênh gửi tin:
   - Email: hộp thư gửi, MailApp và hạn mức ngày.
   - ZBS: OA, App ID, khóa bí mật phía máy chủ và mẫu ZBS đã duyệt.
   - SMS: provider, đầu số, `secret_ref` và mẫu SMS đã duyệt.
   - GMF: mã nhóm Zalo nội bộ và xác nhận đã kiểm chứng API gửi nhóm.
   - Telegram: tên bot, cờ đã nạp token và chat id của nhóm nội bộ. Người nhận cá
     nhân khai `telegram_chat_id` ở Quản trị → Người dùng; bot chỉ nhắn được cho
     người đã chủ động bắt đầu trò chuyện.
4. Bấm **Gửi thử** trên thẻ kênh để phát một tin thật tới chính tài khoản quản trị
   và đọc phản hồi của nhà cung cấp. Kênh đang ở chế độ thử nghiệm thì địa chỉ đó
   phải nằm trong danh sách cho phép.
5. Gateway phải trả `message_id`. Mỗi outbox có một dòng `NotificationMetrics`, ghi lượt,
   trạng thái, provider, đơn giá và phiên bản giá. Mở Quản trị → Chi phí & hiệu quả để xem.

Mẫu tin khai theo từng kênh. Một quy tắc liệt kê nhiều kênh dự phòng thì phải khai
đủ mẫu cho từng kênh, ngăn cách bằng dấu phẩy — ví dụ `TPL_HEN_KY,TPL_SMS_HEN_KY,TPL_MAIL_HEN_KY`.
Kênh không có mẫu khớp thì tin ghi `KHONG_GUI` kèm lý do, không mượn tạm mẫu của tin khác.
Riêng thông báo trong app không cần mẫu: nội dung dựng thẳng từ sự kiện.

Tin `THAT_BAI` được worker tự gửi lại theo `max_retry` với giãn cách 5 / 15 / 45 phút;
hết số lần thì chuyển `KHONG_GUI`. Trigger `overdueTick` chạy mỗi giờ để phát sự kiện
quá hạn theo quy tắc R5.

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `js/core.js` | Tiện ích, bộ biểu tượng SVG, kho localStorage, cộng giờ làm việc |
| `js/domain.js` | Vai trò, trạng thái, luật chuyển, kênh gửi tin, mẫu tin, hàng đợi |
| `js/gas-api.js` | Adapter SSO/GAS, chuyển đổi hàng dữ liệu Sheet và gọi API máy chủ |
| `js/ui.js` | Thành phần giao diện dùng lại |
| `js/screens.js` | Việc đã gửi, hàng chờ, việc của tôi, điều hành, nhật ký |
| `js/admin.js` | Bảng quản trị 16 mục, gồm số liệu gửi |
| `js/app.js` | Đăng nhập, điều hướng, phân phối sự kiện |
| `Code.gs` | API máy chủ: quyền, luật trạng thái, đề nghị sửa, quản trị, SLA theo lịch làm việc |
| `Notifications.gs` | Hàng đợi gửi, worker, đối soát |
| `DataRepository.gs` | Đọc/ghi Sheet, một lần giữ khóa mỗi giao dịch |
| `SetupSheetDB.gs` | Tạo và nâng cấp 17 bảng dữ liệu, gồm `CatalogOptions` và `NotificationMetrics` |

Tên trường và luật trạng thái của `Code.gs` khớp `js/domain.js`. Sửa một bên phải sửa bên kia.

## Phân quyền

| Vai trò | Thấy gì |
| --- | --- |
| Phòng / PGD | Việc của đơn vị mình. Sửa sau khi LS đã nhận thành đề nghị chờ kiểm soát duyệt |
| Kiểm soát LS | Hàng chờ, phân công, duyệt đề nghị sửa, duyệt hoàn thành, toàn bộ việc |
| Cán bộ LS | Chỉ việc được giao cho mình |
| Quản lý LS | Điều hành, tải việc, quá hạn, xuất báo cáo |
| Quản trị | Cấu hình và danh mục. **Không** xem được thông tin khách hàng |

## Kênh gửi tin

Sáu kênh: thông báo trong app, email công vụ, Zalo OA/ZBS, SMS, nhóm Zalo nội bộ (GMF), Telegram.

Mỗi kênh có danh sách điều kiện phải đạt mới bật được. Ví dụ ZBS cần OA + App ID,
khóa bí mật giữ phía máy chủ, **và** ít nhất một mẫu đã được Zalo duyệt. Thiếu một
điều kiện thì hệ thống khóa công tắc và tin đi qua kênh đó được ghi `KHONG_GUI`
kèm lý do, không im lặng bỏ qua.

Mẫu tin có danh sách biến cấm theo kênh, lấy từ mục 6 kế hoạch: tin nhóm nội bộ
không được chứa tên khách, CIF, sản phẩm, số tiền, số điện thoại; tin gửi khách
không được chứa CIF, sản phẩm, số tiền. Sửa nội dung mẫu đã duyệt sẽ tự chuyển về
chờ duyệt lại.

Tin gửi khách bắt buộc cán bộ xem trước và bấm xác nhận, ở ngay chi tiết việc.
Quản trị không xác nhận thay được: vai trò này không đọc được nội dung gửi khách
nên bấm xác nhận cũng là bấm mù. Quản trị vẫn hủy được mọi tin và xử lý tin nội bộ.

## Hạn xử lý

SLA tính theo **giờ làm việc thật** cả trên giao diện và phía GAS. Cấu hình ở Quản trị →
Lịch làm việc được lưu vào Settings: ngày làm việc, giờ mở/đóng, nghỉ trưa, ngày lễ.
Giao việc 16h thứ Sáu với SLA 4 giờ ra hạn sáng thứ Hai.

## Giao diện

Hướng thiết kế: Product Modernist — bề mặt phẳng, đường phân cách mạnh, mật độ cao.
Chữ Be Vietnam Pro (dựng riêng cho tiếng Việt) và IBM Plex Mono cho mã và số.
Biểu tượng là SVG nội tuyến trong `js/core.js`, không dùng emoji.
Đã kiểm ở 320 / 390 / 768 / 1440, không có cuộn ngang, có trạng thái rỗng và
vòng focus bàn phím, tôn trọng `prefers-reduced-motion`.
