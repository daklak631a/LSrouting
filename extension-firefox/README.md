# LS-Routing cho Firefox

Dành cho **Quản lý LS** và **Kiểm soát LS**, Firefox 140 trở lên.

## Cài cố định — bản đã ký Mozilla

1. Tải `ls-routing-firefox-1.0.0.signed.xpi` từ trang GAS `?download=firefox` hoặc `outputs/`. Không giải nén file XPI.
2. Mở Firefox, nhập `about:addons` trên thanh địa chỉ.
3. Bấm bánh răng → **Install Add-on From File…** → chọn file XPI.
4. Xem quyền được yêu cầu và chọn **Add**. Ghim biểu tượng LS-Routing lên thanh công cụ.
5. Mở hoặc tải lại LS-Routing, đăng nhập Quản lý LS/Kiểm soát LS.

Đã ký nên tiện ích còn được cài khi khởi động lại Firefox. File gốc do chủ tài khoản gửi từ Mozilla, được giữ nguyên byte; SHA-256 `0b4f3099148cb29c3697a00ac9437435df45c8b75f651398b6d984a06313e995`.

Chữ ký CMS đã được kiểm tra, hash các tài nguyên trong manifest chữ ký khớp, nội dung extension khớp mã nguồn 1.0.0. Firefox kiểm tra chuỗi tin cậy Mozilla khi cài.

Mã nguồn extension hiện là **1.0.1**, gồm cập nhật chỉ thông báo việc phát sinh trong ngày. Gói thử mới ở [`../outputs/ls-routing-firefox-1.0.1.zip`](../outputs/ls-routing-firefox-1.0.1.zip); gói này chưa ký Mozilla nên chỉ cài tạm được. XPI cố định đã ký hiện vẫn là 1.0.0.

## Cài bản dùng thử

1. Tải `outputs/ls-routing-firefox-1.0.1.zip`, giải nén.
2. Mở `about:debugging#/runtime/this-firefox` trong Firefox.
3. Chọn **Load Temporary Add-on…**, chọn `manifest.json` trong thư mục vừa giải nén.
4. Mở link LS-Routing đang dùng; nếu tab đã mở từ trước, tải lại trang một lần. Đăng nhập QL/KS LS.
5. Ghim biểu tượng LS-Routing từ menu Extensions lên thanh công cụ.

Bản cài tạm mất khi khởi động lại Firefox. Firefox bản thường cần gói XPI có chữ ký Mozilla để cài cố định. Gói `unsigned.xpi` chưa có chữ ký, không thể cài cố định bằng cách mở trực tiếp.

## Cài cố định và chia sẻ nội bộ

Tại https://addons.mozilla.org/developers/ đăng nhập tài khoản Mozilla → Submit a New Add-on → chọn phân phối **On your own** → tải gói ZIP lên, khai báo quyền và mục đích dùng nội bộ → chờ Mozilla ký → tải XPI đã ký để phân phối. Không cần công bố extension trên cửa hàng.

## Cách hoạt động

- Kiểm tra mỗi phút khi Firefox đang chạy; có thể chậm hơn khi máy ngủ hoặc mất mạng.
- Đếm hồ sơ chờ phân công trong kỳ đang hoạt động, gộp các việc cùng một đề nghị.
- Báo hồ sơ mới hoặc việc mới thêm vào hồ sơ còn chờ; phân công bớt việc không tạo thông báo mới.
- Bấm thông báo hoặc **Mở danh sách phân công** để vào hàng chờ.
- Vẫn kiểm tra khi đóng tab ứng dụng, đến khi phiên đăng nhập hết hạn (tối đa 12 giờ). Đăng nhập lại ứng dụng để kết nối lại.
- Đăng xuất, khóa tài khoản, đổi sang vai trò khác hoặc hết phiên thì dừng nhận. Firefox đóng hoàn toàn thì không kiểm tra.
- Windows phải cho phép Firefox gửi thông báo; chế độ Không làm phiền có thể ẩn popup, số trên biểu tượng vẫn được cập nhật.

## Quyền và dữ liệu

Extension dùng `alarms`, `notifications`, `storage` và quyền truy cập hai miền Google Apps Script/Googleusercontent do ứng dụng chạy trong iframe và API trả qua miền Googleusercontent. Extension chỉ ghép với đúng hai deployment được khai báo trong `config.js`.

Chỉ lưu mã đọc hàng chờ có thời hạn, mã tài khoản, vai trò, số hồ sơ và mã đề nghị/việc để tránh báo trùng. Không đọc mật khẩu, không lưu mã phiên ứng dụng, không nhận tên khách/CIF/điện thoại/email. Mã đọc hàng chờ không dùng được để xem dữ liệu hồ sơ hoặc ghi nghiệp vụ. Mã này được gửi đến GAS trong thân POST; không đặt trong URL. Không có dịch vụ phân tích/telemetry.

Manifest khai báo `authenticationInfo` vì extension gửi mã đọc hàng chờ đến GAS để xác thực. Firefox hiển thị quyền này khi cài.

## Đóng gói lại

Chạy `node build-firefox-extension.mjs`. Gói chỉ chứa chín file chạy extension; tài liệu, dữ liệu ứng dụng và cấu hình clasp không được đưa vào. Build giữ nguyên XPI đã ký nếu nguồn khớp; thay đổi nguồn cùng phiên bản 1.0.0 sẽ báo lỗi thay vì phát hành gói có chữ ký cũ. Khi đổi extension, tăng phiên bản và gửi Mozilla ký lại; giữ nguyên file trả về rồi cập nhật `signed-package.json`.
