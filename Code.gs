/**
 * Code.gs — API phía máy chủ.
 *
 * Nguyên tắc: quyền và luật chuyển trạng thái được kiểm tại đây.
 * Giao diện ẩn nút chỉ để đỡ rối mắt, không phải là kiểm soát.
 * Tên trường và mã trạng thái giữ đúng như js/app.js để hai bên không lệch nhau.
 */

function doGet(e) {
  var output = HtmlService.createHtmlOutputFromFile('Index.gas');
  if (e && e.parameter && e.parameter.download === 'firefox') {
    return HtmlService.createHtmlOutput(firefoxDownloadHtml_(output.getContent()))
      .setTitle('Tải LS-Routing cho Firefox').addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }
  return output
    .setTitle('LS-Routing — Hỗ trợ tín dụng LS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function firefoxDownloadHtml_(bundle) {
  var match = /window\.LS_FIREFOX_PACKAGE=(\{[^\r\n]+?\});/.exec(bundle);
  if (!match) throw new Error('Gói Firefox chưa được đóng gói.');
  var pack = JSON.parse(match[1]);
  if (!/^\d+\.\d+\.\d+$/.test(pack.version) || !/^[a-zA-Z0-9+/=]+$/.test(pack.payload) || !/^[a-f0-9]{64}$/.test(pack.sha256)) throw new Error('Gói tải không hợp lệ.');
  var signed = pack.signed === true;
  var filename = 'ls-routing-firefox-' + pack.version + (signed ? '.signed.xpi' : '.zip');
  if (pack.filename !== filename) throw new Error('Tên gói tải không hợp lệ.');
  var steps = signed
    ? '<h2>Cài cố định trên Firefox</h2><ol><li>Tải file <b>.xpi</b> ở nút trên, không giải nén.</li>' +
      '<li>Mở Firefox 140 trở lên, nhập <code>about:addons</code> trên thanh địa chỉ.</li>' +
      '<li>Bấm biểu tượng bánh răng, chọn <b>Install Add-on From File…</b> (Cài tiện ích từ tập tin), chọn file XPI vừa tải.</li>' +
      '<li>Xem quyền được yêu cầu và chọn <b>Add</b> (Thêm). Ghim biểu tượng LS-Routing lên thanh công cụ.</li>' +
      '<li>Mở hoặc tải lại LS-Routing, đăng nhập Quản lý LS hoặc Kiểm soát LS để kết nối thông báo.</li></ol>' +
      '<p><b>Bản đã ký Mozilla.</b> Cài một lần, không cần cài lại khi khởi động Firefox.</p>'
    : '<h2>Cài bản dùng thử</h2><ol><li>Tải và giải nén gói ZIP.</li><li>Mở <code>about:debugging#/runtime/this-firefox</code> trên Firefox 140 trở lên.</li>' +
      '<li>Chọn <b>Load Temporary Add-on…</b>, chọn <code>manifest.json</code> trong thư mục vừa giải nén.</li>' +
      '<li>Mở hoặc tải lại LS-Routing, đăng nhập QL/KS LS; ghim biểu tượng extension lên thanh công cụ.</li></ol>' +
      '<p><b>Gói chưa ký Mozilla.</b> Bản cài tạm mất khi khởi động lại Firefox. Để cài cố định, tải ZIP lên <a href="https://addons.mozilla.org/developers/">Mozilla Developer Hub</a>, chọn phân phối <b>On your own</b> và nhận XPI đã ký.</p>';
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><base target="_blank">' +
    '<style>body{max-width:640px;margin:50px auto;padding:24px;font:16px/1.6 system-ui;color:#183b33;background:#fafcfb}a.button{display:inline-block;background:#006b58;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none}li{margin:10px 0}code{word-break:break-all}small{color:#587068}</style></head><body>' +
    '<h1>LS-Routing cho Firefox</h1><p>Dành cho Quản lý LS và Kiểm soát LS. Báo hồ sơ mới chờ phân công, tự kiểm tra mỗi phút.</p>' +
    '<a class="button" download="' + filename + '" href="data:application/octet-stream;base64,' + pack.payload + '">Tải extension ' + pack.version + (signed ? ' (XPI đã ký)' : ' (ZIP)') + '</a>' + steps +
    '<p>Firefox phải đang chạy để nhận thông báo. Phiên đăng nhập hết hạn hoặc đăng xuất thì cần đăng nhập lại ứng dụng.</p>' +
    '<small>SHA-256: <code>' + pack.sha256 + '</code></small></body></html>';
}

/** Extension chỉ đọc tín hiệu chờ phân công; không cung cấp API nghiệp vụ qua HTTP. */
function doPost(e) {
  var previous = REQUEST_, result;
  try {
    var text = e && e.postData && e.postData.contents || '';
    if (text.length > 4096) throw new Error('INVALID');
    var req = JSON.parse(text);
    if (req.action !== 'assignment_queue' || !/^qe1_[a-f0-9]{64}$/.test(String(req.token || ''))) throw new Error('INVALID');
    var raw = PropertiesService.getScriptProperties().getProperty(EXTENSION_PREFIX_ + req.token);
    var link = raw ? JSON.parse(raw) : null;
    if (!link || Number(link.exp) <= Date.now() || sessionUserId_(link.s) !== link.u) throw new Error('SESSION');
    REQUEST_ = { token: link.s };
    var u = DataRepository.find('Users', 'user_id', link.u);
    if (!u || !truthy_(u.is_active) || ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1 || truthy_(u.must_change_password)) throw new Error('FORBIDDEN');
    result = { ok: true, data: assignmentQueueSignal_(), user_id: u.user_id, role: u.role, expires_at: link.exp };
  } catch (err) {
    var code = String(err.message || '');
    if (code.indexOf('LS_SESSION:') === 0) code = 'SESSION';
    result = { ok: false, code: ['INVALID', 'SESSION', 'FORBIDDEN'].indexOf(code) !== -1 ? code : 'UNAVAILABLE' };
  } finally { REQUEST_ = previous; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

var EXTENSION_PREFIX_ = 'LS_EXT_';

function extensionToken_(session) {
  return 'qe1_' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'LS_QUEUE_EXT_V1_' + session, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function connectFirefoxExtension() {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được nhận thông báo phân công.');
  var session = REQUEST_ && REQUEST_.token;
  if (!session || sessionUserId_(session) !== u.user_id) throw new Error('LS_SESSION: Hãy đăng nhập lại.');
  var props = PropertiesService.getScriptProperties();
  var record = JSON.parse(props.getProperty(SESSION_PREFIX_ + session) || '{}');
  if (!record.exp || record.exp <= Date.now()) throw new Error('LS_SESSION: Hãy đăng nhập lại.');
  var token = extensionToken_(session), key = EXTENSION_PREFIX_ + token;
  if (!props.getProperty(key)) props.setProperty(key, JSON.stringify({ s: session, u: u.user_id, exp: record.exp }));
  return { token: token, user_id: u.user_id, role: u.role, expires_at: record.exp };
}

/** `waiting` drives the total badge; `notify_waiting` contains today's occurrence dates only. */
function assignmentQueueSignal_() {
  var plan = activePlan_(), pending = {}, occurringToday = {}, today = localBusinessDate_();
  DataRepository.getAll('WorkItems').forEach(function (i) {
    if (i.period_id !== plan.period_id || i.carried_to_item_id || i.assigned_user_id ||
        ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN'].indexOf(i.status) === -1) return;
    var key = String(i.request_id || i.item_id);
    var submittedAt = String(i.submitted_at || i.created_at || '');
    var token = String(i.item_id) + ':' + submittedAt;
    if (!pending[key]) pending[key] = [];
    pending[key].push(token);
    if (String(i.occurrence_date || '').substring(0, 10) === today) {
      if (!occurringToday[key]) occurringToday[key] = [];
      occurringToday[key].push(token);
    }
  });
  function rows_(source) {
    return Object.keys(source).sort().map(function (key) { return { key: key, stamp: source[key].sort().join('|') }; });
  }
  var waiting = rows_(pending), notifyWaiting = rows_(occurringToday);
  return { period_id: plan.period_id, count: waiting.length, waiting: waiting, notify_waiting: notifyWaiting,
    notification_day: today, checked_at: Date.now() };
}

/** Ngày nghiệp vụ là ngày lịch, không đổi theo múi giờ hay thời điểm phân công. */
function requestedDate_(value) {
  var s = String(value || '').trim(), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error('Thiếu hoặc sai ngày KH đề nghị.');
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error('Ngày KH đề nghị không hợp lệ.');
  }
  return s;
}

/**
 * Luồng chính: Phòng/PGD tạo việc (CHO_PHAN_CONG) → KS/Quản lý LS phân công
 * (DA_PHAN_CONG) → cán bộ LS tiếp nhận hồ sơ (DANG_THUC_HIEN) → hẹn khách ký
 * (DANG_HEN_KH) → hoàn thành. Không có bước trình/duyệt.
 * CHO_HOAN_THIEN, CHO_TIEP_NHAN, DA_SOAN_XONG, CHO_KS_DUYET là mã cũ: không bước nào
 * đưa hồ sơ vào nữa, chỉ giữ lối ra cho hồ sơ tạo trước khi rút gọn luồng.
 */
var FLOW_SERVER = {
  CHO_PHAN_CONG: {
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    CAN_BO_SUNG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  CAN_BO_SUNG: {
    CHO_PHAN_CONG: ['PHONG_PGD'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  CHUA_GIAO_HO_SO: {
    CHO_PHAN_CONG: ['PHONG_PGD'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  DA_PHAN_CONG: {
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'PHONG_PGD'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  DANG_THUC_HIEN: {
    DANG_HEN_KH: ['CAN_BO_LS'],
    HOAN_THANH_LS: ['CAN_BO_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'PHONG_PGD'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  DANG_HEN_KH: {
    HOAN_THANH_LS: ['CAN_BO_LS'],
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'PHONG_PGD'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },

  // ---- Mã cũ: chỉ còn lối ra ----
  CHO_HOAN_THIEN: {
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    CAN_BO_SUNG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['PHONG_PGD', 'KS_LS', 'QUAN_LY_LS']
  },
  CHO_TIEP_NHAN: {
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    CAN_BO_SUNG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  DA_SOAN_XONG: {
    DANG_HEN_KH: ['CAN_BO_LS'],
    HOAN_THANH_LS: ['CAN_BO_LS'],
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  CHO_KS_DUYET: {
    HOAN_THANH_LS: ['KS_LS', 'QUAN_LY_LS'],
    DANG_THUC_HIEN: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  // Cán bộ LS đang giữ hồ sơ được tạm dừng/tiếp tục; Phòng/PGD tạo đề nghị chỉ được tạm dừng hồ sơ của mình.
  // Kiểm soát/quản lý chỉ đổi người hoặc hủy hồ sơ đang dừng.
  TAM_DUNG: {
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  HOAN_THANH_LS: { DANG_THUC_HIEN: ['KS_LS', 'QUAN_LY_LS'] },
  HUY: {}
};

/**
 * Bảng mà lượt ghi hồ sơ sẽ chạm tới, đọc sẵn NGOÀI khóa ghi (xem mục 5 trong
 * DataRepository.gs). Trong khóa chỉ còn đọc đúng dòng hồ sơ và phần đuôi mới,
 * nên người sửa hồ sơ này không phải chờ người khác đọc trọn bảng.
 */
var ITEM_WARM_ = { warm: ['WorkItems', 'Requests', 'WorkTypes', 'Users', 'Settings'], append: ['Events'] };
var NOTIFY_WARM_ = {
  warm: ITEM_WARM_.warm.concat(['Units', 'NotifyRules', 'Templates', 'Channels', 'MonthlyPlans', 'NotificationIdempotency']),
  append: ['Events', 'Inbox', 'NotificationOutbox', 'NotificationMetrics']
};

var OPEN_STATUS = ['CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CAN_BO_SUNG', 'CHUA_GIAO_HO_SO', 'CHO_PHAN_CONG', 'DA_PHAN_CONG',
  'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'CHO_KS_DUYET', 'TAM_DUNG'];

/** Sự kiện phát cho bộ máy thông báo sau khi trạng thái đã được ghi. */
var NOTIFY_ON = {
  DA_PHAN_CONG: 'DA_PHAN_CONG',
  CAN_BO_SUNG: 'CAN_BO_SUNG',
  DANG_HEN_KH: 'DANG_HEN_KH',
  HOAN_THANH_LS: 'HOAN_THANH_LS'
};

/**
 * Trạng thái đang chờ bên ngoài (khách lên ký, chờ bổ sung, chờ cấp phê duyệt):
 * hạn xử lý đứng yên, không tính quá hạn; khi ra khỏi trạng thái này hạn được
 * lùi đúng số giờ làm đã chờ. Khớp SLA_PAUSED trong js/domain.js.
 */
var SLA_PAUSED_STATUS = ['TAM_DUNG', 'DANG_HEN_KH', 'CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'];
var REQUESTOR_RESEND_STATUS = ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'];

/** HĐTC miễn tính quá hạn theo cả nhóm việc chính, việc kèm và dòng chuyển kỳ. */
function slaExemptByItem_(items, workTypes) {
  items = items || [];
  var types = {};
  (workTypes || []).forEach(function (wt) { types[wt.type_code || wt.code] = wt; });
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
    var wt = types[item.work_type_code];
    var steps = collateralStepKeys_(wt, item), drafts = draftContractPartKeys_(wt, item);
    if (steps.indexOf('HD_THE_CHAP') !== -1 || drafts.indexOf('HD_THE_CHAP') !== -1) exemptRoots[find(item.item_id)] = true;
  });
  var out = {};
  items.forEach(function (item) {
    if (item && item.item_id && exemptRoots[find(item.item_id)]) out[item.item_id] = true;
  });
  return out;
}

function slaExemptItem_(item, noFaultByItem) {
  return !!(item && (item.sla_no_fault === true || (noFaultByItem && noFaultByItem[item.item_id])));
}

/**
 * Bước chuyển bắt buộc lý do — khớp các bước có `reason` trong FLOW của
 * js/domain.js. Giao diện hỏi lý do chưa đủ: máy chủ phải chặn lời gọi thiếu.
 */
function reasonRequired_(from, to) {
  if (['CAN_BO_SUNG', 'HUY'].indexOf(to) !== -1) return true;
  // Gửi lại sau khi Phòng/PGD chọn ngày không cần nhập lại lý do.
  if (to === 'CHO_PHAN_CONG') return false;
  if (to === 'DA_PHAN_CONG') return ['CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CHO_PHAN_CONG'].indexOf(from) === -1; // đổi người
  if (to === 'DANG_THUC_HIEN') return from !== 'DA_PHAN_CONG'; // quay lại, trả lại, tiếp tục, mở lại
  return false;
}

/** Việc đang mở, có hạn, không ở trạng thái chờ bên ngoài và đã qua hạn. Dòng gốc đã chuyển tháng không tính. */
function isLateOpen_(item, nowMs, noFaultByItem) {
  return OPEN_STATUS.indexOf(item.status) !== -1 && SLA_PAUSED_STATUS.indexOf(item.status) === -1 && !item.carried_to_item_id &&
    !slaExemptItem_(item, noFaultByItem) && !!item.due_at && nowMs > new Date(item.due_at).getTime();
}

/* ---------------------------- Danh tính ---------------------------- */

function passwordHash_(password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password || ''), Utilities.Charset.UTF_8);
  return 'sha256:' + Utilities.base64Encode(bytes);
}

// Google Sheets trả checkbox là boolean, còn dữ liệu nhập từ CSV/TSV thường
// thành "TRUE"/"1". Mọi điểm kiểm quyền phải dùng cùng một bộ đọc cờ, nếu
// không cán bộ đang hoạt động có thể bị từ chối khi phân công.
function truthy_(value) {
  if (value === true) return true;
  var normalized = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
}

function dateOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  var match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function userOff_(user, onDate) {
  if (!user) return false;
  var status = String(user.availability_status || 'AVAILABLE').trim().toUpperCase();
  var from = dateOnly_(user.off_from), to = dateOnly_(user.off_to);
  if (status !== 'OFF' && !from && !to) return false;
  var day = dateOnly_(onDate || new Date());
  return !!day && (!from || day >= from) && (!to || day <= to);
}

function normalizePhone_(value, legacyStorage) {
  var s = String(value === null || value === undefined ? '' : value).trim().replace(/[\s().-]/g,'');
  if ((typeof value === 'number' || legacyStorage === true) && /^([35789]\d{8}|2\d{9})$/.test(s)) s = '0' + s;
  return s.replace(/^(?:\+84|0084|84)([35789]\d{8})$/,'0$1');
}
function validatePhone_(value) {
  var s = normalizePhone_(value);
  if (s && !/^(?:0\d{9,10}|\+[1-9]\d{7,14})$/.test(s)) throw new Error('Số điện thoại không hợp lệ; kiểm tra số 0 đầu hoặc mã quốc gia.');
  return s;
}
function validateEmail_(value) {
  var s = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Địa chỉ email không hợp lệ.');
  return s;
}
function notificationDateTime_(value) {
  var at = value ? new Date(value).getTime() : NaN;
  if(!isFinite(at)) return '';
  var s = new Date(at+7*3600000).toISOString();
  return s.substring(8,10)+'/'+s.substring(5,7)+'/'+s.substring(0,4)+' '+s.substring(11,16);
}

function userAvailableForAssignment_(user, onDate) {
  return !!(user && String(user.role || '').trim().toUpperCase() === 'CAN_BO_LS' && truthy_(user.is_active) && !userOff_(user, onDate));
}

function authGroup_(user) {
  return user.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL';
}

function activeUserById_(id) {
  if (!id) return null;
  var found = DataRepository.find('Users', 'user_id', id);
  if (!found) return null;
  if (!truthy_(found.is_active)) throw new Error('Tài khoản đang bị khóa.');
  requireRole_(found.role);
  return found;
}

/* ---------------------------- Phiên đăng nhập ---------------------------- */

/**
 * Webapp chạy dưới tài khoản người triển khai, nên UserProperties là MỘT ô chung
 * cho mọi người dùng: ai đăng nhập sau sẽ chiếm phiên của người trước, và thao
 * tác của A bị ghi dưới tên B. Mỗi trình duyệt vì vậy giữ một mã phiên riêng,
 * gửi kèm mọi lần gọi qua `api()`; máy chủ tra mã đó ra người dùng.
 */
var SESSION_TTL_MS_ = 12 * 3600 * 1000;
var SESSION_PREFIX_ = 'LS_SESS_';
var REQUEST_ = null;   // { token, op_id } của lượt gọi hiện tại, op_id chỉ có ở lệnh ghi từ api().

function sessionCache_() {
  try { return CacheService.getScriptCache(); } catch (ignore) { return null; }
}

function createSession_(userId) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  var record = JSON.stringify({ u: String(userId), exp: Date.now() + SESSION_TTL_MS_ });
  PropertiesService.getScriptProperties().setProperty(SESSION_PREFIX_ + token, record);
  var sc = sessionCache_();
  if (sc) { try { sc.put(SESSION_PREFIX_ + token, record, 21600); } catch (ignore) {} }
  pruneSessions_(false);
  return token;
}

function endSession_(token) {
  if (!token) return;
  try { PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX_ + token); } catch (ignore) {}
  try { PropertiesService.getScriptProperties().deleteProperty(EXTENSION_PREFIX_ + extensionToken_(token)); } catch (ignore) {}
  var sc = sessionCache_();
  if (sc) { try { sc.remove(SESSION_PREFIX_ + token); } catch (ignore) {} }
}

function sessionUserId_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  var key = SESSION_PREFIX_ + token, sc = sessionCache_(), raw = null;
  if (sc) { try { raw = sc.get(key); } catch (ignore) {} }
  if (!raw) {
    raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw && sc) { try { sc.put(key, raw, 21600); } catch (ignore) {} }
  }
  if (!raw) return null;
  var record = null;
  try { record = JSON.parse(raw); } catch (ignore) {}
  if (!record || !record.u || Date.now() > Number(record.exp)) { endSession_(token); return null; }
  return record.u;
}

/** Dọn phiên hết hạn. Gọi rải rác lúc đăng nhập và mỗi ngày ở maintenance. */
function pruneSessions_(force) {
  if (!force && Math.random() > 0.2) return 0;
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now(), removed = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(SESSION_PREFIX_) !== 0 && key.indexOf(EXTENSION_PREFIX_) !== 0) return;
    var exp = 0;
    try { exp = Number(JSON.parse(all[key]).exp) || 0; } catch (ignore) {}
    if (exp < now) { props.deleteProperty(key); removed++; }
  });
  return removed;
}

/**
 * Danh tính nghiệp vụ lấy từ mã phiên của trình duyệt (qua `api()`). Tài khoản
 * Google chỉ còn là đường dự phòng cho Phòng/PGD đã liên kết email.
 */
function currentUser_() {
  var token = REQUEST_ && REQUEST_.token;
  if (token) {
    var userId = sessionUserId_(token);
    if (!userId) throw new Error('LS_SESSION: Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    var byCode = activeUserById_(userId);
    if (byCode) return byCode;
    throw new Error('LS_SESSION: Tài khoản không còn trong hệ thống. Hãy đăng nhập lại.');
  }

  var email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Hãy nhập mã cán bộ để đăng nhập.');
  var users = DataRepository.getAll('Users');
  var normalizedEmail = email.toLowerCase();
  // linked_email là địa chỉ Google dùng nhận diện tài khoản. Các user cũ chưa
  // có cột này tiếp tục dùng email hiện có cho tới khi được nhập liên kết riêng.
  var u = users.filter(function (x) {
    return String(x.linked_email || '').trim().toLowerCase() === normalizedEmail;
  })[0] || users.filter(function (x) {
    return !String(x.linked_email || '').trim() && String(x.email || '').trim().toLowerCase() === normalizedEmail;
  })[0] || null;
  if (!u) throw new Error('Mã cán bộ chưa được cấp quyền vào hệ thống.');
  if (!truthy_(u.is_active)) throw new Error('Tài khoản đang bị khóa.');
  requireRole_(u.role);
  if (authGroup_(u) === 'INTERNAL') throw new Error('Hãy đăng nhập bằng mã cán bộ và mật khẩu.');
  return u;
}

/**
 * Danh tính cho mọi thao tác ghi. Tài khoản còn mật khẩu tạm chỉ được đọc và đổi
 * mật khẩu; cho ghi tiếp nghĩa là cờ `must_change_password` không có tác dụng gì.
 */
function requireActor_() {
  var u = currentUser_();
  requireRole_(u.role);
  if (u.role === 'GIAM_SAT') throw new Error('Giám sát chỉ có quyền xem.');
  if (truthy_(u.must_change_password)) {
    throw new Error(u.role === 'ADMIN'
      ? 'Tài khoản quản trị đang dùng mật khẩu khởi tạo. Hãy đổi mật khẩu của chính tài khoản admin trước khi đổi quyền hoặc cấu hình người dùng.'
      : 'Hãy đổi mật khẩu tạm của chính tài khoản này trước khi thao tác.');
  }
  return u;
}

function authenticateUser(loginCode, password) {
  var code = String(loginCode || '').trim();
  if (!code) throw new Error('Nhập mã cán bộ hoặc user admin.');
  var rows = DataRepository.getAll('Users');
  var matches = rows.filter(function (row) {
    return String(row.login_code || row.user_id || '').trim().toLowerCase() === code.toLowerCase();
  });
  var user = matches[0];
  if (!user && code.toLowerCase() === 'admin') {
    user = rows.filter(function (row) { return row.role === 'ADMIN'; })[0];
  }
  if (!user) throw new Error('Mã cán bộ chưa được cấp quyền.');
  if (!truthy_(user.is_active)) throw new Error('Tài khoản đang bị khóa.');
  requireRole_(user.role);

  var group = authGroup_(user);
  if (group === 'INTERNAL') {
    var given = String(password || '');
    if (!given) throw new Error('Nhập mật khẩu cho tài khoản nội bộ.');
    var expected = String(user.password_hash || '');
    var defaultPassword = user.role === 'ADMIN' ? 'D@kl@k631' : 'D@klak631';
    if (expected) {
      if (passwordHash_(given) !== expected) throw new Error('Mật khẩu không đúng.');
    } else if (given !== defaultPassword) {
      throw new Error('Mật khẩu không đúng.');
    } else {
      DataRepository.tx(function (t) {
        var found = t.find('Users', 'user_id', user.user_id);
        if (found) t.write(found, { password_hash: passwordHash_(given), must_change_password: true });
      });
    }
  }
  var token = createSession_(user.user_id);
  REQUEST_ = { token: token };
  var snapshot = getBootstrap();
  snapshot.session_token = token;
  return snapshot;
}

/**
 * Đổi mật khẩu của chính mình. `must_change_password` được ghi từ trước nhưng
 * không có đường nào để xóa nó — nghĩa là mật khẩu khởi tạo chung dùng được mãi.
 */
function changeOwnPassword(currentPassword, nextPassword) {
  var u = currentUser_();
  if (authGroup_(u) !== 'INTERNAL') throw new Error('Tài khoản phòng/PGD không dùng mật khẩu.');

  var next = String(nextPassword || '');
  if (next.length < 8) throw new Error('Mật khẩu mới phải từ 8 ký tự.');
  if (!/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) throw new Error('Mật khẩu mới phải có cả chữ và số.');

  var expected = String(u.password_hash || '');
  var given = String(currentPassword || '');
  var defaultPassword = u.role === 'ADMIN' ? 'D@kl@k631' : 'D@klak631';
  if (expected) {
    if (passwordHash_(given) !== expected) throw new Error('Mật khẩu hiện tại không đúng.');
  } else if (given !== defaultPassword) {
    throw new Error('Mật khẩu hiện tại không đúng.');
  }
  if (passwordHash_(next) === expected) throw new Error('Mật khẩu mới phải khác mật khẩu đang dùng.');

  return DataRepository.tx(function (t) {
    var found = t.find('Users', 'user_id', u.user_id);
    if (!found) throw new Error('Không tìm thấy tài khoản.');
    t.write(found, { password_hash: passwordHash_(next), must_change_password: false });
    return { ok: true };
  });
}

/** Quản trị cấp mật khẩu tạm; người dùng bắt buộc tự đổi ở lần vào kế tiếp. */
function adminResetUserPassword(userId, nextPassword) {
  var admin = requireAdmin_();
  var targetId = String(userId || '').trim();
  var next = String(nextPassword || '');
  if (!targetId) throw new Error('Thiếu tài khoản cần đặt lại mật khẩu.');
  if (next.length < 8 || !/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) {
    throw new Error('Mật khẩu tạm phải từ 8 ký tự và có cả chữ lẫn số.');
  }
  return DataRepository.tx(function (t) {
    var found = t.find('Users', 'user_id', targetId);
    if (!found) throw new Error('Không tìm thấy tài khoản.');
    if (authGroup_(found.object) !== 'INTERNAL') throw new Error('Tài khoản Phòng/PGD không dùng mật khẩu.');
    t.write(found, { password_hash: passwordHash_(next), must_change_password: true });
    logConfig_(t, admin, 'Người dùng', 'Đặt lại mật khẩu tạm cho ' + targetId + '.');
    return { ok: true, user_id: targetId, must_change_password: true };
  });
}

function logoutUser() {
  endSession_(REQUEST_ && REQUEST_.token);
  return { ok: true };
}

/* ------------------------- Cổng gọi duy nhất từ trình duyệt ------------------------- */

var API_WRITE_ = ['createNextMonthlyPlan', 'createRequest', 'transitionItem', 'focusWorkItem', 'startGlobalPause', 'endGlobalPause', 'rescheduleItem', 'claimUpdateNotice', 'assignWorkItemsBatch', 'saveStaffAbsence',
  'confirmDossierReceipt', 'saveChecklist', 'recordWorkStep', 'saveResultFlags', 'saveWorkPlan', 'saveStaffPlan', 'closeStaffPlan', 'addLinkedItem', 'proposeRevision',
  'resolveRevision', 'adminSaveCatalog', 'adminImportUsers', 'adminSaveSettings', 'adminSaveDelivery',
  'adminSaveUpdateNotice', 'adminRunOutbox', 'confirmLegacySessionOwner', 'correctItemTimes', 'rebuildPeriodSummaries',
  'adminTestChannel', 'changeOutbox', 'changeOwnPassword', 'adminResetUserPassword', 'adminDeleteUser', 'markInboxRead', 'recordOtherWork', 'cancelOtherWork', 'addSupplementAppointment', 'requestCancel'];

function apiFunctions_() {
  return {
    authenticateUser: authenticateUser, logoutUser: logoutUser, getBootstrap: getBootstrap, connectFirefoxExtension: connectFirefoxExtension,
    getReport: getReport, getTimeReport: getTimeReport, getTeamAssignments: getTeamAssignments, getRecentCustomerAssignees: getRecentCustomerAssignees, getTimingAudit: getTimingAudit, getItemActivity: getItemActivity, getAuditLog: getAuditLog, getConfigLog: getConfigLog,
    createNextMonthlyPlan: createNextMonthlyPlan, createRequest: createRequest, transitionItem: transitionItem,
    assignWorkItemsBatch: assignWorkItemsBatch, focusWorkItem: focusWorkItem, startGlobalPause: startGlobalPause, endGlobalPause: endGlobalPause, rescheduleItem: rescheduleItem, claimUpdateNotice: claimUpdateNotice, saveStaffAbsence: saveStaffAbsence,
    confirmDossierReceipt: confirmDossierReceipt, saveChecklist: saveChecklist, recordWorkStep: recordWorkStep, saveResultFlags: saveResultFlags, saveWorkPlan: saveWorkPlan, saveStaffPlan: saveStaffPlan, closeStaffPlan: closeStaffPlan, getWorkPlanning: getWorkPlanning, addLinkedItem: addLinkedItem,
    proposeRevision: proposeRevision, resolveRevision: resolveRevision, adminSaveCatalog: adminSaveCatalog,
    adminImportUsers: adminImportUsers, adminSaveSettings: adminSaveSettings, adminSaveDelivery: adminSaveDelivery,
    adminSaveUpdateNotice: adminSaveUpdateNotice, adminRunOutbox: adminRunOutbox,
    confirmLegacySessionOwner: confirmLegacySessionOwner, correctItemTimes: correctItemTimes,
    rebuildPeriodSummaries: rebuildPeriodSummaries, adminTestChannel: adminTestChannel, changeOutbox: changeOutbox,
    changeOwnPassword: changeOwnPassword, adminResetUserPassword: adminResetUserPassword, adminDeleteUser: adminDeleteUser, markInboxRead: markInboxRead,
    requestCancel: requestCancel, recordOtherWork: recordOtherWork, cancelOtherWork: cancelOtherWork, addSupplementAppointment: addSupplementAppointment
  };
}

/**
 * req = { name, args, token, op_id }.
 * Lệnh ghi có `op_id` do trình duyệt sinh MỘT lần cho mỗi cú bấm; gửi lại cùng
 * op_id (mất mạng, HTTP 0, hết lượt chờ khóa) sẽ nhận lại đúng kết quả cũ thay
 * vì tạo thêm dòng.
 */
function api(req) {
  req = req || {};
  var name = String(req.name || '');
  var fn = apiFunctions_()[name];
  if (!fn) throw new Error('Thao tác không hợp lệ: ' + name);
  var args = Array.isArray(req.args) ? req.args : [];
  REQUEST_ = { token: String(req.token || '').toLowerCase(), op_id: String(req.op_id || '') };
  try {
    if (API_WRITE_.indexOf(name) !== -1 && req.op_id) {
      return runOnce_(String(req.op_id), function () { return fn.apply(null, args); });
    }
    return fn.apply(null, args);
  } finally {
    REQUEST_ = null;
  }
}

function opCacheKey_(opId) {
  return 'LS_OP_' + String(REQUEST_ && REQUEST_.token || 'anon').substring(0, 16) + '_' + opId;
}

/** Chạy một lệnh ghi đúng một lần cho mỗi op_id. */
function runOnce_(opId, work) {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(opId)) throw new Error('Mã thao tác không hợp lệ.');
  var sc = sessionCache_();
  if (!sc) return work();
  var key = opCacheKey_(opId);
  var state = claimOp_(sc, key);
  if (state) return awaitOp_(sc, key, state);
  try {
    var result = work();
    storeOp_(sc, key, result);
    return result;
  } catch (err) {
    // Lần chạy hỏng không ghi gì (giao dịch bỏ toàn bộ), nên cho phép thử lại.
    try { sc.remove(key); } catch (ignore) {}
    throw err;
  }
}

function claimOp_(sc, key) {
  // Khóa người dùng tách khỏi khóa dữ liệu: đoạn giữ chỉ là một get/put cache.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(8000)) throw new Error('LS_BUSY: Hệ thống đang bận, thao tác sẽ được thử lại.');
  try {
    var raw = sc.get(key);
    if (raw) return JSON.parse(raw);
    sc.put(key, JSON.stringify({ s: 'P', at: Date.now() }), 900);
    return null;
  } finally {
    lock.releaseLock();
  }
}

function storeOp_(sc, key, result) {
  try {
    var text = JSON.stringify({ s: 'D', r: result === undefined ? null : result });
    if (text.length > 95000) text = JSON.stringify({ s: 'D', r: { ok: true, partial: true } });
    sc.put(key, text, 21600);
  } catch (ignore) { /* không lưu được kết quả thì lần gửi lại sẽ gặp kiểm tra version */ }
}

function awaitOp_(sc, key, state) {
  // Chờ ngắn rồi trả LS_PENDING để trình duyệt tự thử lại: ngủ 20 giây ở đây là
  // giữ chỗ một lượt chạy GAS, mà mọi người dùng chung trần lượt chạy đồng thời.
  var until = Date.now() + 6000;
  while (state && state.s === 'P' && Date.now() < until) {
    Utilities.sleep(1000);
    var raw = sc.get(key);
    state = raw ? JSON.parse(raw) : null;
  }
  if (state && state.s === 'D') {
    var r = state.r;
    if (r && typeof r === 'object' && !Array.isArray(r)) r.replayed = true;
    return r;
  }
  throw new Error('LS_PENDING: Thao tác trước đó của bạn vẫn đang được xử lý, sẽ tự thử lại.');
}

function stamp_() { return new Date().toISOString(); }

function id_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

/** Cache chỉ tăng tốc replay; request_id bền vững chặn tạo trùng khi cache bị thu hồi. */
function requestIdForOperation_(userId, opId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'LS_CREATE_REQUEST_V1\n' + String(userId || '') + '\n' + String(opId || ''),
    Utilities.Charset.UTF_8
  );
  return 'REQ_' + digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').toUpperCase();
}

/* ---------------------------- Kỳ kế hoạch tháng ---------------------------- */

var BUSINESS_TIME_ZONE_ = 'Asia/Ho_Chi_Minh';

function localBusinessDate_(date) {
  return Utilities.formatDate(date ? new Date(date) : new Date(), BUSINESS_TIME_ZONE_, 'yyyy-MM-dd');
}

function monthKey_(date) {
  return Utilities.formatDate(date ? new Date(date) : new Date(), BUSINESS_TIME_ZONE_, 'yyyy-MM');
}

function monthBounds_(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) throw new Error('Kỳ tháng phải có dạng YYYY-MM.');
  var p = monthKey.split('-').map(Number);
  var start = new Date(p[0], p[1] - 1, 1);
  var end = new Date(p[0], p[1], 0);
  var pad = function (n) { return ('0' + n).slice(-2); };
  return {
    start_date: p[0] + '-' + pad(p[1]) + '-01',
    end_date: p[0] + '-' + pad(p[1]) + '-' + pad(end.getDate()),
    name: 'Kế hoạch tháng ' + p[1] + '/' + p[0]
  };
}

function publicMonthlyPlan_(plan) {
  return {
    period_id: plan.period_id, month_key: plan.month_key, name: plan.name,
    start_date: plan.start_date, end_date: plan.end_date, activation_at: plan.activation_at,
    status: plan.status, spreadsheet_url: plan.spreadsheet_url || '',
    created_at: plan.created_at || '', activated_at: plan.activated_at || '', archived_at: plan.archived_at || ''
  };
}

function planManager_(u) {
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Chỉ kiểm soát hoặc quản lý LS được tạo kế hoạch tháng.');
  return u;
}

/**
 * Bảo đảm có đúng một kỳ ACTIVE; kỳ soạn sẵn chỉ được kích hoạt từ ngày đầu kỳ.
 * `background` = true khi chạy từ trigger: lúc đó mới dựng workbook kế hoạch còn
 * thiếu. Người dùng đang đăng nhập không phải chờ Drive nhân bản file mẫu.
 */
function activateDueMonthlyPlans_(background) {
  var today = localBusinessDate_();
  var created = [];
  var handoffs = [];
  var activeId = DataRepository.tx(function (t) {
    var plans = t.rows('MonthlyPlans');
    if (!plans.length) {
      var key = monthKey_();
      var bounds = monthBounds_(key);
      var initial = {
        period_id: id_('PLAN'), month_key: key, name: bounds.name, start_date: bounds.start_date, end_date: bounds.end_date,
        activation_at: bounds.start_date, status: 'ACTIVE', spreadsheet_id: '', spreadsheet_url: '',
        created_by: 'SYSTEM', created_at: stamp_(), activated_at: stamp_(), archived_at: ''
      };
      t.append('MonthlyPlans', initial);
      // Gắn dữ liệu kho cũ vào kỳ đầu tiên khi nâng cấp schema, không làm mất lịch sử.
      t.rows('Requests').slice().forEach(function (r) {
        if (r.period_id) return;
        var requestFound = t.find('Requests', 'request_id', r.request_id);
        if (requestFound) t.write(requestFound, { period_id: initial.period_id, origin_request_id: r.request_id });
      });
      t.rows('WorkItems').slice().forEach(function (i) {
        if (i.period_id) return;
        var itemFound = t.find('WorkItems', 'item_id', i.item_id);
        if (itemFound) t.write(itemFound, { period_id: initial.period_id, origin_item_id: i.item_id });
      });
      created.push(initial.period_id);
      return initial.period_id;
    }

    // Sang tháng mà chưa ai bấm "Tạo tháng kế tiếp": tự mở kỳ của tháng hiện tại. Thiếu bước này
    // thì kỳ cũ đứng mãi, hồ sơ phát sinh từ ngày 1 bị gắn vào tháng trước.
    var currentKey = monthKey_();
    if (!plans.some(function (p) { return p.month_key === currentKey; }) &&
        !plans.some(function (p) { return p.status === 'ACTIVE' && String(p.end_date) >= today; })) {
      var cur = monthBounds_(currentKey);
      t.append('MonthlyPlans', {
        period_id: id_('PLAN'), month_key: currentKey, name: cur.name, start_date: cur.start_date, end_date: cur.end_date,
        activation_at: cur.start_date, status: 'SCHEDULED', spreadsheet_id: '', spreadsheet_url: '',
        created_by: 'SYSTEM', created_at: stamp_(), activated_at: '', archived_at: ''
      });
      plans = t.rows('MonthlyPlans');
    }

    var due = plans.filter(function (p) { return p.status === 'SCHEDULED' && String(p.activation_at || p.start_date) <= today; })
      .sort(function (a, b) { return String(a.activation_at).localeCompare(String(b.activation_at)); });
    due.forEach(function (next) {
      var previous = t.rows('MonthlyPlans').filter(function (p) { return p.status === 'ACTIVE' && p.period_id !== next.period_id; });
      previous.forEach(function (old) {
        handoffs.push({ from: old.period_id, to: next.period_id });
        var oldFound = t.find('MonthlyPlans', 'period_id', old.period_id);
        if (oldFound) t.write(oldFound, { status: 'ARCHIVED', archived_at: stamp_() });
      });
      var nextFound = t.find('MonthlyPlans', 'period_id', next.period_id);
      if (nextFound) t.write(nextFound, { status: 'ACTIVE', activated_at: stamp_(),
        handoff_from_period_id: previous.length ? previous[previous.length - 1].period_id : '',
        handoff_status: previous.length ? 'PENDING' : 'COMPLETED' });
    });
    // Kỳ đã có dòng nhưng chưa có kho Sheet: lần tạo trước đã hỏng giữa chừng
    // (Drive lỗi, mất quyền mở workbook mẫu). Không thử lại thì tháng đó vĩnh
    // viễn không có file kế hoạch và không có lệnh nào sửa được.
    t.rows('MonthlyPlans').forEach(function (p) {
      if (['ACTIVE', 'SCHEDULED'].indexOf(p.status) === -1) return;
      if (p.spreadsheet_id) return;
      if (created.indexOf(p.period_id) === -1) created.push(p.period_id);
    });

    var active = t.rows('MonthlyPlans').filter(function (p) { return p.status === 'ACTIVE'; })
      .sort(function (a, b) { return String(b.month_key).localeCompare(String(a.month_key)); })[0];
    // Luồng carry chạy ngoài transaction kích hoạt (có thể lỗi Drive/Sheet).
    // Mọi kỳ đã đánh dấu PENDING được đưa lại vào hàng đợi ở lần chạy sau.
    t.rows('MonthlyPlans').filter(function (p) {
      return p.handoff_status === 'PENDING' && p.handoff_from_period_id;
    }).forEach(function (p) {
      var key = p.handoff_from_period_id + '>' + p.period_id;
      if (!handoffs.some(function (x) { return x.from + '>' + x.to === key; })) {
      handoffs.push({ from: p.handoff_from_period_id, to: p.period_id });
      }
    });
    var planOrder = {};
    DataRepository.getAll('MonthlyPlans').forEach(function (p) { planOrder[p.period_id] = p.month_key || ''; });
    handoffs.sort(function (a, b) { return String(planOrder[a.to] || '').localeCompare(String(planOrder[b.to] || '')); });
    if (active) return active.period_id;
    throw new Error('Không xác định được kỳ kế hoạch đang hoạt động.');
  });
  // Tạo kho Sheet có thể chậm và có thể hỏng. Để nó ném lỗi ra ngoài là chặn
  // luôn đường đăng nhập; lần chạy kế tiếp của trigger sẽ thử lại.
  if (background) created.forEach(function (periodId) {
    try { provisionMonthlyPlanWorkbook_(periodId); }
    catch (err) { Logger.log('Chưa tạo được kho kế hoạch ' + periodId + ': ' + err); }
  });
  handoffs.forEach(function (pair) {
    // Chốt số tồn ngay trước khi chuyển tiếp; báo cáo kỳ đã đóng phải giữ số
    // việc chưa hoàn thành tại lúc chốt, dù dòng thao tác đã được thay thế.
    try { writePeriodSummary_(pair.from); }
    catch (err) {
      Logger.log('Chưa chốt được số tồn kỳ ' + pair.from + ': ' + err);
      throw new Error('Chưa chốt được số tồn kỳ ' + pair.from + '; chưa thể chuyển tiếp hồ sơ. Hãy thử lại sau.');
    }
    try { writeOperationalScoreSnapshot_(pair.from); }
    catch (scoreError) { Logger.log('Chưa chốt được điểm vận hành kỳ ' + pair.from + ': ' + scoreError); }
    carryOpenWorkToPlan_(pair.from, pair.to, { user_id: 'SYSTEM', full_name: 'Hệ thống' });
    if (background) provisionMonthlyPlanWorkbook_(pair.to);
    else markPlanDirty_(pair.to);
    DataRepository.tx(function (t) {
      var found = t.find('MonthlyPlans', 'period_id', pair.to);
      if (found && found.object.handoff_status === 'PENDING' && found.object.handoff_from_period_id === pair.from) {
        t.write(found, { handoff_status: 'COMPLETED', handoff_completed_at: stamp_() });
      }
      return true;
    });
  });
  return DataRepository.find('MonthlyPlans', 'period_id', activeId);
}

/**
 * Đường nhanh cho mọi lượt tải/ghi: đọc MonthlyPlans (có cache) không cần khóa.
 * Chỉ khi thật sự có kỳ đến hạn kích hoạt mới đi vào đường giữ khóa.
 */
function activePlan_() {
  var today = localBusinessDate_();
  var plans = DataRepository.getAll('MonthlyPlans');
  // Kỳ đang hoạt động đã hết (sang tháng mới) cũng phải vào đường khóa để mở kỳ mới.
  var due = !plans.length || plans.some(function (p) {
    return p.status === 'SCHEDULED' && String(p.activation_at || p.start_date) <= today;
  }) || !plans.some(function (p) { return p.status === 'ACTIVE' && String(p.end_date) >= today; });
  if (!due) {
    var active = plans.filter(function (p) { return p.status === 'ACTIVE'; })
      .sort(function (a, b) { return String(b.month_key).localeCompare(String(a.month_key)); })[0];
    if (active) return active;
  }
  return activateDueMonthlyPlans_(false);
}

/** Trigger-safe entry point: Apps Script gọi định kỳ để tự kích hoạt kỳ đến hạn. */
function activateMonthlyPlans() {
  requireAdmin_();
  return activateMonthlyPlans_();
}

function activateMonthlyPlans_() {
  ensureRuntimeSchema_();
  var active = activateDueMonthlyPlans_(true);
  refreshMonthlyTimeSheets_();
  return publicMonthlyPlan_(active);
}

/**
 * Khởi tạo kỳ kế hoạch đầu tiên và kho Sheet của nó, gọi tay từ trình soạn thảo
 * Apps Script sau khi chạy `setupSheetDB()`.
 *
 * Kỳ đầu tiên vẫn tự sinh ở lần đăng nhập đầu hoặc ở lượt trigger hằng giờ, nên
 * hàm này không bắt buộc. Nó tồn tại để người triển khai chủ động dựng file kế
 * hoạch và **đọc được lỗi ngay** thay vì để người dùng đầu tiên chịu một lần
 * đăng nhập kéo dài hoặc một kỳ không có kho Sheet mà không biết vì sao.
 *
 * Chạy lại bao nhiêu lần cũng được: đã có kỳ thì không tạo thêm, đã có kho Sheet
 * thì chỉ đồng bộ lại.
 */
function setupFirstMonthlyPlan() {
  requireAdmin_();
  var plan = activateDueMonthlyPlans_();
  if (!plan.spreadsheet_id) {
    // Lần này không nuốt lỗi: người chạy cần biết vì sao không tạo được file.
    provisionMonthlyPlanWorkbook_(plan.period_id);
    plan = DataRepository.find('MonthlyPlans', 'period_id', plan.period_id);
  } else {
    syncMonthlyPlanWorkbook_(plan.period_id);
  }
  var result = {
    period_id: plan.period_id, month_key: plan.month_key, name: plan.name,
    status: plan.status, url: plan.spreadsheet_url || ''
  };
  Logger.log(JSON.stringify(result));
  notify_('Kỳ kế hoạch đang hoạt động: ' + plan.name + '\nKho Sheet: ' + (plan.spreadsheet_url || 'chưa tạo được'));
  return result;
}

/**
 * Đổi hoặc bỏ workbook mẫu dùng để dựng file kế hoạch tháng.
 *
 *   usePlanTemplate('1AbC...')  nhân bản workbook mẫu đó cho mỗi kỳ
 *   usePlanTemplate('')         tạo file kế hoạch trống, không nhân bản mẫu
 *
 * Chỉ quản trị đã đăng nhập và đổi mật khẩu tạm được thay đổi cấu hình này.
 */
function usePlanTemplate(spreadsheetId) {
  var u = requireAdmin_();
  var actor = u.user_id;
  var id = String(spreadsheetId || '').trim();

  // Khai một mã thì phải mở được ngay, đừng để lỗi nổ ở lần dựng kỳ kế tiếp.
  if (id) {
    try { DriveApp.getFileById(id).getName(); }
    catch (err) {
      throw new Error('Không mở được ' + id + ' bằng tài khoản ' +
        actor + '. ' + err.message);
    }
  }

  DataRepository.tx(function (t) {
    var found = t.find('Settings', 'key', 'source_template_spreadsheet_id');
    var fields = { value: id, updated_at: stamp_() };
    if (found) t.write(found, fields);
    else t.append('Settings', { key: 'source_template_spreadsheet_id', value: id, description: 'ID workbook mẫu kế hoạch tháng', updated_at: fields.updated_at });
    logConfig_(t, u, 'Kế hoạch tháng', id ? 'Dùng workbook mẫu ' + id + '.' : 'Bỏ workbook mẫu; kế hoạch tháng sẽ tạo file trống.');
    return true;
  });

  var result = { source_template_spreadsheet_id: id,
    note: id ? 'Mỗi kỳ sẽ nhân bản workbook mẫu này.' : 'Mỗi kỳ sẽ tạo file kế hoạch trống.' };
  Logger.log(JSON.stringify(result));
  return result;
}

/** KS tạo trước đúng tháng kế tiếp; dữ liệu toàn hệ thống chưa chuyển cho tới activation_at. */
function createNextMonthlyPlan() {
  var u = planManager_(requireActor_());
  var active = activePlan_();
  var start = new Date(String(active.start_date) + 'T12:00:00');
  var nextKey = monthKey_(new Date(start.getFullYear(), start.getMonth() + 1, 1));
  var bounds = monthBounds_(nextKey);
  var plan = DataRepository.tx(function (t) {
    var exists = t.rows('MonthlyPlans').filter(function (p) { return p.month_key === nextKey; })[0];
    if (exists) throw new Error('Kế hoạch ' + nextKey + ' đã được tạo trước đó.');
    var created = {
      period_id: id_('PLAN'), month_key: nextKey, name: bounds.name, start_date: bounds.start_date, end_date: bounds.end_date,
      activation_at: bounds.start_date, status: 'SCHEDULED', spreadsheet_id: '', spreadsheet_url: '',
      created_by: u.user_id, created_at: stamp_(), activated_at: '', archived_at: ''
    };
    t.append('MonthlyPlans', created);
    logConfig_(t, u, 'Kế hoạch tháng', 'Tạo trước ' + nextKey + '; tự kích hoạt từ ' + bounds.start_date + '.');
    return created;
  });
  provisionMonthlyPlanWorkbook_(plan.period_id);
  // Không chuyển tiếp ở đây. Chuyển ngay lúc tạo trước thì mọi việc đang mở của tháng hiện tại
  // bị đánh dấu đã chuyển: biến khỏi màn hình và bị khóa thao tác cho tới ngày đầu tháng sau.
  // Việc đang mở được chuyển đúng lúc kỳ mới kích hoạt (activateDueMonthlyPlans_).
  return publicMonthlyPlan_(DataRepository.find('MonthlyPlans', 'period_id', plan.period_id));
}

function createMonthlyPlanWorkbook_(plan) {
  var bounds = monthBounds_(plan.month_key);
  var settings = {};
  DataRepository.getAll('Settings').forEach(function (row) { settings[row.key] = row.value; });
  var name = 'KẾ HOẠCH HỖ TRỢ TÍN DỤNG T' + Number(plan.month_key.substring(5)) + '.' + plan.month_key.substring(0, 4);
  var ss;
  var templateId = String(settings.source_template_spreadsheet_id || '').trim();
  if (templateId) {
    // Không tự rơi về file trống: workbook mẫu mang toàn bộ tab từng phòng, công
    // thức và dropdown của kế hoạch. Lặng lẽ tạo file trống thay thế là đánh tráo
    // một thứ khác hẳn rồi báo thành công.
    var copy;
    try {
      copy = DriveApp.getFileById(templateId).makeCopy(name);
    } catch (err) {
      throw new Error(
        'Không mở được workbook mẫu ' + templateId + ' bằng tài khoản ' +
        (Session.getEffectiveUser().getEmail() || 'đang chạy script') + '. ' +
        'Chia sẻ file mẫu cho tài khoản này, hoặc chạy usePlanTemplate("") để tạo file kế hoạch trống ' +
        'thay vì nhân bản mẫu. Lỗi gốc: ' + err.message);
    }
    ss = SpreadsheetApp.openById(copy.getId());
  } else {
    ss = SpreadsheetApp.create(name);
  }
  var summary = ss.getSheets()[0];
  if (!ss.getSheetByName('Tổng hợp')) summary.setName('Tổng hợp');
  summary = ss.getSheetByName('Tổng hợp');
  repairMonthlySummaryFormulas_(ss);
  summary.getRange(1, 1, 3, 1).setValues([[plan.name], ['Kỳ: ' + bounds.start_date + ' đến ' + bounds.end_date], ['Dữ liệu được đồng bộ từ LS-Routing']]);
  var units = DataRepository.getAll('Units').filter(function (u) { return String(u.is_active) === 'true' && u.kind === 'DON_VI_GUI'; });
  units.forEach(function (u) { if (!ss.getSheetByName(u.source_tab || u.name || u.unit_id)) ss.insertSheet(u.source_tab || u.name || u.unit_id); });
  if (!ss.getSheetByName('Danh mục')) ss.insertSheet('Danh mục');
  return { spreadsheet_id: ss.getId(), spreadsheet_url: ss.getUrl() };
}

/** Không để mẫu tổng hợp sinh #DIV/0! khi kỳ chưa có việc. */
function repairMonthlySummaryFormulas_(ss) {
  var summary = ss.getSheetByName('Tổng hợp');
  if (!summary) return 0;
  var fixed = 0;
  var total = summary.getRange('H48');
  if (total.getFormula() === '=SUM(I48:P48)') {
    total.setFormula('=IF($Q$49=0,"Chưa có dữ liệu",SUM(I48:P48))');
    fixed++;
  }
  var cells = summary.getRange('I48:P48');
  var formulas = cells.getFormulas()[0];
  formulas.forEach(function (formula, index) {
    var column = String.fromCharCode('I'.charCodeAt(0) + index);
    if (formula === '=' + column + '49/$Q$49') {
      formulas[index] = '=IF($Q$49=0,"Chưa có dữ liệu",' + column + '49/$Q$49)';
      fixed++;
    }
  });
  if (fixed) cells.setFormulas([formulas]);
  return fixed;
}

function provisionMonthlyPlanWorkbook_(periodId) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan) throw new Error('Không tìm thấy kỳ kế hoạch ' + periodId + '.');
  if (!plan.spreadsheet_id) {
    var book = createMonthlyPlanWorkbook_(plan);
    DataRepository.tx(function (t) {
      var found = t.find('MonthlyPlans', 'period_id', periodId);
      if (found && !found.object.spreadsheet_id) t.write(found, book);
    });
  }
  markPlanDirty_(periodId);
}

/* ---------------- Hàng chờ đồng bộ Sheet kế hoạch (chạy nền) ---------------- */

/**
 * Ghi lại toàn bộ workbook kế hoạch mất hàng chục giây. Trước đây mỗi cú bấm
 * (kể cả tích checklist) đều chờ việc này, trong khi giữ khóa chung — 60 người
 * dùng là hàng đợi khóa dài hơn 20 giây và lỗi HTTP 0. Nay thao tác chỉ đánh dấu
 * "kỳ cần đồng bộ"; trigger `planSyncTick_` (5 phút) đồng bộ lần lượt từng kỳ.
 * Ứng dụng là nguồn dữ liệu gốc; Sheet kế hoạch là bản chiếu có thể trễ vài phút.
 */
var PLAN_DIRTY_PREFIX_ = 'LS_PLAN_DIRTY_';
var PLAN_SUMMARY_PREFIX_ = 'LS_PLAN_SUMMARY_';
var PLAN_SYNC_HELD_ = false;

function log_(message) {
  try { Logger.log(message); } catch (ignore) {}
}

/** Không bao giờ ném lỗi: thao tác nghiệp vụ đã ghi xong trước khi gọi hàm này. */
function markPlanDirty_(periodId, withSummary) {
  if (!periodId) return;
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(PLAN_DIRTY_PREFIX_ + periodId, String(Date.now()));
    if (withSummary) props.setProperty(PLAN_SUMMARY_PREFIX_ + periodId, String(Date.now()));
  } catch (err) {
    log_('Không đánh dấu được kỳ cần đồng bộ ' + periodId + ': ' + err);
  }
}

/** Chỉ một lượt đồng bộ Sheet kế hoạch chạy tại một thời điểm; không giữ khóa dữ liệu. */
function withPlanSyncMutex_(work) {
  if (PLAN_SYNC_HELD_) return work();
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, skipped: true, reason: 'sync_in_progress' };
  try {
    var running = Number(props.getProperty('LS_PLAN_SYNC_AT')) || 0;
    if (running && Date.now() - running < 330000) return { ok: false, skipped: true, reason: 'sync_in_progress' };
    props.setProperty('LS_PLAN_SYNC_AT', String(Date.now()));
  } finally {
    lock.releaseLock();
  }
  PLAN_SYNC_HELD_ = true;
  try {
    return work();
  } finally {
    PLAN_SYNC_HELD_ = false;
    try { props.deleteProperty('LS_PLAN_SYNC_AT'); } catch (ignore) {}
  }
}

/** Trigger 5 phút: xử lý hàng chờ đồng bộ theo thứ tự đánh dấu. */
function planSyncTick_() {
  return syncDirtyPlans_();
}

function syncDirtyPlans_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), started = Date.now();
  var result = { synced: 0, skipped: 0, failed: 0 };
  Object.keys(all).filter(function (key) { return key.indexOf(PLAN_DIRTY_PREFIX_) === 0; })
    .sort(function (a, b) { return Number(all[a]) - Number(all[b]); })
    .forEach(function (key) {
      if (Date.now() - started > 240000) { result.skipped++; return; }
      var periodId = key.substring(PLAN_DIRTY_PREFIX_.length);
      // Xóa dấu trước khi đọc dữ liệu: thao tác mới trong lúc đồng bộ sẽ đánh dấu lại.
      props.deleteProperty(key);
      var withSummary = !!all[PLAN_SUMMARY_PREFIX_ + periodId];
      if (withSummary) props.deleteProperty(PLAN_SUMMARY_PREFIX_ + periodId);
      try {
        if (withSummary) writePeriodSummary_(periodId);
        DataRepository.clearCache();
        var r = syncMonthlyPlanWorkbook_(periodId);
        if (r && r.skipped) result.skipped++; else result.synced++;
      } catch (err) {
        result.failed++;
        markPlanDirty_(periodId, withSummary);
        log_('Chưa đồng bộ được kỳ ' + periodId + ': ' + err);
      }
    });
  if (result.synced || result.failed) log_('Plan sync: ' + JSON.stringify(result));
  return result;
}

function syncMonthlyPlanWorkbook_(periodId) {
  var out = withPlanSyncMutex_(function () { return syncMonthlyPlanWorkbookNow_(periodId); });
  // Đang có lượt đồng bộ khác: xếp lại hàng chờ, không bỏ lượt.
  if (out && out.skipped) markPlanDirty_(periodId);
  return out;
}

/** Chỉ ghi từ app ra Sheet kế hoạch; Sheet không phải nguồn ghi nghiệp vụ độc lập. */
function syncMonthlyPlanWorkbookNow_(periodId) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan || !plan.spreadsheet_id) return;
  var ss = SpreadsheetApp.openById(plan.spreadsheet_id);
  var settings = {};
  DataRepository.getAll('Settings').forEach(function (row) { settings[row.key] = row.value; });
  var copiedTemplate = !!settings.source_template_spreadsheet_id;
  var requests = DataRepository.getAll('Requests');
  var requestById = {};
  requests.forEach(function (r) { requestById[r.request_id] = r; });
  var items = DataRepository.getAll('WorkItems').filter(function (i) { return i.period_id === periodId; });
  var users = {}, types = {}, units = DataRepository.getAll('Units').filter(function (u) { return String(u.is_active) === 'true' && u.kind === 'DON_VI_GUI'; });
  DataRepository.getAll('Users').forEach(function (u) { users[u.user_id] = u.full_name || u.user_id; });
  DataRepository.getAll('WorkTypes').forEach(function (w) { types[w.type_code] = w.display_name || w.type_code; });

  var summary = ss.getSheetByName('Tổng hợp');
  repairMonthlySummaryFormulas_(ss);
  summary.getRange(1, 1, 3, 1).setValues([[plan.name], ['Kỳ: ' + plan.start_date + ' đến ' + plan.end_date], ['Dữ liệu đồng bộ từ LS-Routing lúc ' + stamp_()]]);
  var unitTotals = units.map(function (u) {
    var mine = items.filter(function (i) { var r = requestById[i.request_id]; return r && r.unit_id === u.unit_id; });
    return [u.name, mine.length, mine.filter(function (i) { return OPEN_STATUS.indexOf(i.status) !== -1 && !i.carried_to_item_id; }).length, mine.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length];
  });
  // Bản sao mẫu đã có công thức Tổng hợp; không ghi đè công thức. Bản trống
  // fallback vẫn có bảng tổng hợp tối thiểu để không mất khả năng vận hành.
  if (!copiedTemplate) {
    if (!summary.getRange(5, 1).getValue()) summary.getRange(5, 1, 1, 4).setValues([['Đơn vị', 'Tổng việc', 'Đang mở', 'Hoàn thành']]);
    if (unitTotals.length) summary.getRange(6, 1, unitTotals.length, 4).setValues(unitTotals);
  }

  units.forEach(function (u) {
    var tab = ss.getSheetByName(u.source_tab || u.name || u.unit_id);
    if (!tab) tab = ss.insertSheet(u.source_tab || u.name || u.unit_id);
    ensurePlanTabHeader_(tab, plan, u, copiedTemplate);
    // Workbook mẫu có sẵn công thức kế hoạch ở G:K; chỉ thay vùng dữ liệu app.
    var clearRows = Math.max(tab.getMaxRows() - 3, 1);
    tab.getRange(4, 1, clearRows, 6).clearContent();
    tab.getRange(4, 12, clearRows, 1).clearContent();
    // Việc đã hủy chuyển sang tab riêng "Hồ sơ đã hủy", không nằm lẫn trong tab đơn vị.
    var rows = items.filter(function (i) { var r = requestById[i.request_id]; return r && r.unit_id === u.unit_id && i.status !== 'HUY'; }).map(function (i) {
      var r = requestById[i.request_id] || {};
      return [i.source_stt, r.requestor_name || '', r.cif || '', r.customer_name || '', i.product_name || '', types[i.work_type_code] || i.work_type_code,
        i.occurrence_date || '', i.status || '', users[i.assigned_user_id] || '', i.note || ''];
    });
    if (!copiedTemplate) tab.getRange(4, 7, clearRows, 3).clearContent();
    if (rows.length) {
      tab.getRange(4,3,rows.length,1).setNumberFormat('@');
      tab.getRange(4, 1, rows.length, 6).setValues(rows.map(function (row) { return row.slice(0, 6); }));
      tab.getRange(4, 12, rows.length, 1).setValues(rows.map(function (row) { return [row[9] || STATUS_LABEL_[row[7]] || row[7] || '']; }));
      // File trống không có công thức G:K của mẫu: ghi thẳng ngày, trạng thái, người xử lý.
      if (!copiedTemplate) tab.getRange(4, 7, rows.length, 3).setValues(rows.map(function (row) {
        return [row[6], STATUS_LABEL_[row[7]] || row[7], row[8]];
      }));
    }
    tab.setFrozenRows(Math.max(tab.getFrozenRows(), 3));
  });

  writeCanceledPlanTab_(ss, periodId, items, requestById, users, types);

  var catalog = ss.getSheetByName('Danh mục');
  catalog.clearContents();
  var options = DataRepository.getAll('CatalogOptions').filter(function (x) { return String(x.is_active) === 'true'; })
    .map(function (x) { return [x.catalog_key, x.unit_id || '', x.label, x.code || '']; });
  catalog.getRange(1, 1, 1, 4).setValues([['Nhóm', 'Đơn vị', 'Nhãn', 'Mã']]);
  if (options.length) catalog.getRange(2, 1, options.length, 4).setValues(options);
  syncMonthlyTimeSheets_(ss, plan);
}

/** Tab "Hồ sơ đã hủy" của workbook kỳ: đọc từ WorkItems + sổ CanceledItems. */
var CANCELED_TAB_ = 'Hồ sơ đã hủy';
function writeCanceledPlanTab_(ss, periodId, items, requestById, users, types) {
  var log = {}, unitNames = {};
  try {
    DataRepository.getAll('CanceledItems').forEach(function (c) { if (c.period_id === periodId) log[c.item_id] = c; });
  } catch (ignoreLog) { /* kho chưa có sổ hủy: vẫn liệt kê từ WorkItems */ }
  DataRepository.getAll('Units').forEach(function (x) { unitNames[x.unit_id] = x.name || x.unit_id; });
  function safe(v) {
    if (typeof v === 'string' && /^\s*[=+\-@]/.test(v)) return "'" + v;
    return v === null || v === undefined ? '' : v;
  }
  var headers = ['STT', 'Đơn vị', 'Tên khách hàng', 'CIF', 'Sản phẩm', 'Nghiệp vụ', 'Ngày phát sinh', 'Trạng thái trước khi hủy',
    'Người hủy', 'Giờ hủy', 'Lý do hủy', 'Người đề nghị hủy', 'Lý do đề nghị'];
  var rows = items.filter(function (i) { return i.status === 'HUY'; }).map(function (i) {
    var r = requestById[i.request_id] || {}, c = log[i.item_id] || {};
    return [i.source_stt || '', unitNames[r.unit_id] || r.unit_id || '', r.customer_name || '', r.cif || '', i.product_name || '',
      types[i.work_type_code] || i.work_type_code || '', i.occurrence_date || '', STATUS_LABEL_[c.status_before] || c.status_before || '',
      users[c.canceled_by] || c.canceled_by || '', c.canceled_at || i.updated_at || '', c.reason || '',
      users[c.requested_by] || c.requested_by || '', c.requested_reason || ''].map(safe);
  });
  var tab = ss.getSheetByName(CANCELED_TAB_) || ss.insertSheet(CANCELED_TAB_);
  tab.clearContents();
  tab.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    if (tab.getMaxRows() < rows.length + 1) tab.insertRowsAfter(tab.getMaxRows(), rows.length + 1 - tab.getMaxRows());
    tab.getRange(2, 4, rows.length, 1).setNumberFormat('@');
    tab.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  tab.setFrozenRows(1);
  return rows.length;
}

var TIME_SHEET_VERSION_ = 'time_sheet_v2';

/** Pure projection: each workbook shows its own dossiers and time spent in its date range. */
function buildMonthlyTimeSheets_(plan, tables, calendar, now) {
  var rawItems = tables.WorkItems || [], exemptByItem = slaExemptByItem_(rawItems, tables.WorkTypes || []);
  var items = rawItems.map(function(i) { var copy = Object.assign({}, i); copy.sla_no_fault = !!exemptByItem[i.item_id]; return copy; });
  var requests = {}, users = {}, types = {}, units = {};
  (tables.Requests || []).forEach(function(r) { requests[r.request_id] = r; });
  (tables.Users || []).forEach(function(u) { users[u.user_id] = u.full_name || u.user_id; });
  (tables.WorkTypes || []).forEach(function(w) { types[w.type_code] = w; });
  (tables.Units || []).forEach(function(u) { units[u.unit_id] = u.name || u.unit_id; });
  var opts = {from:plan.start_date,to:plan.end_date,now:now}, report = LSTiming.report(items,calendar,opts);
  var from = new Date(plan.start_date + 'T00:00:00+07:00').getTime();
  var to = new Date(plan.end_date + 'T00:00:00+07:00').getTime() + 86400000;
  function number(v) { return v === null || v === undefined || !isFinite(v) ? '' : Number(v); }
  function name(id) { return id ? users[id] || id : 'Chưa xác định'; }
  function typeName(code) { return types[code] ? types[code].display_name || code : code || ''; }
  var detailHeaders = ['Mã hồ sơ','Mã đề nghị','Mã hồ sơ gốc','STT','Đơn vị','Cán bộ đề nghị','CIF','Tên khách hàng','Sản phẩm',
    'Mã nghiệp vụ','Nghiệp vụ','Mã cán bộ LS','Cán bộ LS','Trạng thái','Giờ nhận hồ sơ đủ','Giờ tiếp nhận','Giờ phân công đầu',
    'Giờ bắt đầu xử lý','Giờ hoàn thành','Hạn SLA','Giờ nhận → tiếp nhận','Giờ tiếp nhận → phân công','Giờ xử lý hồ sơ',
    'SLA đã dùng (giờ làm)','Thời gian lịch (giờ)','SLA chuẩn (giờ)','Kết quả SLA','Chất lượng dữ liệu','Nguồn mốc','Version','Cập nhật','Hồ sơ chuyển tiếp'];
  var detailRows = items.filter(function(i) { return i.period_id === plan.period_id; }).sort(function(a,b) {
    return String(a.source_stt || a.item_id).localeCompare(String(b.source_stt || b.item_id),undefined,{numeric:true});
  }).map(function(i) {
    var request = requests[i.request_id] || {}, end = i.completed_at || (i.status === 'HUY' ? i.updated_at || now : now);
    var timing = LSTiming.metrics(i,calendar,end), quality = [], result = '';
    if (!LSTiming.awaitingReceipt(i.status) && !i.dossier_received_at) quality.push('Thiếu mốc bàn giao hồ sơ đủ');
    if (LSTiming.sessions(i,end).some(function(s) { return !s.user_id; })) quality.push('Phiên xử lý chưa rõ cán bộ');
    if (!i.carried_to_item_id && i.completed_at && timing.xu_ly === null) quality.push('Chưa có phiên xử lý để tính giờ');
    if (!i.carried_to_item_id && timing.xu_ly === 0 && timing.xu_ly_thuc_te > 0) quality.push('Phiên ngoài giờ làm việc chưa khép trong ngày, không tính vào giờ xử lý');
    if (i.carried_to_item_id) {
      quality.push('Thời gian tính trên dòng chuyển tiếp');
      timing = {tiep_nhan:null,phan_cong:null,xu_ly:null,toan_trinh:null,sla_da_dung:null}; result = 'Đã chuyển kỳ';
    } else if (LSTiming.awaitingReceipt(i.status) && !i.dossier_received_at) result = 'Chưa tiếp nhận';
    else if (i.status === 'HUY') result = 'Đã hủy';
    else if (!i.dossier_received_at) result = 'Chưa xác nhận mốc';
    else if (i.sla_no_fault) result = '';
    else if (['TAM_DUNG','DANG_HEN_KH','CAN_BO_SUNG','CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1) result = 'Tạm dừng SLA';
    else if (!i.due_at) result = 'Chưa có hạn SLA';
    else result = new Date(end) > new Date(i.due_at) ? 'Quá hạn' : (i.completed_at ? 'Đúng hạn' : 'Trong hạn');
    return [i.item_id,i.request_id,i.origin_item_id || i.item_id,i.source_stt || '',units[request.unit_id] || request.unit_id || '',
      request.requestor_name || '',String(request.cif || ''),request.customer_name || '',i.product_name || '',i.work_type_code || '',typeName(i.work_type_code),
      i.assigned_user_id || '',i.assigned_user_id ? name(i.assigned_user_id) : 'Chưa giao',STATUS_LABEL_[i.status] || i.status || '',
      timeSheetDate_(i.dossier_received_at),timeSheetDate_(i.accepted_at),timeSheetDate_(i.first_assigned_at || i.assigned_at),
      timeSheetDate_(i.processing_started_at),timeSheetDate_(i.completed_at),timeSheetDate_(i.due_at),
      number(timing.tiep_nhan),number(timing.phan_cong),number(timing.xu_ly),number(timing.sla_da_dung),
      i.carried_to_item_id ? '' : number(LSTiming.between(i.dossier_received_at,end,{days:[0,1,2,3,4,5,6],open:'00:00',close:'24:00',breakFrom:'',breakTo:''})),
      types[i.work_type_code] ? number(types[i.work_type_code].sla_hours) : '',result,quality.join('; '),i.timing_source || 'LEGACY_UNCONFIRMED',
      i.version || '',timeSheetDate_(i.updated_at),i.carried_to_item_id || ''];
  });
  var sessionRows = [];
  items.filter(function(i) { return !i.carried_to_item_id; }).forEach(function(i) {
    var request = requests[i.request_id] || {}, raw = LSTiming.array(i,'processing_sessions');
    LSTiming.sessions(i,now).forEach(function(s,index) {
      if (s.end <= from || s.start >= to) return;
      var original = raw.filter(function(r) { return new Date(r.start).getTime() === s.start && (r.user_id || '') === s.user_id; })[0];
      var ongoing = !i.completed_at && (original ? !original.end : s.end===new Date(now).getTime() && ['DANG_THUC_HIEN','DA_SOAN_XONG','CHO_KS_DUYET'].indexOf(i.status)!==-1);
      var hours = LSTiming.between(new Date(Math.max(from,s.start)).toISOString(),new Date(Math.min(to,s.end)).toISOString(),calendar);
      // Phiên đã khép mà làm ngoài giờ làm việc: phần làm thêm cũng là giờ của phiên, giống cột Giờ xử lý và bảng theo ngày.
      if (hours !== null && s.closed) hours += LSTiming.overtime(s.start,s.end,calendar).reduce(function(n,w) {
        var a = Math.max(w[0],from), b = Math.min(w[1],to);
        return b > a ? n + (b - a) / 3600000 : n;
      },0);
      sessionRows.push([i.item_id,i.origin_item_id || i.item_id,index+1,s.user_id,name(s.user_id),s.work_type_code,typeName(s.work_type_code),
        s.product_name,request.customer_name || '',timeSheetDate_(new Date(s.start).toISOString()),
        ongoing ? '' : timeSheetDate_(new Date(s.end).toISOString()),number(hours),ongoing ? 'Đang xử lý' : 'Đã đóng',
        s.user_id ? '' : 'Chưa rõ cán bộ (dữ liệu cũ)']);
    });
  });
  sessionRows.sort(function(a,b) { return String(a[0]).localeCompare(String(b[0])) || a[2]-b[2]; });
  var dailyHeaders = ['Ngày','Mã cán bộ','Cán bộ','Mã nghiệp vụ','Nghiệp vụ','Sản phẩm','Số hồ sơ','Giờ hồ sơ',
    'Giờ cán bộ trong nhóm','Hoàn thành','SLA TB (giờ làm)','Đúng hạn','Hoàn thành đủ mốc'];
  var dailyRows = report.rows.map(function(r) { return [r.day,r.user_id,name(r.user_id),r.work_type_code,typeName(r.work_type_code),
    r.product_name,r.items,r.processing_hours,r.occupied_hours,r.completed,number(r.avg_sla_hours),r.on_time,r.timed_completed]; });
  var totalHeaders = ['Chiều tổng hợp','Ngày','Mã cán bộ','Cán bộ','Mã nghiệp vụ','Nghiệp vụ','Giờ hồ sơ','Giờ cán bộ gộp trùng',
    'Hoàn thành','SLA TB (giờ làm)','Đúng hạn','Hoàn thành đủ mốc','Thiếu mốc bàn giao','Phiên chưa rõ cán bộ'];
  function totalRow(dimension,key,r) {
    var sla = 0, timed = 0, onTime = 0;
    r.rows.forEach(function(x) { sla += x.sla_hours;timed += x.timed_completed;onTime += x.on_time; });
    return [dimension,dimension==='Ngày' ? key : '',dimension==='Cán bộ' ? key : '',dimension==='Cán bộ' ? name(key) : '',
      dimension==='Nghiệp vụ' ? key : '',dimension==='Nghiệp vụ' ? typeName(key) : '',r.total.processing_hours,r.total.occupied_hours,
      r.total.completed,timed ? sla/timed : '',onTime,timed,r.quality.missing_handoff,r.quality.unattributed_sessions];
  }
  var totalRows = [totalRow('Toàn kỳ','',report)], userKeys = {}, typeKeys = {};
  report.rows.forEach(function(r) { if(r.user_id)userKeys[r.user_id]=true;if(r.work_type_code)typeKeys[r.work_type_code]=true; });
  report.days.forEach(function(d) {
    totalRows.push(totalRow('Ngày',d.day,LSTiming.report(items,calendar,{from:d.day,to:d.day,now:now})));
  });
  Object.keys(userKeys).sort().forEach(function(id) { totalRows.push(totalRow('Cán bộ',id,LSTiming.report(items,calendar,Object.assign({},opts,{user_id:id})))); });
  Object.keys(typeKeys).sort().forEach(function(code) { totalRows.push(totalRow('Nghiệp vụ',code,LSTiming.report(items,calendar,Object.assign({},opts,{work_type_code:code})))); });
  return [
    {name:'Thời gian hồ sơ',headers:detailHeaders,rows:detailRows,hourColumns:[21,22,23,24,25,26],
      note:'Một dòng mỗi nghiệp vụ/hồ sơ của kỳ. Mốc còn thiếu để trống; sửa giờ trong app LS.'},
    {name:'Phiên xử lý',headers:['Mã hồ sơ','Mã hồ sơ gốc','Phiên','Mã cán bộ','Cán bộ','Mã nghiệp vụ','Nghiệp vụ','Sản phẩm','Tên khách hàng',
      'Giờ bắt đầu phiên','Giờ kết thúc phiên','Giờ làm trong kỳ','Trạng thái phiên','Chất lượng dữ liệu'],rows:sessionRows,hourColumns:[12],
      note:'Giữ mốc gốc của phiên; giờ làm chỉ tính trong khoảng ngày của kỳ: giờ trong lịch cộng phần làm thêm của phiên đã khép trong ngày, trừ nghỉ trưa.'},
    {name:'Thời gian theo ngày',headers:dailyHeaders,rows:dailyRows,hourColumns:[8,9,11],
      note:'Giờ cán bộ trong nhóm chỉ gộp trùng trong nhóm ngày/cán bộ/nghiệp vụ/sản phẩm; không cộng để thay tổng cán bộ.'},
    {name:'Tổng hợp thời gian',headers:totalHeaders,rows:totalRows,hourColumns:[7,8,10],
      note:'Giờ hồ sơ cộng từng việc. Giờ cán bộ gộp khoảng trùng kể cả khác nghiệp vụ. Không cộng các chiều tổng hợp với nhau.'}
  ];
}

/** Text timestamps always show Vietnam time, independent of the copied template's timezone. */
function timeSheetDate_(value) {
  if (!value) return '';
  var ms = new Date(value).getTime();
  if (!isFinite(ms)) return '';
  var date = new Date(ms + 7*3600000);
  function pad(n) { return ('0'+n).slice(-2); }
  return pad(date.getUTCDate())+'/'+pad(date.getUTCMonth()+1)+'/'+date.getUTCFullYear()+' '+pad(date.getUTCHours())+':'+pad(date.getUTCMinutes())+':'+pad(date.getUTCSeconds());
}

/** Only managed output tabs are rewritten. Unrelated tabs with the same name are preserved. */
function writeMonthlyTimeSheet_(ss, output, plan, now) {
  var marker = 'LS-Routing | '+TIME_SHEET_VERSION_+' | '+output.name, tab = null;
  for(var n=0;n<100;n++) {
    var name = output.name + (n ? ' (LS'+(n===1 ? '' : n)+')' : ''), candidate = ss.getSheetByName(name);
    if (!candidate) { tab = ss.insertSheet(name); break; }
    if (String(candidate.getRange(1,1).getValue()).indexOf('LS-Routing | ')===0 &&
      String(candidate.getRange(1,1).getValue()).split(' | ')[2]===output.name) { tab=candidate;break; }
  }
  if(!tab)throw new Error('Không tìm được tab trống để ghi '+output.name+'.');
  var width = output.headers.length, height = output.rows.length+3, previous = tab.getLastRow();
  if(tab.getMaxColumns()<width)tab.insertColumnsAfter(tab.getMaxColumns(),width-tab.getMaxColumns());
  if(tab.getMaxRows()<height)tab.insertRowsAfter(tab.getMaxRows(),height-tab.getMaxRows());
  var filter = tab.getFilter();if(filter)filter.remove();
  // Clear only the generated table, including stale rows after a smaller refresh.
  if(previous>3)tab.getRange(4,1,previous-3,width).clearContent();
  tab.getRange(1,1).setValue(marker).setFontWeight('bold').setFontSize(13);
  tab.getRange(2,1).setValue(plan.start_date+' → '+plan.end_date+' | Giờ Việt Nam (+07:00) | Cập nhật: '+timeSheetDate_(now)+' | '+output.note);
  tab.getRange(3,1,1,width).setValues([output.headers]).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff').setWrap(true);
  if(output.rows.length) {
    output.headers.forEach(function(label,index) {
      if(/^Mã |^CIF$|^STT$|^Ngày$/.test(label))tab.getRange(4,index+1,output.rows.length,1).setNumberFormat('@');
    });
    var safeRows = output.rows.map(function(row) { return row.map(function(v) {
      if(typeof v==='string' && /^\s*[=+\-@]/.test(v))return "'"+v;
      return v===null || v===undefined ? '' : v;
    }); });
    tab.getRange(4,1,safeRows.length,width).setValues(safeRows);
    (output.hourColumns || []).forEach(function(column) { tab.getRange(4,column,safeRows.length,1).setNumberFormat('0.00'); });
  }
  tab.getRange(3,1,Math.max(output.rows.length+1,1),width).createFilter();
  tab.setFrozenRows(3);tab.setColumnWidths(1,width,160);
  output.headers.forEach(function(label,index) { if(/Tên khách hàng|Sản phẩm|Chất lượng|Nghiệp vụ|Giờ nhận hồ sơ|Giờ hoàn thành|Hạn SLA/.test(label))tab.setColumnWidth(index+1,220); });
  return tab;
}

/**
 * Chỉ một lượt đồng bộ chạy tại một thời điểm (mutex riêng), nên bản chụp cũ
 * không thể ghi đè bản mới. Không giữ khóa dữ liệu trong lúc ghi tab: người
 * dùng vẫn thao tác bình thường khi tab thời gian đang được dựng lại.
 */
function syncMonthlyTimeSheets_(ss, plan) {
  return withPlanSyncMutex_(function () {
    var props=PropertiesService.getScriptProperties(), key='LS_TIME_SHEETS_'+plan.period_id;
    try {
      DataRepository.clearCache();
      var tables={};['WorkItems','Requests','Users','WorkTypes','Units'].forEach(function(name) { tables[name]=DataRepository.getAll(name); });
      var now=stamp_(), outputs=buildMonthlyTimeSheets_(plan,tables,timingCalendar_(),now);
      outputs.forEach(function(output) { writeMonthlyTimeSheet_(ss,output,plan,now); });
      props.setProperty(key,TIME_SHEET_VERSION_);props.setProperty(key+'_AT',now);props.deleteProperty(key+'_ERROR');
      return {ok:true,period_id:plan.period_id,tabs:outputs.length,at:now};
    } catch(err) {
      props.setProperty(key+'_ERROR',String(err.message || err).substring(0,300));throw err;
    }
  });
}

/** Bootstrap chỉ xếp hàng việc dựng tab thời gian lần đầu; trigger nền làm phần nặng. */
function ensureMonthlyTimeSheets_(plan) {
  if(!plan || !plan.spreadsheet_id)return;
  if(PropertiesService.getScriptProperties().getProperty('LS_TIME_SHEETS_'+plan.period_id)===TIME_SHEET_VERSION_)return;
  markPlanDirty_(plan.period_id);
}

function refreshMonthlyTimeSheets_() {
  var started=Date.now(), props=PropertiesService.getScriptProperties(), result={synced:0,skipped:0,failed:0,workbooks:[]};
  var plans=DataRepository.getAll('MonthlyPlans').filter(function(p) { return p.spreadsheet_id; }).sort(function(a,b) {
    return (a.status==='ACTIVE' ? -1 : b.status==='ACTIVE' ? 1 : String(b.month_key).localeCompare(String(a.month_key)));
  });
  plans.forEach(function(plan) {
    if(Date.now()-started>240000) {result.skipped++;return;}
    if(plan.status==='ARCHIVED' && props.getProperty('LS_TIME_SHEETS_'+plan.period_id)===TIME_SHEET_VERSION_) {result.skipped++;return;}
    try {
      var update=syncMonthlyTimeSheets_(SpreadsheetApp.openById(plan.spreadsheet_id),plan);
      if(update.ok) { result.synced++;result.workbooks.push({period_id:plan.period_id,url:'https://docs.google.com/spreadsheets/d/'+plan.spreadsheet_id+'/edit',at:update.at}); }
      else result.skipped++;
    }
    catch(err) { result.failed++;Logger.log('Chưa đồng bộ thời gian kỳ '+plan.period_id+': '+err); }
  });
  Logger.log('Time sheets: '+JSON.stringify(result));
  return result;
}

var STATUS_LABEL_ = {
  CHO_HOAN_THIEN: 'Chờ phân công',
  CHO_TIEP_NHAN: 'Chờ tiếp nhận', CAN_BO_SUNG: 'Chưa giao hồ sơ', CHUA_GIAO_HO_SO: 'Chưa giao hồ sơ', CHO_PHAN_CONG: 'Chờ phân công',
  DA_PHAN_CONG: 'Đã phân công', DANG_THUC_HIEN: 'Đã tiếp nhận hồ sơ', DA_SOAN_XONG: 'Đã soạn xong',
  DANG_HEN_KH: 'Đang hẹn khách ký', CHO_KS_DUYET: 'Chờ kiểm soát duyệt', HOAN_THANH_LS: 'Hoàn thành',
  TAM_DUNG: 'Tạm dừng', HUY: 'Đã hủy'
};

/**
 * Tab phòng/PGD chỉ được ghi dữ liệu từ dòng 4. File tạo trống, hoặc phòng mới
 * chưa có tab trong mẫu, trước đây ra tab không tiêu đề: đọc không biết cột nào là
 * gì. Chỉ ghi khi dòng tiêu đề còn trống — không đè tiêu đề/định dạng của mẫu.
 */
function ensurePlanTabHeader_(tab, plan, unit, copiedTemplate) {
  if (!tab.getRange(1, 1).getValue()) {
    tab.getRange(1, 1, 2, 1).setValues([[(plan.name || 'Kế hoạch hỗ trợ tín dụng') + ' — ' + (unit.name || unit.unit_id)],
      ['Kỳ: ' + (plan.start_date || '') + ' đến ' + (plan.end_date || '')]]);
    tab.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  }
  var headRow = tab.getRange(3, 1, 1, 12).getValues()[0];
  var head = ['STT', 'Cán bộ đề nghị', 'CIF', 'Tên khách hàng', 'Sản phẩm', 'Loại việc'];
  if (!headRow[0]) tab.getRange(3, 1, 1, 6).setValues([head]);
  if (!copiedTemplate && !headRow[6]) tab.getRange(3, 7, 1, 3).setValues([['Ngày phát sinh', 'Trạng thái', 'Cán bộ LS xử lý']]);
  if (!headRow[11]) tab.getRange(3, 12).setValue('Ghi chú / trạng thái');
  if (!headRow[0] || !headRow[11]) {
    tab.getRange(3, 1, 1, 12).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  }
}

function carryOpenWorkToPlan_(fromPeriodId, toPeriodId, u) {
  var targetPlan = DataRepository.find('MonthlyPlans', 'period_id', toPeriodId);
  if (!targetPlan) throw new Error('Không tìm thấy kỳ đích ' + toPeriodId + '.');
  var copied = DataRepository.tx(function (t) {
    var requests = {}, counts = {}, idMap = {}, targetByOrigin = {};
    t.rows('Requests').forEach(function (r) { requests[r.request_id] = r; });
    var sourceItems = t.rows('WorkItems').filter(function (i) {
      return i.period_id === fromPeriodId && OPEN_STATUS.indexOf(i.status) !== -1;
    });
    t.rows('WorkItems').filter(function (i) {
      return i.period_id === toPeriodId && i.carryover_from_item_id;
    }).forEach(function (i) { targetByOrigin[i.carryover_from_item_id] = i; });
    // Reserve all destination IDs first. Child items can then point at the
    // carried parent regardless of which source row appears first in the Sheet.
    sourceItems.forEach(function (old) {
      idMap[old.item_id] = targetByOrigin[old.item_id] ? targetByOrigin[old.item_id].item_id : id_('ITEM');
    });
    // Tiếp tục STT theo từng đơn vị của kỳ đích, tránh trùng mã khi chạy lại
    // hoặc khi kỳ mới đã có dữ liệu được tạo thủ công trước lúc chuyển tiếp.
    t.rows('WorkItems').filter(function (i) { return i.period_id === toPeriodId; }).forEach(function (i) {
      var ref = String(i.source_stt || '');
      var match = ref.match(/^(.+)_([0-9]+)$/);
      if (match) counts[match[1]] = Math.max(counts[match[1]] || 0, Number(match[2]));
    });
    sourceItems.forEach(function (old) {
      var already = targetByOrigin[old.item_id];
      var oldReq = requests[old.request_id];
      if (!oldReq) throw new Error('Không thể chuyển tiếp hồ sơ ' + old.item_id + ': thiếu thông tin yêu cầu.');
      var oldFound = t.find('WorkItems', 'item_id', old.item_id);
      if (already) {
        if (oldFound && oldFound.object.carried_to_item_id !== already.item_id) {
          t.write(oldFound, { carried_to_item_id: already.item_id, version: Number(old.version || 0) + 1, updated_at: stamp_() });
        }
        return;
      }
      var newRequestId = id_('REQ');
      var newItemId = idMap[old.item_id];
      t.append('Requests', {
        request_id: newRequestId, period_id: toPeriodId, origin_request_id: oldReq.origin_request_id || oldReq.request_id,
        // Giữ người gửi gốc: Phòng/PGD lọc "đề nghị của tôi" và hiện "Người gửi" theo trường này.
        carryover_from_request_id: oldReq.request_id, unit_id: oldReq.unit_id, created_by: oldReq.created_by || u.user_id,
        customer_name: oldReq.customer_name, customer_kind: oldReq.customer_kind, cif: oldReq.cif || '', phone: oldReq.phone || '', email: oldReq.email || '',
        priority_flags_json: oldReq.priority_flags_json || '[]', requestor_id: oldReq.requestor_id || '', requestor_name: oldReq.requestor_name || '',
        requestor_kind: oldReq.requestor_kind || '', note: oldReq.note || '', created_at: stamp_(), updated_at: stamp_()
      });
      var prefix = String(oldReq.unit_id || 'DONVI') + '_';
      counts[oldReq.unit_id] = (counts[oldReq.unit_id] || 0) + 1;
      t.append('WorkItems', {
        item_id: newItemId, period_id: toPeriodId, origin_item_id: old.origin_item_id || old.item_id, carryover_from_item_id: old.item_id,
        parent_item_id: idMap[old.parent_item_id] || old.parent_item_id || '',
        request_id: newRequestId, work_type_code: old.work_type_code, product_name: old.product_name, collateral_mode: old.collateral_mode || 'NONE',
        occurrence_date: String(old.occurrence_date || '') >= String(targetPlan.start_date) ? old.occurrence_date : targetPlan.start_date,
        requested_mortgage_contract_count: old.requested_mortgage_contract_count || '', requested_export_folder_count: old.requested_export_folder_count || '',
      source_stt: prefix + counts[oldReq.unit_id], source_tab: old.source_tab || '', status: old.status, assigned_user_id: old.assigned_user_id || '', assigned_by: old.assigned_by || '', submitted_at: old.submitted_at || '',
        accepted_at: old.accepted_at || '', assigned_at: old.assigned_at || '', due_at: old.due_at || '', due_at_override: old.due_at_override || '', completed_at: '', processing_started_at: old.processing_started_at || '', pause_log_json: old.pause_log_json || '', appointment_json: old.appointment_json || '', checklist_json: old.checklist_json || '[]', pending_json: old.pending_json || '',
        dossier_received_at: old.dossier_received_at || '', dossier_received_by: old.dossier_received_by || '', timing_source: old.timing_source || 'LEGACY_UNCONFIRMED',
        first_assigned_at: old.first_assigned_at || old.assigned_at || '', processing_sessions_json: old.processing_sessions_json || '', sla_pause_log_json: old.sla_pause_log_json || '',
        execution_state: old.execution_state || '', execution_changed_at: old.execution_changed_at || '',
        is_priority: truthy_(old.is_priority), result_credit_json: old.result_credit_json || '', supplement_json: old.supplement_json || '', result_flags_json: old.result_flags_json || '', sla_paused_at: old.sla_paused_at || '',
        note: 'Chuyển tiếp từ ' + old.item_id + '.', version: 1, created_at: stamp_(), updated_at: stamp_()
      });
      // Đánh dấu dòng cũ đã sinh ra dòng mới ở kỳ sau. Thiếu dấu này thì việc
      // kéo dài ba tháng nằm trong ba kỳ dưới dạng ba dòng đang mở, và mọi báo
      // cáo nhiều kỳ đếm nó ba lần.
      if (oldFound) t.write(oldFound, { carried_to_item_id: newItemId, version: Number(old.version || 0) + 1, updated_at: stamp_() });
      t.append('Events', { event_id: id_('EVT'), item_id: newItemId, type: 'CHUYEN_TIEP_THANG', by: u.user_id, at: stamp_(),
        reason: 'Chuyển tiếp việc mở từ kỳ ' + fromPeriodId + ', việc gốc ' + old.item_id + '.', before_json: JSON.stringify({ item_id: old.item_id, period_id: fromPeriodId }), after_json: JSON.stringify({ period_id: toPeriodId }) });
    });
    return true;
  });
  if (copied) markPlanDirty_(toPeriodId);
}

/* ---------------------------- Báo cáo nhiều kỳ ---------------------------- */

function elapsedHours_(from, to) {
  if (!from || !to) return null;
  var start = new Date(from).getTime();
  var end = new Date(to).getTime();
  if (!isFinite(start) || !isFinite(end) || end < start) return null;
  return (end - start) / 3600000;
}

/**
 * Các mốc SLA được ghi trên WorkItems, không cần sửa workbook nguồn:
 * - phân công: lúc đơn vị gửi -> lúc quản lý gán cán bộ LS;
 * - tiếp nhận: lúc phân công -> lúc LS xác nhận nhận đủ hồ sơ;
 * - xử lý: các phiên cán bộ trực tiếp làm trong lịch làm việc;
 * - toàn trình: lúc gửi -> lúc hoàn thành.
 * Trả null khi một đoạn chưa đủ mốc để dashboard không biến dữ liệu thiếu
 * thành số 0 giả.
 */
function itemTiming_(item) {
  return LSTiming.metrics(item, timingCalendar_(), item.completed_at || stamp_());
}

function timingCalendar_(t) {
  var settings = {};
  (t ? t.rows('Settings') : DataRepository.getAll('Settings')).forEach(function(r) { settings[r.key] = r.value; });
  var pause = String(settings.work_break || '11:30-13:30').split('-');
  return { days:String(settings.work_days || '1,2,3,4,5').split(',').map(Number), open:settings.work_open || '07:30',
    close:settings.work_close || '18:00', breakFrom:pause[0], breakTo:pause[1],
    holidays:String(settings.holidays || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean) };
}

/** Ngày YYYY-MM-DD có phải ngày làm việc không (theo lịch làm việc, trừ lễ). */
function isBusinessDay_(dateStr, cal) {
  if (!dateStr) return false;
  if ((cal.holidays || []).indexOf(dateStr) !== -1) return false;
  var d = new Date(dateStr + 'T00:00:00');
  return (cal.days || [1, 2, 3, 4, 5]).indexOf(d.getDay()) !== -1;
}

/** Ngày làm việc liền trước theo lịch đơn vị, bỏ qua cuối tuần và các ngày nghỉ đã khai báo. */
function previousBusinessDay_(dateStr, cal) {
  var d = new Date(String(dateStr || '') + 'T00:00:00Z');
  if (!isFinite(d.getTime())) return '';
  for (var n = 0; n < 370; n++) {
    d.setUTCDate(d.getUTCDate() - 1);
    var candidate = d.toISOString().substring(0, 10);
    if (isBusinessDay_(candidate, cal)) return candidate;
  }
  return '';
}

/**
 * Trigger đầu ngày làm việc, chỉ trả việc phát sinh ngày làm việc liền trước (T+1)
 * nhưng cán bộ LS chưa xác nhận nhận hồ sơ. Hồ sơ cũ T+2/T+3 không bị tự trả.
 * Trả về người tạo đề nghị để họ chọn ngày gửi lại; lưu cán bộ cũ trong Event
 * để lúc phân công lại hiện ra. Ngày nghỉ không chạy.
 */
function autoReturnStaleAssignments_() {
  var today = localBusinessDate_();
  var touched = {};
  var result = DataRepository.tx(function (t) {
    var cal = timingCalendar_(t);
    if (!isBusinessDay_(today, cal)) return { skipped: 'non_business_day', returned: 0 };
    var ts = stamp_();
    var occurrenceDay = previousBusinessDay_(today, cal);
    if (!occurrenceDay) return { skipped: 'business_calendar_unavailable', returned: 0 };
    var requests = {};
    t.rows('Requests').forEach(function (r) { requests[r.request_id] = r; });
    // Bản cũ từng ghi nhầm hồ sơ tự trả thành CAN_BO_SUNG. Chỉ sửa khi Event
    // hệ thống khớp chính xác với trạng thái và thời điểm cập nhật hiện tại;
    // đọc Event trước khi giao dịch xếp thêm dòng mới vào nhật ký.
    var legacyCandidates = t.rows('WorkItems').filter(function (i) {
      var day = String(i.occurrence_date || '').substring(0, 10);
      return i.status === 'CAN_BO_SUNG' && !i.carried_to_item_id && !i.dossier_received_at &&
        !i.assigned_user_id && (day === today || day === occurrenceDay) && i.updated_at;
    });
    var legacyById = {};
    legacyCandidates.forEach(function (i) { legacyById[i.item_id] = i; });
    var legacyEvents = legacyCandidates.length ? t.tailWhere('Events', legacyCandidates.length, function (event) {
      var item = legacyById[event.item_id];
      if (!item || event.type !== 'TU_TRA_QLKH' || event.by !== 'SYSTEM' || String(event.at || '') !== String(item.updated_at || '')) return false;
      var before = {}, after = {};
      try { before = JSON.parse(event.before_json || '{}'); after = JSON.parse(event.after_json || '{}'); } catch (ignoreLegacyReturn) { return false; }
      return before.status === 'DA_PHAN_CONG' && after.status === 'CAN_BO_SUNG' && !after.assigned_user_id;
    }, { maxScan: 20000 }).rows : [];
    var stale = t.rows('WorkItems').filter(function (i) {
      if (i.status !== 'DA_PHAN_CONG' || i.carried_to_item_id || i.dossier_received_at) return false;
      return String(i.occurrence_date || '').substring(0, 10) === occurrenceDay;
    });
    var n = 0;
    stale.forEach(function (i) {
      var found = t.find('WorkItems', 'item_id', i.item_id);
      if (!found) return;
      var officer = i.assigned_user_id || '';
      // Bỏ cán bộ đang giao nhưng nhớ lại để lúc phân công lại hiện "cán bộ cũ".
      t.write(found, { status: 'CHUA_GIAO_HO_SO', assigned_user_id: '', last_assignee_id: officer, version: Number(i.version || 0) + 1, updated_at: ts });
      t.append('Events', {
        event_id: id_('EVT'), item_id: i.item_id, type: 'TU_TRA_QLKH', by: 'SYSTEM', at: ts,
        reason: 'Qua ngày làm việc T+1 chưa tiếp nhận hồ sơ — trả về Phòng/PGD để chọn ngày gửi lại.',
        before_json: JSON.stringify({ status: 'DA_PHAN_CONG', assigned_user_id: officer }),
        after_json: JSON.stringify({ status: 'CHUA_GIAO_HO_SO', assigned_user_id: '' })
      });
      var req = requests[i.request_id];
      var submitter = req ? (req.requestor_id || req.created_by) : '';
      if (submitter) inboxNotify_(t, submitter, i.item_id, 'TU_TRA_QLKH');
      if (officer && officer !== submitter) inboxNotify_(t, officer, i.item_id, 'TU_TRA_QLKH');
      touched[i.period_id] = true;
      n += 1;
    });
    var recovered = 0, correctedFlags = 0;
    legacyEvents.forEach(function (event) {
      var item = legacyById[event.item_id];
      if (!item) return;
      var day = String(item.occurrence_date || '').substring(0, 10);
      var target = day === today ? 'CHO_PHAN_CONG' : (day === occurrenceDay ? 'CHUA_GIAO_HO_SO' : '');
      if (!target) return;
      var before = {};
      try { before = JSON.parse(event.before_json || '{}'); } catch (ignoreLegacyAssignee) {}
      var found = t.find('WorkItems', 'item_id', item.item_id);
      if (!found) return;
      var lastAssignee = item.last_assignee_id || before.assigned_user_id || '';
      t.write(found, { status: target, assigned_user_id: '', last_assignee_id: lastAssignee,
        version: Number(item.version || 0) + 1, updated_at: ts });
      t.append('Events', {
        event_id: id_('EVT'), item_id: item.item_id, type: 'SUA_CO_TU_TRA', by: 'SYSTEM', at: ts,
        reason: target === 'CHO_PHAN_CONG'
          ? 'Khôi phục việc phát sinh hôm nay từng bị gắn nhầm cờ Cần bổ sung — đưa lại vào Hàng chờ phân công.'
          : 'Sửa cờ tự trả nhầm thành Cần bổ sung — giữ ở Chưa giao hồ sơ để Phòng/PGD chọn ngày gửi lại.',
        before_json: JSON.stringify({ status: 'CAN_BO_SUNG', assigned_user_id: item.assigned_user_id || '' }),
        after_json: JSON.stringify({ status: target, assigned_user_id: '', last_assignee_id: lastAssignee })
      });
      touched[item.period_id] = true;
      if (target === 'CHO_PHAN_CONG') recovered += 1;
      else correctedFlags += 1;
    });
    // Việc PHÁT SINH HÔM NAY mà đang bị trả về (ví dụ do lỗi trả nhầm trước đó) thì
    // tự đưa lại vào Hàng chờ phân công; việc của ngày hôm trước vẫn giữ ở "Chưa giao
    // hồ sơ" để Phòng/PGD chọn ngày gửi lại. Giữ last_assignee_id để lúc phân công lại
    // vẫn hiện cán bộ cũ.
    t.rows('WorkItems').filter(function (i) {
      return i.status === 'CHUA_GIAO_HO_SO' && !i.carried_to_item_id &&
        String(i.occurrence_date || '').substring(0, 10) === today;
    }).forEach(function (i) {
      var found = t.find('WorkItems', 'item_id', i.item_id);
      if (!found) return;
      t.write(found, { status: 'CHO_PHAN_CONG', version: Number(i.version || 0) + 1, updated_at: ts });
      t.append('Events', {
        event_id: id_('EVT'), item_id: i.item_id, type: 'TU_VAO_PHAN_CONG', by: 'SYSTEM', at: ts,
        reason: 'Việc phát sinh hôm nay bị trả về trước đó — tự đưa lại vào Hàng chờ phân công.',
        before_json: JSON.stringify({ status: 'CHUA_GIAO_HO_SO' }),
        after_json: JSON.stringify({ status: 'CHO_PHAN_CONG' })
      });
      touched[i.period_id] = true;
      recovered += 1;
    });
    return { returned: n, recovered: recovered, corrected_flags: correctedFlags };
  });
  Object.keys(touched).forEach(function (periodId) { markPlanDirty_(periodId); });
  return result;
}

function autoReturnTick() { requireAdmin_(); return autoReturnTick_(); }
function autoReturnTick_() {
  var r = autoReturnStaleAssignments_();
  Logger.log('Tự trả QLKH việc chưa tiếp nhận: ' + JSON.stringify(r));
  return r;
}

function validatedTime_(value, label, now) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+-]\d{2}:\d{2})$/.test(String(value))) throw new Error(label + ' không hợp lệ.');
  var date = new Date(value);
  if (!isFinite(date.getTime())) throw new Error(label + ' không hợp lệ.');
  var offset = String(value).match(/([+-])(\d{2}):(\d{2})$/), minutes = offset ? (offset[1]==='-'?-1:1)*(Number(offset[2])*60+Number(offset[3])) : 0;
  if (new Date(date.getTime()+minutes*60000).toISOString().substring(0,10)!==String(value).substring(0,10)) throw new Error(label + ' không hợp lệ.');
  if (date.getTime() > new Date(now).getTime()) throw new Error(label + ' không được ở tương lai.');
  return date.toISOString();
}

function assertCurrentWorkItem_(item) {
  if (item && item.carried_to_item_id) {
    throw new Error('Hồ sơ đã chuyển tháng; mở hồ sơ kỳ mới nhất để tiếp tục.');
  }
}

/** LS edits only their current dossier; control/management can correct any current dossier. */
function correctItemTimes(itemId, values, reason, expectedVersion) {
  var u = requireActor_();
  if (['CAN_BO_LS','KS_LS','QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Không có quyền sửa thời gian.');
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Bắt buộc ghi lý do sửa thời gian.');
  values = values || {};
  var result = DataRepository.tx(function(t) {
    var found = t.find('WorkItems','item_id',itemId);
    if (!found) throw new Error('Không tìm thấy việc.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ được sửa thời gian việc được giao cho mình.');
    if (item.carried_to_item_id) throw new Error('Hồ sơ đã chuyển tháng; sửa trên dòng mới nhất.');
    if (['HUY', 'CHO_HOAN_THIEN', 'CHO_PHAN_CONG'].indexOf(item.status) !== -1) throw new Error('Hồ sơ chưa được phân công hoặc đã hủy.');
    if (expectedVersion === undefined || Number(expectedVersion) !== Number(item.version)) throw new Error('Việc đã được cập nhật. Tải lại trước khi lưu.');
    var now = stamp_(), oldReceipt = item.dossier_received_at || '';
    var receipt = validatedTime_(values.dossier_received_at,'Giờ nhận hồ sơ đủ',now);
    var complete = item.completed_at || '';
    if (item.status === 'HOAN_THANH_LS') complete = validatedTime_(values.completed_at,'Giờ hoàn thành',now);
    else if (values.completed_at) throw new Error('Chỉ sửa giờ hoàn thành của việc đã hoàn thành.');
    var sessions = LSTiming.array(item,'processing_sessions').map(function(s) { return Object.assign({},s); });
    if (!sessions.length && item.processing_started_at && item.timing_source !== 'CORRECTED') {
      sessions = LSTiming.sessions(item, now).map(function(s) {
        return Object.assign({}, s, { start:new Date(s.start).toISOString(), end:new Date(s.end).toISOString() });
      });
    }
    var processingStart = item.processing_started_at || '';
    if (processingStart && new Date(receipt) > new Date(processingStart)) {
      if (oldReceipt && new Date(processingStart).getTime() === new Date(oldReceipt).getTime()) processingStart = receipt;
      else throw new Error('Giờ nhận hồ sơ phải trước lúc bắt đầu xử lý.');
    }
    sessions.forEach(function(s) {
      if (oldReceipt && new Date(s.start).getTime() === new Date(oldReceipt).getTime()) s.start = receipt;
      if (new Date(s.start) < new Date(receipt)) throw new Error('Giờ nhận hồ sơ phải trước phiên xử lý đã ghi nhận.');
      if (s.end && new Date(s.end) < new Date(receipt)) throw new Error('Giờ nhận hồ sơ không được sau khi phiên xử lý đã kết thúc.');
    });
    if (complete && new Date(complete) < new Date(receipt)) throw new Error('Giờ hoàn thành phải sau giờ nhận hồ sơ.');
    if (complete && processingStart && new Date(complete) < new Date(processingStart)) throw new Error('Giờ hoàn thành không được trước lúc bắt đầu xử lý.');
    if (complete) sessions.forEach(function(s) {
      if (new Date(s.start) > new Date(complete)) throw new Error('Giờ hoàn thành không được trước phiên xử lý đã ghi nhận.');
      if ((s.end && new Date(s.end).getTime() === new Date(item.completed_at).getTime()) || (s.end && new Date(s.end) > new Date(complete))) s.end = complete;
    });
    // Keep other dossiers' measured time; a correction cannot claim the same officer twice.
    // Unknown legacy ownership stays unknown. Only the corrected dossier is adjusted.
    var overlapTrimmed = false;
    var occupied = [];
    t.rows('WorkItems').forEach(function(other) {
      if (other.item_id !== itemId && !other.carried_to_item_id)
        occupied = occupied.concat(LSTiming.sessions(other, now));
    });
    var correctedSessions = [];
    sessions.forEach(function(s) {
      var stop = new Date(s.end || complete || now).getTime();
      var preserveOpenTail = !s.closed && !complete && stop === new Date(now).getTime();
      var spans = [[new Date(s.start).getTime(), stop]];
      occupied.forEach(function(o) {
        if (!s.user_id || o.user_id !== s.user_id) return;
        var next = [];
        spans.forEach(function(p) {
          if (o.end <= p[0] || o.start >= p[1]) { next.push(p); return; }
          overlapTrimmed = true;
          if (o.start > p[0]) next.push([p[0], o.start]);
          if (o.end < p[1]) next.push([o.end, p[1]]);
        });
        spans = next;
      });
      spans.forEach(function(p) {
        if (p[1] > p[0]) correctedSessions.push(Object.assign({}, s, {
          start: new Date(p[0]).toISOString(), end: preserveOpenTail && p[1] === stop ? '' : new Date(p[1]).toISOString()
        }));
      });
    });
    sessions = correctedSessions;
    var fields = { dossier_received_at:receipt, dossier_received_by:u.user_id, timing_source:'CORRECTED', completed_at:complete,
      processing_started_at:processingStart,
      version:Number(item.version)+1, updated_at:now };
    fields.processing_sessions_json = JSON.stringify(sessions);
    var merged = Object.assign({},item,fields), wt = t.find('WorkTypes','type_code',item.work_type_code);
    fields.due_at = LSTiming.deadline(merged,wt ? Number(wt.object.sla_hours) || 8 : 8,timingCalendar_(t),complete || now);
    var beforeTiming = JSON.stringify({dossier_received_at:item.dossier_received_at || '',completed_at:item.completed_at || '',due_at:item.due_at || '',processing_sessions_json:item.processing_sessions_json || ''});
    t.write(found,fields);
    t.append('Events',{event_id:id_('EVT'),item_id:itemId,type:'SUA_THOI_GIAN',by:u.user_id,at:now,reason:reason,
      before_json:beforeTiming,
      after_json:JSON.stringify(Object.assign({}, fields, { overlap_trimmed: overlapTrimmed }))});
    return Object.assign({ok:true,period_id:item.period_id},fields);
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id, true);
  return result;
}

/** Adjust the operational deadline when the assigned LS officer or originating RM agrees on a new client timeline. */
function rescheduleItem(itemId, dueAt, reason, expectedVersion) {
  var u = requireActor_();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Bắt buộc ghi lý do đổi hạn xử lý.');
  if (['CAN_BO_LS', 'PHONG_PGD'].indexOf(u.role) === -1) throw new Error('Không có quyền đổi hạn xử lý.');
  var requestedDue = String(dueAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(requestedDue)) {
    throw new Error('Ngày hạn mới không hợp lệ.');
  }
  var dueDate = new Date(requestedDue);
  if (!isFinite(dueDate.getTime())) throw new Error('Ngày hạn mới không hợp lệ.');
  var canonicalDue = dueDate.toISOString();
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (OPEN_STATUS.indexOf(item.status) === -1 || !item.dossier_received_at || !item.due_at) {
      throw new Error('Chỉ đổi hạn của hồ sơ đang mở đã được LS tiếp nhận.');
    }
    if (expectedVersion === undefined || Number(expectedVersion) !== Number(item.version)) {
      throw new Error('Việc đã được cập nhật. Tải lại trước khi lưu.');
    }
    var req = t.find('Requests', 'request_id', item.request_id);
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) {
      throw new Error('Chỉ cán bộ LS đang được giao mới được đổi hạn.');
    }
    if (u.role === 'PHONG_PGD' && (!req || req.object.unit_id !== u.unit_id ||
        String(req.object.requestor_id || req.object.created_by || '') !== String(u.user_id))) {
      throw new Error('Chỉ cán bộ QLKH tạo đề nghị này mới được đổi hạn.');
    }
    if (new Date(canonicalDue).getTime() < new Date(item.dossier_received_at).getTime()) {
      throw new Error('Hạn xử lý phải sau lúc LS nhận hồ sơ.');
    }
    var ts = stamp_();
    var fields = { due_at: canonicalDue, due_at_override: canonicalDue, version: Number(item.version) + 1, updated_at: ts };
    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'DOI_HAN_XU_LY', by: u.user_id, at: ts,
      reason: reason, before_json: JSON.stringify({ due_at: item.due_at }), after_json: JSON.stringify(fields)
    });
    return Object.assign({ ok: true, period_id: item.period_id }, fields);
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id, true);
  return result;
}

/**
 * Phòng/PGD (người tạo đề nghị) ghi thêm lịch hẹn khi đã đổi ngày phát sinh sau lúc LS báo khách ký. Không bắt buộc:
 * không đổi trạng thái, hạn, người xử lý hay lịch hẹn ký LS đã báo; chỉ lưu lịch hẹn bổ sung mới nhất và báo cán bộ đang giữ hồ sơ.
 */
function addSupplementAppointment(itemId, at, note, expectedVersion) {
  var u = requireActor_();
  if (u.role !== 'PHONG_PGD') throw new Error('Chỉ cán bộ QLKH tạo đề nghị mới được hẹn bổ sung.');
  var when = String(at || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(when)) throw new Error('Ngày giờ hẹn bổ sung không hợp lệ.');
  var date = new Date(when);
  if (!isFinite(date.getTime())) throw new Error('Ngày giờ hẹn bổ sung không hợp lệ.');
  var text = String(note || '').trim();
  if (text.length > 300) throw new Error('Ghi chú hẹn bổ sung tối đa 300 ký tự.');
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (OPEN_STATUS.indexOf(item.status) === -1 || !item.assigned_user_id) {
      throw new Error('Chỉ hẹn bổ sung cho hồ sơ đang mở đã giao cán bộ LS.');
    }
    if (expectedVersion === undefined || Number(expectedVersion) !== Number(item.version)) {
      throw new Error('Việc đã được cập nhật. Tải lại trước khi lưu.');
    }
    var req = t.find('Requests', 'request_id', item.request_id);
    if (!req || req.object.unit_id !== u.unit_id || String(req.object.requestor_id || req.object.created_by || '') !== String(u.user_id)) {
      throw new Error('Chỉ cán bộ QLKH tạo đề nghị này mới được hẹn bổ sung.');
    }
    var ts = stamp_(), previous = item.supplement_json || '';
    var entry = { at: date.toISOString(), note: text, by: u.user_id, created_at: ts };
    var fields = { supplement_json: JSON.stringify(entry), version: Number(item.version) + 1, updated_at: ts };
    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'HEN_BO_SUNG', by: u.user_id, at: ts,
      reason: 'Hẹn bổ sung ' + Utilities.formatDate(date, BUSINESS_TIME_ZONE_, 'HH:mm dd/MM/yyyy') + (text ? ' — ' + text : ''),
      before_json: previous, after_json: fields.supplement_json
    });
    inboxNotify_(t, item.assigned_user_id, itemId, 'HEN_BO_SUNG');
    return Object.assign({ ok: true, period_id: item.period_id }, fields);
  }, NOTIFY_WARM_);
  markPlanDirty_(result.period_id, true);
  return result;
}

/** On-demand review; never infer dossier receipt from request creation. */
function getTimingAudit() {
  var u = currentUser_();
  if (['CAN_BO_LS','KS_LS','QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Không có quyền rà soát thời gian.');
  var plan = DataRepository.find('MonthlyPlans','status','ACTIVE');
  var items = DataRepository.getAll('WorkItems').filter(function(i) {
    return plan && i.period_id === plan.period_id && !i.carried_to_item_id && ['HUY','CHO_HOAN_THIEN','CHO_PHAN_CONG'].indexOf(i.status) === -1 &&
      (u.role !== 'CAN_BO_LS' || i.assigned_user_id === u.user_id);
  });
  var now = stamp_(), ids = {}, byItem = {};
  items.forEach(function(i) { ids[i.item_id] = true; });
  var history = DataRepository.tailWhere('Events',20000,function(e) { return !!ids[e.item_id]; },{maxScan:20000});
  history.rows.forEach(function(e) { (byItem[e.item_id] = byItem[e.item_id] || []).push(e); });
  var rows = [];
  items.forEach(function(i) {
    var problems = [], suggestions = {}, sources = {};
    if (!i.dossier_received_at && !LSTiming.awaitingReceipt(i.status)) problems.push('MISSING_HANDOFF');
    if (i.status === 'HOAN_THANH_LS' && !i.completed_at) problems.push('MISSING_COMPLETION');
    var unknown = LSTiming.sessions(i,now).filter(function(s) { return !s.user_id; });
    if (unknown.length) problems.push('UNKNOWN_OPERATOR');
    if ((i.dossier_received_at && !isFinite(new Date(i.dossier_received_at).getTime())) ||
      (i.completed_at && !isFinite(new Date(i.completed_at).getTime())) ||
      (i.dossier_received_at && i.processing_started_at && new Date(i.dossier_received_at) > new Date(i.processing_started_at)) ||
      (i.completed_at && i.dossier_received_at && new Date(i.completed_at) < new Date(i.dossier_received_at)) ||
      (i.completed_at && i.processing_started_at && new Date(i.completed_at) < new Date(i.processing_started_at)) ||
      (i.dossier_received_at && LSTiming.array(i,'processing_sessions').some(function(s){return new Date(s.start)<new Date(i.dossier_received_at);})) ||
      (i.dossier_received_at && new Date(i.dossier_received_at)>new Date(now)) ||
      (i.completed_at && new Date(i.completed_at)>new Date(now))) problems.push('INVALID_ORDER');
    if (!problems.length) return;
    (byItem[i.item_id] || []).sort(function(a,b) { return new Date(b.at)-new Date(a.at); }).forEach(function(e) {
      var after = {}; try { after = JSON.parse(e.after_json || '{}'); } catch(ignore) {}
      ['dossier_received_at','completed_at'].forEach(function(key) {
        if (i[key] || suggestions[key]) return;
        var candidate = after && after[key];
        if (key === 'completed_at' && !candidate && e.type === 'HOAN_THANH_LS') candidate = e.at;
        if (!candidate || (key === 'completed_at' && i.status !== 'HOAN_THANH_LS')) return;
        try {
          var value = validatedTime_(candidate,'Mốc lịch sử',now), at = new Date(value);
          if (key === 'dossier_received_at' && ((i.processing_started_at && at > new Date(i.processing_started_at)) || (i.completed_at && at > new Date(i.completed_at)) ||
            LSTiming.array(i,'processing_sessions').some(function(s){return new Date(s.start)<at;}))) return;
          if (key === 'completed_at' && ((i.dossier_received_at && at < new Date(i.dossier_received_at)) || (i.processing_started_at && at < new Date(i.processing_started_at)))) return;
          suggestions[key] = value; sources[key] = { event_id:e.event_id, type:e.type, at:e.at };
        } catch(ignore) {}
      });
    });
    rows.push({item_id:i.item_id,source_stt:i.source_stt || '',product_name:i.product_name || i.work_type_code,
      status:i.status,user_id:i.assigned_user_id || '',version:Number(i.version),problems:problems,
      suggestions:suggestions,sources:sources,unknown_sessions:unknown.length});
  });
  return {period_id:plan ? plan.period_id : '',rows:rows,history_complete:history.exhausted,checked:items.length,at:now};
}

/** The selected operator is an explicit human confirmation, never an inference. */
function confirmLegacySessionOwner(itemId,userId,reason,expectedVersion) {
  var u = requireActor_();
  if (['CAN_BO_LS','KS_LS','QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Không có quyền xác nhận người xử lý.');
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Nhập lý do xác nhận.');
  var result = DataRepository.tx(function(t) {
    var found = t.find('WorkItems','item_id',itemId);
    if (!found) throw new Error('Không tìm thấy hồ sơ.');
    var i = found.object;
    if (u.role === 'CAN_BO_LS' && i.assigned_user_id !== u.user_id) throw new Error('Không có quyền sửa hồ sơ này.');
    if (i.carried_to_item_id || ['HUY','CHO_HOAN_THIEN','CHO_PHAN_CONG'].indexOf(i.status) !== -1) throw new Error('Hồ sơ này không được điều chỉnh.');
    if (Number(expectedVersion) !== Number(i.version)) throw new Error('Hồ sơ đã được cập nhật. Tải lại trước khi lưu.');
    var now = stamp_(), spans = LSTiming.sessions(i,now);
    if (!spans.some(function(s) { return !s.user_id; })) throw new Error('Không còn phiên chưa xác định người xử lý.');
    var selected = Array.isArray(userId) ? userId : spans.filter(function(s){return !s.user_id;}).map(function(s){return {start:new Date(s.start).toISOString(),user_id:userId};});
    if (!selected.length) throw new Error('Chọn người xử lý ít nhất một phiên.');
    var owners = {};
    selected.forEach(function(selection) {
      var start = new Date(selection.start).getTime(), chosen = String(selection.user_id || '');
      if (!isFinite(start) || owners[start] || !spans.some(function(s){return !s.user_id && s.start === start;})) throw new Error('Phiên xử lý đã thay đổi. Tải lại trước khi lưu.');
      if (u.role === 'CAN_BO_LS' && chosen !== u.user_id) throw new Error('LS chỉ được xác nhận phiên của chính mình.');
      var operator = t.find('Users','user_id',chosen);
      if (!operator || operator.object.role !== 'CAN_BO_LS') throw new Error('Chọn cán bộ LS đã thực hiện phiên.');
      owners[start] = chosen;
    });
    var raw = LSTiming.array(i,'processing_sessions');
    var sessions = raw.length ? raw.map(function(s) {
      var copy=Object.assign({},s);
      if(!copy.user_id && owners[new Date(copy.start).getTime()])copy.user_id=owners[new Date(copy.start).getTime()];
      return copy;
    }) : spans.map(function(s) {
      var original = raw.filter(function(r) { return new Date(r.start).getTime() === s.start; })[0];
      var ongoing = !i.completed_at && (original ? !original.end : s.end === new Date(now).getTime() && CLOCK_RUNNING_.indexOf(i.status) !== -1);
      return {user_id:s.user_id || owners[s.start] || '',work_type_code:s.work_type_code,product_name:s.product_name,
        start:new Date(s.start).toISOString(),end:ongoing ? '' : new Date(s.end).toISOString()};
    });
    var before = JSON.stringify({processing_sessions_json:i.processing_sessions_json || '',processing_started_at:i.processing_started_at || '',pause_log_json:i.pause_log_json || ''});
    var fields = {processing_sessions_json:JSON.stringify(sessions),version:Number(i.version)+1,updated_at:now};
    t.write(found,fields);
    t.append('Events',{event_id:id_('EVT'),item_id:itemId,type:'XAC_NHAN_NGUOI_XU_LY',by:u.user_id,at:now,reason:reason,
      before_json:before,after_json:JSON.stringify({assignments:selected,processing_sessions_json:fields.processing_sessions_json})});
    return {ok:true,period_id:i.period_id,version:fields.version};
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id, true);
  return result;
}

/** Read history only when opened; authorize the dossier before scanning logs. */
function getItemActivity(itemId,opts) {
  var u = currentUser_(), item = DataRepository.find('WorkItems','item_id',itemId);
  if (!item) throw new Error('Không tìm thấy hồ sơ.');
  var req = DataRepository.find('Requests','request_id',item.request_id);
  if ((u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) ||
    (u.role === 'PHONG_PGD' && (!req || req.unit_id !== u.unit_id)) ||
    ['CAN_BO_LS','PHONG_PGD','KS_LS','QUAN_LY_LS','ADMIN'].indexOf(u.role) === -1) throw new Error('Không có quyền xem lịch sử hồ sơ này.');
  opts = opts || {};
  function cursor(value) {
    if (value === undefined || value === null || value === '') return undefined;
    var n = Number(value); if (!isFinite(n) || n < 1 || Math.floor(n) !== n) throw new Error('Mốc lịch sử không hợp lệ.');
    return n;
  }
  var events = DataRepository.tailWhere('Events',100,function(e) { return e.item_id === itemId; },{maxScan:20000,beforeRow:cursor(opts.event_cursor)});
  var sends = DataRepository.tailWhere('NotificationOutbox',100,function(e) { return e.item_id === itemId; },{maxScan:20000,beforeRow:cursor(opts.send_cursor)});
  var names = {}; DataRepository.getAll('Users').forEach(function(x) { names[x.user_id] = x.full_name; });
  return {item_id:itemId,events:events.rows.map(function(e) {
      var row = u.role === 'ADMIN' ? sanitizeAdminEvent_(e) : Object.assign({},e);
      if(u.role === 'ADMIN')row.reason='';
      row.by_name = names[e.by] || e.by; return row;
    }),sends:u.role === 'ADMIN' ? sends.rows.map(function(s){var row=sanitizeAdminOutbox_(s);row.body='';row.note='';row.recipient_name='';return row;}) : sends.rows,
    event_cursor:events.nextBeforeRow,send_cursor:sends.nextBeforeRow,events_more:!events.exhausted,sends_more:!sends.exhausted};
}

/**
 * Nhật ký sự kiện tải theo yêu cầu. Bootstrap không còn mang Events: mỗi lần tải lại phải quét ngược một
 * bảng chỉ-thêm để lấy 800 dòng, kể cả khi người dùng không mở Nhật ký.
 * Trả `limit` dòng mới nhất trong khoảng, kèm con trỏ để xem tiếp. Admin chỉ nhận mốc thời gian, không nhận nội dung.
 */
function getAuditLog(opts) {
  var u = currentUser_();
  if (['CAN_BO_LS', 'PHONG_PGD', 'KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) throw new Error('Không có quyền xem nhật ký.');
  opts = opts || {};
  var from = new Date(opts.from).getTime(), to = new Date(opts.to).getTime();
  if (!isFinite(from) || !isFinite(to) || from > to || to - from > 366 * 86400000) throw new Error('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.');
  var limit = Math.min(Math.max(Math.floor(Number(opts.limit)) || 100, 1), 5000), before;
  if (opts.cursor !== undefined && opts.cursor !== null && opts.cursor !== '') {
    before = Number(opts.cursor);
    if (!isFinite(before) || before < 1 || Math.floor(before) !== before) throw new Error('Mốc nhật ký không hợp lệ.');
  }
  var inScope;
  if (u.role === 'CAN_BO_LS') inScope = function(e) { return e.by === u.user_id; };
  else if (u.role === 'PHONG_PGD') {
    var requestIds = {}, itemIds = {};
    DataRepository.getAll('Requests').forEach(function(r) { if (r.unit_id === u.unit_id) requestIds[r.request_id] = true; });
    DataRepository.getAll('WorkItems').forEach(function(i) { if (requestIds[i.request_id]) itemIds[i.item_id] = true; });
    inScope = function(e) { return !!itemIds[e.item_id]; };
  } else inScope = function(e) { return !!e.item_id; };
  var found = DataRepository.tailWhere('Events', limit, function(e) {
    var at = new Date(e.at).getTime();
    return at >= from && at <= to && inScope(e);
  }, {beforeRow: before, stopWhen: function(e) { return new Date(e.at).getTime() < from - 86400000; }});
  return {events: found.rows.map(function(e) {
      if (u.role === 'ADMIN') return sanitizeAdminEvent_(e);
      var row = Object.assign({}, e); delete row.before_json; delete row.after_json; return row;
    }), cursor: found.nextBeforeRow, more: !found.exhausted,
    config_log: u.role === 'ADMIN' && before === undefined ? configLogRows_().filter(function(c) {
      var at = new Date(c.at).getTime(); return at >= from && at <= to;
    }) : []};
}

function configLogRows_() { return DataRepository.tail('ConfigLog', 300); }

/** Nhật ký cấu hình của Quản trị, tải khi mở mục đó thay vì theo mỗi lần tải lại. */
function getConfigLog() {
  if (currentUser_().role !== 'ADMIN') throw new Error('Chỉ Quản trị xem nhật ký cấu hình.');
  return {rows: configLogRows_()};
}

var GLOBAL_PAUSE_START_ = 'TAM_DUNG_TOAN_BO_BAT_DAU';
var GLOBAL_PAUSE_END_ = 'TAM_DUNG_TOAN_BO_KET_THUC';
var GLOBAL_PAUSE_CATEGORIES_ = {
  'QTTD_TSBĐ': 'Hoàn thiện hồ sơ QTTD/TSBĐ',
  'BAO_CAO': 'Báo cáo',
  'KHAC': 'Khác'
};

/**
 * Việc khác cán bộ LS tự ghi kèm số lượng (không gắn hồ sơ nào). Cộng vào dòng "Khác" của bảng kết quả
 * ngày theo từng người; chi tiết từng loại chỉ hiện khi bung dòng Khác. Khớp OTHER_WORK_TYPES ở js/domain.js.
 */
var OTHER_WORK_CATEGORIES_ = {
  'HOP_DAU_NGAY': 'Họp đầu ngày',
  'XEM_VAN_BAN': 'Xem văn bản',
  'SAP_XEP_KHO': 'Sắp xếp kho hồ sơ',
  'SCAN_HOAN_THIEN': 'Scan hoàn thiện hồ sơ',
  'DINH_GIA_LAI': 'Định giá lại TSBĐ',
  'XUAT_KHO_THU_NO': 'Xuất kho, thu nợ cầm cố'
};
var OTHER_WORK_MAX_QUANTITY_ = 999;

var OTHER_WORK_MEETING_MINUTES_ = 15;

/** Danh sách việc khác gửi lên: mỗi loại một dòng, số lượng nguyên từ 1 đến trần cho phép. */
function normalizeOtherWorks_(works, optional) {
  if (!Array.isArray(works) || !works.length) {
    if (optional) return [];
    throw new Error('Nhập số lượng cho ít nhất một việc.');
  }
  var seen = {};
  return works.map(function (w) {
    var category = String(w && w.category || '').trim();
    if (!OTHER_WORK_CATEGORIES_[category]) throw new Error('Chọn loại việc khác hợp lệ.');
    if (seen[category]) throw new Error('Mỗi loại việc chỉ ghi một lần trong một lượt.');
    seen[category] = true;
    var amount = Number(w.quantity);
    if (!isFinite(amount) || Math.floor(amount) !== amount || amount < 1 || amount > OTHER_WORK_MAX_QUANTITY_) {
      throw new Error('Số lượng phải là số nguyên từ 1 đến ' + OTHER_WORK_MAX_QUANTITY_ + '.');
    }
    return { category: category, quantity: amount };
  });
}

/** Chia `amount` thành các phần nguyên theo tỉ lệ `weights`, tổng đúng bằng `amount` (phần dư về các số dư lớn nhất). */
function apportion_(amount, weights) {
  var total = weights.reduce(function (n, w) { return n + w; }, 0);
  if (!(total > 0) || !(amount > 0)) return weights.map(function () { return 0; });
  var shares = weights.map(function (w, i) { var exact = amount * w / total; return { i: i, base: Math.floor(exact), frac: exact - Math.floor(exact) }; });
  var left = amount - shares.reduce(function (n, x) { return n + x.base; }, 0);
  shares.slice().sort(function (a, b) { return b.frac - a.frac || a.i - b.i; }).slice(0, left).forEach(function (x) { x.base += 1; });
  return shares.map(function (x) { return x.base; });
}

/**
 * Chia số phút làm việc của một lượt Tạm dừng toàn bộ cho các việc khác đã ghi trong lượt đó.
 * Họp đầu ngày cố định 15 phút mỗi lần (không quá thời gian đã dừng); phần còn lại chia đều theo từng loại việc,
 * trong một loại chia theo số lượng. Trả về mảng phút cùng thứ tự `rows` ({ category, quantity }).
 * Khớp D.splitPauseMinutes ở js/domain.js.
 */
function splitPauseMinutes_(totalMinutes, rows) {
  var total = Math.max(0, Math.floor(Number(totalMinutes) || 0)), out = rows.map(function () { return 0; });
  var meeting = [], byType = {}, order = Object.keys(OTHER_WORK_CATEGORIES_).filter(function (c) { return c !== 'HOP_DAU_NGAY'; });
  rows.forEach(function (r, i) {
    if (r.category === 'HOP_DAU_NGAY') meeting.push(i);
    else (byType[r.category] = byType[r.category] || []).push(i);
  });
  var meetingMinutes = Math.min(total, OTHER_WORK_MEETING_MINUTES_ * meeting.reduce(function (n, i) { return n + rows[i].quantity; }, 0));
  apportion_(meetingMinutes, meeting.map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[meeting[k]] = m; });
  var types = order.filter(function (c) { return byType[c]; });
  var each = apportion_(total - meetingMinutes, types.map(function () { return 1; }));
  types.forEach(function (c, n) {
    apportion_(each[n], byType[c].map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[byType[c][k]] = m; });
  });
  return out;
}

/** Số phút làm việc (theo lịch làm việc, bỏ nghỉ trưa/cuối tuần/lễ) giữa hai mốc: cùng cách tính giờ tác nghiệp khác của báo cáo. */
function pauseWorkingMinutes_(t, startedAt, endedAt) {
  var cal = timingCalendar_(t), hours = LSTiming.between(startedAt, endedAt, cal);
  if (hours === null || !isFinite(hours)) return 0;
  // Lượt đã khép trong ngày mà kéo ra ngoài giờ làm việc thì phần ngoài giờ cũng là giờ làm thật, đúng như báo cáo tính.
  var extra = LSTiming.overtime(new Date(startedAt).getTime(), new Date(endedAt).getTime(), cal)
    .reduce(function (n, w) { return n + (w[1] - w[0]) / 3600000; }, 0);
  return Math.max(0, Math.round((hours + extra) * 60));
}

/**
 * Cán bộ LS ghi việc khác trong ngày, mỗi loại một số lượng; ngày ghi do máy chủ đặt theo giờ Việt Nam.
 * Đang trong một lượt Tạm dừng toàn bộ thì các lượt ghi gắn vào lượt đó và được chia giờ khi kết thúc tạm dừng.
 */
function recordOtherWork(works) {
  var u = requireActor_();
  if (u.role !== 'CAN_BO_LS') throw new Error('Chỉ cán bộ LS được ghi việc khác.');
  var list = normalizeOtherWorks_(works, false);
  return DataRepository.tx(function (t) {
    var pause = activeGlobalPause_(globalPauseEvents_(t, u.user_id, 1, 10000).rows, u.user_id);
    var ts = stamp_(), day = localBusinessDate_(ts), saved = [];
    list.forEach(function (w) {
      var row = { work_id: id_('OW'), user_id: u.user_id, work_date: day, category: w.category, quantity: w.quantity,
        minutes: 0, operation_id: pause ? pause.operation_id : '', at: ts, canceled_at: '', canceled_by: '' };
      t.append('OtherWork', row);
      saved.push({ work_id: row.work_id, category: row.category, quantity: row.quantity, minutes: 0, operation_id: row.operation_id });
    });
    return { ok: true, works: saved, work_date: day, at: ts };
  }, { append: ['OtherWork'] });
}

/** Hủy một lượt ghi nhầm: cán bộ chỉ hủy lượt của chính mình trong ngày. Dòng được giữ lại (đánh dấu canceled_at) để đối chiếu. */
function cancelOtherWork(workId) {
  var u = requireActor_();
  if (u.role !== 'CAN_BO_LS') throw new Error('Chỉ cán bộ LS được hủy lượt việc khác.');
  workId = String(workId || '').trim();
  if (!workId) throw new Error('Thiếu lượt việc khác cần hủy.');
  return DataRepository.tx(function (t) {
    var found = t.find('OtherWork', 'work_id', workId);
    if (!found) throw new Error('Không tìm thấy lượt việc khác.');
    var row = found.object;
    if (row.user_id !== u.user_id) throw new Error('Chỉ hủy được lượt do chính bạn ghi.');
    if (row.canceled_at) return { ok: true, work_id: workId, replayed: true };
    if (String(row.work_date) !== localBusinessDate_()) throw new Error('Chỉ hủy được lượt ghi trong ngày hôm nay.');
    var ts = stamp_();
    t.write(found, { canceled_at: ts, canceled_by: u.user_id });
    return { ok: true, work_id: workId };
  }, { warm: ['OtherWork'] });
}

/**
 * Các lượt việc khác của kỳ đang chạy cho bảng kết quả ngày: Kiểm soát/Quản lý/Quản trị thấy mọi người,
 * cán bộ LS chỉ thấy của mình. Bảng chỉ lớn dần nên quét ngược và dừng khi qua đầu kỳ.
 */
function otherWorkForBootstrap_(u, plan) {
  if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) return [];
  var from = String(plan && plan.start_date || '').substring(0, 10);
  var to = String(plan && plan.end_date || '').substring(0, 10);
  return DataRepository.tailWhere('OtherWork', 5000, function (r) {
    if (r.canceled_at) return false;
    if (u.role === 'CAN_BO_LS' && r.user_id !== u.user_id) return false;
    var day = String(r.work_date || '').substring(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  }, { maxScan: 10000, stopWhen: function (r) { return !!from && String(r.work_date || '').substring(0, 10) < from; } }).rows;
}

/** Việc khác trong khoảng ngày của báo cáo thời gian, gộp theo loại: số lượng và số phút đã chia từ các lượt tạm dừng. */
function otherWorkSummary_(from, to, userId) {
  var rows = DataRepository.tailWhere('OtherWork', 5000, function (r) {
    if (r.canceled_at || (userId && r.user_id !== userId)) return false;
    var day = String(r.work_date || '').substring(0, 10);
    return day >= from && day <= to;
  }, { maxScan: 20000, stopWhen: function (r) { return String(r.work_date || '').substring(0, 10) < from; } }).rows;
  var byCategory = {};
  rows.forEach(function (r) {
    if (!OTHER_WORK_CATEGORIES_[r.category]) return;
    var g = byCategory[r.category] || (byCategory[r.category] = { category: r.category, label: OTHER_WORK_CATEGORIES_[r.category], quantity: 0, minutes: 0 });
    g.quantity += Math.max(1, Number(r.quantity) || 1);
    g.minutes += Math.max(0, Number(r.minutes) || 0);
  });
  return Object.keys(OTHER_WORK_CATEGORIES_).filter(function (c) { return byCategory[c]; }).map(function (c) { return byCategory[c]; });
}

/**
 * Mã các lượt Tạm dừng toàn bộ đã được gắn việc khác có số phút (từ ngày `from` trở đi). Lượt "Khác" như vậy là giờ làm thật
 * của cán bộ nên báo cáo tính vào giờ cán bộ; lượt "Khác" không ghi việc nào thì vẫn chỉ là thời gian dừng.
 */
function attributedPauseIds_(from, userId) {
  var ids = {};
  DataRepository.tailWhere('OtherWork', 5000, function (r) {
    if (r.canceled_at || !r.operation_id || (userId && r.user_id !== userId)) return false;
    return Number(r.minutes) > 0 && String(r.work_date || '').substring(0, 10) >= from;
  }, { maxScan: 20000, stopWhen: function (r) { return String(r.work_date || '').substring(0, 10) < from; } }).rows.forEach(function (r) { ids[r.operation_id] = true; });
  return ids;
}

function globalPauseEvents_(reader, userId, limit, maxScan) {
  return reader.tailWhere('Events', limit || 2000, function(e) {
    return (!userId || e.by === userId) && [GLOBAL_PAUSE_START_, GLOBAL_PAUSE_END_].indexOf(e.type) !== -1;
  }, {maxScan:maxScan || 50000});
}

function globalPausePayload_(event, key) {
  try { return JSON.parse(event[key] || '{}') || {}; } catch (ignore) { return {}; }
}

function activeGlobalPause_(events, userId) {
  var ended = {}, starts = {};
  (events || []).forEach(function(e) {
    if (userId && e.by !== userId) return;
    if (e.type === GLOBAL_PAUSE_END_) {
      var end = globalPausePayload_(e, 'before_json');
      if (end.operation_id) ended[end.operation_id] = true;
    } else if (e.type === GLOBAL_PAUSE_START_) {
      var start = globalPausePayload_(e, 'after_json');
      var id = start.operation_id || e.event_id;
      starts[id] = {operation_id:id,category:start.category || e.reason,started_at:start.started_at || e.at,
        paused_item_id:start.paused_item_id || ''};
    }
  });
  return Object.keys(starts).map(function(id) { return starts[id]; })
    .filter(function(op) { return !ended[op.operation_id]; })
    .sort(function(a,b) { return String(b.started_at).localeCompare(String(a.started_at)); })[0] || null;
}

function globalPauseSpans_(events, now, userId) {
  var starts = {}, ended = {};
  (events || []).forEach(function(e) {
    if (userId && e.by !== userId) return;
    if (e.type === GLOBAL_PAUSE_START_) {
      var start = globalPausePayload_(e, 'after_json');
      var id = start.operation_id || e.event_id;
      starts[id] = {operation_id:id,user_id:e.by,category:start.category || e.reason,
        category_label:GLOBAL_PAUSE_CATEGORIES_[start.category || e.reason] || 'Tác nghiệp khác',
        started_at:start.started_at || e.at,paused_item_id:start.paused_item_id || ''};
    } else if (e.type === GLOBAL_PAUSE_END_) {
      var end = globalPausePayload_(e, 'before_json');
      if (end.operation_id) ended[end.operation_id] = e.at;
    }
  });
  return Object.keys(starts).map(function(id) {
    var op = starts[id]; op.ended_at = ended[id] || '';
    // Lượt chưa kết thúc chạy đến "bây giờ" nhưng chưa khép, nên chưa được tính giờ ngoài lịch.
    op.closed = !!op.ended_at;
    if (!op.ended_at) op.ended_at = now;
    return op;
  });
}

function getTimeReport(opts) {
  var u = currentUser_();
  if (['CAN_BO_LS','KS_LS','QUAN_LY_LS','ADMIN','GIAM_SAT'].indexOf(u.role) === -1) throw new Error('Không có quyền xem báo cáo thời gian.');
  opts = opts || {};
  var from = String(opts.from || ''), to = String(opts.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to ||
    !isFinite(new Date(from).getTime()) || !isFinite(new Date(to).getTime()) || new Date(to)-new Date(from)>366*86400000) throw new Error('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.');
  var userId = u.role === 'CAN_BO_LS' ? u.user_id : String(opts.user_id || '');
  if(new Date(from).toISOString().substring(0,10)!==from || new Date(to).toISOString().substring(0,10)!==to || new Date(to)-new Date(from)>365*86400000) throw new Error('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.');
  var allItems = DataRepository.getAll('WorkItems'), workTypes = DataRepository.getAll('WorkTypes');
  var exemptByItem = slaExemptByItem_(allItems, workTypes);
  var items = allItems.map(function(i) { var copy = Object.assign({}, i); copy.sla_no_fault = !!exemptByItem[i.item_id]; return copy; });
  if (u.role === 'CAN_BO_LS') items = items.filter(function(i) { return i.assigned_user_id===u.user_id || LSTiming.array(i,'processing_sessions').some(function(s) { return s.user_id===u.user_id; }); });
  if (u.role === 'ADMIN' || u.role === 'GIAM_SAT') items = items.map(function(i) {
    return sanitizeAdminItem_(i);
  });
  var now=stamp_(),pauseHistory = globalPauseEvents_(DataRepository,userId,25000,100000);
  var attributed = opts.work_type_code ? {} : attributedPauseIds_(from, userId);
  var operations = globalPauseSpans_(pauseHistory.rows,now,userId).map(function(op) {
    if (op.category === 'KHAC' && attributed[op.operation_id]) op.counted = true;
    return op;
  });
  var report = LSTiming.report(items,timingCalendar_(),{from:from,to:to,user_id:userId,work_type_code:String(opts.work_type_code || ''),
    now:now,operations:operations});
  if (!pauseHistory.exhausted) report.quality.other_operations_scan_limited = true;
  report.other_work = opts.work_type_code ? [] : otherWorkSummary_(from, to, userId);
  var users={},types={};
  DataRepository.getAll('Users').forEach(function(x) { users[x.user_id]=x.full_name; });
  workTypes.forEach(function(x) { types[x.type_code]=x.display_name; });
  report.rows.forEach(function(r) { r.user_name=users[r.user_id] || 'Chưa xác định';r.work_type_name=r.work_type_code==='TAC_NGHIEP_KHAC'?'Tác nghiệp khác':types[r.work_type_code] || r.work_type_code; });
  return report;
}

/**
 * Màn "Phân giao toàn phòng": cán bộ LS chỉ xem được việc của mình, nên cần một
 * đường đọc riêng, chỉ-đọc, trả về bản rút gọn việc đã giao của cả phòng để biết ai
 * đang làm gì và khách nào đã được giao việc trong tuần. Không trả số điện thoại,
 * email hay ghi chú: khóa khách là mã băm, đủ để gom cùng một khách.
 */
function getRecentCustomerAssignees(itemId) {
  var actor = currentUser_();
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(actor.role) === -1) throw new Error('Không có quyền xem gợi ý phân công.');

  var items = DataRepository.getAll('WorkItems');
  var target = items.filter(function (item) { return item.item_id === String(itemId || ''); })[0];
  if (!target) return [];

  var requests = {};
  DataRepository.getAll('Requests').forEach(function (request) { requests[request.request_id] = request; });
  var users = {};
  DataRepository.getAll('Users').forEach(function (user) {
    if (String(user.role || '').trim().toUpperCase() === 'CAN_BO_LS' && truthy_(user.is_active)) users[user.user_id] = user.full_name || user.user_id;
  });

  function profile_(request) {
    request = request || {};
    return {
      cif: String(request.cif || '').trim().toLowerCase().replace(/\s+/g, ''),
      phone: normalizePhone_(request.phone),
      name: String(request.customer_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    };
  }
  function sameCustomer_(a, b) {
    if (a.cif && b.cif) return a.cif === b.cif;
    if (a.phone && b.phone) return a.phone === b.phone;
    if (a.cif || b.cif || a.phone || b.phone) return false;
    return !!a.name && a.name === b.name;
  }

  var targetRequest = requests[target.request_id] || {}, targetProfile = profile_(targetRequest);
  if (!targetProfile.cif && !targetProfile.phone && !targetProfile.name) return [];

  // Từ thứ Hai của tuần trước đến hết ngày hiện tại theo giờ Việt Nam.
  var today = LSTiming.dayKey(stamp_()), monday = new Date(today + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7);
  var from = monday.toISOString().substring(0, 10), summaries = {};
  items.forEach(function (item) {
    if (item.item_id === target.item_id || item.status !== 'HOAN_THANH_LS' || !item.completed_at || item.carried_to_item_id || !users[item.assigned_user_id]) return;
    var completed = new Date(item.completed_at);
    if (!isFinite(completed.getTime())) return;
    var day = LSTiming.dayKey(completed.toISOString());
    if (day < from || day > today || !sameCustomer_(targetProfile, profile_(requests[item.request_id]))) return;
    var row = summaries[item.assigned_user_id] || (summaries[item.assigned_user_id] = {
      user_id: item.assigned_user_id, full_name: users[item.assigned_user_id], completed_count: 0, last_completed_at: ''
    });
    row.completed_count += 1;
    var completedAt = completed.toISOString();
    if (!row.last_completed_at || completedAt > row.last_completed_at) row.last_completed_at = completedAt;
  });
  return Object.keys(summaries).map(function (id) { return summaries[id]; }).sort(function (a, b) {
    return b.last_completed_at.localeCompare(a.last_completed_at) || b.completed_count - a.completed_count || a.full_name.localeCompare(b.full_name);
  });
}

function getTeamAssignments(opts) {
  var u = currentUser_();
  if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Không có quyền xem phân giao toàn phòng.');
  opts = opts || {};
  var from = String(opts.from || ''), to = String(opts.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to ||
    !isFinite(new Date(from).getTime()) || !isFinite(new Date(to).getTime()) || new Date(to) - new Date(from) > 62 * 86400000) {
    throw new Error('Chọn khoảng ngày hợp lệ, tối đa 62 ngày.');
  }
  var requests = {};
  DataRepository.getAll('Requests').forEach(function (r) { requests[r.request_id] = r; });
  var units = {}, users = {}, types = {};
  DataRepository.getAll('Units').forEach(function (x) { units[x.unit_id] = x.name || x.unit_id; });
  DataRepository.getAll('Users').forEach(function (x) { users[x.user_id] = x.full_name || x.user_id; });
  var workTypeRows = DataRepository.getAll('WorkTypes');
  workTypeRows.forEach(function (x) { types[x.type_code] = x.display_name || x.type_code; });

  function key_(r) {
    var raw = String(r.cif || '').trim().toLowerCase();
    if (raw) raw = 'cif:' + raw;
    else {
      var phone = String(r.phone || '').replace(/\D/g, '');
      raw = phone ? 'tel:' + phone : 'ten:' + String(r.customer_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw).map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    }).join('').substring(0, 12);
  }

  var allItems = DataRepository.getAll('WorkItems');
  var exemptByItem = slaExemptByItem_(allItems, workTypeRows);
  var open = {};
  OPEN_STATUS.forEach(function (s) { open[s] = true; });
  var rows = [];
  allItems.forEach(function (i) {
    if (!i.assigned_user_id || i.status === 'HUY' || i.carried_to_item_id) return;
    var day = i.assigned_at ? LSTiming.dayKey(i.assigned_at) : String(i.occurrence_date || '').substring(0, 10);
    var inWindow = day >= from && day <= to;
    // Việc còn mở vẫn hiện dù giao từ trước kỳ: cán bộ khác cần biết khách đang được xử lý.
    if (!inWindow && !open[i.status]) return;
    var r = requests[i.request_id] || {};
    rows.push({
      item_id: i.item_id, customer_name: r.customer_name || '', cif: r.cif || '', cust_key: key_(r),
      unit_name: units[r.unit_id] || r.unit_id || '', work_type_name: types[i.work_type_code] || i.work_type_code,
      product_name: i.product_name || '', assigned_user_id: i.assigned_user_id, assigned_name: users[i.assigned_user_id] || '',
      assigned_at: i.assigned_at || '', status: i.status, due_at: i.due_at || '', completed_at: i.completed_at || '',
      in_window: inWindow, is_mine: i.assigned_user_id === u.user_id,
      sla_no_fault: !!exemptByItem[i.item_id]
    });
  });
  rows.sort(function (a, b) { return String(b.assigned_at).localeCompare(String(a.assigned_at)); });
  var capped = rows.length > 3000;
  return { from: from, to: to, rows: capped ? rows.slice(0, 3000) : rows, capped: capped, generated_at: stamp_() };
}

/**
 * Số liệu một kỳ, tách theo bốn chiều. Chỉ số được chọn sao cho **cộng dồn qua
 * nhiều kỳ vẫn đúng**:
 *
 *  - `phat_sinh` đếm việc phát sinh mới trong kỳ, không đếm việc chuyển tiếp từ
 *    kỳ trước. Mỗi việc thật vì thế chỉ được tính đúng một lần trên toàn bộ
 *    lịch sử, dù nó kéo dài bao nhiêu tháng.
 *  - `hoan_thanh`, `huy`, `qua_han` gắn với một thời điểm nên cũng chỉ xảy ra
 *    một lần.
 *  - `ton_cuoi_ky` là ảnh chụp tại thời điểm kỳ đóng; cộng dồn sẽ vô nghĩa nên
 *    báo cáo nhiều kỳ lấy giá trị của kỳ cuối cùng.
 *  - Giữ `tong_gio_xu_ly` thay vì giờ trung bình: trung bình của nhiều trung
 *    bình không phải trung bình.
 */
var PERIOD_SUMMARY_TIMING_VERSION_ = 'sla_time_v4';

function periodSummaryRows_(periodId, allItems, exemptByItem) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan) return [];
  allItems = allItems || DataRepository.getAll('WorkItems');
  exemptByItem = exemptByItem || slaExemptByItem_(allItems, DataRepository.getAll('WorkTypes'));

  var requests = {};
  DataRepository.getAll('Requests').forEach(function (r) { requests[r.request_id] = r; });
  var units = {};
  DataRepository.getAll('Units').forEach(function (x) { units[x.unit_id] = x.name || x.unit_id; });
  var types = {};
  DataRepository.getAll('WorkTypes').forEach(function (x) { types[x.type_code] = x.display_name || x.type_code; });
  var users = {};
  DataRepository.getAll('Users').forEach(function (x) { users[x.user_id] = x.full_name || x.user_id; });

  var items = allItems.filter(function (i) { return i.period_id === periodId; });
  var now = stamp_(), timingCal = timingCalendar_();
  var buckets = {};

  function bucket_(dimension, key, label) {
    var id = dimension + '\u0000' + key;
    if (!buckets[id]) {
      buckets[id] = { dimension: dimension, dim_key: key, dim_label: label,
        phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0, ton_cuoi_ky: 0, qua_han: 0,
        tong_gio_tiep_nhan: 0, so_tiep_nhan: 0, tong_gio_phan_cong: 0, so_phan_cong: 0,
        tong_gio_xu_ly: 0, so_xu_ly: 0, tong_gio_toan_trinh: 0, so_toan_trinh: 0 };
    }
    return buckets[id];
  }

  items.forEach(function (i) {
    var req = requests[i.request_id] || {};
    var done = i.status === 'HOAN_THANH_LS';
    var timing = i.carried_to_item_id ? {tiep_nhan:null,phan_cong:null,xu_ly:null,toan_trinh:null} : LSTiming.metrics(i,timingCal,i.completed_at || now);
    if (!done) { timing.xu_ly = null; timing.toan_trinh = null; }
    // Việc đã chuyển sang kỳ sau được chấm trễ ở dòng cuối của nó, không phải
    // ở mỗi kỳ nó đi qua — nếu không một việc trễ đếm thành ba lần trễ.
    // Việc đã hủy không bao giờ là quá hạn; việc đang chờ khách/tạm dừng thì hạn đứng yên.
    var late = !slaExemptItem_(i, exemptByItem) && i.due_at && !i.carried_to_item_id
      ? (done ? String(i.completed_at || '') > String(i.due_at) : isLateOpen_(i, new Date(now).getTime()))
      : false;

    var targets = [
      bucket_('TONG', '', 'Toàn hệ thống'),
      bucket_('DON_VI', req.unit_id || '', units[req.unit_id] || req.unit_id || 'Chưa rõ đơn vị'),
      bucket_('LOAI_VIEC', i.work_type_code || '', types[i.work_type_code] || i.work_type_code || 'Chưa rõ loại việc'),
      bucket_('CAN_BO', i.assigned_user_id || '', i.assigned_user_id ? (users[i.assigned_user_id] || i.assigned_user_id) : 'Chưa giao')
    ];

    targets.forEach(function (b) {
      if (i.carryover_from_item_id) b.chuyen_tiep_vao += 1; else b.phat_sinh += 1;
      if (timing.tiep_nhan !== null) { b.tong_gio_tiep_nhan += timing.tiep_nhan; b.so_tiep_nhan += 1; }
      if (timing.phan_cong !== null) { b.tong_gio_phan_cong += timing.phan_cong; b.so_phan_cong += 1; }
      // 0 giờ trong lịch là chưa đo được (làm ngoài giờ), không đưa vào trung bình.
      if (timing.xu_ly > 0) { b.tong_gio_xu_ly += timing.xu_ly; b.so_xu_ly += 1; }
      if (timing.toan_trinh !== null) { b.tong_gio_toan_trinh += timing.toan_trinh; b.so_toan_trinh += 1; }
      if (done) b.hoan_thanh += 1;
      if (i.status === 'HUY') b.huy += 1;
      // Tồn cuối kỳ là số việc mở ở thời điểm chốt, kể cả hồ sơ đã sinh dòng tiếp ở kỳ sau.
      if (OPEN_STATUS.indexOf(i.status) !== -1) b.ton_cuoi_ky += 1;
      if (late) b.qua_han += 1;
    });
  });

  return Object.keys(buckets).map(function (k) {
    var b = buckets[k];
    b.period_id = periodId;
    b.month_key = plan.month_key;
    ['tong_gio_tiep_nhan', 'tong_gio_phan_cong', 'tong_gio_xu_ly', 'tong_gio_toan_trinh'].forEach(function (key) {
      b[key] = Math.round(b[key] * 100) / 100;
    });
    b.gio_tiep_nhan_tb = b.so_tiep_nhan ? Math.round((b.tong_gio_tiep_nhan / b.so_tiep_nhan) * 10) / 10 : 0;
    b.gio_phan_cong_tb = b.so_phan_cong ? Math.round((b.tong_gio_phan_cong / b.so_phan_cong) * 10) / 10 : 0;
    b.gio_xu_ly_tb = b.so_xu_ly ? Math.round((b.tong_gio_xu_ly / b.so_xu_ly) * 10) / 10 : 0;
    b.gio_toan_trinh_tb = b.so_toan_trinh ? Math.round((b.tong_gio_toan_trinh / b.so_toan_trinh) * 10) / 10 : 0;
    return b;
  });
}

/** Chốt số liệu một kỳ vào PeriodSummary. Chạy lại thì ghi đè, không nhân bản. */
function writePeriodSummary_(periodId) {
  var rows = periodSummaryRows_(periodId);
  DataRepository.tx(function (t) {
    var existing = {};
    t.rows('PeriodSummary').forEach(function (r) {
      if (r.period_id === periodId) existing[r.dimension + '\u0000' + r.dim_key] = r.summary_id;
    });
    rows.forEach(function (row) {
      var key = row.dimension + '\u0000' + row.dim_key;
      var fields = {
        period_id: row.period_id, month_key: row.month_key, dimension: row.dimension,
        dim_key: row.dim_key, dim_label: row.dim_label, phat_sinh: row.phat_sinh,
        chuyen_tiep_vao: row.chuyen_tiep_vao, hoan_thanh: row.hoan_thanh, huy: row.huy,
        ton_cuoi_ky: row.ton_cuoi_ky, qua_han: row.qua_han,
        tong_gio_tiep_nhan: row.tong_gio_tiep_nhan, so_tiep_nhan: row.so_tiep_nhan,
        tong_gio_phan_cong: row.tong_gio_phan_cong, so_phan_cong: row.so_phan_cong,
        tong_gio_xu_ly: row.tong_gio_xu_ly, so_xu_ly: row.so_xu_ly,
        tong_gio_toan_trinh: row.tong_gio_toan_trinh, so_toan_trinh: row.so_toan_trinh,
        timing_formula_version: PERIOD_SUMMARY_TIMING_VERSION_, updated_at: stamp_()
      };
      if (existing[key]) {
        var found = t.find('PeriodSummary', 'summary_id', existing[key]);
        if (found) t.write(found, fields);
      } else {
        fields.summary_id = id_('SUM');
        t.append('PeriodSummary', fields);
      }
    });
    return true;
  });
  return rows.length;
}

/** Dựng lại số liệu chốt cho mọi kỳ. Gọi tay khi nghi số liệu lệch. */
function rebuildPeriodSummaries() {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) {
    throw new Error('Vai trò ' + u.role + ' không được dựng lại số liệu báo cáo.');
  }
  var plans = DataRepository.getAll('MonthlyPlans');
  var done = plans.map(function (p) {
    return { month_key: p.month_key, rows: writePeriodSummary_(p.period_id), score: writeOperationalScoreSnapshot_(p.period_id) };
  });
  Logger.log(JSON.stringify(done));
  return { periods: done.length, detail: done };
}

var REPORT_DIMENSION = { unit: 'DON_VI', work_type: 'LOAI_VIEC', staff: 'CAN_BO', total: 'TONG' };

/**
 * Báo cáo nhiều kỳ: tháng, quý, năm hay bất kỳ khoảng nào.
 *
 * Trả về **số liệu đã tổng hợp**, không trả dòng việc: một báo cáo năm chạm tới
 * hàng nghìn việc nhưng chỉ cần gửi về vài chục dòng.
 *
 * Kỳ đã đóng đọc từ PeriodSummary; kỳ đang chạy tính trực tiếp vì số liệu của
 * nó còn thay đổi từng giờ.
 */
function getReport(opts) {
  var u = currentUser_();
  if (['KS_LS', 'QUAN_LY_LS', 'ADMIN', 'GIAM_SAT'].indexOf(u.role) === -1) {
    throw new Error('Vai trò ' + u.role + ' không được xem báo cáo tổng hợp.');
  }
  opts = opts || {};
  var group = REPORT_DIMENSION[String(opts.group || 'unit')] ? String(opts.group || 'unit') : 'unit';
  var dimension = REPORT_DIMENSION[group];

  var from = String(opts.from || '');
  var to = String(opts.to || '');
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) throw new Error('Khoảng báo cáo phải có dạng YYYY-MM.');
  if (from > to) { var swap = from; from = to; to = swap; }

  var allReportItems = DataRepository.getAll('WorkItems');
  var allReportExemptByItem = slaExemptByItem_(allReportItems, DataRepository.getAll('WorkTypes'));
  var plans = DataRepository.getAll('MonthlyPlans')
    .filter(function (p) { return p.month_key >= from && p.month_key <= to; })
    .sort(function (a, b) { return String(a.month_key).localeCompare(String(b.month_key)); });

  var stored = {};
  DataRepository.getAll('PeriodSummary').forEach(function (r) {
    (stored[r.period_id] = stored[r.period_id] || []).push(r);
  });

  var months = [];
  var totals = {};
  var lastSnapshot = {};

  plans.forEach(function (plan) {
    var storedRows = stored[plan.period_id] || [];
    // Kho cũ chưa chạy setupSheetDB() sẽ không có các cột timing trong object
    // đọc ra. Tính lại từ WorkItems để báo cáo không im lặng trả toàn số 0;
    // khi quản trị chạy migration, kỳ ARCHIVED sẽ lại dùng snapshot đã chốt.
    var hasTimingColumns = storedRows.length > 0 && storedRows.every(function (r) {
      return r.timing_formula_version === PERIOD_SUMMARY_TIMING_VERSION_;
    });
    var rows = plan.status === 'ARCHIVED' && storedRows.length && hasTimingColumns
      ? storedRows
      : periodSummaryRows_(plan.period_id, allReportItems, allReportExemptByItem);

    var monthTotal = { month_key: plan.month_key, name: plan.name, status: plan.status,
      phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0, ton_cuoi_ky: 0, qua_han: 0,
      tong_gio_tiep_nhan: 0, so_tiep_nhan: 0, tong_gio_phan_cong: 0, so_phan_cong: 0,
      tong_gio_xu_ly: 0, so_xu_ly: 0, tong_gio_toan_trinh: 0, so_toan_trinh: 0 };
    var snapshot = {};

    rows.forEach(function (r) {
      if (String(r.dimension) === 'TONG') {
        ['phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'ton_cuoi_ky', 'qua_han',
          'tong_gio_tiep_nhan', 'so_tiep_nhan', 'tong_gio_phan_cong', 'so_phan_cong',
          'tong_gio_xu_ly', 'so_xu_ly', 'tong_gio_toan_trinh', 'so_toan_trinh']
          .forEach(function (k) { monthTotal[k] += Number(r[k] || 0); });
        return;
      }
      if (String(r.dimension) !== dimension) return;

      var key = String(r.dim_key || '');
      var acc = totals[key] || (totals[key] = { key: key, label: r.dim_label || key || 'Chưa rõ',
        phat_sinh: 0, chuyen_tiep_vao: 0, hoan_thanh: 0, huy: 0, qua_han: 0,
        tong_gio_tiep_nhan: 0, so_tiep_nhan: 0, tong_gio_phan_cong: 0, so_phan_cong: 0,
        tong_gio_xu_ly: 0, so_xu_ly: 0, tong_gio_toan_trinh: 0, so_toan_trinh: 0 });
      acc.label = r.dim_label || acc.label;
      ['phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'qua_han',
        'tong_gio_tiep_nhan', 'so_tiep_nhan', 'tong_gio_phan_cong', 'so_phan_cong',
        'tong_gio_xu_ly', 'so_xu_ly', 'tong_gio_toan_trinh', 'so_toan_trinh']
        .forEach(function (k) { acc[k] += Number(r[k] || 0); });
      // Tồn là ảnh chụp: giữ riêng theo kỳ rồi lấy kỳ cuối, không cộng dồn.
      snapshot[key] = Number(r.ton_cuoi_ky || 0);
    });

    months.push(monthTotal);
    if (Object.keys(snapshot).length) lastSnapshot = snapshot;
    else if (rows.length) lastSnapshot = {};
  });

  var rows = Object.keys(totals).map(function (k) {
    var r = totals[k];
    r.ton_cuoi_ky = Number(lastSnapshot[k] || 0);
    r.gio_tiep_nhan_tb = r.so_tiep_nhan ? Math.round((r.tong_gio_tiep_nhan / r.so_tiep_nhan) * 10) / 10 : 0;
    r.gio_phan_cong_tb = r.so_phan_cong ? Math.round((r.tong_gio_phan_cong / r.so_phan_cong) * 10) / 10 : 0;
    r.gio_xu_ly_tb = r.so_xu_ly ? Math.round((r.tong_gio_xu_ly / r.so_xu_ly) * 10) / 10 : 0;
    r.gio_toan_trinh_tb = r.so_toan_trinh ? Math.round((r.tong_gio_toan_trinh / r.so_toan_trinh) * 10) / 10 : 0;
    return r;
  }).sort(function (a, b) { return b.phat_sinh - a.phat_sinh || String(a.label).localeCompare(String(b.label)); });

  var total = months.reduce(function (acc, m) {
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

  return { from: from, to: to, group: group, months: months, rows: rows, total: total,
    periods: plans.length, generated_at: stamp_() };
}

/**
 * Điểm vận hành do máy chủ tính để Admin không phụ thuộc vào dữ liệu đã sửa ở trình duyệt.
 * 60 điểm đúng hạn + 25 điểm hoàn thành + 15 điểm không tồn quá hạn.
 */
var SCORE_FORMULA_VERSION = 'score_formula_v2';

function operationalScorecard_(items, users, fromDate, toDate, now, exemptByItem) {
  var from = dateOnly_(fromDate), to = dateOnly_(toDate);
  var at = now instanceof Date ? now : new Date(now || stamp_());
  var staff = (users || []).filter(function (u) {
    return String(u.role || '').trim().toUpperCase() === 'CAN_BO_LS' && truthy_(u.is_active);
  });
  var byUser = {};
  staff.forEach(function (u) {
    byUser[u.user_id] = { user: { user_id: u.user_id, full_name: u.full_name || u.user_id },
      eligible: 0, done: 0, timedDone: 0, slaExemptEligible: 0, slaExemptDone: 0, onTime: 0, lateOpen: 0, open: 0 };
  });

  (items || []).forEach(function (item) {
    var day = dateOnly_(item.occurrence_date || item.submitted_at);
    var row = byUser[item.assigned_user_id];
    if (!row || !day || (from && day < from) || (to && day > to) || item.status === 'HUY' || item.carried_to_item_id) return;
    row.eligible += 1;
    var exempt = slaExemptItem_(item, exemptByItem);
    if (exempt) row.slaExemptEligible += 1;
    if (item.status === 'HOAN_THANH_LS') {
      row.done += 1;
      if (exempt) row.slaExemptDone += 1;
      else if (item.due_at && item.completed_at) {
        row.timedDone += 1;
        if (new Date(item.completed_at).getTime() <= new Date(item.due_at).getTime()) row.onTime += 1;
      }
    }
    if (OPEN_STATUS.indexOf(item.status) !== -1) {
      if (!exempt) {
        row.open += 1;
        if (isLateOpen_(item, at.getTime(), exemptByItem)) row.lateOpen += 1;
      }
    }
  });

  return staff.map(function (u) {
    var row = byUser[u.user_id];
    if (!row.eligible) {
      row.score = null; row.onTimeRate = null; row.completionRate = null; row.backlogRate = null;
      row.dataQuality = 'NO_WORK';
      return row;
    }
    // Không chấm đúng hạn khi kỳ không có mốc SLA hợp lệ; tránh phạt hoặc
    // thưởng ngầm do dữ liệu thiếu due_at.
    if (!row.timedDone) {
      row.score = null; row.onTimeRate = null;
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
    if (a.score === null && b.score === null) return String(a.user.full_name).localeCompare(String(b.user.full_name));
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || String(a.user.full_name).localeCompare(String(b.user.full_name));
  });
}

/** Re-project old snapshots with the active formula in the read response; do not write Sheets here. */
function currentOperationalScoreSnapshots_(snapshots, plans, items, users, exemptByItem) {
  snapshots = snapshots || [];
  var planById = {}, rowsByPeriod = {}, needsRefresh = {};
  (plans || []).forEach(function (plan) { planById[plan.period_id] = plan; });
  snapshots.forEach(function (snapshot) {
    if (snapshot.formula_version !== SCORE_FORMULA_VERSION) needsRefresh[snapshot.period_id] = true;
  });
  Object.keys(needsRefresh).forEach(function (periodId) {
    var plan = planById[periodId];
    if (!plan || plan.status !== 'ARCHIVED') return;
    var periodItems = (items || []).filter(function (item) { return item.period_id === periodId; });
    var end = new Date(String(plan.end_date || '').substring(0, 10) + 'T23:59:59+07:00');
    var scores = operationalScorecard_(periodItems, users, plan.start_date, plan.end_date, end, exemptByItem);
    rowsByPeriod[periodId] = {};
    scores.forEach(function (row) { rowsByPeriod[periodId][row.user.user_id] = row; });
  });
  return snapshots.map(function (snapshot) {
    if (snapshot.formula_version === SCORE_FORMULA_VERSION) return snapshot;
    var row = rowsByPeriod[snapshot.period_id] && rowsByPeriod[snapshot.period_id][snapshot.user_id];
    if (!row) return snapshot;
    return Object.assign({}, snapshot, {
      formula_version: SCORE_FORMULA_VERSION, eligible: row.eligible, done: row.done,
      timed_done: row.timedDone, on_time: row.onTime, late_open: row.lateOpen, open: row.open,
      on_time_rate: row.onTimeRate == null ? '' : row.onTimeRate,
      completion_rate: row.completionRate == null ? '' : row.completionRate,
      backlog_rate: row.backlogRate == null ? '' : row.backlogRate,
      score: row.score == null ? '' : row.score, data_quality: row.dataQuality || ''
    });
  });
}

/** Chốt điểm kỳ đã đóng; chỉ tính lại snapshot cũ khi công thức được nâng phiên bản. */
function writeOperationalScoreSnapshot_(periodId) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan) throw new Error('Không tìm thấy kỳ ' + periodId + '.');
  if (plan.status !== 'ARCHIVED') {
    return { period_id: periodId, month_key: plan.month_key, rows: 0, skipped: true,
      reason: 'Chỉ chốt điểm khi kỳ đã đóng', formula_version: SCORE_FORMULA_VERSION };
  }
  var allItems = DataRepository.getAll('WorkItems');
  var exemptByItem = slaExemptByItem_(allItems, DataRepository.getAll('WorkTypes'));
  var items = allItems.filter(function (i) { return i.period_id === periodId; });
  var rows = operationalScorecard_(items, DataRepository.getAll('Users'), plan.start_date, plan.end_date,
    new Date(String(plan.end_date || '').substring(0, 10) + 'T23:59:59+07:00'), exemptByItem);
  var capturedAt = stamp_();
  DataRepository.tx(function (t) {
    var existing = {};
    t.rows('OperationalScoreSnapshots').forEach(function (r) {
      existing[r.period_id + '\u0000' + r.user_id] = r.snapshot_id;
    });
    rows.forEach(function (row) {
      var key = periodId + '\u0000' + row.user.user_id;
      var fields = {
        period_id: periodId, month_key: plan.month_key, formula_version: SCORE_FORMULA_VERSION,
        user_id: row.user.user_id, full_name: row.user.full_name, eligible: row.eligible,
        done: row.done, timed_done: row.timedDone, on_time: row.onTime, late_open: row.lateOpen,
        open: row.open, on_time_rate: row.onTimeRate == null ? '' : row.onTimeRate,
        completion_rate: row.completionRate == null ? '' : row.completionRate,
        backlog_rate: row.backlogRate == null ? '' : row.backlogRate,
        score: row.score == null ? '' : row.score, data_quality: row.dataQuality || '',
        captured_at: capturedAt, captured_by: 'SYSTEM'
      };
      if (existing[key] && plan.status !== 'ARCHIVED') {
        var found = t.find('OperationalScoreSnapshots', 'snapshot_id', existing[key]);
        if (found) t.write(found, fields);
      } else if (existing[key]) {
        var archived = t.find('OperationalScoreSnapshots', 'snapshot_id', existing[key]);
        if (archived && archived.formula_version !== SCORE_FORMULA_VERSION) t.write(archived, fields);
      } else if (!existing[key]) {
        fields.snapshot_id = id_('SCORE');
        t.append('OperationalScoreSnapshots', fields);
      }
    });
  });
  return { period_id: periodId, month_key: plan.month_key, rows: rows.length, captured_at: capturedAt,
    formula_version: SCORE_FORMULA_VERSION };
}

/* ---------------------------- Đọc dữ liệu ---------------------------- */

/** ADMIN chỉ cần dữ liệu vận hành, không nhận dữ liệu định danh khách hàng. */
function sanitizeAdminRequest_(row) {
  var out = {};
  ['request_id', 'period_id', 'origin_request_id', 'carryover_from_request_id', 'unit_id',
    'created_by', 'requestor_id', 'requestor_kind', 'created_at', 'updated_at'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
  });
  return out;
}

function sanitizeAdminEvent_(row) {
  var out = {};
  ['event_id', 'item_id', 'type', 'by', 'at'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
  });
  return out;
}

function sanitizeAdminOutbox_(row) {
  var out = {};
  ['outbox_id', 'item_id', 'event', 'audience', 'channel', 'recipient_kind', 'status',
    'retry_count', 'next_try_at', 'provider_msg_id', 'created_at', 'sent_at'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
  });
  return out;
}

/** Quản trị vận hành hệ thống, không đọc hồ sơ khách — kể cả gián tiếp qua việc. */
function sanitizeAdminItem_(row) {
  var out = {};
  ['item_id', 'period_id', 'origin_item_id', 'carryover_from_item_id', 'carried_to_item_id', 'parent_item_id',
    'request_id', 'work_type_code', 'collateral_mode', 'occurrence_date', 'source_stt', 'source_tab', 'status',
    'assigned_user_id', 'assigned_by', 'submitted_at', 'accepted_at', 'assigned_at', 'first_assigned_at',
    'dossier_received_at', 'dossier_received_by', 'timing_source', 'due_at', 'due_at_override', 'completed_at', 'processing_started_at', 'sla_no_fault',
    'execution_state', 'execution_changed_at', 'is_priority', 'result_flags_json', 'result_credit_json',
    'requested_mortgage_contract_count', 'requested_export_folder_count', 'version', 'created_at', 'updated_at'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
  });
  var sessions = [];
  try {
    sessions = JSON.parse((row || {}).processing_sessions_json || '[]').map(function (s) {
      return { user_id: s.user_id || '', work_type_code: s.work_type_code || '', start: s.start || '', end: s.end || '' };
    });
  } catch (ignore) { sessions = []; }
  out.processing_sessions_json = JSON.stringify(sessions);
  ['pause_log', 'sla_pause_log'].forEach(function(key) {
    out[key + '_json'] = JSON.stringify(LSTiming.array(row || {}, key).filter(function(p) {
      return Array.isArray(p) && isFinite(new Date(p[0]).getTime()) && (!p[1] || isFinite(new Date(p[1]).getTime()));
    }).map(function(p) { return [new Date(p[0]).toISOString(), p[1] ? new Date(p[1]).toISOString() : '']; }));
  });
  var appointment = {};
  try {
    var appt = JSON.parse((row || {}).appointment_json || '{}');
    appointment = { at: appt.at || '', date: appt.date || '', time: appt.time || '',
      channel: appt.channel || '', via_group: !!appt.via_group };
  } catch (ignore2) { appointment = {}; }
  out.appointment_json = JSON.stringify(appointment);
  return out;
}

/**
 * Kho cũ phải tự nhận schema hardening ở lượt đăng nhập đầu tiên sau deploy.
 * Không phụ thuộc clasp run/OAuth máy phát hành: nếu thiếu bảng/cột mới thì
 * nâng cấp ngay dưới tài khoản triển khai rồi xóa cache đọc của lượt chạy.
 */
/**
 * Đổi chuỗi này mỗi khi thêm bảng/cột bắt buộc hoặc trigger nền mới. Khi đã
 * khớp, mọi lượt tải bỏ qua kiểm tra schema và `ScriptApp.getProjectTriggers()`
 * (3 lần gọi chậm) — trước đây 60 người đăng nhập là 180 lần gọi dư thừa, và
 * nhiều lượt cùng thấy thiếu trigger thì cùng tạo, sinh trigger trùng.
 */
var RUNTIME_SCHEMA_VERSION_ = 'runtime_v63_staff_planning';

function ensureRuntimeSchema_() {
  var scriptProps = PropertiesService.getScriptProperties();
  if (scriptProps.getProperty('LS_RUNTIME_READY') === RUNTIME_SCHEMA_VERSION_) return { upgraded: false, reason: 'cached' };
  var id = scriptProps.getProperty('LS_SHEET_ID');
  if (!id) return { upgraded: false, reason: 'missing_storage_id' };
  var gate = LockService.getScriptLock();
  if (!gate.tryLock(10000)) return { upgraded: false, reason: 'upgrade_in_progress' };
  try {
    if (scriptProps.getProperty('LS_RUNTIME_READY') === RUNTIME_SCHEMA_VERSION_) return { upgraded: false, reason: 'cached' };
    var out = ensureRuntimeSchemaLocked_(SpreadsheetApp.openById(id));
    // Phiên cũ dùng chung một ô UserProperties; xóa để không ai còn đi đường đó.
    try { PropertiesService.getUserProperties().deleteProperty('LS_AUTH_USER_ID'); } catch (ignore) {}
    DataRepository.invalidateShared();
    scriptProps.setProperty('LS_RUNTIME_READY', RUNTIME_SCHEMA_VERSION_);
  } finally {
    gate.releaseLock();
  }
  // Chạy một lần sau lượt nâng cấp, ngoài khóa nâng cấp (giao dịch tự giữ khóa ghi).
  try { out.early_carry_repaired = repairEarlyCarryover_(); }
  catch (err) { Logger.log('Chưa hoàn tác được chuyển tiếp sớm: ' + err); }
  return out;
}

/**
 * Bản cũ chuyển tiếp việc đang mở ngay lúc KS bấm "Tạo tháng kế tiếp": dòng gốc của tháng hiện
 * tại bị đánh dấu đã chuyển (biến khỏi màn hình, khóa thao tác) trong khi dòng mới nằm ở kỳ chưa
 * kích hoạt. Hoàn tác: dòng gốc dùng lại được; bản sao chưa ai đụng tới tách khỏi mọi kỳ và đánh
 * dấu là dòng đã thay thế, để không lọt vào báo cáo. Kỳ mới kích hoạt sẽ chuyển tiếp lại từ đầu.
 */
function repairEarlyCarryover_() {
  var scheduled = {};
  DataRepository.getAll('MonthlyPlans').forEach(function (p) { if (p.status === 'SCHEDULED') scheduled[p.period_id] = true; });
  if (!Object.keys(scheduled).length) return 0;
  var touched = {};
  var fixed = DataRepository.tx(function (t) {
    var n = 0, ts = stamp_();
    t.rows('WorkItems').filter(function (i) { return scheduled[i.period_id] && i.carryover_from_item_id; }).forEach(function (copy) {
      if (Number(copy.version) > 1) return;
      var orig = t.find('WorkItems', 'item_id', copy.carryover_from_item_id);
      if (!orig || orig.object.carried_to_item_id !== copy.item_id) return;
      var copyFound = t.find('WorkItems', 'item_id', copy.item_id);
      t.write(orig, { carried_to_item_id: '', version: Number(orig.object.version || 0) + 1, updated_at: ts });
      t.write(copyFound, { period_id: '', carried_to_item_id: orig.object.item_id, updated_at: ts });
      var req = t.find('Requests', 'request_id', copy.request_id);
      if (req && req.object.carryover_from_request_id) t.write(req, { period_id: '', updated_at: ts });
      t.append('Events', { event_id: id_('EVT'), item_id: orig.object.item_id, type: 'CHUYEN_TIEP_THANG', by: 'SYSTEM', at: ts,
        reason: 'Hoàn tác chuyển tiếp sớm (bản sao ' + copy.item_id + '); việc sẽ chuyển khi kỳ mới kích hoạt.',
        before_json: JSON.stringify({ carried_to_item_id: copy.item_id }), after_json: JSON.stringify({ carried_to_item_id: '' }) });
      touched[copy.period_id] = true;
      touched[orig.object.period_id] = true;
      n += 1;
    });
    return n;
  });
  Object.keys(touched).forEach(function (periodId) { markPlanDirty_(periodId); });
  return fixed;
}

/** Chạy dưới khóa script do ensureRuntimeSchema_ giữ. */
function ensureRuntimeSchemaLocked_(ss) {
  function hasColumns_(name, columns) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastColumn() < 1) return false;
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return columns.every(function (column) { return header.indexOf(column) !== -1; });
  }
  var ready = hasColumns_('NotificationIdempotency', ['idem_key', 'outbox_id']) &&
    hasColumns_('NotificationOutbox', ['claim_token', 'claim_until']) &&
    hasColumns_('MonthlyPlans', ['handoff_from_period_id', 'handoff_status', 'handoff_completed_at']) &&
    hasColumns_('OperationalScoreSnapshots', ['period_id', 'formula_version']) &&
    hasColumns_('WorkItems', ['sla_paused_at', 'dossier_received_at', 'processing_sessions_json', 'sla_pause_log_json', 'is_priority', 'result_flags_json', 'result_credit_json', 'due_at_override', 'execution_state', 'execution_changed_at', 'requested_mortgage_contract_count', 'requested_export_folder_count', 'supplement_json']) &&
    hasColumns_('PeriodSummary', ['timing_formula_version']) &&
    hasColumns_('Users', ['receive_completion_email', 'linked_email']) &&
    hasColumns_('CanceledItems', ['cancel_id', 'item_id', 'requested_by']) &&
    hasColumns_('OtherWork', ['work_id', 'user_id', 'work_date', 'category', 'quantity', 'minutes', 'operation_id', 'canceled_at']) &&
    hasColumns_('Inbox', ['detail', 'subject_user_id']) &&
    hasColumns_('StaffPlans', ['plan_id', 'version', 'snapshot_json']) &&
    hasColumns_('StaffPlanHistory', ['history_id', 'plan_id', 'plan_json']);
  if (ready) {
    installMonthlyPlanTrigger_();
    installMaintenanceTrigger_();
    // Kho đã migration xong thì không chạy lại setup, nên trigger nền thêm về
    // sau phải được bổ sung ở đây, nếu không bản đang chạy sẽ không bao giờ có.
    Notifications.ensureWorkerTriggers();
    return { upgraded: false, reason: 'ready' };
  }

  setupSheetDB_(ss);
  installMonthlyPlanTrigger_();
  installMaintenanceTrigger_();
  Notifications.installWorker();
  DataRepository.clearCache();
  return { upgraded: true };
}

/** Trả về duy nhất các trường công khai của thông báo phiên bản đang bật. */
function updateNotice_() {
  var row = DataRepository.getAll('Settings').filter(function (s) { return s.key === 'update_notice_json'; })[0];
  if (!row || !row.value) return null;
  var notice;
  try { notice = JSON.parse(row.value); } catch (ignoreNotice) { return null; }
  if (!notice || !notice.id || !notice.version) return null;
  var displayLimit = Number(notice.display_limit);
  if (!isFinite(displayLimit) || displayLimit < 1 || displayLimit > 3 || Math.floor(displayLimit) !== displayLimit) displayLimit = 3;
  return {
    id: String(notice.id), version: String(notice.version),
    message: String(notice.message || ''), display_limit: displayLimit,
    published_at: String(notice.published_at || '')
  };
}

/** Atomic account-wide display count, shared by both deployment URLs and all browsers. */
function claimUpdateNotice(noticeId) {
  var u = currentUser_();
  requireRole_(u.role);
  if (truthy_(u.must_change_password)) return { show:false };
  return DataRepository.tx(function(t) {
    var row = t.find('Settings', 'key', 'update_notice_json'), notice;
    try { notice = JSON.parse(row ? row.object.value : 'null'); } catch (ignore) { notice = null; }
    if (!notice || notice.id !== noticeId || !notice.version) return { show:false };
    var limit = Math.max(1, Math.min(3, Math.floor(Number(notice.display_limit) || 3)));
    var props = PropertiesService.getScriptProperties(), key = 'LS_UPDATE_NOTICE_SEEN:' + u.user_id, saved;
    try { saved = JSON.parse(props.getProperty(key) || 'null'); } catch (ignoreCount) { saved = null; }
    var count = saved && saved.id === notice.id ? Number(saved.count) || 0 : 0;
    if (count >= limit) return { show:false, count:count };
    count += 1;
    props.setProperty(key, JSON.stringify({ id:notice.id, count:count }));
    return { show:true, id:notice.id, count:count };
  });
}

/** Dữ liệu khởi tạo, đã lọc theo phạm vi vai trò. */
/** Chỉ gửi số liệu cộng dồn; không gửi hồ sơ, lịch sử hoặc liên kết kho Sheet. */
function monitorBootstrap_(u, plan) {
  var requests = {}, units = {}, types = {}, users = {};
  DataRepository.getAll('Requests').forEach(function(r) { requests[r.request_id] = r; });
  var unitRows = DataRepository.getAll('Units').map(function(x) {
    units[x.unit_id] = x.name || x.unit_id;
    return {unit_id:x.unit_id,name:units[x.unit_id],kind:x.kind,is_active:x.is_active};
  });
  var workTypeRows = DataRepository.getAll('WorkTypes');
  var typeRows = workTypeRows.map(function(x) {
    types[x.type_code] = x.display_name || x.type_code;
    return {type_code:x.type_code,display_name:types[x.type_code],group:x.group,sla_hours:x.sla_hours,is_active:x.is_active};
  });
  var userRows = DataRepository.getAll('Users').filter(function(x) {
    return x.user_id === u.user_id || x.role === 'CAN_BO_LS';
  }).map(function(x) {
    users[x.user_id] = x.full_name || x.user_id;
    return {user_id:x.user_id,full_name:users[x.user_id],role:x.role,unit_id:x.unit_id,is_active:x.is_active};
  });
  function bucket(key,label) { return {key:key,label:label,total:0,completed:0,open:0,canceled:0,late:0,lateBase:0}; }
  var summary = {total:bucket('total','Tổng'),byUnit:[],byType:[],byStaff:[]};
  var dims = [{map:{},rows:summary.byUnit},{map:{},rows:summary.byType},{map:{},rows:summary.byStaff}];
  var allItems = DataRepository.getAll('WorkItems');
  var exemptByItem = slaExemptByItem_(allItems, workTypeRows);
  var now = new Date(stamp_()).getTime();
  function count(b,i) {
    b.total++;
    if(i.status === 'HOAN_THANH_LS') b.completed++;
    if(OPEN_STATUS.indexOf(i.status) !== -1) b.open++;
    if(i.status === 'HUY') b.canceled++;
    if(OPEN_STATUS.indexOf(i.status) !== -1 && !slaExemptItem_(i,exemptByItem)) b.lateBase++;
    if(isLateOpen_(i,now,exemptByItem)) b.late++;
  }
  allItems.filter(function(i) {
    return i.period_id === plan.period_id && !i.carried_to_item_id;
  }).forEach(function(i) {
    var r = requests[i.request_id] || {}, keys = [r.unit_id || '',i.work_type_code || '',i.assigned_user_id || ''];
    var labels = [units[keys[0]] || 'Chưa xác định',types[keys[1]] || 'Chưa xác định',users[keys[2]] || 'Chưa phân công'];
    count(summary.total,i);
    dims.forEach(function(d,n) {
      var key = keys[n];
      if(!Object.prototype.hasOwnProperty.call(d.map,key)) { d.map[key] = bucket(key,labels[n]);d.rows.push(d.map[key]); }
      count(d.map[key],i);
    });
  });
  dims.forEach(function(d) { d.rows.sort(function(a,b) { return b.total-a.total || a.label.localeCompare(b.label); }); });
  return {
    me:{user_id:u.user_id,full_name:u.full_name,role:u.role,unit_id:u.unit_id,must_change_password:truthy_(u.must_change_password)},
    activePlan:{period_id:plan.period_id,month_key:plan.month_key,name:plan.name,status:plan.status,start_date:plan.start_date,end_date:plan.end_date},
    users:userRows,units:unitRows,workTypes:typeRows,monitorSummary:summary,
    requests:[],items:[],events:[],inbox:[],outbox:[],reasons:[],catalogOptions:[],
    updateNotice: updateNotice_(),
    settings:DataRepository.getAll('Settings').filter(function(s) {
      return ['timezone','week_start','work_days','work_open','work_close','work_break','holidays','env'].indexOf(s.key) !== -1;
    }).map(function(s) { return {key:s.key,value:s.value}; })
  };
}

/** Only expose the current officer's credited work on rows assigned to someone else. */
function personalActivityCredits_(items, userId) {
  return (items || []).reduce(function (out, item) {
    if (item.assigned_user_id === userId) return out;
    var credit = {}, flags = {};
    try { credit = JSON.parse(item.result_credit_json || '{}') || {}; } catch (ignoreCredit) { credit = {}; }
    HANDOVER_PART_KEYS_.forEach(function (key) {
      var part = credit[key];
      if (!part || part.user_id !== userId) return;
      credit[key] = {
        user_id: part.user_id, at: part.at || '', by: part.by || '',
        quantity: Math.max(1, Math.floor(Number(part.quantity) || 1)), source: part.source || ''
      };
    });
    Object.keys(credit).forEach(function (key) {
      if (HANDOVER_PART_KEYS_.indexOf(key) === -1 || !credit[key] || credit[key].user_id !== userId) delete credit[key];
    });
    if (!Object.keys(credit).length) return out;
    try { flags = JSON.parse(item.result_flags_json || '{}') || {}; } catch (ignoreFlags) { flags = {}; }
    out.push({ work_type_code: item.work_type_code, collateral_mode: item.collateral_mode || 'NONE',
      result_credit_json: JSON.stringify(credit),
      result_flags_json: JSON.stringify(typeof flags.HD_THE_CHAP === 'boolean' ? { HD_THE_CHAP: flags.HD_THE_CHAP } : {}) });
    return out;
  }, []);
}

function getBootstrap() {
  var t0 = Date.now();
  ensureRuntimeSchema_();
  var u = currentUser_();
  requireRole_(u.role);
  var activePlan = activePlan_();
  if (u.role === 'GIAM_SAT') return monitorBootstrap_(u,activePlan);
  try { ensureMonthlyTimeSheets_(activePlan); }
  catch(err) { Logger.log('Chưa bổ sung tab thời gian kỳ '+activePlan.period_id+': '+err); }
  var requests = DataRepository.getAll('Requests').filter(function (r) { return r.period_id === activePlan.period_id; });
  // Phải loại dòng đã chuyển tháng (carried_to_item_id): nó đã sinh dòng mới ở
  // kỳ sau và không được thao tác nữa. Thiếu bộ lọc này thì dòng cũ lọt vào hàng
  // chờ, bấm Phân công sẽ dính chặn "Hồ sơ đã chuyển tháng". Mọi truy vấn danh
  // sách khác đều đã lọc như vậy.
  var allWorkItems = DataRepository.getAll('WorkItems');
  var exemptByItem = slaExemptByItem_(allWorkItems, DataRepository.getAll('WorkTypes'));
  var periodItems = allWorkItems.filter(function (i) {
    return i.period_id === activePlan.period_id && !i.carried_to_item_id;
  }).map(function (i) {
    var copy = Object.assign({}, i);
    copy.sla_no_fault = !!exemptByItem[i.item_id];
    return copy;
  });
  if (u.role !== 'PHONG_PGD') {
    periodItems = projectAppointmentDraftCredits_(periodItems, DataRepository.getAll('WorkTypes'), DataRepository);
  }
  var items=periodItems.slice();

  var reqById = {};
  requests.forEach(function (r) { reqById[r.request_id] = r; });

  if (u.role === 'PHONG_PGD') {
    items = items.filter(function (i) {
      var r = reqById[i.request_id];
      return r && r.unit_id === u.unit_id;
    });
  } else if (u.role === 'CAN_BO_LS') {
    items = items.filter(function (i) { return i.assigned_user_id === u.user_id; });
  }

  var keep = {};
  items.forEach(function (i) { keep[i.request_id] = true; });

  var visible = {};
  items.forEach(function (i) { visible[i.item_id] = true; });

  var result = {
    activePlan: publicMonthlyPlan_(activePlan),
    updateNotice: updateNotice_(),
    me: { user_id: u.user_id, full_name: u.full_name, email: u.email,
      linked_email: u.linked_email || u.email || '', role: u.role, unit_id: u.unit_id,
      must_change_password: truthy_(u.must_change_password) },
    users: DataRepository.getAll('Users').map(function (x) {
      return { user_id: x.user_id, full_name: x.full_name, email: x.email || '',
        linked_email: x.linked_email || x.email || '', role: x.role, unit_id: x.unit_id,
        sort_order: x.sort_order || '', source_tab: x.source_tab || '', is_active: x.is_active,
        login_code: x.login_code || x.user_id || '', auth_group: authGroup_(x),
        zalo_name: x.zalo_name || '', zalo_phone: normalizePhone_(x.zalo_phone), telegram_chat_id: x.telegram_chat_id || '',
        receive_completion_email: truthy_(x.receive_completion_email),
        availability_status: String(x.availability_status || 'AVAILABLE').toUpperCase(),
        off_from: x.off_from || '', off_to: x.off_to || '', off_reason: x.off_reason || '', replacement_user_id: x.replacement_user_id || '' };
    }),
    units: DataRepository.getAll('Units'),
    workTypes: DataRepository.getAll('WorkTypes'),
    reasons: DataRepository.getAll('Reasons'),
    catalogOptions: DataRepository.getAll('CatalogOptions').filter(function (x) { return String(x.is_active) === 'true' || x.is_active === true; }),
    requests: requests.filter(function (r) { return keep[r.request_id]; }).map(function (r) {
      return u.role === 'ADMIN' ? sanitizeAdminRequest_(r) : r;
    }),
    items: u.role === 'ADMIN' ? items.map(sanitizeAdminItem_) : items,
    // Events, Inbox và NotificationOutbox chỉ thêm, không xóa nên không đọc trọn
    // bảng. Nhưng cũng không được cắt đuôi rồi mới lọc: phần đuôi là của cả chi
    // nhánh, nên với hai mươi cán bộ thì mỗi người chỉ còn vài dòng của mình, và
    // người ít việc thấy rỗng. `tailWhere` lọc ngay trong lúc quét ngược.
    // Nhật ký sự kiện không đi theo bootstrap: màn Nhật ký tự gọi getAuditLog khi được mở.
    events: [],
    inbox: DataRepository.tailWhere('Inbox', 200, function (n) {
      // Bỏ thông báo đề nghị hủy cũ: hủy việc nay không còn bước chờ KS/Quản lý duyệt.
      return n.user_id === u.user_id && n.event !== 'DE_NGHI_HUY';
    }).rows,
    // Cán bộ phải xem trước và xác nhận tin gửi khách ngay ở chi tiết việc, nên
    // hàng đợi phải tới được tay họ. Tin chờ xác nhận mà không hiện ra thì không
    // ai gửi được: quản trị bị chặn xác nhận thay, nên tin sẽ kẹt vĩnh viễn.
    outbox: u.role === 'ADMIN' ? [] : DataRepository.tailWhere('NotificationOutbox', 800,
      function (o) { return !!visible[o.item_id]; }).rows,
    settings: DataRepository.getAll('Settings').filter(function (s) {
      return ['timezone', 'week_start', 'work_days', 'work_open', 'work_close', 'work_break', 'holidays',
        'backlog_alert', 'export_row_limit', 'retention_months', 'retention_outbox_days', 'retention_idem_days',
        'retention_inbox_read_days', 'env', 'bank_name', 'hotline', 'app_url', 'sign_place', 'sign_map_url', 'brand_color', 'logo_url', 'email_banner_url',
        // Kế hoạch do KS/QL LS giao: cả ba vai trò LS đều xem để so với kết quả.
        'daily_plan_json', 'target_done_month', 'target_done_staff_month'].indexOf(s.key) !== -1;
    }),
    // LS chỉ nhận phần kết quả đã ghi cho chính mình trên hồ sơ do người khác
    // đang giữ, không nhận mã hồ sơ hay dữ liệu khách hàng.
    activity_credits: u.role === 'CAN_BO_LS' ? personalActivityCredits_(periodItems,u.user_id) : [],
    staff_plans: staffPlansForUser_(u)
  };
  if (u.role === 'ADMIN') {
    result.operationalScorecard = operationalScorecard_(items, DataRepository.getAll('Users'),
      activePlan.start_date, activePlan.end_date, new Date(), exemptByItem);
    result.operationalScorecardMeta = { period_id: activePlan.period_id, month_key: activePlan.month_key,
      source: 'LIVE_ACTIVE_PERIOD', formula_version: SCORE_FORMULA_VERSION };
    try {
      result.operationalScoreSnapshots = currentOperationalScoreSnapshots_(
        DataRepository.tail('OperationalScoreSnapshots', 2000), DataRepository.getAll('MonthlyPlans'),
        allWorkItems, DataRepository.getAll('Users'), exemptByItem);
    }
    catch (ignore) { result.operationalScoreSnapshots = []; }
    result.channels = DataRepository.getAll('Channels');
    result.templates = DataRepository.getAll('Templates');
    result.notifyRules = DataRepository.getAll('NotifyRules');
    result.outbox = DataRepository.tail('NotificationOutbox', 500).map(sanitizeAdminOutbox_);
    result.notificationMetrics = DataRepository.tail('NotificationMetrics', 2000);
    result.settings = DataRepository.getAll('Settings');
    // Chỉ trả trạng thái đã nạp token, không trả token. Trạng thái này lấy từ
    // ScriptProperties để giao diện không báo sai khi triển khai thật.
    var gatewaySettings = {};
    result.settings.forEach(function (s) { gatewaySettings[s.key] = s.value; });
    var gatewayRef = String(gatewaySettings.gateway_auth_ref || 'LS_GATEWAY_TOKEN').trim();
    var gatewayTokenSet = !!PropertiesService.getScriptProperties().getProperty(gatewayRef);
    result.settings = result.settings.map(function (s) {
      var copy = {};
      Object.keys(s).forEach(function (k) { copy[k] = s[k]; });
      if (copy.key === 'gateway_token_set') copy.value = gatewayTokenSet ? 'true' : 'false';
      return copy;
    });
  }
  if (u.role === 'CAN_BO_LS') {
    result.global_pause = activeGlobalPause_(globalPauseEvents_(DataRepository,u.user_id,1,10000).rows,u.user_id);
  }
  // Việc khác ghi kèm số lượng: cộng vào dòng Khác của bảng kết quả ngày.
  result.other_work = otherWorkForBootstrap_(u, activePlan);
  if (['ADMIN', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1) {
    result.monthlyPlans = DataRepository.getAll('MonthlyPlans').sort(function (a, b) { return String(b.month_key).localeCompare(String(a.month_key)); }).map(publicMonthlyPlan_);
  }
  result.stats = { sheetReads: DataRepository.sheetReads(), ms: Date.now() - t0 };
  return result;
}

/* ---------------------------- Tạo yêu cầu ---------------------------- */

/**
 * STT kế tiếp của đơn vị trong kỳ. Quét Requests + WorkItems chỉ một lần mỗi
 * giao dịch rồi đếm tiếp: trước đây mỗi dòng việc lại chuyển toàn bộ hai bảng
 * thành đối tượng, trong lúc giữ khóa chung.
 */
function nextSourceStt_(t, unitId, periodId) {
  var prefix = String(unitId || 'DONVI') + '_';
  var memoKey = prefix + '|' + (periodId || '');
  if (!t._stt) t._stt = {};
  if (t._stt[memoKey] === undefined) {
    // Chỉ dùng cột không đổi sau khi tạo (mã yêu cầu, đơn vị, kỳ, STT): quét bản đã đọc + phần đuôi mới thêm,
    // không đọc lại trọn hai bảng lớn nhất trong khóa cho mỗi lần tạo việc.
    var reqUnits = {};
    t.scan('Requests', function (get) { reqUnits[get('request_id')] = get('unit_id'); });
    var max = 0;
    t.scan('WorkItems', function (get) {
      if (reqUnits[get('request_id')] !== unitId || (periodId && get('period_id') !== periodId)) return;
      var ref = String(get('source_stt') || '');
      if (ref.indexOf(prefix) !== 0) return;
      var n = Number(ref.substring(prefix.length));
      if (n > max) max = n;
    });
    t._stt[memoKey] = max;
  }
  t._stt[memoKey] += 1;
  return prefix + t._stt[memoKey];
}

/**
 * Mức ưu tiên khách hàng: chỉ còn VIP và Xử lý gấp. "Quan trọng" (QUAN_TRONG) cũ được hiểu là VIP,
 * nên dữ liệu đã lưu vẫn đúng mà không phải sửa Sheet. Khớp priorityFlags ở giao diện.
 */
function normalizePriorityFlags_(flags) {
  var out = [];
  (Array.isArray(flags) ? flags : []).forEach(function (x) {
    var v = String(x) === 'QUAN_TRONG' ? 'VIP' : String(x);
    if (['VIP', 'XU_LY_GAP'].indexOf(v) !== -1 && out.indexOf(v) === -1) out.push(v);
  });
  return out;
}

var COLLATERAL_NEW_WORK_TYPE_ = 'LEGACY_26';
var COLLATERAL_MODES_ = ['NONE', 'CO_SAN', 'MOI'];

function canChooseCollateralMode_(wt) {
  return !!(wt && ['Món', 'HM SXKD', 'Thấu chi', 'Thẻ tín dụng'].indexOf(String(wt.group_name || '')) !== -1);
}

function normalizeCollateralMode_(mode, wt) {
  var normalized = String(mode || 'NONE').trim().toUpperCase();
  if (COLLATERAL_MODES_.indexOf(normalized) === -1) throw new Error('Tình trạng TSBĐ không hợp lệ.');
  if (normalized !== 'NONE' && !canChooseCollateralMode_(wt)) throw new Error('Chỉ công việc tín dụng mới được chọn tình trạng TSBĐ.');
  return normalized;
}

function normalizeRequestedQuantity_(value, label, required) {
  var empty = value === undefined || value === null || String(value).trim() === '';
  if (!required && empty) return '';
  if (!required) throw new Error('Số ' + label + ' không áp dụng cho loại việc này.');
  var quantity = Number(value);
  if (!isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity) {
    throw new Error('Số ' + label + ' phải là số nguyên lớn hơn 0.');
  }
  return quantity;
}

/**
 * Một khách, nhiều việc, mỗi việc một ngày phát sinh riêng.
 * payload = { customer:{name,kind,cif,phone,email}, note, items:[{work_type_code,product_name,occurrence_date}] }
 */
function createRequest(payload) {
  var u = requireActor_();
  if (u.role !== 'PHONG_PGD' && u.role !== 'KS_LS') throw new Error('Chỉ phòng/PGD hoặc kiểm soát LS được đăng ký việc mới.');
  // Phòng/PGD luôn đăng ký cho chính đơn vị mình. Kiểm soát LS đăng ký hộ phải chọn
  // phòng gửi hồ sơ — nếu không hồ sơ bị ghi vào đơn vị LS và lạc khỏi danh sách phòng.
  var unitId = u.unit_id;
  if (u.role === 'KS_LS') {
    unitId = String(payload && payload.unit_id || '').trim();
    var sender = unitId ? DataRepository.find('Units', 'unit_id', unitId) : null;
    if (!sender || !truthy_(sender.is_active) || ['PGD', 'DON_VI_GUI'].indexOf(String(sender.kind || '').toUpperCase()) === -1) {
      throw new Error('Chọn phòng / PGD gửi hồ sơ.');
    }
  }
  if (!payload || !payload.customer || !payload.customer.name) throw new Error('Thiếu tên khách hàng.');
  if (!payload.items || !payload.items.length) throw new Error('Cần ít nhất một việc.');

  var types = {};
  DataRepository.getAll('WorkTypes').forEach(function (w) { types[w.type_code] = w; });
  var quickRules = DataRepository.getAll('CatalogOptions').filter(function (x) {
    return x.catalog_key === 'ASSIGNMENT_RULE' && truthy_(x.is_active);
  }).map(function (x) {
    var metadata = {};
    try { metadata = JSON.parse(x.metadata_json || '{}'); } catch (ignoreRule) {}
    return {
      option_id: x.option_id, unit_id: String(metadata.unit_id || x.unit_id || ''),
      work_type_codes: ruleWorkTypeCodes_(metadata, x.code), product_name: String(metadata.product_name || ''),
      assignee_id: String(metadata.assignee_id || x.role_kind || ''), priority: Number(metadata.priority || x.sort_order) || 9999,
      auto_assign: truthy_(metadata.auto_assign), priority_processing: truthy_(metadata.priority_processing)
    };
  }).filter(function (x) { return x.auto_assign && x.assignee_id; });
  payload.items.forEach(function (it) {
    if (!types[it.work_type_code]) throw new Error('Loại việc không hợp lệ: ' + it.work_type_code);
    if (!it.product_name) throw new Error('Thiếu tên sản phẩm cho một dòng việc.');
    it.occurrence_date = requestedDate_(it.occurrence_date);
    it.collateral_mode = normalizeCollateralMode_(it.collateral_mode, types[it.work_type_code]);
    var collateralSteps = collateralStepKeys_(types[it.work_type_code], it);
    var contractParts = draftContractPartKeys_(types[it.work_type_code], it);
    var noNewMortgageCredit = canChooseCollateralMode_(types[it.work_type_code]) &&
      (it.collateral_mode === 'CO_SAN' || it.collateral_mode === 'NONE');
    it.requested_mortgage_contract_count = normalizeRequestedQuantity_(
      it.requested_mortgage_contract_count, 'HĐ thế chấp cần soạn',
      !noNewMortgageCredit && (it.collateral_mode === 'MOI' || contractParts.indexOf('HD_THE_CHAP') !== -1 || collateralSteps.indexOf('HD_THE_CHAP') !== -1)
    );
    it.requested_export_folder_count = normalizeRequestedQuantity_(
      it.requested_export_folder_count, 'bìa tài sản cần xuất', collateralSteps.indexOf('XUAT_KHO') !== -1
    );
  });

  var activePlan = activePlan_();
  var ts = stamp_();
  var operationId = String(REQUEST_ && REQUEST_.op_id || '');
  var requestId = operationId ? requestIdForOperation_(u.user_id, operationId) : id_('REQ');
  // Không tin cậy requestor do trình duyệt gửi lên: cán bộ đề nghị luôn là
  // tài khoản đã đăng nhập. Khi Admin luân chuyển unit_id, phòng mới được áp
  // dụng ngay cho lần đăng nhập/kê khai tiếp theo và vẫn giữ được lịch sử.
  var cif = String(payload.customer.cif || '').trim();
  var kind = cif ? 'DA_CO_CIF' : 'KH_MOI';
  var requestorId = u.user_id;
  var requestorName = u.full_name || u.email || u.user_id;
  var requestorKind = u.role === 'PHONG_PGD' ? 'VRM_PRM' : (u.role || 'VRM_PRM');

  var result = DataRepository.tx(function (t) {
    var existingRequest = operationId ? t.find('Requests', 'request_id', requestId) : null;
    if (existingRequest) {
      var previousItems = t.select('WorkItems', 'item_id', function (get) { return get('request_id') === requestId; })
        .map(function (found) { return found.object; });
      var roots = previousItems.filter(function (item) { return !item.parent_item_id; });
      if (roots.length !== payload.items.length) {
        throw new Error('Yêu cầu đã được ghi nhận nhưng chi tiết chưa đầy đủ. Tải lại danh sách trước khi gửi lại.');
      }
      function rootResult(item) {
        return {
          item_id: item.item_id, occurrence_date: item.occurrence_date, status: item.status,
          assigned_user_id: item.assigned_user_id || '', assigned_by: item.assigned_by || '',
          assigned_at: item.assigned_at || '', accepted_at: item.accepted_at || '',
          first_assigned_at: item.first_assigned_at || '', submitted_at: item.submitted_at || '',
          is_priority: truthy_(item.is_priority), version: Number(item.version) || 1,
          requested_mortgage_contract_count: item.requested_mortgage_contract_count || '',
          requested_export_folder_count: item.requested_export_folder_count || ''
        };
      }
      function childResult(item) {
        var checklist = [];
        try { checklist = JSON.parse(item.checklist_json || '[]'); } catch (ignoreChecklist) { checklist = []; }
        return {
          item_id: item.item_id, parent_item_id: item.parent_item_id || '', work_type_code: item.work_type_code,
          product_name: item.product_name, occurrence_date: item.occurrence_date, status: item.status,
          assigned_user_id: item.assigned_user_id || '', assigned_by: item.assigned_by || '',
          submitted_at: item.submitted_at || '', version: Number(item.version) || 1,
          is_priority: truthy_(item.is_priority), collateral_mode: item.collateral_mode || 'MOI',
          requested_mortgage_contract_count: item.requested_mortgage_contract_count || '',
          checklist: Array.isArray(checklist) ? checklist : []
        };
      }
      return {
        ok: true, request_id: requestId, item_ids: roots.map(function (item) { return item.item_id; }),
        items: roots.map(rootResult), linked_items: previousItems.filter(function (item) { return !!item.parent_item_id; }).map(childResult),
        period_id: existingRequest.object.period_id, replayed: true
      };
    }
    t.append('Requests', {
      request_id: requestId,
      period_id: activePlan.period_id,
      origin_request_id: '',
      carryover_from_request_id: '',
      unit_id: unitId,
      created_by: u.user_id,
      customer_name: payload.customer.name,
      customer_kind: kind,
      cif: cif,
      phone: validatePhone_(payload.customer.phone),
      email: validateEmail_(payload.customer.email),
      priority_flags_json: JSON.stringify(normalizePriorityFlags_(payload.customer.priority_flags)),
      requestor_id: requestorId,
      requestor_name: requestorName,
      requestor_kind: requestorKind,
      note: payload.note || '',
      created_at: ts,
      updated_at: ts
    });

    var ids = [], createdItems = [], linkedItems = [];
    function autoAssignmentFor(item) {
      var matches = quickRules.filter(function (rule) {
        return (!rule.unit_id || rule.unit_id === unitId) &&
          (!rule.work_type_codes.length || rule.work_type_codes.indexOf(item.work_type_code) !== -1) &&
          (!rule.product_name || rule.product_name.trim().toLowerCase() === String(item.product_name || '').trim().toLowerCase());
      }).sort(function (a, b) {
        var score = function (rule) { return (rule.unit_id ? 4 : 0) + (rule.work_type_codes.length ? 2 : 0) + (rule.product_name ? 1 : 0); };
        return score(b) - score(a) || a.priority - b.priority;
      });
      for (var i = 0; i < matches.length; i++) {
        var user = t.find('Users', 'user_id', matches[i].assignee_id);
        if (userAvailableForAssignment_(user && user.object, ts)) return { rule: matches[i], user: user.object };
        var replacementId = user && user.object && user.object.replacement_user_id;
        var replacement = replacementId ? t.find('Users', 'user_id', replacementId) : null;
        if (userAvailableForAssignment_(replacement && replacement.object, ts)) {
          return { rule: matches[i], user: replacement.object, replacement_for: user.object };
        }
      }
      return null;
    }
    function saveAutoAssignment(item, automatic) {
      if (!automatic) return;
      t.append('Events', {
        event_id: id_('EVT'), item_id: item.item_id, type: 'DA_PHAN_CONG', by: u.user_id, at: ts,
        reason: 'Tự động phân công theo quy tắc ' + automatic.rule.option_id + ' cho ' + automatic.user.full_name + '.',
        before_json: JSON.stringify({ status: 'CHO_PHAN_CONG', assigned_user_id: '' }),
        after_json: JSON.stringify({ status: 'DA_PHAN_CONG', assigned_user_id: automatic.user.user_id, is_priority: item.is_priority })
      });
      Notifications.queue(t, item, NOTIFY_ON.DA_PHAN_CONG, u.user_id, null, 'DEFAULT');
    }
    payload.items.forEach(function (it) {
      var itemId = id_('ITEM');
      ids.push(itemId);
      var typeChecklist = [];
      try { typeChecklist = JSON.parse(types[it.work_type_code].checklist_json || '[]'); } catch (ignoreChecklist) { typeChecklist = []; }
      var sourceStt = nextSourceStt_(t, unitId, activePlan.period_id);
      var unit = t.find('Units', 'unit_id', unitId);
      // Việc chính và việc kèm TSĐB mới về cùng một cán bộ: theo quy tắc của việc chính, không có thì theo quy tắc của việc kèm.
      var pairType = it.collateral_mode === 'MOI' ? types[COLLATERAL_NEW_WORK_TYPE_] : null;
      var auto = autoAssignmentFor(it) || (pairType ? autoAssignmentFor({ work_type_code: COLLATERAL_NEW_WORK_TYPE_, product_name: pairType.display_name || COLLATERAL_NEW_WORK_TYPE_ }) : null);
      var createdItem = {
        item_id: itemId,
        period_id: activePlan.period_id,
        origin_item_id: '',
        carryover_from_item_id: '',
        parent_item_id: '',
        request_id: requestId,
        work_type_code: it.work_type_code,
        product_name: it.product_name,
        collateral_mode: it.collateral_mode,
        occurrence_date: it.occurrence_date,
        requested_mortgage_contract_count: it.requested_mortgage_contract_count,
        requested_export_folder_count: it.requested_export_folder_count,
        source_stt: sourceStt,
        source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : unitId,
        status: auto ? 'DA_PHAN_CONG' : 'CHO_PHAN_CONG',
        assigned_user_id: auto ? auto.user.user_id : '',
        assigned_by: auto ? u.user_id : '',
        // Phòng/PGD tạo việc là lúc gửi hồ sơ sang LS; mốc LS nhận hồ sơ (bắt đầu SLA) do cán bộ LS ghi khi tiếp nhận.
        submitted_at: ts, dossier_received_at: '', dossier_received_by: '', timing_source: 'NEW',
        first_assigned_at: auto ? ts : '', processing_sessions_json: '[]', sla_pause_log_json: '[]',
        accepted_at: auto ? ts : '',
        assigned_at: auto ? ts : '',
        due_at: '',
        completed_at: '',
        processing_started_at: '',
        appointment_json: '',
        checklist_json: JSON.stringify(typeChecklist.map(function () { return false; })),
        pending_json: '',
        note: '',
        is_priority: auto && auto.rule.priority_processing,
        version: 1,
        created_at: ts,
        updated_at: ts
      };
      t.append('WorkItems', createdItem);
      createdItems.push({ item_id: itemId, occurrence_date: createdItem.occurrence_date, status: createdItem.status, assigned_user_id: createdItem.assigned_user_id,
        assigned_by: createdItem.assigned_by, assigned_at: createdItem.assigned_at, accepted_at: createdItem.accepted_at,
        first_assigned_at: createdItem.first_assigned_at, submitted_at: createdItem.submitted_at, is_priority: createdItem.is_priority, version: createdItem.version,
        requested_mortgage_contract_count: createdItem.requested_mortgage_contract_count,
        requested_export_folder_count: createdItem.requested_export_folder_count });
      t.append('Events', {
        event_id: id_('EVT'), item_id: itemId, type: 'TAO_VIEC',
        by: u.user_id, at: ts, reason: 'Đơn vị ' + unitId + ' đăng ký yêu cầu.',
        before_json: '', after_json: JSON.stringify(it)
      });
      if (auto) saveAutoAssignment(createdItem, auto);
      if (it.collateral_mode === 'MOI') {
        var collateralType = types[COLLATERAL_NEW_WORK_TYPE_];
        if (!collateralType || !truthy_(collateralType.is_active)) throw new Error('Thiếu loại việc hồ sơ TSBĐ mới trong danh mục.');
        var childId = id_('ITEM');
        var childChecklist = [];
        try { childChecklist = JSON.parse(collateralType.checklist_json || '[]'); } catch (ignoreChildChecklist) { childChecklist = []; }
        var childAuto = auto;
        var child = {
          item_id: childId, period_id: activePlan.period_id, origin_item_id: '', carryover_from_item_id: '',
          parent_item_id: itemId, request_id: requestId, work_type_code: COLLATERAL_NEW_WORK_TYPE_,
          product_name: collateralType.display_name || COLLATERAL_NEW_WORK_TYPE_, collateral_mode: 'MOI',
          requested_mortgage_contract_count: it.requested_mortgage_contract_count,
          occurrence_date: it.occurrence_date, source_stt: nextSourceStt_(t, unitId, activePlan.period_id),
          source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : unitId,
          status: childAuto ? 'DA_PHAN_CONG' : 'CHO_PHAN_CONG', assigned_user_id: childAuto ? childAuto.user.user_id : '', assigned_by: childAuto ? u.user_id : '', submitted_at: ts,
          dossier_received_at: '', dossier_received_by: '', timing_source: 'NEW', first_assigned_at: childAuto ? ts : '', processing_sessions_json: '[]', sla_pause_log_json: '[]',
          accepted_at: childAuto ? ts : '', assigned_at: childAuto ? ts : '', due_at: '', completed_at: '', processing_started_at: '', appointment_json: '',
          checklist_json: JSON.stringify(childChecklist.map(function () { return false; })), pending_json: '', note: '',
          is_priority: childAuto && childAuto.rule.priority_processing,
          version: 1, created_at: ts, updated_at: ts
        };
        t.append('WorkItems', child);
        t.append('Events', {
          event_id: id_('EVT'), item_id: childId, type: 'TAO_VIEC', by: u.user_id, at: ts,
          reason: 'Tạo hồ sơ TSBĐ mới đi kèm việc ' + itemId + '.', before_json: '', after_json: JSON.stringify(child)
        });
        if (childAuto) saveAutoAssignment(child, childAuto);
        linkedItems.push({
          item_id: childId, parent_item_id: itemId, work_type_code: child.work_type_code,
          product_name: child.product_name, occurrence_date: child.occurrence_date, status: child.status,
          assigned_user_id: child.assigned_user_id, assigned_by: child.assigned_by, submitted_at: ts, version: 1,
          is_priority: child.is_priority, requested_mortgage_contract_count: child.requested_mortgage_contract_count || '',
          collateral_mode: 'MOI', checklist: childChecklist.map(function () { return false; })
        });
      }
    });

    return { ok: true, request_id: requestId, item_ids: ids, items: createdItems, linked_items: linkedItems, period_id: activePlan.period_id };
  }, NOTIFY_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/* ---------------------------- Chuyển trạng thái ---------------------------- */

/**
 * opts = { reason, assignee_id, appointment:{at,channel,result}, expected_version,
 *          notification_mode: DEFAULT|IN_APP|NONE }
 * Trả lỗi khi trạng thái nguồn không cho phép chuyển, hoặc vai trò không đủ quyền,
 * hoặc bản ghi đã bị người khác sửa (expected_version lệch).
 */
function transitionIdempotent_(t, item, to, actor, opts) {
  // Cùng một lần bấm từ giao diện cũ có thể tới GAS hai lần. Chỉ coi là thành
  // công lặp khi chính người vừa đổi đã tạo sự kiện đó và trạng thái hiện tại
  // đúng là đích; không bỏ qua quyền hay biến một chuyển người thành no-op.
  if (item.status !== to || (FLOW_SERVER[item.status] || {})[to]) return false;
  if (opts.expected_version !== undefined && Number(item.version) !== Number(opts.expected_version) + 1) return false;
  // Đọc trọn bảng Events ở đây là quét toàn bộ lịch sử chi nhánh cho MỖI lần
  // bấm nút chuyển trạng thái, trong lúc đang giữ khóa ghi toàn cục. Lần bấm
  // lặp luôn nằm sát cuối bảng nên chỉ cần quét ngược một đoạn.
  return t.tailWhere('Events', 1, function (e) {
    return e.item_id === item.item_id && e.type === to && e.by === actor.user_id;
  }, { maxScan: 5000 }).rows.length > 0;
}

/** Kết quả cán bộ tick khi hoàn thành hồ sơ (HĐ thế chấp, Rlos); khớp RESULT_FLAGS ở js/domain.js. */
var RESULT_FLAG_KEYS_ = ['HD_THE_CHAP', 'RLOS'];
/** Khóa đã bỏ: màn hình bản cũ còn gửi lên thì bỏ qua, không chặn việc hoàn thành. */
var RESULT_FLAG_LEGACY_KEYS_ = ['GIAI_NGAN'];

/**
 * Chỉ nhận đúng các khóa đã định, giá trị đúng/sai, và chỉ giữ khóa được gửi (việc TSĐB chỉ có HĐ thế chấp).
 * Trả null nếu không có tick nào để ghi.
 */
function normalizeResultFlags_(flags) {
  if (flags === undefined || flags === null) return null;
  if (typeof flags !== 'object' || Array.isArray(flags)) throw new Error('Ghi nhận kết quả không hợp lệ.');
  var out = {}, any = false;
  Object.keys(flags).forEach(function (key) {
    if (RESULT_FLAG_LEGACY_KEYS_.indexOf(key) !== -1) return;
    if (RESULT_FLAG_KEYS_.indexOf(key) === -1) throw new Error('Kết quả "' + key + '" không hợp lệ.');
    out[key] = flags[key] === true || String(flags[key]).toLowerCase() === 'true';
    any = true;
  });
  return any ? out : null;
}

/** Sửa một tick giữ nguyên các tick khác, kể cả phần đã ẩn sau khi bàn giao. */
function mergeResultFlags_(item, flags) {
  var saved = {};
  try { saved = JSON.parse(item.result_flags_json || '{}') || {}; } catch (ignore) { saved = {}; }
  var out = {};
  RESULT_FLAG_KEYS_.forEach(function (key) { if (typeof saved[key] === 'boolean') out[key] = saved[key]; });
  return Object.assign(out, flags);
}

/** Phần việc ghi nhận cho cán bộ cũ khi đổi người; khớp HANDOVER_PARTS ở js/domain.js. */
var HANDOVER_PART_KEYS_ = ['HD_TIN_DUNG', 'HD_THE_CHAP', 'RLOS', 'NHAP_KHO', 'XUAT_KHO'];
var HANDOVER_PART_LABELS_ = { HD_TIN_DUNG: 'HĐ tín dụng', HD_THE_CHAP: 'HĐ thế chấp', RLOS: 'Rlos', NHAP_KHO: 'Nhập kho', XUAT_KHO: 'Xuất kho' };

/** Nhãn ô tick của việc TSĐB; khớp COLLATERAL_STEP_LABELS ở js/domain.js. */
var COLLATERAL_STEP_LABELS_ = { HD_TIN_DUNG: 'Đã soạn xong HĐ tín dụng', HD_THE_CHAP: 'Đã soạn xong HĐ thế chấp', NHAP_KHO: 'Đã nhập kho TSĐB', XUAT_KHO: 'Đã xuất kho TSĐB' };
var STEP_QUANTITY_KEYS_ = { HD_TIN_DUNG: true, HD_THE_CHAP: true, XUAT_KHO: true };
/** Phần làm trong kho: chỉ tick được sau khi đã soạn xong HĐ thế chấp (nếu việc có soạn HĐ thế chấp). */
var WAREHOUSE_STEP_KEYS_ = ['NHAP_KHO', 'XUAT_KHO'];

/**
 * Ô tick bắt buộc trước khi hoàn thành việc TSĐB, theo thứ tự làm. Phân loại theo tên loại việc,
 * khớp collateralStepKeys ở js/domain.js (verify-warehouse-steps-contract.mjs so hai bên).
 */
function collateralStepKeys_(wtRow, item) {
  var group = String(wtRow && wtRow.group_name || '').toLowerCase();
  var typeName = String(wtRow && wtRow.display_name || '').toLowerCase();
  var credit = /^(món|hm sxkd|thấu chi|thẻ tín dụng)/;
  var name = String(wtRow && wtRow.display_name || item && item.product_name || '').toLowerCase();
  if (credit.test(group) || credit.test(typeName) || !/tsđb|tsbđ/.test(group + ' ' + name)) return [];
  var mortgageDoc = (item && item.collateral_mode === 'MOI') ||
    /nhập mới|nhập thêm|đktc|nhập tăng|xuất giảm|plhd|phụ lục|thay đổi/.test(name);
  if (mortgageDoc) return /xuất/.test(name) ? ['HD_THE_CHAP', 'XUAT_KHO'] : ['HD_THE_CHAP', 'NHAP_KHO'];
  return /xuất|xóa thế chấp/.test(name) ? ['XUAT_KHO'] : [];
}

function readCredit_(item) {
  var credit = {};
  try { credit = JSON.parse(item.result_credit_json || '{}') || {}; } catch (ignore) { credit = {}; }
  return credit && typeof credit === 'object' && !Array.isArray(credit) ? credit : {};
}

function draftContractPartKeys_(wtRow, item) {
  var group = String(wtRow && wtRow.group_name || '').toLowerCase();
  var typeName = String(wtRow && wtRow.display_name || '').toLowerCase();
  var creditWork = /^(món|hm sxkd|thấu chi|thẻ tín dụng)/.test(group) ||
    /^(món|hm sxkd|thấu chi|thẻ tín dụng)/.test(typeName);
  if (creditWork) {
    var productName = String(item && item.product_name || '').toLowerCase();
    var mortgageName = String(wtRow && wtRow.display_name || productName).toLowerCase();
    var pledge = /cầm cố/.test(mortgageName) || /cầm cố/.test(productName);
    var hasMortgage = !pledge && !(item && item.collateral_mode) &&
      /tsđb|tsbđ|nhà ở|ôtô|ô tô/.test(mortgageName) && !/tín chấp/.test(mortgageName);
    return hasMortgage ? ['HD_TIN_DUNG', 'HD_THE_CHAP'] : ['HD_TIN_DUNG'];
  }
  // Với việc TSĐB có bước soạn HĐ thế chấp, đặt lịch ký xác nhận phần hợp đồng
  // đã soạn; bước nhập/xuất kho vẫn phải làm riêng trước khi đóng hồ sơ.
  if (collateralStepKeys_(wtRow, item).indexOf('HD_THE_CHAP') !== -1) return ['HD_THE_CHAP'];
  return [];
}

function resultObject_(value) {
  try {
    var parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) { return null; }
}

/** Bổ sung kết quả hẹn cũ cho dữ liệu trả về; không ghi Sheet trong lần đọc. */
function projectAppointmentDraftCredits_(items, workTypes, source) {
  var types = {}, candidates = {}, aliases = {}, remaining = 0;
  workTypes.forEach(function (wt) { types[wt.type_code] = wt; });
  items.forEach(function (item) {
    if (item.status === 'HUY' || item.carried_to_item_id || !item.assigned_user_id || !item.appointment_json) return;
    var appointment = resultObject_(item.appointment_json), credit = resultObject_(item.result_credit_json);
    if (!appointment || appointment.draft_credit_version || !credit) return;
    var flags = resultObject_(item.result_flags_json) || {};
    var keys = draftContractPartKeys_(types[item.work_type_code], item).filter(function (key) {
      return !stepDone_(credit, key) && !(key === 'HD_THE_CHAP' && flags.HD_THE_CHAP === false);
    });
    if (!keys.length) return;
    var candidate = { item: item, credit: credit, pending: {}, changed: false };
    keys.forEach(function (key) { candidate.pending[key] = true; remaining++; });
    candidates[item.item_id] = candidate;
    [item.item_id, item.carryover_from_item_id, item.origin_item_id].filter(Boolean).forEach(function (id) {
      (aliases[id] || (aliases[id] = [])).push(candidate);
    });
  });
  if (!remaining) return items;
  var users = {};
  (source.rows ? source.rows('Users') : source.getAll('Users')).forEach(function (user) { users[user.user_id] = user; });
  source.tailWhere('Events', remaining, function (event) {
    if (!aliases[event.item_id] || ['DANG_HEN_KH', 'GHI_NHAN_PHAN_VIEC'].indexOf(event.type) === -1) return false;
    var after = resultObject_(event.after_json), before = resultObject_(event.before_json), matched = false;
    var afterCredit = event.type === 'DANG_HEN_KH' ? after && resultObject_(after.result_credit_json) : after;
    aliases[event.item_id].forEach(function (candidate) {
      Object.keys(candidate.pending).forEach(function (key) {
        if (event.type === 'GHI_NHAN_PHAN_VIEC' && after && before && !after[key] && !before[key]) return;
        delete candidate.pending[key]; remaining--; matched = true;
        var part = afterCredit && afterCredit[key];
        if (!part && event.type === 'DANG_HEN_KH' && after) {
          var assigned = after.assigned_user_id || (users[event.by] && users[event.by].role === 'CAN_BO_LS' ? event.by : '');
          if (!assigned && candidate.item.assigned_at && new Date(candidate.item.assigned_at) <= new Date(event.at)) assigned = candidate.item.assigned_user_id;
          if (assigned) part = { user_id: assigned, at: event.at, by: event.by, quantity: 1, source: 'APPOINTMENT_HISTORY' };
        }
        if (!part || !users[part.user_id] || users[part.user_id].role !== 'CAN_BO_LS' || !part.at || !isFinite(new Date(part.at).getTime())) return;
        candidate.credit[key] = Object.assign({}, part, { quantity: Math.max(1, Math.floor(Number(part.quantity) || 1)) });
        candidate.changed = true;
      });
    });
    return matched;
  }, { maxScan: 100000, stopWhen: function () { return remaining === 0; } });
  return items.map(function (item) {
    var candidate = candidates[item.item_id];
    return candidate && candidate.changed ? Object.assign({}, item, { result_credit_json: JSON.stringify(candidate.credit) }) : item;
  });
}

/** Kết quả hoàn thành đang được bảng ngày tính mặc định là một đơn vị. */
function completedContractResult_(item, wt, key) {
  if (item.status !== 'HOAN_THANH_LS' || !item.completed_at || !item.assigned_user_id) return null;
  var draftKeys = draftContractPartKeys_(wt, item), creditWork = draftKeys.indexOf('HD_TIN_DUNG') !== -1;
  var flags = resultObject_(item.result_flags_json) || {}, credit = readCredit_(item);
  var collateral = /tsđb|tsbđ/i.test(String(wt && wt.group_name || '') + ' ' + String(wt && wt.display_name || item.product_name || ''));
  var steps = collateralStepKeys_(wt, item);
  var applies = key === 'HD_TIN_DUNG' && creditWork;
  if (key === 'HD_THE_CHAP' && flags.HD_THE_CHAP !== false) {
    var mortgage = flags.HD_THE_CHAP === true || draftKeys.indexOf(key) !== -1;
    applies = mortgage && (creditWork ? item.collateral_mode !== 'MOI' : collateral && !steps.every(function (step) { return stepDone_(credit, step); }));
    if (collateral && !steps.length && flags.HD_THE_CHAP === true) applies = true;
  }
  return applies ? { user_id: item.assigned_user_id, at: item.completed_at, by: item.assigned_user_id, quantity: 1, source: 'COMPLETION' } : null;
}

/** Các phần được ghi nhận khi bàn giao; khớp handoverPartsFor ở giao diện. */
function handoverPartKeys_(wtRow, item) {
  var group = String(wtRow && wtRow.group_name || '').toLowerCase();
  var name = String(wtRow && wtRow.display_name || item && item.product_name || '').toLowerCase();
  var credit = /^(món|hm sxkd|thấu chi|thẻ tín dụng)/;
  if (credit.test(group) || credit.test(name)) return item && item.collateral_mode === 'MOI' ? ['HD_TIN_DUNG', 'RLOS'] : ['HD_TIN_DUNG', 'HD_THE_CHAP', 'RLOS'];
  if (!/tsđb|tsbđ/.test(group + ' ' + name)) return [];
  var keys = collateralStepKeys_(wtRow, item);
  return keys.length ? keys : ['HD_THE_CHAP'];
}

function stepDone_(credit, key) { return !!(credit[key] && credit[key].user_id); }

/** Nhập/xuất kho chỉ sau khi đã soạn xong HĐ thế chấp. Trả chuỗi lỗi, rỗng nếu đúng thứ tự. */
function stepOrderError_(credit, required) {
  if (required.indexOf('HD_THE_CHAP') === -1 || stepDone_(credit, 'HD_THE_CHAP')) return '';
  for (var i = 0; i < WAREHOUSE_STEP_KEYS_.length; i++) {
    if (stepDone_(credit, WAREHOUSE_STEP_KEYS_[i])) return 'Tick "' + COLLATERAL_STEP_LABELS_.HD_THE_CHAP + '" trước khi tick nhập/xuất kho.';
  }
  return '';
}

function normalizeSteps_(steps) {
  if (steps === undefined || steps === null) return [];
  if (!Array.isArray(steps)) throw new Error('Phần việc đã tick không hợp lệ.');
  var out = [];
  steps.forEach(function (key) {
    key = String(key || '').trim();
    if (!COLLATERAL_STEP_LABELS_[key]) throw new Error('Phần việc "' + key + '" không hợp lệ.');
    if (out.indexOf(key) === -1) out.push(key);
  });
  return out;
}

function normalizeStepQuantity_(key, value) {
  if (!STEP_QUANTITY_KEYS_[key]) throw new Error('Phần việc này không ghi nhận số lượng.');
  if (value === undefined || value === null || value === '') return 1;
  var quantity = Number(value);
  if (!isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity) {
    throw new Error('Số lượng phải là số nguyên lớn hơn 0.');
  }
  return quantity;
}

function normalizeStepQuantities_(quantities, tickedSteps) {
  if (quantities === undefined || quantities === null) return {};
  if (typeof quantities !== 'object' || Array.isArray(quantities)) throw new Error('Số lượng phần việc không hợp lệ.');
  var out = {};
  Object.keys(quantities).forEach(function (key) {
    if (!STEP_QUANTITY_KEYS_[key] || tickedSteps.indexOf(key) === -1) throw new Error('Số lượng không khớp phần việc đã tick.');
    out[key] = normalizeStepQuantity_(key, quantities[key]);
  });
  return out;
}

function normalizeHandoverParts_(parts) {
  if (parts === undefined || parts === null) return [];
  if (!Array.isArray(parts)) throw new Error('Phần việc đã làm không hợp lệ.');
  var out = [];
  parts.forEach(function (key) {
    key = String(key || '').trim();
    if (HANDOVER_PART_KEYS_.indexOf(key) === -1) throw new Error('Phần việc "' + key + '" không hợp lệ.');
    if (out.indexOf(key) === -1) out.push(key);
  });
  return out;
}

/** Internal switching closes staff sessions without pausing the dossier SLA. Caller holds the write lock. */
/** Đọc trạng thái mới nhất dưới khóa vì trạng thái "đang làm" có thể đổi khi giao dịch đang chờ khóa. */
function activeItemsOf_(t, userId, exceptId) {
  return t.rows('WorkItems').filter(function (i) {
    return i.item_id !== exceptId && !i.carried_to_item_id && i.assigned_user_id === userId &&
      LSTiming.workState(i) === 'ACTIVE';
  });
}

function switchWorkFocus_(t, target, user, ts) {
  var updates=[];
  activeItemsOf_(t, user.user_id, target.item_id).forEach(function(i) {
    var found=t.find('WorkItems','item_id',i.item_id);
    var previousState=i.execution_state || 'ACTIVE';
    var fields={execution_state:'WAITING',execution_changed_at:ts,updated_at:ts,version:Number(i.version)+1,
      processing_sessions_json:JSON.stringify(LSTiming.nextSessions(i,i.status,ts,i.assigned_user_id,'WAITING'))};
    var pauses=nextPauseLog_(i,'DA_PHAN_CONG',ts);
    if(pauses!==null)fields.pause_log_json=pauses;
    t.write(found,fields);
    t.append('Events',{event_id:id_('EVT'),item_id:i.item_id,type:'CHO_LAM_TIEP',by:user.user_id,at:ts,
      reason:'Chuyển sang làm hồ sơ '+target.item_id+'.',before_json:JSON.stringify({execution_state:previousState}),after_json:JSON.stringify(fields)});
    updates.push(Object.assign({item_id:i.item_id},fields));
  });
  return updates;
}

/** One active dossier per officer; switching A to B is committed atomically at one timestamp. */
function focusWorkItem(itemId, expectedVersion) {
  var u=requireActor_();
  if(u.role!=='CAN_BO_LS')throw new Error('Chỉ cán bộ LS được giao mới bắt đầu làm hồ sơ.');
  var result=DataRepository.tx(function(t) {
    if (activeGlobalPause_(globalPauseEvents_(t,u.user_id,1,10000).rows,u.user_id)) {
      throw new Error('Hãy kết thúc tác nghiệp đang tạm dừng trước khi bắt đầu hồ sơ.');
    }
    var found=t.find('WorkItems','item_id',itemId);
    if(!found)throw new Error('Không tìm thấy hồ sơ.');
    var item=found.object;
    assertCurrentWorkItem_(item);
    if(item.assigned_user_id!==u.user_id)throw new Error('Chỉ cán bộ được giao mới làm hồ sơ này.');
    if(CLOCK_RUNNING_.indexOf(item.status)===-1 || !item.dossier_received_at || item.completed_at)throw new Error('Tiếp nhận hoặc tiếp tục hồ sơ trước khi bắt đầu làm.');
    if(expectedVersion===undefined || Number(expectedVersion)!==Number(item.version)) {
      throw new Error('Hồ sơ đã được cập nhật. Tải lại trước khi chuyển việc.');
    }
    var ts=stamp_(),updates=switchWorkFocus_(t,item,u,ts);
    var fields={execution_state:'ACTIVE',execution_changed_at:ts,updated_at:ts,version:Number(item.version)+1,
      processing_started_at:item.processing_started_at || ts,
      processing_sessions_json:JSON.stringify(LSTiming.nextSessions(item,item.status,ts,u.user_id,'ACTIVE'))};
    var pauses=nextPauseLog_(item,item.status,ts);
    if(pauses!==null)fields.pause_log_json=pauses;
    var event=item.processing_started_at?'LAM_TIEP':'BAT_DAU_LAM';
    t.write(found,fields);
    t.append('Events',{event_id:id_('EVT'),item_id:itemId,type:event,by:u.user_id,at:ts,
      reason:'Bắt đầu phiên xử lý hồ sơ.',after_json:JSON.stringify(fields)});
    updates.push(Object.assign({item_id:itemId},fields));
    return {ok:true,period_id:item.period_id,focus_updates:updates};
  },ITEM_WARM_);
  markPlanDirty_(result.period_id,true);
  return result;
}

function startGlobalPause(category) {
  var u=requireActor_();
  if(u.role!=='CAN_BO_LS')throw new Error('Chỉ cán bộ LS được dùng chức năng này.');
  category=String(category || '').trim();
  if(!GLOBAL_PAUSE_CATEGORIES_[category])throw new Error('Chọn loại tác nghiệp hợp lệ.');
  var result=DataRepository.tx(function(t) {
    var events=globalPauseEvents_(t,u.user_id,1,10000).rows;
    if(activeGlobalPause_(events,u.user_id))throw new Error('Bạn đang có một lượt tạm dừng chưa kết thúc.');
    var ts=stamp_(), active=activeItemsOf_(t, u.user_id, '').sort(function(a,b){return String(b.execution_changed_at || '').localeCompare(String(a.execution_changed_at || ''));});
    var pausedItemId=active.length ? active[0].item_id : '', updates=[],periodIds=[];
    active.forEach(function(item) {
      var found=t.find('WorkItems','item_id',item.item_id);
      if(!found)return;
      var fields={execution_state:'WAITING',execution_changed_at:ts,updated_at:ts,version:Number(item.version)+1,
        processing_sessions_json:JSON.stringify(LSTiming.nextSessions(item,item.status,ts,u.user_id,'WAITING'))};
      var pauses=nextPauseLog_(item,'DA_PHAN_CONG',ts);
      if(pauses!==null)fields.pause_log_json=pauses;
      t.write(found,fields);
      t.append('Events',{event_id:id_('EVT'),item_id:item.item_id,type:'TAM_DUNG_TOAN_BO',by:u.user_id,at:ts,
        reason:GLOBAL_PAUSE_CATEGORIES_[category],before_json:JSON.stringify({execution_state:item.execution_state || 'ACTIVE'}),after_json:JSON.stringify(fields)});
      updates.push(Object.assign({item_id:item.item_id},fields));
      if(periodIds.indexOf(item.period_id)===-1)periodIds.push(item.period_id);
    });
    var operationId=id_('EVT'), operation={operation_id:operationId,category:category,started_at:ts,paused_item_id:pausedItemId};
    t.append('Events',{event_id:operationId,item_id:'',type:GLOBAL_PAUSE_START_,by:u.user_id,at:ts,
      reason:GLOBAL_PAUSE_CATEGORIES_[category],after_json:JSON.stringify(operation)});
    return {ok:true,operation:operation,focus_updates:updates,period_ids:periodIds};
  },ITEM_WARM_);
  result.period_ids.forEach(function(periodId){markPlanDirty_(periodId,true);});
  return result;
}

function endGlobalPause(operationId, works) {
  var u=requireActor_();
  if(u.role!=='CAN_BO_LS')throw new Error('Chỉ cán bộ LS được dùng chức năng này.');
  operationId=String(operationId || '').trim();
  if(!operationId)throw new Error('Thiếu lượt tạm dừng cần kết thúc.');
  var freshWorks=normalizeOtherWorks_(works,true);
  var result=DataRepository.tx(function(t) {
    var events=globalPauseEvents_(t,u.user_id,1,10000).rows,operation=activeGlobalPause_(events,u.user_id);
    if(!operation || operation.operation_id!==operationId)throw new Error('Lượt tạm dừng đã thay đổi. Tải lại màn hình.');
    var ts=stamp_(),meta={operation_id:operation.operation_id,category:operation.category,
      started_at:operation.started_at,ended_at:ts,paused_item_id:operation.paused_item_id};
    // Việc khác đã ghi trong lượt này cùng việc ghi lúc kết thúc: chia số phút làm việc của lượt tạm dừng cho chúng.
    // Đọc trước mọi lệnh thêm dòng trong giao dịch để không ép ghi sớm.
    var attached=t.tailWhere('OtherWork',200,function(r) {
      return r.user_id===u.user_id && r.operation_id===operation.operation_id && !r.canceled_at;
    },{maxScan:2000,stopWhen:function(r){return String(r.at || '')<String(operation.started_at || '');}}).rows;
    var minutes=splitPauseMinutes_(pauseWorkingMinutes_(t,operation.started_at,ts),
      attached.map(function(r){return {category:r.category,quantity:Math.max(1,Number(r.quantity) || 1)};})
        .concat(freshWorks.map(function(w){return {category:w.category,quantity:w.quantity};})));
    var otherWork=[];
    attached.forEach(function(r,n) {
      var foundWork=t.find('OtherWork','work_id',r.work_id);
      if(foundWork)t.write(foundWork,{minutes:minutes[n]});
      otherWork.push({work_id:r.work_id,category:r.category,quantity:Number(r.quantity) || 1,minutes:minutes[n],operation_id:operation.operation_id});
    });
    var day=localBusinessDate_(ts);
    freshWorks.forEach(function(w,n) {
      var row={work_id:id_('OW'),user_id:u.user_id,work_date:day,category:w.category,quantity:w.quantity,
        minutes:minutes[attached.length+n],operation_id:operation.operation_id,at:ts,canceled_at:'',canceled_by:''};
      t.append('OtherWork',row);
      otherWork.push({work_id:row.work_id,category:row.category,quantity:row.quantity,minutes:row.minutes,operation_id:row.operation_id});
    });
    t.append('Events',{event_id:id_('EVT'),item_id:'',type:GLOBAL_PAUSE_END_,by:u.user_id,at:ts,
      reason:GLOBAL_PAUSE_CATEGORIES_[operation.category] || 'Khác',before_json:JSON.stringify({operation_id:operation.operation_id}),after_json:JSON.stringify(meta)});
    var updates=[],periodIds=[],itemId=operation.paused_item_id;
    if(itemId) {
      var found=t.find('WorkItems','item_id',itemId),item=found && found.object;
      if(item && item.assigned_user_id===u.user_id && !item.carried_to_item_id && !item.completed_at &&
          CLOCK_RUNNING_.indexOf(item.status)!==-1 && item.dossier_received_at && LSTiming.workState(item)==='WAITING') {
        updates=switchWorkFocus_(t,item,u,ts);
        var fields={execution_state:'ACTIVE',execution_changed_at:ts,updated_at:ts,version:Number(item.version)+1,
          processing_started_at:item.processing_started_at || ts,
          processing_sessions_json:JSON.stringify(LSTiming.nextSessions(item,item.status,ts,u.user_id,'ACTIVE'))};
        var pauses=nextPauseLog_(item,item.status,ts);
        if(pauses!==null)fields.pause_log_json=pauses;
        t.write(found,fields);
        t.append('Events',{event_id:id_('EVT'),item_id:itemId,type:'TIEP_TUC_TOAN_BO',by:u.user_id,at:ts,
          reason:'Tiếp tục hồ sơ sau tác nghiệp khác.',before_json:JSON.stringify({execution_state:'WAITING'}),after_json:JSON.stringify(fields)});
        updates.push(Object.assign({item_id:itemId},fields));
        periodIds.push(item.period_id);
      }
    }
    return {ok:true,operation:null,focus_updates:updates,period_ids:periodIds,other_work:otherWork};
  },{warm:ITEM_WARM_.warm.concat(['OtherWork']),append:ITEM_WARM_.append});
  result.period_ids.forEach(function(periodId){markPlanDirty_(periodId,true);});
  return result;
}

function transitionItem(itemId, to, opts) {
  var u = requireActor_();
  opts = opts || {};
  var handoverParts = normalizeHandoverParts_(opts.handover_parts);
  if (handoverParts.length && to !== 'DA_PHAN_CONG') throw new Error('Chỉ ghi nhận phần việc đã làm khi đổi người xử lý.');
  var notificationMode = String(opts.notification_mode || 'DEFAULT').toUpperCase();
  if (['DEFAULT', 'IN_APP', 'NONE'].indexOf(notificationMode) === -1) throw new Error('Lựa chọn thông báo không hợp lệ.');
  if (to !== 'HOAN_THANH_LS' && notificationMode !== 'DEFAULT') throw new Error('Chỉ được chọn cách thông báo khi hoàn thành việc.');
  var resultFlags = normalizeResultFlags_(opts.result_flags);
  if (to !== 'HOAN_THANH_LS' && resultFlags) throw new Error('Chỉ được ghi nhận kết quả khi hoàn thành việc.');
  var stepsTicked = normalizeSteps_(opts.steps);
  if (to !== 'HOAN_THANH_LS' && stepsTicked.length) throw new Error('Chỉ được tick phần việc khi hoàn thành việc.');
  if (to !== 'HOAN_THANH_LS' && opts.step_quantities && Object.keys(opts.step_quantities).length) throw new Error('Chỉ được ghi số lượng phần việc khi hoàn thành việc.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
    assertCurrentWorkItem_(item);

    if (transitionIdempotent_(t, item, to, u, opts)) {
      return { ok: true, idempotent: true, status: to, version: Number(item.version), queued: 0, period_id: item.period_id };
    }

    if (opts.expected_version !== undefined && Number(item.version) !== Number(opts.expected_version)) {
      throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.');
    }

    var allowed = (FLOW_SERVER[item.status] || {})[to];
    // Hủy là thao tác trực tiếp của cán bộ đang giữ hồ sơ hoặc Phòng/PGD sở hữu hồ sơ;
    // không tạo đề nghị chờ KS/Quản lý duyệt.
    if (to === 'HUY' && OPEN_STATUS.indexOf(item.status) !== -1 &&
        ['CAN_BO_LS', 'PHONG_PGD'].indexOf(u.role) !== -1) {
      allowed = (allowed || []).slice();
      if (allowed.indexOf(u.role) === -1) allowed.push(u.role);
    }
    if (!allowed) throw new Error('Không thể chuyển từ ' + item.status + ' sang ' + to + '.');
    if (allowed.indexOf(u.role) === -1) throw new Error('Vai trò ' + u.role + ' không được thực hiện thao tác này.');
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới xử lý việc này.');
    if (u.role === 'CAN_BO_LS' && activeGlobalPause_(globalPauseEvents_(t,u.user_id,1,10000).rows,u.user_id)) {
      throw new Error('Hãy kết thúc tác nghiệp đang tạm dừng trước khi cập nhật hồ sơ.');
    }
    if(u.role==='CAN_BO_LS' && ['QUEUED','WAITING'].indexOf(LSTiming.workState(item))!==-1 &&
        ['DANG_HEN_KH','DA_SOAN_XONG','CHO_KS_DUYET','HOAN_THANH_LS'].indexOf(to)!==-1) {
      throw new Error('Bấm Làm ngay hoặc Làm tiếp trước khi cập nhật kết quả hồ sơ.');
    }

    var req = t.find('Requests', 'request_id', item.request_id);
    if (u.role === 'PHONG_PGD' && (!req || req.object.unit_id !== u.unit_id)) {
      throw new Error('Việc không thuộc đơn vị của bạn.');
    }
    var resendDate = '';
    if (REQUESTOR_RESEND_STATUS.indexOf(item.status) !== -1 && to === 'CHO_PHAN_CONG') {
      var requesterId = req && (req.object.requestor_id || req.object.created_by);
      if (u.role !== 'PHONG_PGD' || !req || String(requesterId || '') !== String(u.user_id)) {
        throw new Error('Chỉ người tạo đề nghị của Phòng/PGD mới được gửi lại hồ sơ.');
      }
      resendDate = requestedDate_(opts.occurrence_date);
      if (resendDate < localBusinessDate_()) throw new Error('Ngày gửi lại không được trước hôm nay.');
    }
    if (to === 'TAM_DUNG' && u.role === 'PHONG_PGD' &&
        (!req || String(req.object.requestor_id || req.object.created_by || '') !== String(u.user_id))) {
      throw new Error('Chỉ cán bộ QLKH tạo đề nghị này mới được tạm dừng.');
    }

    var reason = String(opts.reason || '').trim();
    if (reasonRequired_(item.status, to) && !reason) throw new Error('Thao tác này bắt buộc ghi lý do.');

    var ts = stamp_();
    var fields = { status: to, version: Number(item.version) + 1, updated_at: ts };
    var doneType = t.find('WorkTypes', 'type_code', item.work_type_code);
    var projectedItem = projectAppointmentDraftCredits_([item], doneType ? [doneType.object] : [], t)[0];
    if (projectedItem.result_credit_json !== item.result_credit_json) fields.result_credit_json = projectedItem.result_credit_json;
    item = projectedItem;
    if (resendDate) fields.occurrence_date = resendDate;
    var focusUpdates=[], assignedStaff = null, linkedAuto = null;
    fields.execution_state=CLOCK_RUNNING_.indexOf(to)!==-1 ?
      (to==='DANG_THUC_HIEN' ? (opts.start_now===false || u.role!=='CAN_BO_LS'?'QUEUED':'ACTIVE') : LSTiming.workState(item) || 'QUEUED') : '';
    fields.execution_changed_at=ts;
    if(to==='DANG_THUC_HIEN' && fields.execution_state==='ACTIVE' && u.role==='CAN_BO_LS') {
      focusUpdates=switchWorkFocus_(t,item,u,ts);
    }

    // Cán bộ LS bấm "Tiếp nhận hồ sơ" = mốc nhận hồ sơ đủ, bắt đầu tính SLA. Phân công
    // không khởi động đồng hồ. Hồ sơ đã có mốc (LS tick, sửa giờ) hoặc đã từng xử lý thì
    // giữ nguyên, không ghi đè.
    // Tiếp tục sau khi tạm dừng từ trước lúc nhận hồ sơ (chưa có hạn) cũng là lần tiếp nhận đầu.
    if (to === 'DANG_THUC_HIEN' && u.role === 'CAN_BO_LS' && !item.dossier_received_at && !item.processing_started_at &&
        (item.status === 'DA_PHAN_CONG' || (item.status === 'TAM_DUNG' && !item.due_at))) {
      fields.dossier_received_at = ts;
      fields.dossier_received_by = u.user_id;
      fields.timing_source = 'CONFIRMED';
    }

    var checklistDefs = [];
    try { checklistDefs = doneType ? JSON.parse(doneType.object.checklist_json || '[]') : []; } catch (ignoreChecklist) { checklistDefs = []; }
    var checklistState = [];
    try { checklistState = JSON.parse(item.checklist_json || '[]'); } catch (ignoreChecklistState) { checklistState = []; }
    if (['DA_SOAN_XONG', 'HOAN_THANH_LS'].indexOf(to) !== -1 && checklistDefs.length && checklistState.filter(Boolean).length < checklistDefs.length) {
      throw new Error('Chưa tích đủ các nhóm việc; hãy ghi nhận từng phần trước khi hoàn thành toàn bộ hồ sơ.');
    }

    if (to === 'DA_PHAN_CONG') {
      var staff = t.find('Users', 'user_id', opts.assignee_id);
      if (!userAvailableForAssignment_(staff && staff.object, ts)) {
        if (staff && userOff_(staff.object, ts)) {
          var offFrom = dateOnly_(staff.object.off_from), offTo = dateOnly_(staff.object.off_to);
          throw new Error('Cán bộ ' + staff.object.full_name + ' đang nghỉ' + (offFrom ? ' từ ' + offFrom : '') + (offTo ? ' đến ' + offTo : '') + '. Chọn cán bộ khác hoặc bàn giao việc đang mở.');
        }
        throw new Error('Người nhận việc phải là cán bộ LS đang hoạt động.');
      }
      var wt = t.find('WorkTypes', 'type_code', item.work_type_code);
      var slaHours = wt ? Number(wt.object.sla_hours) || 8 : 8;
      assignedStaff = staff.object;
      fields.assigned_user_id = opts.assignee_id;
      fields.assigned_by = u.user_id;
      fields.assigned_at = ts;
      fields.first_assigned_at = item.first_assigned_at || item.assigned_at || ts;
      if (opts.is_priority !== undefined) fields.is_priority = truthy_(opts.is_priority);
      if (!item.dossier_received_at) fields.due_at = '';
      reason = 'Giao ' + staff.object.full_name + (reason ? ' — ' + reason : '');
      if (handoverParts.length) {
        // Cán bộ cũ đã làm xong phần nào thì phần đó tính cho họ, ngày bàn giao; người nhận làm phần còn lại.
        if (!item.assigned_user_id || item.assigned_user_id === opts.assignee_id || !item.processing_started_at) {
          throw new Error('Chỉ ghi nhận phần việc đã làm khi chuyển hồ sơ đang xử lý sang cán bộ khác.');
        }
        var credit = {};
        try { credit = JSON.parse(item.result_credit_json || '{}') || {}; } catch (ignoreCredit) { credit = {}; }
        var prev = t.find('Users', 'user_id', item.assigned_user_id);
        var allowedParts = handoverPartKeys_(wt && wt.object, item);
        handoverParts.forEach(function (key) {
          if (allowedParts.indexOf(key) === -1) throw new Error('Phần ' + HANDOVER_PART_LABELS_[key] + ' không áp dụng cho việc này.');
          if (credit[key] && credit[key].user_id) throw new Error('Phần ' + HANDOVER_PART_LABELS_[key] + ' đã được ghi nhận trước đó.');
          credit[key] = { user_id: item.assigned_user_id, at: ts, by: u.user_id };
        });
        var handoverOrder = stepOrderError_(credit, collateralStepKeys_(wt && wt.object, item));
        if (handoverOrder) throw new Error(handoverOrder);
        fields.result_credit_json = JSON.stringify(credit);
        reason += ' · ' + (prev ? prev.object.full_name : item.assigned_user_id) + ' đã làm xong: ' +
          handoverParts.map(function (key) { return HANDOVER_PART_LABELS_[key]; }).join(', ');
      }
    }

    if (to === 'DANG_HEN_KH') {
      if (!opts.appointment || !opts.appointment.at) throw new Error('Thiếu thời gian hẹn.');
      // Khách không có kênh liên hệ nào thì vẫn hẹn được: tin đi vào nhóm nội bộ
      // và gắn thẻ cán bộ phụ trách. Chặn ở đây là khóa chết những hồ sơ đó lại,
      // vì mọi loại việc đều phải qua bước hẹn mới hoàn thành được.
      if (!req) throw new Error('Không tìm thấy hồ sơ của việc này.');
      if (!req.object.phone && !req.object.email && !opts.appointment.via_group) {
        throw new Error('Khách chưa có điện thoại hoặc email; chọn báo qua nhóm nội bộ.');
      }
      fields.appointment_json = JSON.stringify(Object.assign({}, opts.appointment, { draft_credit_version: 1 }));
      reason = 'Hẹn ' + opts.appointment.at + ' qua ' + opts.appointment.channel;
      var draftKeys = draftContractPartKeys_(doneType && doneType.object, item);
      if (draftKeys.length) {
        var drafted = readCredit_(item), newlyDrafted = [];
        draftKeys.forEach(function (key) {
          if (stepDone_(drafted, key)) return;
          drafted[key] = { user_id: item.assigned_user_id || u.user_id, at: ts, by: u.user_id, quantity: 1, source: 'APPOINTMENT' };
          newlyDrafted.push(HANDOVER_PART_LABELS_[key]);
        });
        if (newlyDrafted.length) {
          fields.result_credit_json = JSON.stringify(drafted);
          reason += ' · Đã ghi nhận soạn ' + newlyDrafted.join(' và ');
        }
      }
    }

    if ((to === 'CHO_PHAN_CONG' || to === 'DA_PHAN_CONG') && !item.accepted_at) fields.accepted_at = ts;
    if (to === 'DANG_THUC_HIEN' && fields.execution_state==='ACTIVE' && !item.processing_started_at) fields.processing_started_at = ts;
    var pauses = nextPauseLog_(item, fields.execution_state==='QUEUED'?'DA_PHAN_CONG':to, ts);
    if (pauses !== null) fields.pause_log_json = pauses;

    // Hạn xử lý đứng yên khi chờ bên ngoài; ra khỏi trạng thái chờ thì lùi hạn
    // đúng số giờ làm đã chờ. Giao lại người đã tính hạn mới ở trên nên bỏ qua.
    var wasPaused = SLA_PAUSED_STATUS.indexOf(item.status) !== -1;
    var nowPaused = SLA_PAUSED_STATUS.indexOf(to) !== -1;
    if (!wasPaused && nowPaused && item.due_at) fields.sla_paused_at = ts;
    if (wasPaused && !nowPaused) {
      if (to !== 'DA_PHAN_CONG') {
        var resumed = resumeDueAt_(t, item, ts);
        if (resumed) fields.due_at = resumed;
      }
      fields.sla_paused_at = '';
    }

    if (to === 'HOAN_THANH_LS') {
      // Việc TSĐB: phải tick đủ soạn xong HĐ thế chấp và nhập/xuất kho. Ô tick nào chưa có thì tick ngay trong
      // lần hoàn thành này, tính cho cán bộ đang giữ hồ sơ theo ngày hoàn thành.
      var requiredSteps = collateralStepKeys_(doneType && doneType.object, item);
      if (!requiredSteps.length && stepsTicked.length) throw new Error('Việc này không có phần việc để tick.');
      if (requiredSteps.length) {
        var stepCredit = readCredit_(item);
        var quantityKeys = stepsTicked.concat(requiredSteps.filter(function (key) { return stepDone_(stepCredit, key); }));
        var stepQuantities = normalizeStepQuantities_(opts.step_quantities, quantityKeys);
        stepsTicked.forEach(function (key) {
          if (requiredSteps.indexOf(key) === -1) throw new Error('Phần "' + COLLATERAL_STEP_LABELS_[key] + '" không áp dụng cho việc này.');
          if (!stepDone_(stepCredit, key)) {
            stepCredit[key] = { user_id: item.assigned_user_id || u.user_id, at: ts, by: u.user_id };
            if (STEP_QUANTITY_KEYS_[key]) stepCredit[key].quantity = stepQuantities[key] || 1;
          }
        });
        requiredSteps.forEach(function (key) {
          if (stepDone_(stepCredit, key) && stepQuantities[key] && STEP_QUANTITY_KEYS_[key]) {
            var priorQuantity = Math.max(1, Math.floor(Number(stepCredit[key].quantity) || 1));
            if (priorQuantity !== stepQuantities[key] && u.role === 'CAN_BO_LS' && stepCredit[key].user_id !== u.user_id) {
              throw new Error('Phần này do cán bộ khác làm; nhờ Kiểm soát hoặc Quản lý LS điều chỉnh số lượng.');
            }
            stepCredit[key].quantity = stepQuantities[key];
          }
        });
        var missingSteps = requiredSteps.filter(function (key) { return !stepDone_(stepCredit, key); });
        if (missingSteps.length) {
          throw new Error('Chưa tick: ' + missingSteps.map(function (key) { return COLLATERAL_STEP_LABELS_[key]; }).join(', ') + '.');
        }
        var stepOrder = stepOrderError_(stepCredit, requiredSteps);
        if (stepOrder) throw new Error(stepOrder);
        fields.result_credit_json = JSON.stringify(stepCredit);
      } else if (opts.step_quantities && Object.keys(opts.step_quantities).length) {
        throw new Error('Việc này không có số lượng phần việc để ghi nhận.');
      }
      // Loại việc cần khách ký thì phải có lịch hẹn trước khi đóng việc.
      if (doneType && truthy_(doneType.object.requires_appointment) && !item.appointment_json) {
        throw new Error('Loại việc này cần hẹn khách ký trước khi hoàn thành.');
      }
      fields.completed_at = ts;
      if (resultFlags) fields.result_flags_json = JSON.stringify(mergeResultFlags_(item, resultFlags));
    }
    if (to === 'DANG_THUC_HIEN' && item.status === 'HOAN_THANH_LS') {
      // Mở lại giữ SLA toàn trình và lịch sử các phiên xử lý.
      fields.completed_at = '';
    }

    // Gửi lại vào hàng chờ mà việc chính / việc kèm cùng nhóm đang có cán bộ giữ: giao thẳng người đó, không chờ phân công.
    if (to === 'CHO_PHAN_CONG') {
      linkedAuto = linkedHolder_(t, item, ts);
      if (linkedAuto) {
        assignedStaff = linkedAuto.user;
        fields.status = 'DA_PHAN_CONG';
        fields.assigned_user_id = linkedAuto.user.user_id;
        fields.assigned_by = u.user_id;
        fields.assigned_at = ts;
        fields.first_assigned_at = item.first_assigned_at || item.assigned_at || ts;
        if (!item.accepted_at) fields.accepted_at = ts;
        if (!item.dossier_received_at) fields.due_at = '';
        reason = (reason ? reason + ' · ' : '') + 'Giao ' + linkedAuto.user.full_name + ' cùng ' +
          (linkedAuto.item.parent_item_id ? 'việc kèm ' : 'việc chính ') + (linkedAuto.item.source_stt || linkedAuto.item.item_id);
      }
    }

    fields.processing_sessions_json = JSON.stringify(LSTiming.nextSessions(item,fields.status,ts,fields.assigned_user_id || item.assigned_user_id,fields.execution_state));
    var timedItem = Object.assign({},item,fields);
    if (timedItem.dossier_received_at) {
      fields.sla_pause_log_json = JSON.stringify(LSTiming.nextPauses(item,to,ts));
      timedItem.sla_pause_log_json = fields.sla_pause_log_json;
      fields.due_at = LSTiming.deadline(timedItem,doneType ? Number(doneType.object.sla_hours) || 8 : 8,timingCalendar_(t),ts);
    }

    // Hủy việc xóa luôn đề nghị đang chờ (đề nghị hủy vừa được duyệt, hoặc đề
    // nghị sửa không còn ý nghĩa với một việc đã hủy).
    var cancelRequest = null, canceledSnapshot = null;
    if (to === 'HUY') {
      canceledSnapshot = Object.assign({}, item);
      try {
        var waiting = item.pending_json ? JSON.parse(item.pending_json) : null;
        if (waiting && waiting.kind === 'CANCEL') cancelRequest = waiting;
      } catch (ignorePending) {}
      fields.pending_json = '';
    }

    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: fields.status, by: u.user_id, at: ts,
      reason: reason, before_json: JSON.stringify({ status: item.status }), after_json: JSON.stringify(fields)
    });
    // Giao / đổi người: việc chính và việc kèm còn rảnh đi theo cùng người.
    var linkFollow = { moved: [], kept: [] };
    if (fields.status === 'DA_PHAN_CONG' && fields.assigned_user_id && assignedStaff) {
      linkFollow = followLinkedAssignment_(t, Object.assign({}, item, fields), assignedStaff, u, ts);
    }
    if (to === 'HUY') {
      recordCanceled_(t, canceledSnapshot, req, u, reason, ts, cancelRequest);
      if (cancelRequest && cancelRequest.by !== u.user_id) inboxNotify_(t, cancelRequest.by, itemId, 'DUYET_HUY');
    }

    // Xếp tin vào outbox trong cùng lần giữ khóa với việc, để không có trường hợp
    // trạng thái đã đổi mà thông báo thì mất.
    var queued = 0;
    // Giao lần đầu và chuyển việc sang người khác là hai tin khác nhau; dùng chung
    // một sự kiện thì quy tắc "chuyển việc" không bao giờ chạy.
    var event = NOTIFY_ON[to];
    if (to === 'DA_PHAN_CONG' && item.assigned_user_id && item.assigned_user_id !== opts.assignee_id) {
      event = 'DOI_NGUOI';
    }
    if (linkedAuto) event = NOTIFY_ON.DA_PHAN_CONG;
    if (event && notificationMode !== 'NONE') {
      var merged = {};
      Object.keys(item).forEach(function (k) { merged[k] = item[k]; });
      Object.keys(fields).forEach(function (k) { merged[k] = fields[k]; });
      queued = Notifications.queue(t, merged, event, u.user_id, null, notificationMode);
    }

    // Trả mốc hạn/hoàn thành do máy chủ tính để màn hình không giữ hạn cũ.
    return { ok: true, status: fields.status, occurrence_date: fields.occurrence_date || item.occurrence_date, version: fields.version, updated_at: ts, queued: queued, period_id: item.period_id,
      assigned_user_id: fields.assigned_user_id !== undefined ? fields.assigned_user_id : (item.assigned_user_id || ''),
      assigned_by: fields.assigned_by || item.assigned_by || '', assigned_at: fields.assigned_at || item.assigned_at || '',
      accepted_at: fields.accepted_at || item.accepted_at || '', linked_updates: linkFollow.moved, linked_kept: linkFollow.kept,
      due_at: fields.due_at !== undefined ? fields.due_at : (item.due_at || ''),
      completed_at: fields.completed_at !== undefined ? fields.completed_at : (item.completed_at || ''),
      sla_paused_at: fields.sla_paused_at !== undefined ? fields.sla_paused_at : (item.sla_paused_at || ''),
      dossier_received_at: fields.dossier_received_at || item.dossier_received_at || '',
      dossier_received_by: fields.dossier_received_by || item.dossier_received_by || '',
      timing_source: fields.timing_source || item.timing_source || '',
      submitted_at: fields.submitted_at || item.submitted_at || '',
      is_priority: fields.is_priority !== undefined ? fields.is_priority : truthy_(item.is_priority),
      first_assigned_at: fields.first_assigned_at || item.first_assigned_at || '',
      result_flags_json: fields.result_flags_json !== undefined ? fields.result_flags_json : (item.result_flags_json || ''),
      result_credit_json: fields.result_credit_json !== undefined ? fields.result_credit_json : (item.result_credit_json || ''),
      processing_started_at: fields.processing_started_at || item.processing_started_at || '', execution_state:fields.execution_state,
      execution_changed_at:ts, focus_updates:focusUpdates,
      processing_sessions_json: fields.processing_sessions_json, sla_pause_log_json: fields.sla_pause_log_json };
  }, NOTIFY_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/* ---------------------------- Hủy việc ---------------------------- */

/**
 * Việc không bao giờ bị xóa dòng: hủy là một trạng thái, còn sổ CanceledItems
 * giữ riêng ảnh chụp của việc lúc hủy kèm lý do, người hủy và người đề nghị.
 */
function recordCanceled_(t, item, req, actor, reason, ts, request) {
  var r = req ? req.object : {};
  try {
    t.append('CanceledItems', {
      cancel_id: id_('CXL'), item_id: item.item_id, request_id: item.request_id, period_id: item.period_id,
      unit_id: r.unit_id || '', source_stt: item.source_stt || '', customer_name: r.customer_name || '', cif: r.cif || '',
      work_type_code: item.work_type_code || '', product_name: item.product_name || '', status_before: item.status,
      assigned_user_id: item.assigned_user_id || '', reason: reason || '', canceled_by: actor.user_id, canceled_at: ts,
      requested_by: request ? request.by : '', requested_at: request ? request.at : '', requested_reason: request ? request.reason : ''
    });
  } catch (err) {
    // Kho chưa kịp nâng cấp bảng sổ hủy: việc vẫn được hủy, không chặn nghiệp vụ.
    log_('Chưa ghi được sổ việc hủy ' + item.item_id + ': ' + err);
  }
}

/** Tương thích với giao diện cũ: thao tác đề nghị hủy nay thực hiện hủy trực tiếp. */
function requestCancel(itemId, reason, expectedVersion) {
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Cần ghi lý do hủy.');
  return transitionItem(itemId, 'HUY', { reason: reason, expected_version: expectedVersion });
}

/* ---------------------------- Việc chính & việc kèm đi cùng một cán bộ ---------------------------- */

/** Trạng thái việc còn "rảnh" để đi theo người của việc cùng nhóm: chưa giao, hoặc đã giao nhưng chưa tiếp nhận. */
var LINK_FOLLOW_STATUS_ = ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'DA_PHAN_CONG'];

/** Các việc cùng nhóm với `item` (việc chính và mọi việc kèm của nó), trừ chính nó; bỏ dòng đã chuyển kỳ. */
function linkedItemsOf_(t, item) {
  var rootId = item.parent_item_id || item.item_id;
  return t.select('WorkItems', 'item_id', function (get) {
    return get('item_id') !== item.item_id && (get('item_id') === rootId || get('parent_item_id') === rootId);
  }).map(function (found) { return found.object; }).filter(function (i) { return !i.carried_to_item_id; });
}

function linkFollowFree_(i) {
  return LINK_FOLLOW_STATUS_.indexOf(i.status) !== -1 && !i.dossier_received_at && !i.processing_started_at;
}

/** Cán bộ (còn nhận việc được) đang giữ một việc mở cùng nhóm; ưu tiên việc chính. */
function linkedHolder_(t, item, ts) {
  var held = linkedItemsOf_(t, item).filter(function (i) {
    return i.assigned_user_id && OPEN_STATUS.indexOf(i.status) !== -1;
  }).sort(function (a, b) { return Number(!!a.parent_item_id) - Number(!!b.parent_item_id); });
  for (var k = 0; k < held.length; k++) {
    var user = t.find('Users', 'user_id', held[k].assigned_user_id);
    if (userAvailableForAssignment_(user && user.object, ts)) return { user: user.object, item: held[k] };
  }
  return null;
}

/**
 * Giao một việc cho ai thì các việc cùng nhóm còn rảnh (chưa giao, hoặc đã giao nhưng người cũ chưa tiếp nhận)
 * giao luôn cho người đó. Việc cùng nhóm mà cán bộ khác đã tiếp nhận / đang làm thì giữ nguyên, vì đổi người
 * giữa chừng phải qua bước ghi nhận phần việc đã làm; trả về để giao diện nhắc.
 */
function followLinkedAssignment_(t, item, assignee, actor, ts, skipIds) {
  var moved = [], kept = [];
  linkedItemsOf_(t, item).forEach(function (other) {
    if ((skipIds && skipIds[other.item_id]) || other.assigned_user_id === assignee.user_id) return;
    if (!linkFollowFree_(other)) {
      if (other.assigned_user_id && OPEN_STATUS.indexOf(other.status) !== -1) kept.push({ item_id: other.item_id, source_stt: other.source_stt || '', assigned_user_id: other.assigned_user_id });
      return;
    }
    var found = t.find('WorkItems', 'item_id', other.item_id);
    if (!found) return;
    var fields = {
      status: 'DA_PHAN_CONG', assigned_user_id: assignee.user_id, assigned_by: actor.user_id, assigned_at: ts,
      first_assigned_at: other.first_assigned_at || other.assigned_at || ts, due_at: '', execution_state: '', execution_changed_at: ts,
      processing_sessions_json: JSON.stringify(LSTiming.nextSessions(other, 'DA_PHAN_CONG', ts, assignee.user_id)),
      version: Number(other.version) + 1, updated_at: ts
    };
    if (!other.accepted_at) fields.accepted_at = ts;
    var pauses = nextPauseLog_(other, 'DA_PHAN_CONG', ts);
    if (pauses !== null) fields.pause_log_json = pauses;
    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: other.item_id, type: 'DA_PHAN_CONG', by: actor.user_id, at: ts,
      reason: 'Giao ' + assignee.full_name + ' cùng ' + (other.parent_item_id ? 'việc chính ' : 'việc kèm ') + (item.source_stt || item.item_id),
      before_json: JSON.stringify({ status: other.status, assigned_user_id: other.assigned_user_id || '' }),
      after_json: JSON.stringify(fields)
    });
    var merged = Object.assign({}, other, fields);
    Notifications.queue(t, merged, other.assigned_user_id ? 'DOI_NGUOI' : NOTIFY_ON.DA_PHAN_CONG, actor.user_id, null, 'DEFAULT');
    moved.push({ item_id: other.item_id, status: fields.status, assigned_user_id: fields.assigned_user_id, assigned_by: fields.assigned_by,
      assigned_at: ts, first_assigned_at: fields.first_assigned_at, accepted_at: fields.accepted_at || other.accepted_at || '',
      due_at: '', execution_state: '', execution_changed_at: ts, processing_sessions_json: fields.processing_sessions_json,
      version: fields.version, updated_at: ts });
  });
  return { moved: moved, kept: kept };
}

/**
 * Phân công một lô hồ sơ đang chờ. Toàn bộ lô được kiểm tra trước khi ghi để
 * không có tình trạng một nửa hồ sơ đã giao, nửa còn lại bị lỗi vì cán bộ nghỉ
 * hoặc có người khác vừa sửa một dòng.
 * rows = [{ item_id, assignee_id, expected_version }]
 */
function assignWorkItemsBatch(rows) {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được phân công theo lô.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Chọn ít nhất một hồ sơ để phân công.');
  if (rows.length > 100) throw new Error('Mỗi lần chỉ phân công tối đa 100 hồ sơ.');

  var result = DataRepository.tx(function (t) {
    var ts = stamp_(), seen = {}, staged = [], periodIds = {};
    // Việc chính và việc kèm trong cùng lô đi về một người: lấy người của việc chính, không có thì của dòng đầu nhóm.
    var groupAssignee = {};
    rows.forEach(function (row) {
      var it = t.find('WorkItems', 'item_id', String(row && row.item_id || '').trim());
      if (!it || !row.assignee_id) return;
      var root = it.object.parent_item_id || it.object.item_id;
      if (!it.object.parent_item_id || !groupAssignee[root]) groupAssignee[root] = String(row.assignee_id).trim();
    });
    rows = rows.map(function (row) {
      var it = t.find('WorkItems', 'item_id', String(row && row.item_id || '').trim());
      var root = it ? (it.object.parent_item_id || it.object.item_id) : '';
      return root && groupAssignee[root] ? Object.assign({}, row, { assignee_id: groupAssignee[root] }) : row;
    });

    // Validate all entries first: the transaction only starts writing after every
    // selected row, assignee, and optimistic version has been accepted.
    rows.forEach(function (row) {
      var itemId = String(row && row.item_id || '').trim();
      var assigneeId = String(row && row.assignee_id || '').trim();
      if (!itemId || !assigneeId) throw new Error('Mỗi dòng được chọn phải có hồ sơ và cán bộ nhận việc.');
      if (seen[itemId]) throw new Error('Một hồ sơ chỉ được xuất hiện một lần trong lô.');
      seen[itemId] = true;

      var found = t.find('WorkItems', 'item_id', itemId);
      if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
      var item = found.object;
      assertCurrentWorkItem_(item);
      if (['CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CHO_PHAN_CONG'].indexOf(item.status) === -1) {
        throw new Error('Hồ sơ ' + itemId + ' không còn ở trạng thái có thể phân công. Tải lại danh sách trước khi giao.');
      }
      if (row.expected_version === undefined || Number(item.version) !== Number(row.expected_version)) {
        throw new Error('Hồ sơ ' + itemId + ' đã được người khác cập nhật. Tải lại danh sách trước khi giao.');
      }

      var staffRow = t.find('Users', 'user_id', assigneeId);
      if (!userAvailableForAssignment_(staffRow && staffRow.object, ts)) {
        throw new Error('Mỗi cán bộ được giao phải là cán bộ LS đang hoạt động.');
      }
      var wt = t.find('WorkTypes', 'type_code', item.work_type_code);
      var fields = {
        status: 'DA_PHAN_CONG', assigned_user_id: assigneeId, assigned_by: u.user_id,
        assigned_at: ts, first_assigned_at: item.first_assigned_at || item.assigned_at || ts,
        is_priority: row.is_priority === undefined ? truthy_(item.is_priority) : truthy_(row.is_priority),
        due_at: item.dossier_received_at
          ? LSTiming.deadline(item,wt ? Number(wt.object.sla_hours) || 8 : 8,timingCalendar_(t),ts)
          : '',
        processing_sessions_json: JSON.stringify(LSTiming.nextSessions(item,'DA_PHAN_CONG',ts,assigneeId)),
        version: Number(item.version) + 1, updated_at: ts
      };
      if (!item.accepted_at) fields.accepted_at = ts;
      var pauses = nextPauseLog_(item, 'DA_PHAN_CONG', ts);
      if (pauses !== null) fields.pause_log_json = pauses;
      staged.push({ found: found, item: item, staff: staffRow.object, fields: fields });
      periodIds[item.period_id] = true;
    });

    var queued = 0;
    staged.forEach(function (entry) {
      t.write(entry.found, entry.fields);
      t.append('Events', {
        event_id: id_('EVT'), item_id: entry.item.item_id, type: 'DA_PHAN_CONG', by: u.user_id, at: ts,
        reason: 'Giao theo lô cho ' + entry.staff.full_name,
        before_json: JSON.stringify({ status: entry.item.status, assigned_user_id: entry.item.assigned_user_id || '' }),
        after_json: JSON.stringify(entry.fields)
      });
      var merged = {};
      Object.keys(entry.item).forEach(function (key) { merged[key] = entry.item[key]; });
      Object.keys(entry.fields).forEach(function (key) { merged[key] = entry.fields[key]; });
      queued += Notifications.queue(t, merged, NOTIFY_ON.DA_PHAN_CONG, u.user_id, null, 'DEFAULT');
    });
    // Việc cùng nhóm nằm ngoài lô (đang chờ, hoặc đã giao mà chưa tiếp nhận) đi theo người vừa nhận.
    var inBatch = {}, linkedUpdates = [], linkedKept = [];
    staged.forEach(function (entry) { inBatch[entry.item.item_id] = true; });
    staged.forEach(function (entry) {
      var follow = followLinkedAssignment_(t, Object.assign({}, entry.item, entry.fields), entry.staff, u, ts, inBatch);
      follow.moved.forEach(function (m) { inBatch[m.item_id] = true; linkedUpdates.push(m); });
      linkedKept = linkedKept.concat(follow.kept);
    });

    return {
      ok: true, count: staged.length, queued: queued, period_ids: Object.keys(periodIds), linked_updates: linkedUpdates, linked_kept: linkedKept,
      items: staged.map(function (entry) {
        return { item_id: entry.item.item_id, occurrence_date: entry.item.occurrence_date, status: entry.fields.status, assigned_user_id: entry.fields.assigned_user_id,
          assigned_by: entry.fields.assigned_by, assigned_at: entry.fields.assigned_at, due_at: entry.fields.due_at,
          accepted_at: entry.fields.accepted_at || entry.item.accepted_at || '', is_priority: entry.fields.is_priority,
          version: entry.fields.version };
      })
    };
  }, NOTIFY_WARM_);

  (result.period_ids || []).forEach(function (periodId) { markPlanDirty_(periodId); });
  return result;
}

/** Cán bộ LS đang được giao xác nhận nhận đủ hồ sơ; mốc này mới bắt đầu SLA. */
function confirmDossierReceipt(itemId, expectedVersion) {
  var u = requireActor_();
  if (u.role !== 'CAN_BO_LS') throw new Error('Chỉ cán bộ LS được giao mới xác nhận nhận đủ hồ sơ.');
  var result = DataRepository.tx(function (t) {
    if (activeGlobalPause_(globalPauseEvents_(t,u.user_id,1,10000).rows,u.user_id)) {
      throw new Error('Hãy kết thúc tác nghiệp đang tạm dừng trước khi tiếp nhận hồ sơ.');
    }
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy hồ sơ.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (item.assigned_user_id !== u.user_id) throw new Error('Chỉ cán bộ LS đang được giao mới xác nhận hồ sơ này.');
    if (item.status === 'HUY' || LSTiming.awaitingReceipt(item.status)) throw new Error('Hồ sơ chưa tiếp nhận hoặc đã hủy. Bấm "Tiếp nhận hồ sơ" để ghi mốc nhận.');
    if (expectedVersion === undefined || Number(item.version) !== Number(expectedVersion)) {
      throw new Error('Hồ sơ đã được cập nhật. Tải lại trước khi xác nhận nhận đủ.');
    }
    if (item.dossier_received_at) throw new Error('Hồ sơ đã có giờ nhận đủ; dùng chức năng sửa thời gian nếu cần điều chỉnh.');
    var ts = stamp_();
    if ((item.processing_started_at && new Date(ts) > new Date(item.processing_started_at)) ||
        (item.completed_at && new Date(ts) > new Date(item.completed_at))) {
      throw new Error('Hồ sơ đã bắt đầu xử lý trước thời điểm xác nhận. Hãy sửa và nhập giờ nhận thực tế.');
    }
    var wt = t.find('WorkTypes', 'type_code', item.work_type_code);
    var fields = { dossier_received_at: ts, dossier_received_by: u.user_id, timing_source: 'CONFIRMED',
      due_at: LSTiming.deadline(Object.assign({}, item, { dossier_received_at: ts }),
        wt ? Number(wt.object.sla_hours) || 8 : 8, timingCalendar_(t), ts),
      version: Number(item.version) + 1, updated_at: ts };
    var focusUpdates=[];
    if (CLOCK_RUNNING_.indexOf(item.status) !== -1) {
      focusUpdates=switchWorkFocus_(t,item,u,ts);
      fields.execution_state='ACTIVE'; fields.execution_changed_at=ts;
      fields.processing_started_at = item.processing_started_at || ts;
      fields.processing_sessions_json = JSON.stringify(LSTiming.nextSessions(item,item.status,ts,item.assigned_user_id,'ACTIVE'));
      var pauses=nextPauseLog_(item,item.status,ts);
      if(pauses!==null)fields.pause_log_json=pauses;
    }
    t.write(found, fields);
    t.append('Events', { event_id: id_('EVT'), item_id: item.item_id, type: 'XAC_NHAN_NHAN_DU_HO_SO', by: u.user_id, at: ts,
      reason: 'Cán bộ LS xác nhận đã nhận đủ hồ sơ.',
      before_json: JSON.stringify({ dossier_received_at: item.dossier_received_at || '', due_at: item.due_at || '' }),
      after_json: JSON.stringify(fields) });
    return { ok: true, item_id: item.item_id, dossier_received_at: ts, dossier_received_by: u.user_id,
      timing_source: 'CONFIRMED', due_at: fields.due_at, processing_started_at: fields.processing_started_at || item.processing_started_at || '',
      processing_sessions_json: fields.processing_sessions_json || item.processing_sessions_json || '',
      execution_state:fields.execution_state || item.execution_state || '',execution_changed_at:fields.execution_changed_at || '',
      pause_log_json:fields.pause_log_json || item.pause_log_json || '',focus_updates:focusUpdates,version: fields.version, period_id: item.period_id };
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id, true);
  return result;
}

/* ---------------------------- Đồng hồ xử lý ---------------------------- */

/**
 * Đồng hồ chỉ chạy khi cán bộ LS đang thật sự làm hồ sơ. Tạm dừng, chờ khách lên
 * ký, chờ người mới nhận việc, đã hủy/hoàn thành đều mở một khoảng dừng; quay lại
 * trạng thái đang làm thì đóng khoảng đó. Lưu mốc thô, giờ làm tính ở giao diện
 * theo lịch làm việc — đổi lịch thì số liệu cũ vẫn tính đúng.
 */
var CLOCK_RUNNING_ = ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];

function pauseLog_(item) {
  var log = [];
  try { log = JSON.parse(item.pause_log_json || '[]'); } catch (ignore) { log = []; }
  return Array.isArray(log) ? log.filter(function (x) { return Array.isArray(x) && x[0]; }) : [];
}

/** Trả chuỗi JSON mới khi nhật ký dừng thay đổi, null nếu giữ nguyên. */
function nextPauseLog_(item, to, ts) {
  if (!item.processing_started_at) return null;
  var log = pauseLog_(item);
  var open = log.length && !log[log.length - 1][1];
  var running = CLOCK_RUNNING_.indexOf(to) !== -1;
  if (running && open) log[log.length - 1][1] = ts;
  else if (!running && !open) log.push([ts, '']);
  else return null;
  return JSON.stringify(log);
}

/** Lưu trạng thái tick các nhóm việc, không đổi trạng thái hồ sơ. */
function saveChecklist(itemId, checklist, expectedVersion) {
  var u = requireActor_();
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (expectedVersion !== undefined && Number(item.version) !== Number(expectedVersion)) throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.');
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới ghi nhận nhóm việc.');
    if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được ghi nhận nhóm việc.');
    var wt = t.find('WorkTypes', 'type_code', item.work_type_code), defs = [];
    try { defs = wt ? JSON.parse(wt.object.checklist_json || '[]') : []; } catch (ignore) { defs = []; }
    var values = Array.isArray(checklist) ? checklist : [];
    var normalized = defs.map(function (_, index) { return values[index] === true || String(values[index]).toLowerCase() === 'true'; });
    var ts = stamp_();
    var fields = { checklist_json: JSON.stringify(normalized), version: Number(item.version) + 1, updated_at: ts };
    t.write(found, fields);
    t.append('Events', { event_id: id_('EVT'), item_id: itemId, type: 'CAP_NHAT_CHECKLIST', by: u.user_id, at: ts,
      reason: normalized.filter(Boolean).length + '/' + defs.length + ' nhóm việc đã hoàn thành.', before_json: item.checklist_json || '[]', after_json: fields.checklist_json });
    return { ok: true, version: fields.version, checklist: normalized, period_id: item.period_id };
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/**
 * Tick từng phần việc của việc TSĐB (soạn xong HĐ thế chấp, nhập kho, xuất kho) khi làm xong phần đó, không đổi trạng thái.
 * Ghi vào result_credit_json cùng chỗ với phần bàn giao nên bảng ngày tính theo người và ngày tick.
 * Cán bộ đang giữ hồ sơ tick cho chính mình; Kiểm soát / Quản lý LS tick hộ thì tính cho cán bộ đang giữ.
 */
function recordWorkStep(itemId, key, done, quantity, expectedVersion) {
  var u = requireActor_();
  key = String(key || '').trim();
  var on = done === true || String(done).toLowerCase() === 'true';
  var quantityProvided = quantity !== undefined && quantity !== null && quantity !== '';
  if (quantityProvided && !STEP_QUANTITY_KEYS_[key]) throw new Error('Phần việc này không ghi nhận số lượng.');
  var requestedQuantity = STEP_QUANTITY_KEYS_[key] ? normalizeStepQuantity_(key, quantity) : 1;
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (expectedVersion !== undefined && expectedVersion !== null && Number(item.version) !== Number(expectedVersion)) {
      throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.');
    }
    if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được ghi nhận phần việc.');
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới ghi nhận phần việc.');
    var completed = item.status === 'HOAN_THANH_LS';
    if (!item.assigned_user_id ||
        (!completed && (!item.dossier_received_at || ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET', 'DANG_HEN_KH', 'TAM_DUNG'].indexOf(item.status) === -1))) {
      throw new Error('Chỉ ghi nhận phần việc khi hồ sơ đã tiếp nhận và đang xử lý.');
    }
    var wt = t.find('WorkTypes', 'type_code', item.work_type_code);
    var keys = collateralStepKeys_(wt && wt.object, item);
    // Hồ sơ vay: cán bộ có thể (không bắt buộc) báo đã soạn xong HĐ tín dụng trước khi hẹn ký để hết tồn soạn sớm.
    // Không bấm thì HĐ tín dụng vẫn tự ghi nhận lúc đặt lịch hẹn ký như cũ.
    var draftKeys = draftContractPartKeys_(wt && wt.object, item);
    var creditWork = draftKeys.indexOf('HD_TIN_DUNG') !== -1;
    var creditDraft = key === 'HD_TIN_DUNG' && creditWork;
    var stepLabel = COLLATERAL_STEP_LABELS_[key] || 'Đã soạn xong ' + HANDOVER_PART_LABELS_[key];

    var credit = readCredit_(projectAppointmentDraftCredits_([item], wt ? [wt.object] : [], t)[0]);
    var wasDone = stepDone_(credit, key);
    var savedFlags = {};
    try { savedFlags = JSON.parse(item.result_flags_json || '{}') || {}; } catch (ignoreResultFlags) { savedFlags = {}; }
    var completionResult = completedContractResult_(item, wt && wt.object, key);
    var appliesToCreditResult = completed && key === 'HD_THE_CHAP' && creditWork && item.collateral_mode !== 'MOI' &&
      (wasDone || savedFlags.HD_THE_CHAP === true || (savedFlags.HD_THE_CHAP === undefined && draftKeys.indexOf('HD_THE_CHAP') !== -1));
    if (keys.indexOf(key) === -1 && !creditDraft && !appliesToCreditResult && !completionResult) throw new Error('Phần việc này không áp dụng cho việc đang chọn.');
    var completedMortgageResult = key === 'HD_THE_CHAP' && creditWork && item.collateral_mode !== 'MOI' &&
      (wasDone || savedFlags.HD_THE_CHAP === true || (savedFlags.HD_THE_CHAP === undefined && draftContractPartKeys_(wt && wt.object, item).indexOf('HD_THE_CHAP') !== -1));
    var completedStepResult = keys.indexOf(key) !== -1 && wasDone;
    if (completed && (!on || !quantityProvided || !STEP_QUANTITY_KEYS_[key] || !(completionResult || wasDone && (creditDraft && key === 'HD_TIN_DUNG' || completedMortgageResult || completedStepResult)))) {
      throw new Error('Hồ sơ đã hoàn thành; chỉ được điều chỉnh số lượng kết quả đã ghi nhận.');
    }
    if (key === 'HD_THE_CHAP' && completed && savedFlags.HD_THE_CHAP === false && (!wasDone || credit[key].user_id === item.assigned_user_id)) {
      throw new Error('HĐ thế chấp đang bỏ ghi nhận; hãy bật lại kết quả trước khi sửa số lượng.');
    }
    if (!wasDone && completionResult) { credit[key] = completionResult; wasDone = true; }
    if (creditDraft && wasDone && !on && ['APPOINTMENT', 'APPOINTMENT_HISTORY'].indexOf(credit[key].source) !== -1) {
      throw new Error('HĐ tín dụng đã ghi nhận lúc hẹn ký; không bỏ được ở đây.');
    }
    var oldQuantity = Math.max(1, Math.floor(Number(credit[key] && credit[key].quantity) || 1));
    if (wasDone === on && (!on || !STEP_QUANTITY_KEYS_[key] || !quantityProvided || oldQuantity === requestedQuantity)) {
      return { ok: true, idempotent: true, version: Number(item.version), result_credit_json: item.result_credit_json || '', period_id: item.period_id };
    }
    var ts = stamp_();
    if (on) {
      if (wasDone && u.role === 'CAN_BO_LS' && credit[key].user_id !== u.user_id) throw new Error('Phần này do cán bộ khác làm; nhờ Kiểm soát hoặc Quản lý LS điều chỉnh.');
      credit[key] = wasDone ? Object.assign({}, credit[key]) : { user_id: item.assigned_user_id, at: ts, by: u.user_id };
      if (creditDraft && !wasDone) credit[key].source = 'MANUAL';
      if (STEP_QUANTITY_KEYS_[key]) credit[key].quantity = requestedQuantity;
      var order = stepOrderError_(credit, keys);
      if (order) throw new Error(order);
    } else {
      if (u.role === 'CAN_BO_LS' && credit[key].user_id !== u.user_id) throw new Error('Phần này do cán bộ khác làm; nhờ Kiểm soát hoặc Quản lý LS gỡ.');
      if (key === 'HD_THE_CHAP' && WAREHOUSE_STEP_KEYS_.some(function (k) { return stepDone_(credit, k); })) {
        throw new Error('Bỏ tick nhập/xuất kho trước khi bỏ tick soạn xong HĐ thế chấp.');
      }
      delete credit[key];
    }
    var fields = { result_credit_json: JSON.stringify(credit), version: Number(item.version) + 1, updated_at: ts };
    t.write(found, fields);
    var eventReason = on && quantityProvided && STEP_QUANTITY_KEYS_[key] && (wasDone || completed)
      ? 'Điều chỉnh số lượng ' + stepLabel + ': ' + oldQuantity + ' → ' + requestedQuantity
      : (on ? 'Đã tick: ' : 'Bỏ tick: ') + stepLabel;
    t.append('Events', { event_id: id_('EVT'), item_id: itemId, type: 'GHI_NHAN_PHAN_VIEC', by: u.user_id, at: ts,
      reason: eventReason,
      before_json: item.result_credit_json || '', after_json: fields.result_credit_json });
    return { ok: true, version: fields.version, updated_at: ts, result_credit_json: fields.result_credit_json, period_id: item.period_id };
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/**
 * Sửa tick kết quả (HĐ thế chấp, Rlos) sau khi hồ sơ đã hoàn thành, không đổi trạng
 * thái hay mốc giờ. Cán bộ xử lý, kiểm soát hoặc quản lý LS được sửa; mọi lần sửa có sự kiện.
 */
function saveResultFlags(itemId, flags, expectedVersion) {
  var u = requireActor_();
  if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được sửa ghi nhận kết quả.');
  var normalized = normalizeResultFlags_(flags);
  if (!normalized) throw new Error('Thiếu ghi nhận kết quả.');
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (expectedVersion !== undefined && Number(item.version) !== Number(expectedVersion)) throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.');
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới sửa ghi nhận kết quả.');
    if (item.status !== 'HOAN_THANH_LS') throw new Error('Chỉ sửa ghi nhận kết quả sau khi hồ sơ đã hoàn thành.');
    var ts = stamp_();
    var fields = { result_flags_json: JSON.stringify(mergeResultFlags_(item, normalized)), version: Number(item.version) + 1, updated_at: ts };
    t.write(found, fields);
    t.append('Events', { event_id: id_('EVT'), item_id: itemId, type: 'GHI_NHAN_GIAO_DICH', by: u.user_id, at: ts,
      reason: [normalized.HD_THE_CHAP !== undefined ? 'HĐ thế chấp: ' + (normalized.HD_THE_CHAP ? 'có' : 'không') : '',
        normalized.RLOS !== undefined ? 'Rlos: ' + (normalized.RLOS ? 'có' : 'không') : ''].filter(Boolean).join(' · '),
      before_json: item.result_flags_json || '', after_json: fields.result_flags_json });
    return { ok: true, version: fields.version, result_flags_json: fields.result_flags_json, period_id: item.period_id };
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/* ---------------------------- Việc kèm ---------------------------- */

var LINKABLE_STATUS_ = ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'];

/**
 * Cán bộ đang làm một việc (vd. vay món) phát hiện phải làm thêm hồ sơ TSĐB mới:
 * tạo một dòng việc thật thứ hai cùng hồ sơ khách, giao luôn cho người đang làm và
 * nhận vào hàng chờ, chỉ tính giờ làm khi LS bấm Làm ngay. Là dòng WorkItems riêng nên mọi báo cáo, file kế hoạch và
 * dashboard tự đếm thành 2 việc — không cần cờ phụ nào để cộng thêm.
 */
function addLinkedItem(parentId, workTypeCode) {
  var u = requireActor_();
  if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được thêm việc kèm.');
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', parentId);
    if (!found) throw new Error('Không tìm thấy việc ' + parentId + '.');
    var parent = found.object;
    assertCurrentWorkItem_(parent);
    if (u.role === 'CAN_BO_LS' && parent.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới thêm việc kèm.');
    if (LINKABLE_STATUS_.indexOf(parent.status) === -1 || !parent.assigned_user_id) throw new Error('Chỉ thêm việc kèm khi việc chính đang được cán bộ LS xử lý.');
    var wt = t.find('WorkTypes', 'type_code', workTypeCode);
    if (!wt || !truthy_(wt.object.is_active)) throw new Error('Loại việc kèm không hợp lệ.');
    if (workTypeCode === parent.work_type_code) throw new Error('Việc kèm phải khác sản phẩm của việc chính.');
    var dup = t.select('WorkItems', 'item_id', function (get) {
      // parent_item_id ổn định sau khi tạo; loại việc/trạng thái được kiểm tra lại từ từng dòng mới nhất.
      return get('parent_item_id') === parentId;
    }).map(function (found) { return found.object; }).filter(function (item) {
      return item.work_type_code === workTypeCode && item.status !== 'HUY';
    })[0];
    if (dup) throw new Error('Đã có việc kèm ' + (wt.object.display_name || workTypeCode) + ' cho việc này.');

    var req = t.find('Requests', 'request_id', parent.request_id);
    var unitId = req ? req.object.unit_id : '';
    var unit = unitId ? t.find('Units', 'unit_id', unitId) : null;
    var defs = [];
    try { defs = JSON.parse(wt.object.checklist_json || '[]'); } catch (ignore) { defs = []; }
    var ts = stamp_();
    var itemId = id_('ITEM');
    var receiveNow = u.role === 'CAN_BO_LS' && parent.assigned_user_id === u.user_id && !!parent.dossier_received_at &&
      ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'].indexOf(parent.status) !== -1;
    t.append('WorkItems', {
      item_id: itemId, period_id: parent.period_id, origin_item_id: '', carryover_from_item_id: '',
      parent_item_id: parentId, request_id: parent.request_id,
      work_type_code: workTypeCode, product_name: wt.object.display_name || workTypeCode, collateral_mode: workTypeCode === COLLATERAL_NEW_WORK_TYPE_ ? 'MOI' : 'NONE',
      occurrence_date: parent.occurrence_date || '',
      source_stt: nextSourceStt_(t, unitId, parent.period_id),
      source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : (parent.source_tab || unitId),
      status: receiveNow ? 'DANG_THUC_HIEN' : 'DA_PHAN_CONG', assigned_user_id: parent.assigned_user_id, assigned_by: u.user_id,
      submitted_at: ts, accepted_at: parent.accepted_at || '', assigned_at: ts,
      dossier_received_at: receiveNow ? ts : '', dossier_received_by: receiveNow ? u.user_id : '',
      timing_source: receiveNow ? 'CONFIRMED' : 'NEW', first_assigned_at: ts,
      processing_sessions_json: '[]', sla_pause_log_json: '[]', execution_state:receiveNow?'QUEUED':'',execution_changed_at:ts,
      due_at: receiveNow ? dueAt_(t, ts, Number(wt.object.sla_hours) || 8) : '',
      completed_at: '', processing_started_at: '', appointment_json: '',
      checklist_json: JSON.stringify(defs.map(function () { return false; })),
      pending_json: '', note: '', version: 1, created_at: ts, updated_at: ts
    });
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'TAO_VIEC', by: u.user_id, at: ts,
      reason: 'Việc kèm của ' + (parent.source_stt || parentId) + (receiveNow ? ' — đã nhận, chờ bắt đầu làm.' : ' — chờ LS tiếp nhận.'),
      before_json: '', after_json: JSON.stringify({ parent_item_id: parentId, work_type_code: workTypeCode })
    });
    return { ok: true, item_id: itemId, occurrence_date: parent.occurrence_date, period_id: parent.period_id };
  }, NOTIFY_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

/* ---------------------------- Đề nghị sửa ---------------------------- */

/** Tin trong app gửi thẳng một người (không qua quy tắc/outbox): chỉ nội bộ, không có dữ liệu khách. */
function inboxNotify_(t, userId, itemId, event, detail, subjectUserId) {
  if (!userId) return;
  t.append('Inbox', { id: 'NTF_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase(),
    user_id: userId, item_id: itemId || '', event: event, at: stamp_(), is_read: false,
    detail: detail || '', subject_user_id: subjectUserId || '' });
}

/** Chỉ nhận các trường được phép sửa, đúng định dạng; loại việc phải còn hoạt động. */
function validateRevisionFields_(t, fields) {
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) throw new Error('Không có thay đổi nào.');
  var allowed = ['customer.name', 'customer.cif', 'customer.phone', 'customer.email', 'customer.priority_flags',
    'work_type_code', 'product_name', 'occurrence_date'];
  Object.keys(fields).forEach(function (k) {
    if (allowed.indexOf(k) === -1) throw new Error('Trường "' + k + '" không được sửa qua đề nghị.');
    if (k === 'customer.phone') fields[k] = validatePhone_(fields[k]);
    if (k === 'customer.email') fields[k] = validateEmail_(fields[k]);
    if (k === 'customer.cif') fields[k] = String(fields[k] === null || fields[k] === undefined ? '' : fields[k]);
  });
  if ('customer.name' in fields && !String(fields['customer.name'] || '').trim()) throw new Error('Tên khách hàng không được để trống.');
  if ('product_name' in fields && !String(fields.product_name || '').trim()) throw new Error('Tên sản phẩm không được để trống.');
  if ('occurrence_date' in fields && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.occurrence_date || ''))) {
    throw new Error('Ngày phát sinh không hợp lệ.');
  }
  if ('work_type_code' in fields) {
    var wt = t.find('WorkTypes', 'type_code', fields.work_type_code);
    if (!wt || !truthy_(wt.object.is_active)) throw new Error('Loại việc mới không hợp lệ hoặc đã ngừng dùng.');
  }
}

var REVISION_LABELS_ = {
  'customer.name': 'Tên khách', 'customer.cif': 'CIF', 'customer.phone': 'Điện thoại', 'customer.email': 'Email',
  'customer.priority_flags': 'Mức ưu tiên', 'work_type_code': 'Loại việc', 'product_name': 'Sản phẩm', 'occurrence_date': 'Ngày phát sinh'
};

/** Giá trị hiện tại của các trường sắp đổi, để nhật ký ghi được cả giá trị cũ lẫn mới. */
function revisionBefore_(item, req, fields) {
  var before = {}, customer = req ? req.object || req : null;
  Object.keys(fields).forEach(function (k) {
    if (k.indexOf('customer.') === 0) {
      var col = { name: 'customer_name', cif: 'cif', phone: 'phone', email: 'email', priority_flags: 'priority_flags_json' }[k.substring(9)];
      var raw = customer && col ? customer[col] : '';
      if (col === 'priority_flags_json') { try { raw = JSON.parse(raw || '[]'); } catch (ignoreFlags) { raw = []; } }
      before[k] = raw === null || raw === undefined ? '' : raw;
    } else {
      before[k] = item[k] === null || item[k] === undefined ? '' : item[k];
    }
  });
  return before;
}

function revisionShow_(t, key, value) {
  if (key === 'occurrence_date') {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  }
  if (key === 'work_type_code') {
    var wt = value ? t.find('WorkTypes', 'type_code', value) : null;
    return wt ? (wt.object.display_name || value) : (value || '—');
  }
  if (key === 'customer.priority_flags') {
    var names = { VIP: 'VIP', XU_LY_GAP: 'Xử lý gấp' }, flags = normalizePriorityFlags_(value);
    return flags.length ? flags.map(function (x) { return names[x]; }).join(', ') : 'Thường';
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value === null || value === undefined || value === '' ? '—' : value);
}

/** "Ngày phát sinh: 08/10/2026 → 12/10/2026" cho từng trường đổi; ghi vào lý do của sự kiện để đọc được trong Nhật ký. */
function revisionChangeText_(t, before, fields) {
  return Object.keys(fields).map(function (k) {
    return (REVISION_LABELS_[k] || k) + ': ' + revisionShow_(t, k, before[k]) + ' → ' + revisionShow_(t, k, fields[k]);
  }).join('; ');
}

function joinReason_(reason, change) {
  reason = String(reason || '').trim();
  return reason ? reason + ' · ' + change : change;
}

/** Phòng sửa việc đã vào LS xử lý thì thành đề nghị chờ kiểm soát duyệt. */
function proposeRevision(itemId, fields, reason, expectedVersion) {
  var u = requireActor_();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Cần ghi lý do sửa.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
    assertCurrentWorkItem_(item);
    if (OPEN_STATUS.indexOf(item.status) === -1) throw new Error('Việc đã đóng, dùng chức năng mở lại.');
    // Hai người cùng mở hộp thoại sửa: người lưu sau phải tải lại, không ghi đè im lặng.
    if (expectedVersion !== undefined && expectedVersion !== null && Number(item.version) !== Number(expectedVersion)) {
      throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi sửa.');
    }

    var req = t.find('Requests', 'request_id', item.request_id);
    if (u.role === 'PHONG_PGD' && (!req || req.object.unit_id !== u.unit_id)) throw new Error('Việc không thuộc đơn vị của bạn.');
    if (['PHONG_PGD', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được sửa hồ sơ.');
    validateRevisionFields_(t, fields);

    var ts = stamp_();
    // Phòng/PGD được sửa trực tiếp khi hồ sơ chưa có người nhận; hồ sơ đã giao
    // vẫn đi qua luồng đề nghị sửa để LS/kiểm soát duyệt như trước.
    // Chỉ đổi ngày phát sinh (khách đổi ngày ký) thì Phòng/PGD cũng ghi nhận ngay, không chờ duyệt.
    var dateOnly = Object.keys(fields).every(function (k) { return k === 'occurrence_date'; });
    var direct = u.role !== 'PHONG_PGD' || dateOnly || (!item.assigned_user_id &&
      ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(item.status) !== -1);

    var beforeValues = revisionBefore_(item, req, fields);
    var changeText = revisionChangeText_(t, beforeValues, fields);
    if (direct) {
      var oldDate = String(item.occurrence_date || '');
      applyRevision_(t, found, req, fields, ts);
      t.append('Events', {
        event_id: id_('EVT'), item_id: itemId, type: 'SUA_THONG_TIN', by: u.user_id, at: ts,
        reason: joinReason_(reason, changeText), before_json: JSON.stringify(beforeValues), after_json: JSON.stringify(fields)
      });
      // Cán bộ đang xử lý phải biết hồ sơ vừa bị đổi dưới tay mình.
      if (item.assigned_user_id && item.assigned_user_id !== u.user_id) inboxNotify_(t, item.assigned_user_id, itemId, 'SUA_THONG_TIN');
      // Khách đổi ngày ký: việc chính / việc kèm còn mở đang cùng ngày cũ dời theo, để không bị tự trả T+1 lệch nhau.
      var movedLinked = [];
      if ('occurrence_date' in fields && fields.occurrence_date !== oldDate) {
        linkedItemsOf_(t, item).forEach(function (other) {
          if (OPEN_STATUS.indexOf(other.status) === -1 || String(other.occurrence_date || '') !== oldDate) return;
          var linkedFound = t.find('WorkItems', 'item_id', other.item_id);
          if (!linkedFound) return;
          var linkedFields = { occurrence_date: fields.occurrence_date, version: Number(other.version) + 1, updated_at: ts };
          t.write(linkedFound, linkedFields);
          t.append('Events', {
            event_id: id_('EVT'), item_id: other.item_id, type: 'SUA_THONG_TIN', by: u.user_id, at: ts,
            reason: 'Dời ngày theo ' + (other.parent_item_id ? 'việc chính ' : 'việc kèm ') + (item.source_stt || itemId) + ': ' + oldDate + ' → ' + fields.occurrence_date,
            before_json: JSON.stringify({ occurrence_date: other.occurrence_date }), after_json: JSON.stringify(linkedFields)
          });
          if (other.assigned_user_id && other.assigned_user_id !== u.user_id && other.assigned_user_id !== item.assigned_user_id) inboxNotify_(t, other.assigned_user_id, other.item_id, 'SUA_THONG_TIN');
          movedLinked.push({ item_id: other.item_id, occurrence_date: fields.occurrence_date, version: linkedFields.version, updated_at: ts });
        });
      }
      return { ok: true, applied: true, period_id: item.period_id, linked_updates: movedLinked };
    }

    if (item.pending_json) {
      var waiting = null;
      try { waiting = JSON.parse(item.pending_json); } catch (ignoreWaiting) {}
      if (!waiting || waiting.kind !== 'CANCEL') {
        throw new Error('Việc đang có một đề nghị sửa chờ kiểm soát duyệt. Chờ duyệt xong rồi gửi đề nghị mới.');
      }
      // Đề nghị hủy cũ không còn là bước duyệt; bỏ cờ cũ để không khóa các thao tác khác.
      t.write(found, { pending_json: '', updated_at: ts });
      item.pending_json = '';
    }

    t.write(found, {
      pending_json: JSON.stringify({ fields: fields, by: u.user_id, at: ts, reason: reason }),
      updated_at: ts
    });
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'DE_NGHI_SUA', by: u.user_id, at: ts,
      reason: joinReason_(reason, changeText), before_json: JSON.stringify(beforeValues), after_json: JSON.stringify(fields)
    });
    // Đề nghị sửa nằm im chờ duyệt mà không ai được báo thì nó chỉ là một cột
    // dữ liệu, không phải một bước trong quy trình.
    Notifications.queue(t, item, 'DE_NGHI_SUA', u.user_id);
    return { ok: true, applied: false, period_id: item.period_id };
  }, ITEM_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

function resolveRevision(itemId, approve, reason) {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Chỉ kiểm soát được duyệt đề nghị sửa.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    assertCurrentWorkItem_(found.object);
    var pending = found.object.pending_json ? JSON.parse(found.object.pending_json) : null;
    if (!pending) throw new Error('Việc này không có đề nghị sửa nào.');

    var ts = stamp_();
    if (pending.kind === 'CANCEL') {
      // Duyệt hủy đi qua transitionItem(HUY) để đóng đồng hồ, xếp tin và ghi sổ hủy.
      if (approve) throw new Error('Duyệt đề nghị hủy bằng nút "Duyệt hủy".');
      t.write(found, { pending_json: '', updated_at: ts });
      t.append('Events', { event_id: id_('EVT'), item_id: itemId, type: 'TU_CHOI_HUY', by: u.user_id, at: ts,
        reason: reason || '', before_json: JSON.stringify(pending), after_json: '' });
      inboxNotify_(t, pending.by, itemId, 'TU_CHOI_HUY');
      return { ok: true, approved: false, period_id: found.object.period_id };
    }
    var req = t.find('Requests', 'request_id', found.object.request_id);

    if (approve) {
      if (OPEN_STATUS.indexOf(found.object.status) === -1) {
        throw new Error('Việc đã đóng từ lúc gửi đề nghị; chỉ có thể từ chối, muốn sửa thì mở lại việc.');
      }
      validateRevisionFields_(t, pending.fields);
    }
    // Giá trị cũ phải đọc trước khi áp dụng, nếu không nhật ký chỉ còn giá trị mới.
    var beforeValues = revisionBefore_(found.object, req, pending.fields);
    var changeText = revisionChangeText_(t, beforeValues, pending.fields);
    if (approve) applyRevision_(t, found, req, pending.fields, ts);
    t.write(found, { pending_json: '', updated_at: ts });

    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: approve ? 'DUYET_SUA' : 'TU_CHOI_SUA',
      by: u.user_id, at: ts, reason: joinReason_(reason, changeText), before_json: JSON.stringify(beforeValues), after_json: JSON.stringify(pending.fields)
    });
    // Phòng đề nghị phải biết kết quả; cán bộ đang xử lý phải biết hồ sơ đã đổi.
    inboxNotify_(t, pending.by, itemId, approve ? 'DUYET_SUA' : 'TU_CHOI_SUA');
    var assignee = found.object.assigned_user_id;
    if (approve && assignee && assignee !== pending.by) inboxNotify_(t, assignee, itemId, 'SUA_THONG_TIN');
    return { ok: true, approved: !!approve, period_id: found.object.period_id };
  }, NOTIFY_WARM_);
  markPlanDirty_(result.period_id);
  return result;
}

function applyRevision_(t, found, req, fields, ts) {
  var itemFields = {}, reqFields = {};
  Object.keys(fields).forEach(function (k) {
    if (k.indexOf('customer.') === 0) {
      var map = { name: 'customer_name', cif: 'cif', phone: 'phone', email: 'email', priority_flags: 'priority_flags_json' };
      var col = map[k.substring(9)];
      if (col) reqFields[col] = col === 'priority_flags_json'
        ? JSON.stringify(normalizePriorityFlags_(fields[k]))
        : fields[k];
    } else if (['work_type_code', 'product_name', 'occurrence_date'].indexOf(k) !== -1) {
      itemFields[k] = fields[k];
    }
  });

  if (itemFields.work_type_code && itemFields.work_type_code !== found.object.work_type_code) {
    var wt = t.find('WorkTypes', 'type_code', itemFields.work_type_code);
    // Checklist thuộc loại việc: đổi loại thì bắt đầu lại checklist của loại mới,
    // không mang dấu tích của loại cũ sang (lệch số mục thì chốt việc sai).
    var defs = [];
    try { defs = wt ? JSON.parse(wt.object.checklist_json || '[]') : []; } catch (ignoreDefs) { defs = []; }
    itemFields.checklist_json = JSON.stringify(defs.map(function () { return false; }));
    // Hạn tính lại theo SLA mới, mốc phân công giữ nguyên.
    if (found.object.dossier_received_at) itemFields.due_at = LSTiming.deadline(found.object,wt ? Number(wt.object.sla_hours) || 8 : 8,timingCalendar_(t),ts);
    itemFields.processing_sessions_json = JSON.stringify(LSTiming.nextSessions(Object.assign({},found.object,{work_type_code:itemFields.work_type_code}),found.object.status,ts,found.object.assigned_user_id));
  }

  itemFields.version = Number(found.object.version) + 1;
  itemFields.updated_at = ts;
  t.write(found, itemFields);

  if (req && Object.keys(reqFields).length) {
    if (reqFields.cif) reqFields.customer_kind = 'DA_CO_CIF';
    reqFields.updated_at = ts;
    t.write(req, reqFields);
  }
}

/** Tính hạn theo lịch làm việc trong Settings; không cộng thẳng giờ lịch. */
function workCalendar_(t) {
  var settings = {};
  t.rows('Settings').forEach(function (row) { settings[row.key] = row.value; });
  // Cùng giá trị mặc định với timingCalendar_: hạn xử lý và báo cáo giờ không được lệch nhau khi Settings thiếu khóa.
  var pause = String(settings.work_break || '11:30-13:30').split('-');
  return {
    days: String(settings.work_days || '1,2,3,4,5').split(',').map(function (x) { return Number(x); }),
    holidays: String(settings.holidays || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
    open: String(settings.work_open || '07:30').split(':').map(Number),
    close: String(settings.work_close || '18:00').split(':').map(Number),
    breakStart: String(pause[0] || '11:30').split(':').map(Number),
    breakEnd: String(pause[1] || '13:30').split(':').map(Number)
  };
}

function calDayKey_(date) {
  return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
}

function calAt_(date, time) {
  var result = new Date(date.getTime());
  result.setHours(time[0], time[1], 0, 0);
  return result;
}

/** Số phút làm việc thật giữa hai mốc theo cùng lịch với dueAt_. */
function workMinutesBetween_(t, fromIso, toIso) {
  var cal = workCalendar_(t);
  var from = new Date(fromIso), to = new Date(toIso);
  if (!isFinite(from.getTime()) || !isFinite(to.getTime()) || to <= from) return 0;
  var total = 0, day = calAt_(from, [0, 0]), guard = 0;
  while (day < to && guard++ < 3700) {
    if (cal.days.indexOf(day.getDay()) !== -1 && cal.holidays.indexOf(calDayKey_(day)) === -1) {
      [[cal.open, cal.breakStart], [cal.breakEnd, cal.close]].forEach(function (seg) {
        var a = calAt_(day, seg[0]), b = calAt_(day, seg[1]);
        if (a < from) a = from;
        if (b > to) b = to;
        if (b > a) total += (b.getTime() - a.getTime()) / 60000;
      });
    }
    day.setDate(day.getDate() + 1);
  }
  return Math.round(total);
}

/**
 * Hạn xử lý khi ra khỏi trạng thái chờ bên ngoài: lùi đúng số phút làm đã chờ.
 * Trả null khi không có gì để lùi (chưa có hạn hoặc không ghi mốc bắt đầu chờ).
 */
function resumeDueAt_(t, item, ts) {
  if (!item.due_at || !item.sla_paused_at) return null;
  var waited = workMinutesBetween_(t, item.sla_paused_at, ts);
  return waited > 0 ? dueAt_(t, item.due_at, waited / 60) : null;
}

function dueAt_(t, startIso, hours) {
  var cal = workCalendar_(t);
  var days = cal.days, holidays = cal.holidays, open = cal.open, close = cal.close;
  var breakStart = cal.breakStart, breakEnd = cal.breakEnd;
  var cursor = new Date(startIso);
  // Tính bằng mili-giây: mốc có giây lẻ (vd. giao lúc 11:29:40) mà làm tròn phút
  // thì đoạn còn lại trước nghỉ trưa/tan ca thành 0 phút, vòng lặp đứng yên và báo lỗi.
  var remaining = Math.max(0, Math.round(Number(hours || 0) * 60)) * 60000;
  var guard = 0;

  var dayKey_ = calDayKey_, at_ = calAt_;
  function nextDay_() {
    cursor.setDate(cursor.getDate() + 1);
    cursor = at_(cursor, open);
  }

  while (remaining > 0 && guard++ < 10000) {
    if (days.indexOf(cursor.getDay()) === -1 || holidays.indexOf(dayKey_(cursor)) !== -1) { nextDay_(); continue; }
    var start = at_(cursor, open), end = at_(cursor, close), lunchStart = at_(cursor, breakStart), lunchEnd = at_(cursor, breakEnd);
    if (cursor < start) cursor = start;
    if (cursor >= end) { nextDay_(); continue; }
    if (cursor >= lunchStart && cursor < lunchEnd) cursor = lunchEnd;
    var segmentEnd = cursor < lunchStart ? lunchStart : end;
    if (segmentEnd > end) segmentEnd = end;
    if (cursor >= segmentEnd) { if (cursor < lunchEnd) { cursor = lunchEnd; continue; } nextDay_(); continue; }
    var available = segmentEnd.getTime() - cursor.getTime();
    var used = Math.min(remaining, available);
    cursor = new Date(cursor.getTime() + used);
    remaining -= used;
  }
  if (remaining > 0) throw new Error('Không thể tính hạn theo lịch làm việc; kiểm tra cấu hình ngày và giờ làm.');
  return cursor.toISOString();
}

/* ---------------------------- Quản trị danh mục ---------------------------- */

var ROLES = ['PHONG_PGD', 'CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS', 'ADMIN', 'GIAM_SAT'];

/**
 * Vai trò quyết định phạm vi dữ liệu trong getBootstrap. Một mã lạ do gõ nhầm
 * trong file Excel sẽ không rơi vào nhánh lọc nào — nghĩa là người đó thấy toàn
 * bộ hồ sơ khách của cả kỳ. Chặn ngay từ cửa vào.
 */
function requireRole_(role) {
  var value = String(role || '').trim().toUpperCase();
  if (ROLES.indexOf(value) === -1) {
    throw new Error('Vai trò "' + role + '" không hợp lệ. Chỉ nhận: ' + ROLES.join(', ') + '.');
  }
  return value;
}

function requireAdmin_() {
  var u = requireActor_();
  if (u.role !== 'ADMIN') throw new Error('Chỉ quản trị hệ thống được thay đổi danh mục và cấu hình.');
  return u;
}

/**
 * Hàm bảo trì chạy tay trong trình soạn thảo Apps Script: chủ script (người đang chạy
 * cũng là người triển khai) được chạy mà không cần đăng nhập Admin của hệ thống, vì tài
 * khoản Google của họ thường không có dòng trong bảng Users. Khách truy cập web có email
 * trống hoặc khác chủ script, và mọi lệnh qua api() có mã phiên, nên vẫn phải là Admin.
 */
function requireAdminOrScriptOwner_() {
  var active = '', effective = '';
  try {
    active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  } catch (ignore) {}
  if (!(REQUEST_ && REQUEST_.token) && active && active === effective) return null;
  return requireAdmin_();
}

function logConfig_(t, u, area, detail) {
  t.append('ConfigLog', { id: id_('CFG'), at: stamp_(), by: u.user_id, area: area, detail: detail });
}

/** Bàn giao toàn bộ việc đang mở sang cán bộ thay thế trong cùng giao dịch. */
function handoverOpenWork_(t, oldUserId, replacementUserId, actorId, openItems, reason) {
  var ts = stamp_();
  var moved = 0;
  // Người nhận bàn giao cũng phải là cán bộ LS đang làm được việc — nếu không việc
  // rơi vào tài khoản đã khóa/đang nghỉ/không phải LS và không ai xử lý.
  var replacement = t.find('Users', 'user_id', replacementUserId);
  if (replacementUserId === oldUserId || !userAvailableForAssignment_(replacement && replacement.object, ts)) {
    throw new Error('Cán bộ nhận bàn giao phải là cán bộ LS khác, đang hoạt động và không nghỉ.');
  }
  (openItems || []).filter(function (item) {
    return item.assigned_user_id === oldUserId && OPEN_STATUS.indexOf(item.status) !== -1 && !item.carried_to_item_id;
  }).forEach(function (item) {
    var found = t.find('WorkItems', 'item_id', item.item_id);
    if (!found) return;
    var fields = {
      assigned_user_id: replacementUserId,
      assigned_by: actorId,
      assigned_at: ts,
      updated_at: ts,
      version: Number(item.version || 0) + 1
    };
    fields.first_assigned_at = item.first_assigned_at || item.assigned_at || ts;
    fields.execution_state=CLOCK_RUNNING_.indexOf(item.status)!==-1?'QUEUED':'';
    fields.execution_changed_at=ts;
    fields.processing_sessions_json = JSON.stringify(LSTiming.nextSessions(item,item.status,ts,replacementUserId,'QUEUED'));
    var pauses=nextPauseLog_(item,'DA_PHAN_CONG',ts);
    if(pauses!==null)fields.pause_log_json=pauses;
    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: item.item_id, type: 'DOI_NGUOI', by: actorId, at: ts,
      reason: reason || 'Bàn giao do đổi vai trò hoặc khóa tài khoản.',
      before_json: JSON.stringify({ status: item.status, assigned_user_id: oldUserId }),
      after_json: JSON.stringify(fields)
    });
    var merged = {};
    Object.keys(item).forEach(function (key) { merged[key] = item[key]; });
    Object.keys(fields).forEach(function (key) { merged[key] = fields[key]; });
    Notifications.queue(t, merged, 'DOI_NGUOI', actorId);
    moved += 1;
  });
  return moved;
}

/**
 * Các loại việc một quy tắc phân công nhanh áp dụng: `work_type_codes`, hoặc mã đơn của quy tắc cũ
 * (`work_type_code` / cột code). Rỗng nghĩa là mọi sản phẩm. Khớp ruleWorkTypeCodes ở js/domain.js.
 */
function ruleWorkTypeCodes_(metadata, legacyCode) {
  var list = metadata && Array.isArray(metadata.work_type_codes) ? metadata.work_type_codes : [];
  list = list.map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x && x !== 'ALL'; });
  var single = String((metadata && metadata.work_type_code) || legacyCode || '').trim();
  if (!list.length && single && single !== 'ALL') list = [single];
  return list.filter(function (x, i) { return list.indexOf(x) === i; });
}

/** Lưu danh mục từ màn Quản trị. Các cột và bảng được giới hạn cứng, không nhận tên Sheet tùy ý. */
function adminSaveCatalog(kind, code, data) {
  var caller = requireActor_();
  var assignmentRuleWrite = kind === 'catalogOption' && data && data.catalog_key === 'ASSIGNMENT_RULE';
  var u = assignmentRuleWrite && ['ADMIN', 'KS_LS', 'QUAN_LY_LS'].indexOf(caller.role) !== -1
    ? caller
    : requireAdmin_();
  var spec = {
    workType: { table: 'WorkTypes', key: 'type_code', area: 'Loại việc' },
    unit: { table: 'Units', key: 'unit_id', area: 'Đơn vị' },
    user: { table: 'Users', key: 'user_id', area: 'Người dùng' },
    reason: { table: 'Reasons', key: 'code', area: 'Lý do' },
    catalogOption: { table: 'CatalogOptions', key: 'option_id', area: 'Dropdown nguồn' }
  }[kind];
  if (!spec) throw new Error('Danh mục không được phép thay đổi.');
  if (!code || !data) throw new Error('Thiếu mã hoặc dữ liệu danh mục.');
  if (kind === 'catalogOption') {
    if (!data.catalog_key || !data.label) throw new Error('Dropdown phải có nhóm và nhãn hiển thị.');
    if (data.sort_order === undefined || data.sort_order === '') data.sort_order = 9999;
    if (data.is_active !== undefined) data.is_active = truthy_(data.is_active);
  }

  var result = DataRepository.tx(function (t) {
    var found = t.find(spec.table, spec.key, code);
    if (kind === 'catalogOption' && data.is_active === undefined) {
      data.is_active = found ? truthy_(found.object.is_active) : true;
    }
    if (assignmentRuleWrite) {
      if (found && found.object.catalog_key !== 'ASSIGNMENT_RULE') {
        throw new Error('Chỉ được sửa quy tắc phân công đã có.');
      }
      var metadata = {};
      try { metadata = JSON.parse(data.metadata_json || '{}'); } catch (ignoreAssignmentRule) {}
      var unitId = String(metadata.unit_id || data.unit_id || '').trim();
      var workTypeCodes = ruleWorkTypeCodes_(metadata, data.code);
      var productName = String(metadata.product_name || '').trim();
      var assigneeId = String(metadata.assignee_id || data.role_kind || '').trim();
      var priority = Number(metadata.priority || data.sort_order || 1);
      var unit = unitId ? t.find('Units', 'unit_id', unitId) : null;
      var staff = assigneeId ? t.find('Users', 'user_id', assigneeId) : null;
      if (unitId && (!unit || !truthy_(unit.object.is_active))) throw new Error('Phòng trong quy tắc không còn hoạt động.');
      if (workTypeCodes.length > 80) throw new Error('Một quy tắc chọn tối đa 80 sản phẩm.');
      workTypeCodes.forEach(function (typeCode) {
        var workType = t.find('WorkTypes', 'type_code', typeCode);
        if (!workType || !truthy_(workType.object.is_active)) throw new Error('Loại việc trong quy tắc không còn hoạt động.');
      });
      if (!userAvailableForAssignment_(staff && staff.object, stamp_())) {
        throw new Error('Cán bộ nhận theo quy tắc phải là cán bộ LS đang hoạt động và không nghỉ.');
      }
      if (productName.length > 120) throw new Error('Sản phẩm trong quy tắc tối đa 120 ký tự.');
      if (!isFinite(priority) || priority < 1 || priority > 9999) throw new Error('Thứ tự ưu tiên phải từ 1 đến 9999.');
      // work_type_code chỉ giữ khi quy tắc có đúng một sản phẩm, để màn hình bản cũ vẫn đọc được.
      metadata = {
        unit_id: unitId, work_type_code: workTypeCodes.length === 1 ? workTypeCodes[0] : '', work_type_codes: workTypeCodes,
        product_name: productName, assignee_id: assigneeId, priority: Math.floor(priority),
        auto_assign: truthy_(metadata.auto_assign), priority_processing: truthy_(metadata.priority_processing)
      };
      data = {
        catalog_key: 'ASSIGNMENT_RULE', unit_id: unitId, code: metadata.work_type_code || 'ALL',
        label: staff.object.full_name || assigneeId, role_kind: assigneeId, sort_order: metadata.priority,
        is_active: data.is_active === undefined ? (!found || truthy_(found.object.is_active)) : truthy_(data.is_active),
        metadata_json: JSON.stringify(metadata), source_tab: 'Admin', source_row: ''
      };
    }
    if (kind === 'user') {
      data.email = validateEmail_(data.email !== undefined ? data.email : found && found.object.email);
      data.linked_email = validateEmail_(data.linked_email !== undefined ? data.linked_email :
        (found && (found.object.linked_email || found.object.email)) || data.email);
      data.zalo_phone = validatePhone_(data.zalo_phone !== undefined ? data.zalo_phone : found && found.object.zalo_phone);
      data.receive_completion_email = data.role === 'PHONG_PGD' && truthy_(data.receive_completion_email !== undefined ? data.receive_completion_email : found && found.object.receive_completion_email);
      if (data.receive_completion_email && !data.email) throw new Error('Nhập email cán bộ trước khi bật nhận email hoàn thành của đơn vị.');
      data.login_code = String(data.login_code || code).trim();
      data.role = requireRole_(data.role);
      // Nhóm đăng nhập suy từ vai trò, không nhận từ trình duyệt: EXTERNAL nghĩa là
      // vào được mà không cần mật khẩu.
      data.auth_group = data.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL';
      if (!data.login_code) throw new Error('Người dùng phải có mã đăng nhập.');
      if (!t.find('Units', 'unit_id', data.unit_id)) throw new Error('Đơn vị ' + data.unit_id + ' chưa có trong danh mục.');
      var availability = String(data.availability_status || 'AVAILABLE').trim().toUpperCase();
      if (['AVAILABLE', 'OFF'].indexOf(availability) === -1) throw new Error('Trạng thái nhận việc không hợp lệ.');
      var offFrom = data.off_from ? dateOnly_(data.off_from) : '';
      var offTo = data.off_to ? dateOnly_(data.off_to) : '';
      if (data.off_from && !offFrom) throw new Error('Ngày bắt đầu nghỉ phải có dạng YYYY-MM-DD.');
      if (data.off_to && !offTo) throw new Error('Ngày kết thúc nghỉ phải có dạng YYYY-MM-DD.');
      if (offFrom && offTo && offFrom > offTo) throw new Error('Ngày kết thúc nghỉ không được trước ngày bắt đầu.');
      data.availability_status = availability;
      data.off_from = offFrom;
      data.off_to = offTo;
      data.off_reason = String(data.off_reason || '').trim();
      data.replacement_user_id = String(data.replacement_user_id || '').trim();
      if (data.replacement_user_id) {
        if (data.replacement_user_id === code) throw new Error('Cán bộ thay thế không được là chính tài khoản đang sửa.');
        var replacement = t.find('Users', 'user_id', data.replacement_user_id);
        if (!replacement || String(replacement.object.role || '').trim().toUpperCase() !== 'CAN_BO_LS' || !truthy_(replacement.object.is_active)) {
          throw new Error('Cán bộ thay thế phải là cán bộ LS đang hoạt động.');
        }
      }
      var sameEmail = t.rows('Users').filter(function (x) {
        return data.email && String(x.email).toLowerCase() === String(data.email || '').toLowerCase() && x.user_id !== code;
      });
      if (sameEmail.length) throw new Error('Email đã được cấp cho tài khoản khác.');
      var loginEmail = data.linked_email || data.email;
      var sameLinkedEmail = t.rows('Users').filter(function (x) {
        var existingLoginEmail = x.linked_email || x.email || '';
        return loginEmail && String(existingLoginEmail).trim().toLowerCase() === loginEmail && x.user_id !== code;
      });
      if (sameLinkedEmail.length) throw new Error('Email liên kết đã được cấp cho tài khoản khác.');
      var sameCode = t.rows('Users').filter(function (x) {
        return String(x.login_code || x.user_id).toLowerCase() === data.login_code.toLowerCase() && x.user_id !== code;
      });
      if (sameCode.length) throw new Error('Mã đăng nhập đã được cấp cho tài khoản khác.');
      if (data.new_password) {
        // Mật khẩu do quản trị đặt là mật khẩu tạm; chủ tài khoản phải đổi khi vào.
        data.password_hash = passwordHash_(data.new_password);
        data.must_change_password = true;
      }
      delete data.new_password;
      var targetActive = data.is_active !== undefined ? truthy_(data.is_active) : truthy_(found && found.object.is_active);
      if (found && String(found.object.role || '').trim().toUpperCase() === 'CAN_BO_LS' &&
          (data.role !== 'CAN_BO_LS' || !targetActive)) {
        var openItems = t.rows('WorkItems').filter(function (i) {
          return i.assigned_user_id === code && OPEN_STATUS.indexOf(i.status) !== -1 && !i.carried_to_item_id;
        });
        if (openItems.length) {
          if (!data.replacement_user_id) {
            throw new Error('Còn ' + openItems.length + ' việc đang mở; chọn cán bộ thay thế trước khi đổi vai trò hoặc khóa.');
          }
          handoverOpenWork_(t, code, data.replacement_user_id, u.user_id, openItems,
            'Bàn giao do đổi vai trò hoặc khóa tài khoản ' + code + '.');
        }
      }
      // Khóa nốt tài khoản quản trị cuối cùng là tự nhốt mình ngoài cửa.
      if (found && String(found.object.role || '').trim().toUpperCase() === 'ADMIN' &&
          (data.role !== 'ADMIN' || !targetActive)) {
        var otherAdmins = t.rows('Users').filter(function (x) {
          return x.role === 'ADMIN' && x.user_id !== code && truthy_(x.is_active);
        });
        if (!otherAdmins.length) throw new Error('Đây là tài khoản quản trị đang hoạt động duy nhất; tạo tài khoản quản trị khác trước.');
      }
    }
    // Ô 'Cần kiểm soát duyệt hoàn thành' ở màn Loại việc phải có hiệu lực thật;
    // trước đây máy chủ ép luôn true nên ô này vô tác dụng.
    if (kind === 'workType') data.requires_ks_approval = truthy_(data.requires_ks_approval);
    if (found) t.write(found, data);
    else {
      data[spec.key] = code;
      t.append(spec.table, data);
    }
    logConfig_(t, u, spec.area, (found ? 'Sửa ' : 'Thêm ') + code + '.');
    return { ok: true };
  });
  var current = DataRepository.find('MonthlyPlans', 'status', 'ACTIVE');
  if (current) markPlanDirty_(current.period_id);
  return result;
}

/**
 * Xóa hẳn một tài khoản (dùng cho user thử nghiệm và cán bộ đã nghỉ).
 *  - Việc đang mở còn trong hạn bắt buộc bàn giao cho một cán bộ LS khác (replacementUserId).
 *  - Việc đang mở nhưng đã quá hạn không chặn xóa; nếu có chọn người nhận thì được bàn giao
 *    luôn, không chọn thì giữ nguyên.
 *  - Việc đã hoàn thành/hủy không chặn: giữ làm lịch sử.
 *  - Quy tắc phân công nhanh trỏ tới tài khoản bị xóa được tự tắt.
 */
function adminDeleteUser(userId, replacementUserId) {
  var admin = requireAdmin_();
  var id = String(userId || '').trim();
  var replacement = String(replacementUserId || '').trim();
  if (!id) throw new Error('Thiếu tài khoản cần xóa.');
  if (id === admin.user_id) throw new Error('Không thể xóa chính tài khoản đang đăng nhập.');
  if (!DataRepository.find('Users', 'user_id', id)) throw new Error('Không tìm thấy tài khoản ' + id + '.');

  function openOf_(items) {
    return items.filter(function (i) { return i.assigned_user_id === id && OPEN_STATUS.indexOf(i.status) !== -1 && !i.carried_to_item_id; });
  }
  var now = Date.now();
  var allWorkItems = DataRepository.getAll('WorkItems');
  var exemptByItem = slaExemptByItem_(allWorkItems, DataRepository.getAll('WorkTypes'));
  var open = openOf_(allWorkItems);
  var live = open.filter(function (i) { return !isLateOpen_(i, now, exemptByItem); });
  if (live.length && !replacement) {
    throw new Error('Còn ' + live.length + ' việc đang xử lý chưa quá hạn; chọn cán bộ nhận bàn giao trước khi xóa.');
  }
  var moved = 0;
  if (open.length && replacement) {
    moved = DataRepository.tx(function (t) {
      return handoverOpenWork_(t, id, replacement, admin.user_id, openOf_(t.rows('WorkItems')),
        'Bàn giao do xóa tài khoản ' + id + '.');
    });
  }

  var removed = DataRepository.deleteRow('Users', 'user_id', id, function (u) {
    if (String(u.role || '').trim().toUpperCase() === 'ADMIN' && truthy_(u.is_active)) {
      var others = DataRepository.getAll('Users').filter(function (x) {
        return x.role === 'ADMIN' && x.user_id !== id && truthy_(x.is_active);
      });
      if (!others.length) throw new Error('Đây là tài khoản quản trị đang hoạt động duy nhất; không thể xóa.');
    }
    // Có người vừa giao thêm việc trong lúc xóa thì dừng, không để việc còn hạn mồ côi.
    var latestItems = DataRepository.getAll('WorkItems');
    var latestExemptByItem = slaExemptByItem_(latestItems, DataRepository.getAll('WorkTypes'));
    var stillLive = openOf_(latestItems).filter(function (i) { return !isLateOpen_(i, Date.now(), latestExemptByItem); });
    if (stillLive.length) throw new Error('Vừa có ' + stillLive.length + ' việc mới giao cho tài khoản này; hãy thử xóa lại để bàn giao.');
  });
  if (!removed.deleted) throw new Error('Không tìm thấy tài khoản ' + id + '.');

  var disabled = 0;
  DataRepository.tx(function (t) {
    t.rows('CatalogOptions').forEach(function (o) {
      if (o.catalog_key !== 'ASSIGNMENT_RULE' || !truthy_(o.is_active)) return;
      var m = {};
      try { m = JSON.parse(o.metadata_json || '{}'); } catch (ignore) {}
      if (m.assignee_id !== id && o.role_kind !== id) return;
      var found = t.find('CatalogOptions', 'option_id', o.option_id);
      if (found) { t.write(found, { is_active: false }); disabled += 1; }
    });
    logConfig_(t, admin, 'Người dùng', 'Xóa tài khoản ' + id + ' (' + (removed.row.full_name || '') + ', ' + (removed.row.role || '') + ')' +
      (moved ? '; bàn giao ' + moved + ' việc cho ' + replacement : '') + (disabled ? '; tắt ' + disabled + ' quy tắc phân công' : '') + '.');
  });
  var current = DataRepository.find('MonthlyPlans', 'status', 'ACTIVE');
  if (moved && current) markPlanDirty_(current.period_id);
  return { ok: true, user_id: id, moved: moved, rules_disabled: disabled, late_left: open.length - moved };
}

/** Nạp nhiều cán bộ từ CSV/TSV đã xuất bằng Excel. Không nhận mật khẩu rõ. */
function adminImportUsers(rows) {
  var u = requireAdmin_();
  if (!Array.isArray(rows) || !rows.length) throw new Error('File nhập chưa có dòng dữ liệu.');
  var result = DataRepository.tx(function (t) {
    var existing = t.rows('Users'), byId = {}, plannedById = {}, seen = {}, seenIds = {}, seenEmails = {}, seenLinkedEmails = {}, plan = [];
    existing.forEach(function (x) { byId[x.user_id] = x; });
    function optional(row, key, prior, priorKey) {
      var value = row[key];
      return value === undefined || String(value).trim() === '' ? String(prior && prior[priorKey] || '') : String(value).trim();
    }
    function importFlag(value, fallback, index, label) {
      if (value === undefined || String(value).trim() === '') return fallback;
      var normalized = String(value).trim().toLowerCase();
      if (['true','1','yes','y'].indexOf(normalized) !== -1) return true;
      if (['false','0','no','n'].indexOf(normalized) !== -1) return false;
      throw new Error('Dòng ' + (index + 2) + ': ' + label + ' chỉ nhận TRUE hoặc FALSE.');
    }
    rows.forEach(function (raw, index) {
      var row = raw || {};
      var code = String(row.login_code || row.ma_can_bo || row.ma || row.user_id || '').trim();
      var name = String(row.full_name || row.ho_ten || row.hoTen || '').trim();
      var unit = String(row.unit_id || row.don_vi || row.donVi || '').trim().toUpperCase();
      if (!code || !name || !unit) throw new Error('Dòng ' + (index + 2) + ' thiếu mã cán bộ, họ tên hoặc đơn vị.');
      if (!t.find('Units', 'unit_id', unit)) throw new Error('Dòng ' + (index + 2) + ': đơn vị ' + unit + ' chưa có trong danh mục.');
      if (seen[code.toLowerCase()]) throw new Error('Mã cán bộ bị trùng trong file: ' + code);
      seen[code.toLowerCase()] = true;
      var found = existing.filter(function (x) {
        return String(x.login_code || x.user_id).toLowerCase() === code.toLowerCase();
      })[0];
      var role;
      try { role = requireRole_(row.role || row.vai_tro || (found && found.role) || (unit === 'PHONG_LS' ? 'CAN_BO_LS' : 'PHONG_PGD')); }
      catch (err) { throw new Error('Dòng ' + (index + 2) + ': ' + err.message); }
      var id = found ? found.user_id : 'U_' + code.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
      if (!found && (byId[id] || seenIds[id])) throw new Error('Dòng ' + (index + 2) + ': mã đăng nhập tạo trùng ID nội bộ với user khác.');
      seenIds[id] = true;
      var activeValue = row.is_active !== undefined ? row.is_active : row.hoat_dong;
      var isActive = importFlag(activeValue, found ? truthy_(found.is_active) : true, index, 'is_active');
      var availability = String(row.availability_status || row.trang_thai_nhan_viec || (found && found.availability_status) || 'AVAILABLE').trim().toUpperCase();
      var offFrom = row.off_from || row.nghi_tu || (found && found.off_from) || '';
      var offTo = row.off_to || row.nghi_den || (found && found.off_to) || '';
      offFrom = offFrom ? dateOnly_(offFrom) : '';
      offTo = offTo ? dateOnly_(offTo) : '';
      if (['AVAILABLE', 'OFF'].indexOf(availability) === -1) throw new Error('Dòng ' + (index + 2) + ': trạng thái nhận việc không hợp lệ.');
      if ((row.off_from || row.nghi_tu) && !offFrom) throw new Error('Dòng ' + (index + 2) + ': ngày bắt đầu nghỉ phải có dạng YYYY-MM-DD.');
      if ((row.off_to || row.nghi_den) && !offTo) throw new Error('Dòng ' + (index + 2) + ': ngày kết thúc nghỉ phải có dạng YYYY-MM-DD.');
      if (offFrom && offTo && offFrom > offTo) throw new Error('Dòng ' + (index + 2) + ': ngày kết thúc nghỉ không được trước ngày bắt đầu.');
      var replacementId = String(row.replacement_user_id || row.nguoi_thay || (found && found.replacement_user_id) || '').trim();
      if (replacementId) {
        if (replacementId === id) throw new Error('Dòng ' + (index + 2) + ': cán bộ thay thế không được là chính tài khoản đang sửa.');
      }
      var email = validateEmail_(row.notification_email || row.email || row.email_cong_vu || (found && found.email) || '');
      if (email && seenEmails[email] && seenEmails[email] !== id) throw new Error('Email bị trùng trong file: ' + email);
      if (email) {
        var sameEmail = existing.filter(function (x) {
          return String(x.email || '').trim().toLowerCase() === email && x.user_id !== id;
        });
        if (sameEmail.length) throw new Error('Dòng ' + (index + 2) + ': email đã được cấp cho tài khoản khác.');
        seenEmails[email] = id;
      }
      var linkedEmail = validateEmail_(row.linked_email || row.email_lien_ket || row.google_email ||
        (found && (found.linked_email || found.email)) || email || '');
      if (linkedEmail && seenLinkedEmails[linkedEmail] && seenLinkedEmails[linkedEmail] !== id) {
        throw new Error('Email liên kết bị trùng trong file: ' + linkedEmail);
      }
      if (linkedEmail) {
        var sameLinkedEmail = existing.filter(function (x) {
          return String(x.linked_email || x.email || '').trim().toLowerCase() === linkedEmail && x.user_id !== id;
        });
        if (sameLinkedEmail.length) throw new Error('Dòng ' + (index + 2) + ': email liên kết đã được cấp cho tài khoản khác.');
        seenLinkedEmails[linkedEmail] = id;
      }
      var phone = row.user_phone || row.phone || row.so_dien_thoai || row.zalo_phone;
      var data = {
        user_id: id, full_name: name, email: email, linked_email: linkedEmail,
        login_code: code, auth_group: role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL',
        unit_id: unit, role: role, sort_order: Number(row.sort_order || row.thu_tu || (found && found.sort_order) || 9999),
        source_tab: String(row.source_tab || (found && found.source_tab) || 'Import CSV/TSV'), is_active: isActive,
        zalo_name: optional(row, 'zalo_name', found, 'zalo_name'),
        zalo_phone: validatePhone_(phone === undefined || String(phone).trim() === '' ?
          String(found && found.zalo_phone || '') : String(phone).trim()),
        receive_completion_email:role === 'PHONG_PGD' && importFlag(row.receive_completion_email, truthy_(found && found.receive_completion_email), index, 'receive_completion_email'),
        telegram_chat_id: optional(row, 'telegram_chat_id', found, 'telegram_chat_id'), availability_status: availability,
        off_from: offFrom, off_to: offTo, off_reason: String(row.off_reason || row.ly_do_nghi || (found && found.off_reason) || '').trim(),
        replacement_user_id: replacementId
      };
      if (data.receive_completion_email && !email) throw new Error('Dòng '+(index+2)+': nhập email cán bộ để nhận email hoàn thành của đơn vị.');
      if (!isFinite(data.sort_order) || data.sort_order < 0 || Math.floor(data.sort_order) !== data.sort_order) throw new Error('Dòng ' + (index + 2) + ': sort_order phải là số nguyên không âm.');
      if (row.password || row.mat_khau) {
        data.password_hash = passwordHash_(row.password || row.mat_khau);
        data.must_change_password = true;
      }
      plan.push({rowNumber:index+2,data:data,previous:found || null});
    });

    // Kiểm tra chéo trên trạng thái sau import trước khi ghi bất kỳ dòng nào.
    // Một lỗi ở dòng cuối vì thế không để lại nửa file đã cập nhật trong Sheet.
    plan.forEach(function (entry) { plannedById[entry.data.user_id] = entry.data; });
    plan.forEach(function (entry) {
      var data = entry.data, previous = entry.previous;
      if (data.replacement_user_id) {
        var replacement = plannedById[data.replacement_user_id] || byId[data.replacement_user_id];
        if (!replacement || String(replacement.role || '').trim().toUpperCase() !== 'CAN_BO_LS' || !truthy_(replacement.is_active)) {
          throw new Error('Dòng ' + entry.rowNumber + ': cán bộ thay thế phải là cán bộ LS đang hoạt động sau khi nhập file.');
        }
      }
      if (previous && String(previous.role || '').trim().toUpperCase() === 'CAN_BO_LS' &&
          (data.role !== 'CAN_BO_LS' || !data.is_active)) {
        var openItems = t.rows('WorkItems').filter(function (item) {
          return item.assigned_user_id === data.user_id && OPEN_STATUS.indexOf(item.status) !== -1 && !item.carried_to_item_id;
        });
        if (openItems.length && !data.replacement_user_id) {
          throw new Error('Dòng ' + entry.rowNumber + ': còn ' + openItems.length + ' việc đang mở; chọn cán bộ thay thế trước khi đổi vai trò hoặc khóa.');
        }
        entry.openItems = openItems;
      }
    });
    var activeAdminsBefore = existing.some(function (x) { return String(x.role || '').trim().toUpperCase() === 'ADMIN' && truthy_(x.is_active); });
    var finalUsers = {};
    existing.forEach(function (x) { finalUsers[x.user_id] = plannedById[x.user_id] || x; });
    plan.forEach(function (x) { finalUsers[x.data.user_id] = x.data; });
    var activeAdminsAfter = Object.keys(finalUsers).some(function (id) { var x=finalUsers[id];return String(x.role || '').trim().toUpperCase() === 'ADMIN' && truthy_(x.is_active); });
    if (activeAdminsBefore && !activeAdminsAfter) throw new Error('File không thể khóa hoặc đổi vai trò tài khoản quản trị đang hoạt động cuối cùng.');

    var created = 0, updated = 0;
    plan.forEach(function (entry) {
      var foundRow = t.find('Users', 'user_id', entry.data.user_id);
      if (foundRow) { t.write(foundRow, entry.data); updated += 1; }
      else { t.append('Users', entry.data); created += 1; }
    });
    plan.forEach(function (entry) {
      if (entry.openItems && entry.openItems.length) handoverOpenWork_(t, entry.data.user_id,
        entry.data.replacement_user_id, u.user_id, entry.openItems,
        'Bàn giao do import đổi vai trò hoặc khóa tài khoản ' + entry.data.user_id + '.');
    });
    logConfig_(t, u, 'Người dùng', 'Nhập ' + rows.length + ' dòng CSV/TSV: thêm ' + created + ', cập nhật ' + updated + '.');
    return { ok: true, created: created, updated: updated };
  });
  return result;
}

function adminSaveSettings(values) {
  var u = requireAdmin_();
  var allowed = ['bank_name', 'hotline', 'app_url', 'timezone', 'week_start', 'retention_months', 'export_row_limit', 'backlog_alert', 'env',
    'retention_outbox_days', 'retention_idem_days', 'retention_inbox_read_days',
    'work_days', 'work_open', 'work_close', 'work_break', 'holidays', 'sign_place', 'sign_map_url', 'brand_color', 'logo_url', 'email_banner_url', 'gateway_url', 'gateway_auth_ref'];
  return DataRepository.tx(function (t) {
    var calendarKeys=['work_days','work_open','work_close','work_break','holidays'];
    if(calendarKeys.some(function(key){return values[key]!==undefined;})) {
      var current=timingCalendar_(t), breakValue=values.work_break===undefined?
        current.breakFrom+'-'+current.breakTo:String(values.work_break), breakParts=breakValue.split('-');
      if(breakParts.length!==2)throw new Error('Khoảng nghỉ phải có dạng giờ bắt đầu-giờ kết thúc.');
      var dayValue=values.work_days===undefined?current.days.join(','):String(values.work_days);
      var holidayValue=values.holidays===undefined?current.holidays.join(','):String(values.holidays);
      var candidate={days:dayValue?dayValue.split(',').map(function(day){return Number(day);}):[],
        open:values.work_open===undefined?current.open:String(values.work_open),
        close:values.work_close===undefined?current.close:String(values.work_close),
        breakFrom:breakParts[0],breakTo:breakParts[1],
        holidays:holidayValue?holidayValue.split(',').map(function(day){return day.trim();}).filter(Boolean):[]};
      var calendarErrors=LSTiming.calendarIssues(candidate);
      if(calendarErrors.length)throw new Error(calendarErrors.join(' '));
    }
    allowed.forEach(function (key) {
      if (values[key] === undefined) return;
      var found = t.find('Settings', 'key', key);
      var fields = { value: String(values[key]), updated_at: stamp_() };
      if (found) t.write(found, fields);
      else t.append('Settings', { key: key, value: fields.value, description: '', updated_at: fields.updated_at });
    });
    logConfig_(t, u, 'Cấu hình chung', 'Cập nhật cấu hình tổ chức và báo cáo.');
    return { ok: true };
  });
}

/** Phát hành hoặc gỡ thông báo cập nhật GAS cho mọi tài khoản. */
function adminSaveUpdateNotice(input) {
  var u = requireAdmin_();
  input = input || {};
  var version = String(input.version || '').trim();
  var message = String(input.message || '').trim();
  var displayLimit = input.display_limit == null || input.display_limit === '' ? 3 : Number(input.display_limit);
  var clearing = input.active === false;
  if (!clearing) {
    if (!version) throw new Error('Nhập mã phiên bản GAS cần thông báo.');
    if (version.length > 60) throw new Error('Mã phiên bản tối đa 60 ký tự.');
    if (message.length > 800) throw new Error('Nội dung thông báo tối đa 800 ký tự.');
    if (!isFinite(displayLimit) || displayLimit < 1 || displayLimit > 3 || Math.floor(displayLimit) !== displayLimit)
      throw new Error('Số lần hiển thị phải là số nguyên từ 1 đến 3.');
  }

  var published = clearing ? null : {
    id: id_('UPD'), version: version, message: message, display_limit: displayLimit,
    published_at: stamp_(), published_by: u.user_id
  };
  return DataRepository.tx(function (t) {
    var found = t.find('Settings', 'key', 'update_notice_json');
    var fields = { value: published ? JSON.stringify(published) : '', updated_at: stamp_() };
    if (found) t.write(found, fields);
    else t.append('Settings', { key: 'update_notice_json', value: fields.value,
      description: 'Thông báo phiên bản GAS cho người dùng', updated_at: fields.updated_at });
    logConfig_(t, u, 'Thông báo phiên bản', clearing
      ? 'Gỡ thông báo cập nhật GAS.'
      : 'Phát thông báo cập nhật GAS ' + version + ' tới toàn bộ người dùng, tối đa ' + displayLimit + ' lần mỗi tài khoản.');
    return { ok: true, updateNotice: published };
  });
}

/** Các dòng của bảng Kết quả thực hiện được giao kế hoạch ngày; khớp DAILY_ROWS (bỏ dòng tiêu đề) ở js/domain.js. */
var DAILY_PLAN_KEYS_ = ['HD_THE_CHAP', 'HD_TIN_DUNG', 'NHAP_KHO', 'XUAT_KHO', 'RLOS', 'TON_THE_CHAP', 'TON_TIN_DUNG', 'KHAC'];
/** Dòng đã bỏ khỏi bảng ngày (cầm cố, TSBĐ, giải ngân TP): màn hình bản cũ còn gửi thì bỏ qua. */
var DAILY_PLAN_LEGACY_KEYS_ = ['HD_CAM_CO', 'TSBD', 'GIAI_NGAN', 'TON_CAM_CO'];

/**
 * Kiểm soát / Quản lý LS giao kế hoạch ngày và chỉ tiêu tháng. Quản trị chỉ giữ cấu hình hệ thống,
 * không còn sửa kế hoạch trong Cấu hình chung (tránh hai nơi ghi đè nhau); Admin vẫn gọi được hàm này.
 */
function saveWorkPlan(values) {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) throw new Error('Chỉ Kiểm soát LS hoặc Quản lý LS được giao kế hoạch.');
  values = values || {};
  var raw = values.daily_plan && typeof values.daily_plan === 'object' && !Array.isArray(values.daily_plan) ? values.daily_plan : {};
  Object.keys(raw).forEach(function (key) {
    if (DAILY_PLAN_KEYS_.indexOf(key) === -1 && DAILY_PLAN_LEGACY_KEYS_.indexOf(key) === -1) throw new Error('Dòng kế hoạch "' + key + '" không hợp lệ.');
  });
  function whole(value, label, max) {
    var n = Number(value || 0);
    if (!isFinite(n) || n < 0 || n > max || Math.floor(n) !== n) throw new Error(label + ' phải là số nguyên từ 0 đến ' + max + '.');
    return n;
  }
  var plan = {};
  DAILY_PLAN_KEYS_.forEach(function (key) {
    var n = whole(raw[key], 'Kế hoạch ngày "' + key + '"', 100000);
    if (n > 0) plan[key] = n;
  });
  var settings = { daily_plan_json: JSON.stringify(plan) };
  ['target_done_month', 'target_done_staff_month'].forEach(function (key) {
    settings[key] = String(whole(values[key], 'Chỉ tiêu hoàn thành', 1000000));
  });
  return DataRepository.tx(function (t) {
    Object.keys(settings).forEach(function (key) {
      var found = t.find('Settings', 'key', key);
      var fields = { value: settings[key], updated_at: stamp_() };
      if (found) t.write(found, fields);
      else t.append('Settings', { key: key, value: fields.value, description: 'Kế hoạch do KS/QL LS giao', updated_at: fields.updated_at });
    });
    logConfig_(t, u, 'Kế hoạch', 'Giao kế hoạch ngày cho ' + Object.keys(plan).length + ' dòng; chỉ tiêu tháng toàn LS ' +
      settings.target_done_month + ', mỗi cán bộ ' + settings.target_done_staff_month + '.');
    return { ok: true, daily_plan_json: settings.daily_plan_json, target_done_month: settings.target_done_month,
      target_done_staff_month: settings.target_done_staff_month };
  });
}

function staffPlanFromRow_(r) {
  return {plan_id:r.plan_id,key:r.plan_id,type:r.period_type,start:String(r.start_date).slice(0,10),end:String(r.end_date).slice(0,10),
    status:r.status,version:Number(r.version),lines:JSON.parse(r.lines_json || '[]'),snapshot:JSON.parse(r.snapshot_json || 'null'),
    assigned_by:r.assigned_by,assigned_at:r.assigned_at,updated_at:r.updated_at};
}
function staffPlansForUser_(u) {
  if(['KS_LS','QUAN_LY_LS','ADMIN','CAN_BO_LS'].indexOf(u.role)===-1)return [];
  return DataRepository.getAll('StaffPlans').map(staffPlanFromRow_).map(function(p){
    if(u.role==='CAN_BO_LS') {
      p.lines=p.lines.filter(function(l){return l.user_id===u.user_id;});
      if(p.snapshot)p.snapshot=Object.assign({},p.snapshot,{rows:p.snapshot.rows.filter(function(r){return r.user_id===u.user_id;})});
    }
    return p;
  });
}
function staffPlanningActor_(write) {
  var u=requireActor_(),roles=write?['KS_LS','QUAN_LY_LS','ADMIN']:['KS_LS','QUAN_LY_LS','ADMIN','CAN_BO_LS'];
  if(roles.indexOf(u.role)===-1)throw new Error('Chỉ Kiểm soát LS hoặc Quản lý LS có quyền giao kế hoạch; cán bộ LS chỉ xem kế hoạch của mình.');
  return u;
}
function staffPlanningContext_(source) {
  var read=function(n){return source.rows?source.rows(n):source.getAll(n);},settings={};
  read('Settings').forEach(function(s){settings[s.key]=s.value;});
  var users=read('Users').map(function(u){return {user_id:u.user_id,full_name:u.full_name,role:u.role,active:truthy_(u.is_active),
    availability_status:u.availability_status,off_from:u.off_from,off_to:u.off_to};});
  var types=read('WorkTypes').map(function(w){return {code:w.type_code,group:w.group_name,name:w.display_name};});
  var items=read('WorkItems');
  if(source.tailWhere)items=projectAppointmentDraftCredits_(items,read('WorkTypes'),source);
  var exempt=slaExemptByItem_(items,read('WorkTypes'));
  items=items.map(function(i){return Object.assign({},i,{sla_exempt:!!exempt[i.item_id]});});
  return LSPlanning.context({users:users,items:items,workTypes:types,staffPlans:read('StaffPlans').map(staffPlanFromRow_),
    calendar:{days:settings.work_days?String(settings.work_days).split(',').map(Number):[1,2,3,4,5],
      holidays:String(settings.holidays || '').split(',').map(function(d){return d.trim();}).filter(Boolean)}},LSPlanResults,stamp_());
}
function getWorkPlanning(type,onDate) {
  var u=staffPlanningActor_(false),p=LSPlanning.period(type || 'week',onDate || LSPlanning.date(stamp_()));
  var c=staffPlanningContext_(DataRepository),plans=c.plans;
  var history=DataRepository.getAll('StaffPlanHistory').filter(function(r){return r.plan_id===p.key;}).slice(-30).map(function(r){
    return {version:Number(r.version),action:r.action,by:r.by,at:r.at};
  });
  if(u.role==='CAN_BO_LS') {
    c.users=c.users.filter(function(x){return x.user_id===u.user_id;});
    c.historicalUsers=c.historicalUsers.filter(function(x){return x.user_id===u.user_id;});
    c.events=c.events.filter(function(x){return x.user_id===u.user_id;});
    c.outcomes=c.outcomes.filter(function(x){return x.user_id===u.user_id;});c.intakes=c.intakes.filter(function(x){return x.user_id===u.user_id;});
    var own={};own[u.user_id]=c.loads[u.user_id];c.loads=own;
    plans=plans.map(function(q){var out=Object.assign({},q);out.lines=q.lines.filter(function(l){return l.user_id===u.user_id;});
      if(q.snapshot){out.snapshot=Object.assign({},q.snapshot,{rows:q.snapshot.rows.filter(function(r){return r.user_id===u.user_id;})});}return out;});
  }
  return {context:{today:c.today,users:c.users,historicalUsers:c.historicalUsers,events:c.events,outcomes:c.outcomes,intakes:c.intakes,loads:c.loads,calendar:c.calendar,plans:plans},plans:plans,history:history,period:p};
}
function saveStaffPlan(values) {
  var u=staffPlanningActor_(true);values=values || {};
  var p=LSPlanning.period(values.type,values.date),lines=values.lines;
  if(!Array.isArray(lines) || !lines.length || lines.length>80 || JSON.stringify(lines).length>35000)throw new Error('Danh sách cán bộ không hợp lệ (tối đa 80 cán bộ mỗi kỳ).');
  if(!Number.isInteger(values.expected_version) || values.expected_version<0)throw new Error('Thiếu phiên bản kế hoạch.');
  return DataRepository.tx(function(t){
    var found=t.find('StaffPlans','plan_id',p.key),old=found?staffPlanFromRow_(found.object):null,seen={};
    if(old && old.status==='CLOSED')throw new Error('Kỳ đã chốt, không thể sửa kế hoạch.');
    if((old?old.version:0)!==values.expected_version)throw new Error('Kế hoạch đã thay đổi. Tải lại phiên bản mới trước khi giao.');
    var clean=lines.map(function(l){
      var user=t.find('Users','user_id',l.user_id);
      if(!user || user.object.role!=='CAN_BO_LS' || !truthy_(user.object.is_active))throw new Error('Cán bộ nhận kế hoạch không hợp lệ.');
      if(seen[l.user_id])throw new Error('Cán bộ bị trùng trong kế hoạch.');seen[l.user_id]=true;
      var targets={};Object.keys(l.targets || {}).forEach(function(k){
        var n=l.targets[k];if(LSPlanning.KEYS.indexOf(k)===-1 || !Number.isInteger(n) || n<0 || n>1000000)throw new Error('Chỉ tiêu phải là số nguyên không âm hợp lệ.');targets[k]=n;
      });return {user_id:l.user_id,targets:targets};
    });
    var now=stamp_(),out={plan_id:p.key,key:p.key,type:p.type,start:p.start,end:p.end,status:'PUBLISHED',version:values.expected_version+1,
      lines:clean,snapshot:null,assigned_by:u.user_id,assigned_at:now,updated_at:now};
    var peers=t.rows('StaffPlans').filter(function(q){return q.plan_id!==p.key;}).map(staffPlanFromRow_);
    var issues=LSPlanning.hierarchyIssues(peers.concat([out]),staffPlanningCalendar_(t));
    if(issues.length)throw new Error(issues[0]);
    var fields={plan_id:p.key,period_type:p.type,start_date:p.start,end_date:p.end,status:out.status,version:out.version,lines_json:JSON.stringify(clean),
      snapshot_json:'',assigned_by:u.user_id,assigned_at:now,updated_at:now};
    if(found)t.write(found,fields);else t.append('StaffPlans',fields);
    t.append('StaffPlanHistory',{history_id:id_('SPH'),plan_id:p.key,version:out.version,action:'PUBLISH',by:u.user_id,at:now,plan_json:JSON.stringify(out)});
    logConfig_(t,u,'Kế hoạch cán bộ',p.key+' · '+clean.length+' cán bộ · phiên bản '+out.version);
    return out;
  });
}
function staffPlanningCalendar_(source) {
  var settings={};source.rows('Settings').forEach(function(s){settings[s.key]=s.value;});
  return {days:settings.work_days?String(settings.work_days).split(',').map(Number):[1,2,3,4,5],holidays:String(settings.holidays || '').split(',').filter(Boolean)};
}
function closeStaffPlan(planId,version) {
  var u=staffPlanningActor_(true);
  return closeStaffPlanAs_(planId,version,u);
}
function closeStaffPlanAs_(planId,version,u) {
  return DataRepository.tx(function(t){
    var found=t.find('StaffPlans','plan_id',String(planId));if(!found)throw new Error('Không có kế hoạch để chốt.');
    var plan=staffPlanFromRow_(found.object),today=LSPlanning.date(stamp_());
    if(plan.version!==version)throw new Error('Kế hoạch đã thay đổi phiên bản.');
    if(plan.status==='CLOSED')return plan;
    if(plan.end>=today)throw new Error('Chỉ chốt khi kỳ đã kết thúc.');
    var c=staffPlanningContext_(t),snapshot=LSPlanning.evaluate(c,plan,c.plans);
    // Kỳ cũ thiếu ảnh chụp tồn sẽ để trống, không lấy tồn hiện tại giả làm tồn cuối kỳ.
    if(today===LSPlanning.add(plan.end,1))snapshot.rows.forEach(function(r){var l=c.loads[r.user_id];r.backlog=l.backlog;r.open=l.open;r.late=l.late;r.backlog_as_of=today;});
    plan.status='CLOSED';plan.snapshot=snapshot;plan.version++;plan.updated_at=stamp_();
    if(JSON.stringify(plan).length>45000)throw new Error('Số liệu chốt vượt giới hạn lưu trữ của một kỳ.');
    t.write(found,{status:'CLOSED',snapshot_json:JSON.stringify(snapshot),version:plan.version,updated_at:plan.updated_at});
    t.append('StaffPlanHistory',{history_id:id_('SPH'),plan_id:planId,version:plan.version,action:'CLOSE',by:u.user_id,at:plan.updated_at,plan_json:JSON.stringify(plan)});
    return plan;
  });
}
function closeEndedStaffPlans_() {
  var today=LSPlanning.date(stamp_()),closed=0;
  DataRepository.getAll('StaffPlans').filter(function(p){return p.status!=='CLOSED' && String(p.end_date).slice(0,10)<today;}).forEach(function(p){
    closeStaffPlanAs_(p.plan_id,Number(p.version),{user_id:'SYSTEM',role:'ADMIN'});closed++;
  });return {closed:closed};
}

/** KS/QL LS cấu hình khoảng nghỉ phép của cán bộ; dùng các cột Users đã có. */
function saveStaffAbsence(userId, values) {
  var actor = requireActor_();
  var targetId = String(userId || '').trim();
  if (!targetId) throw new Error('Chọn cán bộ LS cần cấu hình nghỉ phép.');
  var ownAbsence = actor.role === 'CAN_BO_LS' && targetId === String(actor.user_id || '');
  if (!ownAbsence && ['KS_LS', 'QUAN_LY_LS'].indexOf(actor.role) === -1) {
    throw new Error('Cán bộ LS chỉ được tự khai báo nghỉ phép cho chính mình.');
  }
  values = values || {};
  function strictDate(value, label) {
    var text = String(value || '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(label + ' phải có dạng YYYY-MM-DD.');
    var date = new Date(text + 'T00:00:00Z');
    if (!isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(label + ' không hợp lệ.');
    return text;
  }
  var from = strictDate(values.off_from, 'Ngày bắt đầu nghỉ');
  var to = strictDate(values.off_to, 'Ngày kết thúc nghỉ');
  if (!!from !== !!to) throw new Error('Nhập đủ ngày bắt đầu và ngày kết thúc, hoặc xóa cả hai để gỡ lịch nghỉ.');
  if (from && from > to) throw new Error('Ngày kết thúc nghỉ không được trước ngày bắt đầu.');
  var reason = String(values.off_reason || '').trim();
  if (reason.length > 160) throw new Error('Lý do nghỉ tối đa 160 ký tự.');

  return DataRepository.tx(function (t) {
    var target = t.find('Users', 'user_id', targetId);
    if (!target || String(target.object.role || '').trim().toUpperCase() !== 'CAN_BO_LS' || !truthy_(target.object.is_active)) {
      throw new Error('Chỉ cấu hình được cán bộ LS đang hoạt động.');
    }
    var previousFrom = String(target.object.off_from || ''), previousTo = String(target.object.off_to || '');
    var datesChanged = previousFrom !== from || previousTo !== to;
    var fields = { availability_status: from ? 'OFF' : 'AVAILABLE', off_from: from, off_to: to,
      off_reason: from ? reason : '', updated_at: stamp_() };
    t.write(target, fields);
    if (ownAbsence && datesChanged) {
      var name = target.object.full_name || targetId;
      var detail = from
        ? 'LS ' + name + ' tự khai nghỉ từ ' + from + ' đến ' + to + '. Hệ thống chặn phân công mới; việc đang giao giữ nguyên và SLA tiếp tục tính. Vui lòng xem việc đang mở để phân giao lại khi cần.'
        : 'LS ' + name + ' đã gỡ lịch nghỉ' + (previousFrom && previousTo ? ' (trước đó ' + previousFrom + ' đến ' + previousTo + ')' : '') + '. Việc đang giao giữ nguyên trạng thái.';
      DataRepository.getAll('Users').filter(function (user) {
        return ['KS_LS', 'QUAN_LY_LS'].indexOf(String(user.role || '').trim().toUpperCase()) !== -1 && truthy_(user.is_active);
      }).forEach(function (leader) {
        inboxNotify_(t, leader.user_id, '', 'NGHI_PHEP_LS', detail, targetId);
      });
    }
    logConfig_(t, actor, ownAbsence ? 'Tự khai nghỉ phép' : 'Nghỉ phép cán bộ LS', (target.object.full_name || targetId) + ': ' +
      (from ? from + ' đến ' + to + (reason ? ' · ' + reason : '') : 'đã gỡ lịch nghỉ') + '.');
    return { ok: true, user_id: targetId, full_name: target.object.full_name || targetId,
      availability_status: fields.availability_status, off_from: from, off_to: to, off_reason: fields.off_reason };
  }, { append: ['Inbox'] });
}

/* Biến bị cấm theo kênh — cùng một bảng với Notifications.gs và js/domain.js. */
var FORBIDDEN_VARS = {
  GMF: ['ten_khach', 'cif', 'san_pham', 'so_tien', 'so_dien_thoai'],
  ZBS: ['cif', 'san_pham', 'so_tien'],
  SMS: ['cif', 'san_pham', 'so_tien'],
  TELEGRAM: ['cif', 'san_pham', 'so_tien'],
  EMAIL: ['cif', 'so_tien'],
  IN_APP: []
};

var TEMPLATE_CHANNELS = ['IN_APP', 'EMAIL', 'ZBS', 'SMS', 'GMF', 'TELEGRAM'];
var TEMPLATE_STATUS = ['NHAP', 'CHO_DUYET', 'DA_DUYET', 'TU_CHOI'];
var CHANNEL_STATUS_VALUES = ['CHUA_KICH_HOAT', 'THU_NGHIEM', 'HOAT_DONG', 'TAM_NGUNG'];

function checkTemplateBody_(channel, body) {
  var banned = FORBIDDEN_VARS[channel] || [];
  var re = /\{\{\s*([a-z_]+)\s*\}\}/g, m;
  while ((m = re.exec(String(body || '')))) {
    if (banned.indexOf(m[1]) !== -1) {
      return 'Kênh ' + channel + ' không được chứa biến {{' + m[1] + '}}.';
    }
  }
  if (!String(body || '').trim()) return 'Nội dung mẫu đang trống.';
  if (String(body || '').length > 600) return 'Nội dung quá dài (tối đa 600 ký tự).';
  return '';
}

/**
 * Lưu cấu hình gửi tin. Chỉ nhận đúng các cột của bảng: nhận nguyên object từ
 * trình duyệt nghĩa là luật duyệt mẫu và luật biến cấm chỉ tồn tại ở client.
 */
function adminSaveDelivery(kind, code, data) {
  var u = requireAdmin_();
  var spec = {
    channel: { table: 'Channels', key: 'code', area: 'Kênh gửi tin',
      columns: ['status', 'test_mode', 'allowlist', 'rate_per_hour', 'max_retry', 'config_json', 'updated_at'] },
    template: { table: 'Templates', key: 'code', area: 'Mẫu tin',
      columns: ['name', 'channel', 'status', 'subject', 'body', 'approved_by', 'approved_at'] },
    rule: { table: 'NotifyRules', key: 'rule_id', area: 'Quy tắc thông báo',
      columns: ['channels', 'template_code', 'enabled', 'needs_confirm', 'throttle_minutes', 'when_case'] }
  }[kind];
  if (!spec || !code || !data) throw new Error('Dữ liệu kênh gửi không hợp lệ.');

  var fields = {};
  spec.columns.forEach(function (key) {
    if (data[key] !== undefined) fields[key] = data[key];
  });
  if (!Object.keys(fields).length) throw new Error('Không có trường nào hợp lệ để lưu.');

  if (kind === 'channel' && fields.status !== undefined && CHANNEL_STATUS_VALUES.indexOf(String(fields.status)) === -1) {
    throw new Error('Trạng thái kênh không hợp lệ.');
  }
  if (kind === 'channel') {
    if (fields.rate_per_hour !== undefined) {
      var rate = Number(fields.rate_per_hour);
      if (!isFinite(rate) || rate < 0 || rate > 100000) throw new Error('Giới hạn gửi mỗi giờ phải từ 0 đến 100.000.');
      fields.rate_per_hour = Math.floor(rate);
    }
    if (fields.max_retry !== undefined) {
      var retries = Number(fields.max_retry);
      if (!isFinite(retries) || retries < 0 || retries > 10) throw new Error('Số lần thử lại phải từ 0 đến 10.');
      fields.max_retry = Math.floor(retries);
    }
  }
  if (kind === 'rule' && fields.throttle_minutes !== undefined) {
    var throttle = Number(fields.throttle_minutes);
    if (!isFinite(throttle) || throttle < 0 || throttle > 10080) throw new Error('Thời gian nhắc lại phải từ 0 đến 10.080 phút.');
    fields.throttle_minutes = Math.floor(throttle);
  }

  return DataRepository.tx(function (t) {
    var found = t.find(spec.table, spec.key, code);

    if (kind === 'template') {
      var before = found ? found.object : null;
      var channel = String(fields.channel !== undefined ? fields.channel : (before ? before.channel : ''));
      if (TEMPLATE_CHANNELS.indexOf(channel) === -1) throw new Error('Kênh của mẫu không hợp lệ.');
      var body = fields.body !== undefined ? fields.body : (before ? before.body : '');
      var bad = checkTemplateBody_(channel, body);
      if (bad) throw new Error(bad);
      if (fields.status !== undefined && TEMPLATE_STATUS.indexOf(String(fields.status)) === -1) {
        throw new Error('Trạng thái mẫu không hợp lệ.');
      }
      // Sửa nội dung là mất hiệu lực duyệt cũ. Luật này phải nằm ở máy chủ, nếu
      // không thì một lần gọi API là đủ để đẩy nội dung mới vào mẫu "đã duyệt".
      var changed = before && (String(before.body) !== String(body) || String(before.channel) !== channel);
      if (changed && String(fields.status || before.status) === 'DA_DUYET' && String(before.status) === 'DA_DUYET') {
        fields.status = 'CHO_DUYET';
        fields.approved_by = '';
        fields.approved_at = '';
      }
      if (String(fields.status) === 'DA_DUYET') {
        fields.approved_by = u.user_id;
        fields.approved_at = stamp_();
      }
    }

    if (kind === 'rule' && fields.template_code !== undefined) {
      String(fields.template_code).split(',').map(function (x) { return x.trim(); }).filter(Boolean)
        .forEach(function (tplCode) {
          if (!t.find('Templates', 'code', tplCode)) throw new Error('Mẫu ' + tplCode + ' chưa tồn tại.');
        });
    }

    if (!found) {
      if (kind !== 'template') throw new Error('Không tìm thấy cấu hình ' + code + '.');
      fields[spec.key] = code;
      if (fields.status === undefined) fields.status = 'CHO_DUYET';
      t.append(spec.table, fields);
    } else t.write(found, fields);

    logConfig_(t, u, spec.area, (found ? 'Cập nhật ' : 'Thêm ') + code + '.');
    return { ok: true };
  });
}

function adminRunOutbox() {
  requireAdmin_();
  return Notifications.runOutbox(20);
}

/**
 * Xác nhận, gửi lại hoặc hủy một tin.
 *
 * Xác nhận tin gửi khách là trách nhiệm của người phụ trách việc, không phải của
 * quản trị: quản trị không được xem nội dung gửi khách nên bấm xác nhận cũng là
 * bấm mù. Quản trị vẫn xử lý được tin nội bộ và vẫn hủy được mọi tin.
 */
function changeOutbox(outboxId, action) {
  var u = requireActor_();
  if (['RETRY', 'CONFIRM', 'CANCEL'].indexOf(action) === -1) throw new Error('Thao tác hàng đợi không hợp lệ.');

  return DataRepository.tx(function (t) {
    var found = t.find('NotificationOutbox', 'outbox_id', outboxId);
    if (!found) throw new Error('Không tìm thấy tin trong hàng đợi.');
    var row = found.object;

    var item = row.item_id ? t.find('WorkItems', 'item_id', row.item_id) : null;
    var owner = item ? item.object.assigned_user_id : '';

    if (u.role === 'ADMIN') {
      if (action === 'CONFIRM' && String(row.recipient_kind) === 'KHACH') {
        throw new Error('Tin gửi khách phải do cán bộ phụ trách hoặc kiểm soát xác nhận.');
      }
    } else if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1) {
      // kiểm soát và quản lý LS xử lý được mọi tin của việc trong phạm vi
    } else if (u.role === 'CAN_BO_LS') {
      if (!item || owner !== u.user_id) throw new Error('Chỉ người được giao mới xử lý tin của việc này.');
    } else {
      throw new Error('Vai trò ' + u.role + ' không được thao tác hàng đợi gửi tin.');
    }

    if (action !== 'CANCEL' && ['CHO_XAC_NHAN', 'THAT_BAI', 'KHONG_GUI'].indexOf(String(row.status)) === -1) {
      throw new Error('Tin đang ở trạng thái ' + row.status + ', không cần thao tác này.');
    }

    var update = action === 'CANCEL'
      ? { status: 'DA_HUY', note: 'Hủy bởi ' + u.full_name, next_try_at: '', claim_token: '', claim_until: '' }
      : { status: 'CHO_GUI', next_try_at: '', retry_count: action === 'RETRY' ? 0 : Number(row.retry_count || 0),
        note: action === 'CONFIRM' ? 'Đã xác nhận bởi ' + u.full_name : 'Gửi lại bởi ' + u.full_name };
    t.write(found, update);
    Notifications.recordMetricStatus(t, row, action === 'CANCEL' ? 'CANCELLED' : 'QUEUED');
    t.append('Events', {
      event_id: id_('EVT'), item_id: row.item_id || '', type: 'GUI_TIN', by: u.user_id, at: stamp_(),
      reason: action + ' tin ' + outboxId + '.', before_json: JSON.stringify({ status: row.status }),
      after_json: JSON.stringify({ status: update.status })
    });
    return { ok: true };
  });
}

/** Giữ tên cũ cho các bản build đã phát hành. */
function adminChangeOutbox(outboxId, action) { return changeOutbox(outboxId, action); }

/** Gửi một tin kiểm thử tới chính người quản trị để xác nhận cấu hình chạy được. */
function adminTestChannel(code, recipient) {
  var u = requireAdmin_();
  var to = String(recipient || '').trim();
  if (!to) throw new Error('Nhập địa chỉ nhận tin thử.');
  var id = DataRepository.tx(function (t) {
    var outboxId = Notifications.queueTest(t, code, to, u.full_name);
    logConfig_(t, u, 'Kênh gửi tin', 'Gửi thử qua ' + code + '.');
    return outboxId;
  });
  var run = Notifications.runOutbox(5);
  var row = DataRepository.find('NotificationOutbox', 'outbox_id', id);
  return { ok: true, outbox_id: id, status: row ? row.status : '', note: row ? row.note : '', sent: run.sent };
}

/** Run once from the Apps Script editor to authorize MailApp without sending mail. */
function authorizeMailAppScope() {
  MailApp.getRemainingDailyQuota();
  Logger.log('MailApp authorization complete.');
  return { authorized: true };
}

/* ---------------------------- Thông báo trong app ---------------------------- */

/**
 * Đánh dấu đã đọc cho chính người đang đăng nhập. Nếu có `ids`, chỉ các thông
 * báo đó được đánh dấu; nếu không có thì đánh dấu tất cả thông báo chưa xem.
 * ID từ trình duyệt chỉ là bộ lọc, quyền sở hữu vẫn được kiểm ở máy chủ.
 */
function markInboxRead(ids) {
  var u = requireActor_();
  var markAll = !Array.isArray(ids);
  var wanted = {};
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    if (id) wanted[String(id)] = true;
  });
  return DataRepository.tx(function (t) {
    // Dùng chung một bộ đọc cờ với phần còn lại của hệ thống. So sánh chuỗi
    // 'true' phân biệt hoa thường, nên một cột nhập từ CSV thành "TRUE" sẽ mãi
    // được coi là chưa đọc và không bao giờ đánh dấu được.
    var rows = t.rows('Inbox').filter(function (n) {
      return n.user_id === u.user_id && !truthy_(n.is_read) &&
        (markAll || wanted[String(n.id)]);
    });
    rows.forEach(function (n) {
      var found = t.find('Inbox', 'id', n.id);
      if (found) t.write(found, { is_read: true });
    });
    return { ok: true, marked: rows.length };
  });
}
