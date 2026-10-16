# Ghi nhận SLA và thời gian thực hiện

## Quy tắc nghiệp vụ

1. Phòng/PGD tạo đề nghị: trạng thái `CHO_PHAN_CONG`, ghi giờ gửi `submitted_at`,
   chưa bắt đầu SLA. Luồng: tạo → KS/Quản lý LS phân công (`DA_PHAN_CONG`) → cán bộ
   LS **Tiếp nhận hồ sơ** (`DANG_THUC_HIEN`) → **Hẹn khách ký** (`DANG_HEN_KH`) →
   **Hoàn thành**. Không có bước bàn giao, báo soạn xong hay trình kiểm soát duyệt;
   các mã `CHO_HOAN_THIEN`, `CHO_TIEP_NHAN`, `DA_SOAN_XONG`, `CHO_KS_DUYET` chỉ còn
   để hồ sơ cũ đi tiếp.
2. KS/Quản lý LS phân công ngay từ `CHO_PHAN_CONG`. Phân công không bắt đầu SLA.
3. Khi cán bộ LS được giao bấm **Tiếp nhận hồ sơ**, hệ thống ghi `dossier_received_at`,
   người nhận và bắt đầu SLA tại thời điểm đó (chỉ ghi lần đầu, chuyển người không đặt
   lại). `submitted_at` và `dossier_received_at` là hai mốc riêng. Ô tick "LS xác nhận
   đã nhận đủ hồ sơ" chỉ còn cho hồ sơ cũ đã xử lý mà chưa có mốc. LS vẫn sửa giờ thực
   tế trong **Ghi / sửa giờ LS nhận đủ**, có lý do và nhật ký trước/sau.
4. Tiếp nhận, bắt đầu xử lý và hoàn thành ghi các mốc riêng. Phiên xử lý
   lưu người thực hiện, loại nghiệp vụ, sản phẩm, giờ bắt đầu và kết thúc.
5. Chuyển cán bộ giữ nguyên SLA, đóng phiên của người trước. Chuyển tháng giữ
   toàn bộ mốc/phiên và loại dòng đã chuyển khỏi phép cộng thời gian để tránh đếm đôi.
6. SLA và thời gian xử lý dùng lịch Settings: ngày làm, giờ mở/đóng, nghỉ trưa,
   ngày lễ; tính ngày theo múi giờ Việt Nam (+07:00). SLA loại thời gian tạm dừng,
   hẹn khách hàng và chờ bổ sung. Phiên xử lý chỉ mở trong trạng thái xử lý,
   đã soạn xong hoặc chờ kiểm soát.

## Báo cáo

Mở **Thời gian**, chọn khoảng ngày (tối đa 366 ngày), cán bộ và nghiệp vụ rồi
chọn xem báo cáo. Có biểu đồ theo ngày, bảng ngày/cán bộ/nghiệp vụ/sản phẩm và
xuất Excel. LS chỉ xem thời gian của mình, gồm phiên trên việc đã chuyển cho
người khác. Kiểm soát/Quản lý xem toàn bộ; Admin xem tổng hợp, không trả nhãn
sản phẩm có thể chứa thông tin khách hàng.

- **Giờ hồ sơ** cộng từng phiên xử lý của mỗi việc. Làm song song có thể cộng trùng.
- **Giờ cán bộ đã dùng** gộp các khoảng trùng theo cán bộ/ngày, kể cả khác nghiệp vụ.
  Cột theo nhóm gộp trong từng nhóm; không cộng cột này để thay tổng toàn báo cáo.
- **SLA trung bình** từ lúc LS nhận đủ (`dossier_received_at`) tới hoàn thành, theo giờ làm và trừ các
  khoảng dừng SLA. Số hồ sơ đúng hạn chỉ dùng hồ sơ đủ mốc để đối chiếu.
- Công thức dùng chung frontend/GAS, phiên bản `sla_time_v2`. Snapshot kỳ dùng
  phiên bản này; snapshot cũ không được dùng làm số liệu thời gian mới.

## Đồng bộ Google Sheet kế hoạch tháng

Workbook của mỗi kỳ có bốn tab do ứng dụng quản lý:

