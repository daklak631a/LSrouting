# Firefox 1.0.0 — phát hành XPI đã ký

## Gói cài

- File gốc chủ tài khoản cung cấp: `1e9c6f45ea57496ab957-1.0.0.xpi`.
- File phân phối: `outputs/ls-routing-firefox-1.0.0.signed.xpi`, 15.089 byte.
- SHA-256: `0b4f3099148cb29c3697a00ac9437435df45c8b75f651398b6d984a06313e995`.
- ID extension: `ls-routing-notify@ls-routing.local`; phiên bản 1.0.0, dành cho QL LS và Kiểm soát LS.
- Gói được sao chép nguyên byte, không đóng gói lại. Chữ ký CMS đã qua `SignedCms.CheckSignature(true)`, hash manifest và tài nguyên khớp. Phép kiểm tra CMS này không kiểm tra chuỗi tin cậy; Firefox kiểm tra tin cậy Mozilla khi cài.

## GAS v86

Đã push đủ 7 file, tạo phiên bản 86 và cập nhật cả hai deployment hiện có, giữ nguyên URL:

| Link | Deployment |
| --- | --- |
| QR | `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH` |
| Hyperlink | `AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2` |

Trang tải: thêm `?download=firefox` vào URL `/exec` đang dùng. Trang hiện hướng dẫn cài cố định qua `about:addons` → bánh răng → **Install Add-on From File…**.

## Bằng chứng

- `clasp deployments`: cả hai deployment cùng `@86`.
- GET `/exec` và GET `?download=firefox` có tham số chống cache: HTTP 200 trên cả hai link.
- Sau giải mã dữ liệu sandbox GAS và HTML entity, file XPI từ từng trang tải khớp hoàn toàn 15.089 byte của file gốc và SHA-256 nêu trên.
- HTTP feed từ chối token không hợp lệ: `{ "ok": false, "code": "INVALID" }`.
- Kết quả: `outputs/gas-v86-firefox-date-health.json`.
- Đã qua: signed-package, Firefox download, Firefox extension, requested-date, GAS, auth, warehouse-steps contract; prepare-clasp và `git diff --check`.

Chưa kiểm tra trực tiếp việc cài trong Firefox, popup Windows hoặc nghiệp vụ đăng nhập trên tài khoản thật. Đóng hoàn toàn Firefox thì extension không kiểm tra hồ sơ; hết phiên cần đăng nhập lại ứng dụng.

## Phát hành tiếp

Build đối chiếu runtime source với XPI đã ký và từ chối nguồn lệch cùng phiên bản. Khi sửa extension, tăng phiên bản, gửi Mozilla ký lại rồi cập nhật file XPI và `extension-firefox/signed-package.json`. Sửa ứng dụng GAS không đòi hỏi ký lại nếu extension không đổi.

Hướng dẫn Mozilla: https://extensionworkshop.com/documentation/publish/install-self-distributed/
