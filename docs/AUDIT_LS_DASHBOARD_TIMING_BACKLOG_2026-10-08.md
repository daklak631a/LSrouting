**Đánh giá luồng LS, bộ đếm, dashboard và việc tồn — 08/10/2026**

**Cập nhật sau sửa chữa — 08/10/2026:** Đã xử lý cả chín nhóm phát hiện bên dưới và triển khai GAS v122 lên hai deployment chính hiện hữu. Mã kéo ngược khớp 7/7 tệp; hai URL `/exec` cùng trả HTTP 200. Các kiểm tra dữ liệu giả xác nhận giờ đang chạy, hiệu chỉnh lịch, bàn giao kết quả, tồn theo loại việc, chốt tồn cuối kỳ, ngày dự kiến và cách tách SLA/toàn trình.

Dashboard cá nhân hiện chia việc tồn theo loại việc và có thể hoàn thành bằng phím `C`, đi qua cùng kiểm tra quyền, checklist và trạng thái như nút hoàn thành. Bảng kết quả ngày gọi rõ phần việc đang mở là tồn hiện tại, còn số liệu kết quả vẫn theo ngày đã chọn. Bộ đếm tổng giờ tự làm mới mỗi phút; báo cáo tách SLA từ lúc nhận đủ hồ sơ khỏi thời gian toàn trình. Cấu hình lịch được kiểm tra ở cả giao diện và máy chủ.

**Phạm vi còn lại:** chưa đọc hoặc ghi Google Sheets thật, chưa kiểm tra giá trị Settings đang lưu và chưa chạy luồng nghiệp vụ có xác thực. GET công khai chỉ chứng minh endpoint/app được phục vụ; dữ liệu giả và kiểm tra mã không chứng minh trạng thái hồ sơ thực tế. Xem [biên bản phát hành v122](<E:/bank routing/LS-Routing/docs/RELEASE_GAS_V122_AUDIT_FIXES_2026-10-08.md>), [đối chiếu mã nguồn 7/7](<E:/bank routing/LS-Routing/outputs/gas-v122-source-proof.json>) và [kiểm tra hai deployment](<E:/bank routing/LS-Routing/outputs/gas-v122-personal-backlog-health.json>).

Phần dưới ghi lại các phát hiện tại thời điểm audit trước khi sửa. Những cụm “cần sửa” và hướng sửa là bằng chứng lịch sử, không phải trạng thái hiện tại của GAS v122.

Kết luận ban đầu: luồng xử lý thông thường đã có các chốt kiểm soát cần thiết, nhưng chưa thể coi số giờ và số tồn trên mọi báo cáo là chuẩn. Đã xác nhận sáu nhóm lỗi trực tiếp, hai vấn đề định nghĩa số tồn và một điểm yếu chỉ xảy ra trong điều kiện hẹp.

Mã được kiểm tra khớp bản GAS v121 vừa triển khai trong cùng phiên: SHA-256 của cả bảy tệp phát hành không đổi; năm module core/domain/screens/app/admin hiện tại có nguyên nội dung trong Index.gas.html. Đối chiếu với bằng chứng kéo mã v121 tại `outputs/gas-v121-source-proof.json` lúc 11:01 UTC. Đây là kiểm tra mã của bản phát hành và hành vi trên dữ liệu giả; chưa xác định số hồ sơ thực tế đang bị ảnh hưởng hoặc giá trị Settings thực tế đang lưu trên GAS.

1. **Kết quả cá nhân bị thiếu sau bàn giao hồ sơ — cần sửa.**

   LS A đã được ghi nhận một HĐ tín dụng, sau đó hồ sơ chuyển cho LS B. Báo cáo điều hành vẫn ghi A = 1, dashboard cá nhân của A lại hiện 0. Nguyên nhân: bootstrap chỉ trả những hồ sơ đang giao cho người đăng nhập, trong khi bảng kết quả lấy đóng góp từ chính tập hồ sơ đó. Dữ liệu ghi công vẫn còn; giao diện cá nhân không còn nhìn thấy nó. Số giờ có nguồn báo cáo riêng nên có thể vẫn đúng, làm hai phần càng khó đối chiếu.

   Vị trí: [lọc theo người đang giữ hồ sơ](<E:/bank routing/LS-Routing/Code.gs:2992>), [tính kết quả trên visibleItems](<E:/bank routing/LS-Routing/js/screens.js:516>). Tái hiện: `credited-result-disappears-from-personal-dashboard-after-handover`.

   Hướng sửa: trả thống kê đóng góp theo người thực hiện và ngày ghi nhận, độc lập với người đang giữ hồ sơ. Không cần mở rộng quyền xem toàn bộ hồ sơ của người khác.

