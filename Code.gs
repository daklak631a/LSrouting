/**
 * Code.gs — API phía máy chủ.
 *
 * Nguyên tắc: quyền và luật chuyển trạng thái được kiểm tại đây.
 * Giao diện ẩn nút chỉ để đỡ rối mắt, không phải là kiểm soát.
 * Tên trường và mã trạng thái giữ đúng như js/app.js để hai bên không lệch nhau.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index.gas')
    .setTitle('LS-Routing — Hỗ trợ tín dụng LS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

var FLOW_SERVER = {
  CHO_TIEP_NHAN: {
    CHO_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    CAN_BO_SUNG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  CAN_BO_SUNG: {
    CHO_TIEP_NHAN: ['PHONG_PGD', 'KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS', 'PHONG_PGD']
  },
  CHO_PHAN_CONG: {
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    CAN_BO_SUNG: ['KS_LS', 'QUAN_LY_LS']
  },
  DA_PHAN_CONG: {
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  DANG_THUC_HIEN: {
    DA_SOAN_XONG: ['CAN_BO_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  DA_SOAN_XONG: {
    DANG_HEN_KH: ['CAN_BO_LS'],
    HOAN_THANH_LS: ['CAN_BO_LS'],
    CHO_KS_DUYET: ['CAN_BO_LS'],
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  DANG_HEN_KH: {
    HOAN_THANH_LS: ['CAN_BO_LS'],
    CHO_KS_DUYET: ['CAN_BO_LS'],
    DANG_THUC_HIEN: ['CAN_BO_LS'],
    TAM_DUNG: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  CHO_KS_DUYET: {
    HOAN_THANH_LS: ['KS_LS', 'QUAN_LY_LS'],
    DANG_THUC_HIEN: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  TAM_DUNG: {
    DANG_THUC_HIEN: ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'],
    DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS'],
    HUY: ['KS_LS', 'QUAN_LY_LS']
  },
  HOAN_THANH_LS: { DANG_THUC_HIEN: ['KS_LS', 'QUAN_LY_LS'] },
  HUY: {}
};

var OPEN_STATUS = ['CHO_TIEP_NHAN', 'CAN_BO_SUNG', 'CHO_PHAN_CONG', 'DA_PHAN_CONG',
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
var SLA_PAUSED_STATUS = ['TAM_DUNG', 'DANG_HEN_KH'];

/**
 * Bước chuyển bắt buộc lý do — khớp các bước có `reason` trong FLOW của
 * js/domain.js. Giao diện hỏi lý do chưa đủ: máy chủ phải chặn lời gọi thiếu.
 */
function reasonRequired_(from, to) {
  if (['CAN_BO_SUNG', 'HUY', 'TAM_DUNG', 'CHO_TIEP_NHAN'].indexOf(to) !== -1) return true;
  if (to === 'DA_PHAN_CONG') return ['CHO_TIEP_NHAN', 'CHO_PHAN_CONG'].indexOf(from) === -1; // đổi người
  if (to === 'DANG_THUC_HIEN') return from !== 'DA_PHAN_CONG'; // quay lại, trả lại, tiếp tục, mở lại
  return false;
}