| Tab | Nội dung |
| --- | --- |
| Thời gian hồ sơ | Một dòng mỗi hồ sơ/nghiệp vụ: CIF, khách hàng, sản phẩm, user, mốc nhận/tiếp nhận/phân công/bắt đầu/hoàn thành, hạn SLA, giờ xử lý và kết quả SLA |
| Phiên xử lý | Từng khoảng xử lý của từng cán bộ; giữ mốc gốc, giờ làm chỉ tính phần nằm trong kỳ |
| Thời gian theo ngày | Ngày × cán bộ × nghiệp vụ × sản phẩm, giờ hồ sơ/giờ cán bộ trong nhóm, hoàn thành và SLA |
| Tổng hợp thời gian | Tổng toàn kỳ, theo ngày, cán bộ và nghiệp vụ; giờ cán bộ gộp trùng giữa các nhóm |

Các thao tác tạo/bàn giao/chuyển trạng thái/phân công/điều chỉnh giờ tự ghi lại
tab thời gian cùng Sheet kế hoạch. Bootstrap bổ sung lần đầu cho kỳ hiện tại.
Trigger `activateMonthlyPlans` hằng giờ chạy migration, bổ sung các kỳ chưa có
tab và cập nhật kỳ đang hoạt động/kỳ chuẩn bị để đồng hồ mở tiếp tục chạy.
Kỳ cũ chỉ bổ sung lần đầu; thao tác sửa hồ sơ trong kỳ vẫn đồng bộ lại kỳ đó.

Các tab ghi múi giờ Việt Nam, thời điểm đồng bộ, bộ lọc và hàng tiêu đề cố định.
Không thay công thức G:K của mẫu. Nếu đã có tab trùng tên do người dùng tự tạo,
ứng dụng dùng hậu tố `(LS)`; chỉ ghi lại các tab có dấu quản lý `LS-Routing`.
CIF/mã được định dạng văn bản; tên/ghi chú bắt đầu như công thức được ghi an toàn
dưới dạng văn bản. Đồng bộ giữ script lock trong khi chụp dữ liệu và xuất bốn tab.
Lượt bị tranh lock được bỏ qua để thử lại ở trigger/lần đồng bộ kế tiếp.

Hồ sơ thiếu mốc để trống và đánh dấu cần xác nhận; dòng chuyển kỳ không cộng giờ
lần nữa. Báo cáo ngày dùng lịch sử từ dòng mới nhất để giữ phần giờ của kỳ cũ.
Sheet là bản xuất từ ứng dụng: LS sửa giờ trong app để có kiểm tra quyền và nhật ký.

## Sửa mốc thực tế

Mở chi tiết việc → **Sửa giờ nhận / hoàn thành**, nhập ngày giờ và lý do.
LS sửa việc hiện được giao cho mình; Kiểm soát/Quản lý sửa việc trong phạm vi
nghiệp vụ LS. Cho phép sửa việc đã hoàn thành. Admin và Phòng/PGD không có quyền
sửa qua API này. Việc đã chuyển tháng phải sửa trên dòng mới nhất.

Server kiểm tra quyền, version chống ghi đè, giờ không ở tương lai và thứ tự
nhận ≤ bắt đầu xử lý ≤ hoàn thành. Mỗi lần sửa lưu người sửa, lúc sửa, lý do,
giá trị trước/sau trong Events (`SUA_THOI_GIAN`), tính lại hạn và tổng hợp kỳ.
Sửa giờ hoàn thành điều chỉnh đầu cuối phiên liên quan; không bịa lịch sử các
phiên xử lý bị thiếu.

## Dữ liệu cũ và migration

Bootstrap bổ sung cột vào WorkItems/PeriodSummary, giữ nguyên dữ liệu cũ.
Không lấy `created_at`, `submitted_at` hoặc `assigned_at` thay cho mốc nhận hồ sơ
đầy đủ còn thiếu. Báo cáo cảnh báo thiếu mốc bàn giao hoặc phiên chưa rõ người.
LS xác nhận/sửa mốc thực tế trước khi dùng hồ sơ cũ để đánh giá SLA.

Các cột mới: `dossier_received_at`, `dossier_received_by`, `timing_source`,
`first_assigned_at`, `processing_sessions_json`, `sla_pause_log_json` và
`PeriodSummary.timing_formula_version`.

## Bằng chứng nghiệm thu