2. **Sửa mốc giờ của hồ sơ cũ có thể làm đồng hồ đang chạy ngừng cộng — cần sửa.**

   Hồ sơ dùng mốc xử lý cũ, chưa có danh sách phiên: bắt đầu 09:00; lúc 10:00 sửa giờ nhận thành 09:15. Đến 11:00 kết quả vẫn là 45 phút, trong khi phải là 105 phút. Nếu dòng có `execution_state=ACTIVE`, giao diện vẫn có thể coi là đang làm dù phiên đã bị khép. Chuyển đổi dữ liệu cũ gán giờ kết thúc bằng thời điểm sửa, làm mất phần phiên còn đang mở. Lỗi không xuất hiện trong mọi hồ sơ mới có phiên đầy đủ.

   Vị trí: [correctItemTimes](<E:/bank routing/LS-Routing/Code.gs:1700>). Tái hiện: `legacy_receipt_correction`, `explicit_active_legacy_correction`.

   Hướng sửa: bảo toàn đuôi phiên đang mở khi chuyển dữ liệu cũ sang danh sách phiên; giữ nguyên các phiên đã đóng và khoảng tạm dừng.

3. **Cấu hình lịch thiếu kiểm tra hợp lệ, có thể làm sai toàn bộ phép tính thời gian — cần sửa.**

   Cả form và hàm máy chủ đều chấp nhận giờ mở 18:00, đóng 08:00. Phép đo giờ sau đó trả 0 và hàm tính hạn không tìm được lịch hợp lệ. Với giờ làm 08:00–17:00 nhưng nghỉ trưa nhập ngược 12:00–11:00, engine cộng thành 10 giờ dù chỉ có 9 giờ đồng hồ. Đây là khả năng lưu cấu hình sai đã tái hiện, chưa phải kết luận lịch đang chạy thực tế đã bị cấu hình sai.

   Vị trí: [form lưu lịch](<E:/bank routing/LS-Routing/js/admin.js:1815>), [adminSaveSettings](<E:/bank routing/LS-Routing/Code.gs:5170>), [tách cửa sổ làm việc](<E:/bank routing/LS-Routing/js/core.js:34>). Tái hiện bằng VM máy chủ và form thật trong Edge.

   Hướng sửa: kiểm tra giờ mở trước giờ đóng; khoảng nghỉ đủ hai mốc, đúng thứ tự và nằm trong ca; ngày nghỉ hợp lệ; kiểm tra ở cả máy chủ và giao diện trước khi đổi state.

4. **Ô tổng giờ trên dashboard không cập nhật cùng đồng hồ hồ sơ — cần sửa.**

   Edge với dữ liệu giả: lúc 09:00, ô tổng và hồ sơ cùng hiện 60 phút. Đẩy thời gian đến 10:00 và chạy đúng hàm cập nhật mỗi giây: hồ sơ hiện 120 phút nhưng “Giờ làm hôm nay” vẫn 60 phút. Sau khi render lại màn hình, ô tổng mới lên 120. Cache theo phút chỉ được kiểm tra khi render nên không tự giải quyết được tình trạng này. Các số quá hạn tính lúc render cũng có cùng giới hạn cập nhật.

   Vị trí: [refreshClocks](<E:/bank routing/LS-Routing/js/screens.js:269>), [personalDashboard](<E:/bank routing/LS-Routing/js/screens.js:2806>), [timer](<E:/bank routing/LS-Routing/js/app.js:1052>). Tái hiện: `dashboard_summary_does_not_follow_clock_ticks`.

   Hướng sửa: cập nhật các chỉ số phụ thuộc thời gian theo phút, giữ nguyên thao tác/form đang mở; tổng hợp gọi máy chủ theo chu kỳ phù hợp, tránh gọi GAS mỗi giây.