/** Việc đang mở, có hạn, không ở trạng thái chờ bên ngoài và đã qua hạn. */
function isLateOpen_(item, nowMs) {
  return OPEN_STATUS.indexOf(item.status) !== -1 && SLA_PAUSED_STATUS.indexOf(item.status) === -1 &&
    !!item.due_at && nowMs > new Date(item.due_at).getTime();
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

function userAvailableForAssignment_(user, onDate) {
  return !!(user && String(user.role || '').trim().toUpperCase() === 'CAN_BO_LS' && truthy_(user.is_active) && !userOff_(user, onDate));
}

function authGroup_(user) {
  return String(user.auth_group || (user.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL')).toUpperCase();
}

function activeUserById_(id) {
  if (!id) return null;
  var found = DataRepository.find('Users', 'user_id', id);
  if (!found) return null;
  if (!truthy_(found.is_active)) throw new Error('Tài khoản đang bị khóa.');
  return found;
}

/**
 * GAS vẫn chạy trong tài khoản Google của người mở webapp, nhưng danh tính
 * nghiệp vụ được chọn bằng mã cán bộ sau khi authenticateUser() thành công.
 * UserProperties giữ lựa chọn này cho các lần gọi google.script.run tiếp theo.
 */
function currentUser_() {
  var selected = PropertiesService.getUserProperties().getProperty('LS_AUTH_USER_ID');
  var byCode = activeUserById_(selected);
  if (byCode) return byCode;

  var email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Hãy nhập mã cán bộ để đăng nhập.');
  var u = DataRepository.find('Users', 'email', email.toLowerCase());
  if (!u) throw new Error('Mã cán bộ chưa được cấp quyền vào hệ thống.');
  if (!truthy_(u.is_active)) throw new Error('Tài khoản đang bị khóa.');
  return u;
}

/**
 * Danh tính cho mọi thao tác ghi. Tài khoản còn mật khẩu tạm chỉ được đọc và đổi
 * mật khẩu; cho ghi tiếp nghĩa là cờ `must_change_password` không có tác dụng gì.
 */
function requireActor_() {
  var u = currentUser_();
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
  PropertiesService.getUserProperties().setProperty('LS_AUTH_USER_ID', String(user.user_id));
  return getBootstrap();
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
  PropertiesService.getUserProperties().deleteProperty('LS_AUTH_USER_ID');
  return { ok: true };
}

function stamp_() { return new Date().toISOString(); }

function id_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

/* ---------------------------- Kỳ kế hoạch tháng ---------------------------- */

function monthKey_(date) {
  var d = date ? new Date(date) : new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
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

/** Bảo đảm có đúng một kỳ ACTIVE; kỳ soạn sẵn chỉ được kích hoạt từ ngày đầu kỳ. */
function activateDueMonthlyPlans_() {
  var today = stamp_().substring(0, 10);
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

    var due = plans.filter(function (p) { return p.status === 'SCHEDULED' && String(p.activation_at || p.start_date) <= today; })
      .sort(function (a, b) { return String(a.activation_at).localeCompare(String(b.activation_at)); });
    due.forEach(function (next) {
      t.rows('MonthlyPlans').filter(function (p) { return p.status === 'ACTIVE' && p.period_id !== next.period_id; }).forEach(function (old) {
        handoffs.push({ from: old.period_id, to: next.period_id });
        var oldFound = t.find('MonthlyPlans', 'period_id', old.period_id);
        if (oldFound) t.write(oldFound, { status: 'ARCHIVED', archived_at: stamp_() });
      });
      var nextFound = t.find('MonthlyPlans', 'period_id', next.period_id);
      if (nextFound) t.write(nextFound, { status: 'ACTIVE', activated_at: stamp_() });
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
    if (active) return active.period_id;
    throw new Error('Không xác định được kỳ kế hoạch đang hoạt động.');
  });
  // Tạo kho Sheet có thể chậm và có thể hỏng. Để nó ném lỗi ra ngoài là chặn
  // luôn đường đăng nhập; lần chạy kế tiếp của trigger sẽ thử lại.
  created.forEach(function (periodId) {
    try { provisionMonthlyPlanWorkbook_(periodId); }
    catch (err) { Logger.log('Chưa tạo được kho kế hoạch ' + periodId + ': ' + err); }
  });
  handoffs.forEach(function (pair) {
    carryOpenWorkToPlan_(pair.from, pair.to, { user_id: 'SYSTEM', full_name: 'Hệ thống' });
    // Chốt số liệu kỳ vừa đóng *sau* khi chuyển tiếp, để `ton_cuoi_ky` phản ánh
    // đúng phần còn lại chứ không đếm cả việc vừa sang kỳ mới.
    try {
      writePeriodSummary_(pair.from);
      writeOperationalScoreSnapshot_(pair.from);
    }
    catch (err) { Logger.log('Chưa chốt được số liệu kỳ ' + pair.from + ': ' + err); }
    provisionMonthlyPlanWorkbook_(pair.to);
  });
  return DataRepository.find('MonthlyPlans', 'period_id', activeId);
}

function activePlan_() { return activateDueMonthlyPlans_(); }

/** Trigger-safe entry point: Apps Script gọi định kỳ để tự kích hoạt kỳ đến hạn. */
function activateMonthlyPlans() {
  return publicMonthlyPlan_(activateDueMonthlyPlans_());
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
 * Cấu hình này nằm ở tầng triển khai nên không đặt trong màn Quản trị và không
 * đòi đăng nhập ứng dụng: nó được gọi tay từ trình soạn thảo Apps Script, nơi
 * chưa có phiên đăng nhập nào. Quyền sửa dự án Apps Script chính là lớp chặn,
 * và nó chặt hơn vai trò trong app.
 */
function usePlanTemplate(spreadsheetId) {
  var actor = Session.getEffectiveUser().getEmail() || 'SYSTEM';
  var u = { user_id: actor, full_name: actor };
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
  carryOpenWorkToPlan_(active.period_id, plan.period_id, u);
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
  syncMonthlyPlanWorkbook_(periodId);
}

/** Chỉ ghi từ app ra Sheet kế hoạch; Sheet không phải nguồn ghi nghiệp vụ độc lập. */
function syncMonthlyPlanWorkbook_(periodId) {
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
    return [u.name, mine.length, mine.filter(function (i) { return OPEN_STATUS.indexOf(i.status) !== -1; }).length, mine.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length];
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
    var rows = items.filter(function (i) { var r = requestById[i.request_id]; return r && r.unit_id === u.unit_id; }).map(function (i) {
      var r = requestById[i.request_id] || {};
      return [i.source_stt, r.requestor_name || '', r.cif || '', r.customer_name || '', i.product_name || '', types[i.work_type_code] || i.work_type_code,
        i.occurrence_date || '', i.status || '', users[i.assigned_user_id] || '', i.note || ''];
    });
    if (!copiedTemplate) tab.getRange(4, 7, clearRows, 3).clearContent();
    if (rows.length) {
      tab.getRange(4, 1, rows.length, 6).setValues(rows.map(function (row) { return row.slice(0, 6); }));
      tab.getRange(4, 12, rows.length, 1).setValues(rows.map(function (row) { return [row[9] || STATUS_LABEL_[row[7]] || row[7] || '']; }));
      // File trống không có công thức G:K của mẫu: ghi thẳng ngày, trạng thái, người xử lý.
      if (!copiedTemplate) tab.getRange(4, 7, rows.length, 3).setValues(rows.map(function (row) {
        return [row[6], STATUS_LABEL_[row[7]] || row[7], row[8]];
      }));
    }
    tab.setFrozenRows(Math.max(tab.getFrozenRows(), 3));
  });

  var catalog = ss.getSheetByName('Danh mục');
  catalog.clearContents();
  var options = DataRepository.getAll('CatalogOptions').filter(function (x) { return String(x.is_active) === 'true'; })
    .map(function (x) { return [x.catalog_key, x.unit_id || '', x.label, x.code || '']; });
  catalog.getRange(1, 1, 1, 4).setValues([['Nhóm', 'Đơn vị', 'Nhãn', 'Mã']]);
  if (options.length) catalog.getRange(2, 1, options.length, 4).setValues(options);
}

var STATUS_LABEL_ = {
  CHO_TIEP_NHAN: 'Chờ tiếp nhận', CAN_BO_SUNG: 'Cần bổ sung', CHO_PHAN_CONG: 'Chờ phân công',
  DA_PHAN_CONG: 'Đã phân công', DANG_THUC_HIEN: 'Đang thực hiện', DA_SOAN_XONG: 'Đã soạn xong',
  DANG_HEN_KH: 'Đang hẹn khách', CHO_KS_DUYET: 'Chờ kiểm soát duyệt', HOAN_THANH_LS: 'Hoàn thành',
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
    var requests = {}, counts = {};
    t.rows('Requests').forEach(function (r) { requests[r.request_id] = r; });
    // Tiếp tục STT theo từng đơn vị của kỳ đích, tránh trùng mã khi chạy lại
    // hoặc khi kỳ mới đã có dữ liệu được tạo thủ công trước lúc chuyển tiếp.
    t.rows('WorkItems').filter(function (i) { return i.period_id === toPeriodId; }).forEach(function (i) {
      var ref = String(i.source_stt || '');
      var match = ref.match(/^(.+)_([0-9]+)$/);
      if (match) counts[match[1]] = Math.max(counts[match[1]] || 0, Number(match[2]));
    });
    t.rows('WorkItems').filter(function (i) { return i.period_id === fromPeriodId && OPEN_STATUS.indexOf(i.status) !== -1; }).forEach(function (old) {
      if (t.rows('WorkItems').some(function (existing) {
        return existing.period_id === toPeriodId && existing.carryover_from_item_id === old.item_id;
      })) return;
      var oldReq = requests[old.request_id];
      if (!oldReq) return;
      var newRequestId = id_('REQ');
      var newItemId = id_('ITEM');
      t.append('Requests', {
        request_id: newRequestId, period_id: toPeriodId, origin_request_id: oldReq.origin_request_id || oldReq.request_id,
        carryover_from_request_id: oldReq.request_id, unit_id: oldReq.unit_id, created_by: u.user_id,
        customer_name: oldReq.customer_name, customer_kind: oldReq.customer_kind, cif: oldReq.cif || '', phone: oldReq.phone || '', email: oldReq.email || '',
        priority_flags_json: oldReq.priority_flags_json || '[]', requestor_id: oldReq.requestor_id || '', requestor_name: oldReq.requestor_name || '',
        requestor_kind: oldReq.requestor_kind || '', note: oldReq.note || '', created_at: stamp_(), updated_at: stamp_()
      });
      var prefix = String(oldReq.unit_id || 'DONVI') + '_';
      counts[oldReq.unit_id] = (counts[oldReq.unit_id] || 0) + 1;
      t.append('WorkItems', {
        item_id: newItemId, period_id: toPeriodId, origin_item_id: old.origin_item_id || old.item_id, carryover_from_item_id: old.item_id, parent_item_id: old.parent_item_id || '',
        request_id: newRequestId, work_type_code: old.work_type_code, product_name: old.product_name, collateral_mode: old.collateral_mode || 'NONE', occurrence_date: targetPlan.start_date,
        source_stt: prefix + counts[oldReq.unit_id], source_tab: old.source_tab || '', status: 'CHO_TIEP_NHAN', assigned_user_id: '', assigned_by: '', submitted_at: stamp_(),
        accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: old.processing_started_at || '', pause_log_json: nextPauseLog_(old, 'CHO_TIEP_NHAN', stamp_()) || old.pause_log_json || '', appointment_json: '', checklist_json: old.checklist_json || '[]', pending_json: '',
        note: 'Chuyển tiếp từ ' + old.item_id + '.', version: 1, created_at: stamp_(), updated_at: stamp_()
      });
      // Đánh dấu dòng cũ đã sinh ra dòng mới ở kỳ sau. Thiếu dấu này thì việc
      // kéo dài ba tháng nằm trong ba kỳ dưới dạng ba dòng đang mở, và mọi báo
      // cáo nhiều kỳ đếm nó ba lần.
      var oldFound = t.find('WorkItems', 'item_id', old.item_id);
      if (oldFound) t.write(oldFound, { carried_to_item_id: newItemId, updated_at: stamp_() });
      t.append('Events', { event_id: id_('EVT'), item_id: newItemId, type: 'CHUYEN_TIEP_THANG', by: u.user_id, at: stamp_(),
        reason: 'Chuyển tiếp việc mở từ kỳ ' + fromPeriodId + ', việc gốc ' + old.item_id + '.', before_json: JSON.stringify({ item_id: old.item_id, period_id: fromPeriodId }), after_json: JSON.stringify({ period_id: toPeriodId }) });
    });
    return true;
  });
  if (copied) syncMonthlyPlanWorkbook_(toPeriodId);
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
 * - tiếp nhận: lúc đơn vị gửi -> lúc LS nhận hồ sơ;
 * - phân công: lúc nhận -> lúc gán cán bộ;
 * - xử lý: lúc gán -> lúc hoàn thành;
 * - toàn trình: lúc gửi -> lúc hoàn thành.
 * Trả null khi một đoạn chưa đủ mốc để dashboard không biến dữ liệu thiếu
 * thành số 0 giả.
 */
function itemTiming_(item) {
  return {
    tiep_nhan: elapsedHours_(item.submitted_at, item.accepted_at),
    phan_cong: elapsedHours_(item.accepted_at, item.assigned_at),
    xu_ly: elapsedHours_(item.assigned_at, item.completed_at),
    toan_trinh: elapsedHours_(item.submitted_at, item.completed_at)
  };
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
function periodSummaryRows_(periodId) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan) return [];

  var requests = {};
  DataRepository.getAll('Requests').forEach(function (r) { requests[r.request_id] = r; });
  var units = {};
  DataRepository.getAll('Units').forEach(function (x) { units[x.unit_id] = x.name || x.unit_id; });
  var types = {};
  DataRepository.getAll('WorkTypes').forEach(function (x) { types[x.type_code] = x.display_name || x.type_code; });
  var users = {};
  DataRepository.getAll('Users').forEach(function (x) { users[x.user_id] = x.full_name || x.user_id; });

  var items = DataRepository.getAll('WorkItems').filter(function (i) { return i.period_id === periodId; });
  var now = stamp_();
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
    var timing = itemTiming_(i);
    // Việc đã chuyển sang kỳ sau được chấm trễ ở dòng cuối của nó, không phải
    // ở mỗi kỳ nó đi qua — nếu không một việc trễ đếm thành ba lần trễ.
    // Việc đã hủy không bao giờ là quá hạn; việc đang chờ khách/tạm dừng thì hạn đứng yên.
    var late = i.due_at && !i.carried_to_item_id
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
      if (timing.xu_ly !== null) { b.tong_gio_xu_ly += timing.xu_ly; b.so_xu_ly += 1; }
      if (timing.toan_trinh !== null) { b.tong_gio_toan_trinh += timing.toan_trinh; b.so_toan_trinh += 1; }
      if (done) b.hoan_thanh += 1;
      if (i.status === 'HUY') b.huy += 1;
      // Việc đã sinh dòng tiếp ở kỳ sau không còn là tồn của kỳ này nữa.
      if (OPEN_STATUS.indexOf(i.status) !== -1 && !i.carried_to_item_id) b.ton_cuoi_ky += 1;
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
        updated_at: stamp_()
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
  if (['KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) {
    throw new Error('Vai trò ' + u.role + ' không được xem báo cáo tổng hợp.');
  }
  opts = opts || {};
  var group = REPORT_DIMENSION[String(opts.group || 'unit')] ? String(opts.group || 'unit') : 'unit';
  var dimension = REPORT_DIMENSION[group];

  var from = String(opts.from || '');
  var to = String(opts.to || '');
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) throw new Error('Khoảng báo cáo phải có dạng YYYY-MM.');
  if (from > to) { var swap = from; from = to; to = swap; }

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
    var hasTimingColumns = storedRows.some(function (r) {
      return Object.prototype.hasOwnProperty.call(r, 'tong_gio_tiep_nhan');
    });
    var rows = plan.status === 'ARCHIVED' && storedRows.length && hasTimingColumns
      ? storedRows
      : periodSummaryRows_(plan.period_id);

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
var SCORE_FORMULA_VERSION = 'score_formula_v1';

function operationalScorecard_(items, users, fromDate, toDate, now) {
  var from = dateOnly_(fromDate), to = dateOnly_(toDate);
  var at = now instanceof Date ? now : new Date(now || stamp_());
  var staff = (users || []).filter(function (u) {
    return String(u.role || '').trim().toUpperCase() === 'CAN_BO_LS' && truthy_(u.is_active);
  });
  var byUser = {};
  staff.forEach(function (u) {
    byUser[u.user_id] = { user: { user_id: u.user_id, full_name: u.full_name || u.user_id },
      eligible: 0, done: 0, timedDone: 0, onTime: 0, lateOpen: 0, open: 0 };
  });

  (items || []).forEach(function (item) {
    var day = dateOnly_(item.occurrence_date || item.submitted_at);
    var row = byUser[item.assigned_user_id];
    if (!row || !day || (from && day < from) || (to && day > to) || item.status === 'HUY' || item.carried_to_item_id) return;
    row.eligible += 1;
    if (item.status === 'HOAN_THANH_LS') {
      row.done += 1;
      if (item.due_at && item.completed_at) {
        row.timedDone += 1;
        if (new Date(item.completed_at).getTime() <= new Date(item.due_at).getTime()) row.onTime += 1;
      }
    }
    if (OPEN_STATUS.indexOf(item.status) !== -1) {
      row.open += 1;
      if (isLateOpen_(item, at.getTime())) row.lateOpen += 1;
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
      row.dataQuality = 'THIEU_HAN_SLA';
      return row;
    }
    var onTimeRate = row.onTime / row.timedDone;
    var completionRate = row.done / row.eligible;
    var backlogRate = row.open ? Math.max(0, 1 - row.lateOpen / row.open) : 1;
    row.onTimeRate = Math.round(onTimeRate * 100);
    row.completionRate = Math.round(completionRate * 100);
    row.backlogRate = Math.round(backlogRate * 100);
    row.score = Math.round(60 * onTimeRate + 25 * completionRate + 15 * backlogRate);
    row.dataQuality = row.timedDone === row.done ? 'OK' : 'THIEU_HAN_SLA';
    return row;
  }).sort(function (a, b) {
    if (a.score === null && b.score === null) return String(a.user.full_name).localeCompare(String(b.user.full_name));
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || String(a.user.full_name).localeCompare(String(b.user.full_name));
  });
}

/** Chốt điểm vận hành của kỳ đã đóng, giữ nguyên công thức và dữ liệu tại thời điểm chốt. */
function writeOperationalScoreSnapshot_(periodId) {
  var plan = DataRepository.find('MonthlyPlans', 'period_id', periodId);
  if (!plan) throw new Error('Không tìm thấy kỳ ' + periodId + '.');
  if (plan.status !== 'ARCHIVED') {
    return { period_id: periodId, month_key: plan.month_key, rows: 0, skipped: true,
      reason: 'Chỉ chốt điểm khi kỳ đã đóng', formula_version: SCORE_FORMULA_VERSION };
  }
  var items = DataRepository.getAll('WorkItems').filter(function (i) { return i.period_id === periodId; });
  var rows = operationalScorecard_(items, DataRepository.getAll('Users'), plan.start_date, plan.end_date,
    new Date(String(plan.end_date || '').substring(0, 10) + 'T23:59:59+07:00'));
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
  Object.keys(row || {}).forEach(function (key) { out[key] = row[key]; });
  ['customer_name', 'cif', 'phone', 'email', 'priority_flags_json', 'note'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = '';
  });
  return out;
}

function sanitizeAdminEvent_(row) {
  var out = {};
  Object.keys(row || {}).forEach(function (key) { out[key] = row[key]; });
  out.before_json = '';
  out.after_json = '';
  return out;
}

function sanitizeAdminOutbox_(row) {
  var out = {};
  Object.keys(row || {}).forEach(function (key) { out[key] = row[key]; });
  if (String(out.recipient_kind) === 'KHACH') {
    out.recipient = '';
    out.recipient_name = '';
    out.body = '';
  }
  return out;
}

/** Quản trị vận hành hệ thống, không đọc hồ sơ khách — kể cả gián tiếp qua việc. */
function sanitizeAdminItem_(row) {
  var out = {};
  Object.keys(row || {}).forEach(function (key) { out[key] = row[key]; });
  out.product_name = '';
  if (out.appointment_json) {
    var keep = {};
    try {
      var appt = JSON.parse(out.appointment_json);
      keep = { at: appt.at || '', date: appt.date || '', time: appt.time || '',
        channel: appt.channel || '', via_group: !!appt.via_group };
    } catch (err) { keep = {}; }
    out.appointment_json = JSON.stringify(keep);
  }
  return out;
}

/**
 * Kho cũ phải tự nhận schema hardening ở lượt đăng nhập đầu tiên sau deploy.
 * Không phụ thuộc clasp run/OAuth máy phát hành: nếu thiếu bảng/cột mới thì
 * nâng cấp ngay dưới tài khoản triển khai rồi xóa cache đọc của lượt chạy.
 */
function ensureRuntimeSchema_() {
  var id = PropertiesService.getScriptProperties().getProperty('LS_SHEET_ID');
  if (!id) return { upgraded: false, reason: 'missing_storage_id' };
  var ss = SpreadsheetApp.openById(id);
  function hasColumns_(name, columns) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastColumn() < 1) return false;
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return columns.every(function (column) { return header.indexOf(column) !== -1; });
  }
  var ready = hasColumns_('NotificationIdempotency', ['idem_key', 'outbox_id']) &&
    hasColumns_('NotificationOutbox', ['claim_token', 'claim_until']) &&
    hasColumns_('OperationalScoreSnapshots', ['period_id', 'formula_version']) &&
    hasColumns_('WorkItems', ['sla_paused_at']);
  if (ready) {
    installMaintenanceTrigger();
    return { upgraded: false, reason: 'ready' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { upgraded: false, reason: 'upgrade_in_progress' };
  try {
    setupSheetDB_(ss);
    installMonthlyPlanTrigger();
    installMaintenanceTrigger();
    Notifications.installWorker();
    DataRepository.clearCache();
    return { upgraded: true };
  } finally {
    lock.releaseLock();
  }
}

/** Dữ liệu khởi tạo, đã lọc theo phạm vi vai trò. */
function getBootstrap() {
  var t0 = Date.now();
  ensureRuntimeSchema_();
  var u = currentUser_();
  var activePlan = activePlan_();
  var requests = DataRepository.getAll('Requests').filter(function (r) { return r.period_id === activePlan.period_id; });
  var items = DataRepository.getAll('WorkItems').filter(function (i) { return i.period_id === activePlan.period_id; });

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
    me: { user_id: u.user_id, full_name: u.full_name, email: u.email, role: u.role, unit_id: u.unit_id,
      must_change_password: truthy_(u.must_change_password) },
    users: DataRepository.getAll('Users').map(function (x) {
      return { user_id: x.user_id, full_name: x.full_name, email: x.email || '', role: x.role, unit_id: x.unit_id,
        sort_order: x.sort_order || '', source_tab: x.source_tab || '', is_active: x.is_active,
        login_code: x.login_code || x.user_id || '', auth_group: authGroup_(x),
        zalo_name: x.zalo_name || '', zalo_phone: x.zalo_phone || '', telegram_chat_id: x.telegram_chat_id || '',
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
    // Events và Inbox chỉ thêm, không xóa. Lấy phần đuôi gần nhất thay vì đọc
    // trọn bảng, nếu không thời gian mở màn hình sẽ dài dần theo từng tháng.
    events: DataRepository.tail('Events', 800).filter(function (e) {
      if (u.role === 'CAN_BO_LS') return e.by === u.user_id;
      return visible[e.item_id];
    }).map(function (e) {
      return u.role === 'ADMIN' ? sanitizeAdminEvent_(e) : e;
    }),
    inbox: DataRepository.tail('Inbox', 200).filter(function (n) { return n.user_id === u.user_id; }),
    // Cán bộ phải xem trước và xác nhận tin gửi khách ngay ở chi tiết việc, nên
    // hàng đợi phải tới được tay họ — giới hạn đúng những việc họ đã nhìn thấy.
    outbox: u.role === 'ADMIN' ? [] : DataRepository.tail('NotificationOutbox', 800)
      .filter(function (o) { return visible[o.item_id]; }),
    settings: DataRepository.getAll('Settings').filter(function (s) {
      return ['timezone', 'week_start', 'work_days', 'work_open', 'work_close', 'work_break', 'holidays',
        'backlog_alert', 'export_row_limit', 'retention_months', 'env', 'bank_name', 'hotline', 'app_url', 'sign_place'].indexOf(s.key) !== -1;
    })
  };
  if (u.role === 'ADMIN') {
    result.operationalScorecard = operationalScorecard_(items, DataRepository.getAll('Users'),
      activePlan.start_date, activePlan.end_date, new Date());
    result.operationalScorecardMeta = { period_id: activePlan.period_id, month_key: activePlan.month_key,
      source: 'LIVE_ACTIVE_PERIOD', formula_version: SCORE_FORMULA_VERSION };
    try { result.operationalScoreSnapshots = DataRepository.tail('OperationalScoreSnapshots', 2000); }
    catch (ignore) { result.operationalScoreSnapshots = []; }
    result.channels = DataRepository.getAll('Channels');
    result.templates = DataRepository.getAll('Templates');
    result.notifyRules = DataRepository.getAll('NotifyRules');
    result.outbox = DataRepository.tail('NotificationOutbox', 500).map(sanitizeAdminOutbox_);
    result.notificationMetrics = DataRepository.tail('NotificationMetrics', 2000);
    result.configLog = DataRepository.tail('ConfigLog', 300);
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
  if (['ADMIN', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1) {
    result.monthlyPlans = DataRepository.getAll('MonthlyPlans').sort(function (a, b) { return String(b.month_key).localeCompare(String(a.month_key)); }).map(publicMonthlyPlan_);
  }
  result.stats = { sheetReads: DataRepository.sheetReads(), ms: Date.now() - t0 };
  return result;
}

/* ---------------------------- Tạo yêu cầu ---------------------------- */

function nextSourceStt_(t, unitId, periodId) {
  var prefix = String(unitId || 'DONVI') + '_';
  var reqUnits = {};
  t.rows('Requests').forEach(function (r) { reqUnits[r.request_id] = r.unit_id; });
  var max = 0;
  t.rows('WorkItems').forEach(function (i) {
    if (reqUnits[i.request_id] !== unitId || (periodId && i.period_id !== periodId)) return;
    var ref = String(i.source_stt || '');
    if (ref.indexOf(prefix) !== 0) return;
    var n = Number(ref.substring(prefix.length));
    if (n > max) max = n;
  });
  return prefix + (max + 1);
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
  payload.items.forEach(function (it) {
    if (!types[it.work_type_code]) throw new Error('Loại việc không hợp lệ: ' + it.work_type_code);
    if (!it.product_name) throw new Error('Thiếu tên sản phẩm cho một dòng việc.');
    it.collateral_mode = normalizeCollateralMode_(it.collateral_mode, types[it.work_type_code]);
  });

  var activePlan = activePlan_();
  var ts = stamp_();
  var requestId = id_('REQ');
  // Không tin cậy requestor do trình duyệt gửi lên: cán bộ đề nghị luôn là
  // tài khoản đã đăng nhập. Khi Admin luân chuyển unit_id, phòng mới được áp
  // dụng ngay cho lần đăng nhập/kê khai tiếp theo và vẫn giữ được lịch sử.
  var cif = String(payload.customer.cif || '').trim();
  var kind = cif ? 'DA_CO_CIF' : 'KH_MOI';
  var requestorId = u.user_id;
  var requestorName = u.full_name || u.email || u.user_id;
  var requestorKind = u.role === 'PHONG_PGD' ? 'VRM_PRM' : (u.role || 'VRM_PRM');

  var result = DataRepository.tx(function (t) {
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
      phone: payload.customer.phone || '',
      email: payload.customer.email || '',
      priority_flags_json: JSON.stringify((payload.customer.priority_flags || []).filter(function (x) {
        return ['VIP', 'QUAN_TRONG', 'XU_LY_GAP'].indexOf(String(x)) !== -1;
      })),
      requestor_id: requestorId,
      requestor_name: requestorName,
      requestor_kind: requestorKind,
      note: payload.note || '',
      created_at: ts,
      updated_at: ts
    });

    var ids = [], linkedItems = [];
    payload.items.forEach(function (it) {
      var itemId = id_('ITEM');
      ids.push(itemId);
      var typeChecklist = [];
      try { typeChecklist = JSON.parse(types[it.work_type_code].checklist_json || '[]'); } catch (ignoreChecklist) { typeChecklist = []; }
      var sourceStt = nextSourceStt_(t, unitId, activePlan.period_id);
      var unit = t.find('Units', 'unit_id', unitId);
      t.append('WorkItems', {
        item_id: itemId,
        period_id: activePlan.period_id,
        origin_item_id: '',
        carryover_from_item_id: '',
        parent_item_id: '',
        request_id: requestId,
        work_type_code: it.work_type_code,
        product_name: it.product_name,
        collateral_mode: it.collateral_mode,
        occurrence_date: it.occurrence_date || ts.substring(0, 10),
        source_stt: sourceStt,
        source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : unitId,
        status: 'CHO_TIEP_NHAN',
        assigned_user_id: '',
        assigned_by: '',
        submitted_at: ts,
        accepted_at: '',
        assigned_at: '',
        due_at: '',
        completed_at: '',
        processing_started_at: '',
        appointment_json: '',
        checklist_json: JSON.stringify(typeChecklist.map(function () { return false; })),
        pending_json: '',
        note: '',
        version: 1,
        created_at: ts,
        updated_at: ts
      });
      t.append('Events', {
        event_id: id_('EVT'), item_id: itemId, type: 'TAO_VIEC',
        by: u.user_id, at: ts, reason: 'Đơn vị ' + unitId + ' đăng ký yêu cầu.',
        before_json: '', after_json: JSON.stringify(it)
      });
      if (it.collateral_mode === 'MOI') {
        var collateralType = types[COLLATERAL_NEW_WORK_TYPE_];
        if (!collateralType || !truthy_(collateralType.is_active)) throw new Error('Thiếu loại việc hồ sơ TSBĐ mới trong danh mục.');
        var childId = id_('ITEM');
        var childChecklist = [];
        try { childChecklist = JSON.parse(collateralType.checklist_json || '[]'); } catch (ignoreChildChecklist) { childChecklist = []; }
        var child = {
          item_id: childId, period_id: activePlan.period_id, origin_item_id: '', carryover_from_item_id: '',
          parent_item_id: itemId, request_id: requestId, work_type_code: COLLATERAL_NEW_WORK_TYPE_,
          product_name: collateralType.display_name || COLLATERAL_NEW_WORK_TYPE_, collateral_mode: 'MOI',
          occurrence_date: it.occurrence_date || ts.substring(0, 10), source_stt: nextSourceStt_(t, unitId, activePlan.period_id),
          source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : unitId,
          status: 'CHO_TIEP_NHAN', assigned_user_id: '', assigned_by: '', submitted_at: ts,
          accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: '', appointment_json: '',
          checklist_json: JSON.stringify(childChecklist.map(function () { return false; })), pending_json: '', note: '',
          version: 1, created_at: ts, updated_at: ts
        };
        t.append('WorkItems', child);
        t.append('Events', {
          event_id: id_('EVT'), item_id: childId, type: 'TAO_VIEC', by: u.user_id, at: ts,
          reason: 'Tạo hồ sơ TSBĐ mới đi kèm việc ' + itemId + '.', before_json: '', after_json: JSON.stringify(child)
        });
        linkedItems.push({
          item_id: childId, parent_item_id: itemId, work_type_code: child.work_type_code,
          product_name: child.product_name, occurrence_date: child.occurrence_date, status: child.status,
          assigned_user_id: '', assigned_by: '', submitted_at: ts, version: 1,
          collateral_mode: 'MOI', checklist: childChecklist.map(function () { return false; })
        });
      }
    });

    return { ok: true, request_id: requestId, item_ids: ids, linked_items: linkedItems, period_id: activePlan.period_id };
  });
  syncMonthlyPlanWorkbook_(result.period_id);
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
  return t.rows('Events').some(function (e) {
    return e.item_id === item.item_id && e.type === to && e.by === actor.user_id;
  });
}

function transitionItem(itemId, to, opts) {
  var u = requireActor_();
  opts = opts || {};
  var notificationMode = String(opts.notification_mode || 'DEFAULT').toUpperCase();
  if (['DEFAULT', 'IN_APP', 'NONE'].indexOf(notificationMode) === -1) throw new Error('Lựa chọn thông báo không hợp lệ.');
  if (to !== 'HOAN_THANH_LS' && notificationMode !== 'DEFAULT') throw new Error('Chỉ được chọn cách thông báo khi hoàn thành việc.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;

    if (transitionIdempotent_(t, item, to, u, opts)) {
      return { ok: true, idempotent: true, status: to, version: Number(item.version), queued: 0, period_id: item.period_id };
    }

    if (opts.expected_version !== undefined && Number(item.version) !== Number(opts.expected_version)) {
      throw new Error('Việc đã được người khác cập nhật. Tải lại trước khi lưu.');
    }

    var allowed = (FLOW_SERVER[item.status] || {})[to];
    if (!allowed) throw new Error('Không thể chuyển từ ' + item.status + ' sang ' + to + '.');
    if (allowed.indexOf(u.role) === -1) throw new Error('Vai trò ' + u.role + ' không được thực hiện thao tác này.');
    if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới xử lý việc này.');

    var req = t.find('Requests', 'request_id', item.request_id);
    if (u.role === 'PHONG_PGD' && (!req || req.object.unit_id !== u.unit_id)) {
      throw new Error('Việc không thuộc đơn vị của bạn.');
    }

    var reason = String(opts.reason || '').trim();
    if (reasonRequired_(item.status, to) && !reason) throw new Error('Thao tác này bắt buộc ghi lý do.');

    var ts = stamp_();
    var fields = { status: to, version: Number(item.version) + 1, updated_at: ts };

    var doneType = t.find('WorkTypes', 'type_code', item.work_type_code);
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
      fields.assigned_user_id = opts.assignee_id;
      fields.assigned_by = u.user_id;
      fields.assigned_at = ts;
      fields.due_at = dueAt_(t, ts, slaHours);
      reason = 'Giao ' + staff.object.full_name + (reason ? ' — ' + reason : '');
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
      fields.appointment_json = JSON.stringify(opts.appointment);
      reason = 'Hẹn ' + opts.appointment.at + ' qua ' + opts.appointment.channel;
    }

    if ((to === 'CHO_PHAN_CONG' || to === 'DA_PHAN_CONG') && !item.accepted_at) fields.accepted_at = ts;
    if (to === 'DANG_THUC_HIEN' && !item.processing_started_at) fields.processing_started_at = ts;
    var pauses = nextPauseLog_(item, to, ts);
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
      // Loại việc cần khách ký thì phải có lịch hẹn trước khi đóng việc.
      if (doneType && truthy_(doneType.object.requires_appointment) && !item.appointment_json) {
        throw new Error('Loại việc này cần hẹn khách ký trước khi hoàn thành.');
      }
      // Cờ "cần kiểm soát duyệt" của loại việc phải có hiệu lực ở máy chủ, không chỉ ẩn nút.
      if (u.role === 'CAN_BO_LS' && doneType && truthy_(doneType.object.requires_ks_approval)) {
        throw new Error('Loại việc này cần kiểm soát duyệt; hãy dùng "Trình kiểm soát duyệt".');
      }
      fields.completed_at = ts;
    }
    if (to === 'DANG_THUC_HIEN' && item.status === 'HOAN_THANH_LS') {
      // Mở lại là một vòng xử lý mới: hạn tính lại từ lúc mở, không để việc vừa
      // mở đã quá hạn theo mốc cũ.
      fields.completed_at = '';
      fields.due_at = dueAt_(t, ts, doneType ? Number(doneType.object.sla_hours) || 8 : 8);
    }

    t.write(found, fields);
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: to, by: u.user_id, at: ts,
      reason: reason, before_json: JSON.stringify({ status: item.status }), after_json: JSON.stringify(fields)
    });

    // Xếp tin vào outbox trong cùng lần giữ khóa với việc, để không có trường hợp
    // trạng thái đã đổi mà thông báo thì mất.
    var queued = 0;
    // Giao lần đầu và chuyển việc sang người khác là hai tin khác nhau; dùng chung
    // một sự kiện thì quy tắc "chuyển việc" không bao giờ chạy.
    var event = NOTIFY_ON[to];
    if (to === 'DA_PHAN_CONG' && item.assigned_user_id && item.assigned_user_id !== opts.assignee_id) {
      event = 'DOI_NGUOI';
    }
    if (event && notificationMode !== 'NONE') {
      var merged = {};
      Object.keys(item).forEach(function (k) { merged[k] = item[k]; });
      Object.keys(fields).forEach(function (k) { merged[k] = fields[k]; });
      queued = Notifications.queue(t, merged, event, u.user_id, null, notificationMode);
    }

    // Trả mốc hạn/hoàn thành do máy chủ tính để màn hình không giữ hạn cũ.
    return { ok: true, status: to, version: fields.version, queued: queued, period_id: item.period_id,
      due_at: fields.due_at !== undefined ? fields.due_at : (item.due_at || ''),
      completed_at: fields.completed_at !== undefined ? fields.completed_at : (item.completed_at || ''),
      sla_paused_at: fields.sla_paused_at !== undefined ? fields.sla_paused_at : (item.sla_paused_at || '') };
  });
  syncMonthlyPlanWorkbook_(result.period_id);
  return result;
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
      if (item.status !== 'CHO_PHAN_CONG') throw new Error('Hồ sơ ' + itemId + ' không còn ở trạng thái chờ phân công. Tải lại danh sách trước khi giao.');
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
        assigned_at: ts, due_at: dueAt_(t, ts, wt ? Number(wt.object.sla_hours) || 8 : 8),
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

    return {
      ok: true, count: staged.length, queued: queued, period_ids: Object.keys(periodIds),
      items: staged.map(function (entry) {
        return { item_id: entry.item.item_id, status: entry.fields.status, assigned_user_id: entry.fields.assigned_user_id,
          assigned_by: entry.fields.assigned_by, assigned_at: entry.fields.assigned_at, due_at: entry.fields.due_at,
          accepted_at: entry.fields.accepted_at || entry.item.accepted_at || '', version: entry.fields.version };
      })
    };
  });

  (result.period_ids || []).forEach(function (periodId) { syncMonthlyPlanWorkbook_(periodId); });
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
  });
  syncMonthlyPlanWorkbook_(result.period_id);
  return result;
}

