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
    'telegram_chat_id', 'availability_status', 'off_from', 'off_to', 'off_reason', 'replacement_user_id',
    'receive_completion_email', 'linked_email'],

  // Danh mục nguồn của các dropdown trong Sheet kế hoạch (VRM/PRM, sản phẩm,
  // LS). Không xoá dòng đã dùng; chỉ đổi is_active để giữ lịch sử hồ sơ.
  CatalogOptions: ['option_id', 'catalog_key', 'unit_id', 'code', 'label', 'role_kind',
    'sort_order', 'source_tab', 'source_row', 'is_active', 'metadata_json'],

  WorkTypes: ['type_code', 'group_name', 'display_name', 'sort_order', 'is_active',
    'sla_hours', 'requires_appointment', 'requires_ks_approval', 'checklist_json'],

  Reasons: ['code', 'group_name', 'label', 'is_active'],

  MonthlyPlans: ['period_id', 'month_key', 'name', 'start_date', 'end_date', 'activation_at',
    'status', 'spreadsheet_id', 'spreadsheet_url', 'created_by', 'created_at', 'activated_at', 'archived_at',
    'handoff_from_period_id', 'handoff_status', 'handoff_completed_at'],

  StaffPlans: ['plan_id', 'period_type', 'start_date', 'end_date', 'status', 'version',
    'lines_json', 'snapshot_json', 'assigned_by', 'assigned_at', 'updated_at'],
  StaffPlanHistory: ['history_id', 'plan_id', 'version', 'action', 'by', 'at', 'plan_json'],

  Requests: ['request_id', 'period_id', 'origin_request_id', 'carryover_from_request_id', 'unit_id', 'created_by', 'customer_name', 'customer_kind',
    'cif', 'phone', 'email', 'priority_flags_json', 'requestor_id', 'requestor_name', 'requestor_kind',
    'note', 'created_at', 'updated_at'],

  WorkItems: ['item_id', 'period_id', 'origin_item_id', 'carryover_from_item_id', 'request_id', 'work_type_code', 'product_name', 'collateral_mode', 'requested_mortgage_contract_count', 'requested_export_folder_count', 'occurrence_date',
    'source_stt', 'source_tab', 'status', 'assigned_user_id', 'assigned_by', 'last_assignee_id', 'submitted_at', 'accepted_at', 'assigned_at',
    'due_at', 'due_at_override', 'completed_at', 'processing_started_at', 'appointment_json', 'checklist_json', 'pending_json', 'note',
    'dossier_received_at', 'dossier_received_by', 'timing_source', 'first_assigned_at', 'processing_sessions_json', 'sla_pause_log_json', 'execution_state', 'execution_changed_at',
    // Việc mở sang kỳ sau được nhân thành dòng mới ở kỳ đó. Không đánh dấu dòng
    // cũ thì báo cáo nhiều kỳ đếm một việc thành nhiều việc.
    'carried_to_item_id',
    // Việc kèm (vd. hồ sơ TSĐB mới phát sinh khi đang làm vay món) trỏ về việc chính.
    'parent_item_id',
    // Các khoảng dừng đồng hồ xử lý [[từ, đến], ...]: tạm dừng, chờ khách ký, chờ
    // người mới nhận, đã hủy/hoàn thành. Đến rỗng nghĩa là đang dừng.
    'pause_log_json',
    // Mốc bắt đầu chờ bên ngoài (tạm dừng / đang hẹn khách): hạn xử lý được lùi
    // đúng số giờ làm đã chờ khi việc quay lại xử lý. Rỗng nghĩa là hạn đang chạy.
    'sla_paused_at',
    // Ưu tiên vận hành do quy tắc tự giao hoặc quản lý chọn khi phân công.
    'is_priority',
    // Giao dịch hệ thống cán bộ LS tick khi hoàn thành hồ sơ vay: {"GIAI_NGAN":true,"RLOS":true}.
    // Rỗng nghĩa là hồ sơ hoàn thành trước khi có tick — bảng ngày đoán theo tên loại việc.
    'result_flags_json',
    // Phần việc cán bộ cũ đã làm xong lúc bị đổi người, tính kết quả cho họ:
    // {"HD_THE_CHAP":{"user_id":"...","at":"...","by":"..."}}. Người nhận chỉ được tính phần còn lại.
    'result_credit_json',
    // Hẹn bổ sung do Phòng/PGD ghi sau khi đổi ngày phát sinh: {"at","note","by","created_at"}; không bắt buộc, không đổi luồng.
    'supplement_json',
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
    'status', 'note', 'retry_count', 'next_try_at', 'provider_msg_id', 'created_at', 'sent_at',
    'claim_token', 'claim_until'],

  // Chỉ mục bền vững cho khóa chống tạo/gửi trùng. Không quét đuôi outbox vì
  // lịch sử có thể dài hơn mọi ngưỡng hiển thị.
  NotificationIdempotency: ['idem_key', 'outbox_id', 'created_at'],

  // Một dòng cho mỗi outbox_id; retry chỉ cập nhật dòng cũ, không tạo lượt tính phí mới.
  NotificationMetrics: ['metric_id', 'outbox_id', 'idem_key', 'period_id', 'month_key',
    'item_id', 'event', 'audience', 'channel', 'provider', 'template_code', 'unit_id',
    'work_type_code', 'status', 'provider_msg_id', 'sent_at', 'unit_cost', 'currency',
    'cost_version', 'retry_count', 'created_at', 'updated_at'],

  Inbox: ['id', 'user_id', 'item_id', 'event', 'at', 'is_read', 'detail', 'subject_user_id'],

  // Số liệu chốt của từng kỳ. Các cột đếm cộng dồn được qua nhiều kỳ vì mỗi việc
  // chỉ tính ở kỳ nó phát sinh; `ton_cuoi_ky` là ảnh chụp nên lấy theo kỳ cuối,
  // không cộng. Giữ tổng giờ và số mẫu của từng đoạn để gộp nhiều kỳ vẫn đúng.
  PeriodSummary: ['summary_id', 'period_id', 'month_key', 'dimension', 'dim_key', 'dim_label', 'timing_formula_version',
    'phat_sinh', 'chuyen_tiep_vao', 'hoan_thanh', 'huy', 'ton_cuoi_ky', 'qua_han',
    'tong_gio_tiep_nhan', 'so_tiep_nhan', 'tong_gio_phan_cong', 'so_phan_cong',
    'tong_gio_xu_ly', 'so_xu_ly', 'tong_gio_toan_trinh', 'so_toan_trinh', 'updated_at'],

  // Điểm vận hành được chốt một lần khi kỳ đóng; không tính lại ngược lịch sử.
  OperationalScoreSnapshots: ['snapshot_id', 'period_id', 'month_key', 'formula_version',
    'user_id', 'full_name', 'eligible', 'done', 'timed_done', 'on_time', 'late_open', 'open',
    'on_time_rate', 'completion_rate', 'backlog_rate', 'score', 'data_quality',
    'captured_at', 'captured_by'],

  // --- Vận hành ---
  ConfigLog: ['id', 'at', 'by', 'area', 'detail'],

  // Sổ lưu riêng các việc đã hủy: không xóa dòng WorkItems (giữ lịch sử, báo cáo),
  // nhưng mỗi lần hủy chép một dòng ảnh chụp sang đây kèm lý do và người hủy/đề nghị.
  CanceledItems: ['cancel_id', 'item_id', 'request_id', 'period_id', 'unit_id', 'source_stt', 'customer_name', 'cif',
    'work_type_code', 'product_name', 'status_before', 'assigned_user_id', 'reason',
    'canceled_by', 'canceled_at', 'requested_by', 'requested_at', 'requested_reason'],

  // Việc khác cán bộ LS tự ghi kèm số lượng (họp đầu ngày, scan hoàn thiện hồ sơ...), không gắn hồ sơ nào.
  // Cộng vào dòng Khác của bảng kết quả ngày theo work_date. Ghi nhầm thì đánh dấu canceled_at, không xóa dòng.
  // minutes: số phút chia cho lượt này khi kết thúc Tạm dừng toàn bộ; operation_id: lượt tạm dừng mà nó thuộc về (rỗng nếu ghi ngoài lượt tạm dừng).
  OtherWork: ['work_id', 'user_id', 'work_date', 'category', 'quantity', 'minutes', 'operation_id', 'at', 'canceled_at', 'canceled_by'],

  Settings: ['key', 'value', 'description', 'updated_at']
};

