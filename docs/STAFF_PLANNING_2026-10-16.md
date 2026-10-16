# Kế hoạch cán bộ và gợi ý giao việc

## Cách dùng

QL/KS vào Kết quả & kế hoạch → Giao kế hoạch. Chọn Tuần, Tháng hoặc Quý và ngày trong kỳ. Bấm nhãn chỉ tiêu trên thanh ngang, nhập tổng phòng rồi Gợi ý; sửa số từng cán bộ, khóa dòng cần giữ và tính lại. Nhãn đang chọn có nền xanh; trên điện thoại, vuốt thanh ngang để xem các chỉ tiêu còn lại. Đổi nhãn vẫn giữ số đã nhập và khóa của từng chỉ tiêu. Nút Giao kế hoạch nằm phía trên bảng, lưu cả bảng trong một giao dịch. Sao chép kỳ trước có điều chỉnh theo số ngày làm.

Kế hoạch có phiên bản, lịch sử và chốt kỳ. Bảng hiển thị TH/KH kỳ liền trước, thực hiện, tiến độ đến ngày xem, tỷ lệ đúng hạn và ngày làm việc. Cán bộ LS xem phần của mình ở Dashboard và Kế hoạch của tôi.

## Quy tắc tính

- Mỗi loại giữ đơn vị riêng: hợp đồng, tài sản, khoản vay. Hai chỉ tiêu tồn là trần tồn tại thời điểm cuối kỳ, không nhân/chia theo số ngày. Không gom việc khác có đơn vị khác nhau thành một chỉ tiêu.
- Kỳ con chiếm một phần chỉ tiêu kỳ cha. Khi tổng hợp quý, tháng đã bao gồm các tuần trong tháng; không cộng tuần lần nữa. Tuần qua hai tháng chia theo ngày làm thuộc từng tháng. Phần còn lại được phân bổ vào ngày chưa có kỳ con.
- Gợi ý kế hoạch dùng trung vị năng suất/ngày của ba kỳ cùng loại gần nhất, trừ ngày nghỉ/lễ/nghỉ phép. Dữ liệu ít hoặc đầu vào chưa đủ được gắn nhãn, không dùng làm trần cứng. Mẫu ổn định có biên tham khảo 10%; phần vượt khả năng hiện riêng để quản lý quyết định.
- Kết quả dùng cùng hàm domain đang chạy: đúng ngày làm, người làm, số lượng; giữ kết quả bàn giao và khôi phục lịch sử hẹn khách bằng phép chiếu chỉ đọc. Dữ liệu cá nhân đã ẩn mã hồ sơ vẫn cộng đủ các phần ghi nhận trùng thời gian.
- Kỳ chưa giao hiện thiếu kế hoạch, không suy ngược từ cấu hình chung. Kỳ đã chốt giữ tên, danh sách và kết quả lịch sử, kể cả cán bộ đã ngừng hoạt động.
- Tồn kỳ cũ không có ảnh chụp hiện trống. Ảnh tồn lúc chốt lưu kèm ngày chụp; không lấy tồn hôm nay giả làm tồn cuối kỳ trước. Bảo trì hiện hành chốt các kỳ đã kết thúc, chạy lại không tạo lịch sử trùng.

## Gợi ý hồ sơ mới

Hàng chờ hiện người được gợi ý và lý do. Giữ ưu tiên cán bộ đang giữ việc cùng nhóm, quy tắc phụ trách và người thay thế hợp lệ. Khi chưa có ưu tiên này, xếp theo số hồ sơ mở, tồn quá hạn, chỉ tiêu phù hợp còn thiếu và kinh nghiệm gần đây cùng loại việc. Không coi hạn SLA là định mức giờ lao động.

Giao theo lô cộng dồn số hồ sơ dự kiến nhận sau từng dòng; việc cùng nhóm giữ chung người. QL/KS vẫn sửa lựa chọn trước khi giao. Không mở rộng tự giao: chỉ các quy tắc tự giao đã bật mới được máy chủ tự thực hiện khi tạo hồ sơ.

## Dữ liệu và phát hành