/* ---------------------------- Việc kèm ---------------------------- */

var LINKABLE_STATUS_ = ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'];

/**
 * Cán bộ đang làm một việc (vd. vay món) phát hiện phải làm thêm hồ sơ TSĐB mới:
 * tạo một dòng việc thật thứ hai cùng hồ sơ khách, giao luôn cho người đang làm và
 * bắt đầu tính giờ ngay. Là dòng WorkItems riêng nên mọi báo cáo, file kế hoạch và
 * dashboard tự đếm thành 2 việc — không cần cờ phụ nào để cộng thêm.
 */
function addLinkedItem(parentId, workTypeCode) {
  var u = requireActor_();
  if (['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Vai trò không được thêm việc kèm.');
  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', parentId);
    if (!found) throw new Error('Không tìm thấy việc ' + parentId + '.');
    var parent = found.object;
    if (u.role === 'CAN_BO_LS' && parent.assigned_user_id !== u.user_id) throw new Error('Chỉ người được giao mới thêm việc kèm.');
    if (LINKABLE_STATUS_.indexOf(parent.status) === -1 || !parent.assigned_user_id) throw new Error('Chỉ thêm việc kèm khi việc chính đang được cán bộ LS xử lý.');
    var wt = t.find('WorkTypes', 'type_code', workTypeCode);
    if (!wt || !truthy_(wt.object.is_active)) throw new Error('Loại việc kèm không hợp lệ.');
    if (workTypeCode === parent.work_type_code) throw new Error('Việc kèm phải khác sản phẩm của việc chính.');
    var dup = t.rows('WorkItems').filter(function (i) {
      return i.parent_item_id === parentId && i.work_type_code === workTypeCode && i.status !== 'HUY';
    })[0];
    if (dup) throw new Error('Đã có việc kèm ' + (wt.object.display_name || workTypeCode) + ' cho việc này.');

    var req = t.find('Requests', 'request_id', parent.request_id);
    var unitId = req ? req.object.unit_id : '';
    var unit = unitId ? t.find('Units', 'unit_id', unitId) : null;
    var defs = [];
    try { defs = JSON.parse(wt.object.checklist_json || '[]'); } catch (ignore) { defs = []; }
    var ts = stamp_();
    var itemId = id_('ITEM');
    t.append('WorkItems', {
      item_id: itemId, period_id: parent.period_id, origin_item_id: '', carryover_from_item_id: '',
      parent_item_id: parentId, request_id: parent.request_id,
      work_type_code: workTypeCode, product_name: wt.object.display_name || workTypeCode, collateral_mode: workTypeCode === COLLATERAL_NEW_WORK_TYPE_ ? 'MOI' : 'NONE',
      occurrence_date: ts.substring(0, 10),
      source_stt: nextSourceStt_(t, unitId, parent.period_id),
      source_tab: unit ? (unit.object.source_tab || unit.object.name || unitId) : (parent.source_tab || unitId),
      status: 'DANG_THUC_HIEN', assigned_user_id: parent.assigned_user_id, assigned_by: u.user_id,
      submitted_at: ts, accepted_at: ts, assigned_at: ts,
      due_at: dueAt_(t, ts, Number(wt.object.sla_hours) || 8),
      completed_at: '', processing_started_at: ts, appointment_json: '',
      checklist_json: JSON.stringify(defs.map(function () { return false; })),
      pending_json: '', note: '', version: 1, created_at: ts, updated_at: ts
    });
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'TAO_VIEC', by: u.user_id, at: ts,
      reason: 'Việc kèm của ' + (parent.source_stt || parentId) + ' — bắt đầu xử lý ngay.',
      before_json: '', after_json: JSON.stringify({ parent_item_id: parentId, work_type_code: workTypeCode })
    });
    return { ok: true, item_id: itemId, period_id: parent.period_id };
  });
  syncMonthlyPlanWorkbook_(result.period_id);
  return result;
}

