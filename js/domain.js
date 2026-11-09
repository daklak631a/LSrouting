/**
 * domain.js — luật nghiệp vụ: vai trò, trạng thái, kênh gửi tin, mẫu tin, hàng đợi.
 * Không chạm DOM. Mọi thứ ở đây phải khớp Code.gs phía máy chủ.
 */
LS.domain = (function () {
  'use strict';

  var U = LS;

  /* ============================ Vai trò & màn hình ============================ */

  var ROLES = {
    PHONG_PGD: { label: 'Phòng / PGD', nav: ['work', 'room', 'room-board', 'audit'] },
    // KS/QL làm việc trên 5 màn: Hàng chờ (chỉ hồ sơ chờ phân công, kèm quy tắc phân công nhanh),
    // Quản lý hồ sơ (trạng thái mọi hồ sơ, chia theo phòng), Kết quả & kế hoạch, Báo cáo (nhiều kỳ,
    // thời gian & SLA, kế hoạch tháng gộp thành tab) và Nhật ký. "Đề nghị & hồ sơ" là màn của Phòng/PGD.
    KS_LS: { label: 'Kiểm soát LS', nav: ['queue', 'tracking', 'board', 'report', 'audit'] },
    CAN_BO_LS: { label: 'Cán bộ LS', nav: ['my-dashboard', 'mine', 'team', 'time-report', 'audit'] },
    QUAN_LY_LS: { label: 'Quản lý LS', nav: ['board', 'queue', 'tracking', 'report', 'audit'] },
    ADMIN: { label: 'Quản trị hệ thống', nav: ['admin', 'board', 'time-report', 'report', 'periods', 'audit'] },
    GIAM_SAT: { label: 'Giám sát', readOnly: true, nav: ['monitor', 'time-report', 'report'] }
  };

  var SCREENS = {
    monitor: { icon: 'chart', short: 'Tổng hợp', title: 'Giám sát', sub: 'Kết quả theo đơn vị, nghiệp vụ và cán bộ' },
    'time-report': { icon: 'clock', short: 'Thời gian & SLA', title: 'Thời gian & SLA', sub: 'Theo ngày, cán bộ và nghiệp vụ' },
    work: { icon: 'clipboard', short: 'Đề nghị & hồ sơ', title: 'Đề nghị & hồ sơ', sub: 'Tạo đề nghị gửi LS và theo dõi hồ sơ' },
    room: { icon: 'building', short: 'Toàn bộ phòng', title: 'Toàn bộ hồ sơ phòng', sub: 'Tất cả hồ sơ của phòng đang đăng nhập' },
    'room-board': { icon: 'chart', short: 'Dashboard phòng', title: 'Dashboard phòng', sub: 'Khối lượng hồ sơ và LS đang xử lý cho phòng' },
    queue: { icon: 'shield', short: 'Hàng chờ', title: 'Hàng chờ phân công', sub: 'Hồ sơ Phòng/PGD gửi lên đang chờ giao cho cán bộ LS' },
    tracking: { icon: 'clipboard', short: 'Quản lý hồ sơ', title: 'Quản lý hồ sơ', sub: 'Trạng thái mọi hồ sơ đã phân giao, xem theo từng phòng' },
    'assignment-rules': { icon: 'zap', short: 'Phân công nhanh', title: 'Quy tắc phân công nhanh', sub: 'Cấu hình tự giao và mức ưu tiên hồ sơ' },
    mine: { icon: 'briefcase', short: 'Việc tôi', title: 'Việc của tôi', sub: 'Việc đang được giao cho bạn' },
    team: { icon: 'users', short: 'Phân giao phòng', title: 'Phân giao toàn phòng', sub: 'Chỉ xem: ai đang làm hồ sơ nào, khách nào đã được giao trong tuần' },
    'my-dashboard': { icon: 'chart', short: 'Dashboard tôi', title: 'Dashboard cá nhân', sub: 'Kết quả và giờ xử lý thực tế trong ngày' },
    board: { icon: 'chart', short: 'Tổng hợp', title: 'Tổng hợp', sub: 'Kết quả theo kỳ, loại việc và cán bộ LS' },
    report: { icon: 'chart', short: 'Báo cáo', title: 'Báo cáo nhiều kỳ', sub: 'Tổng hợp theo tháng, quý, năm hoặc khoảng tùy chọn' },
    periods: { icon: 'calendar', short: 'Kỳ tháng', title: 'Kế hoạch tháng', sub: 'Kỳ đang vận hành và lịch sử các tháng trước' },
    admin: { icon: 'sliders', short: 'Quản trị', title: 'Quản trị hệ thống', sub: 'Kênh gửi tin, danh mục, người dùng, giám sát' },
    audit: { icon: 'history', short: 'Nhật ký', title: 'Nhật ký', sub: 'Lịch sử thao tác trong phạm vi được xem' }
  };

  /** Cùng một màn nhưng KS/QL dùng với vai trò khác: tên gọi theo việc họ làm ở đó. */
  var LEADER_SCREENS = {
    board: { short: 'Kết quả & kế hoạch', title: 'Kết quả & kế hoạch', sub: 'Kết quả theo kỳ, kế hoạch ngày và chỉ tiêu do KS/QL giao' },
    report: { short: 'Báo cáo', title: 'Báo cáo', sub: 'Nhiều kỳ, thời gian & SLA và kế hoạch tháng' }
  };

  var PERSONAL_SCREENS = {
    'time-report': { short: 'Thời gian của tôi', title: 'Thời gian của tôi', sub: 'Giờ xử lý hồ sơ của bạn theo ngày' }
  };

  function screenFor(role, id) {
    var base = SCREENS[id];
    var over = (role === 'KS_LS' || role === 'QUAN_LY_LS') && LEADER_SCREENS[id];
    if (role === 'CAN_BO_LS' && PERSONAL_SCREENS[id]) over = PERSONAL_SCREENS[id];
    return over ? Object.assign({}, base, over) : base;
  }

  /* ============================ Trạng thái việc ============================ */

  /**
   * Luồng chính: Phòng/PGD tạo việc (Chờ phân công) → Kiểm soát/Quản lý LS giao
   * cán bộ (Đã phân công) → cán bộ LS Tiếp nhận hồ sơ → Hẹn khách ký → Hoàn thành.
   * Mã có `legacy` chỉ còn để đọc hồ sơ và nhật ký tạo trước khi rút gọn luồng:
   * không bước nào đưa hồ sơ vào đó nữa, hồ sơ đang nằm ở đó vẫn đi tiếp được.
   */
  var STATUS = {
    CHO_PHAN_CONG: { label: 'Chờ phân công', tone: 'warn', open: true },
    CHO_HOAN_THIEN: { label: 'Chờ phân công', tone: 'warn', open: true, legacy: true },
    CHO_TIEP_NHAN: { label: 'Chờ tiếp nhận', tone: 'warn', open: true, legacy: true },
    CAN_BO_SUNG: { label: 'Chưa giao hồ sơ', tone: 'warn', open: true },
    CHUA_GIAO_HO_SO: { label: 'Chưa giao hồ sơ', tone: 'warn', open: true },
    DA_PHAN_CONG: { label: 'Đã phân công', tone: 'info', open: true },
    DANG_THUC_HIEN: { label: 'Đã tiếp nhận hồ sơ', tone: 'info', open: true },
    DA_SOAN_XONG: { label: 'Đã soạn xong', tone: 'violet', open: true, legacy: true },
    DANG_HEN_KH: { label: 'Đang hẹn khách ký', tone: 'violet', open: true },
    CHO_KS_DUYET: { label: 'Chờ kiểm soát duyệt', tone: 'gold', open: true, legacy: true },
    HOAN_THANH_LS: { label: 'Hoàn thành', tone: 'ok', open: false },
    TAM_DUNG: { label: 'Tạm dừng', tone: 'neutral', open: true },
    HUY: { label: 'Đã hủy', tone: 'neutral', open: false }
  };

  /** Hồ sơ chưa có cán bộ LS: cả mã hiện hành lẫn hai mã cũ đều giao việc được. */
  var PRE_ASSIGN = ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN'];

  var EVENT_LABEL = {
    TU_DUNG_PHIEN:'Hệ thống khép phiên làm bỏ quên', CHO_LAM_TIEP:'Chờ làm tiếp', BAT_DAU_LAM:'Bắt đầu làm', LAM_TIEP:'Làm tiếp',
    TAM_DUNG_TOAN_BO:'Tạm dừng đồng hồ hồ sơ', TIEP_TUC_TOAN_BO:'Tiếp tục đồng hồ hồ sơ',
    TAM_DUNG_TOAN_BO_BAT_DAU:'Bắt đầu tác nghiệp khác', TAM_DUNG_TOAN_BO_KET_THUC:'Kết thúc tác nghiệp khác',
    SUA_THOI_GIAN: 'Sửa thời gian nhận / hoàn thành', DOI_HAN_XU_LY: 'Đổi hạn xử lý',
    GHI_NHAN_GIAO_DICH: 'Sửa ghi nhận kết quả (HĐ thế chấp / Rlos)',
    GHI_NHAN_PHAN_VIEC: 'Ghi nhận phần việc (HĐ thế chấp / nhập kho / xuất kho)',
    XAC_NHAN_NHAN_DU_HO_SO: 'LS xác nhận nhận đủ hồ sơ',
    XAC_NHAN_NGUOI_XU_LY: 'Xác nhận người xử lý phiên cũ',
    TAO_VIEC: 'Tạo việc', CHUYEN_TIEP_THANG: 'Chuyển tiếp sang tháng mới', TU_TRA_QLKH: 'Tự trả về Phòng/PGD (quá ngày chưa tiếp nhận)', TU_VAO_PHAN_CONG: 'Tự đưa lại vào Hàng chờ phân công', SUA_THONG_TIN: 'Sửa thông tin', DE_NGHI_SUA: 'Đề nghị sửa',
    DUYET_SUA: 'Duyệt sửa', TU_CHOI_SUA: 'Từ chối sửa', DOI_NGUOI: 'Chuyển việc',
    DE_NGHI_HUY: 'Đề nghị hủy việc', DUYET_HUY: 'Duyệt hủy việc', TU_CHOI_HUY: 'Từ chối đề nghị hủy', HEN_BO_SUNG: 'Hẹn bổ sung',
    QUA_HAN: 'Quá hạn', CAU_HINH: 'Đổi cấu hình', GUI_TIN: 'Gửi tin'
  };

  function label(code) { return (STATUS[code] && STATUS[code].label) || EVENT_LABEL[code] || code; }
  function tone(code) { return (STATUS[code] && STATUS[code].tone) || 'neutral'; }

  /**
   * Chuyển trạng thái hợp lệ. Thiếu ở đây nghĩa là không cho phép.
   * notify: sự kiện phát cho bộ máy thông báo sau khi lưu.
   */
  /**
   * label: chữ đầy đủ trong hộp thoại. short: chữ trên nút trong bảng —
   * nút trong bảng phải nằm gọn một dòng, không xuống hàng.
   * rank: thứ tự ưu tiên khi bảng chỉ đủ chỗ cho vài nút.
   */
  /** Việc chưa giao: kiểm soát/quản lý LS phân công là bước chính duy nhất. */
  function unassignedFlow() {
    return [
      { to: 'DA_PHAN_CONG', label: 'Phân công cán bộ LS', short: 'Phân công', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, primary: true, rank: 1, notify: 'DA_PHAN_CONG' },
      { to: 'CAN_BO_SUNG', label: 'Trả Phòng/PGD bổ sung', short: 'Trả bổ sung', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'BO_SUNG', rank: 2, notify: 'CAN_BO_SUNG' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['PHONG_PGD', 'KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ];
  }

  var FLOW = {
    CHO_PHAN_CONG: unassignedFlow(),
    CAN_BO_SUNG: [
      { to: 'CHO_PHAN_CONG', label: 'Gửi lại LS', short: 'Gửi lại', roles: ['PHONG_PGD'], primary: true, rank: 1 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD'], reason: 'HUY', rank: 9 }
    ],
    CHUA_GIAO_HO_SO: [
      { to: 'CHO_PHAN_CONG', label: 'Gửi lại LS', short: 'Gửi lại', roles: ['PHONG_PGD'], primary: true, rank: 1 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD'], reason: 'HUY', rank: 9 }
    ],
    DA_PHAN_CONG: [
      // Phòng/PGD đưa hồ sơ lên thì cán bộ LS tiếp nhận: mốc nhận hồ sơ, bắt đầu tính SLA.
      { to: 'DANG_THUC_HIEN', label: 'Tiếp nhận hồ sơ', short: 'Tiếp nhận', roles: ['CAN_BO_LS'], primary: true, rank: 1 },
      { to: 'DA_PHAN_CONG', label: 'Chuyển người khác', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'PHONG_PGD'], rank: 8 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    DANG_THUC_HIEN: [
      { to: 'DANG_HEN_KH', label: 'Hẹn khách ký hồ sơ', short: 'Hẹn ký', roles: ['CAN_BO_LS'], appointment: true, primary: true, rank: 1, notify: 'DANG_HEN_KH' },
      // Chỉ hiện với loại việc không cần khách ký, hoặc hồ sơ đã có lịch hẹn (xem actionsFor).
      { to: 'HOAN_THANH_LS', label: 'Hoàn thành', short: 'Hoàn thành', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 2, notify: 'HOAN_THANH_LS' },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'PHONG_PGD'], rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Chuyển người khác', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    DANG_HEN_KH: [
      { to: 'HOAN_THANH_LS', label: 'Hoàn thành', short: 'Hoàn thành', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 1, notify: 'HOAN_THANH_LS' },
      { to: 'DANG_THUC_HIEN', label: 'Quay lại xử lý', short: 'Quay lại', roles: ['CAN_BO_LS'], reason: 'free', rank: 8 },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'PHONG_PGD'], rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Đổi người xử lý', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 3, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],

    /* ---- Trạng thái cũ: chỉ còn lối ra cho hồ sơ đang nằm ở đó ---- */
    CHO_HOAN_THIEN: unassignedFlow(),
    CHO_TIEP_NHAN: unassignedFlow(),
    DA_SOAN_XONG: [
      { to: 'DANG_HEN_KH', label: 'Hẹn khách ký hồ sơ', short: 'Hẹn ký', roles: ['CAN_BO_LS'], appointment: true, primary: true, rank: 1, notify: 'DANG_HEN_KH' },
      { to: 'HOAN_THANH_LS', label: 'Hoàn thành', short: 'Hoàn thành', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 2, notify: 'HOAN_THANH_LS' },
      { to: 'DANG_THUC_HIEN', label: 'Quay lại xử lý', short: 'Quay lại', roles: ['CAN_BO_LS'], reason: 'free', rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Đổi người xử lý', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    CHO_KS_DUYET: [
      { to: 'HOAN_THANH_LS', label: 'Duyệt hoàn thành', short: 'Duyệt', roles: ['KS_LS', 'QUAN_LY_LS'], note: true, primary: true, rank: 1, notify: 'HOAN_THANH_LS' },
      { to: 'DANG_THUC_HIEN', label: 'Trả lại cán bộ', short: 'Trả lại', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'free', rank: 2 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],

    TAM_DUNG: [
      { to: 'DANG_THUC_HIEN', label: 'Tiếp tục xử lý', short: 'Tiếp tục', roles: ['CAN_BO_LS', 'PHONG_PGD'], reason: 'free', primary: true, rank: 1 },
      { to: 'DA_PHAN_CONG', label: 'Đổi người xử lý', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    HOAN_THANH_LS: [
      { to: 'DANG_THUC_HIEN', label: 'Mở lại việc', short: 'Mở lại', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'free', rank: 1 }
    ],
    HUY: []
  };

  var APPT_RESULT = {
    CHUA_LIEN_HE: 'Chưa liên hệ', DA_HEN: 'Đã hẹn', DOI_LICH: 'Đổi lịch',
    KHONG_LIEN_LAC: 'Không liên lạc được', TU_CHOI: 'Khách từ chối', DA_KY: 'Khách đã ký'
  };

  /** Ba kênh báo khách hiển thị thành một hàng nhãn trong hộp thoại hẹn ký. */
  var REACH_CHANNELS = [
    { code: 'EMAIL', label: 'Email', icon: 'mail', out: 'EMAIL' },
    { code: 'ZALO', label: 'Zalo', icon: 'chat', out: 'ZBS' },
    { code: 'SMS', label: 'SMS', icon: 'send', out: 'SMS' }
  ];

  /**
   * Khách liên hệ được bằng gì. Không có kênh nào thì không chặn việc:
   * chuyển sang nhắn nhóm Zalo nội bộ và gắn thẻ cán bộ phụ trách.
   */
  function customerReach(req, st) {
    var c = req ? req.customer : null;
    var available = [];
    if (c && c.email) available.push('EMAIL');
    if (c && c.zalo) available.push('ZALO');
    if (c && c.phone) { available.push('SMS'); if (available.indexOf('ZALO') === -1 && c.zalo !== false) available.push('ZALO'); }
    return {
      available: available,
      fallback: available.length ? available[0] : 'NHOM',
      officer: null
    };
  }

  /**
   * Nơi ký là một giá trị mặc định chung do quản trị đặt trong Cấu hình chung.
   * Cán bộ LS không chọn nơi ký; hộp thoại hẹn ký chỉ hỏi ngày, giờ và kênh báo khách.
   */
  function signPlace(st) {
    return (st.settings && st.settings.sign_place) || '';
  }

  /** Giờ ký gợi ý: tiếng tròn kế tiếp, kéo vào trong giờ làm việc. */
  function nextSlot(st) {
    var cal = st.calendar || { open: '08:00', close: '17:30' };
    var d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    var mins = d.getHours() * 60 + d.getMinutes();
    var open = Number(cal.open.split(':')[0]) * 60 + Number(cal.open.split(':')[1]);
    var close = Number(cal.close.split(':')[0]) * 60 + Number(cal.close.split(':')[1]);
    if (mins < open) mins = open;
    if (mins > close - 30) mins = open;
    return U.pad(Math.floor(mins / 60)) + ':' + U.pad(mins % 60);
  }

  /* ============================ Kênh gửi tin ============================ */

  /**
   * Định nghĩa tĩnh của từng kênh: trường cấu hình và điều kiện sẵn sàng.
   * `ready` trả về các điều kiện còn thiếu; kênh thiếu điều kiện không được bật.
   */
  /**
   * Hạn mức thư là hạn mức mỗi ngày. Bộ đếm không gắn ngày thì sau một lần chạm
   * trần, email tắt vĩnh viễn — giống hệt lỗi từng có ở phía GAS.
   */
  function emailUsedToday(config) {
    if (String(config.quota_date || '') !== U.localDate()) return 0;
    return Number(config.used_today || 0);
  }

  var CHANNELS = {
    IN_APP: {
      name: 'Thông báo trong ứng dụng',
      icon: 'bell',
      to: 'NOI_BO',
      locked: true,
      desc: 'Hiện trong chuông thông báo của cán bộ. Luôn bật, không gửi ra ngoài.',
      fields: [],
      ready: function () { return [{ label: 'Không cần cấu hình', ok: true }]; }
    },

    EMAIL: {
      name: 'Email công vụ',
      icon: 'mail',
      to: 'CA_HAI',
      desc: 'Gửi qua MailApp dưới tài khoản triển khai Apps Script.',
      fields: [
        { key: 'mode', label: 'Cách gửi', type: 'select', options: [['MAILAPP', 'MailApp (Apps Script)']] },
        { key: 'sender', label: 'Hộp thư gửi', type: 'text', placeholder: 'thongbao.ls@bank.vn', hint: 'hộp thư tổ chức, không dùng tài khoản cá nhân' },
        { key: 'daily_quota', label: 'Hạn mức thư mỗi ngày', type: 'number' },
        { key: 'unit_cost', label: 'Đơn giá/lượt', type: 'number' },
        { key: 'currency', label: 'Đơn vị tiền', type: 'text' },
        { key: 'cost_version', label: 'Phiên bản đơn giá', type: 'text' }
      ],
      ready: function (c) {
        var out = [{ label: 'Có hộp thư gửi của tổ chức', ok: !!c.sender && /@/.test(c.sender) }];
        out.push({ label: 'MailApp chạy dưới tài khoản triển khai', ok: c.mode !== 'GMAIL_API', hint: 'danh tính người gửi và hạn mức phụ thuộc tài khoản này' });
        out.push({ label: 'Còn hạn mức trong ngày', ok: Number(c.daily_quota) > emailUsedToday(c) });
        return out;
      }
    },

    ZBS: {
      name: 'Zalo OA — ZBS Template',
      icon: 'chat',
      to: 'KHACH',
      desc: 'Tin theo mẫu gửi khách hàng. Mẫu phải được Zalo kiểm duyệt trước khi gửi thật.',
      docs: 'https://oa.zalo.me/home/function/interaction',
      fields: [
        { key: 'oa_id', label: 'Mã OA', type: 'text' },
        { key: 'app_id', label: 'App ID', type: 'text' },
        { key: 'secret_set', label: 'Đã nạp khóa bí mật vào máy chủ', type: 'bool', hint: 'khóa không được đặt trong mã client hay Sheet' },
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'secret_ref', label: 'Tham chiếu khóa', type: 'text' },
        { key: 'unit_cost', label: 'Đơn giá/lượt', type: 'number' },
        { key: 'currency', label: 'Đơn vị tiền', type: 'text' },
        { key: 'cost_version', label: 'Phiên bản đơn giá', type: 'text' }
      ],
      ready: function (c, st) {
        var approved = st.templates.filter(function (t) { return t.channel === 'ZBS' && t.status === 'DA_DUYET'; }).length;
        return [
          { label: 'Đã khai báo OA và App ID', ok: !!c.oa_id && !!c.app_id },
          { label: 'Khóa bí mật giữ phía máy chủ', ok: !!c.secret_set },
          { label: 'Có ít nhất một mẫu được Zalo duyệt', ok: approved > 0 }
        ];
      }
    },

    SMS: {
      name: 'SMS khách hàng',
      icon: 'send',
      to: 'KHACH',
      desc: 'Tin SMS gửi khách qua provider đã cấu hình.',
      fields: [
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'sender_id', label: 'Đầu số/brandname', type: 'text' },
        { key: 'secret_ref', label: 'Tham chiếu khóa', type: 'text' },
        { key: 'unit_cost', label: 'Đơn giá/lượt', type: 'number' },
        { key: 'currency', label: 'Đơn vị tiền', type: 'text' },
        { key: 'cost_version', label: 'Phiên bản đơn giá', type: 'text' }
      ],
      ready: function (c, st) {
        var approved = st.templates.filter(function (t) { return t.channel === 'SMS' && t.status === 'DA_DUYET'; }).length;
        return [
          { label: 'Đã khai báo provider và đầu số', ok: !!c.provider && !!c.sender_id },
          { label: 'Đã khai báo tham chiếu khóa', ok: !!c.secret_ref },
          { label: 'Có ít nhất một mẫu SMS được duyệt', ok: approved > 0 }
        ];
      }
    },

    GMF: {
      name: 'Nhóm Zalo nội bộ (GMF)',
      icon: 'users',
      to: 'NOI_BO',
      desc: 'Thông báo việc cho nhóm nội bộ. Tin nhóm chỉ được chứa mã việc, đơn vị, hạn và link đăng nhập.',
      fields: [
        { key: 'group_id', label: 'Mã nhóm', type: 'text' },
        { key: 'api_checked', label: 'Đã kiểm chứng API gửi được vào nhóm', type: 'bool' }
      ],
      ready: function (c) {
        return [
          { label: 'Đã khai báo mã nhóm', ok: !!c.group_id },
          { label: 'Đã kiểm chứng khả năng gửi nhóm trên OA của tổ chức', ok: !!c.api_checked }
        ];
      }
    },

    TELEGRAM: {
      name: 'Telegram bot',
      icon: 'send',
      to: 'CA_HAI',
      desc: 'Bot chỉ nhắn được cho người đã chủ động bắt đầu trò chuyện hoặc nhóm đã thêm bot. Không lấy số điện thoại rồi tự gửi được.',
      docs: 'https://core.telegram.org/bots',
      fields: [
        { key: 'bot_name', label: 'Tên bot', type: 'text', placeholder: '@ls_routing_bot' },
        { key: 'token_set', label: 'Đã nạp token vào máy chủ', type: 'bool' },
        { key: 'group_chat_id', label: 'Chat ID nhóm nội bộ', type: 'text', hint: 'lấy từ bot sau khi thêm bot vào nhóm' }
      ],
      // Người nhận cá nhân khai `telegram_chat_id` ở màn Người dùng. Trước đây điều
      // kiện này đọc một ô readonly không có gì ghi vào, nên kênh không bao giờ bật được.
      ready: function (c, st) {
        var staff = st.users.filter(function (u) { return u.active && String(u.telegram_chat_id || '').trim(); }).length;
        return [
          { label: 'Đã khai báo bot và token', ok: !!c.bot_name && !!c.token_set },
          { label: 'Có nhóm hoặc cán bộ đã đăng ký chat', ok: !!c.group_chat_id || staff > 0,
            hint: 'bot chỉ nhắn được cho người đã chủ động bắt đầu trò chuyện' }
        ];
      }
    }
  };

  var CHANNEL_STATUS = {
    CHUA_KICH_HOAT: { label: 'Chưa kích hoạt', tone: 'neutral' },
    THU_NGHIEM: { label: 'Thử nghiệm', tone: 'gold' },
    HOAT_DONG: { label: 'Đang hoạt động', tone: 'ok' },
    TAM_NGUNG: { label: 'Tạm ngưng', tone: 'danger' }
  };

  function channelReady(code, st) {
    var def = CHANNELS[code];
    var ch = U.byId(st.channels, 'code', code);
    if (!def || !ch) return { checks: [], ok: false };
    var checks = def.ready(ch.config || {}, st);
    if (['ZBS', 'SMS', 'GMF', 'TELEGRAM'].indexOf(code) !== -1) {
      checks.push({ label: 'Gateway và credential đã cấu hình', ok: !!st.settings.gateway_url && String(st.settings.gateway_token_set).toLowerCase() === 'true' });
    }
    var ok = checks.every(function (c) { return c.ok; });
    return { checks: checks, ok: ok };
  }

  /** Kênh chỉ gửi được khi đủ điều kiện VÀ không bị tạm ngưng. */
  function channelUsable(code, st) {
    var ch = U.byId(st.channels, 'code', code);
    if (!ch) return false;
    if (ch.status === 'TAM_NGUNG' || ch.status === 'CHUA_KICH_HOAT') return false;
    return channelReady(code, st).ok;
  }

  /* ============================ Mẫu tin ============================ */

  var VARS = {
    can_bo_ls:'Cán bộ LS',hoan_thanh_luc:'Giờ hoàn thành',lich_hen:'Lịch hẹn khách hàng',
    ma_viec: 'Mã việc', loai_viec: 'Loại việc', don_vi: 'Đơn vị gửi',
    han_xu_ly: 'Hạn xử lý', nguoi_giao: 'Người giao', link: 'Link đăng nhập',
    ten_khach: 'Tên khách hàng', thoi_gian: 'Thời gian hẹn', dia_diem: 'Địa điểm',
    hotline: 'Số tổng đài', ten_ngan_hang: 'Tên ngân hàng', cif: 'Mã CIF',
    san_pham: 'Tên sản phẩm', so_tien: 'Số tiền', so_dien_thoai: 'Số điện thoại',
    ngay_ky: 'Ngày ký', gio_ky: 'Giờ ký', noi_ky: 'Nơi ký', link_ban_do: 'Link chỉ đường Google Maps', tag_can_bo: 'Thẻ cán bộ trong nhóm Zalo'
  };

  /* Biến bị cấm theo kênh — lấy từ mục 6 của kế hoạch nghiệp vụ. */
  var FORBIDDEN = {
    GMF: ['ten_khach', 'cif', 'san_pham', 'so_tien', 'so_dien_thoai'],
    ZBS: ['cif', 'san_pham', 'so_tien'],
    SMS: ['cif', 'san_pham', 'so_tien'],
    TELEGRAM: ['cif', 'san_pham', 'so_tien'],
    EMAIL: ['cif', 'so_tien'],
    IN_APP: []
  };

  var TPL_STATUS = {
    NHAP: { label: 'Nháp', tone: 'neutral' },
    CHO_DUYET: { label: 'Chờ duyệt', tone: 'gold' },
    DA_DUYET: { label: 'Đã duyệt', tone: 'ok' },
    TU_CHOI: { label: 'Bị từ chối', tone: 'danger' }
  };

  function usedVars(body) {
    var out = [], re = /\{\{\s*([a-z_]+)\s*\}\}/g, m;
    while ((m = re.exec(String(body || '')))) if (out.indexOf(m[1]) === -1) out.push(m[1]);
    return out;
  }

  /** Kiểm mẫu trước khi cho chuyển sang "chờ duyệt". */
  function checkTemplate(tpl) {
    var errs = [];
    var vars = usedVars(tpl.body);
    var banned = FORBIDDEN[tpl.channel] || [];

    vars.forEach(function (v) {
      if (!VARS[v]) errs.push('Biến {{' + v + '}} không có trong danh sách cho phép.');
      else if (banned.indexOf(v) !== -1) errs.push('Kênh ' + CHANNELS[tpl.channel].name + ' không được chứa {{' + v + '}}.');
    });

    if (!String(tpl.body || '').trim()) errs.push('Nội dung mẫu đang trống.');
    if (String(tpl.body || '').length > 600) errs.push('Nội dung quá dài (tối đa 600 ký tự).');
    return { vars: vars, errors: errs, ok: errs.length === 0 };
  }

  function renderTemplate(body, ctx) {
    return String(body || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (all, k) {
      return ctx[k] !== undefined && ctx[k] !== '' ? ctx[k] : '[' + (VARS[k] || k) + ']';
    });
  }

  /* ============================ Quy tắc thông báo ============================ */

  var NOTIFY_EVENTS = {
    DA_PHAN_CONG: 'Giao việc cho cán bộ',
    DOI_NGUOI: 'Chuyển việc sang người khác',
    CAN_BO_SUNG: 'Trả hồ sơ về phòng bổ sung',
    TU_TRA_QLKH: 'Việc tự trả về phòng — chọn ngày và đẩy lại',
    TU_VAO_PHAN_CONG: 'Việc hôm nay được tự đưa lại vào phân công',
    DE_NGHI_SUA: 'Có đề nghị sửa chờ duyệt',
    QUA_HAN: 'Việc quá hạn xử lý',
    DANG_HEN_KH: 'Hẹn khách ký hồ sơ',
    HOAN_THANH_LS: 'Hoàn thành phần việc LS',
    // Tin trong app gửi thẳng người liên quan khi sửa hồ sơ (không qua quy tắc).
    DUYET_SUA: 'Đề nghị sửa đã được duyệt',
    TU_CHOI_SUA: 'Đề nghị sửa bị từ chối',
    SUA_THONG_TIN: 'Kiểm soát đã sửa thông tin hồ sơ',
    DE_NGHI_HUY: 'Có đề nghị hủy việc chờ duyệt',
    DUYET_HUY: 'Đề nghị hủy đã được duyệt',
    TU_CHOI_HUY: 'Đề nghị hủy bị từ chối',
    HEN_BO_SUNG: 'Phòng/PGD hẹn bổ sung',
    QLKH_TIEP_TUC: 'Phòng/PGD cho tiếp tục hồ sơ đã tạm dừng',
    NGHI_PHEP_LS: 'Cán bộ LS tự khai nghỉ phép'
  };

  /** Tin trong app không có mẫu; dựng một dòng đủ hiểu từ chính sự kiện. */
  function defaultBody(channel, rule, ctx) {
    if (channel !== 'IN_APP') return '';
    return (NOTIFY_EVENTS[rule.event] || rule.event) + ': ' + ctx.ma_viec +
      (ctx.loai_viec ? ' — ' + ctx.loai_viec : '') +
      (ctx.han_xu_ly ? '. Hạn: ' + ctx.han_xu_ly : '') + '.';
  }

  var AUDIENCE = {
    CAN_BO: 'Cán bộ phụ trách',
    KS: 'Kiểm soát LS',
    PHONG_GUI: 'Phòng / PGD gửi việc',
    PHONG_PHU_TRACH:'Người gửi và user nhận email của Phòng/PGD',
    QUAN_LY: 'Quản lý LS',
    KHACH: 'Khách hàng',
    NHOM: 'Nhóm Zalo nội bộ'
  };

  /* ============================ Hàng đợi gửi ============================ */

  var OUT_STATUS = {
    CHO_XAC_NHAN: { label: 'Chờ cán bộ xác nhận', tone: 'gold' },
    CHO_GUI: { label: 'Chờ gửi', tone: 'info' },
    DANG_GUI: { label: 'Đang gửi', tone: 'info' },
    DA_GUI: { label: 'Đã gửi', tone: 'ok' },
    CAN_DOI_SOAT: { label: 'Cần đối soát', tone: 'warn' },
    THAT_BAI: { label: 'Thất bại', tone: 'danger' },
    KHONG_GUI: { label: 'Không gửi', tone: 'neutral' },
    DA_HUY: { label: 'Đã hủy', tone: 'neutral' }
  };

  function staffRecipient(u) {
    return { kind: 'NOI_BO', id: u.user_id, name: u.full_name, email: u.email || '',
      phone: u.zalo_phone || '', telegram: u.telegram_chat_id || '' };
  }

  function recipientsFor(audience, item, st) {
    var req = U.byId(st.requests, 'request_id', item.request_id);
    var out = [];

    if (audience === 'CAN_BO' && item.assigned_user_id) {
      var u = U.byId(st.users, 'user_id', item.assigned_user_id);
      if (u) out.push(staffRecipient(u));
    }
    if (audience === 'KS' || audience === 'QUAN_LY') {
      var role = audience === 'KS' ? 'KS_LS' : 'QUAN_LY_LS';
      st.users.filter(function (x) { return x.role === role && x.active; })
        .forEach(function (x) { out.push(staffRecipient(x)); });
    }
    if (audience === 'PHONG_GUI' && req) {
      st.users.filter(function (x) { return x.unit_id === req.unit_id && x.role === 'PHONG_PGD' && x.active; })
        .forEach(function (x) { out.push(staffRecipient(x)); });
    }
    if (audience === 'PHONG_PHU_TRACH' && req) {
      // Chỉ đúng cán bộ Phòng/PGD đã đưa hồ sơ này nhận email báo (hẹn ký / hoàn
      // thành) — không phát cho cả đơn vị. Người gửi do máy chủ ghi cứng vào
      // requestor_id = created_by lúc tạo hồ sơ.
      st.users.filter(function(x) { return x.role==='PHONG_PGD' && x.active &&
        x.user_id===(req.requestor_id || (req.requestor || {}).id || req.created_by); })
        .forEach(function(x) { out.push(staffRecipient(x)); });
    }
    if (audience === 'NHOM') {
      var grp = U.byId(st.channels, 'code', 'GMF');
      var tele = U.byId(st.channels, 'code', 'TELEGRAM');
      out.push({
        kind: 'NHOM', id: 'NHOM_NOI_BO', name: 'Nhóm nội bộ', email: '',
        phone: grp && grp.config ? grp.config.group_id || '' : '',
        telegram: tele && tele.config ? tele.config.group_chat_id || '' : ''
      });
    }
    if (audience === 'KHACH' && req) {
      out.push({ kind: 'KHACH', id: req.request_id, name: req.customer.name,
        email: req.customer.email || '', phone: req.customer.phone || '', telegram: '' });
    }
    return out;
  }

  /**
   * Mỗi kênh có kiểu địa chỉ riêng. Gộp chung thành một trường là cách chắc chắn
   * đưa số điện thoại vào ô người nhận email rồi đổ lỗi cho nhà cung cấp.
   */
  function addressFor(channel, rcp) {
    if (channel === 'IN_APP') return rcp.kind === 'NOI_BO' ? rcp.id : '';
    if (channel === 'EMAIL') return U.validEmail(rcp.email) && rcp.email ? String(rcp.email).trim().toLowerCase() : '';
    if (channel === 'TELEGRAM') return rcp.telegram || '';
    if (channel === 'GMF') return rcp.kind === 'NHOM' ? rcp.phone : '';
    if (channel === 'ZBS' || channel === 'SMS') return rcp.kind === 'KHACH' && U.validPhone(rcp.phone) ? U.normalizePhone(rcp.phone) : '';
    return '';
  }

  function addressBlocker(channel, rcp) {
    if (channel === 'EMAIL') return 'Người nhận chưa có email công vụ';
    if (channel === 'TELEGRAM') return 'Người nhận chưa đăng ký chat Telegram';
    if (channel === 'GMF') return 'Kênh nhóm chỉ gửi cho nhóm nội bộ';
    if (channel === 'ZBS' || channel === 'SMS') return 'Kênh này chỉ gửi cho khách có số điện thoại';
    if (channel === 'IN_APP') return 'Thông báo trong app chỉ gửi cho người dùng nội bộ';
    return 'Người nhận chưa có địa chỉ phù hợp với kênh ' + channel;
  }

  /** Quy tắc khai mẫu theo danh sách, mỗi kênh một mã. Không khớp kênh thì không gửi. */
  function templateFor(rule, channel, st) {
    var codes = String(rule.template || '').split(',')
      .map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i = 0; i < codes.length; i++) {
      var tpl = U.byId(st.templates, 'code', codes[i]);
      if (tpl && tpl.channel === channel) return tpl;
    }
    return null;
  }

  function contextFor(item, st) {
    var req = U.byId(st.requests, 'request_id', item.request_id);
    var wt = U.byId(st.workTypes, 'code', item.work_type_code);
    var unit = req ? U.byId(st.units, 'unit_id', req.unit_id) : null;
    return {
      ma_viec: item.item_id,
      can_bo_ls:U.byId(st.users,'user_id',item.assigned_user_id) ? U.byId(st.users,'user_id',item.assigned_user_id).full_name : '',
      hoan_thanh_luc:item.completed_at ? U.fmtDT(item.completed_at) : '',
      lich_hen:item.appointment && item.appointment.at ? U.fmtDT(item.appointment.at)+' · '+(item.appointment.place || 'Chưa có địa điểm') : 'Chưa có lịch hẹn khách hàng',
      loai_viec: wt ? wt.name : item.work_type_code,
      don_vi: unit ? unit.name : '',
      han_xu_ly: item.due_at ? U.fmtDT(item.due_at) : 'chưa đặt',
      nguoi_giao: U.byId(st.users, 'user_id', item.assigned_by || '') ? U.byId(st.users, 'user_id', item.assigned_by).full_name : '',
      link: st.settings.app_url,
      ten_khach: req ? req.customer.name : '',
      thoi_gian: item.appointment ? U.fmtDT(item.appointment.at) : '',
      dia_diem: item.appointment ? item.appointment.place : '',
      hotline: st.settings.hotline,
      ten_ngan_hang: st.settings.bank_name,
      cif: req ? req.customer.cif : '',
      san_pham: item.product_name,
      so_dien_thoai: req ? req.customer.phone : '',
      ngay_ky: item.appointment ? U.fmtDate(item.appointment.date || item.appointment.at) : '',
      gio_ky: item.appointment ? (item.appointment.time || U.fmtTime(item.appointment.at)) : '',
      noi_ky: item.appointment ? item.appointment.place : '',
      link_ban_do: mapLink(item.appointment ? item.appointment.place : '', st.settings),
      tag_can_bo: officerTag(item, st)
    };
  }

  /**
   * Link chỉ đường Google Maps: dùng link Admin dán sẵn cho nơi ký chung, còn nơi khác
   * thì dựng link dẫn đường tới địa chỉ chữ. Chạm vào link trên điện thoại mở app Maps.
   */
  function mapLink(place, settings) {
    settings = settings || {};
    place = String(place || settings.sign_place || '').trim();
    if (settings.sign_map_url && (!place || place === String(settings.sign_place || '').trim())) return settings.sign_map_url;
    return place ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(place) : '';
  }

  /** Dựng email HTML đúng nhận diện thương hiệu; cùng thuật toán với Notifications.gs emailHtml_. */
  function emailHtml(subject, body, set) {
    set = set || {};
    var brand = /^#[0-9a-fA-F]{6}$/.test(String(set.brand_color || '').trim()) ? String(set.brand_color).trim() : '#006b68';
    var logo = /^https:\/\//.test(String(set.logo_url || '').trim()) ? String(set.logo_url).trim() : '';
    var bank = htmlEsc(set.bank_name || '');
    function linkify(text) {
      return htmlEsc(text).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + brand + '">$1</a>');
    }
    // Phân loại từng dòng: nút bấm (Nhãn: https://…), thẻ thông tin (Nhãn: giá trị liền nhau), đoạn văn.
    // Dòng "Nhãn:" mà giá trị rỗng (biến chưa có dữ liệu) bị bỏ, không để lại nhãn cụt.
    var blocks = [], card = null;
    String(body || '').split(/\r?\n/).forEach(function (line) {
      var raw = line.trim();
      if (!raw) { card = null; return; }
      if (/^[^:]{1,24}:$/.test(raw)) return;
      var btn = /^([^:]{1,40}):\s*(https:\/\/\S+)$/.exec(raw);
      if (btn) { card = null; blocks.push({ k: 'btn', label: btn[1], url: btn[2] }); return; }
      var kv = /^([^:,.]{2,24}):\s+(\S.*)$/.exec(raw);
      if (kv) {
        if (!card) { card = { k: 'card', rows: [] }; blocks.push(card); }
        card.rows.push([kv[1], kv[2]]);
        return;
      }
      card = null;
      blocks.push({ k: 'p', text: raw });
    });
    var parts = blocks.map(function (b) {
      if (b.k === 'btn') {
        var maps = /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(b.url);
        return '<p style="margin:18px 0"><a href="' + htmlEsc(b.url) + '" style="display:inline-block;background:' + brand +
          ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px">' +
          htmlEsc(maps ? 'Chỉ đường bằng Google Maps' : b.label) + '</a></p>';
      }
      if (b.k === 'card') {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f4f9f8;border-left:4px solid ' + brand + '">' +
          '<tr><td style="padding:12px 16px"><table role="presentation" cellpadding="0" cellspacing="0">' +
          b.rows.map(function (r) {
            return '<tr><td style="padding:4px 14px 4px 0;color:#5d7270;font-size:13px;white-space:nowrap;vertical-align:top">' + htmlEsc(r[0]) +
              '</td><td style="padding:4px 0;font-weight:bold;font-size:14px">' + linkify(r[1]) + '</td></tr>';
          }).join('') + '</table></td></tr></table>';
      }
      return '<p style="margin:0 0 10px">' + linkify(b.text) + '</p>';
    }).join('');
    var banner = /^https:\/\//.test(String(set.email_banner_url || '').trim()) ? String(set.email_banner_url).trim() : '';
    return '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f4">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f4"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1d2b2a">' +
      (banner
        ? '<tr><td style="background:' + brand + ';padding:0;line-height:0"><img src="' + htmlEsc(banner) + '" alt="' + bank + '" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>'
        : '<tr><td style="background:' + brand + ';padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">' +
          (logo ? '<img src="' + htmlEsc(logo) + '" alt="" height="36" style="vertical-align:middle;margin-right:10px;border:0">' : '') + bank + '</td></tr>') +
      '<tr><td style="padding:24px 24px 8px;font-size:18px;font-weight:bold;color:' + brand + '">' + htmlEsc(subject) + '</td></tr>' +
      '<tr><td style="padding:8px 24px 20px;font-size:14px;line-height:1.55">' + parts + '</td></tr>' +
      '<tr><td style="padding:14px 24px;background:#f7faf9;border-top:1px solid #e2ecea;font-size:12px;color:#5d7270;line-height:1.5">' +
      'Email tự động, vui lòng không trả lời thư này.' + '</td></tr>' +
      '</table></td></tr></table></body></html>';
  }

  function htmlEsc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Chuỗi gắn thẻ cán bộ trong nhóm Zalo, lấy từ hồ sơ người dùng. */
  function officerTag(item, st) {
    var u = U.byId(st.users, 'user_id', item.assigned_user_id || '');
    if (!u) return '';
    return '@' + (u.zalo_name || u.full_name);
  }

  function recordMetric(row, st, status) {
    st.notificationMetrics = st.notificationMetrics || [];
    var item = U.byId(st.items, 'item_id', row.item_id) || {};
    var req = U.byId(st.requests, 'request_id', item.request_id) || {};
    var ch = U.byId(st.channels, 'code', row.channel) || { config: {} };
    var plan = U.byId(st.monthlyPlans || [], 'period_id', item.period_id) || {};
    var metric = U.byId(st.notificationMetrics, 'outbox_id', row.outbox_id);
    if (!metric) {
      metric = { metric_id: U.uid('MET'), outbox_id: row.outbox_id, idem_key: row.idem_key, period_id: item.period_id || '',
        month_key: plan.month_key || '', item_id: row.item_id || '', event: row.event || '', audience: row.audience || '',
        channel: row.channel || '', provider: ch.config.provider || row.channel || '', template_code: row.template_code || '',
        unit_id: req.unit_id || '', work_type_code: item.work_type_code || '', created_at: row.created_at || U.now() };
      st.notificationMetrics.push(metric);
    }
    metric.status = status;
    metric.provider_msg_id = row.provider_id || '';
    metric.sent_at = status === 'SENT' ? (row.sent_at || U.now()) : (metric.sent_at || '');
    metric.unit_cost = Number(ch.config.unit_cost || 0);
    metric.currency = ch.config.currency || 'VND';
    metric.cost_version = ch.config.cost_version || '';
    metric.retry_count = Number(row.retry || 0);
    metric.updated_at = U.now();
  }

  /**
   * Xếp tin vào hàng đợi sau khi việc đã được ghi.
   * Không kênh nào dùng được thì vẫn tạo bản ghi KHONG_GUI kèm lý do —
   * im lặng bỏ qua là cách nhanh nhất để không ai biết tin đã không tới nơi.
   */
  function queueNotifications(item, event, st, actorId, channelMode) {
    // Quy tắc có điều kiện: hẹn ký báo thẳng khách hay báo qua nhóm nội bộ
    // là hai đường loại trừ nhau, không phát cả hai.
    var viaGroup = !!(item.appointment && item.appointment.via_group);
    var rules = st.notifyRules.filter(function (r) {
      if (r.event !== event || !r.enabled) return false;
      if (channelMode==='IN_APP' && r.audience==='PHONG_PHU_TRACH') return false;
      if (r.when === 'GROUP' && !viaGroup) return false;
      if (r.when === 'DIRECT' && viaGroup) return false;
      return true;
    });
    var made = [];

    rules.forEach(function (rule) {
      recipientsFor(rule.audience, item, st).forEach(function (rcp) {
        if (rcp.id === actorId && rule.audience !== 'KHACH') return; // không tự báo cho chính người vừa thao tác

        // Khóa chống gửi trùng. Quy tắc có giới hạn tần suất thì thêm mốc thời gian
        // vào khóa, để lời nhắc lặp lại đúng nhịp thay vì mỗi lần tải trang.
        var bucket = rule.throttle ? ':' + Math.floor(Date.now() / (rule.throttle * 60000)) : '';
        var occurrence = event === 'QUA_HAN' ? '' : ':v' + String(Number(item.version) || 1);
        var key = [item.item_id, event, rule.audience, rcp.id].join(':') + occurrence + bucket;
        if (U.byId(st.outbox, 'idem_key', key)) return;

        // Kênh khách chọn lúc hẹn ký chỉ áp cho chính tin hẹn ký. Không chặn theo
        // sự kiện thì một việc có lịch hẹn sẽ kéo mọi thông báo khác sang kênh đó,
        // kể cả tin nội bộ lẽ ra phải đi qua chuông trong app.
        var selected = event === 'DANG_HEN_KH' && rule.audience === 'KHACH' && item.appointment && !item.appointment.via_group
          ? item.appointment.channel : '';
        if (selected === 'ZALO') selected = 'ZBS';
        var candidateChannels = channelMode === 'IN_APP'
          ? ['IN_APP']
          : (selected && ['EMAIL', 'ZBS', 'SMS'].indexOf(selected) !== -1 ? [selected] : rule.channels);
        var chosen = null, reason = '', address = '', tpl = null;
        for (var i = 0; i < candidateChannels.length; i++) {
          var code = candidateChannels[i];
          if (!channelUsable(code, st)) { reason = reason || 'Kênh ' + code + ' chưa sẵn sàng'; continue; }

          var addr = addressFor(code, rcp);
          if (!addr) { reason = reason || addressBlocker(code, rcp); continue; }

          var ch = U.byId(st.channels, 'code', code);
          if (ch.test_mode && ch.allowlist.indexOf(addr) === -1) {
            reason = reason || 'Kênh đang ở chế độ thử nghiệm, người nhận chưa có trong danh sách cho phép';
            continue;
          }

          // Tin trong app không qua nhà cung cấp nào nên không có khái niệm duyệt mẫu.
          var candidate = null;
          if (code !== 'IN_APP') {
            candidate = templateFor(rule, code, st);
            if (!candidate) { reason = reason || 'Quy tắc chưa khai báo mẫu cho kênh ' + code; continue; }
            if (candidate.status !== 'DA_DUYET') { reason = reason || 'Mẫu ' + candidate.code + ' chưa được duyệt'; continue; }
          }

          chosen = code;
          address = addr;
          tpl = candidate;
          break;
        }

        var row = {
          outbox_id: U.uid('OUT'),
          idem_key: key,
          item_id: item.item_id,
          event: event,
          audience: rule.audience,
          channel: chosen || candidateChannels[0],
          recipient_kind: rcp.kind,
          recipient: address,
          recipient_name: rcp.name,
          template_code: tpl ? tpl.code : '',
          body: tpl ? renderTemplate(tpl.body, contextFor(item, st)) : defaultBody(chosen, rule, contextFor(item, st)),
          status: chosen ? (rule.confirm ? 'CHO_XAC_NHAN' : 'CHO_GUI') : 'KHONG_GUI',
          note: chosen ? '' : (reason || 'Không có kênh nào dùng được'),
          retry: 0,
          provider_id: '',
          created_at: U.now(),
          sent_at: ''
        };
        st.outbox.unshift(row);
        made.push(row);
        recordMetric(row, st, chosen ? 'QUEUED' : 'KHONG_GUI');

        if (chosen === 'IN_APP' && rcp.kind === 'NOI_BO') {
          st.inbox.unshift({
            id: U.uid('NTF'), user_id: rcp.id, item_id: item.item_id,
            event: event, at: U.now(), read: false
          });
          row.status = 'DA_GUI';
          row.sent_at = U.now();
          recordMetric(row, st, 'SENT');
        }
      });
    });

    return made;
  }

  /**
   * Worker bản trình duyệt chỉ kiểm tra luồng; GAS mới gọi provider thật.
   */
  function dispatch(row, st) {
    if (row.status !== 'CHO_GUI') return row;
    var ch = U.byId(st.channels, 'code', row.channel);
    if (!channelUsable(row.channel, st)) {
      row.status = 'THAT_BAI';
      row.note = 'Kênh không còn sẵn sàng lúc gửi';
      row.retry += 1;
      recordMetric(row, st, 'FAILED');
      return row;
    }
    if (row.channel === 'EMAIL') {
      var usedSoFar = emailUsedToday(ch.config);
      ch.config.quota_date = U.localDate();
      ch.config.used_today = usedSoFar + 1;
      if (ch.config.used_today > Number(ch.config.daily_quota)) {
        row.status = 'THAT_BAI';
        row.note = 'Hết hạn mức thư trong ngày';
        row.retry += 1;
        recordMetric(row, st, 'FAILED');
        return row;
      }
    }
    row.status = 'DA_GUI';
    row.sent_at = U.now();
    row.provider_id = 'SIM-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    row.note = 'Bản thử nghiệm: chưa gửi ra ngoài.';
    recordMetric(row, st, 'SENT');
    return row;
  }

  function outboxHealth(st) {
    var backlog = st.outbox.filter(function (o) { return o.status === 'CHO_GUI' || o.status === 'DANG_GUI'; }).length;
    var failed = st.outbox.filter(function (o) { return o.status === 'THAT_BAI'; }).length;
    var skipped = st.outbox.filter(function (o) { return o.status === 'KHONG_GUI'; }).length;
    var waiting = st.outbox.filter(function (o) { return o.status === 'CHO_XAC_NHAN'; }).length;
    var unknown = st.outbox.filter(function (o) { return o.status === 'CAN_DOI_SOAT'; }).length;
    return { backlog: backlog, failed: failed, skipped: skipped, waiting: waiting, unknown: unknown };
  }

  /* ============================ Hạn xử lý ============================ */

  /**
   * Chờ bên ngoài (tạm dừng, đang hẹn khách): hạn đứng yên, không tính quá hạn;
   * quay lại xử lý thì hạn lùi đúng số giờ làm đã chờ. Khớp SLA_PAUSED_STATUS trong Code.gs.
   */
  var SLA_PAUSED = ['TAM_DUNG', 'DANG_HEN_KH', 'CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'];

  var slaExemptCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function slaExemptByItem(items, workTypes) {
    items = items || [];
    var typeByCode = {};
    (workTypes || []).forEach(function (wt) { typeByCode[wt.code || wt.type_code] = wt; });
    var parent = {};
    function find(id) {
      id = String(id || '');
      if (!id) return '';
      if (!parent[id]) parent[id] = id;
      if (parent[id] !== id) parent[id] = find(parent[id]);
      return parent[id];
    }
    function join(a, b) {
      if (!a || !b) return;
      var ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }
    items.forEach(function (item) {
      if (!item || !item.item_id) return;
      find(item.item_id);
      join(item.item_id, item.parent_item_id);
      join(item.item_id, item.carryover_from_item_id);
      if (item.origin_item_id && item.origin_item_id !== item.item_id) join(item.item_id, item.origin_item_id);
    });
    var exemptRoots = {};
    items.forEach(function (item) {
      if (!item || !item.item_id) return;
      var wt = typeByCode[item.work_type_code];
      var collateral = collateralStepKeys(item, wt);
      var drafts = draftContractKeys(item, wt);
      if (collateral.indexOf('HD_THE_CHAP') !== -1 || drafts.indexOf('HD_THE_CHAP') !== -1) {
        exemptRoots[find(item.item_id)] = true;
      }
    });
    var out = {};
    items.forEach(function (item) {
      if (item && item.item_id && exemptRoots[find(item.item_id)]) out[item.item_id] = true;
    });
    return out;
  }

  function slaExemptForState(item, st) {
    if (!item) return false;
    if (item.sla_no_fault === true) return true;
    if (!st) return false;
    var items = st.items || [], types = st.workTypes || [], map;
    if (slaExemptCache) {
      var cached = slaExemptCache.get(st);
      if (cached && cached.items === items && cached.types === types && cached.length === items.length) map = cached.map;
      else {
        map = slaExemptByItem(items, types);
        slaExemptCache.set(st, { items: items, types: types, length: items.length, map: map });
      }
    } else map = slaExemptByItem(items, types);
    if (map[item.item_id]) return true;
    var wt = U.byId(types, 'code', item.work_type_code);
    return collateralStepKeys(item, wt).indexOf('HD_THE_CHAP') !== -1 || draftContractKeys(item, wt).indexOf('HD_THE_CHAP') !== -1;
  }

  function sla(item, st) {
    if (!item.due_at || !STATUS[item.status] || !STATUS[item.status].open) return null;
    var left = new Date(item.due_at).getTime() - Date.now();
    var noFault = slaExemptForState(item, st);
    if (noFault) return { due: item.due_at, left: left, late: false, soon: false, noFault: true };
    if (SLA_PAUSED.indexOf(item.status) !== -1) return { due: item.due_at, left: left, late: false, soon: false, paused: true };
    return { due: item.due_at, left: left, late: left < 0, soon: left >= 0 && left < 2 * 3600000 };
  }

  /** Việc đang mở, không chờ bên ngoài, đã qua hạn tại thời điểm nowMs. */
  function lateOpen(item, nowMs, st) {
    return !!(item.due_at && STATUS[item.status] && STATUS[item.status].open && SLA_PAUSED.indexOf(item.status) === -1 &&
      !slaExemptForState(item, st) && nowMs > new Date(item.due_at).getTime());
  }

  /**
   * Bản trình duyệt của phần lùi hạn trong transitionItem (Code.gs): vào trạng thái
   * chờ thì ghi mốc, ra khỏi thì cộng số giờ làm đã chờ vào hạn.
   */
  function applySlaPause(item, to, ts, st) {
    var wasPaused = SLA_PAUSED.indexOf(item.status) !== -1, nowPaused = SLA_PAUSED.indexOf(to) !== -1;
    if (!wasPaused && nowPaused && item.due_at) item.sla_paused_at = ts;
    if (wasPaused && !nowPaused) {
      if (to !== 'DA_PHAN_CONG' && item.due_at && item.sla_paused_at) {
        var waited = U.workingMilliseconds(item.sla_paused_at, ts, st.calendar) || 0;
        if (waited > 0) item.due_at = U.addWorkingHours(item.due_at, waited / 3600000, st.calendar);
      }
      item.sla_paused_at = '';
    }
  }

  /** Số giờ làm thực tế kể từ lúc cán bộ bấm bắt đầu xử lý hồ sơ. */
  function processingCalendar(st) {
    var base = (st && st.calendar) || {};
    // Đồng hồ khách hàng dùng giờ vận hành LS đã thống nhất, không phụ thuộc
    // SLA cũ của workbook: 07:30–11:30 và 13:30–18:00 các ngày làm việc.
    return LSTiming.calendar(base);
  }

  /** Phải khớp CLOCK_RUNNING_ trong Code.gs. */
  var CLOCK_RUNNING = ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];

  function clockPaused(item) {
    var log = (item && item.pause_log) || [];
    return ['QUEUED','WAITING'].indexOf(LSTiming.workState(item)) !== -1 || !!(log.length && !log[log.length - 1][1]) || !!(item && item.status && CLOCK_RUNNING.indexOf(item.status) === -1);
  }

  /** Ghi khoảng dừng khi chuyển trạng thái — cùng luật với nextPauseLog_ phía máy chủ. */
  function applyClock(item, to, ts) {
    if (!item.processing_started_at) return;
    var log = (item.pause_log || []).map(function (x) { return x.slice(); });
    var open = log.length && !log[log.length - 1][1];
    var running = CLOCK_RUNNING.indexOf(to) !== -1;
    if (running && open) log[log.length - 1][1] = ts;
    else if (!running && !open) log.push([ts, '']);
    else return;
    item.pause_log = log;
  }

  /**
   * Các khoảng đồng hồ thật sự chạy, dạng [[msTừ, msĐến], ...]: từ lúc bấm bắt
   * đầu xử lý tới lúc hoàn thành (hoặc bây giờ), trừ các khoảng dừng.
   */
  function activeSpans(item, now) {
    if (item && (item.processing_sessions_json || Array.isArray(item.processing_sessions))) {
      return LSTiming.sessions(item,now ? new Date(now).toISOString() : U.now()).map(function(s) { return [s.start,s.end]; });
    }
    if (item && item.carried_to_item_id) return [];
    if (!item || !item.processing_started_at) return [];
    var nowMs = now instanceof Date ? now.getTime() : (now ? new Date(now).getTime() : Date.now());
    var start = new Date(item.processing_started_at).getTime();
    var end = item.completed_at ? new Date(item.completed_at).getTime() : nowMs;
    if (!(end > start)) return [];
    var spans = [[start, end]];
    ((item && item.pause_log) || []).forEach(function (p) {
      var a = new Date(p[0]).getTime(), b = p[1] ? new Date(p[1]).getTime() : end;
      if (!isFinite(a) || !(b > a)) return;
      spans = spans.reduce(function (out, s) {
        if (b <= s[0] || a >= s[1]) { out.push(s); return out; }
        if (a > s[0]) out.push([s[0], a]);
        if (b < s[1]) out.push([b, s[1]]);
        return out;
      }, []);
    });
    return spans;
  }

  function processingHours(item, st, now) {
    if (!item) return null;
    return LSTiming.metrics(item,processingCalendar(st),now ? new Date(now).toISOString() : U.now()).xu_ly;
  }

  /** Mọi thời lượng hiện một dạng duy nhất: số phút nguyên ("135 phút"), "—" khi chưa đo được. */
  /** Giờ làm hiển thị: dưới 1 giờ ghi phút, từ 1 giờ ghi "X giờ Y phút" cho dễ đọc trên bảng và điện thoại. */
  function durationLabel(hours) {
    if (hours === null || hours === undefined || !isFinite(hours)) return '—';
    var minutes = Math.round(Math.max(0, hours) * 60);
    if (hours > 0 && minutes === 0) return '<1 phút';
    // Khoảng trắng không ngắt giữa số và đơn vị: thẻ hẹp trên điện thoại chỉ xuống dòng giữa "giờ" và "phút".
    if (minutes < 60) return minutes + ' phút';
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return String(h).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' giờ' + (m ? ' ' + m + ' phút' : '');
  }

  function receiptDurationLabel(item, st, now) {
    if (!item || !item.dossier_received_at) return '—';
    return durationLabel(LSTiming.metrics(item,processingCalendar(st),now ? new Date(now).toISOString() : U.now()).nhan_den_xong);
  }

  /** Trung bình từ tổng và số mẫu. */
  function averageDurationLabel(total, count) {
    return count > 0 && isFinite(total) ? durationLabel(total / count) : '—';
  }

  function processingLabel(item, st, now) {
    return durationLabel(LSTiming.metrics(item,processingCalendar(st),now ? new Date(now).toISOString() : U.now()).xu_ly);
  }

  /* ============================ Báo cáo nhiều kỳ ============================ */

  var REPORT_PRESETS = [
    ['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay'],
    ['last12', '12 tháng gần nhất'], ['custom', 'Khoảng tùy chọn']
  ];

  function monthKey(d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1); }

  function presetRange(preset) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    if (preset === 'quarter') {
      var q = Math.floor(m / 3) * 3;
      return { from: y + '-' + U.pad(q + 1), to: y + '-' + U.pad(q + 3) };
    }
    if (preset === 'year') return { from: y + '-01', to: y + '-12' };
    if (preset === 'last12') return { from: monthKey(new Date(y, m - 11, 1)), to: monthKey(now) };
    return { from: monthKey(now), to: monthKey(now) };
  }

  function monthsInRange(from, to) {
    var out = [];
    var a = from.split('-').map(Number), b = to.split('-').map(Number);
    var cur = new Date(a[0], a[1] - 1, 1), end = new Date(b[0], b[1] - 1, 1);
    while (cur <= end && out.length < 240) { out.push(monthKey(cur)); cur.setMonth(cur.getMonth() + 1); }
    return out;
  }

  function dateOnly(value) {
    if (!value) return '';
    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (isNaN(value.getTime())) return '';
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
    }
    var text = String(value);
    var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function userOff(user, onDate) {
    if (!user) return false;
    var status = String(user.availability_status || 'AVAILABLE').toUpperCase();
    var day = dateOnly(onDate || new Date());
    var from = dateOnly(user.off_from), to = dateOnly(user.off_to);
    if (status !== 'OFF' && !from && !to) return false;
    return !!day && (!from || day >= from) && (!to || day <= to);
  }

  function userAvailable(user, onDate) {
    return !!(user && user.role === 'CAN_BO_LS' && user.active && !userOff(user, onDate));
  }

  /**
   * Bảng kết quả ngày của phòng LS: mỗi dòng là một hoạt động, mỗi cột một cán bộ.
   * Một việc có thể rơi vào nhiều dòng (hồ sơ vay vừa là "Soạn HĐ tín dụng" vừa là
   * "Giao dịch trên Rlos"), đúng như mẫu bảng tay phòng đang dùng.
   * "Soạn thảo HĐ thế chấp" là việc làm TSĐB mới hoặc làm phụ lục TSĐB. Cầm cố và giải ngân
   * không có dòng riêng: hồ sơ cầm cố tính như hồ sơ vay (HĐ tín dụng, Rlos).
   */
  var DAILY_ROWS = [
    { key: 'HD_THE_CHAP', label: 'Soạn thảo HĐ thế chấp', unit: 'hợp đồng' },
    { key: 'HD_TIN_DUNG', label: 'Soạn thảo HĐ tín dụng', unit: 'hợp đồng' },
    { key: 'NHAP_KHO', label: 'Nhập kho TSĐB', unit: 'tài sản' },
    { key: 'XUAT_KHO', label: 'Xuất kho TSĐB', unit: 'tài sản' },
    { key: 'RLOS', label: 'Giao dịch trên Rlos', unit: 'khoản vay' },
    { key: 'TON', label: 'Tồn soạn hiện nay:', unit: '', header: true },
    { key: 'TON_THE_CHAP', label: 'Còn soạn HĐ thế chấp', unit: 'hồ sơ', sub: true },
    { key: 'TON_TIN_DUNG', label: 'Còn soạn HĐ tín dụng', unit: 'hồ sơ', sub: true },
    { key: 'KHAC', label: 'Khác', unit: 'khác' }
  ];

  /**
   * Việc khác cán bộ LS tự ghi kèm số lượng (không gắn hồ sơ nào). Tổng của chúng cộng vào dòng "Khác"
   * của bảng ngày theo từng người; từng loại chỉ hiện khi bung dòng Khác. Khớp OTHER_WORK_CATEGORIES_ ở Code.gs.
   */
  var OTHER_WORK_TYPES = [
    { code: 'HOP_DAU_NGAY', label: 'Họp đầu ngày', unit: 'lần' },
    { code: 'XEM_VAN_BAN', label: 'Xem văn bản', unit: 'văn bản' },
    { code: 'SAP_XEP_KHO', label: 'Sắp xếp kho hồ sơ', unit: 'hồ sơ' },
    { code: 'SCAN_HOAN_THIEN', label: 'Scan hoàn thiện hồ sơ', unit: 'hồ sơ' },
    { code: 'DINH_GIA_LAI', label: 'Định giá lại TSBĐ', unit: 'tài sản' },
    { code: 'XUAT_KHO_THU_NO', label: 'Xuất kho, thu nợ cầm cố', unit: 'khoản' }
  ];
  var OTHER_WORK_MAX_QUANTITY = 999;
  var OTHER_WORK_MEETING_MINUTES = 15;

  /** Chia `amount` thành các phần nguyên theo tỉ lệ `weights`, tổng đúng bằng `amount`. Khớp apportion_ ở Code.gs. */
  function apportion(amount, weights) {
    var total = weights.reduce(function (n, w) { return n + w; }, 0);
    if (!(total > 0) || !(amount > 0)) return weights.map(function () { return 0; });
    var shares = weights.map(function (w, i) { var exact = amount * w / total; return { i: i, base: Math.floor(exact), frac: exact - Math.floor(exact) }; });
    var left = amount - shares.reduce(function (n, x) { return n + x.base; }, 0);
    shares.slice().sort(function (a, b) { return b.frac - a.frac || a.i - b.i; }).slice(0, left).forEach(function (x) { x.base += 1; });
    return shares.map(function (x) { return x.base; });
  }

  /**
   * Chia số phút làm việc của một lượt Tạm dừng toàn bộ cho các việc khác đã ghi trong lượt đó: Họp đầu ngày
   * cố định 15 phút mỗi lần (không quá thời gian đã dừng), phần còn lại chia đều theo từng loại việc, trong một
   * loại chia theo số lượng. Trả về mảng phút cùng thứ tự `rows` ({ category, quantity }). Khớp splitPauseMinutes_ ở Code.gs.
   */
  function splitPauseMinutes(totalMinutes, rows) {
    var total = Math.max(0, Math.floor(Number(totalMinutes) || 0)), out = rows.map(function () { return 0; });
    var meeting = [], byType = {}, order = OTHER_WORK_TYPES.map(function (t) { return t.code; }).filter(function (c) { return c !== 'HOP_DAU_NGAY'; });
    rows.forEach(function (r, i) {
      if (r.category === 'HOP_DAU_NGAY') meeting.push(i);
      else (byType[r.category] = byType[r.category] || []).push(i);
    });
    var meetingMinutes = Math.min(total, OTHER_WORK_MEETING_MINUTES * meeting.reduce(function (n, i) { return n + rows[i].quantity; }, 0));
    apportion(meetingMinutes, meeting.map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[meeting[k]] = m; });
    var types = order.filter(function (c) { return byType[c]; });
    var each = apportion(total - meetingMinutes, types.map(function () { return 1; }));
    types.forEach(function (c, n) {
      apportion(each[n], byType[c].map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[byType[c][k]] = m; });
    });
    return out;
  }

  /** Việc khác trong khoảng ngày (YYYY-MM-DD), gộp theo loại: số lượng và số phút. userId rỗng là mọi người. */
  function otherWorkSummary(rows, from, to, userId) {
    var byCategory = {};
    (rows || []).forEach(function (r) {
      var day = String(r.work_date || '').substring(0, 10);
      if (!r || r.canceled_at || (userId && r.user_id !== userId) || day < from || day > to) return;
      var type = OTHER_WORK_TYPES.filter(function (t) { return t.code === r.category; })[0];
      if (!type) return;
      var g = byCategory[r.category] || (byCategory[r.category] = { category: r.category, label: type.label, unit: type.unit, quantity: 0, minutes: 0 });
      g.quantity += Math.max(1, Number(r.quantity) || 1);
      g.minutes += Math.max(0, Number(r.minutes) || 0);
    });
    return OTHER_WORK_TYPES.filter(function (t) { return byCategory[t.code]; }).map(function (t) { return byCategory[t.code]; });
  }

  function dailyIsCredit_(wt, item) {
    var credit = /^(món|hm sxkd|thấu chi|thẻ tín dụng)/;
    return credit.test(String((wt && wt.group) || '').toLowerCase()) ||
      credit.test(String((wt && wt.name) || '').toLowerCase());
  }

  /** Cầm cố (sổ tiết kiệm, tiền gửi) là hợp đồng riêng, không gộp vào thế chấp. */
  function dailyIsPledge_(wt, item) {
    return /cầm cố/.test(String((wt && wt.name) || (item && item.product_name) || '').toLowerCase());
  }

  /** Loại việc cầm cố (sổ tiết kiệm, tiền gửi): mặc định cầm cố của phòng đi về cán bộ trong quy tắc phân công nhanh. */
  function isPledgeWorkType(wt) { return dailyIsPledge_(wt, null); }

  /**
   * Các loại việc một quy tắc phân công nhanh áp dụng: danh sách `work_type_codes`, hoặc mã đơn của
   * quy tắc cũ. Rỗng nghĩa là mọi sản phẩm. Khớp ruleWorkTypeCodes ở Code.gs.
   */
  function ruleWorkTypeCodes(rule) {
    var list = rule && Array.isArray(rule.work_type_codes) ? rule.work_type_codes : [];
    list = list.map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x && x !== 'ALL'; });
    if (!list.length && rule && rule.work_type_code && rule.work_type_code !== 'ALL') list = [String(rule.work_type_code)];
    return list;
  }

  /** Quy tắc khớp một việc? Phòng, loại việc và sản phẩm đều là điều kiện thu hẹp; để trống là không thu hẹp. */
  function ruleMatches(rule, unitId, item) {
    var codes = ruleWorkTypeCodes(rule);
    return (!rule.unit_id || rule.unit_id === unitId) && (!codes.length || codes.indexOf(item.work_type_code) !== -1) &&
      (!rule.product_name || String(rule.product_name).trim().toLowerCase() === String(item.product_name || '').trim().toLowerCase());
  }

  /** Quy tắc càng cụ thể càng được chọn trước: phòng, rồi loại việc, rồi sản phẩm; bằng nhau thì theo thứ tự ưu tiên. */
  function ruleScore(rule) {
    return (rule.unit_id ? 4 : 0) + (ruleWorkTypeCodes(rule).length ? 2 : 0) + (rule.product_name ? 1 : 0);
  }

  /** Hồ sơ vay cũ chưa tách việc TSĐB: phần thế chấp còn ghi nhận tại việc tín dụng. */
  function dailyIsMortgage_(wt, item) {
    if (dailyIsPledge_(wt, item)) return false;
    // MOI có việc TSĐB riêng; CO_SAN/NONE không phát sinh hợp đồng thế chấp mới.
    if (item && item.collateral_mode) return false;
    var name = String((wt && wt.name) || '').toLowerCase();
    return /tsđb|tsbđ|nhà ở|ôtô|ô tô/.test(name) && !/tín chấp/.test(name);
  }

  /** Việc thuộc nhóm TSĐB (nhập, xuất, đổi, mượn TSĐB...). */
  function dailyIsCollateral_(wt, item) {
    var text = String((wt && wt.group) || '').toLowerCase() + ' ' + String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    return /tsđb|tsbđ/.test(text);
  }

  /**
   * Việc TSĐB có soạn hợp đồng thế chấp: làm TSĐB mới (nhập mới, nhập thêm, đăng ký thế chấp) hoặc làm phụ lục TSĐB
   * (nhập tăng, xuất giảm, ký lại phụ lục, thay đổi TSĐB). Xuất TSĐB / xóa thế chấp, mượn TSĐB và thủ tục khác
   * không soạn HĐ thế chấp nên tính vào dòng Khác. Việc kèm TSĐB mới (collateral_mode MOI) luôn là TSĐB mới.
   */
  function dailyIsMortgageDoc_(wt, item) {
    if (!dailyIsCollateral_(wt, item)) return false;
    if (item && item.collateral_mode === 'MOI') return true;
    var name = String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    return /nhập mới|nhập thêm|đktc|nhập tăng|xuất giảm|plhd|phụ lục|thay đổi/.test(name);
  }

  /**
   * Các ô tick cán bộ phải tick trước khi hoàn thành việc TSĐB, theo thứ tự làm:
   *  - có soạn HĐ thế chấp: soạn xong HĐ thế chấp, rồi nhập kho (xuất giảm thì xuất kho);
   *  - xuất TSĐB / xóa thế chấp: chỉ xuất kho;
   *  - mượn TSĐB, thủ tục khác: không có ô nào.
   * Khớp collateralStepKeys_ ở Code.gs.
   */
  function collateralStepKeys(item, wt) {
    if (dailyIsCredit_(wt, item) || !dailyIsCollateral_(wt, item)) return [];
    var name = String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    if (dailyIsMortgageDoc_(wt, item)) return /xuất/.test(name) ? ['HD_THE_CHAP', 'XUAT_KHO'] : ['HD_THE_CHAP', 'NHAP_KHO'];
    return /xuất|xóa thế chấp/.test(name) ? ['XUAT_KHO'] : [];
  }

  /**
   * Những kết quả cán bộ LS xác nhận (tick) khi hoàn thành hồ sơ. Số tick đi thẳng vào bảng ngày:
   *  - HĐ thế chấp: hồ sơ vay có tài sản bảo đảm, hoặc việc TSĐB làm TSĐB mới / phụ lục TSĐB;
   *  - Rlos: giao dịch trên Rlos của hồ sơ vay.
   */
  var RESULT_FLAGS = [
    { key: 'HD_THE_CHAP', label: 'Đã soạn HĐ thế chấp (làm TSĐB mới / phụ lục TSĐB)', short: 'HĐ thế chấp' },
    { key: 'RLOS', label: 'Đã làm giao dịch trên Rlos', short: 'Rlos' }
  ];

  /** Hồ sơ vay (món, HM SXKD, thấu chi, thẻ tín dụng). */
  function dailyIsCredit(item, wt) { return dailyIsCredit_(wt, item); }

  /**
   * Hợp đồng được xem là đã soạn khi LS đặt lịch ký: hồ sơ vay ghi HĐ tín dụng,
   * còn việc TSĐB có bước soạn HĐ thế chấp ghi HĐ thế chấp; bước kho vẫn độc lập.
   */
  function draftContractKeys(item, wt) {
    if (dailyIsCredit_(wt, item)) {
      var keys = ['HD_TIN_DUNG'];
      if (dailyIsMortgage_(wt, item)) keys.push('HD_THE_CHAP');
      return keys;
    }
    if (collateralStepKeys(item, wt).indexOf('HD_THE_CHAP') !== -1) return ['HD_THE_CHAP'];
    return [];
  }

  /** Số lượng kế hoạch QLKH khai báo khi đăng ký việc, không thay thế số thực tế LS ghi nhận khi xử lý. */
  function requestCollateralQuantityKeys(item, wt) {
    var steps = collateralStepKeys(item, wt);
    var drafts = draftContractKeys(item, wt);
    var noNewMortgageCredit = dailyIsCredit_(wt, item) &&
      ['CO_SAN', 'NONE'].indexOf(String(item && item.collateral_mode || '').toUpperCase()) !== -1;
    var newCollateralCredit = dailyIsCredit_(wt, item) && item && item.collateral_mode === 'MOI';
    var keys = [];
    if (!noNewMortgageCredit && (newCollateralCredit || drafts.indexOf('HD_THE_CHAP') !== -1 || steps.indexOf('HD_THE_CHAP') !== -1)) keys.push('HD_THE_CHAP');
    if (steps.indexOf('XUAT_KHO') !== -1) keys.push('XUAT_KHO');
    return keys;
  }

  /**
   * Bàn giao giữa chừng: cán bộ cũ đã làm xong phần nào thì phần đó tính cho cán bộ cũ, ngày bàn giao;
   * người nhận chỉ được tính phần còn lại khi hoàn thành. Lưu ở result_credit_json:
   * { "HD_THE_CHAP": { "user_id": "...", "at": "...", "by": "..." } }. Khớp HANDOVER_PART_KEYS_ ở Code.gs.
   */
  var HANDOVER_PARTS = [
    { key: 'HD_TIN_DUNG', label: 'Soạn HĐ tín dụng', short: 'HĐ tín dụng' },
    { key: 'HD_THE_CHAP', label: 'Soạn HĐ thế chấp (TSĐB mới / phụ lục TSĐB)', short: 'HĐ thế chấp' },
    { key: 'RLOS', label: 'Giao dịch trên Rlos', short: 'Rlos' },
    { key: 'NHAP_KHO', label: 'Nhập kho TSĐB', short: 'Nhập kho' },
    { key: 'XUAT_KHO', label: 'Xuất kho TSĐB', short: 'Xuất kho' }
  ];

  /** Nhãn ô tick của việc TSĐB; việc kho ghi vào cùng result_credit_json với phần bàn giao. */
  var COLLATERAL_STEP_LABELS = {
    HD_THE_CHAP: 'Đã soạn xong HĐ thế chấp', NHAP_KHO: 'Đã nhập kho TSĐB', XUAT_KHO: 'Đã xuất kho TSĐB'
  };
  var STEP_QUANTITY_LABELS = {
    HD_TIN_DUNG: 'Số lượng HĐ tín dụng', HD_THE_CHAP: 'Số lượng HĐ thế chấp',
    NHAP_KHO: 'Số lượng tài sản nhập', XUAT_KHO: 'Số lượng tài sản xuất'
  };

  function stepQuantityLabel(key) { return STEP_QUANTITY_LABELS[key] || ''; }

  function resultCredit(item) {
    var c = item && item.result_credit;
    if (c === undefined && item) c = item.result_credit_json;
    if (typeof c === 'string') { try { c = JSON.parse(c || '{}'); } catch (err) { c = null; } }
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  }

  function scheduledMortgageCredit_(item, wt) {
    var c = resultCredit(item).HD_THE_CHAP;
    return dailyIsCredit_(wt, item) && c && c.user_id &&
      (c.source === 'APPOINTMENT' || c.source === 'APPOINTMENT_HISTORY' || c.by === c.user_id);
  }

  /** Các phần đã ghi nhận, sau khi áp dụng điều chỉnh tick kết quả. */
  function creditedParts(item, wt) {
    var c = resultCredit(item);
    wt = wt || U.byId(U.db().workTypes, 'code', item.work_type_code);
    var flags = savedResultFlags(item) || {};
    return HANDOVER_PARTS.filter(function (p) {
      if (!c[p.key] || !c[p.key].user_id) return false;
      if (p.key === 'HD_THE_CHAP' && c[p.key].user_id === item.assigned_user_id &&
          ['COMPLETION', 'RESULT_CORRECTION'].indexOf(c[p.key].source) !== -1 && flags.HD_THE_CHAP === false) return false;
      if (p.key !== 'HD_THE_CHAP' || !dailyIsCredit_(wt, item)) return true;
      if (item.collateral_mode === 'MOI') return false;
      if (!scheduledMortgageCredit_(item, wt)) return true;
      if (flags.HD_THE_CHAP === false) return false;
      return ['CO_SAN', 'NONE'].indexOf(item.collateral_mode) === -1 || flags.HD_THE_CHAP === true;
    }).map(function (p) {
      return { key: p.key, short: p.short, user_id: c[p.key].user_id, at: c[p.key].at || '', by: c[p.key].by || '', quantity: Math.max(1, Math.floor(Number(c[p.key].quantity) || 1)) };
    });
  }

  function isCredited_(item, key) { var c = resultCredit(item); return !!(c[key] && c[key].user_id); }

  /**
   * Ô tick còn hiệu lực của việc TSĐB. Việc đã hoàn thành trước khi có các ô này (chưa đủ ô được ghi nhận)
   * giữ cách tính cũ: HĐ thế chấp theo tick lúc hoàn thành, còn lại tính vào Khác.
   */
  function stepKeys(item, wt) {
    var keys = collateralStepKeys(item, wt);
    if (item && item.status === 'HOAN_THANH_LS' && !keys.every(function (k) { return isCredited_(item, k); })) return [];
    return keys;
  }

  /** Các ô tick của việc TSĐB: [{ key, label, user_id, at, done }] theo thứ tự làm. */
  function steps(item, wt) {
    var credit = resultCredit(item);
    return stepKeys(item, wt).map(function (k) {
      var c = credit[k] || {};
      return { key: k, label: COLLATERAL_STEP_LABELS[k], user_id: c.user_id || '', at: c.at || '', by: c.by || '', done: !!c.user_id,
        quantity: Math.max(1, Math.floor(Number(c.user_id ? c.quantity : (k === 'HD_THE_CHAP' ? item.requested_mortgage_contract_count : k === 'XUAT_KHO' ? item.requested_export_folder_count : 1)) || 1)) };
    });
  }

  /** Phần có thể ghi nhận cho cán bộ cũ khi đổi người: hồ sơ vay có 3 phần, việc TSĐB là các ô tick của việc đó. */
  function handoverPartsFor(item, wt) {
    var collateral = collateralStepKeys(item, wt);
    var keys = dailyIsCredit_(wt, item) ? (item.collateral_mode === 'MOI' ? ['HD_TIN_DUNG', 'RLOS'] : ['HD_TIN_DUNG', 'HD_THE_CHAP', 'RLOS'])
      : dailyIsCollateral_(wt, item) ? (collateral.length ? collateral : ['HD_THE_CHAP']) : [];
    return HANDOVER_PARTS.filter(function (p) { return keys.indexOf(p.key) !== -1 && !isCredited_(item, p.key); });
  }

  /**
   * Các tick áp dụng cho hồ sơ: vay có cả hai, loại việc khác không có. Việc TSĐB có ô tick riêng (steps)
   * thì không tick lúc hoàn thành; mượn TSĐB và thủ tục khác vẫn có ô HĐ thế chấp như cũ.
   */
  function resultFlagsFor(item, wt) {
    var list = dailyIsCredit_(wt, item) ? RESULT_FLAGS.slice()
      : dailyIsCollateral_(wt, item) && !stepKeys(item, wt).length ? RESULT_FLAGS.filter(function (x) { return x.key === 'HD_THE_CHAP'; }) : [];
    // Phần cán bộ trước đã làm và đã được tính cho họ thì người hoàn thành không tick lại.
    return list.filter(function (x) {
      var ownCredit = resultCredit(item)[x.key];
      if (x.key === 'HD_THE_CHAP' && ownCredit && ownCredit.user_id === item.assigned_user_id &&
          ['COMPLETION', 'RESULT_CORRECTION'].indexOf(ownCredit.source) !== -1) return true;
      if (x.key === 'HD_THE_CHAP' && dailyIsCredit_(wt, item)) {
        if (item.collateral_mode === 'MOI') return false;
        if (scheduledMortgageCredit_(item, wt) && resultCredit(item).HD_THE_CHAP.user_id === item.assigned_user_id) return true;
      }
      return !isCredited_(item, x.key);
    });
  }

  /** Cách phân loại theo tên loại việc — giá trị tick sẵn, và cho hồ sơ hoàn thành trước khi có tick. */
  function dailyGuessFlags(item, wt) {
    if (dailyIsCredit_(wt, item)) return { HD_THE_CHAP: dailyIsMortgage_(wt, item), RLOS: true };
    return { HD_THE_CHAP: dailyIsMortgageDoc_(wt, item) };
  }

  /** Tick đã lưu của hồ sơ, hoặc null nếu hồ sơ chưa được ghi nhận (hoàn thành trước khi có tick). */
  function savedResultFlags(item) {
    var flags = item && item.result_flags;
    if (flags === undefined && item) flags = item.result_flags_json;
    if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch (err) { flags = null; } }
    return flags && typeof flags === 'object' && !Array.isArray(flags) ? flags : null;
  }

  /** Giá trị cuối của từng tick: tick đã lưu thắng, tick chưa ghi nhận lấy theo cách phân loại. */
  function resolvedResultFlags(item, wt) {
    var out = dailyGuessFlags(item, wt), saved = savedResultFlags(item) || {};
    if (scheduledMortgageCredit_(item, wt) && !item.collateral_mode) out.HD_THE_CHAP = true;
    Object.keys(out).forEach(function (key) { if (typeof saved[key] === 'boolean') out[key] = saved[key]; });
    return out;
  }

  /**
   * Các dòng hoạt động tính cho người hoàn thành việc. Phần đã ghi nhận cho cán bộ trước lúc
   * bàn giao không nằm ở đây (đếm riêng theo creditedParts), nên không bị đếm hai lần.
   */
  function dailyActivityKeys(item, wt) {
    var flags = resolvedResultFlags(item, wt), keys = [];
    if (dailyIsCredit_(wt, item)) {
      keys.push('HD_TIN_DUNG');
      if (flags.RLOS === true) keys.push('RLOS');
      if (flags.HD_THE_CHAP === true && item.collateral_mode !== 'MOI') keys.push('HD_THE_CHAP');
    } else if (dailyIsCollateral_(wt, item)) {
      // Việc TSĐB có ô tick riêng: HĐ thế chấp, nhập kho, xuất kho đã tính cho người tick theo ngày tick.
      if (stepKeys(item, wt).length) return [];
      // Việc TSĐB mà HĐ thế chấp đã tính cho cán bộ trước: người hoàn thành không được tính gì thêm.
      if (creditedParts(item, wt).some(function (part) { return part.key === 'HD_THE_CHAP'; })) return [];
      keys.push(flags.HD_THE_CHAP === true ? 'HD_THE_CHAP' : 'KHAC');
    } else {
      keys.push('KHAC');
    }
    return keys.filter(function (k) { return !isCredited_(item, k); });
  }

  /**
   * LS đã cầm hồ sơ: có mốc nhận, hoặc trạng thái đã qua bước tiếp nhận nhưng thiếu mốc (Kiểm soát/Quản lý chuyển hộ,
   * hồ sơ chuyển kỳ, dữ liệu cũ — cùng cách hiểu "thiếu mốc bàn giao" của màn kiểm tra thời gian).
   * Tạm dừng từ trước khi nhận (chưa từng xử lý) vẫn là chưa nhận.
   */
  function dossierReceived(item) {
    if (!item) return false;
    if (item.dossier_received_at) return true;
    if (LSTiming.awaitingReceipt(item.status) || item.status === 'HUY') return false;
    return !(item.status === 'TAM_DUNG' && !item.processing_started_at);
  }

  /** Hồ sơ đã được LS tiếp nhận và còn mở: tính phần hợp đồng chưa soạn xong vào tồn. */
  function dailyBacklogKeys(item, wt) {
    if (!dossierReceived(item)) return [];
    var keys = dailyIsCredit_(wt, item) ? (dailyIsMortgage_(wt, item) ? ['TON_THE_CHAP', 'TON_TIN_DUNG'] : ['TON_TIN_DUNG'])
      : dailyIsMortgageDoc_(wt, item) ? ['TON_THE_CHAP'] : [];
    // Hợp đồng đã soạn xong (đã tính cho cán bộ trước) thì không còn tồn.
    var mortgageDone = creditedParts(item, wt).some(function (p) { return p.key === 'HD_THE_CHAP'; });
    return keys.filter(function (k) {
      return !(k === 'TON_THE_CHAP' && mortgageDone) && !(k === 'TON_TIN_DUNG' && isCredited_(item, 'HD_TIN_DUNG'));
    });
  }

  /**
   * Tồn soạn hợp đồng tính đến ngày `toDate` (YYYY-MM-DD): một nguồn duy nhất cho dòng "Tồn soạn hiện nay"
   * của bảng Kết quả thực hiện và thẻ HĐTD/HĐTC của Việc tồn, để hai nơi luôn ra cùng một số.
   * Việc đã đóng, đã chuyển sang kỳ sau, hoặc Phòng/PGD đã dời sang ngày sau `toDate` thì chưa tính.
   */
  function draftBacklogAt(item, wt, toDate) {
    if (!item || item.carried_to_item_id || !(STATUS[item.status] && STATUS[item.status].open)) return [];
    var dueDay = String(item.occurrence_date || '').substring(0, 10);
    if (dueDay && toDate && dueDay > toDate) return [];
    return dailyBacklogKeys(item, wt);
  }

  /** Kế hoạch ngày lưu một chuỗi JSON trong Settings: { "HD_TIN_DUNG": 31, ... }. */
  function dailyPlan(settings) {
    try {
      var plan = JSON.parse((settings && settings.daily_plan_json) || '{}');
      return plan && typeof plan === 'object' ? plan : {};
    } catch (err) { return {}; }
  }

  /** Tên ngắn trên cột: tên gọi (từ cuối) in hoa, trùng thì dùng họ tên đầy đủ. */
  function dailyStaffLabels(users) {
    function words(u) { return String(u.full_name || '').trim().split(/\s+/).filter(Boolean); }
    var given = users.map(function (u) { var w = words(u); return (w.pop() || u.login_code || u.user_id).toUpperCase(); });
    var initials = users.map(function (u, i) {
      var w = words(u); w.pop();
      return (w.map(function (x) { return x.charAt(0); }).join('') + ' ' + given[i]).trim().toUpperCase();
    });
    function count(list, value) { return list.filter(function (x) { return x === value; }).length; }
    return users.map(function (u, i) {
      if (count(given, given[i]) < 2) return given[i];
      return count(initials, initials[i]) < 2 ? initials[i] : String(u.full_name || given[i]).toUpperCase();
    });
  }

  /** Ma trận khối lượng theo cán bộ và nhóm việc, luôn giữ cả dòng số 0. */
  function staffWorkloadByGroup(items, st, fromDate, toDate) {
    var from = dateOnly(fromDate), to = dateOnly(toDate);
    var groups = [];
    (st.workTypes || []).forEach(function (w) {
      var group = String(w.group || w.name || w.code || '').trim();
      if (group && groups.indexOf(group) === -1) groups.push(group);
    });
    var users = (st.users || []).filter(function (u) { return u.role === 'CAN_BO_LS'; }).sort(function (a, b) {
      return (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) || String(a.full_name || '').localeCompare(String(b.full_name || ''));
    });
    var byUser = {};
    users.forEach(function (u) {
      var byGroup = {};
      groups.forEach(function (g) { byGroup[g] = 0; });
      byUser[u.user_id] = { user: u, byGroup: byGroup, total: 0, done: 0 };
    });
    (items || []).forEach(function (item) {
      var day = dateOnly(item.occurrence_date || item.submitted_at);
      if (!day || (from && day < from) || (to && day > to)) return;
      var row = byUser[item.assigned_user_id];
      if (!row) return;
      var wt = U.byId(st.workTypes || [], 'code', item.work_type_code) || {};
      var group = String(wt.group || wt.name || item.work_type_code || 'Chưa rõ nhóm việc').trim();
      if (groups.indexOf(group) === -1) {
        groups.push(group);
        users.forEach(function (u) { if (byUser[u.user_id]) byUser[u.user_id].byGroup[group] = 0; });
      }
      row.byGroup[group] = Number(row.byGroup[group] || 0) + 1;
      row.total += 1;
      if (item.status === 'HOAN_THANH_LS') row.done += 1;
    });
    return { groups: groups, rows: users.map(function (u) { return byUser[u.user_id]; }) };
  }

  /**
   * Điểm vận hành tự tính từ dữ liệu công việc, không có bước nhập hay duyệt điểm.
   * 60 điểm đúng hạn + 25 điểm hoàn thành + 15 điểm không để tồn quá hạn.
   * Việc hủy và bản sao đã chuyển sang kỳ sau không làm lệch kết quả của cán bộ.
   */
  function operationalScorecard(fromDate, toDate, st, now) {
    var from = dateOnly(fromDate), to = dateOnly(toDate);
    var at = now instanceof Date ? now : new Date(now || U.now());
    var users = (st.users || []).filter(function (u) {
      return u.role === 'CAN_BO_LS' && u.active !== false && String(u.is_active).toLowerCase() !== 'false';
    });
    var byUser = {};
    users.forEach(function (u) {
      byUser[u.user_id] = { user: u, eligible: 0, done: 0, timedDone: 0, slaExemptEligible: 0, slaExemptDone: 0, onTime: 0, lateOpen: 0, open: 0 };
    });

    (st.items || []).forEach(function (item) {
      var day = dateOnly(item.occurrence_date || item.submitted_at);
      var row = byUser[item.assigned_user_id];
      if (!row || !day || (from && day < from) || (to && day > to) || item.status === 'HUY' || item.carried_to_item_id) return;

      row.eligible += 1;
      var exempt = slaExemptForState(item, st);
      if (exempt) row.slaExemptEligible += 1;
      if (item.status === 'HOAN_THANH_LS') {
        row.done += 1;
        if (exempt) row.slaExemptDone += 1;
        else if (item.due_at && item.completed_at) {
          row.timedDone += 1;
          if (new Date(item.completed_at).getTime() <= new Date(item.due_at).getTime()) row.onTime += 1;
        }
      }
      if (STATUS[item.status] && STATUS[item.status].open) {
        if (!slaExemptForState(item, st)) {
          row.open += 1;
          if (lateOpen(item, at.getTime(), st)) row.lateOpen += 1;
        }
      }
    });

    return users.map(function (u) {
      var row = byUser[u.user_id];
      if (!row.eligible) return Object.assign(row, { score: null, onTimeRate: null, completionRate: null, backlogRate: null, dataQuality: 'NO_WORK' });
      if (!row.timedDone) {
        row.score = null;
        row.onTimeRate = null;
        row.completionRate = Math.round((row.done / row.eligible) * 100);
        row.backlogRate = Math.round((row.open ? Math.max(0, 1 - row.lateOpen / row.open) : 1) * 100);
        row.dataQuality = row.slaExemptEligible === row.eligible ? 'SLA_MIEN' : 'THIEU_HAN_SLA';
        return row;
      }
      var onTimeRate = row.onTime / row.timedDone;
      var completionRate = row.done / row.eligible;
      var backlogRate = row.open ? Math.max(0, 1 - row.lateOpen / row.open) : 1;
      row.onTimeRate = Math.round(onTimeRate * 100);
      row.completionRate = Math.round(completionRate * 100);
      row.backlogRate = Math.round(backlogRate * 100);
      row.score = Math.round(60 * onTimeRate + 25 * completionRate + 15 * backlogRate);
      row.dataQuality = row.timedDone + row.slaExemptDone === row.done
        ? (row.slaExemptDone ? 'SLA_MIEN' : 'OK') : 'THIEU_HAN_SLA';
      return row;
    }).sort(function (a, b) {
      if (a.score === null && b.score === null) return String(a.user.full_name || '').localeCompare(String(b.user.full_name || ''));
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score || String(a.user.full_name || '').localeCompare(String(b.user.full_name || ''));
    });
  }

  /**
   * Bản tính báo cáo của trình duyệt. Định nghĩa chỉ số phải khớp `getReport`
   * trong Code.gs, nếu không bản xem thử và bản chạy thật nói hai con số khác nhau.
   *
   * Khác biệt duy nhất là cách xác định kỳ: phía GAS dùng `period_id` của kỳ kế
   * hoạch, bản trình duyệt không có kỳ nên suy từ tháng của ngày phát sinh.
   */
  function reportFromItems(from, to, group, st) {
    var dim = { unit: 'DON_VI', work_type: 'LOAI_VIEC', staff: 'CAN_BO' }[group] || 'DON_VI';
    var wanted = monthsInRange(from, to);
    var inRange = {};
    wanted.forEach(function (k) { inRange[k] = true; });

    var now = U.now();
    var months = {}, totals = {}, snapshot = {}, lastMonth = '';

    function elapsedHours(from, to) {
      if (!from || !to) return null;
      var a = new Date(from).getTime(), b = new Date(to).getTime();
      return isFinite(a) && isFinite(b) && b >= a ? (b - a) / 3600000 : null;
    }

    st.items.forEach(function (i) {
      var key = String(i.occurrence_date || '').substring(0, 7);
      if (!inRange[key]) return;

      var req = U.byId(st.requests, 'request_id', i.request_id) || {};
      var done = i.status === 'HOAN_THANH_LS';
      var timing = LSTiming.metrics(i, processingCalendar(st), i.completed_at || now);
      var receiveHours = timing.tiep_nhan;
      var assignmentHours = timing.phan_cong;
      // 0 giờ trong lịch là chưa đo được (làm ngoài giờ), không phải xử lý tức thì: không đưa vào trung bình.
      var processHours = done && i.completed_at && !i.carried_to_item_id && timing.xu_ly > 0 ? timing.xu_ly : null;
      var totalHours = done && i.completed_at && !i.carried_to_item_id ? timing.toan_trinh : null;
      // Việc đã chuyển sang kỳ sau được chấm trễ ở dòng cuối của nó, không
      // phải ở mỗi kỳ nó đi qua — nếu không một việc trễ đếm thành ba lần trễ.
      var exempt = slaExemptForState(i, st);
      var late = i.due_at && !i.carried_to_item_id && !exempt
        ? (done ? String(i.completed_at || '') > String(i.due_at) : lateOpen(i, new Date(now).getTime(), st)) : false;
      var open = STATUS[i.status] && STATUS[i.status].open && !i.carried_to_item_id;

      var dimKey, dimLabel;
      if (dim === 'DON_VI') {
        dimKey = req.unit_id || '';
        var unit = U.byId(st.units, 'unit_id', dimKey);
        dimLabel = unit ? unit.name : (dimKey || 'Chưa rõ đơn vị');
      } else if (dim === 'LOAI_VIEC') {
        dimKey = i.work_type_code || '';
        var wt = U.byId(st.workTypes, 'code', dimKey);
        dimLabel = wt ? wt.name : (dimKey || 'Chưa rõ loại việc');
      } else {
        dimKey = i.assigned_user_id || '';
        var us = U.byId(st.users, 'user_id', dimKey);
        dimLabel = us ? us.full_name : 'Chưa giao';
      }

      function add(acc) {
        if (i.carryover_from_item_id) acc.chuyen_tiep_vao += 1; else acc.phat_sinh += 1;
        if (receiveHours !== null) { acc.tong_gio_tiep_nhan += receiveHours; acc.so_tiep_nhan += 1; }
        if (assignmentHours !== null) { acc.tong_gio_phan_cong += assignmentHours; acc.so_phan_cong += 1; }
        if (processHours !== null) { acc.tong_gio_xu_ly += processHours; acc.so_xu_ly += 1; }
        if (totalHours !== null) { acc.tong_gio_toan_trinh += totalHours; acc.so_toan_trinh += 1; }
        if (done) acc.hoan_thanh += 1;
        if (i.status === 'HUY') acc.huy += 1;
        if (late) acc.qua_han += 1;
        return acc;
      }
      function blank(extra) {
        return Object.assign({ phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0,
          ton_cuoi_ky: 0, qua_han: 0, tong_gio_tiep_nhan: 0, so_tiep_nhan: 0,
          tong_gio_phan_cong: 0, so_phan_cong: 0, tong_gio_xu_ly: 0, so_xu_ly: 0,
          tong_gio_toan_trinh: 0, so_toan_trinh: 0 }, extra || {});
      }

      var m = months[key] || (months[key] = blank({ month_key: key, name: 'Tháng ' + Number(key.substring(5)) + '/' + key.substring(0, 4) }));
      add(m);
      if (open) m.ton_cuoi_ky += 1;

      var row = totals[dimKey] || (totals[dimKey] = blank({ key: dimKey, label: dimLabel }));
      row.label = dimLabel;
      add(row);

      if (key > lastMonth) { lastMonth = key; }
      snapshot[key] = snapshot[key] || {};
      if (open) snapshot[key][dimKey] = (snapshot[key][dimKey] || 0) + 1;
    });

    var last = snapshot[lastMonth] || {};
    var rows = Object.keys(totals).map(function (k) {
      var r = totals[k];
      // Tồn là ảnh chụp cuối kỳ, không phải tổng cộng dồn qua các tháng.
      r.ton_cuoi_ky = Number(last[k] || 0);
      r.gio_tiep_nhan_tb = r.so_tiep_nhan ? Math.round((r.tong_gio_tiep_nhan / r.so_tiep_nhan) * 10) / 10 : 0;
      r.gio_phan_cong_tb = r.so_phan_cong ? Math.round((r.tong_gio_phan_cong / r.so_phan_cong) * 10) / 10 : 0;
      r.gio_xu_ly_tb = r.so_xu_ly ? Math.round((r.tong_gio_xu_ly / r.so_xu_ly) * 10) / 10 : 0;
      r.gio_toan_trinh_tb = r.so_toan_trinh ? Math.round((r.tong_gio_toan_trinh / r.so_toan_trinh) * 10) / 10 : 0;
      return r;
    }).sort(function (a, b) { return b.phat_sinh - a.phat_sinh || String(a.label).localeCompare(String(b.label)); });

    var monthRows = wanted.map(function (k) {
      return months[k] || { month_key: k, name: 'Tháng ' + Number(k.substring(5)) + '/' + k.substring(0, 4),
        phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0, ton_cuoi_ky: 0, qua_han: 0,
        tong_gio_tiep_nhan: 0, so_tiep_nhan: 0, tong_gio_phan_cong: 0, so_phan_cong: 0,
        tong_gio_xu_ly: 0, so_xu_ly: 0, tong_gio_toan_trinh: 0, so_toan_trinh: 0 };
    });

    var total = monthRows.reduce(function (acc, m) {
      ['phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'qua_han',
        'tong_gio_tiep_nhan', 'so_tiep_nhan', 'tong_gio_phan_cong', 'so_phan_cong',
        'tong_gio_xu_ly', 'so_xu_ly', 'tong_gio_toan_trinh', 'so_toan_trinh']
        .forEach(function (k) { acc[k] += Number(m[k] || 0); });
      acc.ton_cuoi_ky = Number(m.ton_cuoi_ky || 0);
      return acc;
    }, { phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0, ton_cuoi_ky: 0, qua_han: 0,
      tong_gio_tiep_nhan: 0, so_tiep_nhan: 0, tong_gio_phan_cong: 0, so_phan_cong: 0,
      tong_gio_xu_ly: 0, so_xu_ly: 0, tong_gio_toan_trinh: 0, so_toan_trinh: 0 });
    total.gio_tiep_nhan_tb = total.so_tiep_nhan ? Math.round((total.tong_gio_tiep_nhan / total.so_tiep_nhan) * 10) / 10 : 0;
    total.gio_phan_cong_tb = total.so_phan_cong ? Math.round((total.tong_gio_phan_cong / total.so_phan_cong) * 10) / 10 : 0;
    total.gio_xu_ly_tb = total.so_xu_ly ? Math.round((total.tong_gio_xu_ly / total.so_xu_ly) * 10) / 10 : 0;
    total.gio_toan_trinh_tb = total.so_toan_trinh ? Math.round((total.tong_gio_toan_trinh / total.so_toan_trinh) * 10) / 10 : 0;

    return { from: from, to: to, group: group, months: monthRows, rows: rows, total: total,
      periods: monthRows.length, generated_at: U.now() };
  }

  function dueFrom(startIso, workTypeCode, st) {
    var wt = U.byId(st.workTypes, 'code', workTypeCode);
    return U.addWorkingHours(startIso, wt ? wt.sla_hours : 8, st.calendar);
  }

  /* ============================ Dữ liệu mẫu ============================ */

  function seed() {
    var d17 = '2026-09-17T01:00:00.000Z';
    var d18 = '2026-09-18T02:00:00.000Z';
    var d19 = '2026-09-19T02:30:00.000Z';

    return {
      schema: 3,
      session: null,

      settings: {
        bank_name: 'BIDV Đắk Lắk', hotline: '1900 0000',
        app_url: 'https://script.google.com/a/macros/bank.vn/s/AKfy.../exec',
        timezone: 'Asia/Ho_Chi_Minh', week_start: 'MONDAY',
        sign_place: 'Quầy giao dịch của đơn vị gửi hồ sơ',
        retention_months: 60, export_row_limit: 5000, backlog_alert: 20,
        env: 'THU_NGHIEM', gateway_url: '', gateway_auth_ref: 'LS_GATEWAY_TOKEN', gateway_token_set: 'false'
      },
      updateNotice: null,

      calendar: {
        days: [1, 2, 3, 4, 5], open: '07:30', close: '18:00',
        breakFrom: '11:30', breakTo: '13:30',
        holidays: ['2026-09-02', '2026-01-01']
      },

      units: [
        { unit_id: 'PGD_BEN_THANH', name: 'PGD Bến Thành', kind: 'PGD', active: true },
        { unit_id: 'PGD_TAN_BINH', name: 'PGD Tân Bình', kind: 'PGD', active: true },
        { unit_id: 'GBS', name: 'GBS', kind: 'PGD', active: true, sort_order: 1, source_tab: 'GBS' },
        { unit_id: 'GDT', name: 'GDT', kind: 'PGD', active: true, sort_order: 2, source_tab: 'GDT' },
        { unit_id: 'KHCN1', name: 'Phòng KHCN1', kind: 'PGD', active: true, sort_order: 3, source_tab: 'Phòng KHCN1' },
        { unit_id: 'KHCN2', name: 'Phòng KHCN2', kind: 'PGD', active: true, sort_order: 4, source_tab: 'Phòng KHCN2' },
        { unit_id: 'PGD_TBM', name: 'PGD TBM', kind: 'PGD', active: true, sort_order: 5, source_tab: 'PGD TBM' },
        { unit_id: 'PGD_DBM', name: 'PGD DBM', kind: 'PGD', active: true, sort_order: 6, source_tab: 'PGD DBM' },
        { unit_id: 'PGD_BMT', name: 'PGD BMT', kind: 'PGD', active: true, sort_order: 7, source_tab: 'PGD BMT' },
        { unit_id: 'PGD_NBM', name: 'PGD NBM', kind: 'PGD', active: true, sort_order: 8, source_tab: 'PGD NBM' },
        { unit_id: 'PHONG_LS', name: 'Ban tín dụng LS', kind: 'LS', active: true },
        { unit_id: 'HE_THONG', name: 'Quản trị hệ thống', kind: 'HT', active: true }
      ],

      users: [
        { user_id: 'U001', login_code: 'pgd_demo', auth_group: 'EXTERNAL', full_name: 'Nguyễn Văn Phòng', email: 'pgd.benthanh@bank.vn', role: 'PHONG_PGD', unit_id: 'PGD_BEN_THANH', active: true },
        { user_id: 'U002', login_code: 'ks_demo', auth_group: 'INTERNAL', full_name: 'Trần Thị Kiểm Soát', email: 'ksls@bank.vn', role: 'KS_LS', unit_id: 'PHONG_LS', active: true },
        { user_id: 'U003', login_code: 'ls_demo_1', auth_group: 'INTERNAL', full_name: 'Lê Văn Cán Bộ', email: 'cbls1@bank.vn', role: 'CAN_BO_LS', unit_id: 'PHONG_LS', active: true, zalo_name: 'Lê Cán Bộ', zalo_phone: '0903111222' },
        { user_id: 'U004', login_code: 'ls_demo_2', auth_group: 'INTERNAL', full_name: 'Phạm Thị Cán Bộ', email: 'cbls2@bank.vn', role: 'CAN_BO_LS', unit_id: 'PHONG_LS', active: true, zalo_name: 'Phạm Cán Bộ', zalo_phone: '0903333444' },
        { user_id: 'U005', login_code: 'ql_demo', auth_group: 'INTERNAL', full_name: 'Phạm Quản Lý', email: 'quanlyls@bank.vn', role: 'QUAN_LY_LS', unit_id: 'PHONG_LS', active: true },
        { user_id: 'U006', login_code: 'admin', auth_group: 'INTERNAL', full_name: 'Bùi Quản Trị', email: 'admin@bank.vn', role: 'ADMIN', unit_id: 'HE_THONG', active: true }
      ],

      workTypes: [
        ['LEGACY_01', 'Món', 'Món - Vay mới TSĐB- Tiêu dùng'],
        ['LEGACY_02', 'Món', 'Món- Vay lại TSĐB- Tiêu dùng'],
        ['LEGACY_03', 'Món', 'Món- Vay mới SXKD'],
        ['LEGACY_04', 'Món', 'Món- Vay lại SXKD'],
        ['LEGACY_05', 'Món', 'Món- Nhà ở - Vay mới'],
        ['LEGACY_06', 'Món', 'Món- Nhà ở - Vay lại'],
        ['LEGACY_07', 'Món', 'Món -Nhà ở - GN tiến độ/ tăng thêm'],
        ['LEGACY_08', 'Món', 'Món- Ôtô- Vay mới'],
        ['LEGACY_09', 'Món', 'Món- Cho vay/HMTC cầm cố STK/TG'],
        ['LEGACY_10', 'Món', 'Món - Vay mới Tín chấp (Lương....)'],
        ['LEGACY_11', 'Món', 'Món - Vay lại Tín chấp (Lương....)'],
        ['LEGACY_12', 'HM SXKD', 'HM SXKD- Mới- Khởi tạo HM'],
        ['LEGACY_13', 'HM SXKD', 'HM SXKD- Giải ngân từng lần'],
        ['LEGACY_14', 'Thấu chi', 'Thấu chi - Vay mới- Tiêu dùng'],
        ['LEGACY_15', 'Thấu chi', 'Thấu chi - Vay mới- SXKD'],
        ['LEGACY_16', 'Thấu chi', 'Thấu chi - Vay mới- Tín chấp'],
        ['LEGACY_17', 'Thấu chi', 'Thấu chi - Tái cấp- Tiêu dùng'],
        ['LEGACY_18', 'Thấu chi', 'Thấu chi - Tái cấp- SXKD'],
        ['LEGACY_19', 'Thấu chi', 'Thấu chi - Tái cấp- Tín chấp'],
        ['LEGACY_20', 'Thẻ tín dụng', 'Thẻ tín dụng - Có TSĐB'],
        ['LEGACY_21', 'Thẻ tín dụng', 'Thẻ tín dụng - Tín chấp'],
        ['LEGACY_22', 'TSĐB', 'ĐC Nhập tăng TSĐB/ Ký lại PLHD'],
        ['LEGACY_23', 'TSĐB', 'ĐC Xuất giảm TSĐB/ Ký lại PLHD'],
        ['LEGACY_24', 'TSĐB', 'Xuất TSĐB/ Xóa thế chấp'],
        ['LEGACY_25', 'TSĐB', 'Thay đổi TSĐB (Đổi GCN QSDD, Hoàn công,,,)'],
        ['LEGACY_26', 'TSĐB', 'Nhập mới/ Nhập thêm TSĐB/ ĐKTC'],
        ['LEGACY_27', 'TSĐB', 'Mượn TSĐB'],
        ['LEGACY_28', 'TSĐB', 'Thủ tục TSĐB khác'],
        ['LEGACY_29', 'Khác', 'Công việc tín dụng khác']
      ].map(function (row, index) {
        return { code: row[0], group: row[1], name: row[2], sort_order: index + 1, sla_hours: 8,
          needs_appointment: true, needs_ks_approval: false, active: true, checklist: [] };
      }),

      reasons: [
        { code: 'BS_THIEU_CCCD', group: 'BO_SUNG', label: 'Thiếu giấy tờ tùy thân', active: true },
        { code: 'BS_SAI_LOAI', group: 'BO_SUNG', label: 'Chọn sai loại việc', active: true },
        { code: 'BS_THIEU_LIEN_HE', group: 'BO_SUNG', label: 'Chưa có số / email liên hệ', active: true },
        { code: 'TD_CHO_KH', group: 'TAM_DUNG', label: 'Chờ khách bổ sung hồ sơ', active: true },
        { code: 'TD_CHO_PHE_DUYET', group: 'TAM_DUNG', label: 'Chờ cấp phê duyệt', active: true },
        { code: 'HUY_KH_RUT', group: 'HUY', label: 'Khách rút yêu cầu', active: true },
        { code: 'HUY_TRUNG', group: 'HUY', label: 'Trùng hồ sơ đã gửi', active: true }
      ],

      catalogOptions: [
        ['KHCN1', ['Trần Thị Lệ Trang', 'Phan Đức Hiển', 'Ngô Trung Thành', 'Trần Thị Hoàng', 'Đỗ Mạnh Cường', 'Trần Văn Hùng', 'Đinh Thế Phước', 'Phan Thị Thảo Trang']],
        ['KHCN2', ['Ngô Thị Lan Phương', 'Nguyễn Hoàng Huỳnh', 'Đinh Thị Thanh Loan', 'Nguyễn Thị Hồng Vân', 'Võ Nguyễn Thảo', 'Nguyễn Vy']],
        ['PGD_DBM', ['Nguyễn Văn Quý']],
        ['PGD_BMT', ['Nguyễn Văn Tuấn', 'Bùi Thị Phương Vi', 'Lưu Trà Mai', 'Hoàng Văn Lương']],
        ['PGD_NBM', ['Nguyễn Phi Hùng', 'Nguyễn Tiến Thủy']]
      ].reduce(function (all, group) {
        var tab = { KHCN1: 'Phòng KHCN1', KHCN2: 'Phòng KHCN2', PGD_DBM: 'PGD DBM', PGD_BMT: 'PGD BMT', PGD_NBM: 'PGD NBM' }[group[0]] || group[0];
        group[1].forEach(function (name, index) { all.push({ option_id: 'SRC_' + group[0] + '_' + index, catalog_key: 'REQUESTOR', unit_id: group[0], label: name, role_kind: 'VRM_PRM', sort_order: index + 1, source_tab: tab, source_row: index + 1, active: true }); });
        return all;
      }, []).concat([
        'Món - Vay mới TSĐB- Tiêu dùng', 'Món- Vay lại TSĐB- Tiêu dùng', 'Món- Vay mới SXKD', 'Món- Vay lại SXKD',
        'Món- Nhà ở - Vay mới', 'Món- Nhà ở - Vay lại', 'Món -Nhà ở - GN tiến độ/ tăng thêm', 'Món- Ôtô- Vay mới',
        'Món- Cho vay/HMTC cầm cố STK/TG', 'Món - Vay mới Tín chấp (Lương....)', 'Món - Vay lại Tín chấp (Lương....)',
        'HM SXKD- Mới- Khởi tạo HM', 'HM SXKD- Giải ngân từng lần', 'Thấu chi - Vay mới- Tiêu dùng', 'Thấu chi - Vay mới- SXKD',
        'Thấu chi - Vay mới- Tín chấp', 'Thấu chi - Tái cấp- Tiêu dùng', 'Thấu chi - Tái cấp- SXKD', 'Thấu chi - Tái cấp- Tín chấp',
        'Thẻ tín dụng - Có TSĐB', 'Thẻ tín dụng - Tín chấp', 'ĐC Nhập tăng TSĐB/ Ký lại PLHD', 'ĐC Xuất giảm TSĐB/ Ký lại PLHD',
        'Xuất TSĐB/ Xóa thế chấp', 'Thay đổi TSĐB (Đổi GCN QSDD, Hoàn công,,,)', 'Nhập mới/ Nhập thêm TSĐB/ ĐKTC',
        'Mượn TSĐB', 'Thủ tục TSĐB khác', 'Công việc tín dụng khác'
      ].map(function (name, index) { return { option_id: 'SRC_PRODUCT_' + index, catalog_key: 'PRODUCT', unit_id: '', label: name, role_kind: 'PRODUCT', sort_order: index + 1, source_tab: 'GBS', source_row: index + 1, active: true }; })),

      channels: [
        { code: 'IN_APP', status: 'HOAT_DONG', test_mode: false, allowlist: [], rate_per_hour: 0, max_retry: 0, config: {} },
        {
          code: 'EMAIL', status: 'THU_NGHIEM', test_mode: true,
          allowlist: ['ksls@bank.vn', 'cbls1@bank.vn', 'cbls2@bank.vn', 'quanlyls@bank.vn', 'pgd.benthanh@bank.vn'],
          rate_per_hour: 120, max_retry: 3,
          config: { mode: 'MAILAPP', sender: 'thongbao.ls@bank.vn', daily_quota: 100, used_today: 3, quota_date: U.localDate(), unit_cost: 0, currency: 'VND', cost_version: '2026-01' }
        },
        {
          code: 'ZBS', status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: [], rate_per_hour: 60, max_retry: 3,
          config: { oa_id: '', app_id: '', secret_set: false, provider: 'zbs_gateway', secret_ref: 'LS_ZBS_SECRET', unit_cost: 0, currency: 'VND', cost_version: '2026-01' }
        },
        {
          code: 'SMS', status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: [], rate_per_hour: 120, max_retry: 3,
          config: { provider: 'sms_gateway', sender_id: '', secret_ref: 'LS_SMS_TOKEN', unit_cost: 0, currency: 'VND', cost_version: '2026-01' }
        },
        {
          code: 'GMF', status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: [], rate_per_hour: 30, max_retry: 2,
          config: { group_id: '', api_checked: false }
        },
        {
          code: 'TELEGRAM', status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: [], rate_per_hour: 60, max_retry: 2,
          config: { bot_name: '', token_set: false, group_chat_id: '' }
        }
      ],

      templates: [
        {
          code: 'TPL_GIAO_VIEC', name: 'Báo giao việc cho cán bộ', channel: 'EMAIL', status: 'DA_DUYET',
          subject: 'Việc LS mới: {{ma_viec}}',
          body: 'Bạn được giao xử lý việc {{ma_viec}} — {{loai_viec}} từ {{don_vi}}.\nHạn xử lý: {{han_xu_ly}}.\nMở hệ thống để xem chi tiết: {{link}}',
          approved_by: 'U006', approved_at: d17
        },
        {
          code: 'TPL_BO_SUNG', name: 'Báo phòng bổ sung hồ sơ', channel: 'EMAIL', status: 'DA_DUYET',
          subject: 'Cần bổ sung hồ sơ: {{ma_viec}}',
          body: 'Việc {{ma_viec}} — {{loai_viec}} cần bổ sung thông tin trước khi LS tiếp nhận.\nMở hệ thống để cập nhật: {{link}}',
          approved_by: 'U006', approved_at: d17
        },
        {
          code: 'TPL_QUA_HAN', name: 'Nhắc việc quá hạn', channel: 'EMAIL', status: 'DA_DUYET',
          subject: 'Quá hạn: {{ma_viec}}',
          body: 'Việc {{ma_viec}} — {{loai_viec}} đã quá hạn {{han_xu_ly}}.\nMở hệ thống: {{link}}',
          approved_by: 'U006', approved_at: d17
        },
        {
          code: 'TPL_HEN_KY', name: 'Mời khách đến ký hồ sơ', channel: 'ZBS', status: 'CHO_DUYET',
          subject: '',
          body: 'Kính chào {{ten_khach}}, {{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}} để hoàn tất thủ tục.\nLiên hệ {{hotline}} nếu cần đổi lịch.',
          approved_by: '', approved_at: ''
        },
        {
          code: 'TPL_SMS_HEN_KY', name: 'SMS mời khách đến ký hồ sơ', channel: 'SMS', status: 'NHAP',
          subject: '',
          body: '{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}}. Liên hệ {{hotline}} nếu cần đổi lịch.',
          approved_by: '', approved_at: ''
        },
        {
          code: 'TPL_NHOM_HEN_KY', name: 'Nhắn nhóm Zalo nhờ cán bộ mời khách lên ký', channel: 'GMF', status: 'DA_DUYET',
          subject: '',
          body: '{{tag_can_bo}} đề nghị liên hệ khách hàng của việc {{ma_viec}} lên ký hồ sơ lúc {{gio_ky}} ngày {{ngay_ky}} tại {{noi_ky}}.\nChi tiết: {{link}}',
          approved_by: 'U006', approved_at: d17
        },
        {
          code: 'TPL_MAIL_HEN_KY', name: 'Email thông báo lịch hẹn ký hồ sơ', channel: 'EMAIL', status: 'DA_DUYET',
          subject: 'Thông báo lịch hẹn ký hồ sơ tại {{ten_ngan_hang}}',
          body: 'Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} xin thông báo lịch hẹn ký hồ sơ của Quý khách như sau:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ cán bộ Quản lý.\nTrân trọng,\n{{ten_ngan_hang}}',
          approved_by: 'U006', approved_at: d17
        },
        {
          code:'TPL_DONE_INTERNAL',name:'Email báo Phòng/PGD hoàn thành',channel:'EMAIL',status:'DA_DUYET',
          subject:'Hồ sơ {{ma_viec}} đã hoàn thành',body:'Hồ sơ {{ma_viec}} — {{loai_viec}} của {{ten_khach}} đã hoàn thành.\nCán bộ LS: {{can_bo_ls}}.\nHoàn thành: {{hoan_thanh_luc}}.\nLịch hẹn KH: {{lich_hen}}.\nXem hồ sơ: {{link}}',approved_by:'U006',approved_at:d17
        },
        {
          code:'TPL_APPT_INTERNAL',name:'Email báo Phòng/PGD đã hẹn khách ký',channel:'EMAIL',status:'DA_DUYET',
          subject:'Đã hẹn khách ký hồ sơ {{ma_viec}}',body:'Hồ sơ {{ma_viec}} — {{loai_viec}} của {{ten_khach}} đã được LS hẹn khách ký.\nLịch hẹn KH: {{lich_hen}}.\nCán bộ LS: {{can_bo_ls}}.\nXem hồ sơ: {{link}}',approved_by:'U006',approved_at:d17
        },
        {
          code: 'TPL_NHOM_GIAO', name: 'Tin nhóm nội bộ khi có việc mới', channel: 'GMF', status: 'NHAP',
          subject: '',
          body: 'Việc mới {{ma_viec}} — {{loai_viec}} từ {{don_vi}}. Hạn {{han_xu_ly}}. Chi tiết: {{link}}',
          approved_by: '', approved_at: ''
        }
      ],

      notifyRules: [
        { id:'R10',event:'DANG_HEN_KH',audience:'PHONG_PHU_TRACH',channels:['EMAIL'],template:'TPL_APPT_INTERNAL',enabled:true,confirm:false,throttle:0 },
        { id:'R9',event:'HOAN_THANH_LS',audience:'PHONG_PHU_TRACH',channels:['EMAIL'],template:'TPL_DONE_INTERNAL',enabled:true,confirm:false,throttle:0 },
        { id: 'R1', event: 'DA_PHAN_CONG', audience: 'CAN_BO', channels: ['IN_APP', 'EMAIL'], template: 'TPL_GIAO_VIEC', enabled: true, confirm: false, throttle: 0 },
        { id: 'R2', event: 'DOI_NGUOI', audience: 'CAN_BO', channels: ['IN_APP', 'EMAIL'], template: 'TPL_GIAO_VIEC', enabled: true, confirm: false, throttle: 0 },
        { id: 'R3', event: 'CAN_BO_SUNG', audience: 'PHONG_GUI', channels: ['IN_APP', 'EMAIL'], template: 'TPL_BO_SUNG', enabled: true, confirm: false, throttle: 0 },
        { id: 'R4', event: 'DE_NGHI_SUA', audience: 'KS', channels: ['IN_APP'], template: '', enabled: true, confirm: false, throttle: 0 },
        { id: 'R5', event: 'QUA_HAN', audience: 'CAN_BO', channels: ['IN_APP', 'EMAIL'], template: 'TPL_QUA_HAN', enabled: true, confirm: false, throttle: 240 },
        { id: 'R6', event: 'DANG_HEN_KH', audience: 'KHACH', channels: ['ZBS', 'SMS', 'EMAIL'], template: 'TPL_HEN_KY,TPL_SMS_HEN_KY,TPL_MAIL_HEN_KY', enabled: true, confirm: true, throttle: 0, when: 'DIRECT' },
        { id: 'R8', event: 'DANG_HEN_KH', audience: 'NHOM', channels: ['GMF', 'TELEGRAM'], template: 'TPL_NHOM_HEN_KY', enabled: true, confirm: false, throttle: 0, when: 'GROUP' },
        { id: 'R7', event: 'HOAN_THANH_LS', audience: 'PHONG_GUI', channels: ['IN_APP'], template: '', enabled: true, confirm: false, throttle: 0 }
      ],

      requests: [
        {
          request_id: 'REQ_1001', unit_id: 'PGD_BEN_THANH', created_by: 'U001', created_at: d17, note: '',
          customer: { name: 'Công ty TNHH Minh Phát', kind: 'DA_CO_CIF', cif: 'CIF-99201', phone: '0908123456', email: 'ketoan@minhphat.vn', priority_flags: ['QUAN_TRONG'] }
        },
        {
          request_id: 'REQ_1002', unit_id: 'PGD_BEN_THANH', created_by: 'U001', created_at: d19,
          note: 'Khách đi công tác từ ngày 22, đề nghị xử lý sớm.',
          customer: { name: 'Trần Văn Hùng', kind: 'KH_MOI', cif: '', phone: '', email: '', priority_flags: ['XU_LY_GAP'] }
        },
        {
          request_id: 'REQ_1003', unit_id: 'PGD_TAN_BINH', created_by: 'U001', created_at: d18, note: '',
          customer: { name: 'Công ty CP Tân Việt', kind: 'DA_CO_CIF', cif: 'CIF-71544', phone: '0977654321', email: '', priority_flags: [] }
        }
      ],

      items: [
        {
          item_id: 'ITEM_1001A', request_id: 'REQ_1001', work_type_code: 'LEGACY_03', product_name: 'Vay vốn lưu động',
          occurrence_date: '2026-09-17', status: 'HOAN_THANH_LS', assigned_user_id: 'U003', assigned_by: 'U002',
          submitted_at: d17, accepted_at: d17, assigned_at: d17, due_at: '2026-09-17T09:30:00.000Z',
          completed_at: '2026-09-19T03:15:00.000Z',
          appointment: { at: '2026-09-18T03:00:00.000Z', channel: 'EMAIL', place: 'PGD Bến Thành', result: 'DA_KY' },
          checklist: [true, true, true, true], note: 'Khách đã ký đủ hồ sơ.', pending: null, version: 4
        },
        {
          item_id: 'ITEM_1001B', request_id: 'REQ_1001', work_type_code: 'LEGACY_21', product_name: 'Thẻ tín dụng doanh nghiệp',
          occurrence_date: '2026-09-18', status: 'DANG_THUC_HIEN', assigned_user_id: 'U003', assigned_by: 'U002',
          submitted_at: d18, accepted_at: d18, assigned_at: d18, due_at: '2026-09-18T08:00:00.000Z',
          completed_at: '', appointment: null, checklist: [true, false], note: '', pending: null, version: 2
        },
        {
          item_id: 'ITEM_1002A', request_id: 'REQ_1002', work_type_code: 'LEGACY_16', product_name: 'Thấu chi lương',
          occurrence_date: '2026-09-19', status: 'CHO_PHAN_CONG', assigned_user_id: '', assigned_by: '',
          submitted_at: d19, accepted_at: '', assigned_at: '', due_at: '', completed_at: '',
          appointment: null, checklist: [false, false], note: '', pending: null, version: 1
        },
        {
          item_id: 'ITEM_1003A', request_id: 'REQ_1003', work_type_code: 'LEGACY_18', product_name: 'Gia hạn hạn mức 2026',
          occurrence_date: '2026-09-18', status: 'DANG_THUC_HIEN', assigned_user_id: 'U004', assigned_by: 'U002',
          submitted_at: d18, accepted_at: d18, assigned_at: d18, due_at: '2026-09-21T03:00:00.000Z',
          completed_at: '', appointment: null, checklist: [true, false, false], note: '', pending: null, version: 2
        }
      ],

      events: [
        { event_id: 'EVT_01', item_id: 'ITEM_1001A', type: 'TAO_VIEC', by: 'U001', at: d17, reason: 'PGD Bến Thành đăng ký yêu cầu.' },
        { event_id: 'EVT_02', item_id: 'ITEM_1001A', type: 'DA_PHAN_CONG', by: 'U002', at: d17, reason: 'Giao Lê Văn Cán Bộ.' },
        { event_id: 'EVT_03', item_id: 'ITEM_1001A', type: 'HOAN_THANH_LS', by: 'U003', at: '2026-09-19T03:15:00.000Z', reason: 'Hoàn thành sau khi khách đã ký.' },
        { event_id: 'EVT_04', item_id: 'ITEM_1002A', type: 'TAO_VIEC', by: 'U001', at: d19, reason: 'PGD Bến Thành đăng ký yêu cầu.' },
        { event_id: 'EVT_05', item_id: 'ITEM_1003A', type: 'DANG_THUC_HIEN', by: 'U004', at: d18, reason: 'Tiếp nhận hồ sơ từ Phòng/PGD.' }
      ],

      outbox: [
        {
          outbox_id: 'OUT_01', idem_key: 'ITEM_1001A:DA_PHAN_CONG:CAN_BO:U003', item_id: 'ITEM_1001A',
          event: 'DA_PHAN_CONG', audience: 'CAN_BO', channel: 'EMAIL', recipient_kind: 'NOI_BO',
          recipient: 'cbls1@bank.vn', recipient_name: 'Lê Văn Cán Bộ', template_code: 'TPL_GIAO_VIEC',
          body: 'Bạn được giao xử lý việc ITEM_1001A — Soạn hồ sơ vay mới từ PGD Bến Thành.',
          status: 'DA_GUI', note: '', retry: 0, provider_id: 'SIM-7K2QA1', created_at: d17, sent_at: d17
        },
        {
          outbox_id: 'OUT_02', idem_key: 'ITEM_1001A:DANG_HEN_KH:KHACH:REQ_1001', item_id: 'ITEM_1001A',
          event: 'DANG_HEN_KH', audience: 'KHACH', channel: 'ZBS', recipient_kind: 'KHACH',
          recipient: '0908123456', recipient_name: 'Công ty TNHH Minh Phát', template_code: 'TPL_HEN_KY',
          body: '', status: 'KHONG_GUI', note: 'Mẫu tin chưa được duyệt', retry: 0, provider_id: '', created_at: d18, sent_at: ''
        },
        {
          outbox_id: 'OUT_03', idem_key: 'ITEM_1003A:DA_PHAN_CONG:CAN_BO:U004', item_id: 'ITEM_1003A',
          event: 'DA_PHAN_CONG', audience: 'CAN_BO', channel: 'EMAIL', recipient_kind: 'NOI_BO',
          recipient: 'cbls2@bank.vn', recipient_name: 'Phạm Thị Cán Bộ', template_code: 'TPL_GIAO_VIEC',
          body: 'Bạn được giao xử lý việc ITEM_1003A — Tái cấp / gia hạn hạn mức từ PGD Tân Bình.',
          status: 'THAT_BAI', note: 'Nhà cung cấp trả lỗi 421 — hộp thư tạm từ chối', retry: 2, provider_id: '', created_at: d18, sent_at: ''
        }
      ],

      notificationMetrics: [],

      inbox: [
        { id: 'NTF_01', user_id: 'U003', item_id: 'ITEM_1001B', event: 'DA_PHAN_CONG', at: d18, read: true }
      ],

      configLog: [
        { id: 'CFG_01', at: d17, by: 'U006', area: 'Kênh gửi tin', detail: 'Bật email ở chế độ thử nghiệm, giới hạn 5 người nhận.' },
        { id: 'CFG_02', at: d17, by: 'U006', area: 'Mẫu tin', detail: 'Duyệt mẫu TPL_GIAO_VIEC.' }
      ]
    };
  }

  return {
    ROLES: ROLES, SCREENS: SCREENS, screenFor: screenFor, STATUS: STATUS, PRE_ASSIGN: PRE_ASSIGN, FLOW: FLOW,
    APPT_RESULT: APPT_RESULT, EVENT_LABEL: EVENT_LABEL,
    REACH_CHANNELS: REACH_CHANNELS, customerReach: customerReach,
    signPlace: signPlace, nextSlot: nextSlot, officerTag: officerTag,
    CHANNELS: CHANNELS, CHANNEL_STATUS: CHANNEL_STATUS,
    addressFor: addressFor, templateFor: templateFor, emailUsedToday: emailUsedToday,
    REPORT_PRESETS: REPORT_PRESETS, presetRange: presetRange, monthsInRange: monthsInRange,
    reportFromItems: reportFromItems, monthKey: monthKey,
    dateOnly: dateOnly, userOff: userOff, SLA_PAUSED: SLA_PAUSED, lateOpen: lateOpen, slaExempt: slaExemptForState, applySlaPause: applySlaPause, userAvailable: userAvailable, staffWorkloadByGroup: staffWorkloadByGroup, mapLink: mapLink, emailHtml: emailHtml, DAILY_ROWS: DAILY_ROWS, OTHER_WORK_TYPES: OTHER_WORK_TYPES, OTHER_WORK_MAX_QUANTITY: OTHER_WORK_MAX_QUANTITY, OTHER_WORK_MEETING_MINUTES: OTHER_WORK_MEETING_MINUTES, splitPauseMinutes: splitPauseMinutes, otherWorkSummary: otherWorkSummary, RESULT_FLAGS: RESULT_FLAGS, resultFlagsFor: resultFlagsFor, resolvedResultFlags: resolvedResultFlags, isPledgeWorkType: isPledgeWorkType, ruleWorkTypeCodes: ruleWorkTypeCodes, ruleMatches: ruleMatches, ruleScore: ruleScore, dailyIsCredit: dailyIsCredit, draftContractKeys: draftContractKeys, requestCollateralQuantityKeys: requestCollateralQuantityKeys, dailyGuessFlags: dailyGuessFlags, savedResultFlags: savedResultFlags, dailyActivityKeys: dailyActivityKeys, dailyBacklogKeys: dailyBacklogKeys, draftBacklogAt: draftBacklogAt, dossierReceived: dossierReceived, HANDOVER_PARTS: HANDOVER_PARTS, resultCredit: resultCredit, creditedParts: creditedParts, handoverPartsFor: handoverPartsFor, collateralStepKeys: collateralStepKeys, stepKeys: stepKeys, steps: steps, COLLATERAL_STEP_LABELS: COLLATERAL_STEP_LABELS, stepQuantityLabel: stepQuantityLabel, dailyPlan: dailyPlan, dailyStaffLabels: dailyStaffLabels, operationalScorecard: operationalScorecard,
    VARS: VARS, FORBIDDEN: FORBIDDEN, TPL_STATUS: TPL_STATUS,
    NOTIFY_EVENTS: NOTIFY_EVENTS, AUDIENCE: AUDIENCE, OUT_STATUS: OUT_STATUS,
    label: label, tone: tone,
    channelReady: channelReady, channelUsable: channelUsable,
    usedVars: usedVars, checkTemplate: checkTemplate, renderTemplate: renderTemplate,
    recipientsFor: recipientsFor, contextFor: contextFor,
    queueNotifications: queueNotifications, dispatch: dispatch, outboxHealth: outboxHealth,
    sla: sla, CLOCK_RUNNING: CLOCK_RUNNING, processingCalendar: processingCalendar, processingHours: processingHours, processingLabel: processingLabel, receiptDurationLabel: receiptDurationLabel, durationLabel: durationLabel, averageDurationLabel: averageDurationLabel, activeSpans: activeSpans, applyClock: applyClock, clockPaused: clockPaused, dueFrom: dueFrom,
    seed: seed
  };
})();
