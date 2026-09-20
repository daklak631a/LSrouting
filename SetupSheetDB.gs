/**
 * SetupSheetDB.gs — khởi tạo và nâng cấp kho dữ liệu Sheet.
 *
 * Chạy `createStorageWorkbook()` một lần để tạo một file Google Sheet lưu trữ độc lập.
 * Hàm trả về URL file vừa tạo và lưu ID vào thuộc tính `LS_SHEET_ID` của dự án GAS.
 * Sau đó chạy `setupSheetDB()` khi cần nâng cấp cấu trúc mà không làm mất dữ liệu.
 * Script không xóa tab, không xóa dòng, không đổi dữ liệu sẵn có,
 * nên chạy lại nhiều lần đều an toàn.
 *
 * Cột phải khớp đúng tên trường Code.gs đọc/ghi — lệch một chữ là mất dữ liệu ngầm.
 */

var SCHEMA = {
  Units: ['unit_id', 'name', 'kind', 'sort_order', 'source_tab', 'is_active'],

  // login_code là mã cán bộ dùng để đăng nhập; password_hash chỉ chứa SHA-256,
  // không lưu mật khẩu rõ. auth_group: EXTERNAL (phòng/PGD, không cần mật khẩu)
  // hoặc INTERNAL (LS/KS/quản trị, bắt buộc mật khẩu).
  Users: ['user_id', 'full_name', 'email', 'login_code', 'auth_group', 'password_hash', 'must_change_password',
    'unit_id', 'role', 'sort_order', 'source_tab', 'is_active', 'zalo_name', 'zalo_phone',
    'telegram_chat_id'],

  // Danh mục nguồn của các dropdown trong Sheet kế hoạch (VRM/PRM, sản phẩm,
  // LS). Không xoá dòng đã dùng; chỉ đổi is_active để giữ lịch sử hồ sơ.
  CatalogOptions: ['option_id', 'catalog_key', 'unit_id', 'code', 'label', 'role_kind',
    'sort_order', 'source_tab', 'source_row', 'is_active', 'metadata_json'],

  WorkTypes: ['type_code', 'group_name', 'display_name', 'sort_order', 'is_active',
    'sla_hours', 'requires_appointment', 'requires_ks_approval', 'checklist_json'],

  Reasons: ['code', 'group_name', 'label', 'is_active'],

  MonthlyPlans: ['period_id', 'month_key', 'name', 'start_date', 'end_date', 'activation_at',
    'status', 'spreadsheet_id', 'spreadsheet_url', 'created_by', 'created_at', 'activated_at', 'archived_at'],

  Requests: ['request_id', 'period_id', 'origin_request_id', 'carryover_from_request_id', 'unit_id', 'created_by', 'customer_name', 'customer_kind',
    'cif', 'phone', 'email', 'priority_flags_json', 'requestor_id', 'requestor_name', 'requestor_kind',
    'note', 'created_at', 'updated_at'],

  WorkItems: ['item_id', 'period_id', 'origin_item_id', 'carryover_from_item_id', 'request_id', 'work_type_code', 'product_name', 'occurrence_date',
    'source_stt', 'source_tab', 'status', 'assigned_user_id', 'assigned_by', 'submitted_at', 'accepted_at', 'assigned_at',
    'due_at', 'completed_at', 'appointment_json', 'checklist_json', 'pending_json', 'note',
    // Việc mở sang kỳ sau được nhân thành dòng mới ở kỳ đó. Không đánh dấu dòng
    // cũ thì báo cáo nhiều kỳ đếm một việc thành nhiều việc.
    'carried_to_item_id',
    'version', 'created_at', 'updated_at'],

  Events: ['event_id', 'item_id', 'type', 'by', 'at', 'reason', 'before_json', 'after_json'],

  // --- Gửi tin ---
  Channels: ['code', 'status', 'test_mode', 'allowlist', 'rate_per_hour', 'max_retry', 'config_json', 'updated_at'],

  Templates: ['code', 'name', 'channel', 'status', 'subject', 'body', 'approved_by', 'approved_at'],

  // when_case: DIRECT khi báo thẳng khách, GROUP khi khách không có kênh nào
  // và phải nhờ nhóm Zalo nội bộ. Bỏ trống nghĩa là áp dụng cho mọi trường hợp.
  NotifyRules: ['rule_id', 'event', 'audience', 'channels', 'template_code',
    'enabled', 'needs_confirm', 'throttle_minutes', 'when_case'],

  NotificationOutbox: ['outbox_id', 'idem_key', 'item_id', 'event', 'audience', 'channel',
    'recipient_kind', 'recipient', 'recipient_name', 'template_code', 'body',
    'status', 'note', 'retry_count', 'next_try_at', 'provider_msg_id', 'created_at', 'sent_at'],

  // Một dòng cho mỗi outbox_id; retry chỉ cập nhật dòng cũ, không tạo lượt tính phí mới.
  NotificationMetrics: ['metric_id', 'outbox_id', 'idem_key', 'period_id', 'month_key',
    'item_id', 'event', 'audience', 'channel', 'provider', 'template_code', 'unit_id',
    'work_type_code', 'status', 'provider_msg_id', 'sent_at', 'unit_cost', 'currency',
    'cost_version', 'retry_count', 'created_at', 'updated_at'],

  Inbox: ['id', 'user_id', 'item_id', 'event', 'at', 'is_read'],

  // Số liệu chốt của từng kỳ. Các cột đếm cộng dồn được qua nhiều kỳ vì mỗi việc
  // chỉ tính ở kỳ nó phát sinh; `ton_cuoi_ky` là ảnh chụp nên lấy theo kỳ cuối,
  // không cộng. Giữ `tong_gio_xu_ly` thay vì trung bình để gộp nhiều kỳ vẫn đúng.
  PeriodSummary: ['summary_id', 'period_id', 'month_key', 'dimension', 'dim_key', 'dim_label',
    'phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'ton_cuoi_ky', 'qua_han',
    'tong_gio_xu_ly', 'updated_at'],

  // --- Vận hành ---
  ConfigLog: ['id', 'at', 'by', 'area', 'detail'],

  Settings: ['key', 'value', 'description', 'updated_at']
};