/* ---------------------------- Đề nghị sửa ---------------------------- */

/** Tin trong app gửi thẳng một người (không qua quy tắc/outbox): chỉ nội bộ, không có dữ liệu khách. */
function inboxNotify_(t, userId, itemId, event) {
  if (!userId) return;
  t.append('Inbox', { id: 'NTF_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase(),
    user_id: userId, item_id: itemId, event: event, at: stamp_(), is_read: false });
}

/** Chỉ nhận các trường được phép sửa, đúng định dạng; loại việc phải còn hoạt động. */
function validateRevisionFields_(t, fields) {
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) throw new Error('Không có thay đổi nào.');
  var allowed = ['customer.name', 'customer.cif', 'customer.phone', 'customer.email', 'customer.priority_flags',
    'work_type_code', 'product_name', 'occurrence_date'];
  Object.keys(fields).forEach(function (k) {
    if (allowed.indexOf(k) === -1) throw new Error('Trường "' + k + '" không được sửa qua đề nghị.');
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

/** Phòng sửa việc đã vào LS xử lý thì thành đề nghị chờ kiểm soát duyệt. */
function proposeRevision(itemId, fields, reason, expectedVersion) {
  var u = requireActor_();
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Cần ghi lý do sửa.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var item = found.object;
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
    var direct = u.role !== 'PHONG_PGD' || ['CHO_TIEP_NHAN', 'CAN_BO_SUNG'].indexOf(item.status) !== -1;

    if (direct) {
      applyRevision_(t, found, req, fields, ts);
      t.append('Events', {
        event_id: id_('EVT'), item_id: itemId, type: 'SUA_THONG_TIN', by: u.user_id, at: ts,
        reason: reason, before_json: JSON.stringify(item), after_json: JSON.stringify(fields)
      });
      // Cán bộ đang xử lý phải biết hồ sơ vừa bị đổi dưới tay mình.
      if (item.assigned_user_id && item.assigned_user_id !== u.user_id) inboxNotify_(t, item.assigned_user_id, itemId, 'SUA_THONG_TIN');
      return { ok: true, applied: true, period_id: item.period_id };
    }

    if (item.pending_json) {
      throw new Error('Việc đang có một đề nghị sửa chờ kiểm soát duyệt. Chờ duyệt xong rồi gửi đề nghị mới.');
    }

    t.write(found, {
      pending_json: JSON.stringify({ fields: fields, by: u.user_id, at: ts, reason: reason }),
      updated_at: ts
    });
    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: 'DE_NGHI_SUA', by: u.user_id, at: ts,
      reason: reason, before_json: '', after_json: JSON.stringify(fields)
    });
    // Đề nghị sửa nằm im chờ duyệt mà không ai được báo thì nó chỉ là một cột
    // dữ liệu, không phải một bước trong quy trình.
    Notifications.queue(t, item, 'DE_NGHI_SUA', u.user_id);
    return { ok: true, applied: false, period_id: item.period_id };
  });
  syncMonthlyPlanWorkbook_(result.period_id);
  return result;
}

