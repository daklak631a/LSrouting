# Đối chiếu số đếm ngày 15/10/2026

Thời điểm chốt: 18:45 ngày 15/10/2026, giờ Việt Nam.

HĐTD, nhập kho, xuất kho, RLOS và việc khác cộng đúng theo dữ liệu đang ghi. HĐTC còn thiếu ghi nhận cho hồ sơ đã hẹn ký trước bản cập nhật cơ chế tự ghi kết quả. Có thêm một trường hợp HĐTC mặc định số lượng 1 nhưng chưa có ô điều chỉnh.

## Phạm vi và cách đối chiếu

- Đọc giao diện GAS đã đăng nhập, đang hiển thị “Môi trường thử nghiệm”.
- Đọc chi tiết 202 hồ sơ: 152 hồ sơ hoàn thành trong danh sách tuần, 46 hồ sơ mở và 4 hồ sơ hoàn thành hôm nay có ngày phát sinh từ tuần trước.
- Đọc đủ 299 sự kiện trong nhật ký ngày 15/10/2026.
- Cộng độc lập từ tên cán bộ, mốc ghi nhận và số lượng trong chi tiết hồ sơ. Không gọi phép tổng hợp của dashboard để làm phép cộng đối chiếu.
- Đối chiếu việc khác với báo cáo Thời gian & SLA riêng ngày 15/10, tất cả cán bộ.
- Chỉ tạo tài liệu này. Không chỉnh hồ sơ, mã ứng dụng hoặc deployment.

## Tổng đang hiển thị và kết quả đối chiếu

| Chỉ tiêu | Dashboard | Đối chiếu | Nhận xét |
|---|---:|---:|---|
| Soạn HĐ tín dụng | 37 | 37 | Khớp các mốc ghi nhận và số lượng |
| Soạn HĐ thế chấp | 12 | 12 đã ghi | Còn hồ sơ đã hẹn nhưng thiếu ghi nhận soạn |
| Nhập kho TSĐB | 5 | 5 | Khớp 5 phần việc đã tick |
| Xuất kho TSĐB | 5 | 5 | PGD_BMT_90: 1; PGD_BMT_82: 4 |
| RLOS | 30 | 30 | Khớp 30 hồ sơ hoàn thành có Rlos: có |
| Khác | 21 | 21 | Khớp báo cáo thời gian theo 6 loại tác nghiệp |
| Hoàn thành ngày | 38 | 38 | 34 trong danh sách tuần và 4 từ tuần trước |
| Tồn soạn HĐTC | 10 | 10 theo cờ hiện có | 9 hồ sơ đã hẹn; lệch với quy tắc hẹn ký đồng nghĩa đã soạn |
| Tồn soạn HĐTD | 1 | 1 | KHCN1_78, đã nhận, tạm dừng và chưa ghi nhận soạn |

### Năm loại kết quả theo cán bộ

| Cán bộ | HĐTD | HĐTC đã ghi | Nhập kho | Xuất kho | RLOS |
|---|---:|---:|---:|---:|---:|
| Hà | 6 | 0 | 0 | 0 | 4 |
| Thiện | 2 | 1 | 0 | 0 | 3 |
| Nam | 6 | 3 | 1 | 0 | 3 |
| Thanh | 5 | 1 | 0 | 5 | 6 |
| Giang | 4 | 0 | 0 | 0 | 3 |
| Trà | 8 | 1 | 1 | 0 | 7 |
| Quế | 3 | 4 | 1 | 0 | 1 |
| Uyên | 3 | 2 | 2 | 0 | 3 |
| Tổng | 37 | 12 | 5 | 5 | 30 |

Việc khác gồm: họp đầu ngày 5, xem văn bản 5, sắp xếp kho 1, scan hoàn thiện hồ sơ 3, định giá lại TSĐB 6, xuất kho/thu nợ cầm cố 1. Tổng là 21; các loại này có đơn vị khác nhau.

## Phát hiện 1: HĐTC đã hẹn nhưng chưa được ghi nhận soạn

Có 10 hồ sơ đang “Đang hẹn khách ký” nhưng ô “Đã soạn xong HĐ thế chấp” chưa tick. Chín hồ sơ đang nằm trong tồn soạn ngày 15/10. PGD_TBM_65 có ngày phát sinh 16/10 nên chưa nằm trong tồn ngày 15/10, dù đã hẹn ký trong ngày 15/10.

