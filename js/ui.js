/**
 * ui.js — thành phần giao diện dùng lại.
 * Trả về chuỗi HTML đã thoát ký tự; chỉ hộp thoại và thông báo nổi chạm DOM.
 */
LS.ui = (function () {
  'use strict';

  var U = LS;
  var el = {};

  function bind() {
    el.scrim = document.getElementById('scrim');
    el.dialog = document.getElementById('dialog');
    el.title = document.getElementById('dlgTitle');
    el.sub = document.getElementById('dlgSub');
    el.body = document.getElementById('dlgBody');
    el.toasts = document.getElementById('toasts');
  }

  /* ---------------------------- Nhãn & số liệu ---------------------------- */

  function tag(text, tone, dot) {
    return '<span class="tag tag-' + (tone || 'neutral') + '">' +
      (dot ? '<i></i>' : '') + U.esc(text) + '</span>';
  }

  function statusTag(code) {
    var d = LS.domain;
    return tag(d.label(code), d.tone(code), true);
  }

  /** value === null nghĩa là chưa có dữ liệu — không hiện 0 hay 0%. */
  function metric(label, value, tone, sub) {
    var none = value === null || value === undefined;
    return '<div>' +
      '<div class="metric-k">' + U.esc(label) + '</div>' +
      '<div class="metric-v ' + (none ? 'none' : (tone || '')) + '">' + (none ? 'Chưa có dữ liệu' : U.esc(value)) + '</div>' +
      (sub ? '<div class="metric-sub">' + U.esc(sub) + '</div>' : '') +
      '</div>';
  }

  function strip(cells) { return '<div class="strip">' + cells.join('') + '</div>'; }

  /* ---------------------------- Khối ---------------------------- */

  function block(opts) {
    return '<section class="block">' +
      (opts.title ? '<div class="block-bar' + (opts.compact ? ' block-bar-compact' : '') + '">' +
        '<h2>' + (opts.icon ? U.icon(opts.icon, 16) : '') + U.esc(opts.title) +
        (opts.count !== undefined ? ' <span class="count">' + U.esc(opts.count) + '</span>' : '') + '</h2>' +
        (opts.actions ? '<div class="btn-row spacer">' + opts.actions + '</div>' : '') +
        '</div>' : '') +
      (opts.note ? '<div class="block-note">' + opts.note + '</div>' : '') +
      (opts.filters ? '<div class="filters">' + opts.filters + '</div>' : '') +
      opts.body +
      '</section>';
  }

  function pad(html) { return '<div class="block-pad">' + html + '</div>'; }

  function sectionTitle(t) { return '<div class="section-title">' + U.esc(t) + '</div>'; }

  /* ---------------------------- Bảng ---------------------------- */

  /**
   * cols: [{ key, label, cls }], rows: [{ cells:[html], cls }]
   * Rỗng thì hiện một trạng thái rỗng có hướng dẫn, không phải dòng "không có dữ liệu".
   */
  function table(cols, rows, emptyOpts) {
    if (!rows.length) return empty(emptyOpts || {});
    return '<div class="tw"><table class="t"><thead><tr>' +
      cols.map(function (c) { return '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.header !== undefined ? c.header : U.esc(c.label || '')) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + (r.attrs || '') + '>' +
          r.cells.map(function (cell, i) {
            var c = cols[i] || {};
            // data-label cấp nhãn cột cho bảng thẻ trên mobile (::before lấy attr này khi thead ẩn đi).
            var label = c.label ? ' data-label="' + U.attr(c.label) + '"' : '';
            var cls = (c.cls || '') + (c.mobile === false ? ' cell-hide-mobile' : '');
            return '<td' + (cls ? ' class="' + cls.trim() + '"' : '') + label + '>' + cell + '</td>';
          }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function empty(o) {
    return '<div class="empty">' + U.icon(o.icon || 'inbox', 34) +
      '<b>' + U.esc(o.title || 'Chưa có dữ liệu') + '</b>' +
      '<span>' + U.esc(o.text || '') + '</span>' +
      (o.action || '') + '</div>';
  }

  function banner(kind, title, text, iconName) {
    return '<div class="banner banner-' + kind + '">' +
      U.icon(iconName || (kind === 'danger' ? 'warn' : kind === 'warn' ? 'warn' : kind === 'ok' ? 'check' : 'info'), 17) +
      '<div><b>' + U.esc(title) + '</b>' + (text ? '<p>' + U.esc(text) + '</p>' : '') + '</div></div>';
  }

  function kv(pairs) {
    return '<dl class="kv">' + pairs.map(function (p) {
      return '<div><dt>' + U.esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : U.esc(p[1] || '—')) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function timeline(items) {
    if (!items.length) return '<p class="t2">Chưa có sự kiện nào.</p>';
    return '<div class="tl">' + items.map(function (i) {
      return '<div class="tl-item"><div class="tl-head"><b>' + U.esc(i.title) + '</b><time>' + U.esc(i.time) + '</time></div>' +
        '<div class="tl-body">' + U.esc(i.text) + '</div></div>';
    }).join('') + '</div>';
  }

  function bar(value, max, hot) {
    var w = max ? Math.round((value / max) * 100) : 0;
    return '<div class="bar"><i class="' + (hot ? 'hot' : '') + '" style="width:' + w + '%"></i></div>';
  }

  /* ---------------------------- Trường nhập ---------------------------- */

  function field(label, control, hint, err) {
    return '<div class="f"><label>' + U.esc(label) +
      (hint ? ' <span class="hint">' + U.esc(hint) + '</span>' : '') + '</label>' +
      control + (err ? '<span class="err">' + U.esc(err) + '</span>' : '') + '</div>';
  }

  function input(name, value, o) {
    o = o || {};
    return '<input class="input" name="' + U.attr(name) + '" value="' + U.attr(value || '') + '"' +
      (o.type ? ' type="' + o.type + '"' : '') +
      (o.placeholder ? ' placeholder="' + U.attr(o.placeholder) + '"' : '') +
      (o.required ? ' required' : '') + (o.disabled ? ' disabled' : '') +
      (o.min !== undefined ? ' min="' + o.min + '"' : '') + (o.max !== undefined ? ' max="' + o.max + '"' : '') +
      (o.id ? ' id="' + o.id + '"' : '') + (o.attrs || '') + '>';
  }

  function textarea(name, value, o) {
    o = o || {};
    return '<textarea class="textarea" name="' + U.attr(name) + '"' +
      (o.placeholder ? ' placeholder="' + U.attr(o.placeholder) + '"' : '') +
      (o.required ? ' required' : '') + (o.id ? ' id="' + o.id + '"' : '') +
      (o.attrs || '') + '>' + U.esc(value || '') + '</textarea>';
  }

  /** options: [[value, label], …] */
  function select(name, options, value, o) {
    o = o || {};
    return '<select class="select" name="' + U.attr(name) + '"' +
      (o.id ? ' id="' + o.id + '"' : '') + (o.disabled ? ' disabled' : '') + (o.attrs || '') + '>' +
      (o.blank ? '<option value="">' + U.esc(o.blank) + '</option>' : '') +
      options.map(function (op) {
        return '<option value="' + U.attr(op[0]) + '"' + (String(op[0]) === String(value) ? ' selected' : '') + '>' +
          U.esc(op[1]) + '</option>';
      }).join('') + '</select>';
  }

  function switchBox(name, on, label, o) {
    o = o || {};
    return '<label class="switch">' +
      '<input type="checkbox" name="' + U.attr(name) + '"' + (on ? ' checked' : '') +
      (o.disabled ? ' disabled' : '') + (o.attrs || '') + '>' +
      '<span class="track"></span>' +
      (label ? '<span class="lbl">' + U.esc(label) + '</span>' : '') + '</label>';
  }

  function checkbox(name, on, label, hint) {
    return '<label class="check"><input type="checkbox" name="' + U.attr(name) + '"' + (on ? ' checked' : '') + '>' +
      '<span>' + U.esc(label) + (hint ? '<span class="hint">' + U.esc(hint) + '</span>' : '') + '</span></label>';
  }

  function search(value, placeholder) {
    return '<div class="search">' + U.icon('search', 16) +
      '<input class="input" id="fq" data-filter="q" value="' + U.attr(value) + '" placeholder="' + U.attr(placeholder) + '" aria-label="Tìm kiếm">' +
      '</div>';
  }

  function btn(label, o) {
    o = o || {};
    return '<button type="' + (o.type || 'button') + '" class="btn btn-' + (o.kind || 'line') + (o.sm ? ' btn-sm' : '') + '"' +
      (o.act ? ' data-act="' + U.attr(o.act) + '"' : '') +
      (o.data || '') + (o.disabled ? ' disabled' : '') +
      (o.title ? ' title="' + U.attr(o.title) + '"' : '') + '>' +
      (o.icon ? U.icon(o.icon, o.sm ? 14 : 16) : '') + U.esc(label) + '</button>';
  }

  function iconBtn(iconName, o) {
    o = o || {};
    return '<button type="button" class="btn btn-' + (o.kind || 'quiet') + ' btn-icon"' +
      (o.act ? ' data-act="' + U.attr(o.act) + '"' : '') + (o.data || '') +
      ' aria-label="' + U.attr(o.label || '') + '" title="' + U.attr(o.label || '') + '">' +
      U.icon(iconName, 16) + '</button>';
  }

  function formEnd(okLabel, o) {
    o = o || {};
    return '<div class="form-end">' +
      btn('Hủy', { act: 'close-dialog', kind: 'quiet' }) +
      btn(okLabel, { type: 'submit', kind: o.danger ? 'danger' : 'primary', disabled: o.disabled }) +
      '</div>';
  }

  /* ---------------------------- Hộp thoại ---------------------------- */

  var lastFocus = null;
  var closeHooks = [];

  /** Gọi lại mỗi khi hộp thoại đóng — để lượt tải lại bị hoãn được chạy bù. */
  function onDialogClose(fn) { closeHooks.push(fn); }

  function openDialog(title, body, o) {
    o = o || {};
    lastFocus = document.activeElement;
    el.title.textContent = title;
    el.sub.textContent = o.sub || '';
    el.sub.style.display = o.sub ? '' : 'none';
    el.body.innerHTML = body;
    el.dialog.className = 'dialog' + (o.size ? ' ' + o.size : '');
    el.scrim.classList.add('on');
    var first = el.body.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button');
    if (first) first.focus();
  }

  function closeDialog() {
    if (!el.scrim.classList.contains('on')) return;
    el.scrim.classList.remove('on');
    el.body.innerHTML = '';
    el.title.textContent = '';
    el.sub.textContent = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    closeHooks.forEach(function (fn) { try { fn(); } catch (ignore) { /* không chặn việc đóng */ } });
  }

  function dialogOpen() { return el.scrim.classList.contains('on'); }

  /** Giữ tiêu điểm bàn phím trong hộp thoại. */
  function trapTab(ev) {
    if (!dialogOpen() || ev.key !== 'Tab') return;
    var f = el.dialog.querySelectorAll('button, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function confirm(o) {
    openDialog(o.title,
      '<form data-form="confirm">' +
      banner(o.danger ? 'danger' : 'warn', o.heading || 'Xác nhận thao tác', o.text) +
      (o.detail ? '<div style="margin-top:.875rem">' + o.detail + '</div>' : '') +
      formEnd(o.ok || 'Xác nhận', { danger: o.danger }) + '</form>',
      { sub: o.sub });
    pendingConfirm = o.run;
  }

  var pendingConfirm = null;
  function runConfirm() {
    var fn = pendingConfirm;
    pendingConfirm = null;
    closeDialog();
    if (fn) fn();
  }

  /* ---------------------------- Thông báo nổi ---------------------------- */

  function toast(msg, kind) {
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || 'ok');
    d.innerHTML = U.icon(kind === 'err' ? 'ban' : kind === 'warn' ? 'warn' : 'check', 17) +
      '<span>' + U.esc(msg) + '</span>';
    el.toasts.appendChild(d);
    setTimeout(function () {
      d.style.opacity = '0';
      setTimeout(function () { d.remove(); }, 200);
    }, 3400);
  }

  return {
    bind: bind, tag: tag, statusTag: statusTag, metric: metric, strip: strip,
    block: block, pad: pad, sectionTitle: sectionTitle, table: table, empty: empty,
    banner: banner, kv: kv, timeline: timeline, bar: bar,
    field: field, input: input, textarea: textarea, select: select,
    switchBox: switchBox, checkbox: checkbox, search: search,
    btn: btn, iconBtn: iconBtn, formEnd: formEnd,
    openDialog: openDialog, closeDialog: closeDialog, dialogOpen: dialogOpen, onDialogClose: onDialogClose,
    trapTab: trapTab, confirm: confirm, runConfirm: runConfirm, toast: toast
  };
})();