- `verify-sla-time-contract.mjs`: luồng tạo/bàn giao/phân việc/xử lý/chuyển người/
  hoàn thành; giờ làm/nghỉ/dừng; gộp song song; chuyển tháng; quyền sửa việc đã
  hoàn thành, version, lý do, timestamp; phạm vi báo cáo và ẩn dữ liệu Admin.
- Local browser: LS mở việc đã hoàn thành, sửa hai mốc và lý do; mở lại thấy mốc
  mới và lịch sử. Màn hình báo cáo mở và tổng hợp dữ liệu demo.
- `verify-sheet-time-contract.mjs`: xuất mốc từng hồ sơ, chia giờ đúng người/kỳ,
  gộp song song giữa nghiệp vụ, giữ công thức mẫu/tab riêng, an toàn chuỗi công thức,
  không nhân tab/dòng khi chạy lại, xóa đúng dữ liệu xuất cũ và tranh lock.
- Toàn bộ 32 contract script, build GAS và `git diff --check` phải xanh trước deploy.
- Kiểm tra deployment/HTTP xác nhận bản được phát hành; không thay thế nghiệm thu
  có đăng nhập trên dữ liệu production. Không tạo/sửa hồ sơ khách hàng thật để thử.

## Triển khai

Giữ nguyên deployment ID `AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH`.
Mốc rollback trước nâng cấp: Version 36. Build sinh `TimeTracking.gs` từ khối
shared trong `js/core.js`; file này phải nằm trong 7 file GAS được push.
Sau phát hành, tải lại ứng dụng và đăng nhập để bootstrap chạy migration cột.

Đã push đủ 7 file, cập nhật deployment hiện tại lên **Version 37**, đối chiếu
deployment listing và GET `/exec` trả HTTP 200, có engine `sla_time_v2`.
Lệnh `clasp run setupSheetDB` không chạy được vì thiếu thông tin xác thực
Execution API; không coi lệnh đó là bằng chứng migration production thành công.
Kiểm tra qua trình duyệt production tới được màn đăng nhập, không có console
error. Bước đăng nhập admin bị automatic approval review chặn vì chưa có xác nhận
sử dụng tài khoản cụ thể; đang chờ người dùng cho phép hoặc tự đăng nhập.

### Bổ sung Sheet — Version 38

Đã push đủ 7 file và cập nhật deployment hiện tại lên **Version 38**. Mốc rollback
cho riêng phần đồng bộ Sheet là Version 37. Deployment listing xác nhận `@38`,
web app GET trả HTTP 200.

Đã chạy `activateMonthlyPlans` từ trình biên tập Apps Script bằng phiên Google
hiện có của tài khoản triển khai `daklak631a@gmail.com`, không dùng đăng nhập
admin/mật khẩu ứng dụng. Hàm chạy `ensureRuntimeSchema_` trước khi xuất Sheet.
Execution log ngày 28/09/2026, 13:30:35–13:30:59 ghi **synced: 2, skipped: 0,
failed: 0**, kết thúc `Execution completed`.

- Workbook T9.2026: `1yYKm9_2t0b5VkgmLW2QIJtFMcdfnP3S73PKNubOXsVw`.
- Workbook thứ hai: `1Qu2sJRPPPyvx4v7FfUu0V1GI75AgccsuC49SWpotHKQ`.
- Đã mở Sheet T9.2026 thật, thấy đủ bốn tab mới; tab hồ sơ có 5 dòng hiện hữu và
  tiêu đề các mốc thời gian. Mốc nhận hồ sơ cũ còn trống; ô tổng hợp thiếu mốc
  bàn giao là 5, không tự điền ngày tạo đề nghị.
- 32/32 contract script đạt, gồm contract xuất Sheet, build và diff check đạt.
- Đã đối chiếu trigger thật: `activateMonthlyPlans`, `Head`, `Time-driven`,
  `Hour timer`, `Every hour`; bảng trigger hiển thị tỷ lệ lỗi 0% cho hàm này.

Bằng chứng này xác nhận migration/đồng bộ Sheet qua tài khoản Google của dự án.
Không tuyên bố đã sửa giờ một hồ sơ khách hàng thật hoặc chạy lại mọi luồng đăng
nhập/vai trò production. Sheet T9.2026 hiện có quyền chia sẻ `Anyone with the link`
theo trạng thái Google Sheets đã quan sát; phần nâng cấp giữ nguyên quyền đó.