Sáu hồ sơ có sự kiện chuyển sang hẹn ký ngay ngày 15/10:

| Hồ sơ | Cán bộ | Mốc hẹn trong nhật ký | Đang tính tồn soạn ngày 15/10 |
|---|---|---|---|
| PGD_DBM_58 | Giang | 08:59 15/10/2026 | Có |
| PGD_TBM_65 | Hà | 11:00 15/10/2026 | Không, ngày phát sinh 16/10 |
| KHCN2_103 | Uyên | 11:22 15/10/2026 | Có |
| KHCN2_101 | Uyên | 11:25 15/10/2026 | Có |
| PGD_BMT_87 | Thanh | 17:24 15/10/2026 | Có |
| PGD_TBM_63 | Hà | 17:30 15/10/2026 | Có |

Bốn hồ sơ còn lại là PGD_BMT_78 (Thanh), KHCN2_72 (Thiện), KHCN1_91 (Uyên), KHCN2_86 (Quế). Cả bốn đang hẹn ký, chưa có ghi nhận soạn HĐTC và không có sự kiện hẹn trong nhật ký ngày 15/10 đã đọc.

Nếu áp dụng quy tắc người dùng đã chốt, các phần soạn này phải có kết quả và hết tồn soạn. Riêng sáu hồ sơ hẹn trong ngày 15/10 tương ứng sáu phần soạn chưa ghi. Nếu mỗi hồ sơ có đúng một HĐTC, tổng ngày 15/10 sẽ là 18 thay vì 12. Số hợp đồng thực tế của các hồ sơ thiếu chưa được xác nhận; không được tự dùng số 1 để sửa dữ liệu.

Sau khi ghi nhận đủ chín hồ sơ hẹn đang tính tồn hôm nay, tồn HĐTC sẽ còn một hồ sơ: PGD_TBM_68 của Hà, đang tạm dừng. Kết luận này dựa trên trạng thái và cờ soạn tại thời điểm đọc.

Nguyên nhân trong mã: nhánh `transitionItem(..., 'DANG_HEN_KH', ...)` ở `Code.gs:4078` chỉ bổ sung `result_credit_json` khi thực hiện thao tác chuyển trạng thái. Các hồ sơ đã ở trạng thái hẹn nhưng thiếu credit vẫn được `dailyBacklogKeys` tại `js/domain.js:1465` tính là chưa soạn. Thay đổi cơ chế cho thao tác mới chưa bổ sung dữ liệu đã hẹn trước đó.

Hướng xử lý cần giữ đúng lịch sử: đối chiếu sự kiện hẹn gốc, người thực hiện và số hợp đồng thực tế; ghi bổ sung một lần vào đúng ngày thực hiện. Giữ riêng phần nhập kho chưa làm. Không ghi các kết quả cũ vào ngày sửa dữ liệu.

## Phát hiện 2: HĐTC trên “Thủ tục TSĐB khác” đang mặc định 1

KHCN2_104 của Nam hoàn thành ngày 15/10, sản phẩm “Thủ tục TSĐB khác”, kết quả “HĐ thế chấp: có”. Hồ sơ không có phần tick HĐTC và không có ô số lượng HĐTC. Dashboard hiện tính một HĐTC từ cờ kết quả khi hoàn thành.

Giao diện `contractDraftSection` tại `js/screens.js:4759` chỉ tạo ô số lượng hợp đồng cho hồ sơ tín dụng. Hồ sơ TSĐB có bước HĐTC dùng phần tick riêng; loại “Thủ tục TSĐB khác” không có bước này. `recordWorkStep` tại `Code.gs:4603` cũng chỉ chấp nhận phần việc áp dụng cho loại hồ sơ. Vì vậy đường sửa số lượng hiện chưa phủ trường hợp này.

Nếu hồ sơ thực tế có nhiều HĐTC, kết quả hiện tại không phản ánh được số lượng đó. Cần hỗ trợ sửa số lượng cho mọi kết quả HĐTC hợp lệ đã ghi nhận, gồm loại TSĐB này.

## Các chênh lệch đã giải thích