var HEADER_BG = '#006b68';

/**
 * Điểm khởi tạo chính khi triển khai: tạo kho mới hoặc nâng cấp kho đã được gắn.
 * Không dùng Sheet kế hoạch tuần đang vận hành làm kho dữ liệu mới.
 */
function createStorageWorkbook() {
  requireAdmin_();
  return createStorageWorkbook_();
}

/** Khởi tạo kho từ trình soạn thảo khi chưa có tài khoản ứng dụng. */
function createStorageWorkbook_() {
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
  installMonthlyPlanTrigger_();
  installMaintenanceTrigger_();
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
  requireAdminOrScriptOwner_();
  return setupSheetDBEditor_();
}

function setupSheetDBEditor_() {
  var id = PropertiesService.getScriptProperties().getProperty('LS_SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Chưa có kho lưu trữ. Chạy createStorageWorkbook() trước.');
  }
  var report = setupSheetDB_(ss);
  installMonthlyPlanTrigger_();
  installMaintenanceTrigger_();
  Notifications.installWorker();
  Logger.log(report.length ? report.join('\n') : 'Kho dữ liệu đã đúng cấu trúc.');
  notify_(report.length ? report.join('\n') : 'Kho dữ liệu đã đúng cấu trúc.');
  return { spreadsheet_id: ss.getId(), url: ss.getUrl(), changes: report };
}