Thêm hai bảng StaffPlans và StaffPlanHistory, không sửa bản ghi nghiệp vụ cũ. Runtime schema v63 bổ sung bảng khi bản mới được triển khai và bootstrap nâng cấp. Lưu kế hoạch có kiểm tra phiên bản trong khóa giao dịch; người không có quyền không ghi được. API và bản local chỉ hiện kế hoạch của chính cán bộ đang đăng nhập.

Build sinh thêm Planning.gs, dùng chung bộ tính và trích các quy tắc kết quả/trạng thái từ domain.js. Gói GAS nay có 8 file. `.claspignore` và `prepare-clasp.mjs` đã thêm file này.

## Bằng chứng cục bộ

Chạy `node outputs/verify-staff-planning-release.mjs` để chạy các hợp đồng liên quan, kiểm tra cú pháp, dựng bundle và kiểm tra đủ file phát hành. Kết quả lưu ở outputs/staff-planning-validation.json.

Trình duyệt local đã kiểm tra chia tổng 40 → 20/20; sửa và khóa một dòng 12 → dòng còn lại 28; giao, tải lại và chọn kỳ tháng/quý. Đã xem bố cục 1280×900 và 390×844. Các trường hợp kết quả lịch sử, cán bộ ngừng hoạt động và phạm vi xem cá nhân đã được rà độc lập và kiểm thử hồi quy.

## Phát hành GAS v133 ngày 16/10/2026

Đã push 8 file, tạo phiên bản 133 và cập nhật cả hai deployment hiện hành tại chỗ, giữ nguyên URL. Hai deployment trước đó đều ở v132; bản nguồn v132 được lưu riêng tại `outputs/gas-v132-before-staff-planning-0408` để đối chiếu và có thể quay lại phiên bản 132 khi cần.

Trước phát hành, 22 bộ hợp đồng trong trình kiểm tra tổng hợp, hai bộ kiểm tra thời gian/việc khác và `prepare-clasp.mjs` đều đạt. Sau phát hành, kéo lại phiên bản 133 vào thư mục riêng và đối chiếu SHA-256: khớp 8/8 file. Cả hai URL `/exec` trả HTTP 200 qua GET chống cache và có đủ 11 dấu hiệu giao diện kế hoạch/gợi ý giao việc. Bằng chứng lưu tại [đối chiếu nguồn](../outputs/gas-v133-staff-planning-after-source.json) và [kiểm tra hai webapp](../outputs/gas-v133-staff-planning-health.json).

Chưa chạy thử luồng nghiệp vụ có xác thực hoặc ghi bản ghi nghiệp vụ production. Không gọi thủ công migration hay trigger trong lần phát hành này; việc bổ sung bảng ở bootstrap và chốt kỳ qua bảo trì chưa được xác minh trên dữ liệu thật.

## Phát hành GAS v134: nhãn chỉ tiêu và nút lưu phía trên

Thay dropdown Chỉ tiêu bằng thanh nhãn chọn ngang, giữ màu xanh cho chỉ tiêu đang xem. Máy tính hiển thị đủ nhãn theo hàng; điện thoại cuộn ngang. Nút Giao kế hoạch và Chốt kỳ nằm ở đầu biểu mẫu. Kiểm tra trình duyệt local xác nhận nhập 12, khóa dòng, đổi sang Nhập kho rồi quay lại vẫn giữ nguyên 12 và khóa. Ở khung 390×844, thanh nhãn cuộn trong khung, nút lưu nằm trên bảng và trang không tràn ngang.

Đã kiểm tra cú pháp, build, bốn hợp đồng kế hoạch/giao diện, hợp đồng GAS, thời gian và việc khác; `prepare-clasp.mjs` và `git diff --check` đạt. So với v133 chỉ `Index.gas.html` thay đổi trong gói 8 file. Đã cập nhật hai deployment hiện hành lên v134, giữ nguyên URL; danh sách deployment xác nhận cả hai ở v134. GET chống cache trả HTTP 200 và đủ 14 dấu hiệu giao diện trên cả hai URL. Mã nguồn v134 kéo về khớp SHA-256 8/8 file: [đối chiếu nguồn](../outputs/gas-v134-staff-planning-after-source.json), [kiểm tra webapp](../outputs/gas-v134-staff-planning-health.json). Có thể quay lại v133. Không thử ghi dữ liệu nghiệp vụ thật hay gọi migration/trigger.