- Quế có 3 HĐTD: KHCN2_95 (07:53), PGD_TBM_59 (10:25), KHCN2_97 (13:40), đều ngày 15/10 và mỗi hồ sơ một HĐTD.
- Uyên có 3 HĐTD: PGD_NBM_46 (08:32), PGD_DBM_59 (11:24), KHCN2_96 (15:12), đều ngày 15/10 và mỗi hồ sơ một HĐTD.
- KHCN2_98 của Quế ghi 4 HĐTC lúc 16:44 ngày 15/10, khớp dòng HĐTC của Quế.
- KHCN2_81 của Uyên ghi 4 HĐTC lúc 16:22 ngày 14/10. Ngày phát sinh và lịch ký là 15/10 không chuyển kết quả soạn sang ngày 15/10.
- Bốn hồ sơ hoàn thành từ tuần trước là PGD_TBM_35, PGD_TBM_36, PGD_BMT_33 và PGD_NBM_23. Cộng chúng với 34 hồ sơ trong danh sách tuần thì khớp 38. Bộ lọc tuần tại `js/screens.js:2536` giải thích vì sao danh sách Quản lý hồ sơ không hiện đủ 38 hồ sơ này.

## Giới hạn của kết luận

Phép cộng được đối chiếu trên các trường giao diện và nhật ký, cùng báo cáo thời gian của GAS đang mở. Các trường này xác nhận số đã ghi trong hệ thống; số hợp đồng thực tế ngoài hệ thống vẫn cần cán bộ xác nhận khi bổ sung kết quả thiếu. Chưa sửa hay kiểm chứng một thao tác ghi trên GAS trong đợt kiểm tra này.

## Bản sửa local sau khi người dùng yêu cầu sửa cơ chế đếm

### Quy tắc kết quả

| Thao tác | Kết quả soạn HĐTC |
|---|---:|
| Một tác vụ ghi số lượng thực tế 4 | Cộng 4 cho cán bộ được ghi nhận |
| Sửa số lượng 4 thành 2 | Kết quả còn 2 |
| Lưu lại cùng số lượng | Không cộng thêm |
| Hoàn thành hồ sơ sau ngày đã soạn | Giữ kết quả ở ngày soạn |
| Chuyển người hoặc chuyển kỳ | Giữ người đã soạn, không tính hai lần |

- Mở ô số lượng cho hợp đồng đã ghi nhận khi đang hẹn khách và sau khi đã nhập kho; khóa bỏ tick nhập/xuất kho vẫn giữ đúng thứ tự.
- Kết quả mặc định từ hồ sơ hoàn thành cũ, gồm “Thủ tục TSĐB khác”, được sửa số lượng mà không mở lại hồ sơ. Lần sửa giữ cán bộ và ngày hoàn thành gốc.
- Bảng máy tính, thẻ điện thoại, kết quả cá nhân và trang kết quả trong Excel dùng cùng số lượng. Giao diện tính lại ngay khi sửa; phản hồi bị từ chối sẽ khôi phục số đã lưu.
- Số hợp đồng soạn và số tài sản nhập/xuất kho là các phần riêng. Chỉnh 4 HĐTC không tự biến một lần nhập kho thành bốn.
- Chỉ tiêu số tác vụ được giao/đóng hồ sơ và SLA vẫn theo tác vụ; số lượng hợp đồng nằm ở dòng kết quả soạn tương ứng.

### Hồ sơ đã hẹn từ trước nhưng thiếu ghi nhận

Máy chủ bổ sung kết quả vào dữ liệu trả về từ sự kiện hẹn gốc, khi xác định được cán bộ LS và mốc thời gian hợp lệ. Lần đọc này không ghi lại WorkItems hoặc Events. Sau này cán bộ sửa số lượng/chuyển trạng thái, kết quả được lưu cùng thao tác đó và vẫn giữ ngày/người gốc.

- Nếu nhật ký lưu số lượng thực tế thì giữ nguyên số đó.
- Nếu sự kiện hẹn cũ chỉ chứng minh đã soạn nhưng không có số lượng, kết quả hiển thị mặc định 1 theo quy tắc cũ; cán bộ cần sửa thành số thực tế. Không sử dụng số lượng đăng ký/kế hoạch làm số đã soạn, không tự gán 4 cho hồ sơ thiếu dữ liệu.
- Thiếu bằng chứng người làm/ngày làm thì không tự tạo kết quả. Việc đã bỏ tick chủ động không được dựng lại từ sự kiện hẹn cũ.
- Không bổ sung phần nhập/xuất kho từ một sự kiện hẹn ký.
- Chỉ quét lịch sử khi có hồ sơ hẹn cũ thiếu credit, có giới hạn quét và dừng khi tìm đủ. Không tải toàn bộ nhật ký về trình duyệt.