5. **Chuyển tháng ghi đè ngày dự kiến của hồ sơ tương lai — cần sửa.**

   Hồ sơ tạo trong tháng 9, khách đề nghị ngày 05/10. Khi chuyển kỳ sang tháng 10, bản mới bị ghi ngày 01/10. Hàm tạo yêu cầu cho phép ngày tương lai và gắn hồ sơ vào kỳ đang hoạt động nên tình huống này có thể phát sinh. Thay đổi ngày còn ảnh hưởng danh sách theo ngày và điều kiện thông báo việc phát sinh trong ngày.

   Vị trí: [carryOpenWorkToPlan_](<E:/bank routing/LS-Routing/Code.gs:1471>), [createRequest](<E:/bank routing/LS-Routing/Code.gs:3307>). Tái hiện: `carry-preserves-or-overwrites-future-schedule`.

   Hướng sửa: giữ nguyên ngày yêu cầu còn ở tương lai; dùng trường chuyển kỳ riêng nếu cần ghi nhận thời điểm chuyển tiếp.

6. **Báo cáo đang dùng lẫn “SLA” và “toàn trình”, đồng thời coi thiếu giờ nhận là đủ mốc — cần sửa.**

   Gửi 07:30, LS nhận đủ hồ sơ 10:30, hoàn thành 11:00: thời gian SLA từ lúc nhận là 0,5 giờ, nhưng cột `avg_sla_hours` trả 3,5 giờ vì tính từ lúc gửi. Màn cá nhân gọi cột này là “Toàn trình TB”, đúng với phép tính; màn quản lý và file xuất lại gọi “SLA TB”. Ngoài ra, hồ sơ hoàn thành thiếu giờ nhận/hạn vẫn được đưa vào mẫu số “đủ mốc”: kết quả 0/1, dù báo cáo cũng đánh dấu thiếu giờ nhận.

   Vị trí: [phép cộng SLA báo cáo](<E:/bank routing/LS-Routing/js/core.js:200>), [nhãn bảng](<E:/bank routing/LS-Routing/js/screens.js:2514>), [xuất Excel](<E:/bank routing/LS-Routing/js/screens.js:2543>). Tái hiện: `sla_report_label_uses_submission_to_completion`, `missing_receipt_sla_denominator`.

   Hướng sửa: giữ riêng thời gian toàn trình và SLA từ lúc nhận; hồ sơ thiếu mốc nằm ở nhóm chất lượng dữ liệu, không được tự coi là trễ hay đủ mốc. Phát hiện này không có nghĩa đồng hồ hạn xử lý thông thường bắt đầu sai: phép tính hạn từ giờ tiếp nhận đang đúng trong các ca đã kiểm tra.

7. **“Hồ sơ tồn” trong bảng có bộ lọc ngày không phải ảnh chụp tồn của ngày đó — cần chốt cách thể hiện.**

   Chọn ngày 07/10: còn một hồ sơ, hiển thị 1. Hoàn thành ngày 08/10 rồi xem lại 07/10 thì còn 0. Ngược lại, hồ sơ chỉ được tiếp nhận ngày 08/10 vẫn có thể xuất hiện trong tồn ngày 07/10 nếu ngày phát sinh là 07/10. Ghi nhận đã soạn hợp đồng ngày 08/10 cũng xóa nó khỏi tồn ngày 07/10. Mã có chủ ý dùng trạng thái hiện tại, nhưng lại lọc ngày phát sinh theo ngày đang xem; giao diện không nói rõ nên dễ đọc thành báo cáo lịch sử.

   Vị trí: [nhánh tính tồn của dailyMatrix](<E:/bank routing/LS-Routing/js/screens.js:527>), [dailyBacklogKeys](<E:/bank routing/LS-Routing/js/domain.js:1384>). Ba ca `daily-backlog-*` chứng minh hành vi.

   Hướng sửa: nếu cần kết quả cuối ngày, dựng trạng thái đến cuối ngày từ lịch sử/snapshot. Nếu chỉ cần hàng chờ hiện tại, đặt phần này riêng và gọi rõ “Tồn soạn hiện tại”, không gắn nó với bộ lọc kết quả lịch sử.