/** Cài trigger nền để kỳ đã tạo sớm tự kích hoạt khi đến ngày bắt đầu. */
function installMonthlyPlanTrigger() {
  requireAdmin_();
  return installMonthlyPlanTrigger_();
}

/** Giữ đúng một trigger cho handler; trả true nếu đã có. */
function keepSingleTrigger_(triggers, handler) {
  var seen = false;
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() !== handler) return;
    if (seen) ScriptApp.deleteTrigger(trigger);
    seen = true;
  });
  return seen;
}

function installMonthlyPlanTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if(trigger.getHandlerFunction() === 'activateMonthlyPlans') ScriptApp.deleteTrigger(trigger);
  });
  // Nhiều lượt chạy cùng lúc từng tạo trigger trùng; giữ một, xóa phần dư.
  var exists = keepSingleTrigger_(triggers, 'activateMonthlyPlans_');
  if (!exists) {
    ScriptApp.newTrigger('activateMonthlyPlans_').timeBased().everyHours(1).create();
  }
  return { installed: true, existing: exists };
}

/** Cài maintenance hằng ngày để backup kho và ghi trạng thái vận hành. */
function installMaintenanceTrigger() {
  requireAdmin_();
  return installMaintenanceTrigger_();
}

function installMaintenanceTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if(trigger.getHandlerFunction() === 'maintenanceTick') ScriptApp.deleteTrigger(trigger);
  });
  // Nhiều lượt chạy cùng lúc từng tạo trigger trùng; giữ một, xóa phần dư.
  var exists = keepSingleTrigger_(triggers, 'maintenanceTick_');
  if (!exists) {
    ScriptApp.newTrigger('maintenanceTick_').timeBased().everyDays(1).atHour(2).create();
  }
  return { installed: true, existing: exists };
}

function maintenanceSetting_(t, key, value, description) {
  var fields = { value: String(value === undefined || value === null ? '' : value), updated_at: new Date().toISOString() };
  var found = t.find('Settings', 'key', key);
  if (found) t.write(found, fields);
  else t.append('Settings', { key: key, value: fields.value, description: description || '', updated_at: fields.updated_at });
}

/**
 * Backup an toàn, lặp lại được: tối đa một bản/ngày, không xóa bản cũ.
 * Backup xong mới ghi dấu vết vào Settings để admin biết bản nào có thể phục hồi.
 */