function resolveRevision(itemId, approve, reason) {
  var u = requireActor_();
  if (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) throw new Error('Chỉ kiểm soát được duyệt đề nghị sửa.');

  var result = DataRepository.tx(function (t) {
    var found = t.find('WorkItems', 'item_id', itemId);
    if (!found) throw new Error('Không tìm thấy việc ' + itemId + '.');
    var pending = found.object.pending_json ? JSON.parse(found.object.pending_json) : null;
    if (!pending) throw new Error('Việc này không có đề nghị sửa nào.');

    var ts = stamp_();
    var req = t.find('Requests', 'request_id', found.object.request_id);

    if (approve) {
      if (OPEN_STATUS.indexOf(found.object.status) === -1) {
        throw new Error('Việc đã đóng từ lúc gửi đề nghị; chỉ có thể từ chối, muốn sửa thì mở lại việc.');
      }
      validateRevisionFields_(t, pending.fields);
      applyRevision_(t, found, req, pending.fields, ts);
    }
    t.write(found, { pending_json: '', updated_at: ts });

    t.append('Events', {
      event_id: id_('EVT'), item_id: itemId, type: approve ? 'DUYET_SUA' : 'TU_CHOI_SUA',
      by: u.user_id, at: ts, reason: reason || '', before_json: '', after_json: JSON.stringify(pending.fields)
    });
    // Phòng đề nghị phải biết kết quả; cán bộ đang xử lý phải biết hồ sơ đã đổi.
    inboxNotify_(t, pending.by, itemId, approve ? 'DUYET_SUA' : 'TU_CHOI_SUA');
    var assignee = found.object.assigned_user_id;
    if (approve && assignee && assignee !== pending.by) inboxNotify_(t, assignee, itemId, 'SUA_THONG_TIN');
    return { ok: true, approved: !!approve, period_id: found.object.period_id };
  });
  syncMonthlyPlanWorkbook_(result.period_id);
  return result;
}