var HEADER_BG = '#006b68';

/**
 * Điểm khởi tạo chính khi triển khai: tạo kho mới hoặc nâng cấp kho đã được gắn.
 * Không dùng Sheet kế hoạch tuần đang vận hành làm kho dữ liệu mới.
 */
function createStorageWorkbook() {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('LS_SHEET_ID');
  var ss, created = false;

  if (savedId) {
    ss = SpreadsheetApp.openById(savedId);
  } else {
    ss = SpreadsheetApp.create('LS-Routing — Kho lưu trữ dữ liệu');
    props.setProperty('LS_SHEET_ID', ss.getId());
    created = true;
  }

  var starter = created ? ss.getSheets()[0] : null;
  var report = setupSheetDB_(ss);
  installMonthlyPlanTrigger();
  Notifications.installWorker();

  // Sheet1 chỉ là tab mặc định của file mới, không thuộc mô hình dữ liệu.
  if (starter && SCHEMA[starter.getName()] === undefined && ss.getSheets().length > 1) {
    ss.deleteSheet(starter);
  }
  ss.setActiveSheet(ss.getSheetByName('Requests'));
  SpreadsheetApp.flush();

  var result = {
    created: created,
    spreadsheet_id: ss.getId(),
    url: ss.getUrl(),
    sheets: Object.keys(SCHEMA),
    changes: report
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function setupSheetDB() {
  var id = PropertiesService.getScriptProperties().getProperty('LS_SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Chưa có kho lưu trữ. Chạy createStorageWorkbook() trước.');
  }
  var report = setupSheetDB_(ss);
  installMonthlyPlanTrigger();
  Notifications.installWorker();
  Logger.log(report.length ? report.join('\n') : 'Kho dữ liệu đã đúng cấu trúc.');
  notify_(report.length ? report.join('\n') : 'Kho dữ liệu đã đúng cấu trúc.');
  return { spreadsheet_id: ss.getId(), url: ss.getUrl(), changes: report };
}

/** Cài trigger nền để kỳ đã tạo sớm tự kích hoạt khi đến ngày bắt đầu. */
function installMonthlyPlanTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (trigger) {
    return trigger.getHandlerFunction() === 'activateMonthlyPlans';
  });
  if (!exists) {
    ScriptApp.newTrigger('activateMonthlyPlans').timeBased().everyHours(1).create();
  }
  return { installed: true, existing: exists };
}

function setupSheetDB_(ss) {
  var report = [];

  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      styleHeader_(sheet, cols.length);
      report.push('Tạo mới: ' + name);
      return;
    }

    if (sheet.getLastColumn() === 0 || !sheet.getRange(1, 1).getValue()) {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      styleHeader_(sheet, cols.length);
      report.push('Ghi tiêu đề: ' + name);
      return;
    }

    // Bổ sung cột còn thiếu vào cuối, giữ nguyên thứ tự cột cũ và toàn bộ dữ liệu.
    var current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var missing = cols.filter(function (c) { return current.indexOf(c) === -1; });
    if (missing.length) {
      sheet.insertColumnsAfter(sheet.getLastColumn(), missing.length);
      sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
      styleHeader_(sheet, current.length + missing.length);
      report.push('Thêm cột ' + name + ': ' + missing.join(', '));
    }
  });

  seedCatalog_(ss, report);
  ensureSourceTemplateSetting_(ss, report);
  upgradeWorkTypeAppointment_(ss, report);
  return report;
}