function backupStorageWorkbook_() {
  var id = PropertiesService.getScriptProperties().getProperty('LS_SHEET_ID');
  if (!id) return { ok: false, skipped: true, reason: 'missing_storage_id' };
  var now = new Date();
  var settings = {};
  DataRepository.getAll('Settings').forEach(function (row) { settings[row.key] = row.value; });
  var lastMs = Date.parse(String(settings.backup_last_at || ''));
  if (isFinite(lastMs) && now.getTime() - lastMs < 24 * 60 * 60 * 1000) {
    return { ok: true, skipped: true, last_backup_at: settings.backup_last_at, backup_id: settings.backup_last_id || '' };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, skipped: true, reason: 'backup_in_progress' };
  try {
    var stamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd_HHmm');
    var copy = DriveApp.getFileById(id).makeCopy('LS-Routing backup ' + stamp);
    var result = { ok: true, skipped: false, backup_id: copy.getId(), backup_url: copy.getUrl(), backup_at: now.toISOString() };
    DataRepository.tx(function (t) {
      maintenanceSetting_(t, 'backup_last_at', result.backup_at, 'Thời điểm backup kho gần nhất');
      maintenanceSetting_(t, 'backup_last_id', result.backup_id, 'ID file backup kho gần nhất');
      maintenanceSetting_(t, 'backup_last_url', result.backup_url, 'URL file backup kho gần nhất');
      maintenanceSetting_(t, 'backup_last_error', '', 'Lỗi backup kho gần nhất');
      maintenanceSetting_(t, 'retention_last_check_at', result.backup_at, 'Lần kiểm tra thời hạn lưu dữ liệu gần nhất');
    });
    return result;
  } catch (err) {
    try {
      DataRepository.tx(function (t) {
        maintenanceSetting_(t, 'backup_last_error', String(err.message || err).substring(0, 300), 'Lỗi backup kho gần nhất');
        maintenanceSetting_(t, 'retention_last_check_at', new Date().toISOString(), 'Lần kiểm tra thời hạn lưu dữ liệu gần nhất');
      });
    } catch (ignore) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function maintenanceTick() {
  requireAdmin_();
  return maintenanceTick_();
}

function maintenanceTick_() {
  var result = backupStorageWorkbook_();
  try { result.staff_plans = closeEndedStaffPlans_(); } catch (err) { Logger.log('Chưa chốt kế hoạch cán bộ: ' + err); }
  try { result.expired_sessions = pruneSessions_(true); } catch (err) { Logger.log('Chưa dọn phiên hết hạn: ' + err); }
  try { result.retention = runRetention_(); } catch (err) { Logger.log('Chưa dọn dữ liệu cũ: ' + err); }
  Logger.log('Maintenance: ' + JSON.stringify(result));
  return result;
}

/**
 * Dọn dữ liệu nhật ký/tin đã xong và đủ cũ, chạy trong khung bảo trì 2h sáng.
 *
 * Chỉ xóa bảng chuyển vận/chống trùng; KHÔNG đụng sổ chi phí (NotificationMetrics)
 * hay nhật ký trạng thái (Events) — hai bảng đó là chứng từ, giữ để archive theo
 * kỳ chứ không xóa theo tuổi. Tin chưa xong (THAT_BAI/DANG_GUI/CHO_*) và thông
 * báo chưa đọc luôn được giữ lại.
 */
function runRetention_() {
  var settings = {};
  DataRepository.getAll('Settings').forEach(function (r) { settings[r.key] = r.value; });

  function days_(key, def) {
    var v = Number(settings[key]);
    return isFinite(v) && v > 0 ? v : def;
  }
  var now = Date.now();
  function olderThan_(ts, days) {
    var t = Date.parse(String(ts || ''));
    return isFinite(t) && (now - t) > days * 86400000;
  }
  var terminal = { DA_GUI: true, KHONG_GUI: true };
  var outboxDays = days_('retention_outbox_days', 7);
  var idemDays = days_('retention_idem_days', 14);
  var inboxDays = days_('retention_inbox_read_days', 30);

  var out = {};
  out.outbox = DataRepository.pruneLeading('NotificationOutbox', function (o) {
    return terminal[o.status] === true && olderThan_(o.created_at, outboxDays);
  });
  out.idempotency = DataRepository.pruneLeading('NotificationIdempotency', function (o) {
    return olderThan_(o.created_at, idemDays);
  });
  out.inbox = DataRepository.pruneLeading('Inbox', function (n) {
    return truthy_(n.is_read) && olderThan_(n.at, inboxDays);
  });
  return out;
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
      forceTextColumns_(sheet, cols.length);
      report.push('Tạo mới: ' + name);
      return;
    }

    if (sheet.getLastColumn() === 0 || !sheet.getRange(1, 1).getValue()) {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      styleHeader_(sheet, cols.length);
      forceTextColumns_(sheet, cols.length);
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
    forceTextColumns_(sheet, Math.max(cols.length, current.length + missing.length));
  });

  seedCatalog_(ss, report);
  ensureSourceTemplateSetting_(ss, report);
  ensureRetentionSettings_(ss, report);
  upgradeWorkTypeAppointment_(ss, report);
  ensureNotificationIdempotency_(ss, report);
  return report;
}

