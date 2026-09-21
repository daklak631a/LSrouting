/**
 * admin.js — bảng quản trị: kênh gửi tin, mẫu tin, quy tắc thông báo, hàng đợi,
 * danh mục, lịch làm việc, cấu hình hệ thống và nhật ký cấu hình.
 */
LS.admin = (function () {
  'use strict';

  var U = LS, D = LS.domain, ui = LS.ui;
  var section = 'overview';
  var oFilter = { status: '', channel: '' };

  function st() { return U.db(); }
  function me() { return U.byId(st().users, 'user_id', st().session); }
  function userName(id) { var u = U.byId(st().users, 'user_id', id); return u ? u.full_name : id; }

  /** Mọi thay đổi cấu hình đều phải lưu vết — ai, lúc nào, đổi gì. */
  function logCfg(area, detail) {
    st().configLog.unshift({ id: U.uid('CFG'), at: U.now(), by: st().session, area: area, detail: detail });
  }

  function commit(area, detail, msg) {
    logCfg(area, detail);
    U.save();
    ui.closeDialog();
    LS.app.render();
    ui.toast(msg || 'Đã lưu cấu hình.');
  }

  /* ============================ Điều hướng ============================ */

  var NAV = [
    ['Giám sát', [
      ['overview', 'Tổng quan', 'activity'],
      ['outbox', 'Hàng đợi gửi', 'send'],
      ['metrics', 'Chi phí & hiệu quả', 'chart'],
      ['cfglog', 'Nhật ký cấu hình', 'history']
    ]],
    ['Gửi tin', [
      ['channels', 'Kênh gửi tin', 'zap'],
      ['templates', 'Mẫu tin', 'file'],
      ['rules', 'Quy tắc thông báo', 'bell']
    ]],
    ['Danh mục', [
      ['types', 'Loại việc', 'tag'],
      ['units', 'Đơn vị', 'building'],
      ['users', 'Người dùng', 'users'],
      ['reasons', 'Lý do', 'clipboard'],
      ['catalog', 'Dropdown nguồn', 'list'],
      ['assignment', 'Phân công nhanh', 'zap']
    ]],
    ['Hệ thống', [
      ['calendar', 'Lịch làm việc', 'calendar'],
      ['settings', 'Cấu hình chung', 'sliders'],
      ['data', 'Dữ liệu', 'database']
    ]]
  ];

  function setSection(s) { section = s; }

  function nav() {
    var h = D.outboxHealth(st());
    var alerts = {
      outbox: h.failed + h.waiting,
      channels: st().channels.filter(function (c) { return D.CHANNELS[c.code] && !D.channelUsable(c.code, st()); }).length,
      templates: st().templates.filter(function (t) { return t.status === 'CHO_DUYET'; }).length
    };

    return '<nav class="admin-nav">' + NAV.map(function (grp) {
      return '<div class="grp">' + U.esc(grp[0]) + '</div>' + grp[1].map(function (it) {
        return '<button data-act="admin-go" data-section="' + it[0] + '"' +
          (section === it[0] ? ' aria-current="page"' : '') + '>' +
          U.icon(it[2], 16) + U.esc(it[1]) +
          (alerts[it[0]] ? '<span class="pill">' + alerts[it[0]] + '</span>' : '') + '</button>';
      }).join('');
    }).join('') + '</nav>';
  }

  function view() {
    var body;
    switch (section) {
      case 'channels': body = channels(); break;
      case 'templates': body = templates(); break;
      case 'rules': body = rules(); break;
      case 'outbox': body = outbox(); break;
      case 'metrics': body = metrics(); break;
      case 'types': body = types(); break;
      case 'units': body = units(); break;
      case 'users': body = users(); break;
      case 'reasons': body = reasons(); break;
      case 'catalog': body = catalog(); break;
      case 'assignment': body = assignment(); break;
      case 'calendar': body = calendar(); break;
      case 'settings': body = settings(); break;
      case 'data': body = data(); break;
      case 'cfglog': body = cfglog(); break;
      default: body = overview();
    }
    return '<div class="admin">' + nav() + '<div class="admin-body">' + body + '</div></div>';
  }

  /* ============================ Tổng quan ============================ */

  function overview() {
    var s = st();
    var h = D.outboxHealth(s);
    var notReady = s.channels.filter(function (c) { return !D.channelUsable(c.code, s); });
    var openItems = s.items.filter(function (i) { return D.STATUS[i.status].open; });
    var late = openItems.filter(function (i) { var x = D.sla(i, s); return x && x.late; });
    var email = U.byId(s.channels, 'code', 'EMAIL') || { config: {} };
    var emailQuota = Number(email.config.daily_quota || 0);
    var quotaLeft = emailQuota - D.emailUsedToday(email.config);
    var pendingTpl = s.templates.filter(function (t) { return t.status === 'CHO_DUYET'; });

    var out = '';

    if (s.settings.env === 'THU_NGHIEM') {
      out += ui.banner('warn', 'Hệ thống đang ở môi trường thử nghiệm',
        'Chỉ gửi tin cho người nhận trong danh sách cho phép. Chuyển sang môi trường thật ở mục Cấu hình chung sau khi nghiệm thu.');
    }

    out += ui.strip([
      ui.metric('Tin chờ gửi', h.backlog, h.backlog > s.settings.backlog_alert ? 'danger' : ''),
      ui.metric('Tin thất bại', h.failed, h.failed ? 'danger' : ''),
      ui.metric('Chờ cán bộ xác nhận', h.waiting, h.waiting ? 'warn' : ''),
      ui.metric('Không gửi được', h.skipped, h.skipped ? 'warn' : ''),
      ui.metric('Việc quá hạn', late.length, late.length ? 'danger' : '')
    ]);

    out += ui.block({
      title: 'Tình trạng kênh gửi tin', icon: 'zap',
      actions: ui.btn('Mở cấu hình kênh', { act: 'admin-go', data: ' data-section="channels"', sm: true, icon: 'right' }),
      body: ui.table(
        [{ label: 'Kênh' }, { label: 'Trạng thái', cls: 'fit' }, { label: 'Điều kiện còn thiếu' }],
        s.channels.filter(function (c) { return D.CHANNELS[c.code]; }).map(function (c) {
          var def = D.CHANNELS[c.code];
          var rd = D.channelReady(c.code, s);
          var miss = rd.checks.filter(function (x) { return !x.ok; });
          return {
            cls: miss.length ? 'flag-warn' : '',
            cells: [
              '<div class="t1">' + U.esc(def.name) + '</div><div class="t2">' +
              U.esc(def.to === 'KHACH' ? 'gửi khách hàng' : def.to === 'NOI_BO' ? 'nội bộ' : 'nội bộ và khách hàng') + '</div>',
              ui.tag(D.CHANNEL_STATUS[c.status].label, D.CHANNEL_STATUS[c.status].tone),
              miss.length
                ? '<div class="t2">' + miss.map(function (x) { return U.esc(x.label); }).join('<br>') + '</div>'
                : ui.tag('Đủ điều kiện', 'ok')
            ]
          };
        })
      )
    });

    var warnings = [];
    if (h.failed) warnings.push([h.failed + ' tin thất bại chưa xử lý', 'Mở hàng đợi để xem mã lỗi và gửi lại.']);
    if (h.backlog > s.settings.backlog_alert) warnings.push(['Hàng đợi vượt ngưỡng cảnh báo', 'Đang tồn ' + h.backlog + ' tin, ngưỡng đặt ở ' + s.settings.backlog_alert + '.']);
    if (pendingTpl.length) warnings.push([pendingTpl.length + ' mẫu tin chờ duyệt', 'Mẫu chưa duyệt thì tin liên quan sẽ không gửi.']);
    if (emailQuota > 0 && quotaLeft <= 10) warnings.push(['Sắp hết hạn mức thư trong ngày', 'Còn ' + quotaLeft + ' thư trên hạn mức ' + emailQuota + '.']);
    if (notReady.length) warnings.push([notReady.length + ' kênh chưa sẵn sàng', 'Tin đi qua các kênh này sẽ được ghi là không gửi.']);

    out += ui.block({
      title: 'Cảnh báo vận hành', count: warnings.length, icon: 'warn',
      body: warnings.length
        ? ui.pad('<div class="f-stack">' + warnings.map(function (w) {
          return ui.banner('warn', w[0], w[1]);
        }).join('') + '</div>')
        : ui.empty({ icon: 'check', title: 'Không có cảnh báo', text: 'Hàng đợi, kênh gửi và hạn xử lý đều trong ngưỡng.' })
    });

    return out;
  }

  /* ============================ Kênh gửi tin ============================ */

  function channels() {
    var s = st();
    return ui.banner('info', 'Kênh chỉ bật khi đủ điều kiện',
      'Tin không gửi được luôn ghi rõ lý do.') +

      '<div class="chan-list">' + s.channels.filter(function (c) { return D.CHANNELS[c.code] && D.CHANNEL_STATUS[c.status]; }).map(function (c) {
        var def = D.CHANNELS[c.code];
        var rd = D.channelReady(c.code, s);
        var usable = D.channelUsable(c.code, s);

        return '<div class="chan' + (usable ? '' : ' off') + '">' +
          '<div class="chan-top">' +
          '<div class="chan-ico">' + U.icon(def.icon, 18) + '</div>' +
          '<div style="min-width:0;flex:1">' +
          '<div class="chan-name">' + U.esc(def.name) + '</div>' +
          '<div class="chan-meta">' + U.esc(def.desc) + '</div>' +
          '</div>' +
          ui.tag(D.CHANNEL_STATUS[c.status].label, D.CHANNEL_STATUS[c.status].tone) +
          '</div>' +

          '<div class="chan-checks">' + rd.checks.map(function (x) {
            return '<div class="chan-check ' + (x.ok ? 'done' : 'miss') + '">' +
              U.icon(x.ok ? 'check' : 'warn', 14) +
              '<span>' + U.esc(x.label) + (x.hint ? ' — ' + U.esc(x.hint) : '') + '</span></div>';
          }).join('') +
          (c.test_mode && !def.locked
            ? '<div class="chan-check"><span>' + U.icon('lock', 14) + ' Chế độ thử nghiệm: ' +
            (c.allowlist.length ? c.allowlist.length + ' người nhận được phép' : 'chưa ai trong danh sách cho phép') + '</span></div>'
            : '') +
          '</div>' +

          '<div class="chan-foot">' +
          (def.locked
            ? '<span class="t2">Kênh mặc định, luôn bật</span>'
            : ui.switchBox('on_' + c.code, c.status === 'HOAT_DONG' || c.status === 'THU_NGHIEM',
              c.status === 'TAM_NGUNG' ? 'Đang tạm ngưng' : 'Cho phép gửi',
              { disabled: !rd.ok, attrs: ' data-act="chan-toggle" data-code="' + U.attr(c.code) + '"' })) +
          '<div class="btn-row" style="margin-left:auto">' +
          (def.locked ? '' : ui.btn('Cấu hình', { act: 'chan-edit', data: ' data-code="' + U.attr(c.code) + '"', sm: true, icon: 'sliders' })) +
          (usable && !def.locked ? ui.btn('Gửi thử', { act: 'chan-test', data: ' data-code="' + U.attr(c.code) + '"', sm: true, icon: 'send' }) : '') +
          '</div></div></div>';
      }).join('') + '</div>';
  }

  function condAttrs(field) {
    if (!field.when) return '';
    var k = Object.keys(field.when)[0];
    return ' data-when="' + k + '=' + field.when[k] + '"';
  }

  function channelDialog(code) {
    var c = U.byId(st().channels, 'code', code);
    var def = D.CHANNELS[code];
    if (!c || !def) return;

    var fields = def.fields.map(function (fd) {
      var val = c.config[fd.key];
      var ctrl;
      if (fd.type === 'select') ctrl = ui.select('cfg.' + fd.key, fd.options, val, { attrs: ' data-cond="' + fd.key + '"' });
      else if (fd.type === 'bool') ctrl = ui.switchBox('cfg.' + fd.key, !!val, 'Đã hoàn tất');
      else if (fd.type === 'number') ctrl = ui.input('cfg.' + fd.key, val, { type: 'number', min: 0, disabled: fd.readonly });
      else ctrl = ui.input('cfg.' + fd.key, val, { placeholder: fd.placeholder, disabled: fd.readonly });
      return '<div' + condAttrs(fd) + '>' + ui.field(fd.label, ctrl, fd.hint) + '</div>';
    }).join('');

    ui.openDialog('Cấu hình ' + def.name,
      '<form data-form="channel" data-code="' + U.attr(code) + '">' +
      ui.banner('info', def.desc, def.docs ? 'Tài liệu nhà cung cấp: ' + def.docs : '') +

      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Kết nối') +
      '<div class="f-row">' + fields + '</div></div>' +

      '<div style="margin-top:1.125rem">' + ui.sectionTitle('An toàn khi gửi') +
      '<div class="f-stack">' +
      ui.checkbox('test_mode', c.test_mode, 'Chế độ thử nghiệm',
        'chỉ gửi cho người nhận trong danh sách dưới đây') +
      ui.field('Danh sách người nhận được phép',
        ui.textarea('allowlist', c.allowlist.join('\n'), { placeholder: 'mỗi dòng một email hoặc số điện thoại' }),
        'bỏ trống khi đã tắt chế độ thử nghiệm') +
      '<div class="f-row">' +
      ui.field('Giới hạn tin mỗi giờ', ui.input('rate_per_hour', c.rate_per_hour, { type: 'number', min: 0 })) +
      ui.field('Số lần gửi lại tối đa', ui.input('max_retry', c.max_retry, { type: 'number', min: 0, max: 10 })) +
      '</div></div></div>' +

      ui.formEnd('Lưu cấu hình') + '</form>',
      { size: 'md', sub: code });

    LS.app.applyConds();
  }

  function saveChannel(form) {
    var code = form.getAttribute('data-code');
    var c = U.byId(st().channels, 'code', code);
    var def = D.CHANNELS[code];
    var d = new FormData(form);

    def.fields.forEach(function (fd) {
      if (fd.readonly) return;
      var raw = d.get('cfg.' + fd.key);
      if (fd.type === 'bool') c.config[fd.key] = raw !== null;
      else if (fd.type === 'number') c.config[fd.key] = Number(raw || 0);
      else c.config[fd.key] = String(raw || '').trim();
    });

    c.test_mode = d.get('test_mode') !== null;
    c.allowlist = String(d.get('allowlist') || '').split('\n')
      .map(function (x) { return x.trim(); }).filter(Boolean);
    c.rate_per_hour = Number(d.get('rate_per_hour') || 0);
    c.max_retry = Number(d.get('max_retry') || 0);

    // Thiếu điều kiện thì tự hạ về chưa kích hoạt, không để trạng thái nói dối.
    var rd = D.channelReady(code, st());
    if (!rd.ok && c.status !== 'CHUA_KICH_HOAT') c.status = 'CHUA_KICH_HOAT';
    else if (rd.ok && c.status === 'CHUA_KICH_HOAT') c.status = c.test_mode ? 'THU_NGHIEM' : 'HOAT_DONG';
    else if (rd.ok && c.status !== 'TAM_NGUNG') c.status = c.test_mode ? 'THU_NGHIEM' : 'HOAT_DONG';

    if (U.isGas()) {
      LS.api.saveDelivery('channel', code, {
        status: c.status, test_mode: c.test_mode, allowlist: c.allowlist.join(','), rate_per_hour: c.rate_per_hour,
        max_retry: c.max_retry, config_json: JSON.stringify(c.config), updated_at: U.now()
      }).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu cấu hình kênh.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu cấu hình kênh.', 'err'); });
      return;
    }

    commit('Kênh gửi tin', 'Cập nhật cấu hình ' + def.name + ', trạng thái ' + c.status + '.');
  }

  function toggleChannel(code) {
    var c = U.byId(st().channels, 'code', code);
    var rd = D.channelReady(code, st());
    if (!rd.ok) { ui.toast('Kênh chưa đủ điều kiện để bật.', 'err'); LS.app.render(); return; }

    if (c.status === 'TAM_NGUNG' || c.status === 'CHUA_KICH_HOAT') c.status = c.test_mode ? 'THU_NGHIEM' : 'HOAT_DONG';
    else c.status = 'TAM_NGUNG';

    if (U.isGas()) {
      LS.api.saveDelivery('channel', code, {
        status: c.status, test_mode: c.test_mode, allowlist: c.allowlist.join(','), rate_per_hour: c.rate_per_hour,
        max_retry: c.max_retry, config_json: JSON.stringify(c.config), updated_at: U.now()
      }).then(function () { return LS.app.refreshServer(D.CHANNELS[code].name + ': ' + D.CHANNEL_STATUS[c.status].label); })
        .catch(function (error) { ui.toast(error.message || 'Không thể đổi trạng thái kênh.', 'err'); });
      return;
    }

    logCfg('Kênh gửi tin', D.CHANNELS[code].name + ' chuyển sang ' + c.status + '.');
    U.save();
    LS.app.render();
    ui.toast(D.CHANNELS[code].name + ': ' + D.CHANNEL_STATUS[c.status].label);
  }

  /** Cấu hình xong mà không kiểm chứng được thì "đã bật" mới chỉ là một cái công tắc. */
  function testChannel(code) {
    var c = U.byId(st().channels, 'code', code);
    var u = me();
    var addr = D.addressFor(code, {
      kind: 'NOI_BO', id: u.user_id, email: u.email || '',
      phone: u.zalo_phone || '', telegram: u.telegram_chat_id || ''
    });

    if (U.isGas()) {
      if (!addr) { ui.toast('Tài khoản của bạn chưa có địa chỉ nhận tin trên kênh này.', 'err'); return; }
      ui.confirm({
        title: 'Gửi tin thử qua ' + D.CHANNELS[code].name + '?',
        text: 'Tin thật sẽ được gửi tới ' + U.mask(addr) + ' qua nhà cung cấp đang cấu hình.',
        ok: 'Gửi thử',
        run: function () {
          LS.api.testChannel(code, addr).then(function (res) {
            return LS.app.refreshServer(res.status === 'DA_GUI'
              ? 'Đã gửi tin thử tới ' + U.mask(addr) + '.'
              : 'Tin thử chưa gửi được: ' + (res.note || res.status));
          }).catch(function (error) { ui.toast(error.message || 'Không gửi được tin thử.', 'err'); });
        }
      });
      return;
    }

    if (!addr) { ui.toast('Tài khoản của bạn chưa có địa chỉ nhận tin trên kênh này.', 'err'); return; }
    if (c.test_mode && c.allowlist.indexOf(addr) === -1) {
      ui.toast('Địa chỉ của bạn chưa có trong danh sách cho phép của kênh.', 'err');
      return;
    }

    st().outbox.unshift({
      outbox_id: U.uid('OUT'), idem_key: U.uid('TEST'), item_id: '', event: 'GUI_THU',
      audience: 'KS', channel: code, recipient_kind: 'NOI_BO', recipient: addr, recipient_name: u.full_name,
      template_code: '', body: 'Tin gửi thử từ màn quản trị LS-Routing.',
      status: 'CHO_GUI', note: '', retry: 0, provider_id: '', created_at: U.now(), sent_at: ''
    });

    logCfg('Kênh gửi tin', 'Gửi thử qua ' + D.CHANNELS[code].name + ' tới ' + U.mask(addr) + '.');
    U.save();
    section = 'outbox';
    LS.app.render();
    ui.toast('Đã xếp tin thử vào hàng đợi. Bấm chạy hàng đợi để gửi.');
  }

  /* ============================ Mẫu tin ============================ */

  function templates() {
    var s = st();
    return ui.banner('info', 'Mẫu gửi khách phải được nhà cung cấp duyệt trước',
      'Tự tạo mẫu không đồng nghĩa mẫu đã được duyệt. Mẫu chưa duyệt thì tin liên quan sẽ không gửi.') +

      ui.block({
        title: 'Mẫu tin', count: s.templates.length, icon: 'file',
        actions: ui.btn('Thêm mẫu', { kind: 'primary', act: 'tpl-edit', sm: true, icon: 'plus' }),
        body: ui.table(
          [{ label: 'Mã', cls: 'fit' }, { label: 'Tên mẫu' }, { label: 'Kênh', cls: 'fit' },
          { label: 'Biến dùng' }, { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
          s.templates.map(function (t) {
            var chk = D.checkTemplate(t);
            return {
              cls: chk.ok ? '' : 'flag',
              cells: [
                '<span class="tid">' + U.esc(t.code) + '</span>',
                '<div class="t1">' + U.esc(t.name) + '</div>' +
                (chk.ok ? '' : '<div class="t2" style="color:var(--danger)">' + U.esc(chk.errors[0]) + '</div>'),
                '<div class="t2">' + U.esc(D.CHANNELS[t.channel] ? D.CHANNELS[t.channel].name : t.channel) + '</div>',
                '<div class="var-chips">' + chk.vars.map(function (v) {
                  return '<span class="var-chip">' + U.esc(v) + '</span>';
                }).join('') + '</div>',
                ui.tag(D.TPL_STATUS[t.status].label, D.TPL_STATUS[t.status].tone),
                '<div class="btn-row">' +
                (t.status === 'CHO_DUYET'
                  ? ui.btn('Duyệt', { kind: 'primary', sm: true, act: 'tpl-approve', data: ' data-code="' + U.attr(t.code) + '" data-ok="1"' }) +
                  ui.btn('Từ chối', { sm: true, act: 'tpl-approve', data: ' data-code="' + U.attr(t.code) + '" data-ok="0"' })
                  : '') +
                ui.iconBtn('pencil', { act: 'tpl-edit', data: ' data-code="' + U.attr(t.code) + '"', label: 'Sửa mẫu' }) +
                '</div>'
              ]
            };
          }),
          { icon: 'file', title: 'Chưa có mẫu tin nào', text: 'Thêm mẫu rồi gửi duyệt trước khi bật kênh.' }
        )
      });
  }

  function templateDialog(code) {
    var t = code ? U.byId(st().templates, 'code', code) : null;
    var cur = t || { code: '', name: '', channel: 'EMAIL', status: 'NHAP', subject: '', body: '' };
    var chk = D.checkTemplate(cur);

    var chanOpts = Object.keys(D.CHANNELS).map(function (k) { return [k, D.CHANNELS[k].name]; });

    ui.openDialog(t ? 'Sửa mẫu tin' : 'Thêm mẫu tin',
      '<form data-form="template"' + (t ? ' data-code="' + U.attr(t.code) + '"' : '') + '>' +
      '<div class="tpl-editor">' +
      '<div>' +
      '<div class="f-row">' +
      ui.field('Mã mẫu', ui.input('code', cur.code, { required: true, disabled: !!t, placeholder: 'TPL_...' })) +
      ui.field('Kênh', ui.select('channel', chanOpts, cur.channel, { attrs: ' id="tplChannel"' })) +
      '</div>' +
      ui.field('Tên mẫu', ui.input('name', cur.name, { required: true })) +
      ui.field('Tiêu đề', ui.input('subject', cur.subject), 'chỉ dùng cho email') +
      ui.field('Nội dung', ui.textarea('body', cur.body, { id: 'tplBody', required: true, attrs: ' rows="7"' }),
        'dùng {{bien}} để chèn dữ liệu') +
      '<div id="tplErrors">' + tplErrorHtml(chk) + '</div>' +
      '</div>' +

      '<aside class="tpl-preview">' +
      '<div class="section-title">Xem trước</div>' +
      '<div class="tpl-bubble" id="tplPreview">' + U.esc(D.renderTemplate(cur.body, sampleCtx())) + '</div>' +
      '<div class="section-title" style="margin-top:1rem">Biến chèn được</div>' +
      '<div class="var-chips">' + Object.keys(D.VARS).map(function (v) {
        return '<button type="button" class="var-chip" data-act="tpl-var" data-var="' + v + '">{{' + v + '}}</button>';
      }).join('') + '</div>' +
      '</aside></div>' +

      ui.formEnd('Lưu mẫu') + '</form>',
      { size: 'lg', sub: t ? D.TPL_STATUS[t.status].label : 'Mẫu mới ở trạng thái nháp' });

    hookTemplateLive();
  }

  function sampleCtx() {
    return {
      ma_viec: 'ITEM_1001A', loai_viec: 'Soạn hồ sơ vay mới', don_vi: 'PGD Bến Thành',
      han_xu_ly: '16:30 21/09/2026', nguoi_giao: 'Trần Thị Kiểm Soát', link: st().settings.app_url,
      ten_khach: 'Công ty TNHH Minh Phát', thoi_gian: '09:00 22/09/2026', dia_diem: 'PGD Bến Thành',
      hotline: st().settings.hotline, ten_ngan_hang: st().settings.bank_name,
      cif: 'CIF-99201', san_pham: 'Vay vốn lưu động', so_tien: '2.000.000.000',
      so_dien_thoai: '0908123456',
      ngay_ky: '22/09/2026', gio_ky: '09:00', noi_ky: st().settings.sign_place || 'PGD Bến Thành',
      tag_can_bo: '@Nguyễn Văn LS'
    };
  }

  function tplErrorHtml(chk) {
    if (chk.ok) return ui.banner('ok', 'Mẫu hợp lệ', 'Không có biến bị cấm trên kênh này.');
    return '<div class="f-stack">' + chk.errors.map(function (e) {
      return ui.banner('danger', e, '');
    }).join('') + '</div>';
  }

  /** Xem trước và kiểm tra biến cấm ngay khi gõ. */
  function hookTemplateLive() {
    var body = document.getElementById('tplBody');
    var chan = document.getElementById('tplChannel');
    if (!body || !chan) return;

    var refresh = function () {
      var tpl = { channel: chan.value, body: body.value };
      var chk = D.checkTemplate(tpl);
      document.getElementById('tplPreview').textContent = D.renderTemplate(body.value, sampleCtx());
      document.getElementById('tplErrors').innerHTML = tplErrorHtml(chk);
    };

    body.addEventListener('input', refresh);
    chan.addEventListener('change', refresh);
  }

  function insertVar(name) {
    var body = document.getElementById('tplBody');
    if (!body) return;
    var s = body.selectionStart, e = body.selectionEnd;
    var token = '{{' + name + '}}';
    body.value = body.value.slice(0, s) + token + body.value.slice(e);
    body.selectionStart = body.selectionEnd = s + token.length;
    body.focus();
    body.dispatchEvent(new Event('input'));
  }

  function saveTemplate(form) {
    var d = new FormData(form);
    var code = form.getAttribute('data-code');
    var tpl = {
      code: code || String(d.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      name: String(d.get('name')).trim(),
      channel: String(d.get('channel')),
      subject: String(d.get('subject') || '').trim(),
      body: String(d.get('body'))
    };

    var chk = D.checkTemplate(tpl);
    if (!chk.ok) { ui.toast(chk.errors[0], 'err'); return; }

    if (U.isGas()) {
      var existing = code ? U.byId(st().templates, 'code', code) : null;
      var changed = existing && (existing.body !== tpl.body || existing.channel !== tpl.channel);
      LS.api.saveDelivery('template', tpl.code, {
        name: tpl.name, channel: tpl.channel, subject: tpl.subject, body: tpl.body,
        status: existing ? (changed && existing.status === 'DA_DUYET' ? 'CHO_DUYET' : existing.status) : 'CHO_DUYET',
        approved_by: changed ? '' : (existing ? existing.approved_by : ''), approved_at: changed ? '' : (existing ? existing.approved_at : '')
      }).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu mẫu tin.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu mẫu tin.', 'err'); });
      return;
    }

    if (code) {
      var ex = U.byId(st().templates, 'code', code);
      var changedBody = ex.body !== tpl.body || ex.channel !== tpl.channel;
      ex.name = tpl.name; ex.channel = tpl.channel; ex.subject = tpl.subject; ex.body = tpl.body;
      // Sửa nội dung thì mất hiệu lực duyệt cũ — mẫu phải đi duyệt lại.
      if (changedBody && ex.status === 'DA_DUYET') { ex.status = 'CHO_DUYET'; ex.approved_by = ''; ex.approved_at = ''; }
      commit('Mẫu tin', 'Sửa mẫu ' + ex.code + (changedBody ? ', chuyển về chờ duyệt lại.' : '.'));
    } else {
      if (U.byId(st().templates, 'code', tpl.code)) { ui.toast('Mã mẫu đã tồn tại.', 'err'); return; }
      tpl.status = 'CHO_DUYET';
      tpl.approved_by = ''; tpl.approved_at = '';
      st().templates.push(tpl);
      commit('Mẫu tin', 'Thêm mẫu ' + tpl.code + '.');
    }
  }

  function approveTemplate(code, ok) {
    var t = U.byId(st().templates, 'code', code);
    if (!t) return;
    if (U.isGas()) {
      LS.api.saveDelivery('template', code, {
        name: t.name, channel: t.channel, subject: t.subject, body: t.body, status: ok ? 'DA_DUYET' : 'TU_CHOI',
        approved_by: ok ? st().session : '', approved_at: ok ? U.now() : ''
      }).then(function () { return LS.app.refreshServer(ok ? 'Đã duyệt mẫu.' : 'Đã từ chối mẫu.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể duyệt mẫu.', 'err'); });
      return;
    }
    t.status = ok ? 'DA_DUYET' : 'TU_CHOI';
    t.approved_by = ok ? st().session : '';
    t.approved_at = ok ? U.now() : '';
    logCfg('Mẫu tin', (ok ? 'Duyệt' : 'Từ chối') + ' mẫu ' + code + '.');
    U.save();
    LS.app.render();
    ui.toast(ok ? 'Đã duyệt mẫu.' : 'Đã từ chối mẫu.');
  }

  /* ============================ Quy tắc thông báo ============================ */

  function rules() {
    var s = st();
    return ui.banner('info', 'Quy tắc nhận tin và thứ tự kênh',
      'Các kênh được thử theo thứ tự đã cấu hình.') +

      ui.block({
        title: 'Quy tắc thông báo', count: s.notifyRules.length, icon: 'bell',
        body: ui.table(
          [{ label: 'Sự kiện' }, { label: 'Người nhận' }, { label: 'Thứ tự kênh' }, { label: 'Mẫu' },
          { label: 'Nhắc lại', cls: 'fit' }, { label: 'Bật', cls: 'fit' }, { label: '', cls: 'fit' }],
          s.notifyRules.map(function (r) {
            var bad = r.channels.filter(function (c) { return !D.channelUsable(c, s); });
            return {
              cls: bad.length === r.channels.length ? 'flag-warn' : '',
              cells: [
                '<div class="t1">' + U.esc(D.NOTIFY_EVENTS[r.event] || r.event) + '</div>',
                '<div class="t2">' + U.esc(D.AUDIENCE[r.audience]) + '</div>' + (r.confirm ? ui.tag('Cần xác nhận', 'gold') : ''),
                '<div class="btn-row">' + r.channels.map(function (c) {
                  return ui.tag(D.CHANNELS[c] ? D.CHANNELS[c].name : c, D.channelUsable(c, s) ? 'ok' : 'neutral');
                }).join('') + '</div>',
                r.template
                  ? '<span class="tid">' + U.esc(r.template) + '</span>'
                  : '<span class="t2">không dùng mẫu</span>',
                r.throttle ? '<span class="t2">' + r.throttle + ' phút</span>' : '<span class="t2">—</span>',
                ui.switchBox('r_' + r.id, r.enabled, '', { attrs: ' data-act="rule-toggle" data-id="' + U.attr(r.id) + '"' }),
                ui.iconBtn('pencil', { act: 'rule-edit', data: ' data-id="' + U.attr(r.id) + '"', label: 'Sửa quy tắc' })
              ]
            };
          })
        )
      });
  }

  function ruleDialog(id) {
    var r = U.byId(st().notifyRules, 'id', id);
    if (!r) return;
    var tplOpts = st().templates.map(function (t) { return [t.code, t.name + ' (' + t.code + ')']; });

    ui.openDialog('Quy tắc thông báo',
      '<form data-form="rule" data-id="' + U.attr(id) + '">' +
      ui.banner('info', D.NOTIFY_EVENTS[r.event] || r.event, 'Gửi cho: ' + D.AUDIENCE[r.audience]) +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Kênh theo thứ tự ưu tiên') +
      '<div class="f-stack">' + Object.keys(D.CHANNELS).map(function (c) {
        var on = r.channels.indexOf(c) !== -1;
        var usable = D.channelUsable(c, st());
        return ui.checkbox('ch_' + c, on, D.CHANNELS[c].name,
          usable ? 'sẵn sàng gửi' : 'chưa sẵn sàng, sẽ bị bỏ qua khi chạy');
      }).join('') + '</div>' +
      '<p class="t2" style="margin-top:.5rem">Thứ tự thử theo danh sách trên xuống. Kênh đầu tiên dùng được sẽ nhận tin.</p>' +
      '</div>' +
      '<div style="margin-top:1.125rem"><div class="f-row">' +
      ui.field('Mẫu tin', ui.select('template', tplOpts, r.template, { blank: 'Không dùng mẫu (chỉ báo trong app)' })) +
      ui.field('Nhắc lại sau (phút)', ui.input('throttle', r.throttle, { type: 'number', min: 0 }), '0 là chỉ gửi một lần') +
      '</div>' +
      ui.checkbox('confirm', r.confirm, 'Cán bộ phải xem trước và xác nhận trước khi gửi',
        'bắt buộc với tin gửi khách hàng') +
      '</div>' +
      ui.formEnd('Lưu quy tắc') + '</form>',
      { size: 'md' });
  }

  function saveRule(form) {
    var r = U.byId(st().notifyRules, 'id', form.getAttribute('data-id'));
    var d = new FormData(form);
    var picked = Object.keys(D.CHANNELS).filter(function (c) { return d.get('ch_' + c) !== null; });
    if (!picked.length) { ui.toast('Chọn ít nhất một kênh.', 'err'); return; }

    r.channels = picked;
    r.template = String(d.get('template') || '');
    r.throttle = Number(d.get('throttle') || 0);
    r.confirm = d.get('confirm') !== null;

    if (U.isGas()) {
      LS.api.saveDelivery('rule', r.id, {
        event: r.event, audience: r.audience, channels: r.channels.join(','), template_code: r.template,
        enabled: r.enabled, needs_confirm: r.confirm, throttle_minutes: r.throttle
      }).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu quy tắc thông báo.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu quy tắc.', 'err'); });
      return;
    }

    commit('Quy tắc thông báo', 'Sửa quy tắc ' + (D.NOTIFY_EVENTS[r.event] || r.event) + '.');
  }

  function toggleRule(id) {
    var r = U.byId(st().notifyRules, 'id', id);
    r.enabled = !r.enabled;
    if (U.isGas()) {
      LS.api.saveDelivery('rule', r.id, {
        event: r.event, audience: r.audience, channels: r.channels.join(','), template_code: r.template,
        enabled: r.enabled, needs_confirm: r.confirm, throttle_minutes: r.throttle
      }).then(function () { return LS.app.refreshServer('Đã cập nhật quy tắc thông báo.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể cập nhật quy tắc.', 'err'); });
      return;
    }
    logCfg('Quy tắc thông báo', (r.enabled ? 'Bật' : 'Tắt') + ' quy tắc ' + (D.NOTIFY_EVENTS[r.event] || r.event) + '.');
    U.save();
    LS.app.render();
  }

  /* ============================ Hàng đợi gửi ============================ */

  function outbox() {
    var s = st();
    var h = D.outboxHealth(s);
    var list = s.outbox.filter(function (o) {
      if (oFilter.status && o.status !== oFilter.status) return false;
      if (oFilter.channel && o.channel !== oFilter.channel) return false;
      return true;
    });

    return ui.strip([
      ui.metric('Chờ gửi', h.backlog, h.backlog > s.settings.backlog_alert ? 'danger' : 'info'),
      ui.metric('Chờ xác nhận', h.waiting, h.waiting ? 'warn' : ''),
      ui.metric('Thất bại', h.failed, h.failed ? 'danger' : ''),
      ui.metric('Không gửi', h.skipped)
    ]) +

      ui.banner('warn', 'Bản trình duyệt không gửi ra ngoài',
        'GAS dùng worker và provider thật sau khi cấu hình gateway.') +

      ui.block({
        title: 'Hàng đợi gửi', count: list.length + '/' + s.outbox.length, icon: 'send',
        actions: ui.btn('Chạy hàng đợi', { kind: 'primary', sm: true, act: 'out-run', icon: 'play' }) +
          ui.btn('Gửi lại tin lỗi', { sm: true, act: 'out-retry-all', icon: 'refresh', disabled: !h.failed }),
        filters: ui.select('', Object.keys(D.OUT_STATUS).map(function (k) { return [k, D.OUT_STATUS[k].label]; }),
          oFilter.status, { blank: 'Mọi trạng thái', attrs: ' data-ofilter="status" style="flex:0 1 190px"' }) +
          ui.select('', Object.keys(D.CHANNELS).map(function (k) { return [k, D.CHANNELS[k].name]; }),
            oFilter.channel, { blank: 'Mọi kênh', attrs: ' data-ofilter="channel" style="flex:0 1 190px"' }),
        body: ui.table(
          [{ label: 'Thời gian', cls: 'fit' }, { label: 'Việc', cls: 'fit' }, { label: 'Kênh / người nhận' },
          { label: 'Sự kiện' }, { label: 'Trạng thái', cls: 'fit' }, { label: 'Ghi chú' }, { label: '', cls: 'fit' }],
          list.map(function (o) {
            var stt = D.OUT_STATUS[o.status];
            return {
              cls: o.status === 'THAT_BAI' ? 'flag' : (o.status === 'CHO_XAC_NHAN' ? 'flag-warn' : ''),
              cells: [
                '<span class="tid">' + U.fmtDT(o.created_at) + '</span>',
                o.item_id ? '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(o.item_id) + '">' + U.esc(o.item_id) + '</button>' : '<span class="t2">—</span>',
                '<div class="t1">' + U.esc(D.CHANNELS[o.channel] ? D.CHANNELS[o.channel].name : o.channel) + '</div>' +
                '<div class="t2">' + U.esc(o.recipient_name) + ' · ' + U.esc(U.mask(o.recipient)) + '</div>',
                '<div class="t2">' + U.esc(D.NOTIFY_EVENTS[o.event] || o.event) + '</div>',
                ui.tag(stt.label, stt.tone) + (o.retry ? '<div class="t2">thử ' + o.retry + ' lần</div>' : ''),
                '<div class="t2">' + U.esc(o.note || o.provider_id || '—') + '</div>',
                '<div class="btn-row">' +
                (o.status === 'CHO_XAC_NHAN'
                  ? ui.btn('Xem & gửi', { kind: 'primary', sm: true, act: 'out-confirm', data: ' data-id="' + U.attr(o.outbox_id) + '"' })
                  : '') +
                (o.status === 'THAT_BAI'
                  ? ui.iconBtn('refresh', { act: 'out-retry', data: ' data-id="' + U.attr(o.outbox_id) + '"', label: 'Gửi lại' })
                  : '') +
                (['CHO_GUI', 'CHO_XAC_NHAN', 'THAT_BAI'].indexOf(o.status) !== -1
                  ? ui.iconBtn('ban', { act: 'out-cancel', data: ' data-id="' + U.attr(o.outbox_id) + '"', label: 'Hủy tin' })
                  : '') +
                '</div>'
              ]
            };
          }),
          { icon: 'send', title: 'Hàng đợi trống', text: 'Chưa có tin nào khớp bộ lọc hiện tại.' }
        )
      });
  }

  function metrics() {
    var rows = st().notificationMetrics || [];
    var sent = rows.filter(function (m) { return m.status === 'SENT'; }).length;
    var failed = rows.filter(function (m) { return m.status === 'FAILED'; }).length;
    var skipped = rows.filter(function (m) { return m.status === 'KHONG_GUI'; }).length;
    var cost = rows.filter(function (m) { return m.status === 'SENT'; }).reduce(function (n, m) { return n + Number(m.unit_cost || 0); }, 0);
    var groups = {};
    rows.forEach(function (m) {
      var key = (m.month_key || 'Không rõ kỳ') + '|' + (m.channel || '—');
      if (!groups[key]) groups[key] = { month: m.month_key || '—', channel: m.channel || '—', queued: 0, sent: 0, failed: 0, skipped: 0, cost: 0, currency: m.currency || 'VND' };
      var g = groups[key];
      g.queued += 1;
      if (m.status === 'SENT') { g.sent += 1; g.cost += Number(m.unit_cost || 0); }
      if (m.status === 'FAILED') g.failed += 1;
      if (m.status === 'KHONG_GUI') g.skipped += 1;
    });
    var grouped = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      return String(b.month).localeCompare(String(a.month)) || String(a.channel).localeCompare(String(b.channel));
    });
    function money(n, currency) { return Number(n || 0).toLocaleString('vi-VN') + (currency ? ' ' + currency : ''); }
    // Cộng dồn nhiều loại tiền thành một con số là một con số vô nghĩa.
    var currencies = rows.filter(function (m) { return m.status === 'SENT'; })
      .map(function (m) { return m.currency || 'VND'; })
      .filter(function (c, i, all) { return all.indexOf(c) === i; });
    var rate = rows.length ? Math.round(sent * 1000 / rows.length) / 10 : 0;
    return ui.strip([
      ui.metric('Lượt ghi nhận', rows.length),
      ui.metric('Đã gửi', sent, sent ? 'ok' : ''),
      ui.metric('Tỷ lệ thành công', rate + '%', rate < 80 && rows.length ? 'warn' : ''),
      ui.metric('Chi phí', currencies.length === 1 ? money(cost, currencies[0]) : money(cost, '') + ' (nhiều loại tiền)')
    ]) + ui.block({
      title: 'Chi phí và hiệu quả gửi tin', count: grouped.length, icon: 'chart',
      note: 'Chi phí tính theo đơn giá của kênh tại thời điểm gửi; mỗi outbox chỉ tính một lần.',
      body: ui.table(
        [{ label: 'Kỳ', cls: 'fit' }, { label: 'Kênh', cls: 'fit' }, { label: 'Lượt ghi nhận', cls: 'num' },
          { label: 'Đã gửi', cls: 'num' }, { label: 'Lỗi', cls: 'num' }, { label: 'Không gửi', cls: 'num' }, { label: 'Chi phí', cls: 'num' }],
        grouped.map(function (g) { return { cells: [
          '<span class="tid">' + U.esc(g.month) + '</span>',
          U.esc(D.CHANNELS[g.channel] ? D.CHANNELS[g.channel].name : g.channel),
          '<span class="tid">' + g.queued + '</span>', '<span class="tid">' + g.sent + '</span>',
          '<span class="tid">' + g.failed + '</span>', '<span class="tid">' + g.skipped + '</span>',
          '<span class="tid">' + U.esc(money(g.cost, g.currency)) + '</span>'
        ] }; }),
        { icon: 'chart', title: 'Chưa có dữ liệu gửi', text: 'Số liệu xuất hiện sau khi có tin trong hàng đợi.' }
      )
    });
  }

  function runQueue() {
    if (U.isGas()) {
      LS.api.runOutbox().then(function (result) {
        return LS.app.refreshServer('Đã xử lý ' + result.sent + ' tin; lỗi ' + result.failed + '.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể chạy hàng đợi.', 'err'); });
      return;
    }
    var n = 0;
    st().outbox.forEach(function (o) {
      if (o.status !== 'CHO_GUI') return;
      D.dispatch(o, st());
      n += 1;
    });
    if (!n) { ui.toast('Không có tin nào đang chờ gửi.', 'warn'); return; }
    logCfg('Hàng đợi gửi', 'Chạy hàng đợi, xử lý ' + n + ' tin.');
    U.save();
    LS.app.render();
    ui.toast('Đã xử lý ' + n + ' tin trong hàng đợi.');
  }

  function retry(id) {
    var o = U.byId(st().outbox, 'outbox_id', id);
    var ch = U.byId(st().channels, 'code', o.channel);
    if (o.retry >= ch.max_retry) { ui.toast('Đã vượt số lần gửi lại tối đa của kênh.', 'err'); return; }
    if (U.isGas()) {
      LS.api.changeOutbox(id, 'RETRY').then(function () { return LS.app.refreshServer('Đã đưa tin về hàng chờ gửi.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể gửi lại tin.', 'err'); });
      return;
    }
    o.status = 'CHO_GUI';
    o.note = '';
    U.save();
    LS.app.render();
    ui.toast('Đã đưa tin về hàng chờ gửi.');
  }

  function retryAll() {
    if (U.isGas()) {
      var ids = st().outbox.filter(function (o) {
        var ch = U.byId(st().channels, 'code', o.channel);
        return o.status === 'THAT_BAI' && ch && o.retry < ch.max_retry;
      }).map(function (o) { return o.outbox_id; });
      if (!ids.length) { ui.toast('Không tin nào còn lượt gửi lại.', 'warn'); return; }
      Promise.all(ids.map(function (id) { return LS.api.changeOutbox(id, 'RETRY'); }))
        .then(function () { return LS.app.refreshServer('Đã đưa ' + ids.length + ' tin về hàng chờ.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể gửi lại các tin lỗi.', 'err'); });
      return;
    }
    var n = 0;
    st().outbox.forEach(function (o) {
      if (o.status !== 'THAT_BAI') return;
      var ch = U.byId(st().channels, 'code', o.channel);
      if (o.retry >= ch.max_retry) return;
      o.status = 'CHO_GUI';
      o.note = '';
      n += 1;
    });
    logCfg('Hàng đợi gửi', 'Đưa ' + n + ' tin lỗi về hàng chờ.');
    U.save();
    LS.app.render();
    ui.toast(n ? 'Đã đưa ' + n + ' tin về hàng chờ.' : 'Không tin nào còn lượt gửi lại.', n ? 'ok' : 'warn');
  }

  function cancel(id) {
    var o = U.byId(st().outbox, 'outbox_id', id);
    if (U.isGas()) {
      LS.api.changeOutbox(id, 'CANCEL').then(function () { return LS.app.refreshServer('Đã hủy tin.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể hủy tin.', 'err'); });
      return;
    }
    o.status = 'DA_HUY';
    o.note = 'Hủy bởi ' + userName(st().session);
    U.save();
    LS.app.render();
    ui.toast('Đã hủy tin.');
  }

  /** Tin gửi khách bắt buộc người có trách nhiệm xem nội dung trước khi phát đi. */
  function confirmSend(id) {
    var o = U.byId(st().outbox, 'outbox_id', id);
    if (!o) return;
    ui.openDialog('Xem trước nội dung gửi khách',
      '<form data-form="out-confirm" data-id="' + U.attr(id) + '">' +
      ui.kv([
        ['Kênh', D.CHANNELS[o.channel] ? D.CHANNELS[o.channel].name : o.channel],
        ['Người nhận', o.recipient_name],
        ['Địa chỉ', U.mask(o.recipient)],
        ['Mẫu', o.template_code || '—']
      ]) +
      '<div style="margin-top:1rem">' + ui.sectionTitle('Nội dung') +
      '<div class="tpl-bubble">' + U.esc(o.body || '(mẫu chưa có nội dung)') + '</div></div>' +
      ui.banner('warn', 'Kiểm tra trước khi gửi',
        'Nội dung không được nêu chi tiết khoản vay, CIF hay số tiền. Gửi rồi không thu hồi được.') +
      ui.formEnd('Xác nhận gửi') + '</form>',
      { size: 'md', sub: o.outbox_id });
  }

  function doConfirmSend(form) {
    var o = U.byId(st().outbox, 'outbox_id', form.getAttribute('data-id'));
    if (U.isGas()) {
      LS.api.changeOutbox(o.outbox_id, 'CONFIRM').then(function () {
        ui.closeDialog();
        return LS.app.refreshServer('Đã xác nhận, tin đang chờ worker gửi.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể xác nhận gửi.', 'err'); });
      return;
    }
    o.status = 'CHO_GUI';
    o.note = 'Đã xác nhận bởi ' + userName(st().session);
    D.dispatch(o, st());
    U.save();
    ui.closeDialog();
    LS.app.render();
    ui.toast(o.status === 'DA_GUI' ? 'Đã gửi.' : 'Gửi thất bại: ' + o.note, o.status === 'DA_GUI' ? 'ok' : 'err');
  }

  /* ============================ Loại việc ============================ */

  function types() {
    return ui.block({
      title: 'Loại việc', count: st().workTypes.length, icon: 'tag',
      note: 'Loại việc đã dùng thì ẩn đi, không xóa, để báo cáo cũ giữ đúng nhãn lúc phát sinh.',
      actions: ui.btn('Thêm loại việc', { kind: 'primary', sm: true, act: 'type-edit', icon: 'plus' }),
      body: ui.table(
        [{ label: 'Mã', cls: 'fit' }, { label: 'Nhóm' }, { label: 'Tên hiển thị' }, { label: 'SLA', cls: 'num' },
        { label: 'Việc phải làm', cls: 'num' }, { label: 'Cần hẹn', cls: 'fit' }, { label: 'KS duyệt', cls: 'fit' },
        { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
        st().workTypes.map(function (w) {
          return {
            cells: [
              '<span class="tid">' + U.esc(w.code) + '</span>',
              '<div class="t2">' + U.esc(w.group) + '</div>',
              '<div class="t1">' + U.esc(w.name) + '</div>',
              '<span class="tid">' + w.sla_hours + 'h</span>',
              '<span class="tid">' + w.checklist.length + '</span>',
              w.needs_appointment ? ui.tag('Có', 'info') : '<span class="t2">Không</span>',
              w.needs_ks_approval ? ui.tag('Có', 'gold') : '<span class="t2">Không</span>',
              w.active ? ui.tag('Hoạt động', 'ok') : ui.tag('Đã ẩn', 'neutral'),
              ui.iconBtn('pencil', { act: 'type-edit', data: ' data-code="' + U.attr(w.code) + '"', label: 'Sửa loại việc' })
            ]
          };
        })
      )
    });
  }

  function typeDialog(code) {
    var w = code ? U.byId(st().workTypes, 'code', code) : null;
    var cur = w || { code: '', name: '', group: '', sla_hours: 8, needs_appointment: true, needs_ks_approval: false, active: true, checklist: [] };

    ui.openDialog(w ? 'Sửa loại việc' : 'Thêm loại việc',
      '<form data-form="work-type"' + (w ? ' data-code="' + U.attr(w.code) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Mã', ui.input('code', cur.code, { required: true, disabled: !!w, placeholder: 'VT_...' }), w ? 'không đổi sau khi đã dùng' : '') +
      ui.field('Nhóm', ui.input('group', cur.group, { required: true })) +
      ui.field('Tên hiển thị', ui.input('name', cur.name, { required: true })) +
      ui.field('SLA (giờ làm việc)', ui.input('sla_hours', cur.sla_hours, { type: 'number', min: 1, max: 720, required: true }),
        'tính theo lịch làm việc, không tính giờ nghỉ') +
      '</div>' +
      '<div class="f-stack" style="margin-top:1rem">' +
      ui.checkbox('needs_appointment', cur.needs_appointment, 'Cần hẹn khách ký hồ sơ', 'không cho hoàn thành thẳng khi chưa có kết quả hẹn') +
      ui.checkbox('needs_ks_approval', cur.needs_ks_approval, 'Cần kiểm soát duyệt hoàn thành', 'cán bộ trình, kiểm soát chốt') +
      ui.checkbox('active', cur.active, 'Đang hoạt động', 'bỏ chọn để ẩn thay vì xóa') +
      '</div>' +
      '<div style="margin-top:1.125rem">' +
      ui.field('Việc phải làm', ui.textarea('checklist', cur.checklist.join('\n'), { placeholder: 'mỗi dòng một mục' }),
        'cán bộ phải tích đủ mới báo soạn xong được') +
      '</div>' +
      ui.formEnd('Lưu') + '</form>',
      { size: 'md' });
  }

  function saveType(form) {
    var d = new FormData(form);
    var code = form.getAttribute('data-code');
    var patch = {
      group: String(d.get('group')).trim(),
      name: String(d.get('name')).trim(),
      sla_hours: Number(d.get('sla_hours')),
      needs_appointment: d.get('needs_appointment') !== null,
      needs_ks_approval: d.get('needs_ks_approval') !== null,
      active: d.get('active') !== null,
      checklist: String(d.get('checklist') || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)
    };
    var targetCode = code || String(d.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (U.isGas()) {
      if (!targetCode) { ui.toast('Cần mã loại việc.', 'err'); return; }
      LS.api.saveCatalog('workType', targetCode, {
        group_name: patch.group, display_name: patch.name, sla_hours: patch.sla_hours,
        requires_appointment: patch.needs_appointment, requires_ks_approval: patch.needs_ks_approval,
        is_active: patch.active, checklist_json: JSON.stringify(patch.checklist)
      }).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu loại việc.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu loại việc.', 'err'); });
      return;
    }

    if (code) {
      var w = U.byId(st().workTypes, 'code', code);
      var inUse = st().items.filter(function (i) { return i.work_type_code === code && D.STATUS[i.status].open; }).length;
      if (!patch.active && inUse) { ui.toast('Còn ' + inUse + ' việc đang mở dùng loại này.', 'err'); return; }
      Object.keys(patch).forEach(function (k) { w[k] = patch[k]; });
      commit('Loại việc', 'Sửa ' + code + '.');
    } else {
      patch.code = String(d.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      if (U.byId(st().workTypes, 'code', patch.code)) { ui.toast('Mã loại việc đã tồn tại.', 'err'); return; }
      st().workTypes.push(patch);
      commit('Loại việc', 'Thêm ' + patch.code + '.');
    }
  }

  /* ============================ Đơn vị ============================ */

  function units() {
    return ui.block({
      title: 'Đơn vị', count: st().units.length, icon: 'building',
      actions: ui.btn('Thêm đơn vị', { kind: 'primary', sm: true, act: 'unit-edit', icon: 'plus' }),
      body: ui.table(
        [{ label: 'Mã', cls: 'fit' }, { label: 'Tên đơn vị' }, { label: 'Loại', cls: 'fit' },
        { label: 'Người dùng', cls: 'num' }, { label: 'Việc đã gửi', cls: 'num' }, { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
        st().units.map(function (x) {
          var people = st().users.filter(function (u) { return u.unit_id === x.unit_id; }).length;
          var reqs = st().requests.filter(function (r) { return r.unit_id === x.unit_id; }).length;
          return {
            cells: [
              '<span class="tid">' + U.esc(x.unit_id) + '</span>',
              '<div class="t1">' + U.esc(x.name) + '</div>',
              '<div class="t2">' + U.esc({ PGD: 'Phòng / PGD', LS: 'Ban LS', HT: 'Hệ thống' }[x.kind] || x.kind) + '</div>',
              '<span class="tid">' + people + '</span>',
              '<span class="tid">' + reqs + '</span>',
              x.active ? ui.tag('Hoạt động', 'ok') : ui.tag('Đã ẩn', 'neutral'),
              ui.iconBtn('pencil', { act: 'unit-edit', data: ' data-id="' + U.attr(x.unit_id) + '"', label: 'Sửa đơn vị' })
            ]
          };
        })
      )
    });
  }

  function unitDialog(id) {
    var x = id ? U.byId(st().units, 'unit_id', id) : null;
    var cur = x || { unit_id: '', name: '', kind: 'PGD', active: true };
    ui.openDialog(x ? 'Sửa đơn vị' : 'Thêm đơn vị',
      '<form data-form="unit"' + (x ? ' data-id="' + U.attr(x.unit_id) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Mã', ui.input('unit_id', cur.unit_id, { required: true, disabled: !!x, placeholder: 'PGD_...' })) +
      ui.field('Tên đơn vị', ui.input('name', cur.name, { required: true })) +
      ui.field('Loại', ui.select('kind', [['PGD', 'Phòng / PGD gửi việc'], ['LS', 'Ban tín dụng LS'], ['HT', 'Quản trị hệ thống']], cur.kind)) +
      '</div>' +
      '<div style="margin-top:1rem">' + ui.checkbox('active', cur.active, 'Đang hoạt động') + '</div>' +
      ui.formEnd('Lưu') + '</form>');
  }

  function saveUnit(form) {
    var d = new FormData(form);
    var id = form.getAttribute('data-id');
    var patch = { name: String(d.get('name')).trim(), kind: String(d.get('kind')), active: d.get('active') !== null };
    var targetId = id || String(d.get('unit_id')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (U.isGas()) {
      if (!targetId) { ui.toast('Cần mã đơn vị.', 'err'); return; }
      LS.api.saveCatalog('unit', targetId, { name: patch.name, kind: patch.kind === 'PGD' ? 'DON_VI_GUI' : patch.kind, is_active: patch.active })
        .then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu đơn vị.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu đơn vị.', 'err'); });
      return;
    }

    if (id) {
      var x = U.byId(st().units, 'unit_id', id);
      Object.keys(patch).forEach(function (k) { x[k] = patch[k]; });
      commit('Đơn vị', 'Sửa ' + id + '.');
    } else {
      patch.unit_id = String(d.get('unit_id')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      if (U.byId(st().units, 'unit_id', patch.unit_id)) { ui.toast('Mã đơn vị đã tồn tại.', 'err'); return; }
      st().units.push(patch);
      commit('Đơn vị', 'Thêm ' + patch.unit_id + '.');
    }
  }

  /* ============================ Người dùng ============================ */

  function users() {
    return ui.block({
      title: 'Người dùng', count: st().users.length, icon: 'users',
      actions: ui.btn('Thêm người dùng', { kind: 'primary', sm: true, act: 'user-edit', icon: 'plus' }) +
        ui.btn('Nhập Excel/CSV', { sm: true, act: 'user-import', icon: 'upload' }),
      body: '<p class="t2" style="margin:0 0 .75rem">Mã cán bộ gắn với đúng một phòng/PGD. Phòng/PGD đăng nhập bằng mã; LS, kiểm soát và quản trị dùng mã kèm mật khẩu. Có thể xuất Excel thành CSV UTF-8 để nhập nhiều dòng.</p>' + ui.table(
        [{ label: 'Mã đăng nhập', cls: 'fit' }, { label: 'Họ tên' }, { label: 'Email' }, { label: 'Đơn vị' },
        { label: 'Vai trò', cls: 'fit' }, { label: 'Việc đang mở', cls: 'num' }, { label: 'Trạng thái', cls: 'fit' }, { label: 'Nghỉ', cls: 'fit' }, { label: '', cls: 'fit' }],
        st().users.map(function (u) {
          var open = st().items.filter(function (i) {
            return i.assigned_user_id === u.user_id && D.STATUS[i.status].open;
          }).length;
          return {
            cells: [
              '<span class="tid">' + U.esc(u.login_code || u.user_id) + '</span>',
              '<div class="t1">' + U.esc(u.full_name) + '</div>',
              '<div class="t2">' + U.esc(u.email) + '</div>',
              '<div class="t2">' + U.esc(LS.screens.unitName(u.unit_id)) + '</div>',
              ui.tag(D.ROLES[u.role].label, 'info'),
              open ? '<span class="tid">' + open + '</span>' : '<span class="t2">—</span>',
              !u.active ? ui.tag('Đã khóa', 'neutral') : D.userOff(u) ? ui.tag('Đang nghỉ', 'warn') : ui.tag('Hoạt động', 'ok'),
              u.active && D.userOff(u) ? '<div class="t2">' + U.esc((u.off_from || '') + (u.off_to ? ' → ' + u.off_to : '')) + '</div>' : '',
              ui.iconBtn('pencil', { act: 'user-edit', data: ' data-id="' + U.attr(u.user_id) + '"', label: 'Sửa người dùng' })
            ]
          };
        })
      )
    });
  }

  function userDialog(id) {
    var u = id ? U.byId(st().users, 'user_id', id) : null;
    var cur = u || { user_id: '', login_code: '', auth_group: 'INTERNAL', full_name: '', email: '', unit_id: 'PHONG_LS', role: 'CAN_BO_LS', active: true, availability_status: 'AVAILABLE', off_from: '', off_to: '', off_reason: '', replacement_user_id: '', zalo_name: '', zalo_phone: '', telegram_chat_id: '' };

    ui.openDialog(u ? 'Sửa người dùng' : 'Thêm người dùng',
      '<form data-form="user"' + (u ? ' data-id="' + U.attr(u.user_id) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Mã cán bộ / user', ui.input('login_code', cur.login_code || cur.user_id, { required: true, placeholder: '164392 hoặc admin' })) +
      ui.field('Họ tên', ui.input('full_name', cur.full_name, { required: true })) +
      ui.field('Email công vụ', ui.input('email', cur.email || '', { type: 'email' })) +
      ui.field('Đơn vị', ui.select('unit_id', st().units.filter(function (x) { return x.active; }).map(function (x) {
        return [x.unit_id, x.name];
      }), cur.unit_id)) +
      ui.field('Vai trò', ui.select('role', Object.keys(D.ROLES).map(function (k) { return [k, D.ROLES[k].label]; }), cur.role)) +
      ui.field('Khả năng nhận việc', ui.select('availability_status', [['AVAILABLE', 'Có thể nhận việc'], ['OFF', 'Đang nghỉ']], cur.availability_status || 'AVAILABLE')) +
      ui.field('Nghỉ từ', ui.input('off_from', cur.off_from || '', { type: 'date' })) +
      ui.field('Nghỉ đến', ui.input('off_to', cur.off_to || '', { type: 'date' })) +
      ui.field('Cán bộ thay thế', ui.select('replacement_user_id', st().users.filter(function (x) { return x.role === 'CAN_BO_LS' && x.active && x.user_id !== cur.user_id; }).map(function (x) { return [x.user_id, x.full_name]; }), cur.replacement_user_id || '', { blank: 'Không chỉ định' }), 'Nếu đổi khỏi Cán bộ LS khi còn việc mở, chọn cán bộ thay thế; hệ thống sẽ bàn giao trong cùng thao tác.') +
      ui.field('Tên trong nhóm Zalo', ui.input('zalo_name', cur.zalo_name || ''), 'dùng để gắn thẻ khi nhắn nhóm') +
      ui.field('Số Zalo', ui.input('zalo_phone', cur.zalo_phone || '', { type: 'tel' })) +
      ui.field('Chat ID Telegram', ui.input('telegram_chat_id', cur.telegram_chat_id || ''), 'bot chỉ nhắn được cho người đã bắt đầu trò chuyện') +
      '</div>' +
      ui.field('Mật khẩu mới', ui.input('new_password', '', { type: 'password', placeholder: 'Để trống để giữ nguyên; phòng/PGD không cần nhập' })) +
      '<div style="margin-top:1rem">' +
      ui.checkbox('active', cur.active, 'Tài khoản đang hoạt động', 'khóa tài khoản khi nghỉ hoặc chuyển công tác') + '</div>' +
      ui.field('Lý do nghỉ', ui.textarea('off_reason', cur.off_reason || '', { placeholder: 'Ví dụ: nghỉ phép, nghỉ ốm, đi công tác' })) +
      ui.formEnd('Lưu') + '</form>');
  }

  function saveUser(form) {
    var d = new FormData(form);
    var id = form.getAttribute('data-id');
    var email = String(d.get('email') || '').trim().toLowerCase();
    var loginCode = String(d.get('login_code') || '').trim();
    if (st().users.filter(function (x) { return String(x.login_code || x.user_id).toLowerCase() === loginCode.toLowerCase() && x.user_id !== id; }).length) {
      ui.toast('Mã đăng nhập đã được dùng cho tài khoản khác.', 'err');
      return;
    }

    var patch = {
      full_name: String(d.get('full_name')).trim(), email: email, login_code: loginCode,
      unit_id: String(d.get('unit_id')), role: String(d.get('role')), active: d.get('active') !== null,
      auth_group: String(d.get('role')) === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL',
      new_password: String(d.get('new_password') || ''),
      availability_status: String(d.get('availability_status') || 'AVAILABLE').toUpperCase(),
      off_from: String(d.get('off_from') || ''), off_to: String(d.get('off_to') || ''),
      off_reason: String(d.get('off_reason') || '').trim(), replacement_user_id: String(d.get('replacement_user_id') || ''),
      zalo_name: String(d.get('zalo_name') || '').trim(), zalo_phone: String(d.get('zalo_phone') || '').trim(),
      telegram_chat_id: String(d.get('telegram_chat_id') || '').trim()
    };
    var targetId = id || U.uid('U');
    if (U.isGas()) {
      LS.api.saveCatalog('user', targetId, {
        full_name: patch.full_name, email: patch.email, login_code: patch.login_code, auth_group: patch.auth_group,
        new_password: patch.new_password, unit_id: patch.unit_id, role: patch.role, is_active: patch.active,
        availability_status: patch.availability_status, off_from: patch.off_from, off_to: patch.off_to,
        off_reason: patch.off_reason, replacement_user_id: patch.replacement_user_id,
        zalo_name: patch.zalo_name, zalo_phone: patch.zalo_phone, telegram_chat_id: patch.telegram_chat_id
      }).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu người dùng.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu người dùng.', 'err'); });
      return;
    }

    if (id) {
      var u = U.byId(st().users, 'user_id', id);
      var open = st().items.filter(function (i) {
        return i.assigned_user_id === id && D.STATUS[i.status].open;
      }).length;
      if (u.role === 'CAN_BO_LS' && (patch.role !== 'CAN_BO_LS' || !patch.active) && open) {
        if (!patch.replacement_user_id) {
          ui.toast('Còn ' + open + ' việc đang mở — chọn cán bộ thay thế trước khi đổi vai trò hoặc khóa.', 'err');
          return;
        }
        var replacement = U.byId(st().users, 'user_id', patch.replacement_user_id);
        if (!replacement || replacement.role !== 'CAN_BO_LS' || !replacement.active) {
          ui.toast('Cán bộ thay thế phải là cán bộ LS đang hoạt động.', 'err');
          return;
        }
        var handedAt = new Date().toISOString();
        st().items.filter(function (i) {
          return i.assigned_user_id === id && D.STATUS[i.status].open;
        }).forEach(function (i) {
          i.assigned_user_id = patch.replacement_user_id;
          i.assigned_by = 'ADMIN';
          i.assigned_at = handedAt;
          i.updated_at = handedAt;
          i.version = Number(i.version || 0) + 1;
        });
      }
      Object.keys(patch).forEach(function (k) { u[k] = patch[k]; });
      commit('Người dùng', 'Sửa ' + id + ' (' + patch.role + ').');
    } else {
      patch.user_id = U.uid('U');
      st().users.push(patch);
      commit('Người dùng', 'Thêm ' + patch.full_name + ' (' + patch.role + ').');
    }
  }

  function userImportDialog() {
    ui.openDialog('Nhập danh sách cán bộ',
      '<form data-form="user-import">' +
      '<p class="t2">Chọn file CSV/TSV UTF-8 xuất từ Excel. Cột bắt buộc: <b>login_code, full_name, unit_id</b>. Có thể thêm email, role, password, is_active.</p>' +
      ui.field('Tệp Excel đã xuất CSV', '<input class="input" type="file" name="file" accept=".csv,.tsv,.txt" required>') +
      '<p class="t2">Phòng/PGD tự vào nhóm EXTERNAL; các vai trò LS/KS/QUAN_LY_LS/ADMIN vào nhóm INTERNAL.</p>' +
      ui.formEnd('Nhập dữ liệu') + '</form>');
  }

  function parseImportText(text) {
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (!lines.length) return [];
    var delimiter = lines[0].indexOf('\t') !== -1 ? '\t' : (lines[0].indexOf(';') !== -1 ? ';' : ',');
    function cells(line) {
      var out = [], cur = '', quoted = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        if (ch === '"' && line.charAt(i + 1) === '"' && quoted) { cur += '"'; i += 1; continue; }
        if (ch === '"') { quoted = !quoted; continue; }
        if (ch === delimiter && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      out.push(cur.trim()); return out;
    }
    var headers = cells(lines.shift()).map(function (x) {
      return x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    });
    return lines.map(function (line) {
      var values = cells(line), row = {};
      headers.forEach(function (key, index) { row[key] = values[index] || ''; });
      return row;
    });
  }

  function importUsers(form) {
    var file = form.querySelector('input[type=file]').files[0];
    if (!file) { ui.toast('Chọn file CSV/TSV trước.', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var rows;
      try { rows = parseImportText(reader.result); } catch (e) { ui.toast('Không đọc được file nhập.', 'err'); return; }
      if (!rows.length) { ui.toast('File không có dòng dữ liệu.', 'err'); return; }
      if (!U.isGas()) {
        rows.forEach(function (r) {
          var code = String(r.login_code || r.ma_can_bo || '').trim();
          if (!code || !r.full_name || !r.unit_id) return;
          st().users.push({ user_id: r.user_id || U.uid('U'), login_code: code, auth_group: (r.role || 'PHONG_PGD') === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL', full_name: r.full_name, email: r.email || '', unit_id: r.unit_id, role: r.role || 'PHONG_PGD', active: r.is_active !== 'false' });
        });
        commit('Người dùng', 'Nhập danh sách cán bộ từ CSV.'); return;
      }
      LS.api.importUsers(rows).then(function (result) {
        ui.closeDialog(); return LS.app.refreshServer('Đã nhập ' + (result.created + result.updated) + ' cán bộ.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể nhập danh sách cán bộ.', 'err'); });
    };
    reader.readAsText(file, 'UTF-8');
  }

  /* ============================ Lý do ============================ */

  function reasons() {
    var groups = { BO_SUNG: 'Trả bổ sung', TAM_DUNG: 'Tạm dừng', HUY: 'Hủy việc' };
    return ui.block({
      title: 'Danh mục lý do', count: st().reasons.length, icon: 'clipboard',
      note: 'Lý do chọn sẵn giúp báo cáo gom nhóm được. Cán bộ vẫn ghi thêm diễn giải tự do.',
      actions: ui.btn('Thêm lý do', { kind: 'primary', sm: true, act: 'reason-edit', icon: 'plus' }),
      body: ui.table(
        [{ label: 'Mã', cls: 'fit' }, { label: 'Nhóm', cls: 'fit' }, { label: 'Nội dung' }, { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
        st().reasons.map(function (r) {
          return {
            cells: [
              '<span class="tid">' + U.esc(r.code) + '</span>',
              ui.tag(groups[r.group] || r.group, 'neutral'),
              '<div class="t1">' + U.esc(r.label) + '</div>',
              r.active ? ui.tag('Dùng', 'ok') : ui.tag('Ẩn', 'neutral'),
              ui.iconBtn('pencil', { act: 'reason-edit', data: ' data-code="' + U.attr(r.code) + '"', label: 'Sửa lý do' })
            ]
          };
        })
      )
    });
  }

  /* ============================ Dropdown nguồn ============================ */

  function catalog() {
    var rows = (st().catalogOptions || []).slice().sort(function (a, b) {
      return String(a.catalog_key).localeCompare(String(b.catalog_key)) ||
        (a.sort_order || 9999) - (b.sort_order || 9999);
    });
    var labels = { REQUESTOR: 'VRM/PRM', PRODUCT: 'Sản phẩm', LS_STAFF: 'Cán bộ LS', ASSIGNMENT_RULE: 'Quy tắc phân công' };
    return ui.block({
      title: 'Dropdown theo Sheet nguồn', count: rows.length, icon: 'list',
      note: 'Giữ thứ tự STT và nguồn tab; không xoá dòng đã dùng, chỉ ẩn/hiện để bảo toàn lịch sử.',
      actions: ui.btn('Thêm mục dropdown', { kind: 'primary', sm: true, act: 'catalog-option-edit', icon: 'plus' }),
      body: ui.table(
        [{ label: 'Nhóm', cls: 'fit' }, { label: 'Phòng' }, { label: 'Nhãn hiển thị' },
          { label: 'Thứ tự', cls: 'fit' }, { label: 'Nguồn', cls: 'fit' }, { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
        rows.map(function (x) {
          return { cells: [
            ui.tag(labels[x.catalog_key] || x.catalog_key, 'info'),
            '<div class="t2">' + U.esc(LS.screens.unitName(x.unit_id) || '—') + '</div>',
            '<div class="t1">' + U.esc(x.label) + '</div>',
            '<span class="tid">' + U.esc(String(x.sort_order || '')) + '</span>',
            '<span class="t2">' + U.esc((x.source_tab || '') + (x.source_row ? ' · dòng ' + x.source_row : '')) + '</span>',
            x.active ? ui.tag('Đang dùng', 'ok') : ui.tag('Đã ẩn', 'neutral'),
            ui.iconBtn('pencil', { act: 'catalog-option-edit', data: ' data-id="' + U.attr(x.option_id) + '"', label: 'Sửa dropdown' })
          ] };
        }), { icon: 'list', title: 'Chưa có dropdown', text: 'Chạy setupSheetDB để nạp danh mục nguồn.' }
      )
    });
  }

  function catalogOptionDialog(id) {
    var x = id ? U.byId(st().catalogOptions || [], 'option_id', id) : null;
    var cur = x || { option_id: '', catalog_key: 'REQUESTOR', unit_id: '', label: '', role_kind: 'VRM_PRM', sort_order: 9999, source_tab: 'Admin', source_row: '', active: true };
    ui.openDialog(x ? 'Sửa dropdown' : 'Thêm dropdown',
      '<form data-form="catalog-option"' + (x ? ' data-id="' + U.attr(x.option_id) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Nhóm', ui.select('catalog_key', [['REQUESTOR', 'Cán bộ đề nghị VRM/PRM'], ['PRODUCT', 'Sản phẩm'], ['LS_STAFF', 'Cán bộ LS']], cur.catalog_key)) +
      ui.field('Phòng áp dụng', ui.select('unit_id', st().units.filter(function (u) { return u.active; }).map(function (u) { return [u.unit_id, u.name]; }), cur.unit_id, { blank: 'Tất cả phòng' })) +
      ui.field('Nhãn hiển thị', ui.input('label', cur.label, { required: true })) +
      ui.field('Thứ tự', ui.input('sort_order', cur.sort_order, { type: 'number', min: 1 })) +
      '</div><div style="margin-top:1rem">' + ui.checkbox('active', cur.active, 'Đang dùng') + '</div>' +
      ui.formEnd('Lưu dropdown') + '</form>');
  }

  function saveCatalogOption(form) {
    var d = new FormData(form), id = form.getAttribute('data-id') || U.uid('OPT');
    var patch = { catalog_key: String(d.get('catalog_key')), unit_id: String(d.get('unit_id') || ''),
      label: String(d.get('label') || '').trim(),
      role_kind: { PRODUCT: 'PRODUCT', LS_STAFF: 'LS' }[String(d.get('catalog_key'))] || 'VRM_PRM',
      sort_order: Number(d.get('sort_order') || 9999), is_active: d.get('active') !== null, source_tab: 'Admin', source_row: '', metadata_json: '{}' };
    if (!patch.label) { ui.toast('Cần nhãn hiển thị.', 'err'); return; }
    if (U.isGas()) {
      LS.api.saveCatalog('catalogOption', id, patch).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu dropdown.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu dropdown.', 'err'); });
      return;
    }
    var found = U.byId(st().catalogOptions || [], 'option_id', id);
    if (found) {
      Object.keys(patch).forEach(function (k) { if (k !== 'is_active') found[k] = patch[k]; });
      found.active = patch.is_active;
    } else {
      patch.option_id = id; patch.active = patch.is_active; delete patch.is_active;
      st().catalogOptions = st().catalogOptions || []; st().catalogOptions.push(patch);
    }
    commit('Dropdown nguồn', (found ? 'Sửa ' : 'Thêm ') + id + '.');
  }

  /* ============================ Phân công nhanh ============================ */

  function assignmentRules() {
    return (st().catalogOptions || []).filter(function (x) { return x.catalog_key === 'ASSIGNMENT_RULE'; }).sort(function (a, b) {
      return Number((a.metadata || {}).priority || a.sort_order || 9999) - Number((b.metadata || {}).priority || b.sort_order || 9999);
    });
  }

  function assignment() {
    var rows = assignmentRules();
    return ui.block({
      title: 'Cấu hình phân công nhanh', count: rows.length, icon: 'zap',
      note: 'Khi bấm phân công nhanh, hệ thống ưu tiên khớp phòng + loại việc + sản phẩm; kiểm soát LS vẫn có thể đổi người trước khi lưu.',
      actions: ui.btn('Thêm quy tắc', { kind: 'primary', sm: true, act: 'assignment-rule-edit', icon: 'plus' }),
      body: ui.table(
        [{ label: 'Phòng' }, { label: 'Loại việc' }, { label: 'Sản phẩm' }, { label: 'Cán bộ LS' }, { label: 'Ưu tiên', cls: 'num' }, { label: 'Trạng thái', cls: 'fit' }, { label: '', cls: 'fit' }],
        rows.map(function (x) {
          var m = x.metadata || {}, staff = U.byId(st().users, 'user_id', m.assignee_id);
          return { cells: [
            '<div class="t1">' + U.esc(LS.screens.unitName(m.unit_id || x.unit_id) || 'Tất cả phòng') + '</div>',
            '<div class="t2">' + U.esc((U.byId(st().workTypes, 'code', m.work_type_code) || {}).name || 'Mọi loại việc') + '</div>',
            '<div class="t2">' + U.esc(m.product_name || 'Mọi sản phẩm') + '</div>',
            '<div class="t1">' + U.esc(staff ? staff.full_name : x.label) + '</div>',
            '<span class="tid">' + U.esc(String(m.priority || x.sort_order || 9999)) + '</span>',
            x.active ? ui.tag('Đang dùng', 'ok') : ui.tag('Đã ẩn', 'neutral'),
            ui.iconBtn('pencil', { act: 'assignment-rule-edit', data: ' data-id="' + U.attr(x.option_id) + '"', label: 'Sửa quy tắc' })
          ] };
        }), { icon: 'zap', title: 'Chưa có quy tắc', text: 'Thêm quy tắc theo phòng, nghiệp vụ và cán bộ phụ trách.' }
      )
    });
  }

  function assignmentRuleDialog(id) {
    var x = id ? U.byId(st().catalogOptions || [], 'option_id', id) : null;
    var m = x && x.metadata ? x.metadata : {};
    var units = st().units.filter(function (u) { return u.active && (u.kind === 'PGD' || u.kind === 'DON_VI_GUI'); });
    var staff = LS.screens.staffList();
    ui.openDialog(x ? 'Sửa quy tắc phân công' : 'Thêm quy tắc phân công',
      '<form data-form="assignment-rule"' + (x ? ' data-id="' + U.attr(x.option_id) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Phòng', ui.select('unit_id', units.map(function (u) { return [u.unit_id, u.name]; }), m.unit_id || (x && x.unit_id) || '', { blank: 'Tất cả phòng' })) +
      ui.field('Loại việc', ui.select('work_type_code', st().workTypes.filter(function (w) { return w.active; }).map(function (w) { return [w.code, w.name]; }), m.work_type_code || '', { blank: 'Mọi loại việc' })) +
      ui.field('Sản phẩm', ui.input('product_name', m.product_name || '', { placeholder: 'Để trống = mọi sản phẩm' })) +
      ui.field('Cán bộ LS', ui.select('assignee_id', staff.map(function (u) { return [u.user_id, u.full_name]; }), m.assignee_id || '', { attrs: ' required' })) +
      ui.field('Ưu tiên', ui.input('priority', m.priority || 1, { type: 'number', min: 1 })) +
      '</div>' + ui.checkbox('active', !x || x.active, 'Đang dùng') + ui.formEnd('Lưu quy tắc') + '</form>'
    );
  }

  function saveAssignmentRule(form) {
    var d = new FormData(form), id = form.getAttribute('data-id') || U.uid('RULE');
    var unitId = String(d.get('unit_id') || ''), workType = String(d.get('work_type_code') || ''), product = String(d.get('product_name') || '').trim(), assignee = String(d.get('assignee_id') || '');
    var staff = U.byId(st().users, 'user_id', assignee);
    if (!staff || staff.role !== 'CAN_BO_LS' || !staff.active) { ui.toast('Chọn cán bộ LS đang hoạt động.', 'err'); return; }
    var metadata = { unit_id: unitId, work_type_code: workType, product_name: product, assignee_id: assignee, priority: Number(d.get('priority') || 1) };
    var patch = { catalog_key: 'ASSIGNMENT_RULE', unit_id: unitId, code: workType || 'ALL', label: staff.full_name,
      role_kind: assignee, sort_order: metadata.priority, source_tab: 'Admin', source_row: '', is_active: d.get('active') !== null, metadata_json: JSON.stringify(metadata) };
    if (U.isGas()) {
      LS.api.saveCatalog('catalogOption', id, patch).then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu quy tắc phân công.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu quy tắc.', 'err'); });
      return;
    }
    var found = U.byId(st().catalogOptions || [], 'option_id', id);
    if (found) { Object.keys(patch).forEach(function (k) { found[k] = k === 'is_active' ? undefined : patch[k]; }); found.active = patch.is_active; found.metadata = metadata; }
    else { patch.option_id = id; patch.active = patch.is_active; patch.metadata = metadata; delete patch.is_active; st().catalogOptions.push(patch); }
    commit('Phân công nhanh', (found ? 'Sửa ' : 'Thêm ') + id + '.');
  }

  function reasonDialog(code) {
    var r = code ? U.byId(st().reasons, 'code', code) : null;
    var cur = r || { code: '', group: 'BO_SUNG', label: '', active: true };
    ui.openDialog(r ? 'Sửa lý do' : 'Thêm lý do',
      '<form data-form="reason"' + (r ? ' data-code="' + U.attr(r.code) + '"' : '') + '>' +
      '<div class="f-row">' +
      ui.field('Mã', ui.input('code', cur.code, { required: true, disabled: !!r })) +
      ui.field('Nhóm', ui.select('group', [['BO_SUNG', 'Trả bổ sung'], ['TAM_DUNG', 'Tạm dừng'], ['HUY', 'Hủy việc']], cur.group)) +
      '</div>' +
      ui.field('Nội dung', ui.input('label', cur.label, { required: true })) +
      '<div style="margin-top:1rem">' + ui.checkbox('active', cur.active, 'Đang dùng') + '</div>' +
      ui.formEnd('Lưu') + '</form>');
  }

  function saveReason(form) {
    var d = new FormData(form);
    var code = form.getAttribute('data-code');
    var patch = { group: String(d.get('group')), label: String(d.get('label')).trim(), active: d.get('active') !== null };
    var targetCode = code || String(d.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (U.isGas()) {
      if (!targetCode) { ui.toast('Cần mã lý do.', 'err'); return; }
      LS.api.saveCatalog('reason', targetCode, { group_name: patch.group, label: patch.label, is_active: patch.active })
        .then(function () { ui.closeDialog(); return LS.app.refreshServer('Đã lưu lý do.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu lý do.', 'err'); });
      return;
    }
    if (code) {
      var r = U.byId(st().reasons, 'code', code);
      Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
      commit('Lý do', 'Sửa ' + code + '.');
    } else {
      patch.code = String(d.get('code')).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      if (U.byId(st().reasons, 'code', patch.code)) { ui.toast('Mã đã tồn tại.', 'err'); return; }
      st().reasons.push(patch);
      commit('Lý do', 'Thêm ' + patch.code + '.');
    }
  }

  /* ============================ Lịch làm việc ============================ */

  var DOW = [['1', 'Thứ Hai'], ['2', 'Thứ Ba'], ['3', 'Thứ Tư'], ['4', 'Thứ Năm'], ['5', 'Thứ Sáu'], ['6', 'Thứ Bảy'], ['0', 'Chủ Nhật']];

  function calendar() {
    var c = st().calendar;
    var sample = D.dueFrom(U.now(), 'LEGACY_03', st());

    return ui.banner('info', 'Hạn xử lý tính theo giờ làm việc thật',
      'Giao việc lúc 16h thứ Sáu với SLA 4 giờ sẽ đến hạn vào sáng thứ Hai, không phải 20h thứ Sáu.') +

      ui.block({
        title: 'Lịch làm việc', icon: 'calendar',
        body: ui.pad(
          '<form data-form="calendar">' +
          ui.sectionTitle('Ngày làm việc') +
          '<div class="f-stack">' + DOW.map(function (d) {
            return ui.checkbox('dow_' + d[0], c.days.indexOf(Number(d[0])) !== -1, d[1]);
          }).join('') + '</div>' +

          '<div style="margin-top:1.125rem">' + ui.sectionTitle('Giờ làm việc') +
          '<div class="f-row">' +
          ui.field('Bắt đầu', ui.input('open', c.open, { type: 'time', required: true })) +
          ui.field('Kết thúc', ui.input('close', c.close, { type: 'time', required: true })) +
          ui.field('Nghỉ trưa từ', ui.input('breakFrom', c.breakFrom, { type: 'time' })) +
          ui.field('Nghỉ trưa đến', ui.input('breakTo', c.breakTo, { type: 'time' })) +
          '</div></div>' +

          '<div style="margin-top:1.125rem">' +
          ui.field('Ngày nghỉ lễ', ui.textarea('holidays', c.holidays.join('\n'), { placeholder: 'mỗi dòng một ngày dạng 2026-09-02' })) +
          '</div>' +

          ui.banner('ok', 'Thử tính ngay',
            'Giao một việc "Soạn hồ sơ vay mới" (SLA 8 giờ) lúc này thì hạn rơi vào ' + U.fmtDT(sample) + '.') +

          '<div class="form-end">' + ui.btn('Lưu lịch', { type: 'submit', kind: 'primary' }) + '</div>' +
          '</form>'
        )
      });
  }

  function saveCalendar(form) {
    var d = new FormData(form);
    var c = st().calendar;
    c.days = DOW.map(function (x) { return Number(x[0]); }).filter(function (n) { return d.get('dow_' + n) !== null; });
    if (!c.days.length) { ui.toast('Chọn ít nhất một ngày làm việc.', 'err'); return; }
    c.open = String(d.get('open'));
    c.close = String(d.get('close'));
    c.breakFrom = String(d.get('breakFrom') || '');
    c.breakTo = String(d.get('breakTo') || '');
    c.holidays = String(d.get('holidays') || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);

    if (U.isGas()) {
      LS.api.saveSettings({
        work_days: c.days.join(','), work_open: c.open, work_close: c.close,
        work_break: c.breakFrom + '-' + c.breakTo, holidays: c.holidays.join(',')
      }).then(function () { return LS.app.refreshServer('Đã lưu lịch làm việc.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu lịch làm việc.', 'err'); });
      return;
    }

    logCfg('Lịch làm việc', 'Cập nhật ngày làm việc, giờ làm và ' + c.holidays.length + ' ngày nghỉ.');
    U.save();
    LS.app.render();
    ui.toast('Đã lưu lịch làm việc.');
  }

  /* ============================ Cấu hình chung ============================ */

  function settings() {
    var s = st().settings;
    return ui.block({
      title: 'Cấu hình chung', icon: 'sliders',
      body: ui.pad(
        '<form data-form="settings">' +
        ui.sectionTitle('Thông tin tổ chức') +
        '<div class="f-row">' +
        ui.field('Tên ngân hàng', ui.input('bank_name', s.bank_name, { required: true }), 'dùng trong mẫu tin gửi khách') +
        ui.field('Số tổng đài', ui.input('hotline', s.hotline)) +
        ui.field('Nơi ký hồ sơ', ui.input('sign_place', s.sign_place || ''),
          'dùng chung cho mọi đơn vị; cán bộ LS không chọn lại khi hẹn ký') +
        ui.field('Địa chỉ ứng dụng', ui.input('app_url', s.app_url), 'link cán bộ mở từ thông báo') +
        '</div>' +

        '<div style="margin-top:1.125rem">' + ui.sectionTitle('Thời gian và báo cáo') +
        '<div class="f-row">' +
        ui.field('Múi giờ', ui.input('timezone', s.timezone)) +
        ui.field('Đầu tuần báo cáo', ui.select('week_start', [['MONDAY', 'Thứ Hai'], ['SUNDAY', 'Chủ Nhật']], s.week_start)) +
        ui.field('Thời hạn lưu (tháng)', ui.input('retention_months', s.retention_months, { type: 'number', min: 1 })) +
        ui.field('Giới hạn dòng khi xuất', ui.input('export_row_limit', s.export_row_limit, { type: 'number', min: 100 })) +
        '</div></div>' +

        '<div style="margin-top:1.125rem">' + ui.sectionTitle('Vận hành') +
        '<div class="f-row">' +
        ui.field('Ngưỡng cảnh báo hàng đợi', ui.input('backlog_alert', s.backlog_alert, { type: 'number', min: 1 }),
          'vượt ngưỡng thì hiện cảnh báo ở màn tổng quan') +
        ui.field('Môi trường', ui.select('env', [['THU_NGHIEM', 'Thử nghiệm'], ['THAT', 'Chạy thật']], s.env)) +
        '</div>' +

        '<div style="margin-top:1.125rem">' + ui.sectionTitle('Gateway gửi tin ngoài') +
        '<div class="f-row">' +
        ui.field('Địa chỉ gateway', ui.input('gateway_url', s.gateway_url || '', { placeholder: 'https://gateway-noi-bo.example/send' }), 'Chỉ lưu địa chỉ, không lưu token') +
        ui.field('Tên thuộc tính token', ui.input('gateway_auth_ref', s.gateway_auth_ref || 'LS_GATEWAY_TOKEN'), 'Token đặt trong ScriptProperties của GAS') +
        '</div></div>' +
        ui.banner('warn', 'Chuyển sang chạy thật là quyết định vận hành',
          'Chỉ chuyển sau khi đã nghiệm thu nội bộ, kênh gửi đã kiểm thử và có phương án xử lý sự cố.') +
        '</div>' +

        '<div class="form-end">' + ui.btn('Lưu cấu hình', { type: 'submit', kind: 'primary' }) + '</div>' +
        '</form>'
      )
    });
  }

  function saveSettings(form) {
    var d = new FormData(form);
    var s = st().settings;
    var before = s.env;
    ['bank_name', 'hotline', 'sign_place', 'app_url', 'timezone', 'week_start', 'env', 'gateway_url', 'gateway_auth_ref'].forEach(function (k) {
      s[k] = String(d.get(k) || '').trim();
    });
    ['retention_months', 'export_row_limit', 'backlog_alert'].forEach(function (k) {
      s[k] = Number(d.get(k) || 0);
    });

    if (U.isGas()) {
      LS.api.saveSettings(s).then(function () { return LS.app.refreshServer('Đã lưu cấu hình.'); })
        .catch(function (error) { ui.toast(error.message || 'Không thể lưu cấu hình.', 'err'); });
      return;
    }

    logCfg('Cấu hình chung', before !== s.env
      ? 'Đổi môi trường từ ' + before + ' sang ' + s.env + '.'
      : 'Cập nhật cấu hình tổ chức và báo cáo.');
    U.save();
    LS.app.render();
    ui.toast('Đã lưu cấu hình.');
  }

  /* ============================ Dữ liệu ============================ */

  function data() {
    var s = st();
    return ui.block({
      title: U.isGas() ? 'Kho dữ liệu Google Sheet' : 'Kho dữ liệu cục bộ', icon: 'database',
      note: U.isGas() ? 'Dữ liệu nghiệp vụ đọc/ghi qua Apps Script vào kho Google Sheet đã cấu hình; cache trình duyệt không phải nguồn chính.' : 'Bản chạy thử lưu trong trình duyệt. Khi triển khai Apps Script, dữ liệu nằm ở Google Sheet do SetupSheetDB.gs tạo.',
      body: ui.pad(
        ui.kv([
          ['Hồ sơ', String(s.requests.length)],
          ['Việc', String(s.items.length)],
          ['Sự kiện', String(s.events.length)],
          ['Tin trong hàng đợi', String(s.outbox.length)],
          ['Người dùng', String(s.users.length)],
          ['Nhật ký cấu hình', String(s.configLog.length)]
        ]) +
        '<div class="form-end">' +
        ui.btn('Xuất toàn bộ JSON', { act: 'export-json', icon: 'download' }) +
        ui.btn('Khôi phục dữ liệu mẫu', { act: 'reset-data', kind: 'danger', icon: 'refresh' }) +
        '</div>'
      )
    });
  }

  function cfglog() {
    return ui.block({
      title: 'Nhật ký cấu hình', count: st().configLog.length, icon: 'history',
      note: 'Mọi thay đổi kênh, mẫu tin, danh mục và cấu hình đều được ghi lại.',
      body: ui.table(
        [{ label: 'Thời gian', cls: 'fit' }, { label: 'Người thực hiện' }, { label: 'Khu vực', cls: 'fit' }, { label: 'Nội dung' }],
        st().configLog.map(function (c) {
          return {
            cells: [
              '<span class="tid">' + U.fmtDT(c.at) + '</span>',
              '<div class="t2">' + U.esc(userName(c.by)) + '</div>',
              ui.tag(c.area, 'neutral'),
              '<div class="t2">' + U.esc(c.detail) + '</div>'
            ]
          };
        }),
        { icon: 'history', title: 'Chưa có thay đổi cấu hình nào', text: '' }
      )
    });
  }

  /* ============================ Xuất ra ngoài ============================ */

  return {
    view: view, setSection: setSection,
    channelDialog: channelDialog, saveChannel: saveChannel, toggleChannel: toggleChannel, testChannel: testChannel,
    templateDialog: templateDialog, saveTemplate: saveTemplate, approveTemplate: approveTemplate, insertVar: insertVar,
    ruleDialog: ruleDialog, saveRule: saveRule, toggleRule: toggleRule,
    runQueue: runQueue, retry: retry, retryAll: retryAll, cancel: cancel,
    confirmSend: confirmSend, doConfirmSend: doConfirmSend,
    setOutFilter: function (k, v) { oFilter[k] = v; },
    typeDialog: typeDialog, saveType: saveType,
    unitDialog: unitDialog, saveUnit: saveUnit,
    userDialog: userDialog, saveUser: saveUser, userImportDialog: userImportDialog, importUsers: importUsers,
    reasonDialog: reasonDialog, saveReason: saveReason,
    catalogOptionDialog: catalogOptionDialog, saveCatalogOption: saveCatalogOption,
    assignmentRuleDialog: assignmentRuleDialog, saveAssignmentRule: saveAssignmentRule,
    saveCalendar: saveCalendar, saveSettings: saveSettings,
    logCfg: logCfg
  };
})();