Quan sát vận hành ngoài phạm vi SLA: bảng trigger hiện có hai dòng
`maintenanceTick` với tỷ lệ lỗi 100%, lần chạy 02:03 và 02:56 ngày 28/09/2026
(trước lượt triển khai này). Chưa xác định nguyên nhân backup lỗi và không sửa
hai trigger đó trong phần nâng cấp đồng bộ thời gian.

### Sửa lỗi màn Thời gian & SLA — Version 39 (29/09/2026)

Tái hiện trên tài khoản demo được người dùng cho phép: chạy báo cáo từ
01/09/2026 đến 29/09/2026 trên Version 38 báo `Cannot read properties of
undefined (reading 'toFixed')`. Kiểm thử gọi adapter GAS và renderer thật cũng
thất bại cùng lỗi khi dòng chưa có mẫu hoàn thành thiếu `avg_sla_hours`.

Adapter giờ chuẩn hóa SLA trung bình chưa có mẫu thành `null`; các trường tổng
và giờ bắt buộc được kiểm tra là số hữu hạn, không tự thay dữ liệu thiếu bằng 0.
Xóa cache cả ba màn báo cáo khi đổi tài khoản và bỏ phản hồi đến muộn của phiên
cũ; callback dashboard cá nhân kiểm tra cache trước khi đọc.

33/33 contract script đạt, bao gồm kiểm thử renderer/adapter mới: thiếu/null,
giá trị 0, số dạng chuỗi, báo cáo rỗng, dữ liệu sai và thử lại, đổi tài khoản,
phản hồi đến muộn; render các màn chính bằng dữ liệu mẫu cho từng vai trò.
Build và kiểm tra cú pháp/diff đạt. Đã push 7 file, deployment chuẩn là `@39`;
mốc rollback là Version 38.

Đã tải lại app, đăng nhập demo và chạy lại đúng báo cáo: bảng, biểu đồ và các
chỉ số hiển thị thành công, không còn lỗi `toFixed`. Kết quả quan sát: 4.50 giờ
theo hồ sơ, 0.00 giờ được ghi nhận cho cán bộ, 0 hoàn thành; 5 hồ sơ thiếu mốc
bàn giao và 1 phiên cũ chưa xác định người xử lý. SLA trung bình hiện `—`.
Không chỉnh sửa mốc giờ hoặc hồ sơ demo để tạo số liệu nghiệm thu.

Kiểm tra trực tiếp thêm: bộ lọc một cán bộ trả báo cáo rỗng với số 0 và thông
báo thiếu mốc, màn Tổng hợp hiển thị bình thường; báo cáo quý 07–09/2026 chạy
thành công và trả bảng theo đơn vị/tháng. Các màn này có phạm vi kỳ khác nhau;
không coi lượt kiểm tra hiển thị là đối soát đầy đủ dữ liệu nghiệp vụ.

Chưa xác nhận file Excel tải về trong trình duyệt tích hợp: chờ sự kiện download
15 giây không nhận được file, không ghi nhận console error. Không coi đây là
bằng chứng Excel đã tải thành công hoặc kết luận nguyên nhân là lỗi ứng dụng.

### Rà soát mốc và trang lịch sử riêng — Version 40 (29/09/2026)

Màn Thời gian & SLA có nút **Rà soát mốc thời gian** cho LS, kiểm soát và quản lý
LS. Danh sách rà kỳ đang hoạt động, bỏ dòng đã chuyển sang hồ sơ mới, việc hủy
và bản nháp. LS chỉ thấy hồ sơ được giao cho mình. Các vấn đề gồm thiếu giờ
nhận, thiếu giờ hoàn thành của việc đã hoàn thành, thứ tự mốc không hợp lệ và
phiên cũ chưa xác định người xử lý.

Hệ thống tìm mốc nhận được ghi rõ trong dữ liệu nhật ký; không dùng ngày tạo
đề nghị làm ngày nhận hồ sơ đầy đủ. Giờ hoàn thành có thể được gợi ý từ sự kiện
hoàn thành. Người có quyền phải xác nhận giờ thực tế và ghi lý do trước khi
lưu. Nếu lịch sử quét chưa đầy đủ, màn hình báo để tiếp tục đối chiếu.