/** Bổ sung chỉ mục idempotency cho outbox cũ mà không tạo bản ghi trùng. */
function ensureNotificationIdempotency_(ss, report) {
  var index = ss.getSheetByName('NotificationIdempotency');
  var outbox = ss.getSheetByName('NotificationOutbox');
  if (!index || !outbox || outbox.getLastRow() <= 1) return;

  var indexValues = index.getDataRange().getValues();
  var indexHeader = indexValues[0] || [];
  var keyCol = indexHeader.indexOf('idem_key');
  if (keyCol === -1) return;
  var known = {};
  for (var i = 1; i < indexValues.length; i++) {
    var existingKey = String(indexValues[i][keyCol] || '').trim();
    if (existingKey) known[existingKey] = true;
  }

  var outboxValues = outbox.getDataRange().getValues();
  var outboxHeader = outboxValues[0] || [];
  var outboxKeyCol = outboxHeader.indexOf('idem_key');
  var outboxIdCol = outboxHeader.indexOf('outbox_id');
  var createdCol = outboxHeader.indexOf('created_at');
  if (outboxKeyCol === -1 || outboxIdCol === -1) return;

  var rows = [];
  for (var j = 1; j < outboxValues.length; j++) {
    var key = String(outboxValues[j][outboxKeyCol] || '').trim();
    if (!key || known[key]) continue;
    known[key] = true;
    var row = indexHeader.map(function (column) {
      if (column === 'idem_key') return key;
      if (column === 'outbox_id') return outboxValues[j][outboxIdCol] || '';
      if (column === 'created_at') return createdCol === -1 ? '' : outboxValues[j][createdCol] || '';
      return '';
    });
    rows.push(row);
  }
  if (rows.length) {
    index.getRange(index.getLastRow() + 1, 1, rows.length, indexHeader.length).setValues(rows);
    report.push('Bổ sung chỉ mục idempotency cho ' + rows.length + ' tin cũ');
  }
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
/**
 * Đưa mẫu email hẹn khách về bản chuẩn thương hiệu. Kho cũ có thể để mẫu này sai kênh
 * (vd. SMS) nên quy tắc R6 không tìm được mẫu cho EMAIL và không bao giờ gửi được.
 *  - Sai kênh: luôn sửa lại EMAIL.
 *  - Chưa được duyệt mà chưa có link chỉ đường: thay bằng bản chuẩn.
 *  Cả hai trường hợp đều chuyển sang CHO_DUYET để Admin xem trước rồi bấm Duyệt. Mẫu đã
 *  duyệt đúng kênh thì giữ nguyên, không ghi đè nội dung Admin đã chốt.
 */
function upgradeMailMapLink_(templates, report) {
  if (!templates || templates.getLastRow() <= 1) return;
  var values = templates.getDataRange().getValues();
  var header = values[0] || [];
  function col(name) { return header.indexOf(name); }
  var codeCol = col('code'), nameCol = col('name'), chanCol = col('channel'), statusCol = col('status'), subjCol = col('subject'),
    bodyCol = col('body'), byCol = col('approved_by'), atCol = col('approved_at');
  if (codeCol === -1 || chanCol === -1 || statusCol === -1 || subjCol === -1 || bodyCol === -1) return;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][codeCol]).trim() !== 'TPL_MAIL_HEN_KY') continue;
    var wrongChannel = String(values[i][chanCol]).trim() !== 'EMAIL';
    var approved = String(values[i][statusCol]).trim() === 'DA_DUYET';
    var hasMap = String(values[i][bodyCol]).indexOf('{{link_ban_do}}') !== -1;
    // Bản chuẩn đời trước (nội dung còn nguyên) được nâng lên bản mới; bản Admin đã tự sửa thì giữ.
    var priorStock = String(values[i][bodyCol]) === 'Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} trân trọng mời Quý khách đến ký hồ sơ theo lịch hẹn dưới đây:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ tổng đài {{hotline}}.\nTrân trọng,\n{{ten_ngan_hang}}';
    if (!wrongChannel && !priorStock && (approved || hasMap)) return;
    var row = i + 1;
    templates.getRange(row, chanCol + 1).setValue('EMAIL');
    if (nameCol !== -1) templates.getRange(row, nameCol + 1).setValue('Email thông báo lịch hẹn ký hồ sơ');
    templates.getRange(row, subjCol + 1).setValue('Thông báo lịch hẹn ký hồ sơ tại {{ten_ngan_hang}}');
    templates.getRange(row, bodyCol + 1).setValue('Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} xin thông báo lịch hẹn ký hồ sơ của Quý khách như sau:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ cán bộ Quản lý.\nTrân trọng,\n{{ten_ngan_hang}}');
    templates.getRange(row, statusCol + 1).setValue('CHO_DUYET');
    if (byCol !== -1) templates.getRange(row, byCol + 1).setValue('');
    if (atCol !== -1) templates.getRange(row, atCol + 1).setValue('');
    report.push('Đưa mẫu email hẹn khách TPL_MAIL_HEN_KY về bản chuẩn thương hiệu' + (wrongChannel ? ' (đã sửa kênh về EMAIL)' : '') + ' — chờ Admin duyệt');
    return;
  }
}

