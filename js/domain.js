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
    KS_LS: { label: 'Kiểm soát LS', nav: ['queue', 'work', 'board', 'report', 'periods', 'audit'] },
    CAN_BO_LS: { label: 'Cán bộ LS', nav: ['my-dashboard', 'mine', 'audit'] },
    QUAN_LY_LS: { label: 'Quản lý LS', nav: ['board', 'queue', 'work', 'report', 'periods', 'audit'] },
    ADMIN: { label: 'Quản trị hệ thống', nav: ['admin', 'board', 'report', 'periods', 'audit'] }
  };

  var SCREENS = {
    work: { icon: 'clipboard', short: 'Đã phân bổ', title: 'Đã phân bổ', sub: 'Hồ sơ đã được phân công cán bộ LS' },
    room: { icon: 'building', short: 'Toàn bộ phòng', title: 'Toàn bộ hồ sơ phòng', sub: 'Tất cả hồ sơ của phòng đang đăng nhập' },
    'room-board': { icon: 'chart', short: 'Dashboard phòng', title: 'Dashboard phòng', sub: 'Khối lượng hồ sơ và LS đang xử lý cho phòng' },
    queue: { icon: 'shield', short: 'Hàng chờ', title: 'Tiếp nhận & phân công', sub: 'Kiểm tra hồ sơ, giao việc cho cán bộ LS' },
    mine: { icon: 'briefcase', short: 'Việc tôi', title: 'Việc của tôi', sub: 'Việc đang được giao cho bạn' },
    'my-dashboard': { icon: 'chart', short: 'Dashboard tôi', title: 'Dashboard cá nhân', sub: 'Kết quả và giờ xử lý thực tế trong ngày' },
    board: { icon: 'chart', short: 'Tổng hợp', title: 'Tổng hợp', sub: 'Kết quả theo kỳ, loại việc và cán bộ LS' },
    report: { icon: 'chart', short: 'Báo cáo', title: 'Báo cáo nhiều kỳ', sub: 'Tổng hợp theo tháng, quý, năm hoặc khoảng tùy chọn' },
    periods: { icon: 'calendar', short: 'Kỳ tháng', title: 'Kế hoạch tháng', sub: 'Kỳ đang vận hành và lịch sử các tháng trước' },
    admin: { icon: 'sliders', short: 'Quản trị', title: 'Quản trị hệ thống', sub: 'Kênh gửi tin, danh mục, người dùng, giám sát' },
    audit: { icon: 'history', short: 'Nhật ký', title: 'Nhật ký', sub: 'Lịch sử thao tác trong phạm vi được xem' }
  };

  /* ============================ Trạng thái việc ============================ */

  var STATUS = {
    CHO_TIEP_NHAN: { label: 'Chờ tiếp nhận', tone: 'warn', open: true },
    CAN_BO_SUNG: { label: 'Cần bổ sung', tone: 'danger', open: true },
    CHO_PHAN_CONG: { label: 'Chờ phân công', tone: 'warn', open: true },
    DA_PHAN_CONG: { label: 'Đã phân công', tone: 'info', open: true },
    DANG_THUC_HIEN: { label: 'Đang thực hiện', tone: 'info', open: true },
    DA_SOAN_XONG: { label: 'Đã soạn xong', tone: 'violet', open: true },
    DANG_HEN_KH: { label: 'Đang hẹn khách', tone: 'violet', open: true },
    CHO_KS_DUYET: { label: 'Chờ kiểm soát duyệt', tone: 'gold', open: true },
    HOAN_THANH_LS: { label: 'Hoàn thành', tone: 'ok', open: false },
    TAM_DUNG: { label: 'Tạm dừng', tone: 'neutral', open: true },
    HUY: { label: 'Đã hủy', tone: 'neutral', open: false }
  };

  var EVENT_LABEL = {
    TAO_VIEC: 'Tạo việc', CHUYEN_TIEP_THANG: 'Chuyển tiếp sang tháng mới', SUA_THONG_TIN: 'Sửa thông tin', DE_NGHI_SUA: 'Đề nghị sửa',
    DUYET_SUA: 'Duyệt sửa', TU_CHOI_SUA: 'Từ chối sửa', DOI_NGUOI: 'Chuyển việc',
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
  var FLOW = {
    CHO_TIEP_NHAN: [
      { to: 'DA_PHAN_CONG', label: 'Tiếp nhận và phân công', short: 'Tiếp nhận', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, primary: true, rank: 1, notify: 'DA_PHAN_CONG' },
      { to: 'CAN_BO_SUNG', label: 'Trả bổ sung', short: 'Trả bổ sung', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'BO_SUNG', rank: 2, notify: 'CAN_BO_SUNG' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD'], reason: 'HUY', rank: 9 }
    ],
    CAN_BO_SUNG: [
      { to: 'CHO_TIEP_NHAN', label: 'Gửi lại LS', short: 'Gửi lại', roles: ['PHONG_PGD', 'KS_LS'], reason: 'free', primary: true, rank: 1 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD'], reason: 'HUY', rank: 9 }
    ],
    CHO_PHAN_CONG: [
      { to: 'DA_PHAN_CONG', label: 'Phân công cán bộ', short: 'Phân công', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, primary: true, rank: 1, notify: 'DA_PHAN_CONG' },
      { to: 'CAN_BO_SUNG', label: 'Trả bổ sung', short: 'Trả bổ sung', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'BO_SUNG', rank: 2, notify: 'CAN_BO_SUNG' }
    ],
    DA_PHAN_CONG: [
      { to: 'DANG_THUC_HIEN', label: 'Bắt đầu xử lý', short: 'Bắt đầu', roles: ['CAN_BO_LS'], primary: true, rank: 1 },
      { to: 'DA_PHAN_CONG', label: 'Chuyển người khác', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'], reason: 'TAM_DUNG', rank: 8 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    DANG_THUC_HIEN: [
      { to: 'DA_SOAN_XONG', label: 'Báo soạn xong', short: 'Soạn xong', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 1 },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'], reason: 'TAM_DUNG', rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Chuyển người khác', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    DA_SOAN_XONG: [
      { to: 'DANG_HEN_KH', label: 'Hẹn khách ký hồ sơ', short: 'Hẹn ký', roles: ['CAN_BO_LS'], appointment: true, primary: true, rank: 1, notify: 'DANG_HEN_KH' },
      { to: 'HOAN_THANH_LS', label: 'Hoàn thành phần việc LS', short: 'Hoàn thành', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 2, notify: 'HOAN_THANH_LS' },
      { to: 'CHO_KS_DUYET', label: 'Trình kiểm soát duyệt', short: 'Trình duyệt', roles: ['CAN_BO_LS'], note: true, rank: 3 },
      { to: 'DANG_THUC_HIEN', label: 'Quay lại xử lý', short: 'Quay lại', roles: ['CAN_BO_LS'], reason: 'free', rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Đổi người xử lý', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 2, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    DANG_HEN_KH: [
      { to: 'HOAN_THANH_LS', label: 'Hoàn thành phần việc LS', short: 'Hoàn thành', roles: ['CAN_BO_LS'], note: true, primary: true, rank: 1, notify: 'HOAN_THANH_LS' },
      { to: 'CHO_KS_DUYET', label: 'Trình kiểm soát duyệt', short: 'Trình duyệt', roles: ['CAN_BO_LS'], note: true, rank: 2 },
      { to: 'DANG_THUC_HIEN', label: 'Quay lại xử lý', short: 'Quay lại', roles: ['CAN_BO_LS'], reason: 'free', rank: 8 },
      { to: 'TAM_DUNG', label: 'Tạm dừng', short: 'Tạm dừng', roles: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'], reason: 'TAM_DUNG', rank: 8 },
      { to: 'DA_PHAN_CONG', label: 'Đổi người xử lý', short: 'Đổi người', roles: ['KS_LS', 'QUAN_LY_LS'], assignee: true, reason: 'free', rank: 3, notify: 'DOI_NGUOI' },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    CHO_KS_DUYET: [
      { to: 'HOAN_THANH_LS', label: 'Duyệt hoàn thành', short: 'Duyệt', roles: ['KS_LS', 'QUAN_LY_LS'], note: true, primary: true, rank: 1, notify: 'HOAN_THANH_LS' },
      { to: 'DANG_THUC_HIEN', label: 'Trả lại cán bộ', short: 'Trả lại', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'free', rank: 2 },
      { to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: ['KS_LS', 'QUAN_LY_LS'], reason: 'HUY', rank: 9 }
    ],
    TAM_DUNG: [
      { to: 'DANG_THUC_HIEN', label: 'Tiếp tục xử lý', short: 'Tiếp tục', roles: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'], reason: 'free', primary: true, rank: 1 },
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
          { label: 'Có ít nhất một mẫu được Zalo duyệt', ok: approved > 0, hint: 'tự tạo mẫu không đồng nghĩa đã được duyệt' }
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
    ma_viec: 'Mã việc', loai_viec: 'Loại việc', don_vi: 'Đơn vị gửi',
    han_xu_ly: 'Hạn xử lý', nguoi_giao: 'Người giao', link: 'Link đăng nhập',
    ten_khach: 'Tên khách hàng', thoi_gian: 'Thời gian hẹn', dia_diem: 'Địa điểm',
    hotline: 'Số tổng đài', ten_ngan_hang: 'Tên ngân hàng', cif: 'Mã CIF',
    san_pham: 'Tên sản phẩm', so_tien: 'Số tiền', so_dien_thoai: 'Số điện thoại',
    ngay_ky: 'Ngày ký', gio_ky: 'Giờ ký', noi_ky: 'Nơi ký', tag_can_bo: 'Thẻ cán bộ trong nhóm Zalo'
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
    DE_NGHI_SUA: 'Có đề nghị sửa chờ duyệt',
    QUA_HAN: 'Việc quá hạn xử lý',
    DANG_HEN_KH: 'Hẹn khách ký hồ sơ',
    HOAN_THANH_LS: 'Hoàn thành phần việc LS'
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
    if (channel === 'EMAIL') return /@/.test(String(rcp.email || '')) ? rcp.email : '';
    if (channel === 'TELEGRAM') return rcp.telegram || '';
    if (channel === 'GMF') return rcp.kind === 'NHOM' ? rcp.phone : '';
    if (channel === 'ZBS' || channel === 'SMS') return rcp.kind === 'KHACH' ? rcp.phone || '' : '';
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
      tag_can_bo: officerTag(item, st)
    };
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
  function queueNotifications(item, event, st, actorId) {
    // Quy tắc có điều kiện: hẹn ký báo thẳng khách hay báo qua nhóm nội bộ
    // là hai đường loại trừ nhau, không phát cả hai.
    var viaGroup = !!(item.appointment && item.appointment.via_group);
    var rules = st.notifyRules.filter(function (r) {
      if (r.event !== event || !r.enabled) return false;
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
        var key = [item.item_id, event, rule.audience, rcp.id].join(':') + bucket;
        if (U.byId(st.outbox, 'idem_key', key)) return;

        // Kênh khách chọn lúc hẹn ký chỉ áp cho chính tin hẹn ký. Không chặn theo
        // sự kiện thì một việc có lịch hẹn sẽ kéo mọi thông báo khác sang kênh đó,
        // kể cả tin nội bộ lẽ ra phải đi qua chuông trong app.
        var selected = event === 'DANG_HEN_KH' && item.appointment && !item.appointment.via_group
          ? item.appointment.channel : '';
        if (selected === 'ZALO') selected = 'ZBS';
        var candidateChannels = selected && ['EMAIL', 'ZBS', 'SMS'].indexOf(selected) !== -1 ? [selected] : rule.channels;
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
    return { backlog: backlog, failed: failed, skipped: skipped, waiting: waiting };
  }

  /* ============================ Hạn xử lý ============================ */

  function sla(item, st) {
    if (!item.due_at || !STATUS[item.status].open) return null;
    var left = new Date(item.due_at).getTime() - Date.now();
    return { due: item.due_at, left: left, late: left < 0, soon: left >= 0 && left < 2 * 3600000 };
  }

  /** Số giờ làm thực tế kể từ lúc cán bộ bấm bắt đầu xử lý hồ sơ. */
  function processingCalendar(st) {
    var base = (st && st.calendar) || {};
    // Đồng hồ khách hàng dùng giờ vận hành LS đã thống nhất, không phụ thuộc
    // SLA cũ của workbook: 07:30–11:30 và 13:30–18:00 các ngày làm việc.
    return { days: base.days || [1, 2, 3, 4, 5], open: '07:30', close: '18:00',
      breakFrom: '11:30', breakTo: '13:30', holidays: base.holidays || [] };
  }

  /** Phải khớp CLOCK_RUNNING_ trong Code.gs. */
  var CLOCK_RUNNING = ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];

  function clockPaused(item) {
    var log = (item && item.pause_log) || [];
    return !!(log.length && !log[log.length - 1][1]);
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
    if (!item || !item.processing_started_at) return null;
    var cal = processingCalendar(st);
    return Math.round(activeSpans(item, now).reduce(function (sum, s) {
      return sum + (U.workingMilliseconds(new Date(s[0]).toISOString(), new Date(s[1]).toISOString(), cal) || 0);
    }, 0) / 360000) / 10;
  }

  function processingLabel(item, st, now) {
    var h = processingHours(item, st, now);
    if (h === null) return 'Chưa bắt đầu';
    return h.toFixed(1) + ' giờ làm' + (!item.completed_at && clockPaused(item) ? ' · đang dừng' : '');
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
      var receiveHours = elapsedHours(i.submitted_at, i.accepted_at);
      var assignmentHours = elapsedHours(i.accepted_at, i.assigned_at);
      var processHours = elapsedHours(i.assigned_at, i.completed_at);
      var totalHours = elapsedHours(i.submitted_at, i.completed_at);
      // Việc đã chuyển sang kỳ sau được chấm trễ ở dòng cuối của nó, không
      // phải ở mỗi kỳ nó đi qua — nếu không một việc trễ đếm thành ba lần trễ.
      var late = i.due_at && !i.carried_to_item_id
        ? (done ? String(i.completed_at || '') > String(i.due_at) : now > String(i.due_at)) : false;
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
        bank_name: 'Ngân hàng', hotline: '1900 0000',
        app_url: 'https://script.google.com/a/macros/bank.vn/s/AKfy.../exec',
        timezone: 'Asia/Ho_Chi_Minh', week_start: 'MONDAY',
        sign_place: 'Quầy giao dịch của đơn vị gửi hồ sơ',
        retention_months: 60, export_row_limit: 5000, backlog_alert: 20,
        env: 'THU_NGHIEM', gateway_url: '', gateway_auth_ref: 'LS_GATEWAY_TOKEN', gateway_token_set: 'false'
      },

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
          needs_appointment: true, needs_ks_approval: true, active: true, checklist: [] };
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
          code: 'TPL_MAIL_HEN_KY', name: 'Email mời khách đến ký hồ sơ', channel: 'EMAIL', status: 'DA_DUYET',
          subject: 'Lịch hẹn ký hồ sơ: {{ma_viec}}',
          body: 'Kính chào {{ten_khach}},\n{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}} để hoàn tất thủ tục.\nLiên hệ {{hotline}} nếu cần đổi lịch.',
          approved_by: 'U006', approved_at: d17
        },
        {
          code: 'TPL_NHOM_GIAO', name: 'Tin nhóm nội bộ khi có việc mới', channel: 'GMF', status: 'NHAP',
          subject: '',
          body: 'Việc mới {{ma_viec}} — {{loai_viec}} từ {{don_vi}}. Hạn {{han_xu_ly}}. Chi tiết: {{link}}',
          approved_by: '', approved_at: ''
        }
      ],

      notifyRules: [
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
          checklist: [true, true, true, true], note: 'Đã hoàn tất hồ sơ trình phê duyệt.', pending: null, version: 4
        },
        {
          item_id: 'ITEM_1001B', request_id: 'REQ_1001', work_type_code: 'LEGACY_21', product_name: 'Thẻ tín dụng doanh nghiệp',
          occurrence_date: '2026-09-18', status: 'DA_SOAN_XONG', assigned_user_id: 'U003', assigned_by: 'U002',
          submitted_at: d18, accepted_at: d18, assigned_at: d18, due_at: '2026-09-18T08:00:00.000Z',
          completed_at: '', appointment: null, checklist: [true, false], note: '', pending: null, version: 2
        },
        {
          item_id: 'ITEM_1002A', request_id: 'REQ_1002', work_type_code: 'LEGACY_16', product_name: 'Thấu chi lương',
          occurrence_date: '2026-09-19', status: 'CHO_TIEP_NHAN', assigned_user_id: '', assigned_by: '',
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
        { event_id: 'EVT_03', item_id: 'ITEM_1001A', type: 'HOAN_THANH_LS', by: 'U002', at: '2026-09-19T03:15:00.000Z', reason: 'Duyệt hoàn thành sau khi khách đã ký.' },
        { event_id: 'EVT_04', item_id: 'ITEM_1002A', type: 'TAO_VIEC', by: 'U001', at: d19, reason: 'PGD Bến Thành đăng ký yêu cầu.' },
        { event_id: 'EVT_05', item_id: 'ITEM_1003A', type: 'DANG_THUC_HIEN', by: 'U004', at: d18, reason: 'Bắt đầu xử lý.' }
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
    ROLES: ROLES, SCREENS: SCREENS, STATUS: STATUS, FLOW: FLOW,
    APPT_RESULT: APPT_RESULT, EVENT_LABEL: EVENT_LABEL,
    REACH_CHANNELS: REACH_CHANNELS, customerReach: customerReach,
    signPlace: signPlace, nextSlot: nextSlot, officerTag: officerTag,
    CHANNELS: CHANNELS, CHANNEL_STATUS: CHANNEL_STATUS,
    addressFor: addressFor, templateFor: templateFor, emailUsedToday: emailUsedToday,
    REPORT_PRESETS: REPORT_PRESETS, presetRange: presetRange, monthsInRange: monthsInRange,
    reportFromItems: reportFromItems, monthKey: monthKey,
    dateOnly: dateOnly, userOff: userOff, userAvailable: userAvailable, staffWorkloadByGroup: staffWorkloadByGroup,
    VARS: VARS, FORBIDDEN: FORBIDDEN, TPL_STATUS: TPL_STATUS,
    NOTIFY_EVENTS: NOTIFY_EVENTS, AUDIENCE: AUDIENCE, OUT_STATUS: OUT_STATUS,
    label: label, tone: tone,
    channelReady: channelReady, channelUsable: channelUsable,
    usedVars: usedVars, checkTemplate: checkTemplate, renderTemplate: renderTemplate,
    recipientsFor: recipientsFor, contextFor: contextFor,
    queueNotifications: queueNotifications, dispatch: dispatch, outboxHealth: outboxHealth,
    sla: sla, processingCalendar: processingCalendar, processingHours: processingHours, processingLabel: processingLabel, activeSpans: activeSpans, applyClock: applyClock, clockPaused: clockPaused, dueFrom: dueFrom,
    seed: seed
  };
})();
