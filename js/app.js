/**
 * app.js — khung ứng dụng: đăng nhập, điều hướng, phân phối sự kiện.
 */
LS.app = (function () {
  'use strict';

  var U = LS, D = LS.domain, ui = LS.ui, S = LS.screens, A = LS.admin;
  var root;
  var gasError = '';

  function st() { return U.db(); }
  function me() { return st().session ? U.byId(st().users, 'user_id', st().session) : null; }

  /* ============================ Dựng khung ============================ */

  function render() {
    var u = me();
    if (!u) { root.innerHTML = authView(); return; }
    // Mật khẩu tạm phải đổi trước khi vào. Máy chủ cũng chặn mọi thao tác ghi,
    // nên không có đường nào lách qua màn này.
    if (st().mustChangePassword) { root.innerHTML = passwordView(u); return; }

    var nav = D.ROLES[u.role].nav;
    if (nav.indexOf(current) === -1) current = nav[0];
    var unread = st().inbox.filter(function (n) { return n.user_id === u.user_id && !n.read; }).length;

    root.innerHTML =
      '<div class="shell">' +
      rail(u, nav) +
      '<div class="workspace">' +
      '<header class="appbar">' +
      '<div class="appbar-summary">' + S.headerSummary(current) + '</div>' +
      '<div class="appbar-actions">' +
      (st().activePlan ? ui.tag(st().activePlan.name || st().activePlan.month_key, 'info') : '') +
      (st().settings.env === 'THU_NGHIEM' ? ui.tag('Môi trường thử nghiệm', 'gold') : '') +
      '<button class="btn btn-quiet btn-icon" data-act="inbox" aria-label="Thông báo" style="position:relative">' +
      U.icon('bell', 18) + (unread ? '<span class="rail-badge" style="top:-2px;right:-2px">' + unread + '</span>' : '') +
      '</button>' +
      '</div></header>' +
      '<main class="view">' + body() + '</main>' +
      '</div></div>' +
      tabbar(u, nav);
  }

  function rail(u, nav) {
    return '<aside class="rail">' +
      '<div class="rail-mark">LS</div>' +
      nav.map(function (id) {
        var s = D.SCREENS[id];
        var n = badge(id);
        return '<button class="rail-btn" data-act="go" data-screen="' + id + '"' +
          (id === current ? ' aria-current="page"' : '') + '>' +
          U.icon(s.icon, 20) + '<span>' + U.esc(s.short) + '</span>' +
          (n ? '<span class="rail-badge">' + n + '</span>' : '') + '</button>';
      }).join('') +
      '<div class="rail-foot">' +
      '<button class="rail-avatar" data-act="account" aria-label="Tài khoản ' + U.attr(u.full_name) + '">' +
      U.esc(U.initials(u.full_name)) + '</button>' +
      '<button class="rail-btn" data-act="logout" style="padding:.35rem"><span>Thoát</span></button>' +
      '</div></aside>';
  }

  function tabbar(u, nav) {
    return '<nav class="tabbar">' + nav.map(function (id) {
      var s = D.SCREENS[id];
      var n = badge(id);
      return '<button data-act="go" data-screen="' + id + '"' + (id === current ? ' aria-current="page"' : '') + '>' +
        U.icon(s.icon, 19) + '<span>' + U.esc(s.short) + '</span>' +
        (n ? '<span class="rail-badge">' + n + '</span>' : '') + '</button>';
    }).join('') +
      '<button class="tabbar-account" data-act="account" aria-label="Tài khoản ' + U.attr(u.full_name) + '">' +
      '<span class="tabbar-avatar" aria-hidden="true">' + U.esc(U.initials(u.full_name)) + '</span>' +
      '<span>Tài khoản</span></button></nav>';
  }

  /** Số việc đang chờ chính người dùng này xử lý. */
  function badge(screen) {
    var items = S.visibleItems();
    if (screen === 'queue') {
      return items.filter(function (i) {
        return ['CHO_TIEP_NHAN', 'CHO_PHAN_CONG', 'CHO_KS_DUYET'].indexOf(i.status) !== -1 || i.pending;
      }).length;
    }
    if (screen === 'mine') {
      return items.filter(function (i) { return ['DA_PHAN_CONG', 'DANG_THUC_HIEN'].indexOf(i.status) !== -1; }).length;
    }
    if (screen === 'work') return items.filter(function (i) { return i.status === 'CAN_BO_SUNG'; }).length;
    if (screen === 'admin') {
      var h = D.outboxHealth(st());
      return h.failed + h.waiting;
    }
    return 0;
  }

  var current = null;

  function body() {
    switch (current) {
      case 'work': return S.work();
      case 'room': return S.room();
      case 'room-board': return S.roomBoard();
      case 'queue': return S.queue();
      case 'mine': return S.mine();
      case 'board': return S.board();
      case 'periods': return S.periods();
      case 'audit': return S.audit();
      case 'admin': return A.view();
      default: return '';
    }
  }

  /* ============================ Đăng nhập ============================ */

  function authView() {
    var gasNote = U.isGas()
      ? 'Phòng/PGD dùng mã cán bộ. LS, kiểm soát và quản trị dùng mã cán bộ kèm mật khẩu.'
      : 'Bản xem thử trên trình duyệt dùng cùng quy tắc mã cán bộ như bản GAS.';
    return '<div class="auth">' +
      '<div class="auth-side">' +
      '<div><div class="rail-mark" style="width:44px;height:44px">LS</div></div>' +
      '<div>' +
      '<h2 class="auth-lead">Một hồ sơ đi qua <em>đúng một luồng</em>, có dấu vết từ đầu đến cuối.</h2>' +
      '<div class="auth-steps">' +
      '<div class="auth-step"><b>1</b><span>Phòng hoặc PGD đăng ký một khách với nhiều loại việc, mỗi việc một ngày phát sinh riêng.</span></div>' +
      '<div class="auth-step"><b>2</b><span>Kiểm soát LS tiếp nhận, kiểm tra đủ thông tin rồi giao cho cán bộ chịu trách nhiệm chính.</span></div>' +
      '<div class="auth-step"><b>3</b><span>Cán bộ xử lý theo danh sách việc phải làm, hẹn khách khi loại việc yêu cầu.</span></div>' +
      '<div class="auth-step"><b>4</b><span>Mọi thao tác, mọi tin gửi ra ngoài đều vào nhật ký, không sửa được về sau.</span></div>' +
      '</div></div>' +
      '<p class="auth-note">' + U.esc(gasNote) + '</p>' +
      '</div>' +

      '<div class="auth-main"><div class="auth-form">' +
      '<h1>Đăng nhập</h1><p>Hỗ trợ tín dụng LS</p>' +
      '<form data-form="login">' +
      ui.field('Mã cán bộ / user', ui.input('login_code', '', { required: true, placeholder: 'Ví dụ: 164392 hoặc admin', id: 'loginCode' })) +
      ui.field('Mật khẩu', ui.input('password', '', { type: 'password', placeholder: 'Chỉ bắt buộc với tài khoản nội bộ', id: 'loginPassword' })) +
      '<div style="margin-top:1rem">' + ui.btn('Đăng nhập', { type: 'submit', kind: 'primary', icon: 'arrow' }) + '</div>' +
      '</form>' +
      (U.isGas() ? '' : '<div class="auth-divider">Tài khoản thử nghiệm</div>' +
      '<div class="acct-list">' + st().users.filter(function (u) { return u.active; }).map(function (u) {
        return '<button type="button" class="acct" data-act="login-as" data-code="' + U.attr(u.login_code || u.user_id) + '">' +
          '<span class="rail-avatar" style="background:var(--brand-50);color:var(--brand-800)">' + U.esc(U.initials(u.full_name)) + '</span>' +
          '<span style="min-width:0"><span class="acct-name">' + U.esc(u.full_name) + '</span><br>' +
          '<span class="acct-role">' + U.esc(D.ROLES[u.role].label) + ' · ' + U.esc(u.login_code || u.user_id) + '</span></span>' +
          U.icon('right', 16) + '</button>';
      }).join('') + '</div>') +
      '</div></div></div>';
  }

  function passwordView(u) {
    return '<div class="auth"><div class="auth-side">' +
      '<div><div class="rail-mark" style="width:44px;height:44px">LS</div></div>' +
      '<div><h2 class="auth-lead">Mật khẩu tạm chỉ dùng được <em>một lần</em>.</h2>' +
      '<p class="auth-note">Mật khẩu do quản trị cấp không gắn với riêng ai. Đặt mật khẩu của bạn trước khi vào hệ thống.</p>' +
      '</div></div>' +
      '<div class="auth-main"><div class="auth-form">' +
      '<h1>Đổi mật khẩu</h1><p>' + U.esc(u.full_name) + '</p>' +
      '<form data-form="change-password">' +
      ui.field('Mật khẩu hiện tại', ui.input('current', '', { type: 'password', required: true })) +
      ui.field('Mật khẩu mới', ui.input('next', '', { type: 'password', required: true }), 'tối thiểu 8 ký tự, có cả chữ và số') +
      ui.field('Nhập lại mật khẩu mới', ui.input('again', '', { type: 'password', required: true })) +
      '<div style="margin-top:1rem">' + ui.btn('Đặt mật khẩu', { type: 'submit', kind: 'primary', icon: 'arrow' }) + '</div>' +
      '</form>' +
      '<div style="margin-top:1rem">' + ui.btn('Đăng xuất', { act: 'logout', kind: 'quiet', icon: 'logout' }) + '</div>' +
      '</div></div></div>';
  }

  function changePassword(form) {
    var d = new FormData(form);
    var next = String(d.get('next') || '');
    if (next !== String(d.get('again') || '')) { ui.toast('Hai lần nhập mật khẩu mới chưa khớp.', 'err'); return; }
    if (next.length < 8 || !/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) {
      ui.toast('Mật khẩu mới phải từ 8 ký tự và có cả chữ lẫn số.', 'err');
      return;
    }
    if (!U.isGas()) {
      st().mustChangePassword = false;
      U.save();
      render();
      ui.toast('Bản trình duyệt không lưu mật khẩu; đã bỏ qua.');
      return;
    }
    LS.api.changePassword(String(d.get('current') || ''), next).then(function () {
      return refreshServer('Đã đổi mật khẩu.');
    }).catch(function (error) { ui.toast(error.message || 'Không đổi được mật khẩu.', 'err'); });
  }

  function login(code, password) {
    var loginCode = String(code || '').trim();
    if (!loginCode) { ui.toast('Nhập mã cán bộ hoặc user admin.', 'err'); return; }
    if (U.isGas()) {
      LS.api.authenticate(loginCode, password || '').then(function (snapshot) {
        U.replace(snapshot); current = null; S.resetFilters(); render();
        ui.toast('Xin chào ' + (me() ? me().full_name : '') + '.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể đăng nhập.', 'err'); });
      return;
    }
    var u = st().users.filter(function (x) { return String(x.login_code || x.user_id).toLowerCase() === loginCode.toLowerCase(); })[0];
    if (!u) { ui.toast('Mã cán bộ chưa được cấp quyền vào hệ thống.', 'err'); return; }
    if (!u.active) { ui.toast('Tài khoản đang bị khóa.', 'err'); return; }
    if (String(u.auth_group || (u.role === 'PHONG_PGD' ? 'EXTERNAL' : 'INTERNAL')).toUpperCase() === 'INTERNAL') {
      var expected = u.role === 'ADMIN' ? 'D@kl@k631' : 'D@klak631';
      if (String(password || '') !== expected) { ui.toast('Mật khẩu không đúng.', 'err'); return; }
    }

    st().session = u.user_id;
    current = null;
    S.resetFilters();
    U.save();
    S.sweepOverdue();
    render();
    ui.toast('Xin chào ' + u.full_name + '.');
  }

  function logout() {
    ui.closeDialog();
    if (U.isGas() && LS.api.logout) LS.api.logout().catch(function () {});
    st().session = null;
    current = null;
    S.resetFilters();
    U.save();
    render();
  }

  /* ============================ Hộp thoại phụ ============================ */

  function accountDialog() {
    var u = me();
    ui.openDialog('Tài khoản',
      ui.kv([
        ['Họ tên', u.full_name], ['Email', u.email],
        ['Vai trò', D.ROLES[u.role].label], ['Đơn vị', S.unitName(u.unit_id)]
      ]) +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Phạm vi dữ liệu') +
      '<p class="t2">' + U.esc(scopeText(u.role)) + '</p></div>' +
      '<div class="form-end">' +
      ui.btn('Đóng', { act: 'close-dialog', kind: 'quiet' }) +
      ui.btn('Đăng xuất', { act: 'logout', kind: 'danger', icon: 'logout' }) +
      '</div>');
  }

  function scopeText(role) {
    if (role === 'PHONG_PGD') return 'Bạn xem được việc của đơn vị mình. Sửa hồ sơ sau khi LS đã nhận sẽ thành đề nghị chờ kiểm soát duyệt.';
    if (role === 'CAN_BO_LS') return 'Bạn chỉ xem được việc đang được giao cho mình, không xem việc của đồng nghiệp.';
    if (role === 'ADMIN') return 'Bạn quản trị cấu hình và danh mục. Vai trò này không được xem thông tin khách hàng.';
    return 'Bạn xem được toàn bộ việc của ban LS.';
  }

  function inboxDialog() {
    var u = me();
    var list = st().inbox
      .filter(function (n) { return n.user_id === u.user_id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); })
      .slice(0, 30);
    var unread = list.filter(function (n) { return !n.read; }).length;

    ui.openDialog('Thông báo',
      (list.length
        ? '<div class="tl">' + list.map(function (n) {
          var item = U.byId(st().items, 'item_id', n.item_id);
          return '<div class="tl-item"><div class="tl-head">' +
            '<b>' + U.esc(D.NOTIFY_EVENTS[n.event] || D.label(n.event)) + '</b>' +
            (n.read ? '' : ui.tag('Mới', 'gold')) +
            '<time>' + U.fmtDT(n.at) + '</time></div>' +
            '<div class="tl-body">' +
            (item
              ? '<button class="btn btn-quiet btn-sm" data-act="detail" data-id="' + U.attr(n.item_id) + '">' +
                U.esc(S.itemLabel(item)) + '</button>'
              : '<span class="t2">Việc ' + U.esc(n.item_id) + ' không còn trong phạm vi bạn xem được.</span>') +
            '</div></div>';
        }).join('') + '</div>'
        : ui.empty({ icon: 'bell', title: 'Không có thông báo', text: 'Thông báo giao việc và nhắc hạn sẽ hiện ở đây.' })) +
      '<div class="form-end">' + ui.btn('Đóng', { act: 'close-dialog', kind: 'quiet' }) + '</div>',
      { sub: unread ? unread + ' thông báo mới' : '' });

    if (!unread) return;
    st().inbox.forEach(function (n) { if (n.user_id === u.user_id) n.read = true; });

    // Đánh dấu đã đọc phải ghi xuống kho, nếu không lần tải sau chuông lại đỏ.
    if (U.isGas()) LS.app.background(LS.api.markInboxRead(), { label: 'Đánh dấu đã đọc' });
    else U.save();
  }

  /* ============================ Tiện ích ============================ */

  function download(name, content, mime) {
    var blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /** Ẩn/hiện trường cấu hình phụ thuộc lựa chọn khác trong cùng hộp thoại. */
  function applyConds() {
    var dlg = document.getElementById('dialog');
    if (!dlg) return;
    var conds = {};
    dlg.querySelectorAll('[data-cond]').forEach(function (s) { conds[s.getAttribute('data-cond')] = s.value; });
    dlg.querySelectorAll('[data-when]').forEach(function (n) {
      var p = n.getAttribute('data-when').split('=');
      n.style.display = conds[p[0]] === p[1] ? '' : 'none';
    });
  }

  /* ============================ Sự kiện ============================ */

  var CLICK = {
    go: function (el) { current = el.getAttribute('data-screen'); render(); window.scrollTo(0, 0); },
    'close-dialog': ui.closeDialog,
    logout: logout,
    account: accountDialog,
    inbox: inboxDialog,
    'login-as': function (el) { login(el.getAttribute('data-code'), ''); },

    'new-request': S.newRequest,
    detail: function (el) { S.detail(el.getAttribute('data-id')); },
    'edit-item': function (el) { S.editItem(el.getAttribute('data-id')); },
    flow: function (el) { S.flow(el.getAttribute('data-id'), el.getAttribute('data-to')); },
    'quick-assign': function (el) { S.quickAssign(el.getAttribute('data-id')); },
    'open-filter': function (el) { S.openFilter(el.getAttribute('data-screen') || current); },
    'reset-filter': function (el) { S.resetFilter(el.getAttribute('data-screen') || current); },
    'apply-filter': function (el) { S.applyFilter(el.getAttribute('data-screen') || current); },
    'apply-report': S.applyReportFilter,
    'room-backlog': function () { S.roomShowBacklog(); },
    'board-tab': function (el) { S.setFilter('board', 'tab', el.getAttribute('data-tab') || 'report'); render(); },
    'sort-column': function (el) { S.toggleSort(el.getAttribute('data-screen') || current, el.getAttribute('data-sort') || 'date'); render(); },
    'queue-tab': function (el) { S.setFilter('queue', 'tab', el.getAttribute('data-tab')); S.setFilter('queue', 'page', 1); render(); },
    'queue-page': function (el) { if (!el.disabled) { S.setFilter('queue', 'page', Number(el.getAttribute('data-page')) || 1); render(); } },
    revision: function (el) { S.revision(el.getAttribute('data-id'), el.getAttribute('data-ok') === '1'); },
    'add-row': function () {
      var box = document.getElementById('rows');
      box.insertAdjacentHTML('beforeend', S.rowForm(box.children.length));
    },
    'del-row': function (el) {
      var box = document.getElementById('rows');
      if (box.children.length <= 1) { ui.toast('Cần ít nhất một dòng việc.', 'warn'); return; }
      el.closest('.row-item').remove();
    },
    'export-csv': S.exportCsv,
    'download-daily-image': S.downloadDailyImage,
    'create-next-monthly-plan': function () {
      ui.confirm({ title: 'Tạo kế hoạch tháng kế tiếp', heading: 'Tạo Sheet liên kết cho tháng sau?',
        text: 'Hệ thống sẽ tạo Google Sheet kế hoạch mới, chuyển tiếp việc đang mở và chỉ tự kích hoạt vào ngày đầu tháng kế tiếp.',
        ok: 'Tạo kế hoạch', run: function () { LS.api.createNextMonthlyPlan().then(function () { return refreshServer('Đã tạo kế hoạch tháng kế tiếp.'); }).catch(function (e) { ui.toast(e.message || 'Không thể tạo kế hoạch tháng.', 'err'); }); } });
    },

    'admin-go': function (el) { A.setSection(el.getAttribute('data-section')); render(); window.scrollTo(0, 0); },
    'chan-edit': function (el) { A.channelDialog(el.getAttribute('data-code')); },
    'chan-test': function (el) { A.testChannel(el.getAttribute('data-code')); },
    'tpl-edit': function (el) { A.templateDialog(el.getAttribute('data-code')); },
    'tpl-approve': function (el) { A.approveTemplate(el.getAttribute('data-code'), el.getAttribute('data-ok') === '1'); },
    'tpl-var': function (el) { A.insertVar(el.getAttribute('data-var')); },
    'rule-edit': function (el) { A.ruleDialog(el.getAttribute('data-id')); },
    'out-run': A.runQueue,
    'out-retry': function (el) { A.retry(el.getAttribute('data-id')); },
    'out-retry-all': A.retryAll,
    'out-cancel': function (el) { A.cancel(el.getAttribute('data-id')); },
    'out-confirm': function (el) { A.confirmSend(el.getAttribute('data-id')); },
    'type-edit': function (el) { A.typeDialog(el.getAttribute('data-code')); },
    'unit-edit': function (el) { A.unitDialog(el.getAttribute('data-id')); },
    'user-edit': function (el) { A.userDialog(el.getAttribute('data-id')); },
    'user-import': A.userImportDialog,
    'reason-edit': function (el) { A.reasonDialog(el.getAttribute('data-code')); },
    'catalog-option-edit': function (el) { A.catalogOptionDialog(el.getAttribute('data-id')); },
    'assignment-rule-edit': function (el) { A.assignmentRuleDialog(el.getAttribute('data-id')); },

    'export-json': function () {
      download('ls_routing_' + U.localDate() + '.json', JSON.stringify(st(), null, 2), 'application/json');
    },
    'reset-data': function () {
      if (U.isGas()) { ui.toast('Kho GAS là dữ liệu nghiệp vụ chính; không thể khôi phục dữ liệu mẫu từ trình duyệt.', 'warn'); return; }
      ui.confirm({
        title: 'Khôi phục dữ liệu mẫu',
        heading: 'Toàn bộ dữ liệu hiện tại sẽ bị xóa',
        text: 'Hồ sơ, việc, nhật ký, hàng đợi gửi và mọi cấu hình đã sửa sẽ quay về bản mẫu. Không khôi phục lại được.',
        ok: 'Xóa và khôi phục', danger: true,
        run: function () {
          U.reset(D.seed);
          render();
          ui.toast('Đã khôi phục dữ liệu mẫu.');
        }
      });
    }
  };

  function onClick(ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) {
      if (ev.target.id === 'scrim') ui.closeDialog();
      return;
    }
    if (el.tagName === 'INPUT') return; // công tắc xử lý ở sự kiện change
    var fn = CLICK[el.getAttribute('data-act')];
    if (fn) { ev.preventDefault(); fn(el); }
  }

  var FORMS = {
    login: function (form) { var d = new FormData(form); login(d.get('login_code'), d.get('password')); },
    confirm: ui.runConfirm,
    'change-password': changePassword,
    'new-request': S.submitNewRequest,
    'edit-item': S.submitEdit,
    flow: S.submitFlow,
    channel: A.saveChannel,
    template: A.saveTemplate,
    rule: A.saveRule,
    'out-confirm': A.doConfirmSend,
    'work-type': A.saveType,
    unit: A.saveUnit,
    user: A.saveUser,
    'user-import': A.importUsers,
    reason: A.saveReason,
    'catalog-option': A.saveCatalogOption,
    'assignment-rule': A.saveAssignmentRule,
    calendar: A.saveCalendar,
    settings: A.saveSettings
  };

  function onSubmit(ev) {
    var form = ev.target.closest('[data-form]');
    if (!form) return;
    ev.preventDefault();
    var fn = FORMS[form.getAttribute('data-form')];
    if (fn) fn(form);
  }

  var typeTimer = null;

  /** Lọc gõ tới đâu lọc tới đó, giữ nguyên con trỏ sau khi vẽ lại. */
  function onFilter(ev) {
    var el = ev.target.closest('[data-filter], [data-draft-filter], [data-ofilter]');
    if (!el) return;

    if (el.hasAttribute('data-ofilter')) {
      A.setOutFilter(el.getAttribute('data-ofilter'), el.value);
    } else {
      var filterScreen = el.getAttribute('data-filter-screen') || current;
      if (el.hasAttribute('data-draft-filter')) {
        S.setDraftFilter(filterScreen, el.getAttribute('data-draft-filter'), el.value);
        return;
      }
      var filterKey = el.getAttribute('data-filter');
      S.setFilter(filterScreen, filterKey, el.value);
      if (filterKey === 'q') S.setFilter(filterScreen, 'page', 1);
      if (filterKey === 'sort') S.setFilter(filterScreen, 'sortDir', '');
    }

    var id = el.id, pos = el.selectionStart;
    var isText = el.tagName === 'INPUT' && (!el.type || el.type === 'text' || el.type === 'search');

    // Ô chữ: chờ người gõ dừng tay rồi mới vẽ lại. Vẽ lại sau từng phím
    // làm danh sách dài giật và nuốt ký tự.
    var run = function () {
      render();
      if (!id) return;
      var again = document.getElementById(id);
      if (!again) return;
      again.focus();
      if (isText && again.setSelectionRange) again.setSelectionRange(pos, pos);
    };

    if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
    if (isText) typeTimer = setTimeout(function () { typeTimer = null; run(); }, 160);
    else run();
  }

  function onChange(ev) {
    var t = ev.target;

    if (t.getAttribute('data-role') === 'work-type-group') {
      S.syncProductOptions(t);
      return;
    }

    if (t.hasAttribute('data-cond')) { applyConds(); return; }

    var act = t.closest('[data-act]');
    if (act && t.tagName === 'INPUT') {
      var a = act.getAttribute('data-act');
      if (a === 'chan-toggle') { A.toggleChannel(act.getAttribute('data-code')); return; }
      if (a === 'rule-toggle') { A.toggleRule(act.getAttribute('data-id')); return; }
    }

    onFilter(ev);
  }

  function onKey(ev) {
    if (ev.key === 'Escape' && ui.dialogOpen()) { ui.closeDialog(); return; }
    ui.trapTab(ev);
  }

  /* ============================ Khởi động ============================ */

  function init() {
    root = document.getElementById('root');
    ui.bind();
    U.load(D.seed);

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onFilter);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);

    if (LS.api && LS.api.available()) {
      U.setBackend('GAS');
      // Luôn hiển thị màn mã cán bộ để không phụ thuộc email Google của người mở webapp.
      // Sau khi authenticateUser() thành công, toàn bộ bootstrap vẫn chạy phía GAS.
      root.innerHTML = authView();
      return;
    }

    if (st().session) S.sweepOverdue();
    render();
  }

  /**
   * Tải lại toàn bộ ảnh chụp dữ liệu từ máy chủ.
   * Giữ nguyên bộ lọc, sắp xếp và trang đang xem — xóa chúng sau mỗi lần lưu
   * làm người dùng mất chỗ đang đứng.
   */
  function refreshServer(message, silent) {
    if (!U.isGas()) return Promise.resolve();
    return LS.api.bootstrap().then(function (snapshot) {
      U.replace(snapshot);
      if (!ui.dialogOpen()) render();
      if (message) ui.toast(message, 'ok');
    }).catch(function (error) {
      if (!silent) ui.toast(error && error.message ? error.message : 'Không thể tải lại dữ liệu.', 'err');
      throw error;
    });
  }

  /* --- Ghi nền: báo xong ngay, đồng bộ lại sau --- */

  var syncing = 0;
  var refreshTimer = null;

  function setSyncFlag(on) {
    syncing = Math.max(0, syncing + (on ? 1 : -1));
    document.body.classList.toggle('is-syncing', syncing > 0);
  }

  /**
   * Hẹn một lần tải lại sau khi các lệnh ghi lắng xuống.
   * Một lần duy nhất, hủy và đặt lại nếu có lệnh ghi mới — không phải vòng lặp,
   * không có bộ đếm chạy ngầm khi màn hình đứng yên.
   */
  var refreshTries = 0;

  function scheduleRefresh(delay) {
    if (!U.isGas()) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTries = 0;
    refreshTimer = setTimeout(runScheduledRefresh, delay || 4000);
  }

  function runScheduledRefresh() {
    refreshTimer = null;
    // Đang mở hộp thoại hoặc còn lệnh ghi thì lùi lại, nhưng chỉ lùi vài nhịp.
    // Lùi vô hạn sẽ thành một vòng hẹn giờ chạy mãi mà không ai gọi.
    if ((syncing > 0 || ui.dialogOpen()) && refreshTries < 6) {
      refreshTries += 1;
      refreshTimer = setTimeout(runScheduledRefresh, 1500);
      return;
    }
    if (ui.dialogOpen()) return;  // bỏ qua lượt này, lệnh ghi sau sẽ hẹn lại
    refreshServer('', true).catch(function () { /* giữ nguyên màn hình đang xem */ });
  }

  /**
   * Chạy một lệnh ghi ở chế độ nền.
   * Giao diện đã cập nhật trước; hỏng thì hoàn tác và nói rõ vì sao.
   */
  function background(promise, opts) {
    opts = opts || {};
    setSyncFlag(true);
    return promise.then(function (result) {
      setSyncFlag(false);
      if (opts.onOk) opts.onOk(result);
      scheduleRefresh(opts.delay);
      return result;
    }).catch(function (error) {
      setSyncFlag(false);
      if (opts.rollback) opts.rollback();
      render();
      ui.toast((opts.label ? opts.label + ' không lưu được: ' : '') +
        (error && error.message ? error.message : 'Máy chủ không phản hồi.'), 'err');
    });
  }

  return {
    init: init, render: render, download: download, applyConds: applyConds,
    refreshServer: refreshServer, background: background, scheduleRefresh: scheduleRefresh
  };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', LS.app.init);
else LS.app.init();