/** Đặt một giá trị cấu hình có sẵn; báo cáo khi có thay đổi. */
function setSettingIfDifferent_(sheet, key, value, report) {
  if (!sheet || sheet.getLastRow() <= 1) return;
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [];
  var keyCol = header.indexOf('key'), valCol = header.indexOf('value'), atCol = header.indexOf('updated_at');
  if (keyCol === -1 || valCol === -1) return;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][keyCol]).trim() !== key) continue;
    if (String(values[i][valCol]) === value) return;
    sheet.getRange(i + 1, valCol + 1).setValue(value);
    if (atCol !== -1) sheet.getRange(i + 1, atCol + 1).setValue(new Date().toISOString());
    report.push('Đặt cấu hình ' + key + ' = ' + value);
    return;
  }
}

function upgradeDoneTemplateWording_(templates, report) {
  if (!templates || templates.getLastRow() <= 1) return;
  var values = templates.getDataRange().getValues();
  var header = values[0] || [];
  var codeCol = header.indexOf('code'), subjCol = header.indexOf('subject'), bodyCol = header.indexOf('body');
  if (codeCol === -1 || subjCol === -1 || bodyCol === -1) return;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][codeCol]).trim() !== 'TPL_DONE_INTERNAL') continue;
    // Chỉ đổi lời văn còn nguyên bản gốc; mẫu Admin đã tự sửa thì giữ.
    if (String(values[i][subjCol]) === 'LS hoàn thành hồ sơ {{ma_viec}}') {
      templates.getRange(i + 1, subjCol + 1).setValue('Hồ sơ {{ma_viec}} đã hoàn thành');
      templates.getRange(i + 1, bodyCol + 1).setValue(String(values[i][bodyCol]).replace('đã hoàn thành phần việc LS.', 'đã hoàn thành.'));
      report.push('Cập nhật lời văn email hoàn thành: Hồ sơ đã hoàn thành');
    }
    return;
  }
}

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

/** Kho cũ chưa có khóa dọn dữ liệu: bổ sung với mặc định để admin chỉnh được. */
function ensureRetentionSettings_(ss, report) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet || sheet.getLastRow() <= 1) return;
  var values = sheet.getDataRange().getValues();
  var keyCol = values[0].indexOf('key');
  if (keyCol === -1) return;
  var have = {};
  for (var i = 1; i < values.length; i++) have[String(values[i][keyCol])] = true;
  var now = new Date().toISOString();
  var defaults = [
    ['retention_outbox_days', '7', 'Số ngày giữ tin đã gửi/không gửi trong hàng đợi trước khi dọn'],
    ['retention_idem_days', '14', 'Số ngày giữ khóa chống trùng tin trước khi dọn'],
    ['retention_inbox_read_days', '30', 'Số ngày giữ thông báo đã đọc trong hộp thư trước khi dọn']
  ];
  var added = 0;
  defaults.forEach(function (row) {
    if (have[row[0]]) return;
    sheet.appendRow([row[0], row[1], row[2], now]);
    added += 1;
  });
  if (added) report.push('Bổ sung ' + added + ' cấu hình dọn dữ liệu cũ');
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