/** Bổ sung một dòng danh mục theo mã mà không đụng dữ liệu đã có. */
function appendIfMissingRow_(sheet, keyColumn, keyValue, defaults, report, label) {
  if (!sheet || sheet.getLastColumn() < 1) return false;
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [];
  var keyIndex = header.indexOf(keyColumn);
  if (keyIndex === -1) return false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][keyIndex] || '').trim() === String(keyValue)) return false;
  }
  var row = header.map(function (column) {
    return Object.prototype.hasOwnProperty.call(defaults, column) ? defaults[column] : '';
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, header.length).setValues([row]);
  report.push('Bổ sung ' + label + ': ' + keyValue);
  return true;
}

/**
 * Kho cũ có R6 khai một mẫu ZBS nhưng lại liệt kê cả EMAIL làm kênh dự phòng, và
 * để trống `when_case` nên nó chạy cả khi việc đã chuyển sang đường nhóm nội bộ.
 * Bổ sung mẫu cho từng kênh và đánh dấu R6 là đường báo thẳng khách.
 */
function upgradeAppointmentRule_(rules, report) {
  if (!rules || rules.getLastRow() <= 1) return;
  var values = rules.getDataRange().getValues();
  var header = values[0] || [];
  var idCol = header.indexOf('rule_id');
  var tplCol = header.indexOf('template_code');
  var whenCol = header.indexOf('when_case');
  var chanCol = header.indexOf('channels');
  if (idCol === -1 || tplCol === -1 || whenCol === -1 || chanCol === -1) return;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]).trim() !== 'R6') continue;
    var changed = false;
    var codes = String(values[i][tplCol] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var channels = String(values[i][chanCol] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (channels.indexOf('EMAIL') !== -1 && codes.indexOf('TPL_MAIL_HEN_KY') === -1) { codes.push('TPL_MAIL_HEN_KY'); changed = true; }
    if (channels.indexOf('SMS') !== -1 && codes.indexOf('TPL_SMS_HEN_KY') === -1) { codes.push('TPL_SMS_HEN_KY'); changed = true; }
    if (!String(values[i][whenCol] || '').trim()) {
      rules.getRange(i + 1, whenCol + 1).setValue('DIRECT');
      changed = true;
    }
    if (changed) {
      rules.getRange(i + 1, tplCol + 1).setValue(codes.join(','));
      report.push('Cập nhật quy tắc hẹn khách R6: mẫu theo từng kênh, chỉ chạy khi báo thẳng khách');
    }
    return;
  }
}

/**
 * Kho tạo từ bản cũ có `requires_appointment` tắt ở cả 29 loại việc, nên bước hẹn
 * khách ký chưa bao giờ bắt buộc. Bật một lần cho toàn danh mục rồi ghi cờ vào
 * Settings: chạy lại `setupSheetDB()` sau này không được đè lên lựa chọn của quản trị.
 */
function upgradeWorkTypeAppointment_(ss, report) {
  var settings = ss.getSheetByName('Settings');
  var types = ss.getSheetByName('WorkTypes');
  if (!settings || !types || types.getLastRow() <= 1) return;

  var done = false;
  var settingValues = settings.getLastRow() > 1 ? settings.getDataRange().getValues() : [[]];
  var keyCol = (settingValues[0] || []).indexOf('key');
  if (keyCol !== -1) {
    for (var s = 1; s < settingValues.length; s++) {
      if (String(settingValues[s][keyCol]) === 'work_type_appointment_upgraded') { done = true; break; }
    }
  }
  if (done) return;

  var values = types.getDataRange().getValues();
  var col = (values[0] || []).indexOf('requires_appointment');
  if (col === -1) return;

  var changed = 0;
  var column = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][col]) !== 'true' && values[i][col] !== true) changed += 1;
    column.push([true]);
  }
  if (column.length) types.getRange(2, col + 1, column.length, 1).setValues(column);
  settings.appendRow(['work_type_appointment_upgraded', 'true',
    'Đã bật bắt buộc hẹn khách ký cho toàn bộ loại việc; không chạy lại', new Date().toISOString()]);
  report.push('Bật bắt buộc hẹn khách ký cho ' + changed + ' loại việc');
}

