/**
 * app.js — khung ứng dụng: đăng nhập, điều hướng, phân phối sự kiện.
 */
LS.app = (function () {
  'use strict';

  var U = LS, D = LS.domain, ui = LS.ui, S = LS.screens, A = LS.admin;
  var root;
  var gasError = '';
  var inboxTab = 'UNREAD';
  var UPDATE_NOTICE_TITLE = 'Có phiên bản GAS mới';
  var activeUpdateNotice = null;
  var updateNoticeMemoryCounts = {};
  var noticeClaimBusy = false;
  var pendingUpdateNotice = null;

  function st() { return U.db(); }
  function me() { return st().session ? U.byId(st().users, 'user_id', st().session) : null; }

  function updateNoticeSeenKey(userId) { return 'ls_update_notice_seen_v1:' + String(userId || ''); }

  function finishUpdateNoticeDisplay() {
    activeUpdateNotice = null;
  }

  function updateNoticeDisplayCount(userId, noticeId) {
    var key = updateNoticeSeenKey(userId), count = Number(updateNoticeMemoryCounts[key + ':' + noticeId]) || 0;
    try {
      var saved = window.localStorage.getItem(key), data;
      if (saved === noticeId) count = Math.max(count, 1);
      else if (saved) {
        data = JSON.parse(saved);
        if (data && data.id === noticeId) count = Math.max(count, Number(data.count) || 0);
      }
    } catch (ignoreStorage) {}
    return count;
  }

  function recordUpdateNoticeDisplay(userId, noticeId, count) {
    var key = updateNoticeSeenKey(userId), next = count + 1;
    updateNoticeMemoryCounts[key + ':' + noticeId] = next;
    try { window.localStorage.setItem(key, JSON.stringify({ id: noticeId, count: next })); } catch (ignoreStorage) {}
    return next;
  }

  function closeDialog() {
    var title = document.getElementById('dlgTitle');
    if (activeUpdateNotice && title && title.textContent === UPDATE_NOTICE_TITLE) finishUpdateNoticeDisplay();
    ui.closeDialog();
  }

  function maybeShowUpdateNotice() {
    var notice = st().updateNotice, user = me();
    if (!notice || !notice.id || !notice.version || !user || st().mustChangePassword || ui.dialogOpen()) return;
    if (activeUpdateNotice && activeUpdateNotice.id === notice.id && activeUpdateNotice.userId === user.user_id) return;
    var displayLimit = Number(notice.display_limit) || 3;
    displayLimit = Math.max(1, Math.min(3, Math.floor(displayLimit)));
    var displayCount = updateNoticeDisplayCount(user.user_id, notice.id);
    if (displayCount >= displayLimit) return;
    if (U.isGas()) {
      if (pendingUpdateNotice && pendingUpdateNotice.id === notice.id && pendingUpdateNotice.userId === user.user_id) {
        displayCount = Math.max(displayCount, pendingUpdateNotice.count - 1);
        pendingUpdateNotice = null;
      } else {
        if (noticeClaimBusy) return;
        noticeClaimBusy = true;
        LS.api.claimUpdateNotice(notice.id).then(function(result) {
          noticeClaimBusy = false;
          if (!me() || me().user_id !== user.user_id || !st().updateNotice || st().updateNotice.id !== notice.id) return;
          if (!result || !result.show) {
            updateNoticeMemoryCounts[updateNoticeSeenKey(user.user_id) + ':' + notice.id] = displayLimit;
            return;
          }
          pendingUpdateNotice = { id:notice.id, userId:user.user_id, count:result.count };
          maybeShowUpdateNotice();
        }).catch(function() { noticeClaimBusy = false; });
        return;
      }
    }
    recordUpdateNoticeDisplay(user.user_id, notice.id, displayCount);
    activeUpdateNotice = { id: notice.id, userId: user.user_id };
    ui.openDialog(UPDATE_NOTICE_TITLE,
      ui.banner('info', 'LS-Routing · ' + notice.version, notice.message || '') +
      '<p style="margin:1rem 0 0;text-align:center;font-size:1rem">Vui lòng ấn <strong>Ctrl + F5</strong> để cập nhật phiên bản mới.</p>' +
      '<div class="form-end">' + ui.btn('Đã hiểu', { act: 'update-notice-dismiss', kind: 'primary' }) + '</div>',
      { sub: 'Thông báo cập nhật phần mềm' });
  }

  /* ============================ Dựng khung ============================ */

  function render() {
    var u = me();
    if (!u) { root.innerHTML = authView(); return; }
    // Mật khẩu tạm phải đổi trước khi vào. Máy chủ cũng chặn mọi thao tác ghi,
    // nên không có đường nào lách qua màn này.
    if (st().mustChangePassword) { root.innerHTML = passwordView(u); return; }

    var nav = D.ROLES[u.role].nav;
    if (nav.indexOf(current) === -1 && current !== 'item-activity') current = nav[0];
    var unread = st().inbox.filter(function (n) { return n.user_id === u.user_id && !n.read; }).length;

    root.innerHTML =
      '<a class="skip-link" href="#main">Bỏ qua tới nội dung</a>' +
      '<div class="shell">' +
      rail(u, nav) +
      '<div class="workspace">' +
      '<header class="appbar">' +
      '<div class="appbar-summary">' + S.headerSummary(current) + '</div>' +
      '<div class="appbar-actions">' +
      (st().activePlan ? ui.tag(st().activePlan.name || st().activePlan.month_key, 'info') : '') +
      (st().settings.env === 'THU_NGHIEM' ? ui.tag('Môi trường thử nghiệm', 'gold') : '') +
      '<button class="btn btn-quiet btn-icon" data-act="shortcuts" aria-label="Phím tắt" title="Phím tắt (?)" aria-keyshortcuts="Shift+?">' + U.icon('keyboard', 18) + '</button>' +
      '<button class="btn btn-quiet btn-icon" data-act="inbox" aria-label="Thông báo" style="position:relative">' +
      U.icon('bell', 18) + (unread ? '<span class="rail-badge" style="top:-2px;right:-2px">' + unread + '</span>' : '') +
      '</button>' +
      '</div></header>' +
      '<main class="view" id="main" tabindex="-1">' + S.focusBar() + body() + '</main>' +
      '</div></div>' +
      tabbar(u, nav);
    maybeShowUpdateNotice();
  }

  function rail(u, nav) {
    return '<aside class="rail">' +
      '<div class="rail-mark">LS</div>' +
      nav.map(function (id, idx) {
        var s = D.screenFor(u.role, id);
        var n = badge(id);
        return '<button class="rail-btn" data-act="go" data-screen="' + id + '"' +
          ' title="' + U.attr(s.title + ' (phím ' + (idx + 1) + ')') + '" aria-keyshortcuts="' + (idx + 1) + '"' +
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
      var s = D.screenFor(u.role, id);
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
      // Đếm đúng tập việc màn Hàng chờ hiển thị được (chờ phân công trong cửa sổ
      // ngày + đề nghị sửa/hủy + chờ KS duyệt), để số badge khớp danh sách.
      return S.queueBadgeCount();
    }
    if (screen === 'mine') {
      return items.filter(function (i) { return ['DA_PHAN_CONG', 'DANG_THUC_HIEN'].indexOf(i.status) !== -1; }).length;
    }
    if (screen === 'work') return items.filter(function (i) { return ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1; }).length;
    if (screen === 'admin') {
      var h = D.outboxHealth(st());
      return h.failed + h.waiting;
    }
    return 0;
  }

  var current = null;
  var activityReturnScreen = null;
  var lastDashboardMinute = -1;

  function refreshDashboardClock(now) {
    if (current !== 'my-dashboard' || !st().session || ui.dialogOpen() || syncing) return false;
    var minute = Math.floor((now || new Date()).getTime() / 60000);
    if (minute === lastDashboardMinute) return false;
    lastDashboardMinute = minute;
    var openGroups = {}, rowId = '', scrollY = window.scrollY || 0;
    Array.prototype.forEach.call(document.querySelectorAll('.personal-backlog-group'), function (group) {
      openGroups[group.getAttribute('data-backlog-type')] = group.open;
    });
    var active = document.activeElement, row = active && active.closest ? active.closest('.personal-backlog-table [data-row]') : null;
    if (row) rowId = row.getAttribute('data-row') || '';
    render();
    Array.prototype.forEach.call(document.querySelectorAll('.personal-backlog-group'), function (group) {
      var type = group.getAttribute('data-backlog-type');
      if (Object.prototype.hasOwnProperty.call(openGroups, type)) group.open = openGroups[type];
    });
    if (rowId) {
      var nextRow = document.querySelector('.personal-backlog-table [data-row="' + String(rowId).replace(/["\\]/g, '') + '"]');
      if (nextRow) nextRow.focus({ preventScroll: true });
    }
    window.scrollTo(0, scrollY);
    return true;
  }

  function body() {
    switch (current) {
      case 'work': return S.work();
      case 'room': return S.room();
      case 'room-board': return S.roomBoard();
      case 'queue': return S.queue();
      case 'tracking': return S.tracking();
      case 'assignment-rules': return A.assignmentView();
      case 'mine': return S.mine();
      case 'team': return S.team();
      case 'my-dashboard': return S.personalDashboard();
      case 'board': return S.board();
      case 'report': return S.reportEntry();
      case 'monitor': return S.monitorDashboard();
      case 'time-report': return S.timeReport();
      case 'item-activity': return S.itemActivity();
      case 'periods': return S.periods();
      case 'audit': return S.audit();
      case 'admin': return A.view();
      default: return '';
    }
  }

  /* ============================ Đăng nhập ============================ */

  function passwordControl(name, opts) {
    opts = opts || {};
    var id = opts.id || ('password-' + name);
    var label = 'Hiện mật khẩu';
    var attr = opts.autocomplete ? ' autocomplete="' + U.attr(opts.autocomplete) + '"' : '';
    return '<div class="password-control">' +
      ui.input(name, '', { type: 'password', required: !!opts.required, placeholder: opts.placeholder || '', id: id, attrs: attr }) +
      '<button type="button" class="password-toggle" data-act="toggle-password" data-target="' + U.attr(id) + '" aria-label="' + label + '" title="' + label + '">' +
      U.icon('eye', 18) + '<span class="sr-only">' + label + '</span></button></div>';
  }

  function togglePassword(el) {
    var input = document.getElementById(el.getAttribute('data-target'));
    if (!input) return;
    var visible = input.type === 'password';
    var label = visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
    input.type = visible ? 'text' : 'password';
    el.setAttribute('aria-label', label);
    el.setAttribute('title', label);
    el.innerHTML = U.icon(visible ? 'eye-off' : 'eye', 18) + '<span class="sr-only">' + U.esc(label) + '</span>';
    input.focus();
  }

  function authView() {
    return '<div class="auth">' +
      '<div class="auth-side">' +
      '<div class="auth-brand"><div class="rail-mark">LS</div><span>LS-Routing</span></div>' +
      '<div class="auth-copy"><p class="auth-eyebrow">Điều phối tín dụng</p>' +
      '<h2 class="auth-lead">Quản lý hồ sơ tín dụng</h2></div>' +
      '</div>' +

      '<div class="auth-main"><div class="auth-form">' +
      '<div class="auth-mobile-brand" aria-hidden="true"><div class="rail-mark">LS</div><span>LS-Routing</span></div>' +
      '<div class="auth-form-kicker">' + U.icon('lock', 16) + '<span>Không gian nội bộ</span></div>' +
      '<h1>Đăng nhập</h1>' +
      '<form data-form="login">' +
      ui.field('Mã cán bộ / user', ui.input('login_code', '', { required: true, placeholder: 'Nhập mã cán bộ hoặc user được cấp', id: 'loginCode', attrs: ' autocomplete="username"' })) +
      ui.field('Mật khẩu', passwordControl('password', { id: 'loginPassword', placeholder: 'Nhập mật khẩu tại đây', autocomplete: 'current-password' })) +
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

  function sessionRestoreErrorView() {
    return '<main class="auth"><div class="auth-main"><div class="auth-form">' +
      '<div class="auth-mobile-brand" aria-hidden="true"><div class="rail-mark">LS</div><span>LS-Routing</span></div>' +
      '<h1>Chưa tải được dữ liệu</h1>' +
      '<p>Phiên đăng nhập vẫn được giữ trên thiết bị. Kiểm tra kết nối rồi thử lại.</p>' +
      '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">' +
      ui.btn('Thử lại', { act: 'restore-session', kind: 'primary' }) +
      ui.btn('Đăng xuất', { act: 'logout', kind: 'quiet', icon: 'logout' }) +
      '</div></div></div></main>';
  }

  function restoreSession() {
    if (!LS.api || !LS.api.hasSession()) { root.innerHTML = authView(); return; }
    root.innerHTML = '<main class="auth"><div class="auth-main"><div class="auth-form"><p class="t2">Đang khôi phục phiên đăng nhập…</p></div></div></main>';
    return LS.api.bootstrap().then(function (snapshot) {
      U.replace(snapshot); lastRefresh = Date.now(); current = null; S.resetFilters(); render();
    }).catch(function () {
      if (!LS.api.hasSession()) { root.innerHTML = authView(); return; }
      root.innerHTML = sessionRestoreErrorView();
    });
  }

  function passwordView(u) {
    return '<div class="auth"><div class="auth-side">' +
      '<div class="auth-brand"><div class="rail-mark">LS</div><span>LS-Routing</span></div>' +
      '<div class="auth-copy"><h2 class="auth-lead">Mật khẩu tạm chỉ dùng được <em>một lần</em>.</h2>' +
      '<p class="auth-note">Tài khoản đang dùng mật khẩu tạm.</p>' +
      '</div></div>' +
      '<div class="auth-main"><div class="auth-form">' +
      '<h1>Đổi mật khẩu</h1><p>' + U.esc(u.full_name) + '</p>' +
      '<form data-form="change-password">' +
      ui.field('Mật khẩu hiện tại', passwordControl('current', { required: true, autocomplete: 'current-password' })) +
      ui.field('Mật khẩu mới', passwordControl('next', { required: true, autocomplete: 'new-password' }), 'tối thiểu 8 ký tự, có cả chữ và số') +
      ui.field('Nhập lại mật khẩu mới', passwordControl('again', { required: true, autocomplete: 'new-password' })) +
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
      ui.closeDialog();
      render();
      ui.toast('Bản trình duyệt không lưu mật khẩu; đã bỏ qua.');
      return;
    }
    LS.api.changePassword(String(d.get('current') || ''), next).then(function () {
      ui.closeDialog();
      return refreshServer('Đã đổi mật khẩu.');
    }).catch(function (error) { ui.toast(error.message || 'Không đổi được mật khẩu.', 'err'); });
  }

  function login(code, password, demoPick) {
    var loginCode = String(code || '').trim();
    if (!loginCode) { ui.toast('Nhập mã cán bộ hoặc user admin.', 'err'); return; }
    if (U.isGas()) {
      LS.api.authenticate(loginCode, password || '').then(function (snapshot) {
        U.replace(snapshot); lastRefresh = Date.now(); current = null; S.resetFilters(); render();
        ui.toast('Xin chào ' + (me() ? me().full_name : '') + '.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể đăng nhập.', 'err'); });
      return;
    }
    var u = st().users.filter(function (x) { return String(x.login_code || x.user_id).toLowerCase() === loginCode.toLowerCase(); })[0];
    if (!u) { ui.toast('Mã cán bộ chưa được cấp quyền vào hệ thống.', 'err'); return; }
    if (!u.active) { ui.toast('Tài khoản đang bị khóa.', 'err'); return; }
    // Bản xem thử dùng mật khẩu riêng "demo". Không đưa mật khẩu khởi tạo thật vào
    // đây: file này được đóng gói nguyên vào trang GAS, ai mở mã nguồn trang cũng đọc được.
    if (!demoPick && u.role !== 'PHONG_PGD') {
      if (String(password || '') !== 'demo') { ui.toast('Mật khẩu không đúng (bản xem thử dùng "demo").', 'err'); return; }
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
    // Phòng/PGD đăng nhập bằng mã, không có mật khẩu — chỉ tài khoản nội bộ
    // (LS, kiểm soát, quản lý, admin) mới cần lối tự đổi mật khẩu ở đây.
    var canChangePassword = u.role !== 'PHONG_PGD';
    ui.openDialog('Tài khoản',
      ui.kv([
        ['Họ tên', u.full_name], ['Email', u.email],
        ['Vai trò', D.ROLES[u.role].label], ['Đơn vị', S.unitName(u.unit_id)]
      ]) +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Phạm vi dữ liệu') +
      '<p class="t2">' + U.esc(scopeText(u.role)) + '</p></div>' +
      '<div class="form-end">' +
      ui.btn('Đóng', { act: 'close-dialog', kind: 'quiet' }) +
      (canChangePassword ? ui.btn('Đổi mật khẩu', { act: 'change-password-dialog', kind: 'line', icon: 'lock' }) : '') +
      ui.btn('Đăng xuất', { act: 'logout', kind: 'danger', icon: 'logout' }) +
      '</div>');
  }

  /** Đổi mật khẩu chủ động, không phải vì mật khẩu tạm hết hạn — mở từ hộp thoại Tài khoản. */
  function changePasswordDialog() {
    var u = me();
    ui.openDialog('Đổi mật khẩu',
      '<form data-form="change-password">' +
      ui.field('Mật khẩu hiện tại', passwordControl('current', { required: true, autocomplete: 'current-password' })) +
      ui.field('Mật khẩu mới', passwordControl('next', { required: true, autocomplete: 'new-password' }), 'tối thiểu 8 ký tự, có cả chữ và số') +
      ui.field('Nhập lại mật khẩu mới', passwordControl('again', { required: true, autocomplete: 'new-password' })) +
      '<div class="form-end">' +
      ui.btn('Hủy', { act: 'close-dialog', kind: 'quiet' }) +
      ui.btn('Đổi mật khẩu', { type: 'submit', kind: 'primary', icon: 'arrow' }) +
      '</div></form>',
      { sub: u.full_name });
  }

  function scopeText(role) {
    if (role === 'GIAM_SAT') return 'Chỉ xem số liệu tổng hợp và báo cáo toàn hệ thống.';
    if (role === 'PHONG_PGD') return 'Bạn xem được việc của đơn vị mình. Sửa hồ sơ sau khi LS đã nhận sẽ thành đề nghị chờ kiểm soát duyệt.';
    if (role === 'CAN_BO_LS') return 'Bạn chỉ xem được việc đang được giao cho mình, không xem việc của đồng nghiệp.';
    if (role === 'ADMIN') return 'Bạn quản trị cấu hình và danh mục. Vai trò này không được xem thông tin khách hàng.';
    return 'Bạn xem được toàn bộ việc của ban LS.';
  }

  function markInboxRead(ids, done) {
    var u = me();
    var markAll = !Array.isArray(ids);
    var wanted = {};
    (Array.isArray(ids) ? ids : []).forEach(function (id) { wanted[String(id)] = true; });
    var marked = st().inbox.filter(function (n) {
      return n.user_id === u.user_id && !n.read && (markAll || wanted[String(n.id)]);
    });
    if (!marked.length) { if (done) done(); return; }

    function apply() {
      marked.forEach(function (n) { n.read = true; });
      if (!U.isGas()) U.save();
      if (done) done();
    }

    if (U.isGas()) {
      LS.api.markInboxRead(markAll ? undefined : marked.map(function (n) { return n.id; }))
        .then(apply)
        .catch(function (error) { ui.toast(error.message || 'Không thể đánh dấu thông báo đã xem.', 'err'); });
    } else apply();
  }

  function inboxDialog(tab) {
    if (tab) inboxTab = tab;
    var u = me();
    var all = st().inbox
      .filter(function (n) { return n.user_id === u.user_id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var unread = all.filter(function (n) { return !n.read; }).length;
    var viewed = all.length - unread;
    var list = all.filter(function (n) { return inboxTab === 'READ' ? n.read : !n.read; }).slice(0, 30);
    var emptyText = inboxTab === 'READ'
      ? 'Các thông báo bạn đã xem sẽ được giữ tại đây.'
      : 'Thông báo giao việc và nhắc hạn mới sẽ hiện ở đây.';

    ui.openDialog('Thông báo',
      '<div class="btn-row" style="margin-bottom:1rem">' +
      ui.btn('Chưa xem' + (unread ? ' (' + unread + ')' : ''), { act: 'inbox-show-unread', kind: inboxTab === 'UNREAD' ? 'primary' : 'line', sm: true }) +
      ui.btn('Đã xem' + (viewed ? ' (' + viewed + ')' : ''), { act: 'inbox-show-read', kind: inboxTab === 'READ' ? 'primary' : 'line', sm: true }) +
      (unread ? ui.btn('Đánh dấu tất cả đã xem', { act: 'inbox-mark-all', kind: 'quiet', sm: true }) : '') +
      '</div>' +
      (list.length
        ? '<div class="tl">' + list.map(function (n) {
          var item = U.byId(st().items, 'item_id', n.item_id);
          var action = '';
          if (inboxTab === 'UNREAD') {
            // Chỉ mở "Xem việc" khi việc còn mở/đang xử lý. Việc đã hủy/hoàn thành
            // hoặc không còn trong phạm vi xem thì chỉ cần "Đánh dấu đã xem" để gỡ
            // badge — không ép mở một việc đã đóng (vô nghĩa và dễ treo lỗi, nên
            // thông báo kiểu "đề nghị hủy đã được duyệt" cứ kẹt ở chưa xem).
            var openItem = item && D.STATUS[item.status] && D.STATUS[item.status].open;
            action = openItem
              ? ui.btn('Xem việc', { act: 'inbox-view', kind: 'quiet', sm: true, data: ' data-notification-id="' + U.attr(n.id) + '" data-item-id="' + U.attr(n.item_id) + '"' })
              : ui.btn('Đánh dấu đã xem', { act: 'inbox-mark-read', kind: 'quiet', sm: true, data: ' data-notification-id="' + U.attr(n.id) + '"' });
          } else if (item) {
            action = ui.btn('Xem việc', { act: 'detail', kind: 'quiet', sm: true, data: ' data-id="' + U.attr(n.item_id) + '"' });
          }
          if (n.event === 'NGHI_PHEP_LS' && n.subject_user_id) {
            action = ui.btn('Xem việc đang mở', { act: 'inbox-absence-work', kind: 'quiet', sm: true,
              data: ' data-notification-id="' + U.attr(n.id) + '" data-subject-user-id="' + U.attr(n.subject_user_id) + '"' });
          }
          return '<div class="tl-item"><div class="tl-head">' +
            '<b>' + U.esc(D.NOTIFY_EVENTS[n.event] || D.label(n.event)) + '</b>' +
            (n.read ? '' : ui.tag('Mới', 'gold')) +
            '<time>' + U.fmtDT(n.at) + '</time></div>' +
            '<div class="tl-body">' +
            (item ? '<span class="t2">' + U.esc(S.itemLabel(item)) + '</span>' :
              '<span class="t2">' + U.esc(n.detail || ('Việc ' + (n.item_id || '') + ' không còn trong phạm vi bạn xem được.')) + '</span>') +
            action +
            '</div></div>';
        }).join('') + '</div>'
        : ui.empty({ icon: 'bell', title: inboxTab === 'READ' ? 'Chưa có thông báo đã xem' : 'Không có thông báo mới', text: emptyText })) +
      '<div class="form-end">' + ui.btn('Đóng', { act: 'close-dialog', kind: 'quiet' }) + '</div>',
      { sub: unread ? unread + ' thông báo mới' : '' });
  }

  /* ============================ Tiện ích ============================ */

  function download(name, content, mime) {
    var blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8;' });
    downloadBlob(name, blob);
  }

  function downloadBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /**
   * Xuất file .xlsx thật. Thư viện SheetJS chỉ nạp khi bấm xuất (không làm nặng
   * lần mở app). Mạng chặn CDN thì rơi về CSV của trang đầu, vẫn mở được bằng Excel.
   * sheets = [{ name, rows: [[ô, ô, …], …] }], dòng đầu là tiêu đề.
   */
  var xlsxLoading = null;

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { xlsxLoading = null; reject(new Error('Không tải được thư viện Excel')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  function styleExportSheet(X, ws, sheet) {
    if (!ws['!ref']) return;
    var range = X.utils.decode_range(ws['!ref']);
    var headerRows = Array.isArray(sheet.headerRows) ? sheet.headerRows : [0];
    var headerMap = {};
    headerRows.forEach(function (row) { headerMap[row] = true; });
    var lastHeader = headerRows.length ? Math.max.apply(null, headerRows) : -1;
    var palette = {
      navy: '17365D', blue: '245B8F', green: '548235', amber: 'A66B00', red: 'A4262C',
      text: '243447', white: 'FFFFFF', stripe: 'F3F6FA', border: 'D9E2F0',
      paleGreen: 'E7F1E8', paleAmber: 'FFF2CC', paleRed: 'FCE8E6'
    };
    var headerLabels = sheet.rows[headerRows.length ? lastHeader : 0] || [];
    var widths = [];
    var heights = [];

    function labelFor(column) { return String(headerLabels[column] || '').toLowerCase(); }
    function numberStyle(value, label) {
      if (typeof value !== 'number' || !isFinite(value)) return {};
      if (/đúng hạn|%/.test(label)) return { numFmt: '0"%"' };
      if (/giờ|hour/.test(label)) return { numFmt: '0.0' };
      return { numFmt: Number.isInteger(value) ? '#,##0' : '#,##0.0#' };
    }
    function headerColor(label) {
      if (/quá hạn|trễ hạn/.test(label)) return palette.red;
      if (/hoàn thành|đúng hạn/.test(label)) return palette.green;
      if (/đang mở|tồn cuối kỳ/.test(label)) return palette.amber;
      return palette.navy;
    }

    for (var r = range.s.r; r <= range.e.r; r++) {
      var maxLines = 1;
      for (var c = range.s.c; c <= range.e.c; c++) {
        var address = X.utils.encode_cell({ r: r, c: c });
        var cell = ws[address];
        if (!cell) cell = ws[address] = { t: 's', v: '' };
        var header = !!headerMap[r];
        var label = labelFor(c);
        var value = cell.v;
        var border = { style: 'thin', color: { rgb: palette.border } };
        var style = {
          font: { name: 'Aptos', sz: 10, color: { rgb: palette.text } },
          alignment: { vertical: 'center', horizontal: typeof value === 'number' ? 'right' : 'left', wrapText: true },
          border: { bottom: border }
        };
        if (header) {
          style.fill = { patternType: 'solid', fgColor: { rgb: headerColor(label) } };
          style.font = { name: 'Aptos', sz: 10, bold: true, color: { rgb: palette.white } };
          style.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
          style.border = { bottom: { style: 'medium', color: { rgb: palette.white } } };
        } else {
          if ((r - lastHeader) % 2 === 0) style.fill = { patternType: 'solid', fgColor: { rgb: palette.stripe } };
          if (r > lastHeader && c === range.s.c) style.font.bold = true;
          if (/quá hạn|trễ hạn/.test(label) && Number(value) > 0) {
            style.fill = { patternType: 'solid', fgColor: { rgb: palette.paleRed } };
            style.font.color = { rgb: palette.red };
            style.font.bold = true;
          } else if (/hoàn thành|đúng hạn/.test(label) && Number(value) > 0) {
            style.fill = { patternType: 'solid', fgColor: { rgb: palette.paleGreen } };
          } else if (/đang mở|tồn cuối kỳ/.test(label) && Number(value) > 0) {
            style.fill = { patternType: 'solid', fgColor: { rgb: palette.paleAmber } };
          }
          Object.assign(style, numberStyle(value, label));
        }
        cell.s = style;
        var text = value === null || value === undefined ? '' : String(value);
        var lines = text.split(/\r?\n/);
        maxLines = Math.max(maxLines, lines.length);
        widths[c] = Math.max(widths[c] || 0, lines.reduce(function (n, line) { return Math.max(n, line.length); }, 0));
      }
      heights[r] = { hpt: header ? 32 : Math.min(54, 20 + Math.max(0, maxLines - 1) * 12) };
    }

    ws['!cols'] = widths.map(function (width, index) {
      var heading = String((sheet.rows[0] || [])[index] || '');
      return { wch: Math.min(48, Math.max(10, width + (heading ? 3 : 2))) };
    });
    ws['!rows'] = heights;
    if (sheet.autoFilter !== false && headerRows.length === 1 && ws['!ref'] && range.e.r > headerRows[0]) {
      ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: headerRows[0], c: range.s.c }, e: range.e }) };
    }
    if (sheet.freeze !== false && lastHeader >= range.s.r) {
      ws['!freeze'] = X.utils.encode_cell({ r: lastHeader + 1, c: range.s.c });
    }
  }

  function downloadXlsx(name, sheets) {
    sheets = sheets.filter(function (s) { return s.rows && s.rows.length; });
    if (!sheets.length) { ui.toast('Chưa có số liệu để xuất.', 'err'); return; }
    ui.toast('Đang tạo file Excel…');
    loadXlsx().then(function (X) {
      var wb = X.utils.book_new();
      sheets.forEach(function (s) {
        var ws = X.utils.aoa_to_sheet(s.rows);
        styleExportSheet(X, ws, s);
        X.utils.book_append_sheet(wb, ws, String(s.name).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31));
      });
      X.writeFile(wb, name + '.xlsx');
    }).catch(function (e) {
      var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
      download(name + '.csv', sheets[0].rows.map(function (r) { return r.map(q).join(','); }).join('\r\n'), 'text/csv');
      ui.toast(e.message + ' — đã xuất CSV thay thế.', 'warn');
    });
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
    go: function (el) { current = el.getAttribute('data-screen'); S.enterScreen(current); render(); window.scrollTo(0, 0); },
    'close-dialog': closeDialog,
    'update-notice-dismiss': function () { finishUpdateNoticeDisplay(); ui.closeDialog(); },
    shortcuts: shortcutHelp,
    logout: logout,
    'restore-session': restoreSession,
    account: accountDialog,
    'change-password-dialog': changePasswordDialog,
    'toggle-password': togglePassword,
    inbox: inboxDialog,
    'inbox-show-unread': function () { inboxDialog('UNREAD'); },
    'inbox-show-read': function () { inboxDialog('READ'); },
    'inbox-mark-all': function () { markInboxRead(undefined, function () { inboxDialog('UNREAD'); }); },
    'inbox-mark-read': function (el) {
      markInboxRead([el.getAttribute('data-notification-id')], function () { inboxDialog(inboxTab); });
    },
    'inbox-view': function (el) {
      var itemId = el.getAttribute('data-item-id');
      markInboxRead([el.getAttribute('data-notification-id')], function () { S.detail(itemId); });
    },
    'inbox-absence-work': function (el) {
      var userId = el.getAttribute('data-subject-user-id');
      function openWork() { ui.closeDialog(); S.staffWorkDetail(userId, { allOpen: true }); }
      if (inboxTab === 'UNREAD') markInboxRead([el.getAttribute('data-notification-id')], openWork);
      else openWork();
    },
    'login-as': function (el) { login(el.getAttribute('data-code'), '', true); },

    'new-request': S.newRequest,
    detail: function (el) { S.detail(el.getAttribute('data-id')); },
    'item-activity': function (el) { S.openActivity(el.getAttribute('data-id')); },
    'activity-back': function () { current = activityReturnScreen; render(); S.detail(S.activityItemId()); },
    'activity-refresh': function () { S.loadActivity(false); },
    'activity-more': function () { S.loadActivity(true); },
    'activity-send-preview': function (el) { S.previewActivitySend(el.getAttribute('data-id')); },
    'timing-audit': S.loadTimingAudit,
    'timing-fix': function (el) { S.fixAuditedTimes(el.getAttribute('data-id')); },
    'timing-owner': function (el) { S.confirmOwner(el.getAttribute('data-id')); },
    'pause-all': S.openGlobalPause,
    'other-work': S.openOtherWork,
    'other-work-cancel': function (el) { S.cancelOtherWork(el.getAttribute('data-id')); },
    'global-pause-end': function (el) { S.openEndGlobalPause(el.getAttribute('data-operation-id')); },
    'edit-item': function (el) { S.editItem(el.getAttribute('data-id')); },
    'edit-times': function (el) { S.editTimes(el.getAttribute('data-id')); },
    'change-due-date': function (el) { S.changeDueDate(el.getAttribute('data-id')); },
    supplement: function (el) { S.openSupplement(el.getAttribute('data-id')); },
    'edit-result-flags': function (el) { S.editResultFlags(el.getAttribute('data-id')); },
    'time-export': S.exportTimeReport,
    flow: function (el) { S.flow(el.getAttribute('data-id'), el.getAttribute('data-to')); },
    'credit-draft': function (el) { S.markCreditDraft(el.getAttribute('data-id'), el.getAttribute('data-done') === '1'); },
    'checklist-all': function (el) { S.checklistAll(el.getAttribute('data-id')); },
    'receive-all': function () { S.receiveAll(); },
    'add-linked': function (el) { S.addLinked(el.getAttribute('data-id')); },
    'quick-assign': function (el) { S.quickAssign(el.getAttribute('data-id')); },
    'batch-assign-open': S.openBatchAssign,
    'batch-assign-submit': S.submitBatchAssign,
    'bulk-assign': S.submitBulkAssign,
    'bulk-clear': S.clearPicks,
    'cancel-request': function (el) { S.requestCancel(el.getAttribute('data-id')); },
    'cancel-approve': function (el) { S.approveCancel(el.getAttribute('data-id')); },
    'open-filter': function (el) { S.openFilter(el.getAttribute('data-screen') || current); },
    'reset-filter': function (el) { S.resetFilter(el.getAttribute('data-screen') || current); },
    'apply-filter': function (el) { S.applyFilter(el.getAttribute('data-screen') || current); },
    'date-picker': function (el) {
      var input = document.getElementById(el.getAttribute('data-target'));
      if (!input) return;
      try { if (input.showPicker) input.showPicker(); else input.click(); }
      catch (ignorePicker) { input.click(); }
    },
    'apply-report': S.applyReportFilter,
    'room-backlog': function () { S.roomShowBacklog(); },
    'board-plan': function () { S.togglePlan(); },
    'board-khac': function () { S.toggleKhac(); },
    'staff-work-detail': function (el) { S.staffWorkDetail(el.getAttribute('data-user-id')); },
    'assignment-staff-work-preview': function (el) { S.assignmentStaffWorkPreview(el); },
    'plan-edit': S.planDialog,
    'staff-absence': S.staffAbsenceDialog,
    'staff-absence-edit': function (el) { S.staffAbsenceEditDialog(el.getAttribute('data-id')); },
    'my-absence': S.myAbsenceDialog,
    'board-tab': function (el) { S.setFilter('board', 'tab', el.getAttribute('data-tab') || 'report'); render(); },
    'sort-column': function (el) { S.toggleSort(el.getAttribute('data-screen') || current, el.getAttribute('data-sort') || 'date'); render(); },
    'queue-unit': function (el) { S.setFilter('queue', 'qunit', el.getAttribute('data-unit') || ''); S.setFilter('queue', 'page', 1); render(); },
    'queue-view': function (el) { ui.closeDialog(); S.setFilter('queue', 'view', el.getAttribute('data-view') || ''); render(); window.scrollTo(0, 0); },
    'tracking-tab': function (el) { S.setFilter('tracking', 'tab', el.getAttribute('data-tab') || 'all'); S.setFilter('tracking', 'page', 1); render(); },
    'mine-tab': function (el) { S.setFilter('mine','tab',el.getAttribute('data-tab') || 'all'); render(); },
    'start-work': function (el) { S.startWork(el.getAttribute('data-id')); },
    'unit-chip': function (el) { var sc = el.getAttribute('data-screen') || 'tracking'; S.setFilter(sc, 'tunit', el.getAttribute('data-unit') || ''); S.setFilter(sc, 'page', 1); render(); },
    'report-hub': function (el) { S.setFilter('report', 'hub', el.getAttribute('data-tab') || 'multi'); render(); },
    'queue-page': function (el) { if (!el.disabled) { S.setFilter(el.getAttribute('data-screen') || 'queue', 'page', Number(el.getAttribute('data-page')) || 1); render(); } },
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
    'audit-more': S.auditMore,
    'cfglog-reload': function () { LS.admin.reloadConfigLog(); },
    'audit-reload': S.auditReload,
    'audit-run': S.auditRun,
    'download-daily-image': S.downloadDailyImage,
    'create-next-monthly-plan': function () {
      ui.confirm({ title: 'Tạo kế hoạch tháng kế tiếp', heading: 'Tạo Sheet liên kết cho tháng sau?',
        text: 'Tạo trước Sheet tháng mới. Ngày đầu tháng kỳ mới tự kích hoạt và việc đang mở tự chuyển sang; trước đó mọi việc vẫn làm bình thường ở tháng này.',
        ok: 'Tạo kế hoạch', run: function () { LS.api.createNextMonthlyPlan().then(function () { return refreshServer('Đã tạo kế hoạch tháng kế tiếp.'); }).catch(function (e) { ui.toast(e.message || 'Không thể tạo kế hoạch tháng.', 'err'); }); } });
    },

    'admin-go': function (el) { A.setSection(el.getAttribute('data-section')); render(); window.scrollTo(0, 0); },
    'update-notice-edit': A.editUpdateNotice,
    'update-notice-clear': A.clearUpdateNotice,
    'admin-score-toggle': function (el) {
      var hide = el.getAttribute('data-hide') === '1';
      A.setScoreHidden(hide);
      render();
      ui.toast(hide ? 'Đã tạm ẩn điểm vận hành.' : 'Đã hiện lại điểm vận hành.');
    },
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
    'report-refresh': function () { S.refreshReport(); },
    'report-run': function () { S.refreshReport(); },
    'board-export': function () { S.exportBoard(); },
    'report-export': function () { S.exportReport(); },
    'type-edit': function (el) { A.typeDialog(el.getAttribute('data-code')); },
    'unit-edit': function (el) { A.unitDialog(el.getAttribute('data-id')); },
    'user-edit': function (el) { A.userDialog(el.getAttribute('data-id')); },
    'user-reset-password': function (el) { A.resetUserPasswordDialog(el.getAttribute('data-id')); },
    'user-delete': function (el) { A.deleteUserDialog(el.getAttribute('data-id')); },
    'user-import': A.userImportDialog,
    'user-import-template': A.downloadUserImportTemplate,
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
    // Hộp thoại phân công: bấm chỗ nào trên dòng cán bộ cũng tick chọn dòng đó.
    var pickRow = ev.target.closest('tr[data-pick-assignee]');
    if (pickRow && !ev.target.closest('input, label, a, button')) {
      var radio = pickRow.querySelector('input[type="radio"]');
      if (radio && !radio.disabled) radio.checked = true;
      return;
    }
    var el = ev.target.closest('[data-act]');
    if (!el) {
      if (ev.target.id === 'scrim') closeDialog();
      return;
    }
    if (el.tagName === 'INPUT') return; // công tắc xử lý ở sự kiện change
    var fn = CLICK[el.getAttribute('data-act')];
    if (fn) { ev.preventDefault(); fn(el); }
  }

  var FORMS = {
    'confirm-time-owner': S.submitOwner,
    login: function (form) { var d = new FormData(form); login(d.get('login_code'), d.get('password')); },
    confirm: ui.runConfirm,
    'change-password': changePassword,
    'new-request': S.submitNewRequest,
    'edit-item': S.submitEdit,
    'cancel-request': S.submitCancelRequest,
    'edit-times': S.submitTimes,
    'change-due-date': S.submitDueDate,
    supplement: S.submitSupplement,
    'result-flags': S.submitResultFlags,
    'work-plan': S.submitPlan,
    'staff-absence': S.saveStaffAbsence,
    'my-absence': S.saveMyAbsence,
    'time-report': S.runTimeReport,
    'team-view': S.runTeamView,
    'global-pause': S.submitGlobalPause,
    'other-work': S.submitOtherWork,
    'end-pause': S.submitEndGlobalPause,
    flow: S.submitFlow,
    channel: A.saveChannel,
    template: A.saveTemplate,
    rule: A.saveRule,
    'out-confirm': A.doConfirmSend,
    'work-type': A.saveType,
    unit: A.saveUnit,
    user: A.saveUser,
    'user-reset-password': A.resetUserPassword,
    'user-delete': A.submitDeleteUser,
    'user-import': A.importUsers,
    reason: A.saveReason,
    'catalog-option': A.saveCatalogOption,
    'assignment-rule': A.saveAssignmentRule,
    calendar: A.saveCalendar,
    settings: A.saveSettings,
    'update-notice': A.saveUpdateNotice
  };

  function onSubmit(ev) {
    var form = ev.target.closest('[data-form]');
    if (!form) return;
    ev.preventDefault();
    var fn = FORMS[form.getAttribute('data-form')];
    if (fn) fn(form);
  }

  var typeTimer = null;

  function onDateInput(ev) {
    var display = ev.target.closest('[data-date-display-for]');
    if (!display) return;
    LS.ui.syncDateInput(display);
    S.syncRequestWeekdays(display.closest('.row-item'));
  }

  /** Lọc gõ tới đâu lọc tới đó, giữ nguyên con trỏ sau khi vẽ lại. */
  function onFilter(ev) {
    var el = ev.target.closest('[data-filter], [data-draft-filter], [data-ofilter]');
    if (!el) return;
    var value = el.value;
    if (el.hasAttribute('data-date-display-for')) {
      var nativeDate = document.getElementById(el.getAttribute('data-date-display-for'));
      if (!nativeDate) return;
      if (el.value.trim() && !nativeDate.value) return;
      value = nativeDate.value;
    }

    if (el.hasAttribute('data-ofilter')) {
      A.setOutFilter(el.getAttribute('data-ofilter'), value);
    } else {
      var filterScreen = el.getAttribute('data-filter-screen') || current;
      if (el.hasAttribute('data-draft-filter')) {
        S.setDraftFilter(filterScreen, el.getAttribute('data-draft-filter'), value);
        return;
      }
      var filterKey = el.getAttribute('data-filter');
      S.setFilter(filterScreen, filterKey, value);
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

    if (t.type === 'date' && (t.hasAttribute('data-request-native-date') || /^dt_/.test(t.name || ''))) {
      S.syncRequestWeekdays(t.closest('.row-item'));
      return;
    }

    if (t.hasAttribute('data-date-native-for')) {
      var display = document.querySelector('[data-date-display-for="' + t.getAttribute('data-date-native-for') + '"]');
      if (display) {
        var kind = display.getAttribute('data-date-kind');
        display.value = kind === 'datetime-local'
          ? U.fmtDate(t.value.split('T')[0]) + ' ' + (t.value.split('T')[1] || '').slice(0, 5) +
            ((t.value.split('T')[1] || '').length > 5 ? ':' + t.value.split('T')[1].slice(6, 8) : '')
          : U.fmtDate(t.value);
        display.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    if (t.getAttribute('data-role') === 'request-weekday') { S.selectRequestWeekday(t); return; }
    if (t.getAttribute('data-role') === 'request-week') { S.selectRequestWeek(t); return; }

    if (t.getAttribute('data-role') === 'work-type-group') {
      S.syncProductOptions(t);
      return;
    }

    if (t.getAttribute('data-role') === 'work-type-product') {
      S.syncCollateralMode(t);
      return;
    }

    if (t.getAttribute('data-role') === 'collateral-mode') {
      S.syncRequestQuantities(t.closest('.row-item'));
      return;
    }

    if (t.hasAttribute('data-cond')) { applyConds(); return; }

    // Quy tắc phân công nhanh: tick cả nhóm sản phẩm / "Mọi sản phẩm" đồng bộ các ô còn lại.
    if (t.hasAttribute('data-rule-scope')) { A.syncRuleScope(t); return; }

    var reportField = { 'report-preset': 'preset', 'report-from': 'from', 'report-to': 'to', 'report-group': 'group' };
    var reportAct = t.getAttribute('data-act');
    if (reportAct && reportField[reportAct]) {
      var reportValue = t.value;
      if (t.hasAttribute('data-date-display-for')) {
        var reportDate = document.getElementById(t.getAttribute('data-date-display-for'));
        reportValue = reportDate ? reportDate.value : '';
      }
      S.setReportFilter(reportField[reportAct], reportValue);
      return;
    }

    var act = t.closest('[data-act]');
    if (act && t.tagName === 'INPUT') {
      var a = act.getAttribute('data-act');
      if (a === 'checklist-toggle') {
        S.saveChecklistToggle(act.getAttribute('data-id'), Number(act.getAttribute('data-index')), !!t.checked);
        return;
      }
      if (a === 'step-toggle') {
        var stepRow = act.closest('[data-step-row]');
        var stepQuantity = stepRow && stepRow.querySelector('[data-act="step-quantity"]');
        S.recordStepToggle(act.getAttribute('data-id'), act.getAttribute('data-key'), !!t.checked, stepQuantity ? stepQuantity.value : '1');
        return;
      }
      if (a === 'step-quantity') {
        S.recordStepQuantity(act.getAttribute('data-id'), act.getAttribute('data-key'), t.value);
        return;
      }
      if (a === 'dossier-received') {
        if (t.checked) S.confirmDossierReceipt(act.getAttribute('data-id'));
        else t.checked = true;
        return;
      }
      if (a === 'linked-toggle') { S.toggleLinkedBox(!!t.checked); return; }
      if (a === 'pick-row') { S.togglePick(act.getAttribute('data-id'), !!t.checked); return; }
      if (a === 'pick-all') { S.togglePickAll(!!t.checked); return; }
      if (a === 'chan-toggle') { A.toggleChannel(act.getAttribute('data-code')); return; }
      if (a === 'rule-toggle') { A.toggleRule(act.getAttribute('data-id')); return; }
    }

    onFilter(ev);
  }

  /* ============================ Phím tắt ============================ */

  /**
   * Phím đơn chỉ chạy khi không gõ chữ. Ctrl/⌘ + Enter gửi biểu mẫu đang mở,
   * Esc đóng hộp thoại hoặc rời ô nhập. Mọi phím chỉ bấm hộ đúng nút đang hiện
   * trên màn — không có đường tắt nào vượt quyền của vai trò.
   */
  var SHORTCUTS = [
    ['Chung', [
      ['?', 'Mở bảng phím tắt này'],
      ['1 – 9', 'Chuyển màn theo thứ tự thanh bên trái'],
      ['/', 'Tìm trong danh sách'],
      ['F', 'Mở bộ lọc'],
      ['N', 'Tạo việc mới (khi màn có nút này)'],
      ['R', 'Tải lại dữ liệu'],
      ['[  ]', 'Tab tổng hợp trước / sau, hoặc trang trước / sau']
    ]],
    ['Danh sách việc', [
      ['J  ↓', 'Xuống dòng kế'],
      ['K  ↑', 'Lên dòng trước'],
      ['Enter  O', 'Mở chi tiết dòng đang chọn'],
      ['A', 'Bấm thao tác chính của dòng (Tiếp nhận, Hẹn ký…)'],
      ['C', 'Mở Hoàn thành cho dòng đang chọn (khi đủ điều kiện)'],
      ['Tab', 'Đi qua các nút trong dòng']
    ]],
    ['Hộp thoại', [
      ['1 – 9', 'Bấm thao tác theo số trên nút (chi tiết việc)'],
      ['E', 'Sửa thông tin việc'],
      ['Ctrl + Enter', 'Lưu / gửi biểu mẫu'],
      ['Esc', 'Đóng hộp thoại, hoặc rời ô đang gõ'],
      ['Tab  Shift+Tab', 'Đi qua các ô, vòng trong hộp thoại']
    ]]
  ];

  function shortcutHelp() {
    ui.openDialog('Phím tắt', SHORTCUTS.map(function (g) {
      return ui.sectionTitle(g[0]) + '<dl class="keys">' + g[1].map(function (k) {
        return '<dt>' + k[0].split(/\s{2}/).map(function (x) { return '<kbd>' + U.esc(x) + '</kbd>'; }).join(' ') + '</dt><dd>' + U.esc(k[1]) + '</dd>';
      }).join('') + '</dl>';
    }).join(''), { sub: 'Chỉ hoạt động khi không gõ trong ô nhập' });
  }

  function typing(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && ['checkbox', 'radio', 'button', 'submit'].indexOf(el.type) === -1;
  }

  function clickFirst(selector, scope) {
    var el = (scope || document).querySelector(selector);
    if (el && !el.disabled) { el.click(); return true; }
    return false;
  }

  function rows() { return Array.prototype.slice.call(document.querySelectorAll('#main tr[data-row]')); }

  function moveRow(step) {
    var list = rows();
    if (!list.length) return false;
    var at = list.indexOf(document.activeElement && document.activeElement.closest ? document.activeElement.closest('tr[data-row]') : null);
    var next = list[at === -1 ? (step > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + step))];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function focusedRow() {
    var a = document.activeElement;
    return a && a.closest ? a.closest('#main tr[data-row]') : null;
  }

  function stepTabs(step) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('#main .dashboard-tab'));
    if (tabs.length) {
      var at = tabs.findIndex(function (t) { return t.classList.contains('is-active'); });
      var next = tabs[(at + step + tabs.length) % tabs.length];
      next.click();
      var again = document.querySelector('#main .dashboard-tab.is-active');
      if (again) again.focus();
      return true;
    }
    return clickFirst(step > 0 ? '#main [data-act="queue-page"][data-dir="next"]:not([disabled])' : '#main [data-act="queue-page"][data-dir="prev"]:not([disabled])');
  }

  function onKey(ev) {
    var k = ev.key;
    if (k === 'Escape' && ui.dialogOpen()) { closeDialog(); return; }
    if (k === 'Enter' && (ev.ctrlKey || ev.metaKey) && ui.dialogOpen()) {
      var form = document.querySelector('#dialog form');
      if (form) { ev.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
      return;
    }
    ui.trapTab(ev);
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || !me()) return;
    if (typing(ev.target)) { if (k === 'Escape') ev.target.blur(); return; }

    // Mũi tên trái/phải trong dải tab tổng hợp (mẫu tablist của WAI-ARIA).
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && ev.target.classList && ev.target.classList.contains('dashboard-tab')) {
      ev.preventDefault(); stepTabs(k === 'ArrowRight' ? 1 : -1); return;
    }

    if (ui.dialogOpen()) {
      var dlg = document.getElementById('dialog');
      if (/^[1-9]$/.test(k) && clickFirst('[data-hotkeys] [data-hotkey="' + k + '"]', dlg)) { ev.preventDefault(); return; }
      if ((k === 'e' || k === 'E') && clickFirst('[data-hotkeys] [data-act="edit-item"]', dlg)) { ev.preventDefault(); }
      return;
    }

    var row = focusedRow();
    var handled = true;
    switch (k) {
      case '?': shortcutHelp(); break;
      case '/': var q = document.querySelector('#main .list-search input'); if (q) { q.focus(); q.select(); } else handled = false; break;
      case 'j': case 'J': handled = moveRow(1); break;
      case 'k': case 'K': handled = moveRow(-1); break;
      case 'ArrowDown': handled = !!row && moveRow(1); break;
      case 'ArrowUp': handled = !!row && moveRow(-1); break;
      case 'Enter': case 'o': case 'O':
        if (row && (k !== 'Enter' || ev.target === row)) S.detail(row.getAttribute('data-row')); else handled = false;
        break;
      case 'a': case 'A':
        handled = !!row && (clickFirst('.act-row .btn-primary', row) || clickFirst('.act-row [data-act="flow"], .act-row [data-act="quick-assign"]', row));
        break;
      case 'c': case 'C':
        handled = !!row && clickFirst('.act-row [data-act="flow"][data-to="HOAN_THANH_LS"]', row);
        break;
      case 'n': case 'N': handled = clickFirst('#main [data-act="new-request"]'); break;
      case 'f': case 'F': handled = clickFirst('#main [data-act="open-filter"]'); break;
      case 'r': case 'R':
        if (U.isGas()) refreshServer('Đã tải lại dữ liệu.').catch(function () {}); else { render(); ui.toast('Đã vẽ lại màn hình.'); }
        break;
      case '[': handled = stepTabs(-1); break;
      case ']': handled = stepTabs(1); break;
      default:
        if (/^[1-9]$/.test(k)) {
          var nav = D.ROLES[me().role].nav, target = nav[Number(k) - 1];
          if (target) { current = target; S.enterScreen(current); render(); var main = document.getElementById('main'); if (main) main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
          else handled = false;
        } else handled = false;
    }
    if (handled) ev.preventDefault();
  }

  /* ============================ Khởi động ============================ */

  var clockTimer = null;
  function init() {
    root = document.getElementById('root');
    ui.bind();
    LS.charts.bind();
    U.load(D.seed);
    if (!clockTimer) clockTimer = setInterval(function () {
      if (st().session && !document.hidden) {
        var now = new Date();
        S.refreshClocks(now);
        refreshDashboardClock(now);
      }
    },1000);

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onDateInput);
    document.addEventListener('input', onFilter);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);

    if (LS.api && LS.api.available()) {
      U.setBackend('GAS');
      ui.onDialogClose(function () { if (refreshOnClose && !syncing) scheduleRefresh(300); });
      // Quay lại tab sau một lúc thì lấy dữ liệu mới (việc vừa được giao, KS vừa
      // duyệt…). Chỉ chạy khi người dùng quay lại, không có vòng hẹn giờ ngầm.
      var onReturn = function () {
        if (document.visibilityState !== 'visible' || !st().session || syncing || ui.dialogOpen()) return;
        if (Date.now() - lastRefresh < 60000) return;
        refreshServer('', true).catch(function () { /* giữ nguyên màn hình đang xem */ });
      };
      document.addEventListener('visibilitychange', onReturn);
      window.addEventListener('focus', onReturn);
      mountQueueBadge();
      // Mọi lệnh ghi không rõ kết quả (kể cả lệnh không đi qua background) đều
      // dẫn tới một lần tải lại để đối chiếu với máy chủ.
      if (LS.api.onUnknownOutcome) LS.api.onUnknownOutcome(function () { scheduleRefresh(2000); });
      // Phiên hết hạn giữa chừng (hoặc bị quản trị khóa): về màn đăng nhập, không
      // để người dùng tiếp tục bấm vào các nút sẽ lỗi hết.
      LS.api.onSessionExpired(function () {
        if (!st().session) return;
        st().session = null; current = null; ui.closeDialog(); render();
        ui.toast('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'warn');
      });
      // Mỗi trình duyệt giữ mã phiên riêng. Có mã thì khôi phục để F5 không bắt
      // đăng nhập lại; không có thì vào thẳng form, khỏi tốn một lượt gọi máy chủ.
      if (!LS.api.hasSession()) { root.innerHTML = authView(); return; }
      restoreSession();
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
  var lastRefresh = 0;
  var refreshSequence = 0;

  function refreshServer(message, silent) {
    if (!U.isGas()) return Promise.resolve();
    var queued = LS.api.queueStatus ? LS.api.queueStatus() : { pending: syncing, epoch: 0 };
    if (queued.pending) { scheduleRefresh(1500); return Promise.resolve(); }
    var sequence = ++refreshSequence, epoch = queued.epoch, session = st().session;
    lastRefresh = Date.now();
    refreshOnClose = false;
    return LS.api.bootstrap().then(function (snapshot) {
      var latest = LS.api.queueStatus ? LS.api.queueStatus() : { pending: syncing, epoch: 0 };
      if (session !== st().session || sequence !== refreshSequence) return;
      if (latest.pending || latest.epoch !== epoch) { scheduleRefresh(1500); return; }
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
  var refreshOnClose = false;

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
    // Hộp thoại vẫn mở: chạy bù ngay khi người dùng đóng nó, thay vì bỏ lượt
    // và để màn hình đứng ở dữ liệu cũ tới khi phải tự tải lại trang.
    if (ui.dialogOpen()) { refreshOnClose = true; return; }
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
      // Mạng rớt sau nhiều lần thử: máy chủ có thể ĐÃ ghi. Hoàn tác rồi để người
      // dùng nhập lại là cách sinh hồ sơ trùng. Giữ nguyên màn hình; lượt tải lại
      // do onUnknownOutcome hẹn sẽ thay bằng dữ liệu thật của máy chủ.
      if (error && error.unknownOutcome) {
        ui.toast((opts.label ? opts.label + ': ' : '') + error.message, 'warn');
        return;
      }
      if (opts.rollback) opts.rollback();
      render();
      ui.toast((opts.label ? opts.label + ' không lưu được: ' : '') +
        (error && error.message ? error.message : 'Máy chủ không phản hồi.'), 'err');
      // Màn hình đã đổi trước khi máy chủ trả lời nên sau lỗi phải lấy lại dữ liệu thật, không để lệch.
      scheduleRefresh(1500);
    });
  }

  /** Nhãn nhỏ cho biết còn bao nhiêu thao tác đang lần lượt lưu. */
  function mountQueueBadge() {
    if (!LS.api.onQueueChange || document.getElementById('queue-badge')) return;
    var badge = document.createElement('div');
    badge.id = 'queue-badge';
    badge.className = 'queue-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    document.body.appendChild(badge);
    // Thao tác chạy ngầm: bình thường không hiện gì. Chỉ hiện khi máy chủ bận phải thử lại, hoặc hàng chờ
    // kéo dài bất thường (hơn QUEUE_SLOW_MS), để người dùng biết còn thao tác chưa tới máy chủ và không đóng trang.
    var QUEUE_SLOW_MS = 8000, slowTimer = null, slow = false, last = { pending: 0, retrying: false };
    function paint() {
      var show = last.pending > 0 && (last.retrying || slow);
      badge.classList.toggle('is-on', show);
      badge.classList.toggle('is-retry', !!last.retrying);
      badge.textContent = last.retrying
        ? 'Đang bận, tự thử lại · ' + last.pending + ' chờ lưu'
        : 'Đang lưu ' + last.pending + ' thao tác…';
    }
    LS.api.onQueueChange(function (s) {
      last = s;
      if (!s.pending) { if (slowTimer) clearTimeout(slowTimer); slowTimer = null; slow = false; }
      else if (!slow && !slowTimer) slowTimer = setTimeout(function () { slowTimer = null; slow = true; paint(); }, QUEUE_SLOW_MS);
      paint();
    });
  }

  return {
    init: init, render: render, download: download, applyConds: applyConds,
    showAssignmentQueue: function () {
      var user = me();
      if (!user || st().mustChangePassword || ['KS_LS', 'QUAN_LY_LS'].indexOf(user.role) === -1) return;
      current = 'queue'; render(); refreshServer(); window.scrollTo(0, 0);
    },
    showActivity: function () { if (current !== 'item-activity') activityReturnScreen = current; current = 'item-activity'; render(); window.scrollTo(0, 0); },
    refreshServer: refreshServer, refreshDashboardClock: refreshDashboardClock, background: background, scheduleRefresh: scheduleRefresh, downloadXlsx: downloadXlsx,
    loadXlsx: loadXlsx, downloadBlob: downloadBlob
  };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', LS.app.init);
else LS.app.init();
