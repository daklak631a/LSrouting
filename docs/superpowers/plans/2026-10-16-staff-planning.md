# Kế hoạch cán bộ và gợi ý phân công

**Goal:** Giao chỉ tiêu theo cán bộ và kỳ tuần/tháng/quý; so kỳ liền kề và dùng tải việc, khả năng nhận việc, chỉ tiêu còn thiếu để gợi ý phân công.

**Architecture:** `js/planning.js` là bộ tính thuần dùng chung trình duyệt/GAS. `js/plans.js` quản lý bảng giao và đánh giá. `Planning.gs` sinh từ bộ tính và các hàm kết quả hiện hành của domain, tránh tạo cách đếm riêng. `StaffPlans` lưu kế hoạch, `StaffPlanHistory` giữ phiên bản và số liệu chốt.

**Constraints:** UTF-8; giữ mọi thay đổi có trước; chỉ làm và kiểm tra cục bộ. Quyền giao KS/QL/Admin, cán bộ chỉ xem phần của mình. Không tự giao hồ sơ ngoài quy tắc tự giao đã bật. Không coi SLA là định mức giờ lao động. Không cộng số lượng khác đơn vị.

- [x] Bộ tính và hợp đồng: kỳ chuẩn, ngày làm trừ nghỉ phép, kết quả đúng người/ngày/số lượng, liên kết kỳ, chia tổng giữ dòng khóa, thiếu năng lực, so sánh kỳ trước.
  - API: `LSPlanning.period(type, date)`, `context(state, domain)`, `evaluate(context, period, plans)`, `suggest(context, period, key, total, pinned)`, `rank(context, item, reservations)`.
  - RED: `node verify-staff-planning-contract.mjs`; GREEN cùng lệnh sau khi triển khai bộ tính.
- [x] Lưu máy chủ: `getWorkPlanning`, `saveStaffPlan`, `closeStaffPlan`; kế hoạch theo khóa kỳ, khóa phiên bản, lịch sử bất biến, chặn sửa kỳ đã chốt. Bootstrap trả kế hoạch đúng phạm vi.
  - RED/GREEN: `node verify-planning-server-contract.mjs`, dùng kho dữ liệu giả trong bộ nhớ, không gọi GAS.
- [x] Bảng giao: chọn kỳ và chỉ tiêu, sao chép, gợi ý tổng phòng, khóa dòng, chỉnh các loại trước khi giao cả bảng; xem lịch sử, đánh giá, chốt kỳ. Dashboard cá nhân có tiến độ.
- [x] Gợi ý hồ sơ mới: ưu tiên nhóm liên kết/quy tắc hiện hành, sau đó tải việc và thiếu chỉ tiêu; lý do rõ. Gợi ý theo lô cộng dồn tải dự kiến. Khách cũ chỉ bổ sung thông tin, không ghi đè lựa chọn.
- [x] Build và kiểm tra: hợp đồng mới, work-plan cũ, batch/assignment/linked/result-credit/leave/privacy/schema, `node build-gas.mjs`, kiểm tra UI desktop/mobile bằng dữ liệu local, slop scan. Không push/deploy.

Kết quả: 22/22 bộ hợp đồng qua; 7 kiểm tra cú pháp qua; 8 file GAS, build lặp có cùng SHA-256. Rà độc lập đã xác nhận sửa các lỗi lịch sử, trạng thái mở, danh sách cán bộ và phạm vi cá nhân. Bằng chứng: `outputs/staff-planning-validation.json`.