Với phiên cũ chưa có người xử lý, từng phiên có lựa chọn riêng, mặc định
**Chưa xác định**. Có thể xác nhận một phần, giữ các phiên còn lại chưa rõ;
không tự gán cán bộ đang được phân công vào lịch sử. LS chỉ xác nhận phiên của
chính mình, kiểm soát/quản lý có thể chọn LS đã thực hiện. Không đổi độ dài
phiên hay xóa phiên đã có chủ, kể cả phiên vừa bắt đầu. Lưu kiểm tra phiên bản
và ghi người sửa, lý do, giá trị trước/sau vào Events; tính lại báo cáo và đồng
bộ workbook tháng qua cơ chế hiện có.

Chi tiết hồ sơ chỉ có nút **Hoạt động & lịch sử**, mở trang riêng chứa nhật ký
thao tác và tin gửi đi. Nút **Về hồ sơ** trở lại đúng chi tiết. Dữ liệu tải khi
mở, theo quyền xem hồ sơ, phân trang 100 dòng với con trỏ để xem lịch sử cũ hơn.
Hồ sơ vẫn có thông báo gọn về tin đang chờ xác nhận; thao tác xem/gửi có kiểm
tra quyền và bước xác nhận hiện có. Admin tiếp tục được che dữ liệu khách hàng.

35/35 contract script đạt; build, cú pháp JS và diff check đạt. Kiểm thử mới
gồm gợi ý có bằng chứng, cấm suy diễn ngày tạo, phân quyền, xung đột phiên bản,
xác nhận từng phiên không đổi thời gian, che dữ liệu, trang lịch sử riêng và
phân trang không mất/trùng dòng. Đã push 7 file và xác minh deployment chuẩn
`@40`; rollback là Version 39.

Đã tải lại app và đăng nhập tài khoản demo được cho phép: nút rà soát trả 3 hồ
sơ cần xác nhận trong kỳ hiện tại; biểu mẫu giờ nhận còn trống khi chưa có bằng
chứng, có ô lý do. Mở hồ sơ và kiểm tra không còn nhật ký/tin gửi đi dài bên
trong; trang riêng tải thành công nhật ký cùng tin gửi đi, quay về đúng hồ sơ.
Không ghi nhận console error trong lượt kiểm tra. Không sửa mốc hay gán người
xử lý của hồ sơ demo để tạo số liệu; việc sửa/lưu được chứng minh bằng contract
fixture, còn các dữ liệu thực tế thiếu căn cứ vẫn chờ người phụ trách xác nhận.

### Phân công nhanh và bản 51 — 29/09/2026

KS_LS và QUAN_LY_LS có màn **Phân công nhanh** riêng, không mở quyền Quản trị toàn
hệ thống. Quy tắc khớp theo phòng, loại việc, sản phẩm và cán bộ LS; bật **Tự động
giao khi tạo hồ sơ** để áp dụng khi tạo. Có thể đánh dấu **Ưu tiên xử lý** trong quy
tắc hoặc tích riêng từng dòng khi phân công theo lô. Lô tối đa 100 việc; máy chủ kiểm
tra toàn bộ người nhận, trạng thái và phiên bản trước khi ghi.

Muốn hồ sơ cầm cố tự giao, quản lý tạo quy tắc đúng phòng/loại việc/sản phẩm và chọn
cán bộ nhận; hệ thống không tự chọn cán bộ mặc định khi chưa có quy tắc. Phân công
theo lô nhận `CHO_HOAN_THIEN`, `CHO_TIEP_NHAN` và `CHO_PHAN_CONG`.

Version 51 đã push 7 file và cập nhật đúng deployment hiện hữu
`AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH`.
`clasp deployments` xác nhận `@51`; GET canonical `/exec` trả HTTP 200 và HTML có
màn quy tắc, dấu tick LS nhận đủ, bộ đọc XLSX cùng workbook Excel nhúng để tải.
Contract cục bộ đều đạt. Cột `is_priority` được thêm tự động ở bootstrap đầu tiên
trên kho cũ; GET không chứng minh migration trên Sheet production đã chạy.