/**
 * Ép toàn bộ cột dữ liệu về định dạng văn bản.
 *
 * Google Sheet tự diễn giải chuỗi giống ngày tháng: ghi 2026-09 thì ô thành
 * kiểu ngày và đọc ra là Date, không còn là 2026-09. Mọi so sánh chuỗi
 * (month_key, start_date, occurrence_date) vì thế sai âm thầm.
 */
function forceTextColumns_(sheet, width) {
  if (!width) return;
  sheet.getRange(1, 1, sheet.getMaxRows(), width).setNumberFormat('@');
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
    source_tab: 'Cấu hình khởi tạo', is_active: true, zalo_name: '', zalo_phone: '', linked_email: '',
    availability_status: 'AVAILABLE', off_from: '', off_to: '', off_reason: '', replacement_user_id: ''
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
      ['TPL_MAIL_HEN_KY', 'Email thông báo lịch hẹn ký hồ sơ', 'EMAIL', 'NHAP', 'Thông báo lịch hẹn ký hồ sơ tại {{ten_ngan_hang}}',
        'Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} xin thông báo lịch hẹn ký hồ sơ của Quý khách như sau:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ cán bộ Quản lý.\nTrân trọng,\n{{ten_ngan_hang}}', '', ''],
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
    code: 'TPL_MAIL_HEN_KY', name: 'Email thông báo lịch hẹn ký hồ sơ', channel: 'EMAIL', status: 'NHAP',
    subject: 'Thông báo lịch hẹn ký hồ sơ tại {{ten_ngan_hang}}',
    body: 'Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} xin thông báo lịch hẹn ký hồ sơ của Quý khách như sau:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ cán bộ Quản lý.\nTrân trọng,\n{{ten_ngan_hang}}',
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
  appendIfMissingRow_(templates,'code','TPL_DONE_INTERNAL',{
    code:'TPL_DONE_INTERNAL',name:'Email báo Phòng/PGD hoàn thành',channel:'EMAIL',status:'DA_DUYET',
    subject:'Hồ sơ {{ma_viec}} đã hoàn thành',
    body:'Hồ sơ {{ma_viec}} — {{loai_viec}} của {{ten_khach}} đã hoàn thành.\nCán bộ LS: {{can_bo_ls}}.\nHoàn thành: {{hoan_thanh_luc}}.\nLịch hẹn KH: {{lich_hen}}.\nXem hồ sơ: {{link}}',
    approved_at:new Date().toISOString()
  },report,'mẫu email hoàn thành cho Phòng/PGD');
  appendIfMissingRow_(rules,'rule_id','R9',{
    rule_id:'R9',event:'HOAN_THANH_LS',audience:'PHONG_PHU_TRACH',channels:'EMAIL',template_code:'TPL_DONE_INTERNAL',
    enabled:true,needs_confirm:false,throttle_minutes:0,when_case:''
  },report,'email hoàn thành cho người gửi hồ sơ và user nhận thông báo của đơn vị');

  appendIfMissingRow_(templates,'code','TPL_APPT_INTERNAL',{
    code:'TPL_APPT_INTERNAL',name:'Email báo Phòng/PGD đã hẹn khách ký',channel:'EMAIL',status:'DA_DUYET',
    subject:'Đã hẹn khách ký hồ sơ {{ma_viec}}',
    body:'Hồ sơ {{ma_viec}} — {{loai_viec}} của {{ten_khach}} đã được LS hẹn khách ký.\nLịch hẹn KH: {{lich_hen}}.\nCán bộ LS: {{can_bo_ls}}.\nXem hồ sơ: {{link}}',
    approved_at:new Date().toISOString()
  },report,'mẫu email báo Phòng/PGD khi LS hẹn khách ký');
  appendIfMissingRow_(rules,'rule_id','R10',{
    rule_id:'R10',event:'DANG_HEN_KH',audience:'PHONG_PHU_TRACH',channels:'EMAIL',template_code:'TPL_APPT_INTERNAL',
    enabled:true,needs_confirm:false,throttle_minutes:0,when_case:''
  },report,'email báo cán bộ Phòng/PGD khi LS đã hẹn khách ký');
  upgradeDoneTemplateWording_(templates,report);
  upgradeMailMapLink_(templates,report);
  var settingsSheet = ss.getSheetByName('Settings');
  setSettingIfDifferent_(settingsSheet, 'bank_name', 'BIDV Đắk Lắk', report);
  [['sign_map_url','','Link Google Maps của nơi ký, chèn vào email hẹn khách'],
   ['brand_color','#006b68','Màu thương hiệu của email (mã #rrggbb)'],
   ['logo_url','','Link https ảnh logo hiện đầu email'],
   ['email_banner_url','','Link https ảnh banner hiện đầu email (nên dưới 150 KB, rộng 1200 px)']].forEach(function (d) {
    appendIfMissingRow_(settingsSheet,'key',d[0],{key:d[0],value:d[1],description:d[2],updated_at:new Date().toISOString()},report,'cấu hình email');
  });

  var settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() <= 1) {
    var t = new Date().toISOString();
    var cfg = [
      ['schema_version', '6', 'Phiên bản cấu trúc bảng', t],
      ['source_template', 'KE HOACH HO TRO TIN DUNG T9.2026 TUAN 4', 'Mẫu Sheet gốc dùng để nạp đơn vị và danh mục loại việc', t],
      ['source_template_spreadsheet_id', '18CIBRA4nTFDio7Z1P0ESxP1UwR17F_KKXUMTs6ILqSI', 'ID workbook mẫu để sao chép nguyên tab, công thức, dropdown và định dạng cho từng tháng', t],
      ['bank_name', 'BIDV Đắk Lắk', 'Tên dùng trong mẫu tin gửi khách', t],
      ['hotline', '', 'Số tổng đài in trong tin hẹn', t],
      ['sign_place', '', 'Nơi ký hồ sơ dùng chung cho mọi đơn vị', t],
      ['sign_map_url', '', 'Link Google Maps của nơi ký, chèn vào email hẹn khách', t],
      ['brand_color', '#006b68', 'Màu thương hiệu của email (mã #rrggbb)', t],
      ['logo_url', '', 'Link https ảnh logo hiện đầu email', t],
      ['email_banner_url', '', 'Link https ảnh banner hiện đầu email (nên dưới 150 KB, rộng 1200 px)', t],
      ['app_url', '', 'Link cán bộ mở từ thông báo', t],
      ['timezone', 'Asia/Ho_Chi_Minh', 'Múi giờ mốc thời gian và báo cáo', t],
      ['week_start', 'MONDAY', 'Ngày đầu tuần của kỳ báo cáo', t],
      ['work_days', '1,2,3,4,5', 'Ngày làm việc, 1 là thứ Hai', t],
      ['work_open', '07:30', 'Giờ bắt đầu làm việc', t],
      ['work_close', '18:00', 'Giờ kết thúc làm việc', t],
      ['work_break', '11:30-13:30', 'Khoảng nghỉ trưa', t],
      ['holidays', '', 'Ngày nghỉ, cách nhau bằng dấu phẩy', t],
      ['backlog_alert', '20', 'Ngưỡng cảnh báo tồn hàng đợi gửi', t],
      ['export_row_limit', '5000', 'Giới hạn dòng mỗi lần xuất báo cáo', t],
      ['retention_months', '60', 'Thời hạn lưu dữ liệu', t],
      ['retention_outbox_days', '7', 'Số ngày giữ tin đã gửi/không gửi trong hàng đợi trước khi dọn', t],
      ['retention_idem_days', '14', 'Số ngày giữ khóa chống trùng tin trước khi dọn', t],
      ['retention_inbox_read_days', '30', 'Số ngày giữ thông báo đã đọc trong hộp thư trước khi dọn', t],
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