function ensureSourceTemplateSetting_(ss, report) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet || sheet.getLastRow() <= 1) return;
  var values = sheet.getDataRange().getValues();
  var keyCol = values[0].indexOf('key');
  if (keyCol === -1) return;
  for (var i = 1; i < values.length; i++) if (String(values[i][keyCol]) === 'source_template_spreadsheet_id') return;
  var now = new Date().toISOString();
  sheet.appendRow(['source_template_spreadsheet_id', '18CIBRA4nTFDio7Z1P0ESxP1UwR17F_KKXUMTs6ILqSI', 'ID workbook mẫu kế hoạch tháng', now]);
  report.push('Bổ sung cấu hình workbook mẫu kế hoạch tháng');
}

function styleHeader_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground(HEADER_BG)
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 28);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(2, sheet.getMaxRows()), width).createFilter();
}

function notify_(message) {
  try { SpreadsheetApp.getUi().alert(message); } catch (e) { /* chạy không có giao diện */ }
}

/** Chỉ nạp danh mục khi tab còn rỗng — không ghi đè cấu hình đang dùng. */
function seedCatalog_(ss, report) {
  var types = ss.getSheetByName('WorkTypes');
  if (types.getLastRow() <= 1) {
    var rows = legacyWorkTypeRows_();
    types.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    report.push('Nạp danh mục loại việc theo Sheet kế hoạch gốc: ' + rows.length + ' dòng');
  }

  var users = ss.getSheetByName('Users');
  var adminAdded = appendIfMissingRow_(users, 'user_id', 'ADMIN', {
    user_id: 'ADMIN', full_name: 'Quản trị hệ thống', email: '', login_code: 'admin', auth_group: 'INTERNAL',
    password_hash: '', must_change_password: false, unit_id: 'HE_THONG', role: 'ADMIN', sort_order: 1,
    source_tab: 'Cấu hình khởi tạo', is_active: true, zalo_name: '', zalo_phone: ''
  }, report, 'tài khoản quản trị khởi tạo');
  if (adminAdded) report.push('Đã tạo tài khoản admin khởi tạo; mật khẩu mặc định chỉ được kiểm tra phía máy chủ và phải đổi sau khi đăng nhập');

  var units = ss.getSheetByName('Units');
  if (units.getLastRow() <= 1) {
    var u = [
      ['GBS', 'GBS', 'DON_VI_GUI', 1, 'GBS', true],
      ['GDT', 'GDT', 'DON_VI_GUI', 2, 'GDT', true],
      ['KHCN1', 'Phòng KHCN1', 'DON_VI_GUI', 3, 'Phòng KHCN1', true],
      ['KHCN2', 'Phòng KHCN2', 'DON_VI_GUI', 4, 'Phòng KHCN2', true],
      ['PGD_TBM', 'PGD TBM', 'DON_VI_GUI', 5, 'PGD TBM', true],
      ['PGD_DBM', 'PGD DBM', 'DON_VI_GUI', 6, 'PGD DBM', true],
      ['PGD_BMT', 'PGD BMT', 'DON_VI_GUI', 7, 'PGD BMT', true],
      ['PGD_NBM', 'PGD NBM', 'DON_VI_GUI', 8, 'PGD NBM', true],
      ['PHONG_LS', 'Ban tín dụng LS', 'LS', 9, 'DATA FROM LS', true],
      ['HE_THONG', 'Quản trị hệ thống', 'HT', 10, 'Hệ thống', true]
    ];
    units.getRange(2, 1, u.length, u[0].length).setValues(u);
    report.push('Nạp danh mục đơn vị theo Sheet kế hoạch gốc: ' + u.length + ' dòng');
  }

  var catalog = ss.getSheetByName('CatalogOptions');
  if (catalog.getLastRow() <= 1) {
    var options = sourceCatalogRows_();
    if (options.length) catalog.getRange(2, 1, options.length, options[0].length).setValues(options);
    report.push('Nạp dropdown VRM/PRM và sản phẩm theo Sheet kế hoạch gốc: ' + options.length + ' dòng');
  }

  var reasons = ss.getSheetByName('Reasons');
  if (reasons.getLastRow() <= 1) {
    var rs = [
      ['BS_THIEU_CCCD', 'BO_SUNG', 'Thiếu giấy tờ tùy thân', true],
      ['BS_SAI_LOAI', 'BO_SUNG', 'Chọn sai loại việc', true],
      ['BS_THIEU_LIEN_HE', 'BO_SUNG', 'Chưa có số / email liên hệ', true],
      ['TD_CHO_KH', 'TAM_DUNG', 'Chờ khách bổ sung hồ sơ', true],
      ['TD_CHO_PHE_DUYET', 'TAM_DUNG', 'Chờ cấp phê duyệt', true],
      ['HUY_KH_RUT', 'HUY', 'Khách rút yêu cầu', true],
      ['HUY_TRUNG', 'HUY', 'Trùng hồ sơ đã gửi', true]
    ];
    reasons.getRange(2, 1, rs.length, rs[0].length).setValues(rs);
    report.push('Nạp danh mục lý do');
  }

  // Mọi kênh ra ngoài khởi tạo ở trạng thái chưa kích hoạt.
  // Bật lên là quyết định vận hành, không phải mặc định của script.
  var channels = ss.getSheetByName('Channels');
  if (channels.getLastRow() <= 1) {
    var now = new Date().toISOString();
    var ch = [
      ['IN_APP', 'HOAT_DONG', false, '', 0, 0, '{}', now],
      ['EMAIL', 'CHUA_KICH_HOAT', true, '', 120, 3,
        JSON.stringify({ mode: 'MAILAPP', sender: '', project_id: '', scope_ok: false, daily_quota: 100, used_today: 0, unit_cost: 0, currency: 'VND', cost_version: '2026-01' }), now],
      ['ZBS', 'CHUA_KICH_HOAT', true, '', 60, 3,
        JSON.stringify({ oa_id: '', app_id: '', secret_set: false, provider: 'zbs_gateway', secret_ref: 'LS_ZBS_SECRET', unit_cost: 0, currency: 'VND', cost_version: '2026-01' }), now],
      ['SMS', 'CHUA_KICH_HOAT', true, '', 120, 3,
        JSON.stringify({ provider: 'sms_gateway', sender_id: '', secret_ref: 'LS_SMS_TOKEN', unit_cost: 0, currency: 'VND', cost_version: '2026-01' }), now],
      ['GMF', 'CHUA_KICH_HOAT', true, '', 30, 2,
        JSON.stringify({ group_id: '', api_checked: false }), now],
      ['TELEGRAM', 'CHUA_KICH_HOAT', true, '', 60, 2,
        JSON.stringify({ bot_name: '', token_set: false, group_chat_id: '' }), now]
    ];
    channels.getRange(2, 1, ch.length, ch[0].length).setValues(ch);
    report.push('Nạp danh sách kênh, tất cả ở trạng thái chưa kích hoạt');
  }
  appendIfMissingRow_(channels, 'code', 'SMS', {
    code: 'SMS', status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: '', rate_per_hour: 120, max_retry: 3,
    config_json: JSON.stringify({ provider: 'sms_gateway', sender_id: '', secret_ref: 'LS_SMS_TOKEN', unit_cost: 0, currency: 'VND', cost_version: '2026-01' }),
    updated_at: new Date().toISOString()
  }, report, 'kênh SMS cho workbook cũ');

  var templates = ss.getSheetByName('Templates');
  if (templates.getLastRow() <= 1) {
    var tp = [
      ['TPL_GIAO_VIEC', 'Báo giao việc cho cán bộ', 'EMAIL', 'NHAP', 'Việc LS mới: {{ma_viec}}',
        'Bạn được giao xử lý việc {{ma_viec}} — {{loai_viec}} từ {{don_vi}}.\nHạn xử lý: {{han_xu_ly}}.\nMở hệ thống: {{link}}', '', ''],
      ['TPL_BO_SUNG', 'Báo phòng bổ sung hồ sơ', 'EMAIL', 'NHAP', 'Cần bổ sung hồ sơ: {{ma_viec}}',
        'Việc {{ma_viec}} — {{loai_viec}} cần bổ sung thông tin trước khi LS tiếp nhận.\nMở hệ thống: {{link}}', '', ''],
      ['TPL_QUA_HAN', 'Nhắc việc quá hạn', 'EMAIL', 'NHAP', 'Quá hạn: {{ma_viec}}',
        'Việc {{ma_viec}} — {{loai_viec}} đã quá hạn {{han_xu_ly}}.\nMở hệ thống: {{link}}', '', ''],
      ['TPL_HEN_KY', 'Mời khách đến ký hồ sơ', 'ZBS', 'NHAP', '',
        'Kính chào {{ten_khach}}, {{ten_ngan_hang}} mời Quý khách đến {{dia_diem}} lúc {{thoi_gian}} để hoàn tất thủ tục.\nLiên hệ {{hotline}} nếu cần đổi lịch.', '', ''],
      ['TPL_SMS_HEN_KY', 'SMS mời khách đến ký hồ sơ', 'SMS', 'NHAP', '',
        '{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}}. Liên hệ {{hotline}} nếu cần đổi lịch.', '', ''],
      ['TPL_MAIL_HEN_KY', 'Email mời khách đến ký hồ sơ', 'EMAIL', 'NHAP', 'Lịch hẹn ký hồ sơ: {{ma_viec}}',
        'Kính chào {{ten_khach}},\n{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}} để hoàn tất thủ tục.\nLiên hệ {{hotline}} nếu cần đổi lịch.', '', ''],
      ['TPL_NHOM_HEN_KY', 'Nhắn nhóm nội bộ nhờ mời khách lên ký', 'GMF', 'NHAP', '',
        '{{tag_can_bo}} việc {{ma_viec}} ({{don_vi}}) cần mời khách lên ký lúc {{gio_ky}} ngày {{ngay_ky}} tại {{noi_ky}}. Mở hệ thống: {{link}}', '', '']
    ];
    templates.getRange(2, 1, tp.length, tp[0].length).setValues(tp);
    report.push('Nạp mẫu tin ở trạng thái nháp — phải duyệt trước khi gửi');
  }
  appendIfMissingRow_(templates, 'code', 'TPL_SMS_HEN_KY', {
    code: 'TPL_SMS_HEN_KY', name: 'SMS mời khách đến ký hồ sơ', channel: 'SMS', status: 'NHAP', subject: '',
    body: '{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}}. Liên hệ {{hotline}} nếu cần đổi lịch.',
    approved_by: '', approved_at: ''
  }, report, 'mẫu SMS nháp cho workbook cũ');

  appendIfMissingRow_(templates, 'code', 'TPL_MAIL_HEN_KY', {
    code: 'TPL_MAIL_HEN_KY', name: 'Email mời khách đến ký hồ sơ', channel: 'EMAIL', status: 'NHAP',
    subject: 'Lịch hẹn ký hồ sơ: {{ma_viec}}',
    body: 'Kính chào {{ten_khach}},\n{{ten_ngan_hang}} mời Quý khách đến {{noi_ky}} lúc {{gio_ky}} ngày {{ngay_ky}} để hoàn tất thủ tục.\nLiên hệ {{hotline}} nếu cần đổi lịch.',
    approved_by: '', approved_at: ''
  }, report, 'mẫu email hẹn ký cho workbook cũ');

  appendIfMissingRow_(templates, 'code', 'TPL_NHOM_HEN_KY', {
    code: 'TPL_NHOM_HEN_KY', name: 'Nhắn nhóm nội bộ nhờ mời khách lên ký', channel: 'GMF', status: 'NHAP', subject: '',
    body: '{{tag_can_bo}} việc {{ma_viec}} ({{don_vi}}) cần mời khách lên ký lúc {{gio_ky}} ngày {{ngay_ky}} tại {{noi_ky}}. Mở hệ thống: {{link}}',
    approved_by: '', approved_at: ''
  }, report, 'mẫu tin nhóm nội bộ cho workbook cũ');

  // Mỗi quy tắc khai mẫu theo từng kênh dự phòng: "mẫu ZBS,mẫu email". Khai một
  // mã duy nhất rồi rơi về "mẫu đã duyệt bất kỳ của kênh" là cách gửi nhầm nội dung.
  var rules = ss.getSheetByName('NotifyRules');
  if (rules.getLastRow() <= 1) {
    var rl = [
      ['R1', 'DA_PHAN_CONG', 'CAN_BO', 'IN_APP,EMAIL', 'TPL_GIAO_VIEC', true, false, 0, ''],
      ['R2', 'DOI_NGUOI', 'CAN_BO', 'IN_APP,EMAIL', 'TPL_GIAO_VIEC', true, false, 0, ''],
      ['R3', 'CAN_BO_SUNG', 'PHONG_GUI', 'IN_APP,EMAIL', 'TPL_BO_SUNG', true, false, 0, ''],
      ['R4', 'DE_NGHI_SUA', 'KS', 'IN_APP', '', true, false, 0, ''],
      ['R5', 'QUA_HAN', 'CAN_BO', 'IN_APP,EMAIL', 'TPL_QUA_HAN', true, false, 240, ''],
      ['R6', 'DANG_HEN_KH', 'KHACH', 'ZBS,SMS,EMAIL', 'TPL_HEN_KY,TPL_SMS_HEN_KY,TPL_MAIL_HEN_KY', true, true, 0, 'DIRECT'],
      ['R7', 'HOAN_THANH_LS', 'PHONG_GUI', 'IN_APP', '', true, false, 0, ''],
      ['R8', 'DANG_HEN_KH', 'NHOM', 'GMF,TELEGRAM', 'TPL_NHOM_HEN_KY', true, false, 0, 'GROUP']
    ];
    rules.getRange(2, 1, rl.length, rl[0].length).setValues(rl);
    report.push('Nạp quy tắc thông báo');
  }

  appendIfMissingRow_(rules, 'rule_id', 'R8', {
    rule_id: 'R8', event: 'DANG_HEN_KH', audience: 'NHOM', channels: 'GMF,TELEGRAM',
    template_code: 'TPL_NHOM_HEN_KY', enabled: true, needs_confirm: false, throttle_minutes: 0, when_case: 'GROUP'
  }, report, 'quy tắc báo nhóm nội bộ khi khách không có kênh liên hệ');

  upgradeAppointmentRule_(rules, report);

  var settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() <= 1) {
    var t = new Date().toISOString();
    var cfg = [
      ['schema_version', '5', 'Phiên bản cấu trúc bảng', t],
      ['source_template', 'KE HOACH HO TRO TIN DUNG T9.2026 TUAN 4', 'Mẫu Sheet gốc dùng để nạp đơn vị và danh mục loại việc', t],
      ['source_template_spreadsheet_id', '18CIBRA4nTFDio7Z1P0ESxP1UwR17F_KKXUMTs6ILqSI', 'ID workbook mẫu để sao chép nguyên tab, công thức, dropdown và định dạng cho từng tháng', t],
      ['bank_name', 'Ngân hàng', 'Tên dùng trong mẫu tin gửi khách', t],
      ['hotline', '', 'Số tổng đài in trong tin hẹn', t],
      ['sign_place', '', 'Nơi ký hồ sơ dùng chung cho mọi đơn vị', t],
      ['app_url', '', 'Link cán bộ mở từ thông báo', t],
      ['timezone', 'Asia/Ho_Chi_Minh', 'Múi giờ mốc thời gian và báo cáo', t],
      ['week_start', 'MONDAY', 'Ngày đầu tuần của kỳ báo cáo', t],
      ['work_days', '1,2,3,4,5', 'Ngày làm việc, 1 là thứ Hai', t],
      ['work_open', '08:00', 'Giờ bắt đầu làm việc', t],
      ['work_close', '17:30', 'Giờ kết thúc làm việc', t],
      ['work_break', '11:30-13:00', 'Khoảng nghỉ trưa', t],
      ['holidays', '', 'Ngày nghỉ, cách nhau bằng dấu phẩy', t],
      ['backlog_alert', '20', 'Ngưỡng cảnh báo tồn hàng đợi gửi', t],
      ['export_row_limit', '5000', 'Giới hạn dòng mỗi lần xuất báo cáo', t],
      ['retention_months', '60', 'Thời hạn lưu dữ liệu', t],
      ['env', 'THU_NGHIEM', 'Môi trường vận hành', t],
      ['gateway_url', '', 'Điểm nhận yêu cầu gửi tin ngoài', t],
      ['gateway_auth_ref', 'LS_GATEWAY_TOKEN', 'Tên thuộc tính ScriptProperties chứa token gateway, không lưu token trong Sheet', t],
      ['gateway_token_set', 'false', 'Đã nạp token gateway vào thuộc tính script', t]
    ];
    settings.getRange(2, 1, cfg.length, cfg[0].length).setValues(cfg);
    report.push('Nạp cấu hình mặc định');
  }
}

