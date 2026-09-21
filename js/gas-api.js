/**
 * Cầu nối duy nhất giữa giao diện và Apps Script.
 * Khi mở file trực tiếp, adapter tắt hoàn toàn để bản mô phỏng vẫn xem được.
 */
LS.api = (function () {
  'use strict';

  function available() {
    return typeof google !== 'undefined' && google.script && google.script.run;
  }

  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!available()) return Promise.reject(new Error('Ứng dụng chưa chạy trong Google Apps Script.'));
    return new Promise(function (resolve, reject) {
      var runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (error) { reject(new Error(error && error.message ? error.message : String(error))); });
      runner[name].apply(runner, args);
    });
  }

  function truth(value) { return value === true || String(value).toLowerCase() === 'true'; }
  function json(value, fallback) {
    if (!value) return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (e) { return fallback; }
  }

  /** Chuyển hàng dữ liệu Sheet thành cấu trúc UI duy nhất, không lộ bí mật kênh gửi. */
  function normalize(raw) {
    var out = LS.domain.seed();
    raw = raw || {};
    out.session = raw.me ? raw.me.user_id : null;
    out.mustChangePassword = !!(raw.me && raw.me.must_change_password);
    out.users = (raw.users || []).map(function (u) {
      return { user_id: u.user_id, full_name: u.full_name, email: u.email || '', role: u.role, unit_id: u.unit_id,
        sort_order: Number(u.sort_order) || 9999, source_tab: u.source_tab || '', active: truth(u.is_active),
        login_code: u.login_code || u.user_id || '', auth_group: u.auth_group || (u.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL'),
        zalo_name: u.zalo_name || '', zalo_phone: u.zalo_phone || '', telegram_chat_id: u.telegram_chat_id || '',
        availability_status: String(u.availability_status || 'AVAILABLE').toUpperCase(),
        off_from: u.off_from || '', off_to: u.off_to || '', off_reason: u.off_reason || '', replacement_user_id: u.replacement_user_id || '' };
    });
    if (raw.me && !LS.byId(out.users, 'user_id', raw.me.user_id)) {
      out.users.push({ user_id: raw.me.user_id, login_code: raw.me.user_id, auth_group: raw.me.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL', full_name: raw.me.full_name, email: raw.me.email, role: raw.me.role, unit_id: raw.me.unit_id, active: true });
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
        customer: { name: r.customer_name, kind: r.customer_kind, cif: r.cif || '', phone: r.phone || '', email: r.email || '', priority_flags: json(r.priority_flags_json, []) }
      };
    });
    out.items = (raw.items || []).map(function (i) {
      return {
        item_id: i.item_id, period_id: i.period_id || '', parent_item_id: i.parent_item_id || '', carryover_from_item_id: i.carryover_from_item_id || '', carried_to_item_id: i.carried_to_item_id || '', source_stt: i.source_stt || '', source_tab: i.source_tab || '', request_id: i.request_id, work_type_code: i.work_type_code, product_name: i.product_name,
        occurrence_date: i.occurrence_date, status: i.status, assigned_user_id: i.assigned_user_id || '', assigned_by: i.assigned_by || '',
        submitted_at: i.submitted_at || '', accepted_at: i.accepted_at || '', assigned_at: i.assigned_at || '', due_at: i.due_at || '',
        completed_at: i.completed_at || '', processing_started_at: i.processing_started_at || '', pause_log: json(i.pause_log_json, []), appointment: json(i.appointment_json, null), checklist: json(i.checklist_json, []),
        pending: json(i.pending_json, null), note: i.note || '', version: Number(i.version) || 1
      };
    });
    out.events = raw.events || [];
    out.activePlan = raw.activePlan || null;
    out.monthlyPlans = raw.monthlyPlans || [];
    out.inbox = (raw.inbox || []).map(function (n) {
      return { id: n.id, user_id: n.user_id, item_id: n.item_id, event: n.event, at: n.at, read: truth(n.is_read) };
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
    available: available, bootstrap: function () { return call('getBootstrap').then(normalize); },
    authenticate: function (code, password) { return call('authenticateUser', code, password || '').then(normalize); },
    logout: function () { return call('logoutUser'); },
    createNextMonthlyPlan: function () { return call('createNextMonthlyPlan'); },
    createRequest: function (payload) { return call('createRequest', payload); },
    transitionItem: function (id, to, opts) { return call('transitionItem', id, to, opts || {}); },
    saveChecklist: function (id, checklist, expectedVersion) { return call('saveChecklist', id, checklist, expectedVersion); },
    addLinkedItem: function (parentId, workTypeCode) { return call('addLinkedItem', parentId, workTypeCode); },
    proposeRevision: function (id, fields, reason) { return call('proposeRevision', id, fields, reason); },
    resolveRevision: function (id, approve, reason) { return call('resolveRevision', id, approve, reason || ''); },
    saveCatalog: function (kind, code, data) { return call('adminSaveCatalog', kind, code, data); },
    importUsers: function (rows) { return call('adminImportUsers', rows); },
    saveSettings: function (values) { return call('adminSaveSettings', values); },
    saveDelivery: function (kind, code, data) { return call('adminSaveDelivery', kind, code, data); },
    runOutbox: function () { return call('adminRunOutbox'); },
    getReport: function (opts) { return call('getReport', opts); },
    rebuildPeriodSummaries: function () { return call('rebuildPeriodSummaries'); },
    testChannel: function (code, recipient) { return call('adminTestChannel', code, recipient); },
    changeOutbox: function (id, action) { return call('changeOutbox', id, action); },
    changePassword: function (current, next) { return call('changeOwnPassword', current, next); },
    markInboxRead: function () { return call('markInboxRead'); }
  };
})();
