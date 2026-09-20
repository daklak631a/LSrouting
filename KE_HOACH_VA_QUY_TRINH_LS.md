# Kế hoạch và quy trình hệ thống hỗ trợ tín dụng LS

**Trạng thái:** Bản nháp để nghiệp vụ, CNTT và an toàn thông tin góp ý; chưa phê duyệt triển khai.  
**Ngày lập:** 19/09/2026.  
**Mục tiêu:** Thay việc nhập và phân công bằng Google Sheet thủ công bằng một luồng có trách nhiệm, trạng thái, thông báo và báo cáo rõ ràng. **Ràng buộc đã xác nhận:** người dùng nội bộ chỉ truy cập giao diện GAS; cần tạo một hệ thống Sheet **mới, lưu liên tục qua các tuần** bằng script, không xóa dữ liệu để bắt đầu tuần sau. API bên ngoài, nếu được phê duyệt, chỉ do GAS phía máy chủ gọi, không phải trang web mà cán bộ phải mở.

## 1. Căn cứ và ranh giới

- [Kế hoạch hỗ trợ tín dụng tuần 4 tháng 9](https://docs.google.com/spreadsheets/d/18CIBRA4nTFDio7Z1P0ESxP1UwR17F_KKXUMTs6ILqSI/edit) có tab của từng phòng/PGD, `GBS`, `GDT`, `Tổng hợp`. Phòng nhập khách hàng, CIF, loại việc/sản phẩm và đánh dấu `1` ở ngày có phát sinh; kiểm soát LS tổng hợp rồi phân giao. Ở mẫu tuần 21–25/09, 25 việc khớp tổng theo đơn vị và loại việc, nhưng 25/25 vẫn hiển thị chưa phân giao/chưa giao, 8 việc thiếu CIF. Lần rà soát ban đầu phát hiện `Tổng hợp!H48:P48` chia cho 0; đã sửa công thức để hiển thị `Chưa có dữ liệu` khi mẫu số bằng 0 và thêm guard tương tự cho workbook tháng mới.
- [DATA FROM LS](https://docs.google.com/spreadsheets/d/1iIHIlbZLB6yXMTjzRpipwpNoer7ifj3h0ePIvUMs0hw/edit) nhập `DASH`/`DASHQLKH!A1:Z200` từ một bảng thứ ba bằng `IMPORTRANGE`. Hai tab đang chỉ có tiêu đề/cột tại ngày hiển thị 19/09. Cần xác minh nguồn gốc và mục đích của bảng này trước khi hứa đồng bộ tự động.
- Kho mã cha `E:\bank routing` hiện phục vụ **phân luồng khách tại quầy**. Hồ sơ LS là phân hệ khác: không gộp trạng thái, KPI hay dữ liệu nhạy cảm của LS vào luồng kiosk công khai. Chỉ xem xét dùng chung danh mục đơn vị/tài khoản sau khi xác minh ranh giới quyền.
- Hệ thống này điều phối công việc soạn và hoàn thiện hồ sơ, **không** phê duyệt khoản vay, quyết định tín dụng, tự động ký hay xác nhận khách đã ký.

## 2. Kết luận phương án triển khai (đề xuất để duyệt)

| Phương án | Ưu điểm | Giới hạn/rủi ro | Kết luận |
| --- | --- | --- | --- |
| **A. GAS Web App + Sheet mới lưu liên tục + API ngoài để gửi tin** | Khớp yêu cầu một hệ thống GAS/Sheet mới, không xóa theo tuần; API ngoài có thể lo ZBS và nhận webhook. | Sheet không có transaction nhiều bảng và phân quyền theo dòng như database; cần khóa ghi, phiên bản, nhật ký, sao lưu và đối soát outbox. API ngoài không được tự biến thành kho hồ sơ thứ hai. | **Ưu tiên nghiên cứu/pilot theo lựa chọn mới của anh**, chỉ đưa dữ liệu thật khi CNTT/an toàn thông tin duyệt và thử đồng thời đạt. |
| **B. GAS Web App + API/database (ví dụ Supabase) làm nguồn chính + Sheet báo cáo tự sinh** | Cán bộ vẫn chỉ mở GAS; database mạnh hơn về cập nhật đồng thời, quyền và sự kiện; Sheet vẫn có thể xem/xuất báo cáo liên tục. | Cần phê duyệt outbound HTTPS và lưu hồ sơ ngoài, định danh xuyên hệ thống, bảo vệ khóa và vận hành API/worker. | **Phương án chuyển đổi** nếu Sheet không đạt cổng toàn vẹn/bảo mật hoặc khối lượng lớn; giữ nguyên giao diện GAS. |
| **C. App nội bộ độc lập + API + database** | Kiểm soát kỹ thuật sâu hơn. | Người dùng nội bộ không truy cập được app ngoài theo ràng buộc hiện tại. | Không chọn cho giao diện nội bộ; chỉ xem lại nếu hạ tầng/quy định truy cập đổi về sau. |

**Hướng được anh chọn:** làm *proof of concept GAS-first* với script tạo **Sheet dữ liệu mới, dùng xuyên suốt** và 3 màn hình nội bộ bằng dữ liệu giả; thử song song GAS server → API ngoài. Nếu cổng bảo mật/định danh/đồng thời đạt, pilot **A**: Sheet mới là **một nguồn hồ sơ chính**, API ngoài chỉ nhận yêu cầu gửi tin có mã và dữ liệu tối thiểu, lưu log giao nhận riêng rồi trả trạng thái. **Không bắt buộc có Supabase để gọi ZBS** — GAS có thể gọi HTTPS trực tiếp — nhưng API/worker ngoài giúp giữ khóa nhà cung cấp, webhook và retry ngoài phiên GAS. Nếu A không đạt, **dừng trước dữ liệu thật và trình anh phương án B để quyết định**, không tự ý đổi kho chính: khi đó Supabase có thể là một nguồn hồ sơ chính, Sheet mới chỉ là báo cáo/tệp đối chiếu được sinh từ database. **Không được coi Sheet và Supabase là hai “database hồ sơ” cùng cho phép sửa**, vì sẽ lệch trạng thái. Thiết kế giao diện qua lớp `WorkRepository`/`NotificationAdapter` để có đường chuyển đổi nếu được duyệt. Hai Sheet cũ chỉ là nguồn đối chiếu trong giai đoạn chuyển tiếp.

Trình duyệt cán bộ chỉ tải trang GAS và gọi `google.script.run`; **mã GAS chạy trên máy chủ Google** dùng `UrlFetchApp` gọi HTTPS API ngoài. Vì vậy việc trình duyệt nội bộ không mở được Supabase không tự ngăn mô hình B. Tuy nhiên CNTT phải xác nhận GAS được cấp quyền `script.external_request`, URL/IP outbound được cho phép, và nơi đặt API/database đáp ứng chính sách lưu trữ dữ liệu. Đây là suy luận kiến trúc từ [Google HTML Service](https://developers.google.com/apps-script/guides/html/communication) và [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app), **chưa phải kết quả thử trên mạng nội bộ ngân hàng**.

Lý do cần cổng thử nghiệm: GAS Web App có chế độ chạy dưới quyền người triển khai hoặc người truy cập; quyền truy cập có thể giới hạn theo domain. Email người truy cập qua `Session.getActiveUser()` có thể rỗng trong một số cấu hình, nhất là chạy dưới quyền người triển khai. Hạn mức Google có thể đổi, hiện tài liệu ghi 6 phút/lần chạy và hạn mức gửi thư khác nhau giữa tài khoản cá nhân và Workspace. `google.script.run` là bất đồng bộ; `LockService` giúp khóa đoạn ghi chung nhưng không biến nhiều tab Sheet thành giao dịch cơ sở dữ liệu. Cần kiểm chứng với **tài khoản và chính sách Google Workspace thực tế của ngân hàng**, không suy ra từ tài khoản đang mở bảng. Nguồn: [Web Apps](https://developers.google.com/apps-script/guides/web), [Session](https://developers.google.com/apps-script/reference/base/session), [Quotas](https://developers.google.com/apps-script/guides/services/quotas), [Lock Service](https://developers.google.com/apps-script/reference/lock), [HTML Service](https://developers.google.com/apps-script/guides/html/communication).

### Cổng quyết định kho A/B trước khi dùng dữ liệu thật

1. CNTT/an toàn thông tin xác nhận nơi lưu dữ liệu khách hàng, tài khoản triển khai thuộc tổ chức, danh sách người truy cập, sao lưu và thời hạn lưu; không dùng tài khoản Gmail cá nhân làm chủ vận hành.
2. Thử hai cấu hình thực thi GAS bằng tài khoản của **hai phòng và hai vai trò**: định danh server phải rõ, quyền đọc/ghi theo đơn vị không rò sang phòng khác. Nếu `Session.getActiveUser().getEmail()` không xác định được người thao tác trong cấu hình được chọn, chặn giao dịch; không thay bằng email do trình duyệt tự gửi. Với B, người dùng không cần được chia sẻ Sheet hay Supabase trực tiếp.
3. Thử GAS server gọi API ngoài bằng tài khoản thử và dữ liệu giả; kiểm tra chặn khi URL/API lỗi, timeout, DNS/IP allowlist, khóa hết hạn, lỗi quyền và mất kết nối. Tiếp đó thử ghi đồng thời, nhấp gửi lặp, lỗi giữa ghi việc–ghi lịch sử–xếp thông báo; không mất việc, không giao hai người ngoài chủ đích, không gửi trùng. Nếu không chứng minh được toàn vẹn trên Sheet, dừng và trình phương án B xin quyết định; nếu GAS không thể gọi API được duyệt, chưa bật ZBS/kênh ngoài.
4. Đo trên tải thực tế dự kiến: số người dùng đồng thời, số việc/ngày, số thông báo/ngày, thời gian phản hồi p95 và tỷ lệ lỗi. Chốt ngưỡng nghiệm thu với bộ phận vận hành trước pilot; không lấy mức trần công bố làm cam kết hiệu năng.
5. Nhà cung cấp/email/Zalo và pháp chế nội bộ duyệt mẫu nội dung, người gửi, mục đích liên hệ, lịch sử chấp thuận/khước từ, dữ liệu được phép ra ngoài. Không bật kênh chưa được duyệt.

## 3. Vai trò và màn hình

| Vai trò | Màn hình chính | Quyền tối thiểu |
| --- | --- | --- |
| Cán bộ phòng/PGD gửi việc | **A – Việc phòng tôi đã gửi** | Tạo nháp và đăng ký một khách nhiều loại việc/sản phẩm/ngày; xem danh sách theo đơn vị, tìm khách/mã việc, mở lại để sửa thông tin và theo dõi tiến độ; không tự phân công LS. |
| Kiểm soát LS | **B – Tiếp nhận và phân công** | Xem hàng chờ LS, kiểm tra đủ thông tin, yêu cầu bổ sung, sửa loại việc/sản phẩm khi cần, phân công/đổi người có lý do, theo dõi tải và quá hạn, xem tổng hợp toàn LS. |
| Cán bộ LS | **C – Việc của tôi** | Nhận việc đã giao, cập nhật tiến độ/checklist; sửa loại việc/sản phẩm trong phạm vi được cấp và có lịch sử; báo đã soạn xong, tạo lời hẹn, hoàn tất theo quy tắc loại việc. Không xem việc của đồng nghiệp nếu không được giao/chuyển giao. |
| Quản lý LS | **D – Điều hành, báo cáo** | Xem số liệu nhiều đơn vị, xử lý ngoại lệ, phân quyền phê duyệt đặc biệt, xuất báo cáo theo phạm vi; không sửa âm thầm lịch sử. |
| Quản trị hệ thống | **E – Cài đặt** | Quản lý danh mục/role/cấu hình kênh và mẫu, nhưng không mặc nhiên được xem nội dung hồ sơ khách; thao tác cấu hình được lưu vết. |
| Kiểm tra/kiểm toán | **F – Nhật ký và báo cáo** | Chỉ đọc theo phạm vi được cấp, có lịch sử ai làm gì/khi nào và xuất dữ liệu được kiểm soát. |

Một người có thể mang nhiều vai trò nhưng quyền server là tổng các quyền được cấp rõ ràng theo đơn vị; giao diện ẩn nút không thay thế kiểm tra quyền tại server. Khi đổi phòng, quyền cũ phải thu hồi và các việc đang giao được xử lý theo quy trình bàn giao.

**Quyền sửa sau khi gửi:** phòng/PGD luôn xem được danh sách hồ sơ của **đơn vị mình** và gửi yêu cầu chỉnh sửa. Khi chưa tiếp nhận, phòng được sửa trực tiếp các trường mình nhập. Sau khi đã phân công, phòng vẫn sửa được nhưng thay đổi ảnh hưởng khách/CIF, loại việc, sản phẩm, ngày, hạn hoặc liên hệ phải thành **phiên bản đề nghị sửa** để KS LS xác nhận, tránh cán bộ LS xử lý trên dữ liệu đổi ngầm. KS LS được sửa trực tiếp hồ sơ đang mở với lý do và thông báo cho người phụ trách. Cán bộ LS được sửa loại việc/sản phẩm của việc mình đang xử lý; nếu thay đổi làm đổi SLA, checklist, người xử lý hoặc nội dung đã hẹn khách, phải KS xác nhận trước khi hiệu lực. Sửa sau hoàn tất đi qua “mở lại”, không ghi đè kết quả cũ. Mọi lần sửa lưu người sửa, giờ server, giá trị trước/sau, lý do và phiên bản để phát hiện hai người sửa cùng lúc.

## 4. Luồng vận hành chuẩn

```text
Phòng/PGD tạo 1 yêu cầu (1 KH, nhiều việc/ngày) → gửi LS
    → KS kiểm tra/chỉnh → thiếu: trả bổ sung cho phòng
                       → đủ: phân giao từng việc → LS thực hiện
                                               → soạn xong → hẹn/gọi KH nếu cần
                                               → hoàn tất LS → báo cáo
Phòng luôn xem lại danh sách đã gửi; sửa sau phân giao → KS xem bản thay đổi
```

1. **Phòng nhập việc:** tìm/chọn khách hàng hoặc khai báo khách mới; chọn **nhiều loại việc và sản phẩm trong một lần đăng ký** (ví dụ nhóm món vay/thấu chi, vay mới/vay lại/tái cấp, sản phẩm/bảo đảm), rồi thêm thông tin riêng cho từng việc. Chọn “cùng một ngày” hoặc “chia theo nhiều ngày”; mỗi việc/lần phát sinh có ngày dự kiến, hạn xử lý và nội dung riêng. Hệ thống tự ghi `created_at`; người dùng không gõ `1` vào cột ngày. Ngày tạo, ngày dự kiến và ngày thực tế phát sinh phải là ba mốc khác nhau khi có khác biệt.
2. **Phòng xem và sửa việc đã gửi:** màn A có danh sách theo phòng/PGD, lọc ngày/trạng thái/khách/loại việc; mở một khách để thấy tất cả việc và các ngày đã đăng ký. Sửa theo quy tắc quyền ở mục 3, có nút “Gửi thay đổi” và so sánh trước/sau. Phòng thấy rõ “đang chờ KS duyệt sửa”, không phải gửi lại hồ sơ mới để chữa một lỗi nhập liệu.
3. **Gửi và tiếp nhận:** nút “Gửi LS” kiểm tra trường bắt buộc theo từng loại việc, chống gửi lặp và tạo mã hồ sơ/mã việc/lần phát sinh duy nhất. KS LS nhìn thấy ngay việc mới, lọc theo đơn vị/loại/ngày, chọn “Yêu cầu bổ sung”, “Tiếp nhận” hoặc sửa phân loại với lý do. Nếu chưa có CIF, người nhập chọn **“KH mới”**, để trống CIF hợp lệ và dùng mã hồ sơ nội bộ; không điền CIF giả hoặc buộc tạo khách trùng. Khi ngân hàng cấp CIF, cập nhật trên hồ sơ có lịch sử.
4. **Phân công bắt buộc:** **mọi việc** sau khi gửi đều qua KS LS tiếp nhận và chọn cán bộ LS đang hoạt động; không tự giao theo phòng, không bỏ qua màn kiểm soát. KS đặt hạn xử lý và mức ưu tiên có lý do; có thể chia một hồ sơ thành các đầu việc cho nhiều người nhưng **mỗi việc/lần phát sinh có một người chịu trách nhiệm chính**. Ghi sự kiện phân công, phát thông báo nội bộ sau khi lưu thành công. Tái phân công bắt buộc lý do, giữ lịch sử người cũ/mới, không tạo việc trùng.
5. **Thực hiện:** cán bộ LS cập nhật checklist/tệp tham chiếu/trạng thái `Đang thực hiện`, báo vướng mắc hoặc trả lại KS. Khi phân loại ban đầu không phù hợp, LS được sửa loại việc/sản phẩm theo quy tắc mục 3; checklist/SLA được tính lại và KS được báo. “Soạn xong” là mốc riêng; không đồng nghĩa khách đã được liên hệ hay đã ký.
6. **Hẹn khách:** với loại việc cần khách ký, cán bộ chọn “Hẹn khách ký hồ sơ”, xác nhận số/email đã được phép dùng, thời gian/địa điểm và xem trước nội dung. Nút “Gọi khách” mở công cụ gọi do tổ chức cho phép và yêu cầu cán bộ ghi kết quả cuộc gọi; **không mặc định hệ thống tự gọi hoặc ghi âm**. Cán bộ có thể chọn một kênh được duyệt và bấm gửi; trạng thái gửi/nhận được theo dõi riêng. Khách đổi lịch, không liên lạc được hoặc từ chối được ghi là kết quả hẹn, không âm thầm biến thành “hoàn thành”.
7. **Hoàn tất:** điều kiện phụ thuộc loại việc: checklist bắt buộc, kết quả xử lý, và nếu cần hẹn thì kết quả liên hệ/hẹn hợp lệ. Người thực hiện bấm hoàn tất; nếu cần kiểm tra hai cấp thì KS xác nhận trước khi chốt (cấu hình từng loại việc). Hoàn tất LS chỉ xác nhận phạm vi công việc LS; việc khách đã ký là cột/mốc riêng nếu tổ chức thực sự cần theo dõi.
8. **Ngoại lệ:** hủy do phòng rút yêu cầu, tạm dừng vì chờ hồ sơ, trả bổ sung, chuyển giao do nghỉ phép, mở lại sau hoàn tất đều cần người có quyền, lý do và sự kiện bất biến. Không xóa vật lý đầu việc đã phát sinh.

### Một khách đăng ký nhiều việc và nhiều ngày

- **Đăng ký một lần, nhiều việc:** một `WorkRequest` giữ thông tin khách/phòng; mỗi lựa chọn loại việc–sản phẩm là một `WorkItem` có checklist, hạn, người xử lý và kết quả độc lập. Giao một việc không tự giao các việc khác. Người dùng có thể chọn nhiều việc cùng ngày hoặc đặt ngày khác nhau cho từng việc.
- **Cùng việc kéo dài qua nhiều ngày:** giữ **một** việc, thêm các mốc/ngày hẹn/ngày dự kiến trong lịch; không tính mỗi ngày là một hồ sơ phát sinh mới.
- **Cùng loại việc nhưng phát sinh hồ sơ mới vào ngày khác:** tạo một `WorkOccurrence`/lần phát sinh mới có mã riêng và trạng thái/phân công riêng dưới việc đó; nếu là khoản vay hoặc sản phẩm khác thì tạo `WorkItem` khác. Giao diện bắt buộc chọn “hồ sơ mới” hoặc “mốc tiếp diễn”. Báo cáo ngày đếm lần phát sinh, báo cáo tồn đếm việc/lần còn mở, báo cáo khách đếm khách duy nhất — ba chỉ số không trộn lẫn.
- Dời ngày hoặc sửa loại việc sau phân công không xóa ngày gốc; lịch sử và thông báo thay đổi được ghi. Không gửi lại lời hẹn khách tự động chỉ vì ngày trong hồ sơ đổi; người có quyền phải xác nhận nội dung gửi lại.

### Trạng thái đề xuất

| Trạng thái việc | Người chuyển | Điều kiện/mốc ghi nhận |
| --- | --- | --- |
| `NHAP` → `CHO_TIEP_NHAN` | Phòng | Kiểm tra dữ liệu và chống trùng; ghi `submitted_at`. |
| `CHO_TIEP_NHAN` → `CAN_BO_SUNG` → `CHO_TIEP_NHAN` | KS, rồi phòng | Lý do và phiên bản thông tin sau sửa. |
| `CHO_TIEP_NHAN` → `CHO_PHAN_CONG` → `DA_PHAN_CONG` | KS | Ghi `accepted_at`, `assigned_at`, người phụ trách. |
| `DA_PHAN_CONG` → `DANG_THUC_HIEN` → `DA_SOAN_XONG` | Cán bộ LS | Ghi thời điểm, checklist/tệp tham chiếu. |
| `DA_SOAN_XONG` → `DANG_HEN_KH` → `HOAN_THANH_LS` | Cán bộ LS; KS nếu cần duyệt | Bỏ bước hẹn nếu loại việc không cần; lưu kết quả, `completed_at`. |
| Trạng thái đang mở → `TAM_DUNG`/`HUY`; `HOAN_THANH_LS` → `MO_LAI` | Người có quyền | Lý do và nhật ký; mở lại tạo vòng xử lý mới, không sửa đè lần cũ. |

**Trạng thái thông báo** (`CHO_GUI`, `DANG_GUI`, `DA_GUI`, `THAT_BAI`, `KHONG_GUI`) và **kết quả hẹn** (`CHUA_LIEN_HE`, `DA_HEN`, `DOI_LICH`, `KHONG_LIEN_LAC_DUOC`, `TU_CHOI`, `DA_KY` nếu có xác minh) là hai trục **tách khỏi trạng thái việc**. “Đã gửi” không có nghĩa khách đã đọc/đồng ý/đã ký.

## 5. Dữ liệu và danh mục

- `CustomerRef`: mã tham chiếu nội bộ; tên; `customer_kind=KH_MOI` khi chưa có CIF, hoặc `DA_CO_CIF` khi đã có; CIF được phép để trống với `KH_MOI` và bổ sung sau. Không dùng tên/số điện thoại làm khóa duy nhất. Thông tin liên hệ được lưu riêng, chỉ hiển thị theo quyền.
- `WorkRequest`: mã hồ sơ, phòng gửi, người gửi, thời điểm tạo/gửi, mô tả tổng quát, khách tham chiếu; một hồ sơ có nhiều `WorkItem`. Màn danh sách phòng truy vấn theo đơn vị của người dùng đã xác thực, không tin tham số phòng từ trình duyệt.
- `WorkItem`: mã việc, mã loại việc/phiên bản danh mục, sản phẩm, khoản cấp vay/bảo đảm liên quan, ngày dự kiến, hạn xử lý, người chịu trách nhiệm, trạng thái, checklist và kết quả. Một yêu cầu có thể chứa nhiều loại/sản phẩm. Số tiền/khoản vay chỉ thêm khi chứng minh cần thiết cho LS và được duyệt phạm vi truy cập.
- `WorkOccurrence`/`WorkSchedule`: phân biệt lần phát sinh hồ sơ mới với mốc của cùng việc kéo dài qua nhiều ngày; có mã, ngày, trạng thái và liên kết việc gốc. Bản thiết kế dữ liệu cuối cùng phải khóa định nghĩa này với nghiệp vụ trước khi nhập lịch sử từ dấu `1` trong Sheet.
- `WorkRevision`: phiên bản dữ liệu, người đề nghị/sửa/người duyệt, trường cũ/mới, lý do, thời điểm và trạng thái duyệt; cập nhật dùng `expected_version` để báo xung đột nếu hai người cùng sửa, không ghi đè im lặng.
- `AssignmentEvent` và `WorkEvent`: sự kiện thêm/chuyển người, đổi trạng thái, bổ sung, hủy/mở lại, người thao tác, giờ server, lý do, trước/sau. Nhật ký chỉ thêm, không cho người dùng sửa.
- `Appointment` và `NotificationOutbox`: lịch hẹn, kênh, mẫu đã duyệt, người xác nhận gửi, khóa chống gửi trùng, mã phản hồi nhà cung cấp, lần thử và kết quả; không lưu nội dung nhạy cảm dư thừa trong log.
- `WorkType`: mã ổn định, nhóm, tên hiển thị, thứ tự, trạng thái hoạt động, trường/checklist bắt buộc, có cần hẹn/duyệt, SLA. Sửa tên tạo phiên bản để báo cáo cũ giữ đúng nhãn lúc phát sinh; **xóa mềm/ẩn** khi đã từng được dùng, không xóa làm hỏng lịch sử.
- Danh mục khác: đơn vị, nhân sự/role, ngày làm việc/ngày nghỉ, SLA theo loại, lý do tạm dừng/hủy/chuyển giao, mẫu thông báo, kênh và ưu tiên kênh, người phê duyệt, thời hạn lưu trữ, giới hạn xuất báo cáo, lịch sao lưu.

Chuyển dữ liệu Sheet: giữ bản chụp chỉ đọc; ánh xạ tên phòng/loại việc sang mã mới, mỗi dấu `1` ở cột ngày được đối chiếu là **lần phát sinh hồ sơ mới** hay **mốc tiếp diễn của cùng việc** trước khi tạo bản ghi; không suy đoán tự động. Gắn mã nguồn `sheet/tab/row/date` để truy vết; đối soát riêng số khách, số việc, số lần phát sinh theo ngày/đơn vị/loại và các CIF trống. Không tự động gửi email/Zalo cho dữ liệu nhập lịch sử.

## 6. Thông báo và kênh liên hệ

| Sự kiện | Người nhận | Kênh đề xuất | Biện pháp an toàn |
| --- | --- | --- | --- |
| Giao/chuyển việc | Cán bộ LS, KS liên quan | Thông báo trong app + email công vụ; nhóm Zalo OA/GMF **nếu API và tổ chức cho phép** | Nhóm chỉ nhận mã việc, đơn vị, hạn và link yêu cầu đăng nhập; **không tên KH, CIF, số tiền, điện thoại hay tài liệu**. |
| Trả bổ sung/quá hạn | Phòng gửi, người phụ trách, KS | Trong app + email; nhắc theo lịch | Có giới hạn tần suất, leo thang đúng người; không lặp tin mỗi lần tải trang. |
| Hẹn ký hồ sơ | Khách hàng đã xác minh thông tin liên hệ và được phép liên hệ | Email hoặc Zalo OA/ZBS Template (trước đây thường gọi ZNS), tùy điều kiện; Telegram chỉ khi khách chủ động kết nối bot và được tổ chức duyệt | Cán bộ xem trước và xác nhận; mẫu không nêu chi tiết khoản vay/CIF/đính kèm. Lưu căn cứ lựa chọn kênh, kết quả gửi, cơ chế sửa/hủy hẹn. |

**Kênh sẽ tự thiết lập:** tạo dự án Google Cloud Console, bật Gmail API và cấu hình tài khoản gửi/OAuth hoặc ủy quyền Workspace theo quyền của quản trị viên; chọn hộp thư công vụ gửi thông báo, không dùng mật khẩu Gmail hay tài khoản cá nhân. Bật API trong Console **chưa đủ để gửi mail**: còn cần quyền `gmail.send`, tài khoản gửi và cơ chế ủy quyền đã được phê duyệt. Với pilot, `MailApp` trong GAS là phương án đơn giản hơn nhưng danh tính người gửi và hạn mức phụ thuộc tài khoản thực thi, phải kiểm thử. [Gmail API: gửi thư](https://developers.google.com/workspace/gmail/api/guides/sending), [tạo quyền truy cập Workspace](https://developers.google.com/workspace/guides/create-credentials), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).

Tạo OA/ZBS của tổ chức, đăng ký **mẫu tin hẹn khách** để Zalo kiểm duyệt, sau đó mới cấu hình khóa/kênh trong dịch vụ gửi ngoài; nhóm GMF là cấu hình riêng cho thông báo nội bộ và phải qua kiểm tra khả năng API. “Tự tạo ZBS” không đồng nghĩa mẫu đã được duyệt hoặc kênh đã gửi được; lúc chưa sẵn sàng, trạng thái kênh là `CHUA_KICH_HOAT`. [Zalo OA: ZBS Template](https://oa.zalo.me/home/function/interaction).

Thông báo ra ngoài chạy qua **outbox** sau khi việc/lịch hẹn đã ghi. Nếu Sheet mới là nguồn chính, hàng đợi gửi có mã riêng trong Sheet; GAS worker chuyển yêu cầu tới API ngoài, API/worker gửi Gmail/ZBS và giữ mã nhà cung cấp, rồi GAS đối soát kết quả về hàng đợi. Nếu Supabase là nguồn chính, outbox và việc nằm trong cùng database transaction. Cả hai cách cần khóa chống gửi trùng, retry hữu hạn và cảnh báo lỗi; gửi lại phải kiểm tra mã phản hồi nhà cung cấp. Không coi email gửi thành công là xác nhận khách đã nhận. Không dùng `onEdit` Sheet làm bộ máy phát tin; trigger cài đặt chạy dưới tài khoản người tạo, không tự mang danh tính người vừa sửa. [Google: installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).

Zalo hiện mô tả tin nhóm OA/GMF và tin doanh nghiệp theo mẫu được kiểm duyệt; quyền truy cập/gói, loại mẫu và khả năng gửi tới nhóm cụ thể phải kiểm tra trên OA của tổ chức trước khi cam kết. Telegram bot không chủ động nhắn riêng cho người chưa từng bắt đầu trò chuyện hoặc thêm bot vào nhóm, nên không thể lấy số điện thoại trong Sheet rồi tự gửi Telegram. Nguồn: [Zalo OA – tương tác](https://oa.zalo.me/home/function/interaction), [Zalo Developers](https://developers.zalo.me/docs), [Telegram Bots](https://core.telegram.org/bots).

## 7. Tổng hợp và báo cáo

- Màn hình KS: hàng chờ chưa tiếp nhận/chưa giao; việc đang làm, tạm dừng, sắp/quá hạn; tải việc **theo số việc và mốc xử lý**, không tự động chấm điểm/xếp hạng cá nhân.
- Màn hình tổng hợp kiểu Sheet: **mặc định tự chọn tuần hiện tại** theo ngày hệ thống, đầu tuần mới tự chuyển kỳ xem; dữ liệu tuần cũ vẫn nguyên, không bấm “clear”, không đổi tên tab thủ công. Người dùng chọn **khoảng ngày bất kỳ, một tuần, tháng hoặc năm** để xem; có bộ lọc đơn vị/loại việc/cán bộ/trạng thái, bảng theo ngày trong tuần và tổng theo đơn vị/loại. Nhấn số về đúng danh sách việc, có đối soát tổng và trạng thái thiếu dữ liệu. Không hiện `#DIV/0!`: tỷ lệ với mẫu số 0 là “Chưa có dữ liệu”, không phải 0%.
- Báo cáo ngày/tuần/tháng/năm tách rõ **khách duy nhất**, **việc đăng ký**, **lần phát sinh trong ngày** (`occurrence_date`), **đã giao** (`assigned_at`), **hoàn tất LS** (`completed_at`), **tồn cuối kỳ** (snapshot tại cuối kỳ), **quá hạn** (theo SLA và lịch làm việc). Một khách có nhiều việc hoặc một việc nhiều ngày không được nhân đôi ngoài chỉ tiêu được định nghĩa; việc sửa loại phải có quy tắc báo cáo theo loại tại lúc phát sinh hay loại hiện hành, và lưu cả hai để đối soát.
- Mốc giờ theo `Asia/Ho_Chi_Minh`; tuần báo cáo mặc định Thứ Hai–Chủ Nhật, có thể đổi bằng cấu hình được KS/quản trị duyệt. Báo cáo lịch sử truy vấn theo ngày gốc, không lệ thuộc tên tab tuần; số liệu kỳ đã chốt có thời điểm snapshot và có thể xem bản “hiện tại sau điều chỉnh” riêng. Xuất CSV/XLSX/PDF theo quyền, có bộ lọc và nhãn kỳ, người xuất và dấu thời gian; ẩn CIF/liên hệ trừ khi vai trò và mục đích được phép. Bản xuất không được trở thành nguồn nhập ngược tùy tiện.

### Sheet mới được tạo bằng script, không reset hàng tuần

- Script khởi tạo **một lần** file dữ liệu mới và các tab chuẩn hóa như `Customers`, `Requests`, `WorkItems`, `Occurrences`, `Revisions`, `Assignments`, `Events`, `Appointments`, `NotificationOutbox`, `WorkTypes`, `Users`, `Settings`; đặt mã cột, kiểm tra phiên bản schema, quyền chia sẻ, định dạng và vùng chỉ đọc. Chạy lại script phải **không xóa/ghi đè dữ liệu**; nâng cấp schema có bước sao lưu và kiểm tra trước/sau.
- Nếu **A** được duyệt, các tab dữ liệu này là kho hồ sơ liên tục nhiều năm; mỗi bản ghi có ID bất biến, timestamp đầy đủ và trạng thái. Tab `BaoCao`/màn GAS chỉ là kết quả truy vấn theo kỳ, không phải nơi nhập thủ công; có thể sinh riêng bản xuất tuần theo yêu cầu nhưng không tạo một database mới mỗi tuần.
- Nếu chuyển sang **B**, script vẫn tạo Sheet mới nhưng chỉ để bản xem/bản xuất đồng bộ **một chiều từ Supabase**, không cho sửa hồ sơ ở Sheet. Việc chuyển nguồn chính phải có đối soát, khóa ghi nguồn cũ và ngày cắt chuyển rõ ràng; không dual-write tự do.
- Kiểm thử lịch: việc ngày Chủ Nhật và Thứ Hai phải vào đúng tuần, ranh giới tháng/năm không rơi mất; mở lại năm trước vẫn có dữ liệu, sửa việc hôm nay không làm biến mất sự kiện của kỳ cũ.

## 8. Kiến trúc nội bộ GAS + dịch vụ ngoài

```text
Trình duyệt nội bộ → GAS HTML Service (A/B/C/D/E/F)
                    → google.script.run → GAS server xác minh người dùng
                    ├─ A: Sheet MỚI lưu liên tục hồ sơ/việc/sự kiện/outbox
                    │     → UrlFetchApp HTTPS → API ngoài gửi Gmail/ZBS, nhận webhook
                    └─ B: UrlFetchApp HTTPS → API ngoài → Supabase Postgres
                                            → outbox/worker gửi Gmail/ZBS, nhận webhook
                                            → Sheet MỚI báo cáo một chiều
Sheet cũ: chỉ đối chiếu, không nhận ghi giao dịch mới
```

- GAS là **standalone Web App nội bộ và là URL duy nhất cán bộ mở**, không ép người dùng nhập trực tiếp trên Sheet hay mở Supabase. Phát hành phiên bản theo môi trường thử nghiệm/production, tài khoản vận hành tổ chức và quyền domain phù hợp. Cấm triển khai chế độ truy cập công khai/ẩn danh cho màn hình nội bộ.
- Mọi hàm server callable kiểm tra lại định danh và quyền theo đơn vị/tác vụ; không tin `userId`, `unitId`, `assignedBy`, trạng thái hay tham số giá trị từ trình duyệt. Chỉ trả trường cần thiết. UI dùng `google.script.run` có loading/error/retry, không dựa vào thứ tự hai lời gọi bất đồng bộ.
- Với **A**, script tạo một file kho **mới, riêng**, chỉ tài khoản dịch vụ/vận hành và nhóm quản trị hẹp được quyền mở; các tab dữ liệu chuẩn/nhật ký/outbox không dùng công thức `QUERY`/`IMPORTRANGE` làm nơi ghi. Ghi theo lô, khóa vùng ghi bằng `LockService`, version/expected state khi cập nhật, khóa idempotency và job đối soát. API ngoài giữ **nhật ký gửi tin** và cấu hình nhà cung cấp, không cho sửa hồ sơ LS. **Các biện pháp này giảm rủi ro, không bảo đảm transaction nguyên tử xuyên nhiều tab.**
- Với **B**, mọi danh sách phòng, xem chi tiết, tạo/sửa nhiều việc, duyệt bản sửa, phân công, báo cáo và lịch hẹn đều gọi **API ngoài** từ GAS server; Postgres là nguồn dữ liệu duy nhất. API xác thực lời gọi GAS **và** danh tính nhân viên đã xác minh, kiểm tra role/phòng/phiên bản mỗi lần đọc và ghi. Thiết kế cụ thể token/chữ ký chống phát lại, giới hạn quyền, xoay khóa và cách tin cậy danh tính cần CNTT duyệt; nếu không xác minh được người thao tác thì từ chối, không tin email/role do HTML gửi lên.
- Không đặt Supabase `service_role`/secret key hoặc token ZNS trong HTML, Sheet hay mã client. Secret có quyền vượt RLS chỉ giữ phía API/Edge Function; GAS giữ nhiều nhất credential giới hạn để gọi đúng gateway, quyền sửa project GAS và cấu hình bí mật bị hạn chế. Nếu API dùng quyền quản trị vượt RLS thì chính API **bắt buộc** kiểm tra quyền từng dòng; có thể dùng JWT người dùng/RLS khi cơ chế SSO phù hợp được xác nhận. [Supabase: bảo vệ dữ liệu](https://supabase.com/docs/guides/database/secure-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).
- Với **B**, tạo/sửa việc và sự kiện audit/outbox phải chốt trong một giao dịch database; worker bên ngoài gửi ZBS/email theo idempotency key và retry, webhook nhà cung cấp về **API ngoài**, không cần trình duyệt hay GAS đang mở. Trạng thái trong GAS đọc lại từ API. Với **A**, phải có job đối soát Sheet ↔ kết quả gửi ngoài và hiển thị lỗi chưa đồng bộ; không được báo “đã gửi” chỉ vì GAS đã gọi API. Edge Functions hỗ trợ endpoint và webhook; tác vụ định kỳ cần thiết kế job/scheduler riêng. [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).
- Giám sát: tỷ lệ lỗi API, backlog outbox, thư/tin thất bại, việc quá hạn, chênh báo cáo, gần hết quota, backup thất bại; có người nhận cảnh báo và thao tác khôi phục.

## 9. Bảo mật và kiểm soát vận hành

1. Xác thực tập trung tài khoản tổ chức (và MFA theo chính sách), tắt tài khoản khi nghỉ/chuyển việc; phân quyền ở server và kiểm tra truy cập chéo đơn vị. Cấu hình admin không đồng nghĩa quyền xem mọi hồ sơ.
2. Tối thiểu hóa dữ liệu; tệp hồ sơ lưu trong kho được phép, link trong app phải xác thực và hết quyền khi việc/nhân sự đổi. Không đính kèm hồ sơ tín dụng vào email/nhóm chat. Mã hóa, thời hạn lưu, xóa/sao lưu theo chính sách tổ chức sau phê duyệt.
3. Nhật ký tạo/giao/chuyển/hoàn tất/mở lại/gửi tin/xuất báo cáo/cấu hình: tài khoản thực, giờ server, mã việc, trước/sau và lý do. Không ghi dữ liệu nhạy cảm hoặc token vào log. Kiểm tra khôi phục backup trên môi trường tách biệt.
4. Có môi trường thử nghiệm chỉ dùng dữ liệu giả; tài khoản/kênh thật chỉ bật sau nghiệm thu nội bộ. Quy trình xử lý sự cố gồm tạm ngừng gửi ngoài, đối soát outbox, khôi phục dữ liệu, thông báo người phụ trách và rollback phiên bản.

## 10. Các đợt thực hiện và nghiệm thu

| Đợt | Phạm vi | Bằng chứng để qua cổng |
| --- | --- | --- |
| **0 – Khảo sát & quyết định nền tảng** | Chốt danh mục loại việc, trường bắt buộc, role, cách hiểu nhiều ngày, dữ liệu được phép lưu, quy mô; thử GAS định danh, script tạo Sheet mới, ghi đồng thời và outbound HTTPS → API ngoài bằng dữ liệu giả. | Biên bản **go/no-go cho A đã chọn**; ma trận quyền; thử 2 phòng, 2 vai trò, lỗi mạng/khóa, ghi đồng thời, backup/khôi phục và quota. Không qua cổng thì không dùng dữ liệu thật; muốn đổi B phải xin quyết định mới. |
| **1 – Nội bộ tối thiểu** | Script tạo kho liên tục; màn A tạo nhiều việc/ngày, danh sách phòng và sửa sau gửi; B tiếp nhận, duyệt bản sửa, chỉnh loại/giao/chuyển **mọi việc**; C nhận, chỉnh loại hợp lệ, cập nhật/hoàn tất; lịch sử và thông báo trong app. | Demo liên vai trò: một `KH_MOI` chưa CIF có 3 việc ở 2 ngày; phòng sửa sau giao được KS duyệt, LS đổi loại có tính lại SLA/checklist; phòng khác không xem được; hai người sửa đồng thời không ghi đè; gửi lặp không tạo trùng; qua tuần mới không clear và tuần cũ vẫn xem được. |
| **2 – Hẹn KH và kênh ngoài** | Lịch hẹn, nút gọi và ghi kết quả; cấu hình Gmail API/tài khoản gửi qua Google Cloud Console, tạo OA/ZBS và mẫu được duyệt; adapter ngoài, outbox/retry/thu hồi hẹn. Telegram/GMF chỉ thêm nếu có quyền và nhu cầu đã duyệt. | Thử với người nhận thử nghiệm đã cho phép; không gửi trùng; lỗi nhà cung cấp hiện rõ; không rò CIF/chi tiết khoản vay; kênh chưa hoàn tất cấu hình vẫn tắt. |
| **3 – Quản trị & báo cáo** | CRUD có phiên bản/xóa mềm loại việc; người dùng/đơn vị/SLA/lịch/mẫu/kênh; xem khoảng ngày, tuần, tháng, năm, xuất và quyền xuất. | Thứ Hai tự đổi tuần xem, không đổi/xóa tab dữ liệu; kỳ cũ mở lại đúng; ranh giới tháng/năm đúng; số khách/việc/lần phát sinh tách bạch; có drill-down, mẫu số 0 hiện “Chưa có dữ liệu”; quyền xuất và nhật ký kiểm thử. |
| **4 – Pilot & chuyển đổi** | Dọn dữ liệu, nhập lịch sử có đối soát, hướng dẫn sử dụng, backup/khôi phục, thử tải, giám sát, pilot một số phòng; chuyển hẳn sang **hệ thống GAS mới** sau quyết định. | Đối soát số lượng và ngoại lệ theo ngày/đơn vị/loại; chạy song song chỉ đọc Sheet cũ, không ghi kép; ký nghiệm thu của nghiệp vụ/CNTT/an toàn thông tin; có phương án quay về nhập thủ công nếu sự cố. |

Thời gian và ngân sách chỉ ước lượng sau đợt 0 vì còn phụ thuộc quyền dùng Google Workspace, kho dữ liệu ngân hàng, phê duyệt OA/ZBS, kênh email và số lượng người dùng. Không triển khai “tất cả kênh” đồng loạt làm điều kiện của bản nội bộ tối thiểu.

## 11. Quyết định nghiệp vụ đã ghi nhận và điểm còn cần kiểm chứng

1. **Giao diện nội bộ – đã chốt:** cán bộ chỉ dùng GAS. API ngoài là kết nối server-to-server của GAS, không có trang app ngoài cho cán bộ. Quyền GAS gọi API và nơi lưu dữ liệu thật vẫn cần CNTT/an toàn thông tin phê duyệt trước pilot.
2. **Một khách nhiều việc/nhiều ngày – đã chốt:** một lần đăng ký có thể chứa nhiều `WorkItem`/sản phẩm, cùng hoặc khác ngày. Việc kéo dài qua nhiều ngày là một việc có lịch; hồ sơ mới của cùng loại vào ngày khác là lần phát sinh mới. Cần đối chiếu cách hiểu dấu `1` khi nhập dữ liệu Sheet cũ, không áp đặt quy tắc mới ngược lên lịch sử.
3. **CIF – đã chốt:** chưa có CIF thì đánh dấu `KH_MOI`, để trống CIF hợp lệ; khi được cấp thì bổ sung có lịch sử. Không dùng CIF giả và không cản gửi việc chỉ vì là KH mới.
4. **Các mốc hoàn tất – đã chốt:** `Đã soạn xong`, `Đang hẹn KH`, `Hoàn thành LS` tách riêng; điều kiện cần hẹn tùy loại việc. “Đã gửi tin” và “khách đã ký” cũng không đồng nghĩa hoàn thành LS.
5. **Kiểm soát – đã chốt một phần:** **mọi việc đều do KS LS tiếp nhận và phân giao**. Quy tắc đề xuất trong mục 3 về KS duyệt sửa ảnh hưởng lớn vẫn là thiết kế cần xem. Câu “tất cả vì kiểm soát phải phân giao việc” **chưa đủ để suy ra KS cũng phải duyệt hoàn tất tất cả việc**; hiện bản nháp giữ bước duyệt hoàn tất theo cấu hình loại việc cho tới khi anh xác nhận.
6. **Kênh – hướng đã chọn:** tự cấu hình Google Cloud/Gmail API và tạo OA/ZBS; chỉ bật gửi thực tế sau khi có hộp thư/tài khoản tổ chức, quyền OAuth, mẫu ZBS được duyệt và kiểm thử. GMF/Telegram là kênh tùy chọn, không làm chặn luồng cốt lõi.
7. **Kho và báo cáo – đã chốt hướng ưu tiên:** tạo **Google Sheet hoàn toàn mới bằng script làm kho hồ sơ chính liên tục**, không clear mỗi tuần; tuần mới tự hiển thị theo ngày, có lọc khoảng ngày/tuần/tháng/năm và xem lại lịch sử. Đợt 0 phải chứng minh Sheet đủ an toàn/toàn vẹn cho phạm vi pilot. Nếu không qua, không tự chuyển dữ liệu sang Supabase: báo rủi ro và xin anh duyệt phương án B trước.

**Sau khi anh sửa và duyệt bản nghiệp vụ:** mới khóa đặc tả màn hình/API/dữ liệu, ước tính thời gian/chi phí, rồi lập kế hoạch triển khai kỹ thuật chi tiết. Tài liệu này không tự ủy quyền triển khai, sửa Sheet cũ hoặc gửi tin thật.