function applyRevision_(t, found, req, fields, ts) {
  var itemFields = {}, reqFields = {};
  Object.keys(fields).forEach(function (k) {
    if (k.indexOf('customer.') === 0) {
      var map = { name: 'customer_name', cif: 'cif', phone: 'phone', email: 'email', priority_flags: 'priority_flags_json' };
      var col = map[k.substring(9)];
      if (col) reqFields[col] = col === 'priority_flags_json'
        ? JSON.stringify((fields[k] || []).filter(function (x) { return ['VIP', 'QUAN_TRONG', 'XU_LY_GAP'].indexOf(String(x)) !== -1; }))
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
    if (found.object.assigned_at) itemFields.due_at = dueAt_(t, found.object.assigned_at, wt ? Number(wt.object.sla_hours) || 8 : 8);
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
  var pause = String(settings.work_break || '11:30-13:00').split('-');
  return {
    days: String(settings.work_days || '1,2,3,4,5').split(',').map(function (x) { return Number(x); }),
    holidays: String(settings.holidays || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
    open: String(settings.work_open || '08:00').split(':').map(Number),
    close: String(settings.work_close || '17:30').split(':').map(Number),
    breakStart: String(pause[0] || '11:30').split(':').map(Number),
    breakEnd: String(pause[1] || '13:00').split(':').map(Number)
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

var ROLES = ['PHONG_PGD', 'CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS', 'ADMIN'];

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
    return item.assigned_user_id === oldUserId && OPEN_STATUS.indexOf(item.status) !== -1;
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

/** Lưu danh mục từ màn Quản trị. Các cột và bảng được giới hạn cứng, không nhận tên Sheet tùy ý. */
function adminSaveCatalog(kind, code, data) {
  var u = requireAdmin_();
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
    data.is_active = data.is_active !== false;
  }

  var result = DataRepository.tx(function (t) {
    var found = t.find(spec.table, spec.key, code);
    if (kind === 'user') {
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
          return i.assigned_user_id === code && OPEN_STATUS.indexOf(i.status) !== -1;
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
  if (current) syncMonthlyPlanWorkbook_(current.period_id);
  return result;
}

/** Nạp nhiều cán bộ từ CSV/TSV đã xuất bằng Excel. Không nhận mật khẩu rõ. */
function adminImportUsers(rows) {
  var u = requireAdmin_();
  if (!Array.isArray(rows) || !rows.length) throw new Error('File nhập chưa có dòng dữ liệu.');
  var result = DataRepository.tx(function (t) {
    var existing = t.rows('Users');
    var seen = {};
    var seenEmails = {};
    var created = 0;
    var updated = 0;
    rows.forEach(function (raw, index) {
      var row = raw || {};
      var code = String(row.login_code || row.ma_can_bo || row.ma || row.user_id || '').trim();
      var name = String(row.full_name || row.ho_ten || row.hoTen || '').trim();
      var unit = String(row.unit_id || row.don_vi || row.donVi || '').trim().toUpperCase();
      var role;
      try { role = requireRole_(row.role || row.vai_tro || (unit === 'PHONG_LS' ? 'CAN_BO_LS' : 'PHONG_PGD')); }
      catch (err) { throw new Error('Dòng ' + (index + 2) + ': ' + err.message); }
      if (!code || !name || !unit) throw new Error('Dòng ' + (index + 2) + ' thiếu mã cán bộ, họ tên hoặc đơn vị.');
      if (!t.find('Units', 'unit_id', unit)) throw new Error('Dòng ' + (index + 2) + ': đơn vị ' + unit + ' chưa có trong danh mục.');
      if (seen[code.toLowerCase()]) throw new Error('Mã cán bộ bị trùng trong file: ' + code);
      seen[code.toLowerCase()] = true;
      var found = existing.filter(function (x) {
        return String(x.login_code || x.user_id).toLowerCase() === code.toLowerCase();
      })[0];
      var id = found ? found.user_id : 'U_' + code.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
      var activeRaw = row.is_active !== undefined ? row.is_active :
        (row.hoat_dong !== undefined ? row.hoat_dong : (found && found.is_active !== undefined ? found.is_active : 'true'));
      var isActive = !(activeRaw === false || String(activeRaw).trim().toLowerCase() === 'false' || String(activeRaw).trim() === '0');
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
        var replacement = t.find('Users', 'user_id', replacementId);
        if (!replacement || String(replacement.object.role || '').trim().toUpperCase() !== 'CAN_BO_LS' || !truthy_(replacement.object.is_active)) {
          throw new Error('Dòng ' + (index + 2) + ': cán bộ thay thế phải là cán bộ LS đang hoạt động.');
        }
      }
      var email = String(row.email || row.email_cong_vu || (found && found.email) || '').trim().toLowerCase();
      if (email && seenEmails[email] && seenEmails[email] !== id) throw new Error('Email bị trùng trong file: ' + email);
      if (email) {
        var sameEmail = existing.filter(function (x) {
          return String(x.email || '').trim().toLowerCase() === email && x.user_id !== id;
        });
        if (sameEmail.length) throw new Error('Dòng ' + (index + 2) + ': email đã được cấp cho tài khoản khác.');
        seenEmails[email] = id;
      }
      var data = {
        user_id: id, full_name: name, email: email,
        login_code: code, auth_group: role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL',
        unit_id: unit, role: role, sort_order: Number(row.sort_order || row.thu_tu || (found && found.sort_order) || 9999),
        source_tab: String(row.source_tab || (found && found.source_tab) || 'Import Excel'), is_active: isActive,
        zalo_name: String(row.zalo_name || '').trim(), zalo_phone: String(row.zalo_phone || '').trim(),
        telegram_chat_id: String(row.telegram_chat_id || '').trim(), availability_status: availability,
        off_from: offFrom, off_to: offTo, off_reason: String(row.off_reason || row.ly_do_nghi || (found && found.off_reason) || '').trim(),
        replacement_user_id: replacementId
      };
      if (row.password || row.mat_khau) {
        data.password_hash = passwordHash_(row.password || row.mat_khau);
        data.must_change_password = true;
      }
      var foundRow = t.find('Users', 'user_id', id);
      if (foundRow && String(foundRow.object.role || '').trim().toUpperCase() === 'CAN_BO_LS' &&
          (role !== 'CAN_BO_LS' || !isActive)) {
        var openItems = t.rows('WorkItems').filter(function (item) {
          return item.assigned_user_id === id && OPEN_STATUS.indexOf(item.status) !== -1;
        });
        if (openItems.length) {
          if (!replacementId) {
            throw new Error('Dòng ' + (index + 2) + ': còn ' + openItems.length + ' việc đang mở; chọn cán bộ thay thế trước khi đổi vai trò hoặc khóa.');
          }
          handoverOpenWork_(t, id, replacementId, u.user_id, openItems,
            'Bàn giao do import đổi vai trò hoặc khóa tài khoản ' + id + '.');
        }
      }
      if (foundRow && String(foundRow.object.role || '').trim().toUpperCase() === 'ADMIN' &&
          (role !== 'ADMIN' || !isActive)) {
        var otherAdmins = t.rows('Users').filter(function (x) {
          return String(x.role || '').trim().toUpperCase() === 'ADMIN' && x.user_id !== id && truthy_(x.is_active);
        });
        if (!otherAdmins.length) throw new Error('Dòng ' + (index + 2) + ': đây là tài khoản quản trị đang hoạt động duy nhất; tạo tài khoản quản trị khác trước.');
      }
      if (foundRow) { t.write(foundRow, data); updated += 1; }
      else { t.append('Users', data); created += 1; }
      existing.push(data);
    });
    logConfig_(t, u, 'Người dùng', 'Nhập ' + rows.length + ' dòng Excel: thêm ' + created + ', cập nhật ' + updated + '.');
    return { ok: true, created: created, updated: updated };
  });
  return result;
}

function adminSaveSettings(values) {
  var u = requireAdmin_();
  var allowed = ['bank_name', 'hotline', 'app_url', 'timezone', 'week_start', 'retention_months', 'export_row_limit', 'backlog_alert', 'env',
    'work_days', 'work_open', 'work_close', 'work_break', 'holidays', 'sign_place', 'gateway_url', 'gateway_auth_ref',
    'target_done_month', 'target_done_staff_month'];
  return DataRepository.tx(function (t) {
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

    if (action !== 'CANCEL' && ['CHO_XAC_NHAN', 'THAT_BAI', 'KHONG_GUI', 'DA_HUY'].indexOf(String(row.status)) === -1) {
      throw new Error('Tin đang ở trạng thái ' + row.status + ', không cần thao tác này.');
    }

    var update = action === 'CANCEL'
      ? { status: 'DA_HUY', note: 'Hủy bởi ' + u.full_name, next_try_at: '' }
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
    var rows = t.rows('Inbox').filter(function (n) {
      return n.user_id === u.user_id && String(n.is_read) !== 'true' && n.is_read !== true &&
        (markAll || wanted[String(n.id)]);
    });
    rows.forEach(function (n) {
      var found = t.find('Inbox', 'id', n.id);
      if (found) t.write(found, { is_read: true });
    });
    return { ok: true, marked: rows.length };
  });
}
