/**
 * core.js — tiện ích dùng chung, bộ biểu tượng, kho dữ liệu.
 * Mọi module khác treo vào đối tượng LS.
 */
var LS = (function () {
  'use strict';

  var STORE_KEY = 'ls_routing_v3';
  var backend = 'BROWSER';

  /* ============================ Chuỗi & thời gian ============================ */

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function attr(v) { return esc(v).replace(/\n/g, ' '); }

  function now() { return new Date().toISOString(); }

  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + '_' + Date.now().toString(36).toUpperCase() + seq.toString(36).toUpperCase();
  }

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? esc(v) : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtTime(v) {
    var d = new Date(v);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDT(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? esc(v) : fmtTime(v) + ' ' + fmtDate(v);
  }

  /** "2 giờ trước", "trong 30 phút" — đọc nhanh hơn dấu thời gian tuyệt đối. */
  function fmtGap(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return m + ' phút';
    var h = Math.round(m / 60);
    if (h < 48) return h + ' giờ';
    return Math.round(h / 24) + ' ngày';
  }

  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[p.length - 2].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
  }

  /** Che bớt số điện thoại / email khi hiển thị trong nhật ký và hàng đợi gửi. */
  function mask(v) {
    v = String(v || '');
    if (!v) return '—';
    if (v.indexOf('@') > 0) {
      var parts = v.split('@');
      return parts[0].slice(0, 2) + '***@' + parts[1];
    }
    return v.length > 6 ? v.slice(0, 3) + '***' + v.slice(-2) : '***';
  }

  function pct(part, total) { return total ? Math.round((part / total) * 100) : null; }

  function byId(list, key, val) {
    for (var i = 0; i < list.length; i++) if (list[i][key] === val) return list[i];
    return null;
  }

  function where(list, fn) { return list.filter(fn); }

  function sum(list, fn) {
    var t = 0;
    list.forEach(function (x) { t += fn(x) || 0; });
    return t;
  }

  /* ============================ Lịch làm việc ============================ */

  function hm(t) {
    var p = String(t || '0:0').split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  function isWorkday(d, cal) {
    if (cal.days.indexOf(d.getDay()) === -1) return false;
    return cal.holidays.indexOf(localDate(d)) === -1;
  }

  function segments(cal) {
    var o = hm(cal.open), c = hm(cal.close);
    if (cal.breakFrom && cal.breakTo) return [[o, hm(cal.breakFrom)], [hm(cal.breakTo), c]];
    return [[o, c]];
  }

  /**
   * Tính số mili-giây làm việc thực tế giữa hai mốc. Không dùng phép trừ
   * Date đơn giản vì hồ sơ có thể chạy qua giờ nghỉ trưa, buổi tối, cuối tuần
   * hoặc ngày lễ. Mốc ngày/giờ được giữ theo múi giờ trình duyệt của ứng dụng
   * (GAS luôn chạy theo Asia/Ho_Chi_Minh).
   */
  function workingMilliseconds(fromIso, toIso, cal) {
    if (!fromIso || !toIso) return null;
    var from = new Date(fromIso), to = new Date(toIso);
    if (!isFinite(from.getTime()) || !isFinite(to.getTime()) || to < from) return null;
    cal = cal || { days: [1, 2, 3, 4, 5], open: '07:30', close: '18:00', breakFrom: '11:30', breakTo: '13:30', holidays: [] };
    var total = 0, cursor = new Date(from.getTime()), guard = 0, segs = segments(cal);
    while (cursor < to && guard++ < 10000) {
      if (!isWorkday(cursor, cal)) {
        cursor.setDate(cursor.getDate() + 1); cursor.setHours(0, 0, 0, 0); continue;
      }
      var dayStart = new Date(cursor.getTime()); dayStart.setHours(0, 0, 0, 0);
      var nextDay = new Date(dayStart.getTime()); nextDay.setDate(nextDay.getDate() + 1);
      var moved = false;
      segs.forEach(function (seg) {
        if (cursor >= to || moved && cursor >= nextDay) return;
        var start = new Date(dayStart.getTime()); start.setMinutes(seg[0]);
        var end = new Date(dayStart.getTime()); end.setMinutes(seg[1]);
        var a = cursor > start ? cursor : start;
        var b = to < end ? to : end;
        if (b > a) total += b.getTime() - a.getTime();
        if (cursor < end) { cursor = new Date(end.getTime()); moved = true; }
      });
      if (cursor < nextDay && cursor < to) { cursor = nextDay; }
    }
    return total;
  }

  function workingHours(fromIso, toIso, cal) {
    var ms = workingMilliseconds(fromIso, toIso, cal);
    return ms === null ? null : Math.round((ms / 3600000) * 10) / 10;
  }

  /**
   * Cộng giờ làm việc thật vào một mốc, bỏ qua ngoài giờ, nghỉ trưa, cuối tuần và ngày lễ.
   * Giao lúc 16h chiều thứ Sáu với SLA 4 giờ phải ra sáng thứ Hai, không phải 20h thứ Sáu.
   */
  function addWorkingHours(startIso, hours, cal) {
    var need = Math.round(Number(hours) * 60);
    var d = new Date(startIso);
    var segs = segments(cal);
    var guard = 0;

    while (need > 0 && guard < 500) {
      guard += 1;
      if (!isWorkday(d, cal)) { d = nextOpen(d, cal); continue; }

      var cur = d.getHours() * 60 + d.getMinutes();
      var moved = false;

      for (var i = 0; i < segs.length; i++) {
        var s = segs[i][0], e = segs[i][1];
        if (cur >= e) continue;
        var from = Math.max(cur, s);
        var avail = e - from;
        if (avail <= 0) continue;

        if (avail >= need) {
          d.setHours(0, from + need, 0, 0);
          return d.toISOString();
        }
        need -= avail;
        cur = e;
        moved = true;
      }

      if (!moved && cur < segs[0][0]) { d.setHours(0, segs[0][0], 0, 0); continue; }
      d = nextOpen(d, cal);
    }
    return d.toISOString();
  }

  function nextOpen(d, cal) {
    var n = new Date(d.getTime());
    n.setDate(n.getDate() + 1);
    n.setHours(0, hm(cal.open), 0, 0);
    return n;
  }

  /** Kỳ báo cáo: tuần bắt đầu thứ Hai theo mặc định, đổi được trong cấu hình. */
  function periodRange(period, from, to, weekStart) {
    var d = new Date();
    if (period === 'custom') {
      return {
        from: new Date((from || localDate()) + 'T00:00:00').getTime(),
        to: new Date((to || localDate()) + 'T23:59:59').getTime()
      };
    }
    var start;
    if (period === 'month') start = new Date(d.getFullYear(), d.getMonth(), 1);
    else if (period === 'quarter') start = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    else if (period === 'year') start = new Date(d.getFullYear(), 0, 1);
    else {
      var first = weekStart === 'SUNDAY' ? 0 : 1;
      var back = (d.getDay() - first + 7) % 7;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    }
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: Date.now() };
  }

  /* ============================ Biểu tượng ============================ */

  var PATHS = {
    inbox: 'M4 13h4l1.5 2.5h5L16 13h4M4 13l2.4-7.4A2 2 0 0 1 8.3 4h7.4a2 2 0 0 1 1.9 1.6L20 13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    clipboard: 'M9 4.5h6v3H9zM9 6H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2',
    shield: 'M12 3 20 6v6c0 4.4-3.2 7.9-8 9-4.8-1.1-8-4.6-8-9V6zM9 12l2 2 4-4',
    briefcase: 'M4 8h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
    chart: 'M3 21h18M7 21V11M12 21V5M17 21v-8',
    sliders: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3M15 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0M11 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0M15 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
    filter: 'M4 5h16l-6.2 7.1v5.8l-3.6 1.8v-7.6z',
    history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v5h5M12 8v4.3l3 1.7',
    search: 'M18 11a7 7 0 1 0-14 0 7 7 0 0 0 14 0M20.5 20.5 16 16',
    plus: 'M12 5v14M5 12h14',
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    check: 'm5 12.5 4.5 4.5L19 7',
    warn: 'M12 3.8 2.6 20h18.8zM12 10v4.2M12 17.4v.2',
    info: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 11.5V16M12 8v.2',
    ban: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M6 6l12 12',
    mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
    chat: 'M21 11.5a8 8 0 0 1-11.7 7.1L4.2 20l1.3-4.6A8 8 0 1 1 21 11.5z',
    send: 'M21.5 3 10.5 14M21.5 3l-7 18-3.9-6.9L3.5 10z',
    bell: 'M18 10.5a6 6 0 0 0-12 0c0 5.5-2 6.5-2 6.5h16s-2-1-2-6.5M10.2 20.2a2.2 2.2 0 0 0 3.6 0',
    users: 'M16 20.5v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M13 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M17 4.3a3.5 3.5 0 0 1 0 6.4M21 20.5v-2a4 4 0 0 0-3-3.9',
    tag: 'M11.2 3.5H4.5a1 1 0 0 0-1 1v6.7a1.5 1.5 0 0 0 .44 1.06l7.8 7.8a1.5 1.5 0 0 0 2.12 0l6.24-6.24a1.5 1.5 0 0 0 0-2.12l-7.8-7.8A1.5 1.5 0 0 0 11.2 3.5zM7.8 7.8v.2',
    calendar: 'M4.5 6h15v14.5h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
    building: 'M4 21V4.8a1 1 0 0 1 1-1h8.6a1 1 0 0 1 1 1V21M14.6 10.5H19a1 1 0 0 1 1 1V21M2.8 21h18.4M7.5 8h3.5M7.5 12h3.5M7.5 16h3.5',
    clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 7.2V12l3.2 1.9',
    download: 'M12 3.5v11M7.6 10.2 12 14.6l4.4-4.4M4 20h16',
    refresh: 'M20.5 12a8.5 8.5 0 1 1-2.7-6.2M19.5 3v4h-4',
    trash: 'M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.2 7l.9 12.1a1 1 0 0 0 1 .9h7.8a1 1 0 0 0 1-.9L17.8 7',
    pencil: 'M4 20.2h4.2L20 8.4 15.8 4.2 4 16zM14.4 5.6l4.2 4.2',
    eye: 'M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off': 'M3 3l18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.2 3.8M6.2 6.2A16.7 16.7 0 0 0 2.5 12S6 18 12 18c1.2 0 2.3-.2 3.3-.6M9.7 9.7a3.2 3.2 0 0 0 4.5 4.5',
    arrow: 'M4 12h14.5M13 6.5l5.5 5.5-5.5 5.5',
    lock: 'M5.5 10.8h13V21h-13zM8.5 10.8V7.6a3.5 3.5 0 0 1 7 0v3.2',
    play: 'M7.5 4.8 19.5 12l-12 7.2z',
    pause: 'M9.5 5v14M15 5v14',
    database: 'M20 6c0 1.66-3.58 3-8 3S4 7.66 4 6s3.58-3 8-3 8 1.34 8 3zM4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3',
    activity: 'M3 12.5h4l2.8 7.2L14 4.5l2.6 8h4.4',
    key: 'M11.5 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0M10.8 12.2 20 3l1.5 1.5-1.6 1.6 1.6 1.6-2.6 2.6-1.6-1.6-2 2',
    keyboard: 'M3.5 6.5h17v11h-17zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8',
    file: 'M6.5 3.5h7l4.5 4.5v12.5h-11.5zM13.5 3.5V8H18',
    zap: 'M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z',
    right: 'm9.5 6 6 6-6 6',
    down: 'm6.5 9.5 5.5 5.5 5.5-5.5',
    link: 'M9.8 14.2 14.2 9.8M11.2 7.4 12.8 5.8a4 4 0 0 1 5.6 5.6l-1.6 1.6M12.8 16.6l-1.6 1.6a4 4 0 0 1-5.6-5.6l1.6-1.6',
    logout: 'M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 8l-4 4 4 4M6 12h9'
  };

  /** icon('mail', 18) → SVG nội tuyến, kế thừa currentColor. */
  function icon(name, size) {
    var d = PATHS[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + d + '"/></svg>';
  }

  /* ============================ Kho dữ liệu ============================ */

  var state = null;

  function load(seedFn) {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.schema === 3 && p.items && p.channels) {
          // Cache local cũ có thể giữ bộ 5 loại việc demo trước đây. Nâng danh mục
          // lên đủ 29 sản phẩm, nhưng vẫn giữ hồ sơ, người dùng và lịch sử đang có.
          var seed = null;
          if (!p.workTypes || !p.workTypes.some(function (w) { return w.code === 'LEGACY_29'; })) {
            seed = seedFn();
            p.workTypes = seed.workTypes || [];
          }
          // Bổ sung danh mục nguồn cho cache cũ mà không xoá dữ liệu nghiệp vụ demo.
          if (!p.catalogOptions) p.catalogOptions = (seed || seedFn()).catalogOptions || [];
          state = p;
          save();
          return state;
        }
      }
    } catch (e) { /* dữ liệu hỏng thì dựng lại từ mẫu */ }
    state = seedFn();
    return state;
  }

  function save() {
    // GAS là nguồn dữ liệu chính; không bao giờ coi cache trình duyệt là bản ghi nghiệp vụ.
    if (backend === 'GAS') return true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  function reset(seedFn) {
    var session = state ? state.session : null;
    state = seedFn();
    if (session && byId(state.users, 'user_id', session)) state.session = session;
    save();
    return state;
  }

  function db() { return state; }
  function replace(next) { state = next; return state; }
  function setBackend(next) { backend = next === 'GAS' ? 'GAS' : 'BROWSER'; }
  function isGas() { return backend === 'GAS'; }

  return {
    STORE_KEY: STORE_KEY,
    esc: esc, attr: attr, now: now, localDate: localDate, pad: pad, uid: uid,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtDT: fmtDT, fmtGap: fmtGap,
    initials: initials, mask: mask, pct: pct, byId: byId, where: where, sum: sum,
    addWorkingHours: addWorkingHours, workingMilliseconds: workingMilliseconds, workingHours: workingHours,
    isWorkday: isWorkday, periodRange: periodRange,
    icon: icon,
    load: load, save: save, reset: reset, db: db,
    replace: replace, setBackend: setBackend, isGas: isGas
  };
})();