/**
 * Snapshot danh mục nhìn thấy trong file mẫu ngày 19/09/2026.
 * Các dòng có source_tab/source_row để Admin biết nguồn và có thể hiệu chỉnh.
 */
function sourceCatalogRows_() {
  var out = [], n = 0;
  function add(key, unit, label, role, tab, row) {
    n += 1;
    out.push(['OPT_' + ('000' + n).slice(-4), key, unit || '',
      key === 'PRODUCT' ? 'PRODUCT_' + ('000' + n).slice(-4) : role + '_' + unit + '_' + ('00' + n).slice(-2),
      label, role || '', n, tab, row || '', true, '{}']);
  }
  [
    ['KHCN1', 'Trần Thị Lệ Trang'], ['KHCN1', 'Phan Đức Hiển'], ['KHCN1', 'Ngô Trung Thành'],
    ['KHCN1', 'Trần Thị Hoàng'], ['KHCN1', 'Đỗ Mạnh Cường'], ['KHCN1', 'Trần Văn Hùng'],
    ['KHCN1', 'Đinh Thế Phước'], ['KHCN1', 'Phan Thị Thảo Trang'],
    ['KHCN2', 'Ngô Thị Lan Phương'], ['KHCN2', 'Nguyễn Hoàng Huỳnh'], ['KHCN2', 'Đinh Thị Thanh Loan'],
    ['KHCN2', 'Nguyễn Thị Hồng Vân'], ['KHCN2', 'Võ Nguyễn Thảo'], ['KHCN2', 'Nguyễn Vy'],
    ['PGD_DBM', 'Nguyễn Văn Quý'],
    ['PGD_BMT', 'Nguyễn Văn Tuấn'], ['PGD_BMT', 'Bùi Thị Phương Vi'], ['PGD_BMT', 'Lưu Trà Mai'],
    ['PGD_BMT', 'Hoàng Văn Lương'],
    ['PGD_NBM', 'Nguyễn Phi Hùng'], ['PGD_NBM', 'Nguyễn Tiến Thủy']
  ].forEach(function (r, i) {
    var tab = { KHCN1: 'Phòng KHCN1', KHCN2: 'Phòng KHCN2', PGD_DBM: 'PGD DBM', PGD_BMT: 'PGD BMT', PGD_NBM: 'PGD NBM' }[r[0]] || r[0];
    add('REQUESTOR', r[0], r[1], 'VRM_PRM', tab, i + 1);
  });
  legacyWorkTypeRows_().forEach(function (r, i) { add('PRODUCT', '', r[2], 'PRODUCT', 'GBS', i + 1); });
  return out;
}

