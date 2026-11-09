/**
 * Cầu nối duy nhất giữa giao diện và Apps Script.
 * Khi mở file trực tiếp, adapter tắt hoàn toàn để bản mô phỏng vẫn xem được.
 */
LS.api = (function () {
  'use strict';

  function available() {
    return typeof google !== 'undefined' && google.script && google.script.run;
  }

  /* ---------------- Phiên đăng nhập của riêng trình duyệt này ---------------- */

  var TOKEN_KEY = 'ls_routing_session';
  var memoryToken = null;
  function store() { try { return window.localStorage || null; } catch (e) { return null; } }
  function getToken() {
    if (memoryToken !== null) return memoryToken;
    memoryToken = '';
    try { var s = store(); memoryToken = (s && s.getItem(TOKEN_KEY)) || ''; } catch (e) { memoryToken = ''; }
    return memoryToken;
  }
  function setToken(token) {
    memoryToken = token || '';
    try {
      var s = store();
      if (s) { if (memoryToken) s.setItem(TOKEN_KEY, memoryToken); else s.removeItem(TOKEN_KEY); }
    } catch (e) { /* trình duyệt chặn lưu trữ: phiên chỉ sống tới khi tải lại trang */ }
  }

  var sessionListeners = [];
  function sessionExpired() {
    setToken('');
    sessionListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* ---------------- Gọi máy chủ, phân loại lỗi, thử lại ---------------- */

  // Lỗi tạm thời: mạng rớt (HTTP 0), hết lượt chờ khóa, Google báo quá tải.
  // Gửi lại an toàn vì lệnh ghi mang cùng op_id — máy chủ trả lại kết quả cũ.
  var TRANSIENT = /NetworkError|HTTP 0|Connection failure|failed to fetch|network|timed out|timeout|Lock|too many|simultaneous|Service Spreadsheets|server error|Internal error|unavailable|Exceeded maximum execution|try again/i;

  function wrapError(error) {
    var raw = String(error && error.message ? error.message : error || 'Máy chủ không phản hồi.');
    var m = /^(?:Exception:\s*|Error:\s*)?LS_([A-Z]+):\s*/.exec(raw);
    var err = new Error(m ? raw.slice(m[0].length) : raw);
    err.code = m ? m[1] : '';
    err.session = err.code === 'SESSION';
    err.transient = m ? (err.code === 'BUSY' || err.code === 'PENDING') : TRANSIENT.test(raw);
    return err;
  }

  function invoke(name, args, opId) {
    if (!available()) return Promise.reject(new Error('Ứng dụng chưa chạy trong Google Apps Script.'));
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (error) {
          var err = wrapError(error);
          if (err.session) sessionExpired();
          reject(err);
        })
        .api({ name: name, args: args || [], token: getToken(), op_id: opId || '' });
    });
  }

  // Giãn cách + ngẫu nhiên để 60 trình duyệt cùng gặp nghẽn không cùng bấm lại một lúc.
  var WRITE_DELAYS = [800, 1600, 3000, 5000, 8000, 12000, 15000];
  var READ_DELAYS = [1000, 2500, 5000];

  function withRetry(run, delays, onRetry) {
    var attempt = 0;
    function go() {
      return run().catch(function (err) {
        if (!err || !err.transient || attempt >= delays.length) throw err;
        var wait = delays[attempt] * (0.75 + Math.random() * 0.5);
        attempt += 1;
        if (onRetry) onRetry(attempt, err);
        return new Promise(function (r) { setTimeout(r, wait); }).then(go);
      });
    }
    return go();
  }

  function read(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return withRetry(function () { return invoke(name, args, ''); }, READ_DELAYS);
  }

  /* ---------------- Hàng chờ ghi: bấm là xong, máy chủ nhận theo thứ tự ---------------- */

  var queue = [];
  var active = null;
  var queueListeners = [];
  var unknownListeners = [];
  var writeEpoch = 0;

  function newOpId() {
    return 'op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }
  function queueStatus() {
    return { pending: queue.length + (active ? 1 : 0), retrying: !!(active && active.retrying), epoch: writeEpoch };
  }
  function notifyQueue() {
    var s = queueStatus();
    queueListeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }

  /**
   * Mỗi lệnh ghi xếp vào hàng và gửi lần lượt, không song song: lệnh sau luôn
   * thấy kết quả (version mới) của lệnh trước, và mỗi trình duyệt chỉ chiếm một
   * lượt chạy GAS tại một thời điểm. `args` có thể là hàm để lấy giá trị lúc gửi.
   */
  function write(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      writeEpoch += 1;
      queue.push({ name: name, args: args, op: newOpId(), resolve: resolve, reject: reject, retrying: false });
      notifyQueue();
      pump();
    });
  }

  function pump() {
    if (active || !queue.length) return;
    var job = active = queue.shift();
    notifyQueue();
    var argv = job.args.length === 1 && typeof job.args[0] === 'function' ? job.args[0]() : job.args;
    withRetry(function () { return invoke(job.name, argv, job.op); }, WRITE_DELAYS,
      function () { job.retrying = true; notifyQueue(); })
      .then(job.resolve, function (err) {
        // Hết lượt thử mà vẫn lỗi mạng: chưa biết máy chủ đã ghi hay chưa.
        if (err && err.transient) {
          err.unknownOutcome = true;
          err.message = 'Chưa xác nhận được với máy chủ do mạng/hệ thống bận. Dữ liệu sẽ được tải lại để kiểm tra — đừng nhập lại. (' + err.message + ')';
          unknownListeners.forEach(function (fn) { try { fn(err); } catch (e) {} });
        }
        job.reject(err);
      })
      .then(function () {
        writeEpoch += 1;
        active = null;
        notifyQueue();
        // Để phần xử lý kết quả của lệnh vừa xong (cập nhật version) chạy trước.
        setTimeout(pump, 0);
      });
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', function (e) {
      if (!queueStatus().pending) return;
      e.preventDefault();
      e.returnValue = 'Còn thao tác đang lưu. Rời trang bây giờ có thể làm mất thao tác đó.';
      return e.returnValue;
    });
  }

  function truth(value) { return value === true || String(value).toLowerCase() === 'true'; }
  function json(value, fallback) {
    if (!value) return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (e) { return fallback; }
  }
  function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  // The GAS bridge can omit nullable fields. Required totals must still be
  // present: substituting zero would conceal an incomplete report response.
  function normalizeTimeReport(raw) {
    var invalid = 'Dữ liệu báo cáo thời gian không hợp lệ. Hãy tải lại ứng dụng và chạy báo cáo.';
    function number(value) {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error(invalid);
      var n = Number(value);
      if (!isFinite(n) || n < 0) throw new Error(invalid);
      return n;
    }
    function fields(row, keys) {
      if (!row || typeof row !== 'object') throw new Error(invalid);
      var out = Object.assign({}, row);
      keys.forEach(function (key) { out[key] = number(row[key]); });
      return out;
    }
    if (!raw || !Array.isArray(raw.rows) || !Array.isArray(raw.days)) throw new Error(invalid);
    var out = Object.assign({}, raw);
    out.total = fields(raw.total, ['occupied_hours', 'processing_hours', 'completed', 'other_operation_hours', 'other_operation_count']);
    out.quality = fields(raw.quality, ['missing_handoff', 'unattributed_sessions']);
    out.quality.other_operations_scan_limited = !!(raw.quality && raw.quality.other_operations_scan_limited);
    out.days = raw.days.map(function (r) { return fields(r, ['occupied_hours', 'processing_hours', 'completed', 'other_operation_hours', 'other_operation_count']); });
    out.other_work = (raw.other_work || []).map(function (r) { return { category: r.category, label: r.label, quantity: Number(r.quantity) || 0, minutes: Number(r.minutes) || 0 }; });
    out.rows = raw.rows.map(function (r) {
      var row = fields(r, ['occupied_hours', 'processing_hours', 'completed', 'items', 'on_time', 'timed_completed', 'other_operation_hours', 'other_operation_count']);
      row.avg_sla_hours = r.avg_sla_hours === null || r.avg_sla_hours === undefined ? null : number(r.avg_sla_hours);
      row.avg_cycle_hours = r.avg_cycle_hours === null || r.avg_cycle_hours === undefined ? null : number(r.avg_cycle_hours);
      return row;
    });
    return out;
  }

  /** Chuyển hàng dữ liệu Sheet thành cấu trúc UI duy nhất, không lộ bí mật kênh gửi. */
  function normalize(raw) {
    var out = LS.domain.seed();
    raw = raw || {};
    out.monitorSummary = raw.monitorSummary || null;
    out.updateNotice = raw.updateNotice || null;
    out.session = raw.me ? raw.me.user_id : null;
    out.mustChangePassword = !!(raw.me && raw.me.must_change_password);
    out.staffPlans = raw.staff_plans || [];
    out.users = (raw.users || []).map(function (u) {
      return { user_id: u.user_id, full_name: u.full_name, email: u.email || '', linked_email: u.linked_email || u.email || '', role: u.role, unit_id: u.unit_id,
        sort_order: Number(u.sort_order) || 9999, source_tab: u.source_tab || '', active: truth(u.is_active),
        login_code: u.login_code || u.user_id || '', auth_group: u.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL',
        zalo_name: u.zalo_name || '', zalo_phone: LS.normalizePhone(u.zalo_phone), telegram_chat_id: String(u.telegram_chat_id || ''),
        receive_completion_email:truth(u.receive_completion_email),
        availability_status: String(u.availability_status || 'AVAILABLE').toUpperCase(),
        off_from: u.off_from || '', off_to: u.off_to || '', off_reason: u.off_reason || '', replacement_user_id: u.replacement_user_id || '' };
    });
    if (raw.me && !LS.byId(out.users, 'user_id', raw.me.user_id)) {
      out.users.push({ user_id: raw.me.user_id, login_code: raw.me.user_id, auth_group: raw.me.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL', full_name: raw.me.full_name, email: raw.me.email, linked_email: raw.me.linked_email || raw.me.email || '', role: raw.me.role, unit_id: raw.me.unit_id, active: true });
    }
    out.units = (raw.units || []).map(function (u) {
      return { unit_id: u.unit_id, name: u.name, kind: u.kind === 'DON_VI_GUI' ? 'PGD' : u.kind,
        sort_order: Number(u.sort_order) || 9999, source_tab: u.source_tab || '', active: truth(u.is_active) };
    });
    out.catalogOptions = (raw.catalogOptions || []).map(function (x) {
      return { option_id: x.option_id, catalog_key: x.catalog_key, unit_id: x.unit_id || '', code: x.code || '',
        label: x.label || '', role_kind: x.role_kind || '', sort_order: Number(x.sort_order) || 9999,
        source_tab: x.source_tab || '', source_row: x.source_row || '', active: truth(x.is_active), metadata: json(x.metadata_json, {}) };
    });
    (out.users || []).forEach(function (u) {
      if (u.role === 'CAN_BO_LS' && u.active) out.catalogOptions.push({
        option_id: 'USER_' + u.user_id, catalog_key: 'LS_STAFF', unit_id: u.unit_id || 'PHONG_LS', code: u.user_id,
        label: u.full_name, role_kind: 'LS', sort_order: 9999, source_tab: 'Users', source_row: '', active: true, metadata: { email: u.email }
      });
    });
    out.workTypes = (raw.workTypes || []).map(function (w) {
      return {
        code: w.type_code, name: w.display_name, group: w.group_name || '', sla_hours: Number(w.sla_hours) || 8,
        needs_appointment: truth(w.requires_appointment), needs_ks_approval: truth(w.requires_ks_approval),
        active: truth(w.is_active), sort_order: Number(w.sort_order) || 9999, checklist: json(w.checklist_json, [])
      };
    });
    out.reasons = (raw.reasons || []).map(function (r) {
      return { code: r.code, group: r.group_name, label: r.label, active: truth(r.is_active) };
    });
    out.requests = (raw.requests || []).map(function (r) {
      return {
        request_id: r.request_id, period_id: r.period_id || '', unit_id: r.unit_id, created_by: r.created_by, created_at: r.created_at,
        updated_at: r.updated_at, note: r.note || '',
        requestor: { id: r.requestor_id || '', name: r.requestor_name || '', kind: r.requestor_kind || '' },
        customer: { name: r.customer_name, kind: r.customer_kind, cif: String(r.cif === null || r.cif === undefined ? '' : r.cif), phone: LS.normalizePhone(r.phone), email: String(r.email || '').trim(), priority_flags: json(r.priority_flags_json, []) }
      };
    });
    out.items = (raw.items || []).map(function (i) {
      return {
        item_id: i.item_id, updated_at: i.updated_at || '', period_id: i.period_id || '', parent_item_id: i.parent_item_id || '', collateral_mode: i.collateral_mode || 'NONE', carryover_from_item_id: i.carryover_from_item_id || '', origin_item_id: i.origin_item_id || '', carried_to_item_id: i.carried_to_item_id || '', source_stt: i.source_stt || '', source_tab: i.source_tab || '', request_id: i.request_id, work_type_code: i.work_type_code, product_name: i.product_name,
        occurrence_date: i.occurrence_date, status: i.status, assigned_user_id: i.assigned_user_id || '', assigned_by: i.assigned_by || '', last_assignee_id: i.last_assignee_id || '',
        is_priority: truth(i.is_priority),
        submitted_at: i.submitted_at || '', accepted_at: i.accepted_at || '', assigned_at: i.assigned_at || '', due_at: i.due_at || '', due_at_override: i.due_at_override || '', sla_paused_at: i.sla_paused_at || '',
        dossier_received_at: i.dossier_received_at || '', dossier_received_by: i.dossier_received_by || '', timing_source: i.timing_source || 'LEGACY_UNCONFIRMED', first_assigned_at: i.first_assigned_at || '',
        execution_state:i.execution_state || '', execution_changed_at:i.execution_changed_at || '',
        processing_sessions: i.processing_sessions_json ? json(i.processing_sessions_json, []) : undefined, sla_pause_log: json(i.sla_pause_log_json, []),
        completed_at: i.completed_at || '', processing_started_at: i.processing_started_at || '', pause_log: json(i.pause_log_json, []), appointment: json(i.appointment_json, null), checklist: json(i.checklist_json, []),
        result_flags: json(i.result_flags_json, null), result_credit: json(i.result_credit_json, null), supplement: json(i.supplement_json, null),
        pending: json(i.pending_json, null), sla_no_fault: truth(i.sla_no_fault), note: i.note || '', version: Number(i.version) || 1
      };
    });
    out.activity_credits = (raw.activity_credits || []).map(function (item) {
      return { work_type_code: item.work_type_code || '', collateral_mode: item.collateral_mode || 'NONE',
        result_credit_json: item.result_credit_json || '{}', result_flags_json: item.result_flags_json || '{}' };
    });
    out.events = raw.events || [];
    out.global_pause = raw.global_pause || null;
    out.other_work = (raw.other_work || []).map(function (w) {
      return { work_id: w.work_id, user_id: w.user_id, work_date: String(w.work_date || '').substring(0, 10), category: w.category,
        quantity: Math.max(1, Math.floor(Number(w.quantity) || 1)), minutes: Math.max(0, Math.floor(Number(w.minutes) || 0)),
        operation_id: w.operation_id || '', at: w.at || '' };
    });
    out.activePlan = raw.activePlan || null;
    out.monthlyPlans = raw.monthlyPlans || [];
    out.operationalScorecardMeta = raw.operationalScorecardMeta || null;
    out.operationalScorecard = (raw.operationalScorecard || []).map(function (x) {
      return {
        user: { user_id: x.user && x.user.user_id || '', full_name: x.user && x.user.full_name || '' },
        eligible: Number(x.eligible) || 0, done: Number(x.done) || 0, timedDone: Number(x.timedDone) || 0,
        slaExemptDone: Number(x.slaExemptDone) || 0,
        onTime: Number(x.onTime) || 0,
        lateOpen: Number(x.lateOpen) || 0, open: Number(x.open) || 0, score: finiteNumberOrNull(x.score),
        onTimeRate: finiteNumberOrNull(x.onTimeRate),
        completionRate: finiteNumberOrNull(x.completionRate),
        backlogRate: finiteNumberOrNull(x.backlogRate),
        dataQuality: x.dataQuality || ''
      };
    });
    out.operationalScoreSnapshots = raw.operationalScoreSnapshots || [];
    out.inbox = (raw.inbox || []).map(function (n) {
      return { id: n.id, user_id: n.user_id, item_id: n.item_id, event: n.event, at: n.at,
        detail: n.detail || '', subject_user_id: n.subject_user_id || '', read: truth(n.is_read) };
    });
    (raw.settings || []).forEach(function (row) { out.settings[row.key] = row.value; });
    var settingMap = {};
    (raw.settings || []).forEach(function (row) { settingMap[row.key] = row.value; });
    if (settingMap.work_days) out.calendar.days = String(settingMap.work_days).split(',').map(Number).filter(function (n) { return !isNaN(n); });
    if (settingMap.work_open) out.calendar.open = settingMap.work_open;
    if (settingMap.work_close) out.calendar.close = settingMap.work_close;
    if (settingMap.work_break) {
      var pause = String(settingMap.work_break).split('-');
      out.calendar.breakFrom = pause[0] || '';
      out.calendar.breakTo = pause[1] || '';
    }
    if (settingMap.holidays !== undefined) out.calendar.holidays = String(settingMap.holidays).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    // Kho GAS là nguồn dữ liệu duy nhất. Máy chủ không trả mục nào thì mục đó
    // rỗng, không được giữ lại dữ liệu mẫu của bản demo: cán bộ sẽ nhìn thấy
    // hàng đợi giả và tưởng tin đã gửi.
    out.outbox = (raw.outbox || []).map(function (o) {
      return { outbox_id: o.outbox_id, idem_key: o.idem_key, item_id: o.item_id, event: o.event, audience: o.audience,
        channel: o.channel, recipient_kind: o.recipient_kind, recipient: o.recipient, recipient_name: o.recipient_name,
        template_code: o.template_code, body: o.body, status: o.status, note: o.note, retry: Number(o.retry_count) || 0,
        next_try_at: o.next_try_at || '', provider_id: o.provider_msg_id || '', created_at: o.created_at, sent_at: o.sent_at };
    });
    out.templates = [];
    out.notifyRules = [];
    out.notificationMetrics = [];
    out.configLog = [];
    out.channels = out.channels.map(function (c) {
      return { code: c.code, status: 'CHUA_KICH_HOAT', test_mode: true, allowlist: [],
        rate_per_hour: 0, max_retry: 0, config: {} };
    });

    if (raw.channels) {
      out.channels = raw.channels.map(function (c) {
        return { code: c.code, status: c.status, test_mode: truth(c.test_mode), allowlist: String(c.allowlist || '').split(',').filter(Boolean),
          rate_per_hour: Number(c.rate_per_hour) || 0, max_retry: Number(c.max_retry) || 0, config: json(c.config_json, {}) };
      });
      out.templates = (raw.templates || []).map(function (t) {
        return { code: t.code, name: t.name, channel: t.channel, status: t.status, subject: t.subject || '', body: t.body || '', approved_by: t.approved_by || '', approved_at: t.approved_at || '' };
      });
      out.notifyRules = (raw.notifyRules || []).map(function (r) {
        return { id: r.rule_id, event: r.event, audience: r.audience, channels: String(r.channels || '').split(',').filter(Boolean),
          template: r.template_code || '', enabled: truth(r.enabled), confirm: truth(r.needs_confirm),
          throttle: Number(r.throttle_minutes) || 0, when: r.when_case || '' };
      });
      out.notificationMetrics = (raw.notificationMetrics || []).map(function (m) {
        return { metric_id: m.metric_id, outbox_id: m.outbox_id, period_id: m.period_id || '', month_key: m.month_key || '',
          item_id: m.item_id || '', event: m.event || '', audience: m.audience || '', channel: m.channel || '',
          provider: m.provider || '', template_code: m.template_code || '', unit_id: m.unit_id || '',
          work_type_code: m.work_type_code || '', status: m.status || '', provider_msg_id: m.provider_msg_id || '',
          sent_at: m.sent_at || '', unit_cost: Number(m.unit_cost) || 0, currency: m.currency || 'VND',
          cost_version: m.cost_version || '', retry_count: Number(m.retry_count) || 0, created_at: m.created_at || '', updated_at: m.updated_at || '' };
      });
      out.configLog = raw.configLog || [];
    }
    return out;
  }

  return {
    available: available,
    hasSession: function () { return !!getToken(); },
    onSessionExpired: function (fn) { sessionListeners.push(fn); },
    onQueueChange: function (fn) { queueListeners.push(fn); fn(queueStatus()); },
    onUnknownOutcome: function (fn) { unknownListeners.push(fn); },
    queueStatus: queueStatus,
    bootstrap: function () { return read('getBootstrap').then(normalize); },
    connectFirefoxExtension: function () { return read('connectFirefoxExtension'); },
    claimUpdateNotice: function (id) { return write('claimUpdateNotice', id); },
    authenticate: function (code, password) {
      return read('authenticateUser', code, password || '').then(function (raw) {
        setToken(raw && raw.session_token || '');
        return normalize(raw);
      });
    },
    logout: function () {
      var done = invoke('logoutUser', [], '').catch(function () {});
      setToken('');
      return done;
    },
    createNextMonthlyPlan: function () { return write('createNextMonthlyPlan'); },
    createRequest: function (payload) { return write('createRequest', payload); },
    transitionItem: function (id, to, opts) { return write('transitionItem', id, to, opts || {}); },
    rescheduleItem: function (id, dueAt, reason, expectedVersion) { return write('rescheduleItem', id, dueAt, reason, expectedVersion); },
    assignWorkItemsBatch: function (rows) { return write('assignWorkItemsBatch', rows || []); },
    confirmDossierReceipt: function (id, version) { return write('confirmDossierReceipt', id, version); },
    focusWorkItem: function (id, version) { return write('focusWorkItem',id,version); },
    recordOtherWork: function (works) { return write('recordOtherWork', works); },
    cancelOtherWork: function (workId) { return write('cancelOtherWork', workId); },
    startGlobalPause: function (category) { return write('startGlobalPause',category); },
    endGlobalPause: function (operationId, works) { return write('endGlobalPause',operationId,works || []); },
    saveChecklist: function (id, checklist, expectedVersion) { return write('saveChecklist', id, checklist, expectedVersion); },
    recordWorkStep: function (id, key, done, quantity, expectedVersion) { return write('recordWorkStep', id, key, done, quantity, expectedVersion); },
    saveResultFlags: function (id, flags, expectedVersion) { return write('saveResultFlags', id, flags, expectedVersion); },
    addLinkedItem: function (parentId, workTypeCode) { return write('addLinkedItem', parentId, workTypeCode); },
    proposeRevision: function (id, fields, reason, expectedVersion) { return write('proposeRevision', id, fields, reason, expectedVersion); },
    resolveRevision: function (id, approve, reason) { return write('resolveRevision', id, approve, reason || ''); },
    requestCancel: function (id, reason, version) { return write('requestCancel', id, reason, version); },
    saveCatalog: function (kind, code, data) { return write('adminSaveCatalog', kind, code, data); },
    importUsers: function (rows) { return write('adminImportUsers', rows); },
    saveSettings: function (values) { return write('adminSaveSettings', values); },
    saveUpdateNotice: function (notice) { return write('adminSaveUpdateNotice', notice || {}); },
    saveWorkPlan: function (values) { return write('saveWorkPlan', values); },
    getWorkPlanning: function (type, date) { return read('getWorkPlanning', type, date); },
    saveStaffPlan: function (values) { return write('saveStaffPlan', values); },
    closeStaffPlan: function (planId, version) { return write('closeStaffPlan', planId, version); },
    saveStaffAbsence: function (userId, values) { return write('saveStaffAbsence', userId, values || {}); },
    handoverStaffWork: function (fromUserId, rows) { return write('handoverStaffWork', fromUserId, rows || []); },
    saveDelivery: function (kind, code, data) { return write('adminSaveDelivery', kind, code, data); },
    runOutbox: function () { return write('adminRunOutbox'); },
    getReport: function (opts) { return read('getReport', opts); },
    getTimeReport: function (opts) { return read('getTimeReport', opts).then(normalizeTimeReport); },
    getTeamAssignments: function (opts) { return read('getTeamAssignments', opts); },
    getRecentCustomerAssignees: function (itemId) { return read('getRecentCustomerAssignees', itemId); },
    getTimingAudit: function () { return read('getTimingAudit'); },
    getItemActivity: function (id, opts) { return read('getItemActivity', id, opts || {}); },
    getAuditLog: function (opts) { return read('getAuditLog', opts || {}); },
    getConfigLog: function () { return read('getConfigLog'); },
    confirmLegacySessionOwner: function (id, userId, reason, version) { return write('confirmLegacySessionOwner', id, userId, reason, version); },
    correctItemTimes: function (id, values, reason, version) { return write('correctItemTimes', id, values, reason, version); },
    rebuildPeriodSummaries: function () { return write('rebuildPeriodSummaries'); },
    testChannel: function (code, recipient) { return write('adminTestChannel', code, recipient); },
    changeOutbox: function (id, action) { return write('changeOutbox', id, action); },
    changePassword: function (current, next) { return write('changeOwnPassword', current, next); },
    resetUserPassword: function (userId, nextPassword) { return write('adminResetUserPassword', userId, nextPassword); },
    deleteUser: function (userId, replacementUserId) { return write('adminDeleteUser', userId, replacementUserId || ''); },
    markInboxRead: function (ids) {
      return Array.isArray(ids) ? write('markInboxRead', ids) : write('markInboxRead');
    }
  };
})();

// Cầu nối giới hạn: extension không nhận mã phiên đăng nhập hay dữ liệu khách hàng.
(function () {
  if (!window.addEventListener) return;
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (event.source !== window || !msg || msg.channel !== 'LS_ROUTING_FIREFOX_V1' || msg.direction !== 'request') return;
    if (msg.action === 'OPEN_QUEUE') { if (LS.app && LS.app.showAssignmentQueue) LS.app.showAssignmentQueue(); return; }
    if (msg.action !== 'CONNECT' || !/^[a-z0-9_-]{8,80}$/i.test(String(msg.id || ''))) return;
    var db = LS.db() || {}, user = db.users && db.users.filter(function (u) { return u.user_id === db.session; })[0];
    function reply(data) { window.postMessage({ channel: msg.channel, direction: 'response', id: msg.id, data: data }, window.location.origin); }
    if (!LS.api.hasSession()) { reply({ disconnected: true }); return; }
    if (!user) { reply({ retry: true }); return; }
    if (db.mustChangePassword || ['KS_LS', 'QUAN_LY_LS'].indexOf(user.role) === -1) { reply({ disconnected: true }); return; }
    LS.api.connectFirefoxExtension().then(reply).catch(function () { reply({ retry: true }); });
  });
})();