8. **“Tồn cuối kỳ” về 0 khi toàn bộ việc mở đã chuyển kỳ — sai với nghĩa tồn chưa hoàn thành tại cuối kỳ.**

   Tháng 9 còn một việc chưa xong; chuyển sang tháng 10 rồi chốt báo cáo tháng 9 thì “Tồn cuối kỳ” bằng 0. Hàm hiện tại cố ý chốt sau chuyển tiếp và loại mọi dòng đã chuyển tháng. Quy tắc này đúng để tránh thao tác trùng trên hàng chờ hiện tại, nhưng không thể dùng cho ảnh chụp số việc chưa hoàn thành tại cuối tháng. Giao diện hiện gọi đây là “ảnh chụp kỳ cuối”.

   Vị trí: [thứ tự chuyển/chốt kỳ](<E:/bank routing/LS-Routing/Code.gs:790>), [loại dòng chuyển tiếp khỏi tồn cuối kỳ](<E:/bank routing/LS-Routing/Code.gs:2415>), [nhãn báo cáo](<E:/bank routing/LS-Routing/js/screens.js:3199>). Tái hiện qua cả hàm chuyển tiếp, ghi summary và getReport trên kho giả.

   Hướng sửa: chốt tồn trước chuyển kỳ hoặc dựng snapshot theo thời điểm cuối kỳ. Báo cáo nhiều tháng vẫn lấy snapshot kỳ cuối, không cộng các snapshot với nhau. Tách số “chuyển tiếp sang kỳ sau” khỏi số đã hoàn thành.

9. **Chuyển việc chỉ dừng phiên trong cùng kỳ — điểm yếu có điều kiện, ưu tiên sau.**

   Máy chủ cho mở lại hồ sơ đã hoàn thành của kỳ cũ. Nếu truy cập được dòng đó, chẳng hạn giữ tab cũ qua thời điểm chuyển kỳ, chuyển sang làm nó không dừng hồ sơ đang chạy ở kỳ mới. Tái hiện bằng API thật trên dữ liệu giả: hai hồ sơ cùng ACTIVE; từ 09:00 đến 11:00 báo cáo có 3 giờ hồ sơ, 2 giờ người làm. Giờ người làm vẫn gộp giao nhau đúng. Chưa xác lập được đường thao tác thường ngày từ giao diện vừa tải mới; bootstrap thường chỉ tải kỳ hiện tại và chuyển tháng bình thường đã đánh dấu dòng cũ.

   Vị trí: [switchWorkFocus_](<E:/bank routing/LS-Routing/Code.gs:3567>), [chốt chỉ kiểm tra carried_to_item_id](<E:/bank routing/LS-Routing/Code.gs:1672>). Hướng sửa: bảo đảm tối đa một phiên ACTIVE của người dùng trên tất cả các dòng hiện hành, đồng thời xác định quy tắc mở lại hồ sơ kỳ đã đóng.

**Cách hiểu việc tồn hiện tại và đề xuất thống nhất**

| Chỉ số | Hiện tại đang đếm | Đánh giá / quy tắc nên dùng |
|---|---|---|
| Việc tồn theo loại việc | Việc đang mở đang giao cho LS; có cả chưa nhận; loại dòng đã chuyển tiếp | Đúng cho danh sách cần theo dõi hiện tại. Nên tách “Chờ nhận”, “Đang xử lý”, “Chờ khách/tạm dừng”, “Đặt trước”. |
| Tồn soạn HĐ tín dụng/thế chấp | Hồ sơ đã nhận và phần soạn tương ứng chưa ghi nhận xong | Khác số việc mở là hợp lý. Một hồ sơ vẫn mở để chờ ký có thể không còn tồn soạn. |
| Tồn cuối ngày | Hiện chưa tái dựng theo ngày chọn | Phải dùng trạng thái tại cuối ngày hoặc đổi nhãn thành số hiện tại. |
| Tồn cuối tháng | Hiện loại việc đã chuyển kỳ | Phải giữ số chưa xong lúc chốt, dù tháng sau đã sinh dòng chuyển tiếp. |