/**
 * Danh mục giữ nguyên tên hiển thị ở dropdown Sheet kế hoạch gốc.
 * SLA/đặt lịch là cấu hình mới của ứng dụng, phải được KS rà soát trước Go-live.
 */
function legacyWorkTypeRows_() {
  var names = [
    ['Món', 'Món - Vay mới TSĐB- Tiêu dùng'],
    ['Món', 'Món- Vay lại TSĐB- Tiêu dùng'],
    ['Món', 'Món- Vay mới SXKD'],
    ['Món', 'Món- Vay lại SXKD'],
    ['Món', 'Món- Nhà ở - Vay mới'],
    ['Món', 'Món- Nhà ở - Vay lại'],
    ['Món', 'Món -Nhà ở - GN tiến độ/ tăng thêm'],
    ['Món', 'Món- Ôtô- Vay mới'],
    ['Món', 'Món- Cho vay/HMTC cầm cố STK/TG'],
    ['Món', 'Món - Vay mới Tín chấp (Lương....)'],
    ['Món', 'Món - Vay lại Tín chấp (Lương....)'],
    ['HM SXKD', 'HM SXKD- Mới- Khởi tạo HM'],
    ['HM SXKD', 'HM SXKD- Giải ngân từng lần'],
    ['Thấu chi', 'Thấu chi - Vay mới- Tiêu dùng'],
    ['Thấu chi', 'Thấu chi - Vay mới- SXKD'],
    ['Thấu chi', 'Thấu chi - Vay mới- Tín chấp'],
    ['Thấu chi', 'Thấu chi - Tái cấp- Tiêu dùng'],
    ['Thấu chi', 'Thấu chi - Tái cấp- SXKD'],
    ['Thấu chi', 'Thấu chi - Tái cấp- Tín chấp'],
    ['Thẻ tín dụng', 'Thẻ tín dụng - Có TSĐB'],
    ['Thẻ tín dụng', 'Thẻ tín dụng - Tín chấp'],
    ['TSĐB', 'ĐC Nhập tăng TSĐB/ Ký lại PLHD'],
    ['TSĐB', 'ĐC Xuất giảm TSĐB/ Ký lại PLHD'],
    ['TSĐB', 'Xuất TSĐB/ Xóa thế chấp'],
    ['TSĐB', 'Thay đổi TSĐB (Đổi GCN QSDD, Hoàn công,,,)'],
    ['TSĐB', 'Nhập mới/ Nhập thêm TSĐB/ ĐKTC'],
    ['TSĐB', 'Mượn TSĐB'],
    ['TSĐB', 'Thủ tục TSĐB khác'],
    ['Khác', 'Công việc tín dụng khác']
  ];
  // Mọi loại việc tín dụng của LS đều kết thúc bằng việc khách lên ký, nên
  // requires_appointment bật sẵn cho cả danh mục.
  return names.map(function (row, index) {
    return ['LEGACY_' + ('0' + (index + 1)).slice(-2), row[0], row[1], index + 1, true, 8, true, true, '[]'];
  });
}
