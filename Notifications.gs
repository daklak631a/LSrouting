/**
 * Notifications.gs — hàng đợi gửi tin và worker.
 *
 * Nguyên tắc lấy từ mục 6 kế hoạch nghiệp vụ:
 *  - Tin chỉ xếp hàng SAU khi việc/lịch hẹn đã ghi thành công.
 *  - Mỗi tin có khóa chống gửi trùng; gửi lại phải kiểm mã phản hồi nhà cung cấp.
 *  - Kênh chưa đủ điều kiện thì ghi KHONG_GUI kèm lý do, không im lặng bỏ qua.
 *  - Gửi thành công KHÔNG có nghĩa khách đã đọc hay đồng ý.
 *  - Không dùng onEdit làm bộ máy phát tin; worker chạy bằng installable trigger.
 */
var Notifications = (function () {

  var FORBIDDEN = {
    GMF: ['ten_khach', 'cif', 'san_pham', 'so_tien', 'so_dien_thoai'],
    ZBS: ['cif', 'san_pham', 'so_tien'],
    TELEGRAM: ['cif', 'san_pham', 'so_tien'],
    EMAIL: ['cif', 'so_tien'],
    SMS: ['cif', 'san_pham', 'so_tien'],
    IN_APP: []
  };

  function bool_(v) { return v === true || String(v).toLowerCase() === 'true'; }

  function cfg_(t, code) {
    var row = t.find('Channels', 'code', code);
    if (!row) return null;
    var c = row.object;
    try { c._config = c.config_json ? JSON.parse(c.config_json) : {}; }
    catch (err) { c._config = {}; }
    c._allow = String(c.allowlist || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return c;
  }

  function today_() {
    var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }

  /**
   * Hạn mức thư là hạn mức *mỗi ngày*. Bộ đếm không có ngày kèm theo thì sau
   * đúng một lần chạm trần, email tắt vĩnh viễn mà không ai hiểu vì sao.
   */
  function emailQuota_(config) {
    var day = today_();
    if (String(config.quota_date || '') !== day) return { used: 0, day: day, stale: true };
    return { used: Number(config.used_today || 0), day: day, stale: false };
  }

  function settings_(t) {
    var out = {};
    t.rows('Settings').forEach(function (row) { out[row.key] = row.value; });
    return out;
  }

  function putSetting_(t, key, value, description) {
    var fields = { value: String(value === undefined || value === null ? '' : value), updated_at: new Date().toISOString() };
    var found = t.find('Settings', 'key', key);
    if (found) t.write(found, fields);
    else t.append('Settings', { key: key, value: fields.value, description: description || '', updated_at: fields.updated_at });
  }

  /** Ghi dấu vết sống của worker để admin biết trigger còn chạy hay đã im. */
  function recordWorkerRun_(result) {
    try {
      DataRepository.tx(function (t) {
        var now = new Date().toISOString();
        var failed = Number(result && result.failed || 0);
        var remaining = Number(result && result.remaining);
        var status = failed ? 'DEGRADED' : (remaining > 0 ? 'BACKLOG' : 'OK');
        putSetting_(t, 'worker_last_run_at', now, 'Lần worker gửi thông báo gần nhất');
        putSetting_(t, 'worker_last_run_status', status, 'Trạng thái lần worker gần nhất');
        putSetting_(t, 'worker_last_run_sent', Number(result && result.sent || 0), 'Số tin gửi thành công ở lần worker gần nhất');
        putSetting_(t, 'worker_last_run_failed', failed, 'Số tin lỗi ở lần worker gần nhất');
        putSetting_(t, 'worker_last_run_remaining', isFinite(remaining) ? remaining : -1, 'Số tin còn lại sau lần worker gần nhất');
        if (result && result.error) putSetting_(t, 'worker_last_run_error', String(result.error).substring(0, 300), 'Lỗi lần worker gần nhất');
        else putSetting_(t, 'worker_last_run_error', '', 'Lỗi lần worker gần nhất');
      });
    } catch (err) {
      Logger.log('Không ghi được heartbeat worker: ' + err.message);
    }
  }

  function gateway_(t) {
    var set = settings_(t);
    var authRef = String(set.gateway_auth_ref || 'LS_GATEWAY_TOKEN').trim();
    var token = PropertiesService.getScriptProperties().getProperty(authRef) || '';
    return { url: String(set.gateway_url || '').trim(), authRef: authRef, token: token };
  }

  function gatewayBlocker_(t, code) {
    if (['ZBS', 'SMS', 'GMF', 'TELEGRAM'].indexOf(code) === -1) return '';
    var gateway = gateway_(t);
    if (!gateway.url) return 'Chưa cấu hình địa chỉ gateway gửi tin';
    if (!gateway.token) return 'Chưa nạp token gateway trong thuộc tính ScriptProperties';
    return '';
  }

  /** Điều kiện sẵn sàng của từng kênh. Trả về chuỗi lý do nếu chưa gửi được. */
  function blocker_(t, code) {
    var c = cfg_(t, code);
    if (!c) return 'Kênh chưa khai báo';
    if (c.status === 'TAM_NGUNG') return 'Kênh đang tạm ngưng';
    if (c.status === 'CHUA_KICH_HOAT') return 'Kênh chưa kích hoạt';

    var k = c._config;
    if (code === 'EMAIL') {
      if (!k.sender) return 'Chưa khai báo hộp thư gửi';
      if (k.mode === 'GMAIL_API') return 'Gmail API chưa được nối; chọn MailApp';
      if (emailQuota_(k).used >= Number(k.daily_quota || 0)) return 'Hết hạn mức thư trong ngày';
    }
    if (code === 'ZBS') {
      if (!k.oa_id || !k.app_id) return 'Chưa khai báo OA hoặc App ID';
      if (!bool_(k.secret_set)) return 'Chưa nạp khóa bí mật phía máy chủ';
      var approved = t.rows('Templates').filter(function (x) {
        return x.channel === 'ZBS' && x.status === 'DA_DUYET';
      }).length;
      if (!approved) return 'Chưa có mẫu ZBS nào được duyệt';
    }
    if (code === 'SMS') {
      if (!k.provider) return 'Chưa khai báo provider SMS';
      if (!k.sender_id) return 'Chưa khai báo đầu số SMS';
      if (!k.secret_ref) return 'Chưa khai báo tham chiếu khóa SMS';
      var smsApproved = t.rows('Templates').some(function (x) {
        return x.channel === 'SMS' && x.status === 'DA_DUYET';
      });
      if (!smsApproved) return 'Chưa có mẫu SMS nào được duyệt';
    }
    if (code === 'GMF') {
      if (!k.group_id) return 'Chưa khai báo mã nhóm';
      if (!bool_(k.api_checked)) return 'Chưa kiểm chứng khả năng gửi nhóm';
    }
    if (code === 'TELEGRAM') {
      if (!k.bot_name || !bool_(k.token_set)) return 'Chưa khai báo bot hoặc token';
      var reachable = !!k.group_chat_id || t.rows('Users').some(function (x) {
        return bool_(x.is_active) && String(x.telegram_chat_id || '').trim();
      });
      if (!reachable) return 'Chưa có nhóm hoặc cán bộ nào đăng ký chat Telegram';
    }
    var gatewayError = gatewayBlocker_(t, code);
    if (gatewayError) return gatewayError;
    return '';
  }

  function render_(body, ctx) {
    return String(body || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (all, k) {
      return ctx[k] !== undefined && ctx[k] !== '' ? ctx[k] : '';
    });
  }

  function checkTemplate_(tpl) {
    var banned = FORBIDDEN[tpl.channel] || [];
    var re = /\{\{\s*([a-z_]+)\s*\}\}/g, m;
    while ((m = re.exec(String(tpl.body || '')))) {
      if (banned.indexOf(m[1]) !== -1) return 'Mẫu chứa biến bị cấm trên kênh này: ' + m[1];
    }
    return '';
  }

  function staff_(x) {
    return { kind: 'NOI_BO', id: x.user_id, name: x.full_name, email: x.email || '',
      phone: x.zalo_phone || '', telegram: x.telegram_chat_id || '' };
  }

  function recipients_(t, audience, item) {
    var req = t.find('Requests', 'request_id', item.request_id);
    var r = req ? req.object : null;
    var out = [];

    if (audience === 'CAN_BO' && item.assigned_user_id) {
      var u = t.find('Users', 'user_id', item.assigned_user_id);
      if (u) out.push(staff_(u.object));
    }
    if (audience === 'KS' || audience === 'QUAN_LY') {
      var role = audience === 'KS' ? 'KS_LS' : 'QUAN_LY_LS';
      t.rows('Users').filter(function (x) { return x.role === role && bool_(x.is_active); })
        .forEach(function (x) { out.push(staff_(x)); });
    }
    if (audience === 'PHONG_GUI' && r) {
      t.rows('Users').filter(function (x) {
        return x.unit_id === r.unit_id && x.role === 'PHONG_PGD' && bool_(x.is_active);
      }).forEach(function (x) { out.push(staff_(x)); });
    }
    if (audience === 'PHONG_PHU_TRACH' && r) {
      // Chỉ cán bộ Phòng/PGD đã đưa hồ sơ này nhận email, không phát cho cả đơn vị.
      t.rows('Users').filter(function(x) {
        return x.role === 'PHONG_PGD' && bool_(x.is_active) &&
          x.user_id === (r.requestor_id || r.created_by);
      }).forEach(function(x) { out.push(staff_(x)); });
    }
    // Nhóm nội bộ là một người nhận ảo: địa chỉ nằm ở cấu hình kênh, không ở bảng Users.
    if (audience === 'NHOM') {
      var gmf = cfg_(t, 'GMF');
      var tele = cfg_(t, 'TELEGRAM');
      out.push({
        kind: 'NHOM', id: 'NHOM_NOI_BO', name: 'Nhóm nội bộ',
        email: '', phone: gmf && gmf._config ? gmf._config.group_id || '' : '',
        telegram: tele && tele._config ? tele._config.group_chat_id || '' : ''
      });
    }
    if (audience === 'KHACH' && r) {
      out.push({ kind: 'KHACH', id: r.request_id, name: r.customer_name,
        email: r.email || '', phone: r.phone || '', telegram: '' });
    }
    return out;
  }

  /**
   * Mỗi kênh có kiểu địa chỉ riêng. Gộp chung một trường `addr` là cách chắc chắn
   * gửi email vào số điện thoại rồi ghi nhận là lỗi nhà cung cấp.
   */
  function addressFor_(channel, rcp) {
    if (channel === 'IN_APP') return rcp.kind === 'NOI_BO' ? rcp.id : '';
    if (channel === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rcp.email || '').trim()) ? String(rcp.email).trim().toLowerCase() : '';
    if (channel === 'TELEGRAM') return rcp.telegram || '';
    if (channel === 'GMF') return rcp.kind === 'NHOM' ? rcp.phone : '';
    if (channel === 'ZBS' || channel === 'SMS') {
      if(rcp.kind !== 'KHACH') return '';
      try { return validatePhone_(rcp.phone); } catch(e) { return ''; }
    }
    return '';
  }

  function addressBlocker_(channel, rcp) {
    if (channel === 'EMAIL') return 'Người nhận chưa có email công vụ';
    if (channel === 'TELEGRAM') return 'Người nhận chưa đăng ký chat Telegram';
    if (channel === 'GMF') return 'Kênh nhóm chỉ gửi cho nhóm nội bộ';
    if (channel === 'ZBS' || channel === 'SMS') return 'Số điện thoại khách hàng trống hoặc không hợp lệ; kiểm tra số 0 đầu';
    if (channel === 'IN_APP') return 'Thông báo trong app chỉ gửi cho người dùng nội bộ';
    return 'Người nhận chưa có địa chỉ phù hợp với kênh ' + channel;
  }

  /** Link chỉ đường Google Maps: link Admin dán cho nơi ký chung, hoặc dựng từ địa chỉ chữ. */
  function mapLink_(place, set) {
    set = set || {};
    place = String(place || set.sign_place || '').trim();
    var fixed = String(set.sign_map_url || '').trim();
    if (/^https:\/\//.test(fixed) && (!place || place === String(set.sign_place || '').trim())) return fixed;
    return place ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(place) : '';
  }

  function htmlEsc_(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Dựng email HTML đúng nhận diện: dải màu thương hiệu + logo, nội dung, nút bấm cho
   * dòng "Nhãn: https://…" và chân thư. Bản chữ thuần vẫn gửi kèm cho client không đọc HTML.
   */
  function emailHtml_(subject, body, set) {
    set = set || {};
    var brand = /^#[0-9a-fA-F]{6}$/.test(String(set.brand_color || '').trim()) ? String(set.brand_color).trim() : '#006b68';
    var logo = /^https:\/\//.test(String(set.logo_url || '').trim()) ? String(set.logo_url).trim() : '';
    var bank = htmlEsc_(set.bank_name || '');
    function linkify(text) {
      return htmlEsc_(text).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + brand + '">$1</a>');
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
        return '<p style="margin:18px 0"><a href="' + htmlEsc_(b.url) + '" style="display:inline-block;background:' + brand +
          ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px">' +
          htmlEsc_(maps ? 'Chỉ đường bằng Google Maps' : b.label) + '</a></p>';
      }
      if (b.k === 'card') {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f4f9f8;border-left:4px solid ' + brand + '">' +
          '<tr><td style="padding:12px 16px"><table role="presentation" cellpadding="0" cellspacing="0">' +
          b.rows.map(function (r) {
            return '<tr><td style="padding:4px 14px 4px 0;color:#5d7270;font-size:13px;white-space:nowrap;vertical-align:top">' + htmlEsc_(r[0]) +
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
        ? '<tr><td style="background:' + brand + ';padding:0;line-height:0"><img src="' + htmlEsc_(banner) + '" alt="' + bank + '" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>'
        : '<tr><td style="background:' + brand + ';padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">' +
          (logo ? '<img src="' + htmlEsc_(logo) + '" alt="" height="36" style="vertical-align:middle;margin-right:10px;border:0">' : '') + bank + '</td></tr>') +
      '<tr><td style="padding:24px 24px 8px;font-size:18px;font-weight:bold;color:' + brand + '">' + htmlEsc_(subject) + '</td></tr>' +
      '<tr><td style="padding:8px 24px 20px;font-size:14px;line-height:1.55">' + parts + '</td></tr>' +
      '<tr><td style="padding:14px 24px;background:#f7faf9;border-top:1px solid #e2ecea;font-size:12px;color:#5d7270;line-height:1.5">' +
      'Email tự động, vui lòng không trả lời thư này.' + '</td></tr>' +
      '</table></td></tr></table></body></html>';
  }

  function settingsSnapshot_() {
    var set = {};
    DataRepository.getAll('Settings').forEach(function (row) { set[row.key] = row.value; });
    return set;
  }

  function context_(t, item) {
    var req = t.find('Requests', 'request_id', item.request_id);
    var r = req ? req.object : {};
    var wt = t.find('WorkTypes', 'type_code', item.work_type_code);
    var appt = item.appointment_json ? JSON.parse(item.appointment_json) : {};
    var set = {};
    t.rows('Settings').forEach(function (s) { set[s.key] = s.value; });
    var officer = item.assigned_user_id ? t.find('Users', 'user_id', item.assigned_user_id) : null;
    var unit = r.unit_id ? t.find('Units', 'unit_id', r.unit_id) : null;
    var assigner = item.assigned_by ? t.find('Users', 'user_id', item.assigned_by) : null;

    return {
      nguoi_giao: assigner ? assigner.object.full_name : '',
      can_bo_ls: officer ? officer.object.full_name : '',
      hoan_thanh_luc: notificationDateTime_(item.completed_at),
      lich_hen: appt.at ? notificationDateTime_(appt.at)+' · '+(appt.place || 'Chưa có địa điểm') : 'Chưa có lịch hẹn khách hàng',
      tag_can_bo: officer ? '@' + (officer.object.zalo_name || officer.object.full_name) : '',
      ma_viec: item.item_id,
      loai_viec: wt ? wt.object.display_name : item.work_type_code,
      don_vi: unit ? unit.object.name || r.unit_id : r.unit_id || '',
      han_xu_ly: item.due_at || '',
      link: set.app_url || '',
      ten_khach: r.customer_name || '',
      thoi_gian: appt.at || '',
      dia_diem: appt.place || '',
      hotline: set.hotline || '',
      ten_ngan_hang: set.bank_name || '',
      cif: r.cif || '',
      san_pham: item.product_name || '',
      so_dien_thoai: r.phone || ''
      ,noi_ky: appt.place || set.sign_place || ''
      ,link_ban_do: mapLink_(appt.place, set)
      ,gio_ky: appt.at || ''
      ,ngay_ky: appt.date || ''
    };
  }

  var EVENT_LABEL = {
    DA_PHAN_CONG: 'Bạn được giao một việc mới',
    DOI_NGUOI: 'Việc được chuyển sang bạn',
    CAN_BO_SUNG: 'Hồ sơ cần bổ sung',
    DE_NGHI_SUA: 'Có đề nghị sửa chờ duyệt',
    QUA_HAN: 'Việc đã quá hạn xử lý',
    DANG_HEN_KH: 'Đã đặt lịch hẹn ký với khách',
    HOAN_THANH_LS: 'Hồ sơ đã hoàn thành'
  };

  /** Tin trong app không có mẫu; dựng một dòng đủ hiểu từ chính sự kiện. */
  function defaultBody_(channel, rule, ctx) {
    if (channel !== 'IN_APP') return '';
    return (EVENT_LABEL[rule.event] || rule.event) + ': ' + ctx.ma_viec +
      (ctx.loai_viec ? ' — ' + ctx.loai_viec : '') +
      (ctx.han_xu_ly ? '. Hạn: ' + ctx.han_xu_ly : '') + '.';
  }

  function requestedChannel_(item, event) {
    if (event !== 'DANG_HEN_KH' || !item.appointment_json) return '';
    var appointment;
    try { appointment = JSON.parse(item.appointment_json); } catch (err) { return ''; }
    if (appointment.via_group) return '';
    if (appointment.channel === 'ZALO') return 'ZBS';
    if (['EMAIL', 'ZBS', 'SMS'].indexOf(appointment.channel) !== -1) return appointment.channel;
    return '';
  }

  function provider_(channel, config) {
    if (channel === 'EMAIL') return config.mode === 'MAILAPP' ? 'MAILAPP' : 'GMAIL_API';
    return config.provider || channel;
  }

  /**
   * Quy tắc khai báo mẫu theo danh sách, mỗi kênh một mã: "TPL_HEN_KY,TPL_MAIL_HEN_KY".
   * Chỉ nhận mẫu khai báo đúng cho kênh đang chọn. Trước đây hàm này rơi về
   * "mẫu đã duyệt đầu tiên của kênh" — đủ để gửi lời mời ký cho một việc quá hạn.
   */
  function templateFor_(t, rule, channel) {
    var codes = String(rule.template_code || '').split(',')
      .map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i = 0; i < codes.length; i++) {
      var found = t.find('Templates', 'code', codes[i]);
      if (found && found.object.channel === channel) return found.object;
    }
    return null;
  }

  function metricStatus_(outboxStatus) {
    if (outboxStatus === 'DA_GUI') return 'SENT';
    if (outboxStatus === 'DA_HUY') return 'CANCELLED';
    if (outboxStatus === 'KHONG_GUI') return 'KHONG_GUI';
    if (outboxStatus === 'THAT_BAI') return 'FAILED';
    if (outboxStatus === 'CAN_DOI_SOAT') return 'UNKNOWN';
    return 'QUEUED';
  }

  /** Một outbox_id chỉ có một dòng metrics; retry cập nhật dòng đó. */
  function recordMetric_(t, outbox, status, providerMsgId, isNew) {
    var item = outbox.item_id ? t.find('WorkItems', 'item_id', outbox.item_id) : null;
    var request = item ? t.find('Requests', 'request_id', item.object.request_id) : null;
    var channel = cfg_(t, outbox.channel);
    var config = channel ? channel._config : {};
    var plan = item && item.object.period_id ? t.find('MonthlyPlans', 'period_id', item.object.period_id) : null;
    var now = new Date().toISOString();
    // Tin vừa xếp có outbox_id mới tinh: tra trọn bảng metrics (lớn dần theo mỗi
    // tin) trong khóa ghi chỉ để biết chắc là chưa có.
    var existing = isNew ? null : t.find('NotificationMetrics', 'outbox_id', outbox.outbox_id);
    var row = {
      metric_id: existing ? existing.object.metric_id : 'MET_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase(),
      outbox_id: outbox.outbox_id,
      idem_key: outbox.idem_key,
      period_id: item ? item.object.period_id || '' : '',
      month_key: plan ? plan.object.month_key || '' : '',
      item_id: outbox.item_id || '',
      event: outbox.event || '',
      audience: outbox.audience || '',
      channel: outbox.channel || '',
      provider: provider_(outbox.channel, config),
      template_code: outbox.template_code || '',
      unit_id: request ? request.object.unit_id || '' : '',
      work_type_code: item ? item.object.work_type_code || '' : '',
      status: status,
      provider_msg_id: providerMsgId || outbox.provider_msg_id || '',
      sent_at: status === 'SENT' ? (outbox.sent_at || now) : (existing ? existing.object.sent_at || '' : ''),
      unit_cost: Number(config.unit_cost || 0),
      currency: config.currency || 'VND',
      cost_version: config.cost_version || 'UNVERSIONED',
      retry_count: Number(outbox.retry_count || 0),
      created_at: existing ? existing.object.created_at || outbox.created_at || now : outbox.created_at || now,
      updated_at: now
    };
    if (existing) t.write(existing, row); else t.append('NotificationMetrics', row);
  }

  /** Đặt chỗ khóa idempotency trong cùng transaction với dòng outbox. */
  function reserveIdempotency_(t, key, outboxId, createdAt) {
    if (!key) return true;
    try {
      var existing = t.find('NotificationIdempotency', 'idem_key', key);
      if (existing) return false;
      return true;
    } catch (err) {
      // Kho cũ chưa chạy migration: vẫn chống trùng bằng toàn bộ lịch sử outbox,
      // không quay lại cách quét đuôi 2.000 dòng. setupSheetDB() sẽ tạo index.
      return !t.rows('NotificationOutbox').some(function (o) { return String(o.idem_key || '') === key; });
    }
  }

  function rememberIdempotency_(t, key, outboxId, createdAt) {
    if (!key) return;
    try {
      if (!t.find('NotificationIdempotency', 'idem_key', key)) {
        t.append('NotificationIdempotency', { idem_key: key, outbox_id: outboxId, created_at: createdAt });
      }
    } catch (ignore) { /* kho cũ sẽ được backfill khi chạy setupSheetDB */ }
  }

  /**
   * Xếp tin cho một sự kiện. Gọi bên trong giao dịch của Code.gs, không tự mở khóa.
   * Trả về số tin đã tạo (gồm cả tin ghi KHONG_GUI).
   */
  function queue(t, item, event, actorId, sharedSeen, channelMode) {
    // Hẹn ký báo thẳng khách và báo qua nhóm nội bộ là hai đường loại trừ nhau.
    var appt = item.appointment_json ? JSON.parse(item.appointment_json) : null;
    var viaGroup = !!(appt && appt.via_group);
    var rules = t.rows('NotifyRules').filter(function (x) {
      if (x.event !== event || !bool_(x.enabled)) return false;
      if (channelMode === 'IN_APP' && x.audience === 'PHONG_PHU_TRACH') return false;
      if (x.when_case === 'GROUP' && !viaGroup) return false;
      if (x.when_case === 'DIRECT' && viaGroup) return false;
      return true;
    });
    // sharedSeen chỉ tối ưu các rule/recipient lặp trong cùng transaction; lịch
    // sử dài được kiểm bằng NotificationIdempotency, không phụ thuộc tail.
    var existing = sharedSeen || {};
    var made = 0;
    var ctx = context_(t, item);
    var now = new Date().toISOString();

    rules.forEach(function (rule) {
      // Kênh khách chọn (Zalo/SMS/Email) chỉ áp cho tin gửi khách; email báo cán bộ
      // Phòng/PGD luôn đi theo kênh khai trong quy tắc.
      var requested = rule.audience === 'KHACH' ? requestedChannel_(item, event) : '';
      var channels = channelMode === 'IN_APP'
        ? ['IN_APP']
        : (requested ? [requested] : String(rule.channels || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean));

      recipients_(t, rule.audience, item).forEach(function (rcp) {
        if (rcp.id === actorId && rule.audience !== 'KHACH') return;

        // Nhắc quá hạn chạy mỗi giờ cho mọi hồ sơ trễ: throttle 4 giờ nghĩa là
        // mỗi hồ sơ sinh thêm dòng Outbox/Idempotency/Metrics/Inbox 6 lần/ngày,
        // bảng phình mãi. Sàn 1 ngày cho QUA_HAN.
        var throttle = Number(rule.throttle_minutes) || 0;
        if (event === 'QUA_HAN') throttle = Math.max(throttle, 1440);
        var bucket = throttle > 0 ? ':' + Math.floor(Date.now() / (throttle * 60000)) : '';
        var occurrence = event === 'QUA_HAN' ? '' : ':v' + String(Number(item.version) || 1);
        var key = [item.item_id, event, rule.audience, rcp.id].join(':') + occurrence + bucket;
        if (existing[key] || !reserveIdempotency_(t, key, 'PENDING', now)) return;
        existing[key] = true;

        var chosen = '', why = '', address = '', tpl = null;
        for (var i = 0; i < channels.length; i++) {
          var code = channels[i];
          var b = blocker_(t, code);
          if (b) { why = why || b; continue; }

          var addr = addressFor_(code, rcp);
          if (!addr) { why = why || addressBlocker_(code, rcp); continue; }

          var ch = cfg_(t, code);
          if (bool_(ch.test_mode) && ch._allow.indexOf(addr) === -1) {
            why = why || 'Kênh ở chế độ thử nghiệm, người nhận chưa được phép';
            continue;
          }

          // Thông báo trong app không đi qua nhà cung cấp nào nên không có khái
          // niệm "mẫu được duyệt"; bắt nó chờ duyệt mẫu là tự chặn kênh của mình.
          var candidate = null;
          if (code !== 'IN_APP') {
            candidate = templateFor_(t, rule, code);
            if (!candidate) { why = why || 'Quy tắc chưa khai báo mẫu cho kênh ' + code; continue; }
            if (candidate.status !== 'DA_DUYET') { why = why || 'Mẫu ' + candidate.code + ' chưa được duyệt'; continue; }
            var bad = checkTemplate_({ channel: code, body: candidate.body });
            if (bad) { why = why || bad; continue; }
          }

          chosen = code;
          address = addr;
          tpl = candidate;
          break;
        }

        var outbox = {
          outbox_id: 'OUT_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase(),
          idem_key: key,
          item_id: item.item_id,
          event: event,
          audience: rule.audience,
          channel: chosen || channels[0] || '',
          recipient_kind: rcp.kind,
          recipient: address,
          recipient_name: rcp.name,
          template_code: tpl ? tpl.code : '',
          body: tpl ? render_(tpl.body, ctx) : defaultBody_(chosen, rule, ctx),
          status: chosen ? (bool_(rule.needs_confirm) ? 'CHO_XAC_NHAN' : 'CHO_GUI') : 'KHONG_GUI',
          note: chosen ? '' : (why || 'Không có kênh nào dùng được'),
          retry_count: 0,
          next_try_at: '',
          provider_msg_id: '',
          created_at: now,
          sent_at: ''
        };
        // Ghi outbox trước rồi mới ghi index để không để lại khóa PENDING mồ côi
        // nếu tiến trình bị dừng giữa chừng.
        t.append('NotificationOutbox', outbox);
        rememberIdempotency_(t, key, outbox.outbox_id, now);
        recordMetric_(t, outbox, chosen ? 'QUEUED' : 'KHONG_GUI', '', true);
        made += 1;
      });
    });

    return made;
  }

  /**
   * Worker: chạy bằng installable trigger theo phút, KHÔNG dùng onEdit.
   * Mỗi lượt xử lý một lô nhỏ để không chạm giới hạn thời gian chạy của Apps Script.
   */
  var CLAIM_MINUTES = 15;

  /** Claim ngắn hạn dưới lock; provider luôn được gọi sau khi lock đã nhả. */
  function claimPending_(batchSize) {
    var limit = batchSize || 20;
    return DataRepository.tx(function (t) {
      var now = new Date();
      var nowIso = now.toISOString();
      var claimUntil = new Date(now.getTime() + CLAIM_MINUTES * 60000).toISOString();
      // Hạn mức mỗi giờ chỉ cần biết số tin đã gửi trong 60 phút gần nhất. Đọc
      // trọn bảng metrics là quét toàn bộ lịch sử gửi tin, cứ 5 phút một lần,
      // trong lúc đang giữ khóa ghi toàn cục — mọi thao tác của người dùng đều
      // phải chờ. Worker gửi tối đa 20 tin mỗi 5 phút, tức 240 tin mỗi giờ, nên
      // 2.000 dòng cuối đã phủ khoảng tám giờ ở công suất cao nhất.
      var sentCount = {};
      t.tail('NotificationMetrics', 2000).forEach(function (metric) {
        if (metric.status !== 'SENT' || !metric.sent_at) return;
        var sentAt = new Date(metric.sent_at).getTime();
        if (isFinite(sentAt) && sentAt <= now.getTime() && now.getTime() - sentAt < 60 * 60 * 1000) {
          sentCount[metric.channel] = (sentCount[metric.channel] || 0) + 1;
        }
      });
      var pending = t.rows('NotificationOutbox').filter(function (o) {
        var leaseExpired = !o.claim_until || String(o.claim_until) <= nowIso;
        if (!leaseExpired) return false;
        if (o.status === 'CHO_GUI') return true;
        // MailApp không có idempotency key; lease hết hạn có thể là đã gửi xong
        // nhưng Apps Script rớt trước khi ghi DA_GUI. Đưa email sang đối soát tay.
        if (o.status === 'DANG_GUI') return o.channel !== 'EMAIL';
        if (o.status !== 'THAT_BAI') return false;
        var max = Number((cfg_(t, o.channel) || {}).max_retry || 3);
        return Number(o.retry_count || 0) < max && (!o.next_try_at || String(o.next_try_at) <= nowIso);
      });
      var claimed = [], blockedCount = 0, rateLimitedCount = 0;
      pending.slice(0, limit).forEach(function (o) {
        var found = t.find('NotificationOutbox', 'outbox_id', o.outbox_id);
        if (!found) return;
        var blocked = blocker_(t, o.channel);
        if (blocked) {
          var blockedCh = cfg_(t, o.channel) || {};
          var blockedTries = Number(o.retry_count || 0) + 1;
          var blockedGiveUp = blockedTries >= Number(blockedCh.max_retry || 3);
          var blockedFields = { status: blockedGiveUp ? 'KHONG_GUI' : 'THAT_BAI', note: blocked,
            retry_count: blockedTries, next_try_at: blockedGiveUp ? '' : backoff_(blockedTries),
            claim_token: '', claim_until: '' };
          t.write(found, blockedFields);
          o.status = blockedFields.status; o.retry_count = blockedTries;
          recordMetric_(t, o, metricStatus_(o.status), '');
          blockedCount += 1;
          return;
        }
        var channelConfig = cfg_(t, o.channel) || {};
        var rate = Number(channelConfig.rate_per_hour || 0);
        if (rate > 0 && (sentCount[o.channel] || 0) >= rate) {
          rateLimitedCount += 1;
          return;
        }
        var token = Utilities.getUuid();
        t.write(found, { status: 'DANG_GUI', claim_token: token, claim_until: claimUntil });
        var copy = {};
        Object.keys(o).forEach(function (key) { copy[key] = o[key]; });
        copy.status = 'DANG_GUI'; copy.claim_token = token; copy.claim_until = claimUntil;
        claimed.push(copy);
        if (rate > 0) sentCount[o.channel] = (sentCount[o.channel] || 0) + 1;
      });
      return { items: claimed, blocked: blockedCount, remaining: Math.max(0, pending.length - claimed.length - blockedCount), rate_limited: rateLimitedCount };
    });
  }

  function backoff_(tries) {
    var minutes = 5 * Math.pow(3, Math.max(0, tries - 1));
    return new Date(Date.now() + Math.min(minutes, 240) * 60000).toISOString();
  }

  function channelSnapshot_(code) {
    var row = DataRepository.getAll('Channels').filter(function (x) { return x.code === code; })[0];
    if (!row) throw new Error('Kênh chưa khai báo');
    var config = {};
    try { config = row.config_json ? JSON.parse(row.config_json) : {}; } catch (err) { config = {}; }
    return { row: row, config: config };
  }

  function gatewaySnapshot_() {
    var set = {};
    DataRepository.getAll('Settings').forEach(function (row) { set[row.key] = row.value; });
    var authRef = String(set.gateway_auth_ref || 'LS_GATEWAY_TOKEN').trim();
    return { url: String(set.gateway_url || '').trim(), token: PropertiesService.getScriptProperties().getProperty(authRef) || '' };
  }

  function subjectSnapshot_(o) {
    if (!o.template_code) return 'Thông báo LS — ' + o.item_id;
    var tpl = DataRepository.getAll('Templates').filter(function (x) { return x.code === o.template_code; })[0];
    if (!tpl || !tpl.subject) return 'Thông báo LS — ' + o.item_id;
    var set = settingsSnapshot_();
    return render_(tpl.subject, { ma_viec: o.item_id, ten_ngan_hang: set.bank_name || '', hotline: set.hotline || '' });
  }

  /** Gọi provider ngoài lock, chỉ đọc cấu hình và trả message_id. */
  function sendClaimed_(o) {
    var snapshot = channelSnapshot_(o.channel);
    if (snapshot.row.status === 'TAM_NGUNG' || snapshot.row.status === 'CHUA_KICH_HOAT') {
      throw new Error('Kênh đang tạm ngưng hoặc chưa kích hoạt.');
    }
    var allow = String(snapshot.row.allowlist || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (bool_(snapshot.row.test_mode) && allow.indexOf(String(o.recipient || '')) === -1) {
      throw new Error('Kênh đang ở chế độ thử nghiệm; người nhận chưa nằm trong allowlist.');
    }
    var k = snapshot.config;
    if (o.channel === 'IN_APP') return { id: 'INAPP', note: '' };
    if (o.channel === 'EMAIL') {
      if (k.mode !== 'MAILAPP') throw new Error('Gmail API chưa được nối. Cần hộp thư tổ chức và quyền gmail.send đã phê duyệt.');
      var mailSubject = subjectSnapshot_(o);
      try { MailApp.sendEmail({ to: o.recipient, subject: mailSubject, body: o.body, htmlBody: emailHtml_(mailSubject, o.body, settingsSnapshot_()), noReply: true }); }
      catch (emailErr) { emailErr.deliveryUnknown = true; throw emailErr; }
      return { id: 'MAILAPP', note: 'Gửi thành công không đồng nghĩa người nhận đã đọc' };
    }

    var gateway = gatewaySnapshot_();
    if (!gateway.url || !gateway.token) throw new Error('Chưa cấu hình gateway gửi tin cho kênh ' + o.channel + '.');
    var resp;
    try {
      resp = UrlFetchApp.fetch(gateway.url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'X-Idempotency-Key': o.idem_key, 'Authorization': 'Bearer ' + gateway.token },
        payload: JSON.stringify({ channel: o.channel, provider: k.provider || o.channel, to: o.recipient,
          template: o.template_code, body: o.body, item_id: o.item_id,
          provider_config: { oa_id: k.oa_id || '', app_id: k.app_id || '', sender_id: k.sender_id || '', secret_ref: k.secret_ref || '' } })
      });
    } catch (fetchErr) { fetchErr.deliveryUnknown = true; throw fetchErr; }
    var code = resp.getResponseCode();
    var responseText = resp.getContentText() || '', data = {};
    try { data = JSON.parse(responseText); } catch (ignoreJson) {}
    if (code === 409 || code >= 500 || data.outcome === 'unknown') {
      var uncertain = new Error('Kết quả gửi qua gateway chưa xác định; cần đối soát trước khi gửi lại.');
      uncertain.deliveryUnknown = true;
      throw uncertain;
    }
    if (code < 200 || code >= 300) throw new Error('Gateway trả mã ' + code + ': ' + responseText.substring(0, 200));
    if (!data.message_id) {
      var missingId = new Error('Gateway không trả mã tin; kết quả gửi chưa xác định, cần đối soát.');
      missingId.deliveryUnknown = true;
      throw missingId;
    }
    return { id: data.message_id, note: '' };
  }

  function finishClaim_(o, result) {
    return DataRepository.tx(function (t) {
      var found = t.find('NotificationOutbox', 'outbox_id', o.outbox_id);
      if (!found || String(found.object.claim_token || '') !== String(o.claim_token || '')) return false;
      var sentAt = new Date().toISOString();
      if (o.channel === 'IN_APP') {
        t.append('Inbox', { id: 'NTF_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase(),
          user_id: o.recipient, item_id: o.item_id, event: o.event, at: sentAt, is_read: false });
      }
      if (o.channel === 'EMAIL') {
        var ch = cfg_(t, o.channel), k = ch._config, quota = emailQuota_(k);
        k.used_today = quota.used + 1; k.quota_date = quota.day;
        t.write(t.find('Channels', 'code', 'EMAIL'), { config_json: JSON.stringify(k) });
      }
      t.write(found, { status: 'DA_GUI', provider_msg_id: result.id, note: result.note || '', sent_at: sentAt,
        next_try_at: '', claim_token: '', claim_until: '' });
      o.status = 'DA_GUI'; o.provider_msg_id = result.id; o.sent_at = sentAt;
      recordMetric_(t, o, 'SENT', result.id);
      return true;
    });
  }

  function failClaim_(o, note) {
    return DataRepository.tx(function (t) {
      var found = t.find('NotificationOutbox', 'outbox_id', o.outbox_id);
      if (!found || String(found.object.claim_token || '') !== String(o.claim_token || '')) return false;
      var ch = cfg_(t, o.channel) || {};
      var tries = Number(o.retry_count || 0) + 1;
      var give = tries >= Number(ch.max_retry || 3);
      var fields = { status: give ? 'KHONG_GUI' : 'THAT_BAI', note: String(note).substring(0, 300),
        retry_count: tries, next_try_at: give ? '' : backoff_(tries), claim_token: '', claim_until: '' };
      t.write(found, fields);
      o.status = fields.status; o.retry_count = tries;
      recordMetric_(t, o, metricStatus_(fields.status), '');
      return true;
    });
  }

  /** A send attempt with an unknown result must never be put back on retry. */
  function markUnknownClaim_(o, note) {
    return DataRepository.tx(function (t) {
      var found = t.find('NotificationOutbox', 'outbox_id', o.outbox_id);
      if (!found || String(found.object.claim_token || '') !== String(o.claim_token || '')) return false;
      var fields = { status: 'CAN_DOI_SOAT', note: String(note || 'Kết quả gửi chưa xác định; cần đối soát thủ công trước khi xử lý tiếp.').substring(0, 300),
        next_try_at: '', claim_token: '', claim_until: '' };
      t.write(found, fields);
      o.status = fields.status; o.next_try_at = '';
      recordMetric_(t, o, metricStatus_(fields.status), '');
      return true;
    });
  }

  function runOutbox(batchSize) {
    try {
      var claimed = claimPending_(batchSize || 20);
      var done = 0, failed = claimed.blocked || 0;
      claimed.items.forEach(function (o) {
        var result;
        try {
          result = sendClaimed_(o);
        } catch (err) {
          var recorded = err && err.deliveryUnknown ? markUnknownClaim_(o, err.message) : failClaim_(o, err);
          if (recorded) failed += 1;
          return;
        }
        try {
          if (finishClaim_(o, result)) done += 1;
          else if (markUnknownClaim_(o, 'Đã gửi nhưng không ghi nhận được kết quả gửi; cần đối soát thủ công.')) failed += 1;
        } catch (finishErr) {
          if (markUnknownClaim_(o, 'Đã gửi nhưng không ghi nhận được kết quả gửi; cần đối soát thủ công.')) failed += 1;
        }
      });
      var output = { sent: done, failed: failed, remaining: claimed.remaining, rate_limited: claimed.rate_limited || 0 };
      recordWorkerRun_(output);
      return output;
    } catch (err) {
      var failure = { sent: 0, failed: 1, remaining: -1, error: err.message };
      recordWorkerRun_(failure);
      throw err;
    }
  }

  function subject_(t, o) {
    if (!o.template_code) return 'Thông báo LS — ' + o.item_id;
    var tpl = t.find('Templates', 'code', o.template_code);
    if (!tpl || !tpl.object.subject) return 'Thông báo LS — ' + o.item_id;
    return render_(tpl.object.subject, { ma_viec: o.item_id });
  }

  /** Đối soát: tin báo đã gửi nhưng không có mã nhà cung cấp là chưa chắc chắn. */
  function reconcile() {
    return DataRepository.tx(function (t) {
      var nowIso = new Date().toISOString();
      var suspect = t.rows('NotificationOutbox').filter(function (o) {
        return (o.status === 'DA_GUI' && !o.provider_msg_id) ||
          (o.status === 'DANG_GUI' && o.claim_until && String(o.claim_until) < nowIso);
      });
      suspect.forEach(function (o) {
        var expired = o.status === 'DANG_GUI';
        var uncertain = expired || !o.provider_msg_id;
        t.write(t.find('NotificationOutbox', 'outbox_id', o.outbox_id), {
          status: uncertain ? 'CAN_DOI_SOAT' : 'THAT_BAI',
          note: uncertain ? 'Đối soát: kết quả gửi chưa xác định; không tự gửi lại.' : 'Đối soát: chưa có mã phản hồi nhà cung cấp.',
          next_try_at: '', claim_token: '', claim_until: ''
        });
        o.status = uncertain ? 'CAN_DOI_SOAT' : 'THAT_BAI';
        o.sent_at = '';
        recordMetric_(t, o, metricStatus_(o.status), '');
      });
      return { flagged: suspect.length };
    });
  }

  // Đang hẹn khách/tạm dừng thì hạn đứng yên (SLA_PAUSED_STATUS), không nhắc quá hạn.
  var OPEN_FOR_SLA = ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];

  /**
   * Quét việc quá hạn và phát sự kiện QUA_HAN. Quy tắc R5 có throttle riêng nên
   * chạy lại nhiều lần không sinh tin trùng. Không có hàm này thì quy tắc "nhắc
   * việc quá hạn" chỉ tồn tại trên giấy.
   */
  function sweepOverdue() {
    var nowIso = new Date().toISOString();
    return DataRepository.tx(function (t) {
      var allItems = t.rows('WorkItems');
      var exemptByItem = slaExemptByItem_(allItems, t.rows('WorkTypes'));
      var nowMs = Date.now();
      var late = allItems.filter(function (i) {
        // Dòng gốc đã chuyển tháng vẫn giữ trạng thái mở; nhắc trên nó là nhắc trùng với dòng mới.
        return OPEN_FOR_SLA.indexOf(i.status) !== -1 && !i.carried_to_item_id && i.due_at &&
          String(i.due_at) < nowIso && !slaExemptItem_(i, exemptByItem) && nowMs > new Date(i.due_at).getTime();
      });
      var made = 0;
      late.forEach(function (i) { made += queue(t, i, 'QUA_HAN', ''); });
      return { late: late.length, queued: made };
    });
  }

  /**
   * Gửi thử tới chính người quản trị. Cấu hình xong mà không có cách kiểm chứng
   * thì "đã bật" chỉ là một cái công tắc, không phải một kênh chạy được.
   */
  function queueTest(t, code, recipient, actorName) {
    var blocked = blocker_(t, code);
    if (blocked) throw new Error(blocked);
    if (!recipient) throw new Error('Chưa có địa chỉ nhận tin thử cho kênh ' + code + '.');
    var ch = cfg_(t, code);
    if (bool_(ch.test_mode) && ch._allow.indexOf(recipient) === -1) {
      throw new Error('Kênh đang ở chế độ thử nghiệm; thêm địa chỉ này vào danh sách cho phép trước.');
    }
    var now = new Date().toISOString();
    var outbox = {
      outbox_id: 'OUT_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase(),
      idem_key: 'TEST:' + code + ':' + now,
      item_id: '', event: 'GUI_THU', audience: 'KS', channel: code,
      recipient_kind: 'NOI_BO', recipient: recipient, recipient_name: actorName || 'Quản trị',
      template_code: '', body: 'Tin kiểm thử kênh ' + code + ' từ LS-Routing lúc ' + now + '.',
      status: 'CHO_GUI', note: 'Tin kiểm thử cấu hình', retry_count: 0, next_try_at: '',
      provider_msg_id: '', created_at: now, sent_at: ''
    };
    t.append('NotificationOutbox', outbox);
    rememberIdempotency_(t, outbox.idem_key, outbox.outbox_id, now);
    recordMetric_(t, outbox, 'QUEUED', '');
    return outbox.outbox_id;
  }

  /**
   * Ba trigger nền của bộ máy gửi tin.
   *
   * `reconcileTick` có mặt ở đây vì `reconcile()` từng được viết xong nhưng
   * không trigger nào gọi: tin ghi DA_GUI mà thiếu mã nhà cung cấp, và tin kẹt
   * ở DANG_GUI quá hạn giữ chỗ, sẽ nằm im vĩnh viễn và vẫn được tính là đã gửi
   * ở màn chi phí.
   */
  var WORKER_TRIGGERS = {
    outboxTick_: function () { return ScriptApp.newTrigger('outboxTick_').timeBased().everyMinutes(5); },
    overdueTick_: function () { return ScriptApp.newTrigger('overdueTick_').timeBased().everyHours(1); },
    reconcileTick_: function () { return ScriptApp.newTrigger('reconcileTick_').timeBased().everyHours(6); },
    // Hàng chờ đồng bộ Sheet kế hoạch: thao tác người dùng chỉ đánh dấu, trigger này ghi.
    planSyncTick_: function () { return ScriptApp.newTrigger('planSyncTick_').timeBased().everyMinutes(5); },
    // Đầu ngày làm việc: tự trả về Phòng/PGD các việc đã giao mà cán bộ LS chưa tiếp nhận hồ sơ.
    autoReturnTick_: function () { return ScriptApp.newTrigger('autoReturnTick_').timeBased().everyDays(1).atHour(7); }
  };

  /**
   * Bổ sung trigger còn thiếu mà không đụng tới trigger đang chạy.
   *
   * `installWorker()` xóa rồi tạo lại nên không gọi được ở mỗi lần mở màn hình.
   * Kho đã migration xong thì không chạy lại setup, nên nếu chỉ dựa vào
   * `installWorker()` thì mọi trigger thêm về sau sẽ không bao giờ tới được các
   * bản đã triển khai.
   */
  function ensureWorkerTriggers() {
    var have = {};
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      var fn = tr.getHandlerFunction();
      if(['outboxTick','overdueTick','reconcileTick'].indexOf(fn) !== -1) ScriptApp.deleteTrigger(tr);
      // Trigger trùng (nhiều lượt cùng tạo) chạy song song vô ích: giữ một.
      else if (have[fn] && WORKER_TRIGGERS[fn]) ScriptApp.deleteTrigger(tr);
      else have[fn] = true;
    });
    var added = [];
    Object.keys(WORKER_TRIGGERS).forEach(function (fn) {
      if (have[fn]) return;
      WORKER_TRIGGERS[fn]().create();
      added.push(fn);
    });
    return added;
  }

  /** Gọi một lần để cài lại toàn bộ trigger worker. Trigger chạy dưới tài khoản người tạo. */
  function installWorker() {
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (WORKER_TRIGGERS[tr.getHandlerFunction()]) ScriptApp.deleteTrigger(tr);
    });
    return ensureWorkerTriggers();
  }

  return {
    queue: queue, queueTest: queueTest, runOutbox: runOutbox, reconcile: reconcile,
    sweepOverdue: sweepOverdue, addressFor: addressFor_, emailHtml: emailHtml_, mapLink: mapLink_,
    installWorker: installWorker, ensureWorkerTriggers: ensureWorkerTriggers,
    blocker: blocker_, recordMetricStatus: function (t, outbox, status) {
      recordMetric_(t, outbox, status, outbox.provider_msg_id || '');
    }
  };
})();

function outboxTick() {
  requireAdmin_();
  return outboxTick_();
}

function outboxTick_() {
  var r = Notifications.runOutbox(20);
  Logger.log('Outbox: gửi ' + r.sent + ', lỗi ' + r.failed + ', còn ' + r.remaining);
}

function overdueTick() {
  requireAdmin_();
  return overdueTick_();
}

function overdueTick_() {
  var r = Notifications.sweepOverdue();
  Logger.log('Quá hạn: ' + r.late + ' việc, xếp ' + r.queued + ' tin.');
}

function reconcileTick() {
  requireAdmin_();
  return reconcileTick_();
}

function reconcileTick_() {
  var r = Notifications.reconcile();
  Logger.log('Đối soát: đánh dấu lại ' + r.flagged + ' tin nghi ngờ.');
}

function installOutboxWorker() { requireAdmin_(); return Notifications.installWorker(); }