Dashboard thật chỉ nhận dữ liệu kỳ đang hoạt động. Việc từ tháng trước xuất hiện qua bản chuyển tiếp trong kỳ mới; kiểm tra frontend với một dòng tháng cũ không tự chứng minh backend sẽ tải mọi kỳ. Chọn ngày hoàn thành thuộc tháng cũ trên dashboard cũng bị giới hạn bởi tập hồ sơ bootstrap này; báo cáo thời gian riêng có phạm vi truy vấn khác.

**Những phần đã kiểm tra đúng**

- Tính trong lịch làm việc, trừ nghỉ trưa, cuối tuần/ngày lễ; phân bổ theo ngày và gộp khoảng làm chồng để tính giờ người làm.
- Làm thêm ngoài lịch tuân theo quy tắc hiện có: phiên đã khép trong cùng ngày, giới hạn 4 giờ/phiên; không tính nghỉ trưa. Phiên qua nửa đêm không cộng làm thêm. Đây là quy tắc ứng dụng, không phải đo toàn bộ thời gian đồng hồ.
- SLA hạn hồ sơ thông thường bắt đầu ở lúc LS tiếp nhận đủ hồ sơ; phân công không tự mở phiên làm. Chờ khách/tạm dừng và chuyển việc có xử lý riêng.
- Danh sách tồn phân đúng mã loại việc, loại việc xong/hủy/người khác/dòng chuyển tiếp cũ; hồ sơ chưa nhận không bị đánh giá SLA như hồ sơ đã nhận.
- Việc vay có TSĐB mới không đếm trùng HĐ thế chấp của việc TSĐB riêng. Một nghi vấn ban đầu về đếm trùng đã được loại bỏ bằng phép thử.
- Nút hoàn thành/phím C đi qua kiểm tra quyền, trạng thái, checklist và phần việc bắt buộc; không ghi hoàn thành âm thầm chỉ bằng một lần bấm phím.

**Bằng chứng và phạm vi**

Ba chương trình tái hiện dùng dữ liệu giả, không gọi GAS/Sheets thật:

- [Audit việc tồn và kết quả](<E:/bank routing/LS-Routing/outputs/audit-backlog-2026-10-08.mjs>) — chạy `node outputs/audit-backlog-2026-10-08.mjs`.
- [Audit thời gian](<E:/bank routing/LS-Routing/outputs/audit-timing-2026-10-08.mjs>) — chạy `node outputs/audit-timing-2026-10-08.mjs`.
- [Audit dashboard và cấu hình](<E:/bank routing/LS-Routing/outputs/audit-dashboard-2026-10-08.mjs>) — chạy `node outputs/audit-dashboard-2026-10-08.mjs`; dùng Edge headless với hồ sơ tạm, chặn HTTPS, không dùng phiên đăng nhập thật.

12 bộ kiểm tra sẵn có về backlog, luồng cá nhân, focus, audit thời gian, processing, SLA, zero-hours, other-work, kết quả, chuyển tháng, báo cáo và kế hoạch đã qua trong lượt rà soát. Các bài tái hiện bổ sung chủ động xác nhận hành vi sai còn tồn tại; việc chúng chạy thành công không có nghĩa lỗi đã được sửa. Kiểm tra slop toàn diff hiện có: 0 critical, 0 high; các cảnh báo medium thuộc mã đã có và bản sao bundle.

Ưu tiên sửa ban đầu đã được xử lý trong v122: bảo toàn giờ khi sửa mốc và kiểm tra lịch; giữ kết quả đã ghi cho cán bộ khi bàn giao; thống nhất tồn hiện tại/tồn cuối kỳ và ngày chuyển kỳ; cập nhật chỉ số dashboard; chuẩn hóa nhãn và phép tổng hợp SLA.