### Kiểm chứng và trạng thái phát hành

- `node verify-result-counting-contract.mjs`: 30 tình huống, gồm đường giao diện → adapter GAS → hàm máy chủ trong bộ dữ liệu giả lập; sửa 4→2, tải lại, hoàn tác khi lưu lỗi, Excel, bàn giao, hẹn cũ và chuyển kỳ.
- 20 bộ kiểm tra liên quan đạt: result-flags, warehouse-steps, linked-item, month-rollover, report, monthly-plan-flow, personal-workflow, handover-credit, team-daily, personal-backlog, lazy-logs, scan-bounds, background-writes, ui-logic-review, time-report-ui, work-plan, simplified-flow, tailwhere, storage-schema, gas.
- Cập nhật các kiểm tra cũ bị lệch giao diện/fixture: selector của transaction mock, tồn trước/sau tiếp nhận, nhóm tồn cá nhân, định dạng giờ/phút; bổ sung kỳ vọng sửa số lượng cho kết quả hoàn thành cũ. Không đổi công thức thời gian để làm các kiểm tra này đạt.
- Build và `prepare-clasp.mjs` đạt; bundle GAS local đủ bảy file, HTML khớp nguồn JS.
- Chưa push/deploy GAS và chưa thực hiện thao tác ghi trên dữ liệu GAS thật trong lần sửa này. Các số đối chiếu phía trên là ảnh chụp tại thời điểm kiểm tra, không phải số sau triển khai.

## Phát hành GAS v132 theo yêu cầu “Đẩy GAS”

Thực hiện ngày 15/10/2026; kiểm tra HTTP hoàn tất lúc 19:19 giờ Việt Nam.

- Đã pull v131 vào thư mục riêng trước khi phát hành. Chỉ `Code.gs` và `Index.gas.html` thay đổi; năm file còn lại khớp SHA-256 với bản đang triển khai.
- Build, readiness và `git diff --check` đạt. Chạy lại 22 bộ kiểm tra đạt, gồm 30 tình huống đếm kết quả và ranh giới việc khác/quyền hủy.
- Có một kiểm tra bổ sung cũ `verify-processing-time-contract.mjs` mong đợi “72 phút”, trong khi giao diện hiện “1 giờ 12 phút”. Đã chạy nguyên kiểm tra trên JS tách từ bundle v131 và xác nhận cùng lỗi tại dòng 15. Không sửa hoặc bỏ qua kiểm tra này trong lần phát hành; ghi nhận đây là lệch kỳ vọng định dạng có sẵn, ngoài phần sửa đếm số lượng.
- Kiểm tra bổ sung `verify-schedule-shift-contract.mjs` dừng ở dòng 70 do mong tồn của ngày tương lai là 1, trong khi bảng đang dùng tồn tại ngày hiện tại nên là 0. Đã tái hiện cùng kết quả trên bundle v131; không đổi quy tắc này trong bản sửa số lượng. Ranh giới tính làm thêm ngày nghỉ/cuối tuần được kiểm riêng bằng hàm thật trong `TimeTracking.gs`: 11:00–14:00 trừ nghỉ trưa 11:30–13:30, còn đúng một giờ.
- `clasp push --force` đẩy đủ bảy file; tạo version 132. Cả hai deployment hiện có đã cập nhật sang v132, giữ nguyên URL:
  - [Web app chính](https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec).
  - [Web app thứ hai](https://script.google.com/macros/s/AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2/exec).
- Hai GET có tham số chống cache đều trả HTTP 200 và chứa đủ năm dấu kiểm chứng mã giao diện sửa số lượng.
- Pull lại v132: SHA-256 khớp **7/7 file** với local.
- Điểm khôi phục deployment: **v131**; quay lại phiên bản không hoàn tác dữ liệu nghiệp vụ phát sinh sau đó.
- Không gọi API ghi hồ sơ, migration, worker hoặc trigger. Các bằng chứng trên xác nhận mã và endpoint; chưa thử thao tác ghi trên dữ liệu nghiệp vụ thật sau triển khai.

Bằng chứng được lưu ở `outputs/gas-v132-source-proof.json`, `outputs/gas-v132-app-health.json`. Mã v131 và v132 để đối chiếu nằm trong `.codex-remote-attachments/gas-v131-before-quantity-20261015` và `.codex-remote-attachments/gas-v132-after-quantity-20261015`.
