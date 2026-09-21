/**
 * screens.js — các màn hình vận hành: việc đã gửi, hàng chờ, việc của tôi, điều hành.
 * Kèm hộp thoại chi tiết việc, sửa việc, chuyển trạng thái và đăng ký việc mới.
 */
LS.screens = (function () {
  'use strict';

  var U = LS, D = LS.domain, ui = LS.ui;
  var filters = {};
  var filterDraft = null;

  function st() { return U.db(); }
  function me() { return st().session ? U.byId(st().users, 'user_id', st().session) : null; }
  function reqOf(i) { return U.byId(st().requests, 'request_id', i.request_id); }
  function wtOf(i) { return U.byId(st().workTypes, 'code', i.work_type_code); }
  function userName(id) { var u = U.byId(st().users, 'user_id', id); return u ? u.full_name : ''; }
  function itemRef(i) { return i.source_stt || i.item_id; }

  /** Nhãn đọc được cho một việc: mã, khách hàng, loại việc. */
  function itemLabel(i) {
    var r = reqOf(i);
    return itemRef(i) + ' · ' + (r ? r.customer.name : '') + ' · ' + wtName(i.work_type_code);
  }
  function unitName(id) { var u = U.byId(st().units, 'unit_id', id); return u ? u.name : id; }
  /* Quản trị không nhận tên sản phẩm của khách; nói rõ là đã ẩn thay vì để ô trống. */
  function productLabel(i) {
    if (i.product_name) return i.product_name;
    var u = me();
    return u && u.role === 'ADMIN' ? 'Ẩn với quản trị' : '—';
  }
  function wtName(c) { var w = U.byId(st().workTypes, 'code', c); return w ? w.name : c; }
  function wtGroup(c) { var w = U.byId(st().workTypes, 'code', c); return w ? (w.group || w.name) : c; }
  function wtLabel(w) { return w ? ((w.group ? w.group + ' · ' : '') + w.name) : ''; }

  function priorityFlags(customer) { return (customer && customer.priority_flags) || []; }
  function priorityTags(customer) {
    var labels = { VIP: ['VIP', 'gold'], QUAN_TRONG: ['Quan trọng', 'info'], XU_LY_GAP: ['Xử lý gấp', 'danger'] };
    return priorityFlags(customer).map(function (x) { return labels[x] ? ui.tag(labels[x][0], labels[x][1]) : ''; }).join(' ');
  }

  function priorityRowClass(item) {
    var r = reqOf(item), flags = priorityFlags(r && r.customer), out = [];
    // Khi có nhiều cờ, nền dòng theo mức cần xử lý cao nhất; các nhãn vẫn hiện đủ.
    if (flags.indexOf('XU_LY_GAP') !== -1) out.push('priority-urgent');
    else if (flags.indexOf('VIP') !== -1) out.push('priority-vip');
    else if (flags.indexOf('QUAN_TRONG') !== -1) out.push('priority-important');
    return out.join(' ');
  }

  function contactCell(r) {
    if (!r || !r.customer) return ui.tag('Chưa có liên hệ', 'neutral');
    var c = r.customer, links = [];
    if (c.phone) links.push('<a class="contact-link" href="tel:' + U.attr(c.phone) + '"><span class="contact-label">SĐT</span>' + U.esc(c.phone) + '</a>');
    if (c.email) links.push('<a class="contact-link" href="mailto:' + U.attr(c.email) + '"><span class="contact-label">Email</span>' + U.esc(c.email) + '</a>');
    return links.length ? '<div class="contact-stack">' + links.join('') + '</div>' : ui.tag('Chưa có liên hệ', 'neutral');
  }

  /* ============================ Phạm vi dữ liệu ============================ */

  function visibleItems() {
    var u = me();
    if (!u) return [];
    if (u.role === 'PHONG_PGD') {
      return st().items.filter(function (i) { var r = reqOf(i); return r && r.unit_id === u.unit_id; });
    }
    if (u.role === 'CAN_BO_LS') {
      return st().items.filter(function (i) { return i.assigned_user_id === u.user_id; });
    }
    return st().items.slice();
  }

  function visibleEvents() {
    var u = me();
    if (u && u.role === 'CAN_BO_LS') {
      return st().events.filter(function (e) { return e.by === u.user_id; });
    }
    var ids = {};
    visibleItems().forEach(function (i) { ids[i.item_id] = true; });
    return st().events.filter(function (e) { return ids[e.item_id]; });
  }

  function staffList(includeUnavailable) {
    return st().users.filter(function (u) {
      return D.userAvailable(u) || (includeUnavailable && u.role === 'CAN_BO_LS' && u.active);
    });
  }

  function reportRange() {
    var period = f('board', 'period', 'day');
    var anchor = f('board', 'anchor', U.localDate());
    var from = f('board', 'from', anchor);
    var to = f('board', 'to', anchor);
    var d = new Date((anchor || U.localDate()) + 'T00:00:00');
    var start = new Date(d.getTime()), end = new Date(d.getTime());
    if (period === 'week') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      end = new Date(start.getTime()); end.setDate(end.getDate() + 6);
    } else if (period === 'month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1); end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    } else if (period === 'year') {
      start = new Date(d.getFullYear(), 0, 1); end = new Date(d.getFullYear(), 11, 31);
    } else if (period === 'range') {
      start = new Date((from || anchor) + 'T00:00:00'); end = new Date((to || from || anchor) + 'T00:00:00');
    }
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    return { period: period, from: start.getTime(), to: end.getTime(), fromDate: U.localDate(start), toDate: U.localDate(end) };
  }

  function inRange(value, range) {
    if (!value) return false;
    var t = new Date(value).getTime();
    return t >= range.from && t <= range.to;
  }

  function elapsedHours(from, to) {
    if (!from || !to) return null;
    var a = new Date(from).getTime(), b = new Date(to).getTime();
    return isFinite(a) && isFinite(b) && b >= a ? (b - a) / 3600000 : null;
  }

  /** Báo cáo xuyên kỳ: giao, hoàn thành, tồn, quá hạn và thời gian xử lý từng cán bộ. */
  function performanceReport(range) {
    var all = visibleItems(), events = visibleEvents();
    var workload = D.staffWorkloadByGroup(all, st(), range.fromDate, range.toDate);
    var rows = staffList(true).map(function (u) {
      var mine = all.filter(function (i) { return i.assigned_user_id === u.user_id; });
      var assigned = mine.filter(function (i) { return inRange(i.assigned_at || i.accepted_at || i.submitted_at, range); });
      var received = mine.filter(function (i) { return inRange(i.accepted_at, range); });
      var done = mine.filter(function (i) { return inRange(i.completed_at, range); });
      var open = mine.filter(function (i) { return D.STATUS[i.status].open; });
      var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
      var hours = done.map(function (i) {
        return elapsedHours(i.assigned_at, i.completed_at);
      }).filter(function (x) { return x !== null; });
      var receiveHours = received.map(function (i) { return elapsedHours(i.submitted_at, i.accepted_at); }).filter(function (x) { return x !== null; });
      var totalHours = done.map(function (i) { return elapsedHours(i.submitted_at, i.completed_at); }).filter(function (x) { return x !== null; });
      var onTime = done.filter(function (i) { return i.due_at && new Date(i.completed_at) <= new Date(i.due_at); }).length;
      var touched = {};
      events.forEach(function (e) { if (e.by === u.user_id && inRange(e.at, range)) touched[e.item_id] = true; });
      var workloadRow = workload.rows.filter(function (x) { return x.user.user_id === u.user_id; })[0] || { byGroup: {}, total: 0 };
      return { user: u, assigned: assigned.length, done: done.length, open: open.length, late: late.length,
        touched: Object.keys(touched).length, avgHours: hours.length ? hours.reduce(function (a, b) { return a + b; }, 0) / hours.length : null,
        avgReceiveHours: receiveHours.length ? receiveHours.reduce(function (a, b) { return a + b; }, 0) / receiveHours.length : null,
        avgTotalHours: totalHours.length ? totalHours.reduce(function (a, b) { return a + b; }, 0) / totalHours.length : null,
        maxHours: hours.length ? Math.max.apply(null, hours) : null, onTime: done.length ? Math.round(onTime * 100 / done.length) : null,
        byGroup: workloadRow.byGroup, workloadTotal: workloadRow.total };
    });
    return { range: range, rows: rows,
      assigned: rows.reduce(function (n, x) { return n + x.assigned; }, 0), done: rows.reduce(function (n, x) { return n + x.done; }, 0),
      open: rows.reduce(function (n, x) { return n + x.open; }, 0), late: rows.reduce(function (n, x) { return n + x.late; }, 0),
      avgReceiveHours: rows.filter(function (x) { return x.avgReceiveHours !== null; }).reduce(function (sum, x, _, a) { return sum + x.avgReceiveHours / a.length; }, 0) || null,
      avgTotalHours: rows.filter(function (x) { return x.avgTotalHours !== null; }).reduce(function (sum, x, _, a) { return sum + x.avgTotalHours / a.length; }, 0) || null,
      workload: workload };
  }

  function reportLabel(range) {
    return range.fromDate === range.toDate ? U.fmtDate(range.fromDate) : U.fmtDate(range.fromDate) + ' → ' + U.fmtDate(range.toDate);
  }

  function dashboardTabs(active) {
    var tabs = [
      ['report', 'Kết quả thực hiện', 'chart'],
      ['type', 'Theo loại việc', 'activity'],
      ['staff', 'Theo cán bộ', 'users'],
      ['unit', 'Theo đơn vị gửi', 'building'],
      ['status', 'Phân bố trạng thái', 'activity'],
      ['late', 'Việc quá hạn', 'clock']
    ];
    return '<nav class="dashboard-tabs" aria-label="Các phần tổng hợp" role="tablist">' + tabs.map(function (x) {
      return '<button type="button" class="dashboard-tab' + (active === x[0] ? ' is-active' : '') + '" data-act="board-tab" data-tab="' + U.attr(x[0]) + '" role="tab" aria-selected="' + (active === x[0] ? 'true' : 'false') + '">' + U.icon(x[2], 15) + '<span>' + U.esc(x[1]) + '</span></button>';
    }).join('') + '</nav>';
  }

  function dailyResultBlock(report, active) {
    var range = report.range;
    var options = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng'], ['year', 'Năm'], ['range', 'Khoảng ngày']];
    var period = filterValue('board', 'period', range.period);
    var isRange = period === 'range';

    // Khoảng ngày thì không cần mốc, và ngược lại — không hiện cả hai cùng lúc.
    var filtersHtml = '<div class="report-filters">' +
      ui.field('Kỳ', ui.select('', options, period, { attrs: draftAttrs('board', 'period') })) +
      (isRange
        ? ui.field('Từ', ui.input('', filterValue('board', 'from', range.fromDate), { type: 'date', attrs: draftAttrs('board', 'from') })) +
          ui.field('Đến', ui.input('', filterValue('board', 'to', range.toDate), { type: 'date', attrs: draftAttrs('board', 'to') }))
        : ui.field(period === 'day' ? 'Ngày' : 'Trong', ui.input('', filterValue('board', 'anchor', U.localDate()), { type: 'date', attrs: draftAttrs('board', 'anchor') }))) +
      '<span class="report-range-note">' + U.esc(reportLabel(range)) + '</span>' +
      '<div class="report-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-act="apply-report">' + U.icon('search', 15) + ' Xem</button>' +
      ui.btn('Tải ảnh', { act: 'download-daily-image', icon: 'download', sm: true, title: 'Tải ảnh PNG vùng kết quả đang xem' }) +
      '</div></div>';
    var body = dashboardTabs(active) + (active === 'report' ? ui.strip([ui.metric('Đã phân công', report.assigned), ui.metric('Hoàn thành kỳ', report.done, 'ok'), ui.metric('Đang mở', report.open, 'info'), ui.metric('Quá hạn', report.late, report.late ? 'danger' : ''), ui.metric('Nhận hồ sơ TB', report.avgReceiveHours === null ? '—' : report.avgReceiveHours.toFixed(1) + 'h'), ui.metric('Toàn trình TB', report.avgTotalHours === null ? '—' : report.avgTotalHours.toFixed(1) + 'h')]) +
      ui.table(
        [{ label: 'Cán bộ LS' }, { label: 'Đã giao', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'TB nhận (giờ)', cls: 'num' }, { label: 'TB xử lý (giờ)', cls: 'num' }, { label: 'TB toàn trình (giờ)', cls: 'num' }, { label: 'Đúng hạn', cls: 'num' }],
        report.rows.map(function (x) { return { cls: x.late ? 'flag' : '', cells: [
          '<div class="t1">' + U.esc(x.user.full_name) + '</div><div class="t2">' + U.esc(unitName(x.user.unit_id)) + (D.userOff(x.user) ? ' · ' + U.esc('Đang nghỉ') : '') + '</div>',
          '<span class="tid">' + x.assigned + '</span>', '<span class="tid">' + x.done + '</span>', '<span class="tid">' + x.open + '</span>',
          x.late ? ui.tag(String(x.late), 'danger') : '<span class="tid">0</span>', x.avgReceiveHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + x.avgReceiveHours.toFixed(1) + '</span>', x.avgHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + x.avgHours.toFixed(1) + '</span>',
          x.avgTotalHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + x.avgTotalHours.toFixed(1) + '</span>',
          x.onTime === null ? '<span class="t2">—</span>' : '<span class="tid">' + x.onTime + '%</span>'
        ] }; }),
        { icon: 'users', title: 'Chưa có dữ liệu cán bộ LS', text: 'Chọn kỳ khác hoặc thêm cán bộ trong Quản trị hệ thống.' }
      ) + (report.workload && report.workload.groups.length ? '<div style="margin-top:1rem">' + ui.sectionTitle('Số lượng theo cán bộ và nhóm việc') +
        '<p class="t2">Đếm toàn bộ việc phát sinh trong kỳ, kể cả cán bộ chưa có việc; không tự chuyển các việc đang mở khi cán bộ nghỉ.</p>' +
        ui.table([{ label: 'Cán bộ LS' }].concat(report.workload.groups.map(function (g) { return { label: g, cls: 'num' }; })).concat([{ label: 'Tổng', cls: 'num' }]),
          report.workload.rows.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.user.full_name) + '</div>'].concat(report.workload.groups.map(function (g) { return '<span class="tid">' + Number(x.byGroup[g] || 0) + '</span>'; })).concat(['<span class="tid">' + x.total + '</span>']) }; }),
          { icon: 'users', title: 'Chưa có cán bộ LS', text: 'Thêm cán bộ trong Quản trị hệ thống.' }) + '</div>' : '') : '');
    return ui.block({
      title: 'Kết quả thực hiện', icon: 'chart',
      filters: filtersHtml,
      body: body
    });
  }

  function typeSummaryBlock(range) {
    var items = visibleItems().filter(function (i) { return inRange(i.occurrence_date + 'T12:00:00', range); });
    var rows = st().workTypes.map(function (w) {
      var mine = items.filter(function (i) { return i.work_type_code === w.code; });
      var done = mine.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length;
      var open = mine.filter(function (i) { return D.STATUS[i.status].open; }).length;
      var late = mine.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length;
      return { n: mine.length, cells: [
        '<div class="t1">' + U.esc(w.name) + '</div>', '<span class="tid">' + mine.length + '</span>',
        '<span class="tid">' + mine.filter(function (i) { return !!i.assigned_user_id; }).length + '</span>',
        '<span class="tid">' + open + '</span>', '<span class="tid">' + done + '</span>',
        late ? ui.tag(String(late), 'danger') : '<span class="tid">0</span>'
      ] };
    }).filter(function (x) { return x.n; });
    return ui.block({ title: 'Tổng hợp theo loại việc', icon: 'activity', note: 'Số liệu theo ngày phát sinh trong kỳ đã chọn.', body: ui.table(
      [{ label: 'Loại việc' }, { label: 'Phát sinh', cls: 'num' }, { label: 'Đã phân công', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }], rows,
      { icon: 'activity', title: 'Chưa có hồ sơ trong kỳ', text: 'Chọn kỳ khác rồi bấm Tìm kiếm.' }) });
  }

  /** Dải số liệu gọn trên thanh đầu; không lặp lại trong thân màn hình. */
  function headerSummary(screen) {
    var all = visibleItems();
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    var done = all.filter(function (i) { return i.status === 'HOAN_THANH_LS'; });
    if (screen === 'work') {
      return ui.strip([ui.metric('Đang mở', open.length), ui.metric('Cần bổ sung', all.filter(function (i) { return i.status === 'CAN_BO_SUNG'; }).length, 'danger'), ui.metric('Quá hạn', late.length, late.length ? 'warn' : ''), ui.metric('Hoàn thành', done.length, 'ok')]);
    }
    if (screen === 'queue') {
      var review = all.filter(function (i) { return i.status === 'CHO_KS_DUYET'; });
      var running = all.filter(function (i) { return ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'].indexOf(i.status) !== -1; });
      return ui.strip([ui.metric('Chờ tiếp nhận', all.filter(function (i) { return i.status === 'CHO_TIEP_NHAN' || i.status === 'CAN_BO_SUNG'; }).length, 'warn'), ui.metric('Chờ phân công', all.filter(function (i) { return i.status === 'CHO_PHAN_CONG'; }).length, 'warn'), ui.metric('Chờ duyệt', review.length, review.length ? 'info' : ''), ui.metric('Đang xử lý', running.length, 'info'), ui.metric('Quá hạn', late.length, late.length ? 'danger' : '')]);
    }
    if (screen === 'mine') {
      var fresh = all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; });
      return ui.strip([ui.metric('Việc đang mở', open.length), ui.metric('Chưa bắt đầu', fresh.length, fresh.length ? 'warn' : ''), ui.metric('Quá hạn', late.length, late.length ? 'danger' : ''), ui.metric('Hoàn thành', done.length, 'ok')]);
    }
    if (screen === 'room' || screen === 'room-board') {
      var current = roomItems();
      return ui.strip([ui.metric('Hồ sơ phòng', all.length), ui.metric('Trong kỳ', current.length, 'info'), ui.metric('Đang mở', current.filter(function (i) { return D.STATUS[i.status].open; }).length), ui.metric('Hoàn thành', done.length, 'ok')]);
    }
    if (screen === 'board') {
      var customers = {};
      all.forEach(function (i) { var r = reqOf(i); if (r) customers[r.customer.cif || r.request_id] = true; });
      var onTime = U.pct(done.filter(function (i) { return i.due_at && i.completed_at && new Date(i.completed_at) <= new Date(i.due_at); }).length, done.length);
      return ui.strip([ui.metric('Khách duy nhất', Object.keys(customers).length), ui.metric('Việc đang mở', open.length, 'info'), ui.metric('Quá hạn', late.length, late.length ? 'danger' : ''), ui.metric('Hoàn thành đúng hạn', onTime === null ? null : onTime + '%', 'ok')]);
    }
    return '';
  }

  /** Tạo ảnh PNG độc lập của vùng kết quả ngày; không mở màn in/PDF. */
  function downloadDailyImage() {
    var range = reportRange();
    var report = performanceReport(range);
    var width = 1200, rowHeight = 58, left = 50, tableWidth = 1100;
    var height = Math.max(650, 360 + report.rows.length * rowHeight + 72);
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) { ui.toast('Trình duyệt không hỗ trợ tạo ảnh báo cáo.', 'err'); return; }

    function box(x, y, w, h, fill, stroke) {
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }
    function text(value, x, y, font, color, align) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(String(value), x, y);
    }
    function crop(value, max) {
      value = String(value);
      return value.length > max ? value.slice(0, max - 1) + '…' : value;
    }

    box(0, 0, width, height, '#f8fafc');
    box(0, 0, width, 118, '#0f766e');
    text('KẾT QUẢ THỰC HIỆN — LS', left, 50, '700 28px Arial, sans-serif', '#ffffff');
    text('Kỳ báo cáo: ' + reportLabel(range) + ' · Phạm vi: toàn bộ cán bộ LS', left, 82, '400 17px Arial, sans-serif', '#d1fae5');

    var metrics = [
      ['Cán bộ LS', report.rows.length], ['Đã phân công', report.assigned],
      ['Hoàn thành kỳ', report.done], ['Đang mở hiện tại', report.open]
    ];
    metrics.forEach(function (m, index) {
      var x = left + index * 273;
      box(x, 146, 250, 92, '#ffffff', '#cbd5e1');
      text(m[1], x + 18, 190, '700 32px Arial, sans-serif', '#0f766e');
      text(m[0], x + 18, 218, '400 14px Arial, sans-serif', '#64748b');
    });

    var cols = [300, 160, 160, 160, 160, 160];
    var headers = ['Cán bộ LS', 'Đã giao', 'Hoàn thành', 'Đang mở', 'Quá hạn', 'TB giờ'];
    box(left, 270, tableWidth, 42, '#155e75');
    var cursor = left;
    headers.forEach(function (h, index) {
      text(h, index ? cursor + cols[index] / 2 : cursor + 14, 297, '700 14px Arial, sans-serif', '#ffffff', index ? 'center' : 'left');
      cursor += cols[index];
    });

    report.rows.forEach(function (row, index) {
      var y = 312 + index * rowHeight;
      box(left, y, tableWidth, rowHeight, index % 2 ? '#f8fafc' : '#ffffff', '#dbe3ea');
      var result = row.avgHours === null ? '—' : row.avgHours.toFixed(1);
      text(crop(row.user.full_name, 33), left + 14, y + 36, '600 16px Arial, sans-serif', '#172033');
      text(row.assigned, left + cols[0] + cols[1] / 2, y + 36, '600 16px Arial, sans-serif', '#172033', 'center');
      text(row.done, left + cols[0] + cols[1] + cols[2] / 2, y + 36, '600 16px Arial, sans-serif', '#172033', 'center');
      text(row.open, left + cols[0] + cols[1] + cols[2] + cols[3] / 2, y + 36, '600 16px Arial, sans-serif', '#172033', 'center');
      text(row.late, left + cols[0] + cols[1] + cols[2] + cols[3] + cols[4] / 2, y + 36, '600 16px Arial, sans-serif', row.late ? '#b91c1c' : '#172033', 'center');
      text(result, left + tableWidth - cols[5] / 2, y + 36, '600 15px Arial, sans-serif', '#047857', 'center');
    });

    text('Nguồn: Hệ thống hỗ trợ tín dụng LS · Xuất lúc ' + U.fmtDT(U.now()), left, height - 26, '400 13px Arial, sans-serif', '#64748b');
    var link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'ket_qua_LS_' + range.fromDate + '_' + range.toDate + '.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    ui.toast('Đã tải ảnh kết quả kỳ ' + reportLabel(range) + '.');
  }

  function openLoad(userId) {
    return st().items.filter(function (i) {
      return i.assigned_user_id === userId && D.STATUS[i.status].open;
    }).length;
  }

  function staffLoad(userId) {
    var mine = st().items.filter(function (i) { return i.assigned_user_id === userId; });
    var open = mine.filter(function (i) { return D.STATUS[i.status].open; });
    return {
      open: open.length,
      late: open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length,
      done: mine.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length
    };
  }

  function assignmentRules() {
    return (st().catalogOptions || []).filter(function (x) {
      return x.catalog_key === 'ASSIGNMENT_RULE' && x.active;
    }).map(function (x) {
      var m = x.metadata || {};
      return { id: x.option_id, unit_id: m.unit_id || x.unit_id || '', work_type_code: m.work_type_code || x.code || '',
        product_name: m.product_name || '', assignee_id: m.assignee_id || x.role_kind || '', priority: Number(m.priority || x.sort_order || 9999), label: x.label || '' };
    });
  }

  function assignmentRecommendation(item) {
    var r = reqOf(item), rules = assignmentRules(), unitId = r ? r.unit_id : '';
    var matched = rules.filter(function (x) {
      return (!x.unit_id || x.unit_id === unitId) && (!x.work_type_code || x.work_type_code === item.work_type_code) &&
        (!x.product_name || x.product_name === item.product_name);
    }).sort(function (a, b) {
      var score = function (x) { return (x.unit_id ? 4 : 0) + (x.work_type_code ? 2 : 0) + (x.product_name ? 1 : 0); };
      return score(b) - score(a) || a.priority - b.priority;
    });
    var candidates = matched.map(function (x) { return { user: U.byId(st().users, 'user_id', x.assignee_id), rule: x }; }).filter(function (x) { return D.userAvailable(x.user); });
    if (candidates.length) return { user: candidates[0].user, rule: candidates[0].rule };
    var replacement = matched.map(function (x) {
      var original = U.byId(st().users, 'user_id', x.assignee_id);
      var replacementId = original && original.replacement_user_id;
      return replacementId ? { user: U.byId(st().users, 'user_id', replacementId), rule: x, original: original } : null;
    }).filter(function (x) { return x && D.userAvailable(x.user); })[0];
    return replacement ? { user: replacement.user, rule: replacement.rule, replacementFor: replacement.original } : null;
  }

  /* ============================ Quyền thao tác ============================ */

  function actionsFor(item) {
    var u = me();
    if (!u) return [];
    // Dòng đang chờ máy chủ cấp mã: chưa thao tác được gì lên nó.
    if (item.syncing) return [];
    var r = reqOf(item), wt = wtOf(item);
    return (D.FLOW[item.status] || []).filter(function (tr) {
      if (tr.roles.indexOf(u.role) === -1) return false;
      if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) return false;
      if (u.role === 'PHONG_PGD' && (!r || r.unit_id !== u.unit_id)) return false;
      // Loại việc cần khách ký thì phải đi qua bước hẹn; cờ này trước đây gắn vào
      // `tr.skipIfAppointment` — một thuộc tính không transition nào khai báo, nên
      // luật "không cho hoàn thành thẳng" chưa bao giờ chạy.
      if (tr.to === 'HOAN_THANH_LS' && wt && wt.needs_appointment && !item.appointment) return false;

      // Cờ "cần kiểm soát duyệt" của loại việc phải có hiệu lực thật:
      // loại việc bắt buộc duyệt thì cán bộ chỉ được trình, không tự chốt;
      // loại việc không bắt buộc thì không bày thêm bước trình cho rối.
      var needsApproval = !!(wt && wt.needs_ks_approval);
      if (tr.to === 'HOAN_THANH_LS' && u.role === 'CAN_BO_LS' && needsApproval) return false;
      if (tr.to === 'CHO_KS_DUYET' && !needsApproval) return false;

      return true;
    });
  }

  function canEdit(item) {
    var u = me();
    if (!u || item.status === 'HUY' || item.status === 'HOAN_THANH_LS') return false;
    if (u.role === 'KS_LS' || u.role === 'QUAN_LY_LS') return true;
    var r = reqOf(item);
    return u.role === 'PHONG_PGD' && r && r.unit_id === u.unit_id;
  }

  function editNeedsApproval(item) {
    var u = me();
    return u && u.role === 'PHONG_PGD' && ['CHO_TIEP_NHAN', 'CAN_BO_SUNG'].indexOf(item.status) === -1;
  }

  function logEvent(itemId, type, reason) {
    st().events.unshift({
      event_id: U.uid('EVT'), item_id: itemId, type: type,
      by: st().session, at: U.now(), reason: reason || ''
    });
  }

  /* ============================ Bộ lọc ============================ */

  function f(screen, key, def) {
    if (!filters[screen]) filters[screen] = {};
    if (filters[screen][key] === undefined) filters[screen][key] = def;
    return filters[screen][key];
  }

  function setFilter(screen, key, val) {
    if (!filters[screen]) filters[screen] = {};
    filters[screen][key] = val;
  }

  function resetFilters() { filters = {}; }
  function resetFilter(screen) {
    delete filters[screen];
    filterDraft = null;
    ui.closeDialog();
    LS.app.render();
  }

  function setDraftFilter(screen, key, value) {
    if (!filterDraft || filterDraft.screen !== screen) filterDraft = { screen: screen, values: {} };
    filterDraft.values[key] = value;
  }

  /**
   * Gộp bản nháp vào bộ lọc đang dùng.
   * Gán đè cả object sẽ xóa mất những khóa không nằm trong biểu mẫu —
   * ví dụ chọn "Khoảng ngày" rồi nhập ngày thì kỳ đã chọn biến mất.
   */
  function mergeDraft(screen) {
    if (!filterDraft || filterDraft.screen !== screen) return;
    if (!filters[screen]) filters[screen] = {};
    Object.keys(filterDraft.values).forEach(function (k) {
      filters[screen][k] = filterDraft.values[k];
    });
    filterDraft = null;
  }

  function applyFilter(screen) {
    mergeDraft(screen);
    setFilter(screen, 'page', 1);
    ui.closeDialog();
    LS.app.render();
  }

  function applyReportFilter() {
    mergeDraft('board');
    LS.app.render();
  }

  function filterCount(screen, opts) {
    var keys = ['q', 'status', 'type', 'unit', 'staff', 'from', 'to'];
    return keys.filter(function (key) { return opts[key] && String(f(screen, key, '')).trim(); }).length;
  }

  function filterValue(screen, key, fallback) {
    return filterDraft && filterDraft.screen === screen && filterDraft.values[key] !== undefined
      ? filterDraft.values[key] : f(screen, key, fallback);
  }

  function draftAttrs(screen, key) {
    return ' data-draft-filter="' + U.attr(key) + '" data-filter-screen="' + U.attr(screen) + '"';
  }

  function filterFields(screen, opts) {
    var out = [];
    if (opts.dates) {
      out.push('<div class="f-row">' + ui.field('Từ ngày', ui.input('', filterValue(screen, 'from', U.localDate()), { type: 'date', min: U.localDate(), attrs: draftAttrs(screen, 'from') })) +
        ui.field('Đến ngày', ui.input('', filterValue(screen, 'to', U.localDate()), { type: 'date', min: U.localDate(), attrs: draftAttrs(screen, 'to') })) + '</div>');
    }
    if (opts.status) out.push(ui.field('Trạng thái', ui.select('', [['__open', 'Đang mở']].concat(Object.keys(D.STATUS).map(function (k) { return [k, D.STATUS[k].label]; })), filterValue(screen, 'status', ''), { blank: 'Tất cả trạng thái', attrs: draftAttrs(screen, 'status') })));
    if (opts.type) out.push(ui.field('Loại việc / sản phẩm', ui.select('', st().workTypes.map(function (w) { return [w.code, wtLabel(w)]; }), filterValue(screen, 'type', ''), { blank: 'Tất cả loại việc', attrs: draftAttrs(screen, 'type') })));
    if (opts.unit) out.push(ui.field('Đơn vị', ui.select('', st().units.filter(function (x) { return x.kind === 'PGD'; }).map(function (x) { return [x.unit_id, x.name]; }), filterValue(screen, 'unit', ''), { blank: 'Tất cả đơn vị', attrs: draftAttrs(screen, 'unit') })));
    if (opts.staff) out.push(ui.field('Cán bộ xử lý', ui.select('', staffList().map(function (x) { return [x.user_id, x.full_name]; }), filterValue(screen, 'staff', ''), { blank: 'Tất cả cán bộ', attrs: draftAttrs(screen, 'staff') })));
    return out.join('');
  }

  function filterOptions(screen) {
    return screen === 'queue' ? { status: true, type: true, staff: true, dates: true } :
      screen === 'room' ? { status: true, type: true, staff: true, dates: true } :
      screen === 'work' ? { status: true, type: true, unit: me() && me().role !== 'PHONG_PGD', staff: me() && me().role !== 'PHONG_PGD' } :
      { status: true, type: true };
  }

  function filterBar(screen, opts) {
    var count = filterCount(screen, opts);
    return '<div class="filter-tools"><button class="btn btn-quiet btn-icon filter-trigger" data-act="open-filter" data-screen="' + U.attr(screen) + '" aria-label="Bộ lọc" title="Bộ lọc">' +
      U.icon('filter', 17) + (count ? '<span class="filter-count">' + count + '</span>' : '') + '</button></div>';
  }

  function listSearch(screen, placeholder) {
    // id cố định để sau khi vẽ lại còn tìm đúng ô mà trả con trỏ về chỗ cũ.
    return '<div class="search list-search"><span aria-hidden="true">' + U.icon('search', 16) + '</span>' +
      '<input class="input" id="fq-' + U.attr(screen) + '" data-filter-screen="' + U.attr(screen) + '" data-filter="q" value="' +
      U.attr(f(screen, 'q', '')) + '" placeholder="' + U.attr(placeholder || 'Khách hàng, CIF, mã việc, sản phẩm') +
      '" aria-label="Tìm kiếm" autocomplete="off"></div>';
  }

  function listToolbar(screen, opts, withSort) {
    return '<div class="list-toolbar">' + listSearch(screen) + filterBar(screen, opts) + (withSort ? sortControl(screen) : '') + '</div>';
  }

  function openFilter(screen) {
    var opts = filterOptions(screen);
    filterDraft = { screen: screen, values: Object.assign({}, filters[screen] || {}) };
    ui.openDialog('Bộ lọc', filterFields(screen, opts) + '<div class="form-end"><button type="button" class="btn btn-quiet" data-act="reset-filter" data-screen="' + U.attr(screen) + '">Xóa lọc</button><button type="button" class="btn btn-primary" data-act="apply-filter" data-screen="' + U.attr(screen) + '">Áp dụng</button></div>', { size: 'md', sub: 'Chọn điều kiện, sau đó bấm Áp dụng.' });
  }

  function applyFilters(screen, list) {
    var q = String(f(screen, 'q', '')).trim().toLowerCase();
    var s = f(screen, 'status', ''), t = f(screen, 'type', ''),
      un = f(screen, 'unit', ''), stf = f(screen, 'staff', '');

    return list.filter(function (i) {
      var r = reqOf(i);
      if (s === '__open' && !D.STATUS[i.status].open) return false;
      if (s && s !== '__open' && i.status !== s) return false;
      if (t && i.work_type_code !== t) return false;
      if (un && (!r || r.unit_id !== un)) return false;
      if (stf && i.assigned_user_id !== stf) return false;
      if (q) {
        var hay = [i.item_id, i.product_name, wtName(i.work_type_code),
          r ? r.customer.name : '', r ? r.customer.cif : '', userName(i.assigned_user_id)].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortOptions(screen) {
    return [['newest', 'Mới nhất'], ['oldest', 'Cũ nhất'], ['due', 'Hạn xử lý gần'], ['customer', 'Tên khách hàng'], ['staff', 'Cán bộ xử lý'], ['status', 'Trạng thái']];
  }

  function sortState(screen) {
    var selected = f(screen, 'sort', 'newest');
    var key = selected, dir = f(screen, 'sortDir', '');
    if (selected === 'newest') { key = 'date'; dir = 'desc'; }
    else if (selected === 'oldest') { key = 'date'; dir = 'asc'; }
    else if (selected === 'due') { key = 'due'; dir = dir || 'asc'; }
    else if (!dir) dir = 'asc';
    return { key: key, dir: dir };
  }

  function toggleSort(screen, key) {
    var current = sortState(screen), dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
    setFilter(screen, 'sort', key === 'date' ? (dir === 'asc' ? 'oldest' : 'newest') : key);
    setFilter(screen, 'sortDir', dir);
  }

  function sortHeader(screen, key, label) {
    var state = sortState(screen), active = state.key === key;
    var arrow = active ? (state.dir === 'asc' ? '↑' : '↓') : '↕';
    return '<button type="button" class="th-sort' + (active ? ' is-active' : '') + '" data-act="sort-column" data-screen="' + U.attr(screen) + '" data-sort="' + U.attr(key) + '" aria-label="Sắp xếp theo ' + U.attr(label) + '" aria-sort="' + (active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><span>' + U.esc(label) + '</span><span class="sort-indicator" aria-hidden="true">' + arrow + '</span></button>';
  }

  function sortControl(screen) {
    return '<div class="sort-control"><span class="sort-label">Sắp xếp</span>' +
      ui.select('', sortOptions(screen), f(screen, 'sort', 'newest'), { attrs: ' data-filter-screen="' + U.attr(screen) + '" data-filter="sort" aria-label="Sắp xếp danh sách"' }) + '</div>';
  }

  function sortItems(list, screen) {
    var key = f(screen, 'sort', 'newest');
    return list.slice().sort(function (a, b) {
      var ar = reqOf(a), br = reqOf(b), av, bv;
      var state = sortState(screen);
      key = state.key;
      var dir = state.dir;
      function compare(x, y) {
        var n = x < y ? -1 : (x > y ? 1 : 0);
        return (dir === 'desc' ? -n : n);
      }
      if (key === 'customer') {
        av = ar && ar.customer ? ar.customer.name || '' : ''; bv = br && br.customer ? br.customer.name || '' : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'contact') {
        av = ar && ar.customer ? (ar.customer.phone || '') + ' ' + (ar.customer.email || '') : '';
        bv = br && br.customer ? (br.customer.phone || '') + ' ' + (br.customer.email || '') : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'unit') {
        av = ar ? unitName(ar.unit_id) : ''; bv = br ? unitName(br.unit_id) : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'work') {
        av = wtName(a.work_type_code); bv = wtName(b.work_type_code);
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'code') {
        return compare(String(itemRef(a)), String(itemRef(b)));
      }
      if (key === 'staff') {
        av = userName(a.assigned_user_id) || 'Chưa giao'; bv = userName(b.assigned_user_id) || 'Chưa giao';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'status') {
        av = D.STATUS[a.status] ? D.STATUS[a.status].label : a.status; bv = D.STATUS[b.status] ? D.STATUS[b.status].label : b.status;
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'due' || key === 'sla') {
        av = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER; bv = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return compare(av, bv) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'date') {
        av = new Date(a.occurrence_date || a.submitted_at || 0).getTime(); bv = new Date(b.occurrence_date || b.submitted_at || 0).getTime();
        return compare(av, bv) || String(a.item_id).localeCompare(String(b.item_id));
      }
      return String(a.item_id).localeCompare(String(b.item_id));
    });
  }

  /* ============================ Bảng việc ============================ */

  var COLS = {
    code: { label: 'Mã việc', cls: 'fit' },
    customer: { label: 'Khách hàng' },
    contact: { label: 'Liên hệ' },
    unit: { label: 'Đơn vị' },
    work: { label: 'Loại việc / sản phẩm' },
    date: { label: 'Ngày phát sinh', cls: 'fit' },
    status: { label: 'Trạng thái', cls: 'fit' },
    staff: { label: 'Cán bộ' },
    progress: { label: 'Tiến độ', cls: 'fit' },
    sla: { label: 'Hạn xử lý', cls: 'fit' },
    time: { label: 'Giờ xử lý KH', cls: 'fit' },
    act: { label: '', cls: 'fit' }
  };

  function slaCell(item) {
    var s = D.sla(item, st());
    if (!s) return '<span class="t2">—</span>';
    if (s.late) return ui.tag('Quá ' + U.fmtGap(s.left), 'danger');
    if (s.soon) return ui.tag('Còn ' + U.fmtGap(s.left), 'warn');
    return '<span class="t2">' + U.fmtDT(s.due) + '</span>';
  }

  function progressCell(item) {
    var wt = wtOf(item);
    if (!wt || !wt.checklist.length) return '';
    var done = (item.checklist || []).filter(Boolean).length;
    return '<div class="t2">' + done + '/' + wt.checklist.length + '</div>' + ui.bar(done, wt.checklist.length);
  }

  /**
   * Cột thao tác: tối đa hai nút chữ cộng nút xem, luôn nằm trên một dòng.
   * Việc còn thao tác khác thì mở chi tiết, không kéo dài chiều cao dòng bảng.
   */
  function actionRow(item) {
    var role = me().role;
    var acts = actionsFor(item).slice().sort(function (a, b) { return (a.rank || 5) - (b.rank || 5); });
    var id = U.attr(item.item_id);
    var out = [];

    acts.filter(function (a) { return a.primary; }).slice(0, 2).forEach(function (a, idx) {
      out.push(ui.btn(a.short || a.label, {
        kind: idx === 0 ? 'primary' : 'line', sm: true, act: 'flow',
        title: a.label, data: ' data-id="' + id + '" data-to="' + a.to + '"'
      }));
    });

    // Kiểm soát đổi người ngay trên bảng, không phải mở hộp thoại hai lần.
    var reassign = acts.filter(function (a) { return a.assignee && !a.primary; })[0];
    if (out.length < 2 && reassign && ['KS_LS', 'QUAN_LY_LS'].indexOf(role) !== -1) {
      out.push(ui.btn(reassign.short || reassign.label, {
        kind: 'line', sm: true, act: 'quick-assign', title: reassign.label, data: ' data-id="' + id + '"'
      }));
    }

    var rest = acts.length - out.length;
    return '<div class="act-row">' + out.join('') +
      ui.iconBtn('eye', {
        act: 'detail', data: ' data-id="' + id + '"',
        label: rest > 0 ? 'Xem chi tiết và ' + rest + ' thao tác khác' : 'Xem chi tiết'
      }) + '</div>';
  }

  function cell(key, item) {
    var r = reqOf(item);
    switch (key) {
      case 'code':
        if (item.syncing) return '<div class="tid">—</div>' + ui.tag('Đang gửi…', 'info');
        return '<div class="tid">' + U.esc(itemRef(item)) + '</div>' +
          (item.pending ? ui.tag('Chờ duyệt sửa', 'gold') : '');
      case 'customer':
        // Quản trị hệ thống xem được vận hành nhưng không xem hồ sơ khách,
        // giống hệt quy tắc đã áp trong hộp thoại chi tiết.
        if (me().role === 'ADMIN') return '<span class="t2">Ẩn theo quyền</span>';
        return '<div class="customer-main"><span class="t1">' + U.esc(r ? r.customer.name : '—') + '</span>' +
          (r && priorityTags(r.customer) ? '<span class="priority-tags">' + priorityTags(r.customer) + '</span>' : '') + '</div>' +
          '<div class="t2">' + U.esc(r && r.customer.cif ? r.customer.cif : 'Chưa có CIF') + '</div>';
      case 'contact':
        if (me().role === 'ADMIN') return '<span class="t2">Ẩn theo quyền</span>';
        return contactCell(r);
      case 'unit':
        return '<div class="t2">' + U.esc(r ? unitName(r.unit_id) : '—') + '</div>';
      case 'work':
        return '<div class="t1">' + U.esc(wtGroup(item.work_type_code)) + '</div>' +
          '<div class="t2">' + U.esc(productLabel(item)) + '</div>';
      case 'date':
        return '<div class="t2">' + U.fmtDate(item.occurrence_date) + '</div>';
      case 'status':
        return ui.statusTag(item.status);
      case 'staff':
        return item.assigned_user_id
          ? '<div class="t2">' + U.esc(userName(item.assigned_user_id)) + '</div>' + progressCell(item)
          : '<span class="t2">Chưa giao</span>';
      case 'progress':
        return progressCell(item) || '<span class="t2">—</span>';
      case 'sla':
        return slaCell(item);
      case 'time':
        return '<span class="tid">' + U.esc(D.processingLabel(item, st())) + '</span>';
      case 'act':
        return actionRow(item);
      default: return '';
    }
  }

  function itemTable(list, keys, emptyOpts, screen) {
    var cols = keys.map(function (k) {
      var c = COLS[k], out = Object.assign({}, c);
      if (screen && k !== 'act') out.header = sortHeader(screen, k, c.label);
      return out;
    });
    return ui.table(
      cols,
      list.map(function (i) {
        var s = D.sla(i, st());
        return {
          cls: (i.syncing ? 'is-pending ' : '') + priorityRowClass(i) + ' ' + (s && s.late ? 'flag' : (s && s.soon ? 'flag-warn' : '')),
          cells: keys.map(function (k) { return cell(k, i); })
        };
      }),
      emptyOpts
    );
  }

  /* ============================ Màn: việc đã gửi ============================ */

  function work() {
    var u = me();
    var all = visibleItems().filter(function (i) { return !!i.assigned_user_id; });
    var list = sortItems(applyFilters('work', all), 'work');
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    var fix = all.filter(function (i) { return i.status === 'CAN_BO_SUNG'; });

    return (fix.length ? ui.banner('warn', fix.length + ' việc đang chờ đơn vị bổ sung',
        'Kiểm soát đã trả lại. Mở chi tiết để xem lý do rồi gửi lại LS.') : '') +
      ui.block({
        title: 'Danh sách đã phân bổ', count: list.length + '/' + all.length, icon: 'clipboard',
        actions: u.role === 'PHONG_PGD' ? ui.btn('Tạo việc mới', { kind: 'primary', act: 'new-request', icon: 'plus', sm: true }) : '',
      filters: listToolbar('work', { status: true, type: true, unit: u.role !== 'PHONG_PGD', staff: u.role !== 'PHONG_PGD' }, true),
        body: itemTable(list, ['code', 'customer', 'contact', 'work', 'date', 'status', 'staff', 'act'], {
          icon: 'clipboard',
          title: all.length ? 'Không có việc khớp bộ lọc' : 'Đơn vị chưa gửi việc nào',
          text: all.length ? 'Thử xóa bớt điều kiện lọc.' : 'Bấm tạo việc mới để đăng ký hồ sơ đầu tiên cho khách.',
          action: !all.length && u.role === 'PHONG_PGD' ? ui.btn('Tạo việc mới', { kind: 'primary', act: 'new-request', icon: 'plus' }) : ''
        }, 'work')
      });
  }

  /**
   * Mặc định xem từ hôm nay tới hết tuần, nhưng cho phép lùi về quá khứ.
   * Khóa cứng mốc đầu vào hôm nay làm việc chưa phân công của ngày cũ biến mất
   * khỏi mọi màn hình của phòng gửi: không xem, không sửa, không hủy được.
   */
  function roomRange() {
    var today = U.localDate(), base = new Date(today + 'T00:00:00');
    var end = new Date(base.getTime()); end.setDate(end.getDate() + (7 - (base.getDay() || 7)));
    var from = f('room', 'from', today), to = f('room', 'to', U.localDate(end));
    if (to < from) to = from;
    setFilter('room', 'from', from); setFilter('room', 'to', to);
    return { from: from, to: to };
  }

  /** Việc còn mở nhưng rơi ra ngoài kỳ đang xem — không được để lọt. */
  function roomBacklog(range) {
    return visibleItems().filter(function (i) {
      if (!D.STATUS[i.status].open) return false;
      var day = String(i.occurrence_date || '').substring(0, 10);
      return day && day < range.from;
    });
  }

  function roomItems() {
    var range = roomRange();
    return visibleItems().filter(function (i) {
      var day = String(i.occurrence_date || '').substring(0, 10);
      return !day || (day >= range.from && day <= range.to);
    });
  }

  function room() {
    var range = roomRange(), inWindow = roomItems(), list = sortItems(applyFilters('room', inWindow), 'room'), u = me();
    var backlog = roomBacklog(range);

    var warn = backlog.length
      ? ui.banner('warn', backlog.length + ' việc còn mở nằm trước kỳ đang xem',
        'Chúng phát sinh từ ' + U.fmtDate(backlog.map(function (i) { return i.occurrence_date; }).sort()[0]) +
        ' và chưa đóng. Bấm để mở rộng kỳ xem.') +
        '<div style="margin:-0.5rem 0 0.75rem">' +
        ui.btn('Xem cả việc tồn', { act: 'room-backlog', icon: 'history', sm: true, kind: 'line' }) + '</div>'
      : '';

    return warn + ui.block({
      title: 'Toàn bộ hồ sơ ' + unitName(u.unit_id), count: list.length + '/' + inWindow.length, icon: 'building',
      note: '',
      filters: listToolbar('room', { status: true, type: true, staff: true, dates: true }, true),
      body: itemTable(list, ['code', 'customer', 'work', 'staff', 'sla', 'status', 'act'], {
        icon: 'building', title: 'Phòng chưa có hồ sơ trong kỳ', text: 'Chọn ngày tương lai khác hoặc gửi hồ sơ mới.'
      }, 'room')
    });
  }

  /** Kéo mốc đầu kỳ về ngày sớm nhất còn việc mở. */
  function roomShowBacklog() {
    var backlog = roomBacklog(roomRange());
    if (!backlog.length) return;
    var earliest = backlog.map(function (i) { return String(i.occurrence_date).substring(0, 10); }).sort()[0];
    setFilter('room', 'from', earliest);
    LS.app.render();
    ui.toast('Đã mở rộng kỳ xem từ ' + U.fmtDate(earliest) + '.');
  }

  function roomBoard() {
    var u = me(), range = roomRange(), all = visibleItems(), current = applyFilters('room', roomItems());
    var groups = {};
    current.forEach(function (i) { var w = wtOf(i), key = w && w.group ? w.group : 'Khác'; if (!groups[key]) groups[key] = []; groups[key].push(i); });
    var byType = Object.keys(groups).map(function (key) {
      var rows = groups[key];
      return { name: key, n: rows.length, open: rows.filter(function (i) { return D.STATUS[i.status].open; }).length };
    });
    var byStaff = staffList().map(function (s) {
      var rows = current.filter(function (i) { return i.assigned_user_id === s.user_id && reqOf(i) && reqOf(i).unit_id === u.unit_id; });
      return { s: s, n: rows.length, open: rows.filter(function (i) { return D.STATUS[i.status].open; }).length, done: rows.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length };
    }).filter(function (x) { return x.n; });
    return ui.block({
      title: 'Dashboard ' + unitName(u.unit_id), count: U.fmtDate(range.from) + ' → ' + U.fmtDate(range.to), icon: 'chart',
      note: '',
      filters: listToolbar('room', { dates: true }, false),
      body: ui.sectionTitle('Theo nhóm cấp độ / loại việc') + ui.table(
        [{ label: 'Loại việc' }, { label: 'Tổng', cls: 'num' }, { label: 'Đang mở', cls: 'num' }],
        byType.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.name) + '</div>', '<span class="tid">' + x.n + '</span>', '<span class="tid">' + x.open + '</span>'] }; }),
        { icon: 'chart', title: 'Chưa có nhóm việc trong kỳ', text: 'Chưa có hồ sơ phù hợp khoảng ngày.' }
      ) + '<div style="margin-top:1.25rem">' + ui.sectionTitle('LS đang xử lý cho phòng') + ui.table(
        [{ label: 'Cán bộ LS' }, { label: 'Tổng việc', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }],
        byStaff.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.s.full_name) + '</div>', '<span class="tid">' + x.n + '</span>', '<span class="tid">' + x.open + '</span>', '<span class="tid">' + x.done + '</span>'] }; }),
        { icon: 'users', title: 'Chưa có LS xử lý cho phòng', text: 'Hồ sơ sẽ xuất hiện sau khi kiểm soát phân công.' }
      ) + '</div>'
    });
  }

  /* ============================ Màn: hàng chờ ============================ */

  /**
   * Kỳ xem của hàng chờ. Mốc đầu mặc định lùi về ngày sớm nhất còn việc mở,
   * không khóa ở hôm nay: kiểm soát mà không thấy việc tồn của hôm trước thì
   * cả luồng đứng lại ở đó.
   */
  function queueWindow() {
    var today = U.localDate();
    var base = new Date(today + 'T00:00:00');
    var end = new Date(base.getTime()); end.setDate(end.getDate() + (7 - (base.getDay() || 7)));

    var oldest = today;
    visibleItems().forEach(function (i) {
      if (!D.STATUS[i.status].open) return;
      var day = String(i.occurrence_date || '').substring(0, 10);
      if (day && day < oldest) oldest = day;
    });

    var from = f('queue', 'from', oldest), to = f('queue', 'to', U.localDate(end));
    if (to < from) to = from;
    setFilter('queue', 'from', from); setFilter('queue', 'to', to);
    return { from: from, to: to };
  }

  function withinQueueWindow(item, range) {
    var day = String(item.occurrence_date || '').substring(0, 10);
    return !day || (day >= range.from && day <= range.to);
  }

  function queueTabs(tab, counts) {
    var defs = [['intake', 'Hàng chờ'], ['assign', 'Chờ phân công'], ['assigned', 'Đã phân công'], ['review', 'Chờ duyệt'], ['running', 'Đang xử lý'], ['late', 'Quá hạn']];
    return '<div class="queue-tabs">' + defs.map(function (x) {
      return ui.btn(x[1] + ' · ' + counts[x[0]], { kind: tab === x[0] ? 'primary' : 'line', sm: true, act: 'queue-tab', data: ' data-tab="' + x[0] + '"' });
    }).join('') + '</div>';
  }

  function paginate(list, screen) {
    var size = 25, page = Math.max(1, Number(f(screen, 'page', 1)) || 1), total = Math.max(1, Math.ceil(list.length / size));
    if (page > total) { page = total; setFilter(screen, 'page', page); }
    var start = (page - 1) * size;
    return { rows: list.slice(start, start + size), page: page, total: total, size: size };
  }

  function pageControls(pagination) {
    if (pagination.total <= 1) return '';
    return '<div class="btn-row" style="justify-content:flex-end;padding: .75rem 1rem">' +
      ui.btn('‹ Trước', { sm: true, act: 'queue-page', disabled: pagination.page <= 1, data: ' data-page="' + (pagination.page - 1) + '"' }) +
      '<span class="t2">Trang ' + pagination.page + '/' + pagination.total + '</span>' +
      ui.btn('Sau ›', { sm: true, act: 'queue-page', disabled: pagination.page >= pagination.total, data: ' data-page="' + (pagination.page + 1) + '"' }) + '</div>';
  }

  function queue() {
    var range = queueWindow();
    // Bộ đếm trên tab và danh sách bên dưới phải đếm cùng một tập.
    // Trước đây tab đếm toàn bộ còn bảng lại cắt theo kỳ, nên tab báo có việc
    // mà bấm vào thì bảng trống.
    var all = visibleItems().filter(function (i) { return withinQueueWindow(i, range); });
    var review = all.filter(function (i) { return i.status === 'CHO_KS_DUYET'; });
    var running = all.filter(function (i) {
      return ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'].indexOf(i.status) !== -1;
    });
    var pending = visibleItems().filter(function (i) { return i.pending; });
    var counts = {
      intake: all.filter(function (i) { return i.status === 'CHO_TIEP_NHAN' || i.status === 'CAN_BO_SUNG'; }).length,
      assign: all.filter(function (i) { return i.status === 'CHO_PHAN_CONG'; }).length,
      review: review.length,
      assigned: all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; }).length,
      running: running.length,
      late: all.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length
    };
    var tab = f('queue', 'tab', 'intake');
    var source = tab === 'intake' ? all.filter(function (i) { return i.status === 'CHO_TIEP_NHAN' || i.status === 'CAN_BO_SUNG'; })
      : tab === 'assign' ? all.filter(function (i) { return i.status === 'CHO_PHAN_CONG'; })
        : tab === 'assigned' ? all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; })
        : tab === 'review' ? review : tab === 'late' ? all.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }) : running;
    var filtered = sortItems(applyFilters('queue', source), 'queue');
    var page = paginate(filtered, 'queue');

    var out = '';

    if (pending.length) {
      out += ui.block({
        title: 'Đề nghị sửa chờ duyệt', count: pending.length, icon: 'pencil',
        note: 'Phòng gửi việc đã sửa hồ sơ sau khi LS nhận. Duyệt thì thay đổi mới có hiệu lực.',
        body: ui.table(
          [{ label: 'Mã việc', cls: 'fit' }, { label: 'Người đề nghị' }, { label: 'Nội dung thay đổi' }, { label: 'Lý do' }, { label: '', cls: 'fit' }],
          pending.map(function (i) {
            return {
              cells: [
                '<div class="tid">' + U.esc(itemRef(i)) + '</div>',
                '<div class="t1">' + U.esc(userName(i.pending.by)) + '</div><div class="t2">' + U.fmtDT(i.pending.at) + '</div>',
                diffHtml(i, i.pending.fields),
                '<div class="t2">' + U.esc(i.pending.reason) + '</div>',
                '<div class="btn-row">' +
                ui.btn('Duyệt', { kind: 'primary', sm: true, act: 'revision', data: ' data-id="' + U.attr(i.item_id) + '" data-ok="1"' }) +
                ui.btn('Từ chối', { sm: true, act: 'revision', data: ' data-id="' + U.attr(i.item_id) + '" data-ok="0"' }) +
                '</div>'
              ]
            };
          })
        )
      });
    }

    out += ui.block({
      title: 'Hàng chờ & đang xử lý', count: filtered.length + '/' + source.length, icon: 'activity',
      note: '',
      filters: '<div class="queue-toolbar">' + queueTabs(tab, counts) + '<div class="queue-tools">' + listSearch('queue') + filterBar('queue', { status: true, type: true, staff: true, dates: true }) + sortControl('queue') + '</div></div>',
      body: itemTable(page.rows, tab === 'intake' || tab === 'assign' ? ['code', 'customer', 'unit', 'work', 'date', 'status', 'act'] : ['code', 'customer', 'work', 'staff', 'sla', 'status', 'act'], {
        icon: 'activity', title: 'Không có hồ sơ trong trang này', text: 'Đổi tab, kỳ ngày hoặc bộ lọc để xem danh sách khác.'
      }, 'queue') + pageControls(page)
    });

    return out;
  }

  var FIELD_LABEL = {
    work_type_code: 'Loại việc', product_name: 'Sản phẩm', occurrence_date: 'Ngày phát sinh',
    'customer.name': 'Tên khách', 'customer.cif': 'CIF', 'customer.phone': 'Điện thoại', 'customer.email': 'Email'
  };

  function diffHtml(item, fields) {
    var r = reqOf(item);
    return '<div class="t2">' + Object.keys(fields).map(function (k) {
      var before = k.indexOf('customer.') === 0 ? (r ? r.customer[k.slice(9)] : '') : item[k];
      var after = fields[k];
      if (k === 'work_type_code') { before = wtName(before); after = wtName(after); }
      return U.esc(FIELD_LABEL[k] || k) + ': <s>' + U.esc(before || '—') + '</s> &rarr; <b>' + U.esc(after || '—') + '</b>';
    }).join('<br>') + '</div>';
  }

  /* ============================ Màn: việc của tôi ============================ */

  function mine() {
    var all = visibleItems();
    var list = sortItems(applyFilters('mine', all), 'mine');
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    var fresh = all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; });

    return (late.length ? ui.banner('danger', late.length + ' việc đã quá hạn xử lý',
        'Cập nhật tiến độ hoặc báo vướng mắc để kiểm soát biết.') : '') +
      ui.block({
        title: 'Việc được giao', count: list.length + '/' + all.length, icon: 'briefcase',
        filters: listToolbar('mine', { status: true, type: true }, true),
        // Bỏ cột cán bộ: mọi dòng ở đây đều là việc của chính người đang xem.
        body: itemTable(list, ['code', 'customer', 'contact', 'work', 'progress', 'time', 'status', 'act'], {
          icon: 'briefcase', title: 'Chưa có việc nào được giao', text: 'Kiểm soát LS sẽ phân công việc cho bạn từ hàng chờ.'
        }, 'mine')
      });
  }

  /** Dashboard riêng của cán bộ LS: việc đã chạm trong ngày và giờ làm thực tế. */
  function personalDashboard() {
    var u = me();
    if (!u || u.role !== 'CAN_BO_LS') return ui.banner('warn', 'Không có quyền xem dashboard cá nhân', 'Màn này chỉ dành cho cán bộ LS.');
    var now = new Date(), today = U.localDate(now), todayStart = new Date(today + 'T00:00:00');
    var items = visibleItems();
    var touched = items.filter(function (i) {
      return (i.processing_started_at && String(i.processing_started_at).substring(0, 10) <= today) ||
        (i.completed_at && String(i.completed_at).substring(0, 10) === today);
    });
    var doneToday = items.filter(function (i) { return i.status === 'HOAN_THANH_LS' && String(i.completed_at || '').substring(0, 10) === today; });
    var running = items.filter(function (i) { return D.STATUS[i.status] && D.STATUS[i.status].open; });
    var hours = touched.reduce(function (sum, i) {
      if (!i.processing_started_at) return sum;
      var start = new Date(i.processing_started_at), end = i.completed_at ? new Date(i.completed_at) : now;
      if (start < todayStart) start = todayStart;
      if (end > now) end = now;
      var h = U.workingHours(start.toISOString(), end.toISOString(), D.processingCalendar(st()));
      return sum + (h || 0);
    }, 0);
    var rows = touched.slice().sort(function (a, b) { return new Date(b.completed_at || b.processing_started_at || 0) - new Date(a.completed_at || a.processing_started_at || 0); }).slice(0, 30);
    return ui.block({ title: 'Dashboard cá nhân', count: U.fmtDate(today), icon: 'chart',
      note: 'Chỉ hiển thị việc của ' + U.esc(u.full_name) + '. Giờ xử lý đã loại trừ 11:30–13:30 và 18:00–07:30.',
      body: ui.strip([
        ui.metric('Hoàn thành hôm nay', doneToday.length, 'ok'),
        ui.metric('Đang mở', running.length, 'info'),
        ui.metric('Đang xử lý (giờ làm)', hours.toFixed(1) + 'h'),
        ui.metric('Đã chạm hôm nay', touched.length)
      ]) + '<div style="margin-top:1.125rem">' + ui.sectionTitle('Chi tiết việc trong ngày') +
      ui.table([{ label: 'Mã việc' }, { label: 'Khách hàng' }, { label: 'Loại việc' }, { label: 'Trạng thái' }, { label: 'Giờ xử lý KH', cls: 'num' }],
        rows.map(function (i) { var r = reqOf(i); return { cells: [
          '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(i.item_id) + '">' + U.esc(itemRef(i)) + '</button>',
          '<div class="t1">' + U.esc(r ? r.customer.name : '—') + '</div>',
          '<div class="t2">' + U.esc(wtName(i.work_type_code)) + '</div>', ui.statusTag(i.status),
          '<span class="tid">' + U.esc(D.processingLabel(i, st(), now)) + '</span>'
        ] }; }),
        { icon: 'briefcase', title: 'Chưa có hoạt động hôm nay', text: 'Khi bạn bấm “Bắt đầu xử lý”, thời gian làm việc sẽ được ghi nhận tại đây.' }) + '</div>'
    });
  }

  /* ============================ Màn: điều hành ============================ */

  function board() {
    var all = visibleItems();
    var report = performanceReport(reportRange());
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var done = all.filter(function (i) { return i.status === 'HOAN_THANH_LS'; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });

    var customers = {};
    all.forEach(function (i) { var r = reqOf(i); if (r) customers[r.customer.cif || r.request_id] = true; });

    var onTime = U.pct(done.filter(function (i) {
      return i.due_at && i.completed_at && new Date(i.completed_at) <= new Date(i.due_at);
    }).length, done.length);

    var load = staffList().map(function (u) {
      var m = all.filter(function (i) { return i.assigned_user_id === u.user_id; });
      var op = m.filter(function (i) { return D.STATUS[i.status].open; });
      return {
        u: u, open: op.length, done: m.length - op.length,
        late: op.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length
      };
    }).sort(function (a, b) { return b.open - a.open; });

    var maxLoad = Math.max.apply(null, [1].concat(load.map(function (x) { return x.open; })));

    var byUnit = st().units.filter(function (x) { return x.kind === 'DON_VI_GUI' || x.kind === 'PGD'; }).map(function (unit) {
      var m = all.filter(function (i) { var r = reqOf(i); return r && r.unit_id === unit.unit_id; });
      return {
        unit: unit, total: m.length,
        open: m.filter(function (i) { return D.STATUS[i.status].open; }).length,
        done: m.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length
      };
    }).filter(function (x) { return x.total; });

    var spread = Object.keys(D.STATUS).map(function (k) {
      return { k: k, n: all.filter(function (i) { return i.status === k; }).length };
    }).filter(function (x) { return x.n; });

    var tab = f('board', 'tab', 'report');
    if (tab === 'report') return dailyResultBlock(report, tab);

    // Chỉ dựng đúng phần đang xem. Dựng cả sáu phần mỗi lần vẽ là lãng phí
    // rõ rệt khi kho việc lớn dần.
    var panels = {
      type: function () { return typeSummaryBlock(report.range); },
      staff: function () { return ui.block({
        title: 'Tải việc theo cán bộ', icon: 'users',
        body: ui.table(
          [{ label: 'Cán bộ' }, { label: 'Đang mở', cls: 'num' }, { label: 'Phân bổ' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Đã xong', cls: 'num' }],
          load.map(function (x) {
            return {
              cls: x.late ? 'flag' : '',
              cells: [
                '<div class="t1">' + U.esc(x.u.full_name) + '</div>',
                '<span class="tid">' + x.open + '</span>',
                ui.bar(x.open, maxLoad, x.open >= maxLoad && maxLoad > 1),
                x.late ? ui.tag(String(x.late), 'danger') : '<span class="t2">0</span>',
                '<span class="tid">' + x.done + '</span>'
              ]
            };
          }),
          { icon: 'users', title: 'Chưa có cán bộ LS đang hoạt động', text: 'Thêm cán bộ trong màn quản trị người dùng.' }
        )
      }); },
      unit: function () { return ui.block({
        title: 'Theo đơn vị gửi', icon: 'building',
        body: ui.table(
          [{ label: 'Đơn vị' }, { label: 'Tổng việc', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Tỷ lệ xong', cls: 'num' }],
          byUnit.map(function (x) {
            var p = U.pct(x.done, x.total);
            return {
              cells: [
                '<div class="t1">' + U.esc(x.unit.name) + '</div>',
                '<span class="tid">' + x.total + '</span>',
                '<span class="tid">' + x.open + '</span>',
                '<span class="tid">' + x.done + '</span>',
                p === null ? '<span class="t2">Chưa có dữ liệu</span>' : '<span class="tid">' + p + '%</span>'
              ]
            };
          }),
          { icon: 'building', title: 'Chưa có đơn vị nào gửi việc', text: '' }
        )
      }); },
      status: function () { return ui.block({
        title: 'Phân bố trạng thái', icon: 'activity',
        body: ui.pad('<div class="btn-row">' + spread.map(function (x) {
          return ui.tag(D.STATUS[x.k].label + ' · ' + x.n, D.STATUS[x.k].tone);
        }).join('') + '</div>')
      }); },
      late: function () { return ui.block({
        title: 'Việc quá hạn', count: late.length, icon: 'clock',
        body: itemTable(sortItems(late, 'board'), ['code', 'customer', 'work', 'staff', 'sla', 'status', 'act'], {
          icon: 'check', title: 'Không có việc quá hạn', text: 'Toàn bộ việc đang mở còn trong hạn theo lịch làm việc.'
        }, 'board')
      }); }
    };
    return dailyResultBlock(report, tab) + (panels[tab] || panels.type)();
  }

  /* ============================ Màn: kỳ kế hoạch tháng ============================ */

  function periods() {
    var u = me();
    var active = st().activePlan || {};
    var plans = (st().monthlyPlans || []).slice().sort(function (a, b) {
      return String(b.month_key || '').localeCompare(String(a.month_key || ''));
    });
    var canCreate = ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
    var rows = plans.map(function (p) {
      var state = p.status === 'ACTIVE' ? ui.tag('Đang hoạt động', 'ok') :
        p.status === 'SCHEDULED' ? ui.tag('Đã tạo trước', 'gold') : ui.tag('Đã lưu lịch sử', 'neutral');
      return { cells: [
        '<div class="t1">' + U.esc(p.name || p.month_key) + '</div><div class="t2">' + U.esc(p.month_key || '') + '</div>',
        '<span class="tid">' + U.fmtDate(p.start_date) + ' → ' + U.fmtDate(p.end_date) + '</span>',
        state,
        p.spreadsheet_url ? '<a class="btn btn-quiet btn-sm" href="' + U.attr(p.spreadsheet_url) + '" target="_blank" rel="noopener">Mở Sheet</a>' : '<span class="t2">Chưa có liên kết</span>'
      ] };
    });
    // Kỳ không có kho Sheet nghĩa là lần tạo file đã hỏng. Hệ thống tự thử lại
    // mỗi giờ, nhưng phải nói ra, nếu không tháng đó lặng lẽ không có file kế hoạch.
    var thieuKho = plans.filter(function (p) {
      return ['ACTIVE', 'SCHEDULED'].indexOf(p.status) !== -1 && !p.spreadsheet_url;
    });

    return (thieuKho.length
      ? ui.banner('warn', thieuKho.length + ' kỳ chưa tạo được kho Sheet kế hoạch',
        'Kỳ ' + thieuKho.map(function (p) { return U.esc(p.month_key || p.period_id); }).join(', ') +
        ' chưa có file. Hệ thống thử lại mỗi giờ; nếu vẫn không có, chạy setupFirstMonthlyPlan() trong Apps Script để đọc lỗi cụ thể.')
      : '') +
      ui.block({
      title: 'Kế hoạch tháng', icon: 'calendar',
      actions: canCreate ? ui.btn('Tạo tháng kế tiếp', { act: 'create-next-monthly-plan', icon: 'plus', sm: true }) : '',
      note: active.name ? 'Đang xem: ' + U.esc(active.name) + '. Kỳ đã tạo trước chỉ tự kích hoạt từ ngày đầu tháng.' : 'Chưa có kỳ hoạt động.',
      body: ui.table(
        [{ label: 'Kỳ' }, { label: 'Thời gian' }, { label: 'Trạng thái' }, { label: 'Google Sheet' }],
        rows,
        { icon: 'calendar', title: 'Chưa có lịch sử kỳ tháng', text: canCreate ? 'Tạo kế hoạch tháng kế tiếp để hệ thống chuẩn bị Sheet và chuyển tiếp việc đang mở.' : 'Kỳ tháng sẽ xuất hiện sau khi quản trị tạo.' }
      )
    });
  }

  /* ============================ Màn: báo cáo nhiều kỳ ============================ */

  // Báo cáo không nằm trong ảnh chụp bootstrap: máy chủ chỉ trả số liệu đã tổng
  // hợp khi được hỏi, để một báo cáo năm không kéo hàng nghìn dòng việc về máy.
  var reportCache = null;

  var REPORT_GROUPS = [['unit', 'Đơn vị gửi'], ['work_type', 'Loại việc'], ['staff', 'Cán bộ LS']];

  function reportOpts() {
    var preset = f('report', 'preset', 'quarter');
    var base = D.presetRange(preset === 'custom' ? 'month' : preset);
    return {
      preset: preset,
      from: preset === 'custom' ? f('report', 'from', base.from) : base.from,
      to: preset === 'custom' ? f('report', 'to', base.to) : base.to,
      group: f('report', 'group', 'unit')
    };
  }

  function loadReport(force) {
    var o = reportOpts();
    var key = [o.from, o.to, o.group].join('|');
    if (!force && reportCache && reportCache.key === key) return;

    if (!U.isGas()) {
      reportCache = { key: key, data: D.reportFromItems(o.from, o.to, o.group, st()), loading: false };
      return;
    }
    if (reportCache && reportCache.key === key && reportCache.loading) return;
    reportCache = { key: key, data: null, loading: true, error: '' };
    LS.api.getReport({ from: o.from, to: o.to, group: o.group }).then(function (data) {
      reportCache = { key: key, data: data, loading: false, error: '' };
      LS.app.render();
    }).catch(function (error) {
      reportCache = { key: key, data: null, loading: false, error: error.message || 'Không lấy được báo cáo.' };
      LS.app.render();
    });
  }

  function refreshReport() { loadReport(true); LS.app.render(); }

  function setReportFilter(key, value) {
    setFilter('report', key, value);
    if (key !== 'preset') setFilter('report', 'preset', 'custom');
    loadReport(true);
    LS.app.render();
  }

  function num(n) { return Number(n || 0).toLocaleString('vi-VN'); }

  function report() {
    var o = reportOpts();
    loadReport(false);

    var controls = '<div class="f-row" style="align-items:flex-end">' +
      ui.field('Khoảng thời gian',
        ui.select('report_preset', D.REPORT_PRESETS, o.preset, { attrs: ' data-act="report-preset"' })) +
      ui.field('Từ tháng', ui.input('report_from', o.from, { placeholder: '2026-01', attrs: ' data-act="report-from"' })) +
      ui.field('Đến tháng', ui.input('report_to', o.to, { placeholder: '2026-12', attrs: ' data-act="report-to"' })) +
      ui.field('Xem theo', ui.select('report_group', REPORT_GROUPS, o.group, { attrs: ' data-act="report-group"' })) +
      '</div>';

    var head = ui.block({
      title: 'Phạm vi báo cáo', icon: 'calendar',
      actions: ui.btn('Tải lại', { act: 'report-refresh', sm: true, icon: 'history' }),
      note: 'Việc kéo dài nhiều tháng chỉ được tính một lần, ở tháng nó phát sinh.',
      body: ui.pad(controls)
    });

    if (reportCache && reportCache.loading) {
      return head + ui.block({ title: 'Đang tổng hợp', icon: 'chart',
        body: ui.empty({ icon: 'chart', title: 'Đang tổng hợp số liệu', text: 'Máy chủ đang gộp dữ liệu của ' + o.from + ' đến ' + o.to + '.' }) });
    }
    if (reportCache && reportCache.error) {
      return head + ui.banner('danger', 'Không lấy được báo cáo', reportCache.error);
    }

    var data = reportCache && reportCache.data;
    if (!data) return head;
    var t = data.total;

    var strip = ui.strip([
      ui.metric('Việc phát sinh', num(t.phat_sinh), '', data.periods + ' kỳ'),
      ui.metric('Hoàn thành', num(t.hoan_thanh), t.hoan_thanh ? 'ok' : ''),
      ui.metric('Quá hạn', num(t.qua_han), t.qua_han ? 'danger' : ''),
      ui.metric('Tồn cuối kỳ', num(t.ton_cuoi_ky), t.ton_cuoi_ky ? 'warn' : '', 'ảnh chụp kỳ cuối'),
      ui.metric('Nhận hồ sơ TB', t.gio_tiep_nhan_tb ? t.gio_tiep_nhan_tb + 'h' : '—', '', 'gửi → tiếp nhận'),
      ui.metric('Phân công TB', t.gio_phan_cong_tb ? t.gio_phan_cong_tb + 'h' : '—', '', 'tiếp nhận → giao'),
      ui.metric('Xử lý TB', t.gio_xu_ly_tb ? t.gio_xu_ly_tb + 'h' : '—', '', 'giao → hoàn thành'),
      ui.metric('Toàn trình TB', t.gio_toan_trinh_tb ? t.gio_toan_trinh_tb + 'h' : '—', '', 'gửi → hoàn thành')
    ]);

    var groupLabel = (REPORT_GROUPS.filter(function (g) { return g[0] === data.group; })[0] || [])[1] || '';

    var byDim = ui.block({
      title: 'Theo ' + String(groupLabel).toLowerCase(), count: data.rows.length, icon: 'chart',
      actions: ui.btn('Xuất CSV', { act: 'report-export', sm: true, icon: 'download' }),
      body: ui.table(
        [{ label: groupLabel }, { label: 'Phát sinh', cls: 'num' }, { label: 'Chuyển tiếp vào', cls: 'num' },
          { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Hủy', cls: 'num' },
          { label: 'Tồn cuối kỳ', cls: 'num' }, { label: 'Nhận TB', cls: 'num' },
          { label: 'Phân công TB', cls: 'num' }, { label: 'Xử lý TB', cls: 'num' },
          { label: 'Toàn trình TB', cls: 'num' }],
        data.rows.map(function (r) {
          return { cls: r.qua_han ? 'flag-warn' : '', cells: [
            '<div class="t1">' + U.esc(r.label) + '</div>',
            '<span class="tid">' + num(r.phat_sinh) + '</span>',
            '<span class="tid">' + num(r.chuyen_tiep_vao) + '</span>',
            '<span class="tid">' + num(r.hoan_thanh) + '</span>',
            '<span class="tid">' + num(r.qua_han) + '</span>',
            '<span class="tid">' + num(r.huy) + '</span>',
            '<span class="tid">' + num(r.ton_cuoi_ky) + '</span>',
            '<span class="tid">' + (r.gio_tiep_nhan_tb ? r.gio_tiep_nhan_tb + 'h' : '—') + '</span>',
            '<span class="tid">' + (r.gio_phan_cong_tb ? r.gio_phan_cong_tb + 'h' : '—') + '</span>',
            '<span class="tid">' + (r.gio_xu_ly_tb ? r.gio_xu_ly_tb + 'h' : '—') + '</span>',
            '<span class="tid">' + (r.gio_toan_trinh_tb ? r.gio_toan_trinh_tb + 'h' : '—') + '</span>'
          ] };
        }),
        { icon: 'chart', title: 'Chưa có việc nào trong khoảng này', text: 'Đổi khoảng thời gian rồi xem lại.' }
      )
    });

    var byMonth = ui.block({
      title: 'Diễn biến theo tháng', count: data.months.length, icon: 'calendar',
      body: ui.table(
        [{ label: 'Tháng' }, { label: 'Phát sinh', cls: 'num' }, { label: 'Chuyển tiếp vào', cls: 'num' },
          { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Tồn cuối kỳ', cls: 'num' }],
        data.months.map(function (m) {
          return { cells: [
            '<div class="t1">' + U.esc(m.name || m.month_key) + '</div>' +
            (m.status && m.status !== 'ARCHIVED' ? '<div class="t2">kỳ đang chạy, số liệu còn thay đổi</div>' : ''),
            '<span class="tid">' + num(m.phat_sinh) + '</span>',
            '<span class="tid">' + num(m.chuyen_tiep_vao) + '</span>',
            '<span class="tid">' + num(m.hoan_thanh) + '</span>',
            '<span class="tid">' + num(m.qua_han) + '</span>',
            '<span class="tid">' + num(m.ton_cuoi_ky) + '</span>'
          ] };
        }),
        { icon: 'calendar', title: 'Chưa có kỳ nào', text: 'Khoảng đã chọn chưa có kỳ kế hoạch nào.' }
      )
    });

    return head + strip + byDim + byMonth;
  }

  function exportReport() {
    var data = reportCache && reportCache.data;
    if (!data) { ui.toast('Chưa có số liệu để xuất.', 'err'); return; }
    var groupLabel = (REPORT_GROUPS.filter(function (g) { return g[0] === data.group; })[0] || [])[1] || 'Nhóm';
    var rows = [[groupLabel, 'Phát sinh', 'Chuyển tiếp vào', 'Hoàn thành', 'Quá hạn', 'Hủy', 'Tồn cuối kỳ',
      'Nhận hồ sơ TB (giờ)', 'Phân công TB (giờ)', 'Xử lý TB (giờ)', 'Toàn trình TB (giờ)']];
    data.rows.forEach(function (r) {
      rows.push([r.label, r.phat_sinh, r.chuyen_tiep_vao, r.hoan_thanh, r.qua_han, r.huy, r.ton_cuoi_ky,
        r.gio_tiep_nhan_tb, r.gio_phan_cong_tb, r.gio_xu_ly_tb, r.gio_toan_trinh_tb]);
    });
    rows.push([]);
    rows.push(['Tháng', 'Phát sinh', 'Chuyển tiếp vào', 'Hoàn thành', 'Quá hạn', 'Tồn cuối kỳ']);
    data.months.forEach(function (m) {
      rows.push([m.name || m.month_key, m.phat_sinh, m.chuyen_tiep_vao, m.hoan_thanh, m.qua_han, m.ton_cuoi_ky]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c === undefined ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    LS.app.download('bao-cao-' + data.from + '_' + data.to + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    ui.toast('Đã xuất ' + data.rows.length + ' dòng.');
  }

  /* ============================ Màn: nhật ký ============================ */

  function audit() {
    var u = me();
    var canExport = ['QUAN_LY_LS', 'ADMIN'].indexOf(u.role) !== -1;
    var period = f('audit', 'period', 'week');
    var range = U.periodRange(period, f('audit', 'from', ''), f('audit', 'to', ''), st().settings.week_start);

    var list = visibleEvents().filter(function (e) {
      var t = new Date(e.at).getTime();
      return t >= range.from && t <= range.to;
    });

    if (u.role === 'ADMIN') {
      st().configLog.forEach(function (c) {
        var t = new Date(c.at).getTime();
        if (t >= range.from && t <= range.to) {
          list.push({ event_id: c.id, item_id: '', type: 'CAU_HINH', by: c.by, at: c.at, reason: c.area + ': ' + c.detail });
        }
      });
      list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    }

    var q = String(f('audit', 'q', '')).trim().toLowerCase();
    if (q) {
      list = list.filter(function (e) {
        return (e.item_id + ' ' + D.label(e.type) + ' ' + userName(e.by) + ' ' + e.reason).toLowerCase().indexOf(q) !== -1;
      });
    }

    var periodOpts = [['week', 'Tuần này'], ['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['custom', 'Khoảng ngày']];

    return ui.block({
      title: 'Nhật ký sự kiện', count: list.length, icon: 'history',
      actions: canExport ? ui.btn('Xuất CSV', { act: 'export-csv', icon: 'download', sm: true }) : '',
      note: U.fmtDate(new Date(range.from).toISOString()) + ' – ' + U.fmtDate(new Date(range.to).toISOString()) +
        ' · múi giờ ' + U.esc(st().settings.timezone) +
        (canExport ? '' : ' · chỉ quản lý và quản trị được xuất báo cáo'),
      filters: listSearch('audit', 'Mã việc, người thực hiện, lý do') +
        ui.select('', periodOpts, period, { attrs: ' data-filter-screen="audit" data-filter="period" style="flex:0 1 150px"' }) +
        (period === 'custom'
          ? ui.input('', f('audit', 'from', U.localDate()), { type: 'date', attrs: ' data-filter-screen="audit" data-filter="from" style="flex:0 1 150px"', id: 'ffrom' }) +
          ui.input('', f('audit', 'to', U.localDate()), { type: 'date', attrs: ' data-filter-screen="audit" data-filter="to" style="flex:0 1 150px"', id: 'fto' })
          : ''),
      body: ui.table(
        [{ label: 'Thời gian', cls: 'fit' }, { label: 'Mã việc', cls: 'fit' }, { label: 'Sự kiện', cls: 'fit' }, { label: 'Người thực hiện' }, { label: 'Nội dung' }],
        list.map(function (e) {
          return {
            cells: [
              '<span class="tid">' + U.fmtDT(e.at) + '</span>',
              e.item_id
                ? '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(e.item_id) + '">' + U.esc(e.item_id) + '</button>'
                : '<span class="t2">—</span>',
              ui.tag(D.label(e.type), D.tone(e.type)),
              '<div class="t2">' + U.esc(userName(e.by) || e.by) + '</div>',
              '<div class="t2">' + U.esc(e.reason) + '</div>'
            ]
          };
        }),
        { icon: 'history', title: 'Không có sự kiện trong kỳ đã chọn', text: 'Đổi kỳ báo cáo hoặc xóa từ khóa tìm kiếm.' }
      )
    });
  }

  /* ============================ Hộp thoại: chi tiết ============================ */

  function detail(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i) { ui.toast('Không tìm thấy việc.', 'err'); return; }

    var r = reqOf(i), wt = wtOf(i), u = me();
    var masked = u.role === 'ADMIN';
    var evts = st().events.filter(function (e) { return e.item_id === itemId; });
    var sends = st().outbox.filter(function (o) { return o.item_id === itemId; });
    var acts = actionsFor(i);
    var body = '';

    // Không đưa SLA/hạn xử lý lên màn hồ sơ khách; cán bộ xem bộ đếm giờ làm
    // thực tế ở phần Công việc bên dưới.
    if (i.pending) body += ui.banner('warn', 'Có đề nghị sửa chờ kiểm soát duyệt', i.pending.reason);

    body += ui.sectionTitle('Khách hàng') +
      (masked
        ? '<p class="t2">Vai trò quản trị hệ thống không được xem thông tin khách hàng.</p>'
        : ui.kv([
          ['Tên', r ? r.customer.name : '—'],
          ['CIF', r && r.customer.cif ? r.customer.cif : 'Khách mới'],
          ['Điện thoại', r ? r.customer.phone : ''],
          ['Email', r ? r.customer.email : ''],
          ['Đơn vị gửi', r ? unitName(r.unit_id) : ''],
          ['Người gửi', r ? userName(r.created_by) : '']
        ]) + (r && r.note ? '<p class="t2" style="margin-top:.625rem">Ghi chú: ' + U.esc(r.note) + '</p>' : ''));

    body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Công việc') +
      ui.kv([
        ['Loại việc', wt ? (wt.group || wt.name) : i.work_type_code],
        ['Sản phẩm', productLabel(i)],
        ['Ngày phát sinh', U.fmtDate(i.occurrence_date)],
        ['Trạng thái', ui.statusTag(i.status), true],
        ['Cán bộ xử lý', userName(i.assigned_user_id) || 'Chưa giao'],
        ['Thời gian xử lý khách hàng', D.processingLabel(i, st())],
        ['Hoàn thành', i.completed_at ? U.fmtDT(i.completed_at) : '—'],
        ['Phiên bản', 'v' + i.version]
      ]) + '</div>';

    if (wt && wt.checklist.length) {
      var checklistValues = Array.isArray(i.checklist) ? i.checklist : [];
      var checklistDone = wt.checklist.filter(function (_, idx) { return checklistValues[idx] === true; }).length;
      body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Việc cần làm') +
        '<p class="t2">Đã hoàn thành ' + checklistDone + '/' + wt.checklist.length + ' nhóm. Tích từng nhóm để ghi nhận phần việc và giờ xử lý.</p>' +
        '<div class="f-stack">' + wt.checklist.map(function (c, idx) {
          var canTick = i.assigned_user_id === u.user_id || ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
          return '<label class="chan-check"><input type="checkbox" data-act="checklist-toggle" data-id="' + U.attr(i.item_id) + '" data-index="' + idx + '"' + (checklistValues[idx] === true ? ' checked' : '') + (canTick ? '' : ' disabled') + '><span>' + U.esc(c) + '</span></label>';
        }).join('') + '</div>' +
        (checklistDone === wt.checklist.length ? ui.banner('ok', 'Đã ghi nhận đủ các nhóm việc', 'Bạn có thể bấm nút hoàn thành theo đúng bước của luồng để đóng toàn bộ hồ sơ.') : '') + '</div>';
    }

    if (i.appointment) {
      var ap = i.appointment;
      var chanLabel = (D.REACH_CHANNELS.filter(function (c) { return c.code === ap.channel; })[0] || {}).label ||
        (ap.channel === 'NHOM' ? 'Nhóm Zalo nội bộ' : ap.channel);
      body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Lịch hẹn ký') +
        ui.kv([
          ['Ngày ký', U.fmtDate(ap.date || ap.at)],
          ['Giờ ký', ap.time || U.fmtTime(ap.at)],
          ['Nơi ký', ap.place],
          ['Kênh báo khách', chanLabel]
        ]) +
        (ap.via_group
          ? ui.banner('warn', 'Khách không có kênh liên hệ trực tiếp',
            'Hệ thống nhắn nhóm Zalo nội bộ và gắn thẻ ' +
            (D.officerTag(i, st()) || 'cán bộ phụ trách') + ' để liên hệ mời khách lên ký.')
          : '') +
        '</div>';
    }

    // Tin gửi khách phải do người phụ trách xem trước và xác nhận, nên nút
    // xác nhận nằm ngay trong chi tiết việc chứ không chỉ ở màn quản trị.
    var mayConfirm = i.assigned_user_id === u.user_id || ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
    var waiting = sends.filter(function (o) { return o.status === 'CHO_XAC_NHAN'; });

    if (waiting.length && mayConfirm) {
      body += ui.banner('warn', waiting.length + ' tin đang chờ bạn xác nhận trước khi gửi',
        'Xem trước nội dung rồi mới bấm gửi. Gửi rồi không thu hồi được.');
    }

    body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Tin gửi đi') +
      (sends.length
        ? ui.table(
          [{ label: 'Kênh', cls: 'fit' }, { label: 'Người nhận' }, { label: 'Trạng thái', cls: 'fit' },
          { label: 'Ghi chú' }, { label: '', cls: 'fit' }],
          sends.map(function (o) {
            return {
              cls: o.status === 'CHO_XAC_NHAN' ? 'flag-warn' : (o.status === 'THAT_BAI' ? 'flag' : ''),
              cells: [
                '<div class="t2">' + U.esc(D.CHANNELS[o.channel] ? D.CHANNELS[o.channel].name : o.channel) + '</div>',
                '<div class="t2">' + U.esc(o.recipient_name) + '<br>' + U.esc(U.mask(o.recipient)) + '</div>',
                ui.tag(D.OUT_STATUS[o.status].label, D.OUT_STATUS[o.status].tone),
                '<div class="t2">' + U.esc(o.note || o.provider_id || '—') + '</div>',
                o.status === 'CHO_XAC_NHAN' && mayConfirm
                  ? ui.btn('Xem & gửi', { kind: 'primary', sm: true, act: 'out-confirm', data: ' data-id="' + U.attr(o.outbox_id) + '"' })
                  : ''
              ]
            };
          })
        )
        : '<p class="t2">Chưa phát sinh tin nào cho việc này.</p>') + '</div>';

    body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Lịch sử') +
      ui.timeline(evts.map(function (e) {
        return { title: D.label(e.type), time: U.fmtDT(e.at) + ' · ' + (userName(e.by) || e.by), text: e.reason };
      })) + '</div>';

    body += '<div class="form-end">' +
      (canEdit(i) ? ui.btn('Sửa thông tin', { act: 'edit-item', data: ' data-id="' + U.attr(i.item_id) + '"', icon: 'pencil' }) : '') +
      acts.map(function (a) {
        return ui.btn(a.label, {
          kind: a.primary ? 'primary' : 'line', act: 'flow',
          data: ' data-id="' + U.attr(i.item_id) + '" data-to="' + a.to + '"'
        });
      }).join('') + '</div>';

    ui.openDialog('Việc ' + itemRef(i), body, { size: 'md', sub: (wt ? (wt.group || wt.name) : '') + ' · ' + i.product_name });
  }

  function saveChecklistToggle(itemId, index, checked) {
    var i = U.byId(st().items, 'item_id', itemId), wt = i && wtOf(i);
    if (!i || !wt || !wt.checklist.length || i.syncing) return;
    var before = JSON.parse(JSON.stringify(i)), expected = i.version;
    var values = Array.isArray(i.checklist) ? i.checklist.slice() : [];
    values[index] = !!checked;
    while (values.length < wt.checklist.length) values.push(false);
    i.checklist = values.slice(0, wt.checklist.length);
    i.version = Number(i.version || 1) + 1;
    i.syncing = true;
    if (U.isGas()) {
      LS.app.background(LS.api.saveChecklist(i.item_id, i.checklist, expected), {
        label: 'Ghi nhận nhóm việc',
        onOk: function (result) { i.syncing = false; if (result && result.version) i.version = result.version; detail(i.item_id); },
        rollback: function () { Object.keys(before).forEach(function (k) { i[k] = before[k]; }); detail(i.item_id); }
      });
      return;
    }
    i.syncing = false;
    logEvent(i.item_id, 'CAP_NHAT_CHECKLIST', i.checklist.filter(Boolean).length + '/' + wt.checklist.length + ' nhóm việc đã hoàn thành.');
    U.save();
    detail(i.item_id);
  }

  /* ============================ Hộp thoại: chuyển trạng thái ============================ */

  function flow(itemId, to, opts) {
    opts = opts || {};
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i) return;
    var tr = actionsFor(i).filter(function (a) { return a.to === to; })[0];
    if (!tr) {
      var currentLabel = D.STATUS[i.status] ? D.STATUS[i.status].label : i.status;
      ui.toast('Không thể thực hiện thao tác này khi hồ sơ đang ở trạng thái ' + currentLabel + '. Hãy tải lại danh sách.', 'err');
      return;
    }

    var r = reqOf(i), wt = wtOf(i);
    // Giữ lại trạng thái tại lúc mở hộp thoại để nếu màn hình bị đồng bộ lại
    // trong lúc người dùng đang nhập, lỗi sẽ được báo là xung đột phiên bản
    // thay vì rơi vào thông báo mơ hồ "Thao tác không hợp lệ".
    var body = '<form data-form="flow" data-id="' + U.attr(itemId) + '" data-to="' + U.attr(to) + '" data-from="' + U.attr(i.status) + '" data-version="' + U.attr(i.version) + '">';

    body += '<div class="banner banner-info flow-context">' + U.icon('arrow', 17) +
      '<div><div class="flow-title"><b>' + U.esc(r ? r.customer.name : '') + '</b><span class="t2">' + U.esc(wtGroup(i.work_type_code)) + '</span></div>' +
      '<div class="flow-status" aria-label="Trạng thái phân công">' + ui.statusTag(i.status) + ' <span aria-hidden="true">&rarr;</span> ' + ui.statusTag(to) + '</div></div></div>';

    if (tr.assignee) {
      var staff = staffList();
      if (!staff.length) { ui.toast('Chưa có cán bộ LS đang hoạt động.', 'err'); return; }
      var rec = assignmentRecommendation(i);
      if (opts.quick && rec) body += '<div style="margin-top:.75rem">' + ui.banner('info', 'Đề xuất phân công nhanh', rec.user.full_name + (rec.replacementFor ? ' · thay cho ' + rec.replacementFor.full_name + ' đang nghỉ' : ' · theo cấu hình phụ trách') + (rec.rule && rec.rule.label ? ' — ' + rec.rule.label : '') + '. Bạn vẫn có thể đổi cán bộ trước khi lưu.') + '</div>';
      var loadRows = staff.map(function (x) {
        var load = staffLoad(x.user_id);
        return {
          cells: [
            '<div class="t1">' + U.esc(x.full_name) + '</div><div class="t2">' + U.esc(unitName(x.unit_id)) + '</div>',
            '<span class="tid">' + load.open + '</span>',
            load.late ? ui.tag(String(load.late), 'danger') : '<span class="t2">0</span>',
            '<span class="tid">' + load.done + '</span>'
          ]
        };
      });
      body += '<div style="margin-top:1rem">' + ui.field('Cán bộ phụ trách',
        ui.select('assignee', staff.map(function (x) {
          var load = staffLoad(x.user_id);
          return [x.user_id, x.full_name + ' — đang mở ' + load.open + ' việc'];
        }), (rec ? rec.user.user_id : i.assigned_user_id), { attrs: ' required' })) +
        '<div style="margin-top:.75rem">' + ui.table(
          [{ label: 'Cán bộ LS' }, { label: 'Đang mở', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Đã xong', cls: 'num' }],
          loadRows
        ) + '</div></div>';
    }

    if (tr.appointment) {
      var reach = D.customerReach(r, st());
      var place = D.signPlace(st());

      // Nơi ký là mặc định chung do quản trị đặt — cán bộ chỉ xem, không chọn.
      body += '<div style="margin-top:1rem">' + ui.sectionTitle('Lịch hẹn ký') +
        '<div class="f-row">' +
        ui.field('Ngày ký', ui.input('appt_date', U.localDate(), { type: 'date', required: true }), 'mặc định hôm nay') +
        ui.field('Giờ ký', ui.input('appt_time', D.nextSlot(st()), { type: 'time', required: true })) +
        '</div>' +
        '<p class="t2" style="margin-top:.5rem">Nơi ký: <b>' +
        U.esc(place || 'quản trị chưa đặt nơi ký trong Cấu hình chung') + '</b></p>';

      // Một hàng nhãn chọn kênh; kênh nào khách không có thì khóa lại.
      body += '<div class="f" style="margin-top:.875rem"><label>Kênh báo khách</label>' +
        '<div class="chip-row" role="radiogroup" aria-label="Kênh báo khách">' +
        D.REACH_CHANNELS.map(function (c, idx) {
          var okChan = reach.available.indexOf(c.code) !== -1;
          var checked = okChan && reach.available.indexOf(c.code) === 0;
          return '<label class="chip' + (okChan ? '' : ' is-off') + '">' +
            '<input type="radio" name="appt_channel" value="' + c.code + '"' +
            (checked ? ' checked' : '') + (okChan ? '' : ' disabled') + '>' +
            '<span>' + U.icon(c.icon, 15) + U.esc(c.label) + '</span></label>';
        }).join('') + '</div></div>';

      body += reach.available.length
        ? ui.banner('info', 'Tin cho khách cần bạn xác nhận trước khi gửi',
          'Sau khi lưu, mở lại chi tiết việc để xem trước nội dung rồi mới bấm gửi.')
        : ui.banner('warn', 'Khách chưa có email, Zalo hay số điện thoại',
          'Hệ thống sẽ nhắn vào nhóm Zalo nội bộ, gắn thẻ ' +
          (D.officerTag(i, st()) || userName(i.assigned_user_id) || 'cán bộ phụ trách') +
          ' để liên hệ mời khách lên ký. Nội dung câu nhắn do quản trị cấu hình ở mục Mẫu tin.');

      body += '</div>';
    }

    if (tr.reason && tr.reason !== 'free') {
      var list = st().reasons.filter(function (x) { return x.group === tr.reason && x.active; });
      body += '<div style="margin-top:1rem">' +
        ui.field('Lý do', ui.select('reason_code', list.map(function (x) { return [x.code, x.label]; }), '', { blank: 'Lý do khác…' })) +
        ui.field('Diễn giải thêm', ui.textarea('reason', '', { placeholder: 'Ghi rõ để người nhận biết cần làm gì' }), 'bắt buộc nếu chọn lý do khác') +
        '</div>';
    } else if (tr.reason === 'free') {
      body += '<div style="margin-top:1rem">' +
        ui.field('Lý do', ui.textarea('reason', '', { required: true, placeholder: 'Bắt buộc — được lưu vào nhật ký' })) + '</div>';
    } else if (tr.note) {
      body += '<div style="margin-top:1rem">' +
        ui.field('Ghi chú kết quả', ui.textarea('reason', '', { placeholder: 'Tóm tắt kết quả xử lý' })) + '</div>';
    }

    body += ui.formEnd(tr.label, { danger: to === 'HUY' }) + '</form>';
    ui.openDialog(tr.label, body, { sub: i.item_id });
  }

  function quickAssign(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i) return;
    var tr = actionsFor(i).filter(function (x) { return x.assignee; })[0];
    if (!tr) { ui.toast('Không thể đổi người ở trạng thái này.', 'warn'); return; }
    flow(itemId, tr.to, { quick: true });
  }

  function submitFlow(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    var to = form.getAttribute('data-to');
    if (!i) return;
    // Một lần bấm đã gửi lên GAS thì không cho form/dialog cũ gửi lại lần hai.
    // Trước đây lần bấm thứ hai thấy trạng thái lạc quan đã đổi và hiện
    // "Thao tác không hợp lệ", dù lần đầu vẫn đang được lưu đúng.
    if (i.syncing) return;
    var fromStatus = form.getAttribute('data-from') || i.status;
    var tr = actionsFor(i).filter(function (a) { return a.to === to; })[0];
    if (!tr) {
      var expectedFlow = (D.FLOW[fromStatus] || []).filter(function (a) { return a.to === to; })[0];
      var currentLabel = D.STATUS[i.status] ? D.STATUS[i.status].label : i.status;
      ui.toast(expectedFlow
        ? 'Hồ sơ vừa được cập nhật từ lúc mở hộp thoại (hiện là ' + currentLabel + '). Hãy đóng hộp thoại, tải lại rồi thao tác lại.'
        : 'Không thể thực hiện thao tác này khi hồ sơ đang ở trạng thái ' + currentLabel + '.', 'err');
      return;
    }

    var d = new FormData(form);
    var wt = wtOf(i), r = reqOf(i);
    if (wt && wt.checklist.length && ['DA_SOAN_XONG', 'HOAN_THANH_LS'].indexOf(to) !== -1 &&
        (i.checklist || []).filter(Boolean).length < wt.checklist.length) {
      ui.toast('Hãy tích đủ các nhóm việc trước khi hoàn thành toàn bộ hồ sơ.', 'err');
      return;
    }
    var ts = U.now();
    var reason = String(d.get('reason') || '').trim();

    if (tr.reason && tr.reason !== 'free') {
      var code = String(d.get('reason_code') || '');
      var picked = code ? U.byId(st().reasons, 'code', code) : null;
      if (!picked && !reason) { ui.toast('Chọn lý do hoặc ghi diễn giải.', 'err'); return; }
      reason = (picked ? picked.label : '') + (reason ? (picked ? ' — ' : '') + reason : '');
    }
    if (tr.reason === 'free' && !reason) { ui.toast('Thao tác này bắt buộc ghi lý do.', 'err'); return; }

    var assigneeId = '';
    if (tr.assignee) {
      assigneeId = String(d.get('assignee'));
      var staff = U.byId(st().users, 'user_id', assigneeId);
      if (!staff || staff.role !== 'CAN_BO_LS' || !staff.active) { ui.toast('Người nhận phải là cán bộ LS đang hoạt động.', 'err'); return; }
      reason = 'Giao ' + staff.full_name + (reason ? ' — ' + reason : '');
    }

    var appointment = null;
    if (tr.appointment) {
      var day = String(d.get('appt_date') || '');
      var hour = String(d.get('appt_time') || '');
      if (!day || !hour) { ui.toast('Chưa chọn ngày và giờ ký.', 'err'); return; }

      var place = D.signPlace(st());
      if (!place) { ui.toast('Quản trị chưa đặt nơi ký trong Cấu hình chung.', 'err'); return; }

      // Khách không có kênh nào thì chuyển sang nhắn nhóm nội bộ gắn thẻ cán bộ,
      // thay vì chặn lại — việc vẫn phải đi tiếp, chỉ đổi cách báo.
      var reach2 = D.customerReach(r, st());
      var chosen = String(d.get('appt_channel') || '');
      if (!chosen || reach2.available.indexOf(chosen) === -1) chosen = reach2.fallback;

      appointment = {
        at: new Date(day + 'T' + hour).toISOString(),
        date: day, time: hour, place: place,
        channel: chosen,
        via_group: reach2.available.length === 0,
        officer_id: i.assigned_user_id || ''
      };
      reason = 'Hẹn ký ' + U.fmtDate(day) + ' ' + hour + ' tại ' + place +
        (appointment.via_group ? ' — báo qua nhóm Zalo, gắn thẻ cán bộ phụ trách' : '');
    }

    // Ghi ngay lên màn hình trước khi gọi máy chủ: người phân giao việc không
    // phải ngồi chờ Sheet trả lời mới biết thao tác của mình có ăn hay không.
    var before = JSON.parse(JSON.stringify(i));
    var expected = i.version;

    if (tr.assignee) {
      i.assigned_user_id = assigneeId;
      i.assigned_by = st().session;
      i.assigned_at = ts;
      i.due_at = D.dueFrom(ts, i.work_type_code, st());
    }
    if (appointment) i.appointment = appointment;

    if ((to === 'CHO_PHAN_CONG' || to === 'DA_PHAN_CONG') && !i.accepted_at) i.accepted_at = ts;
    if (to === 'DANG_THUC_HIEN' && !i.processing_started_at) i.processing_started_at = ts;
    if (to === 'HOAN_THANH_LS') i.completed_at = ts;
    if (to === 'DANG_THUC_HIEN' && i.status === 'HOAN_THANH_LS') i.completed_at = '';
    if (tr.note && reason) i.note = reason;

    i.status = to;
    i.version = Number(i.version || 1) + 1;

    var ref = itemRef(i);
    ui.closeDialog();

    if (U.isGas()) {
      i.syncing = true;
      LS.app.render();
      ui.toast(tr.label + ' · ' + ref, 'ok');
      LS.app.background(
        LS.api.transitionItem(i.item_id, to, {
          reason: reason, assignee_id: assigneeId, appointment: appointment,
          expected_version: expected
        }),
        {
          label: tr.label,
          onOk: function () { i.syncing = false; },
          rollback: function () {
            var live = U.byId(st().items, 'item_id', before.item_id);
            if (live) Object.keys(before).forEach(function (k) { live[k] = before[k]; });
          }
        }
      );
      return;
    }

    logEvent(i.item_id, to, reason || tr.label);
    var sent = tr.notify ? D.queueNotifications(i, tr.notify, st(), st().session) : [];
    U.save();
    LS.app.render();

    var blocked = sent.filter(function (x) { return x.status === 'KHONG_GUI'; }).length;
    ui.toast(tr.label + ' · ' + ref + (blocked ? ' — ' + blocked + ' tin không gửi được' : ''), blocked ? 'warn' : 'ok');
  }

  /* ============================ Hộp thoại: sửa việc ============================ */

  function editItem(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canEdit(i)) { ui.toast('Không có quyền sửa việc này.', 'err'); return; }
    var r = reqOf(i);
    var approval = editNeedsApproval(i);

    ui.openDialog('Sửa việc',
      (approval ? ui.banner('warn', 'Việc đã vào LS xử lý',
        'Thay đổi sẽ thành đề nghị chờ kiểm soát duyệt, không có hiệu lực ngay.') : '') +
      '<form data-form="edit-item" data-id="' + U.attr(i.item_id) + '">' +
      '<div style="margin-top:.875rem">' + ui.sectionTitle('Khách hàng') +
      '<div class="f-row customer-fields">' +
      ui.field('Tên khách hàng', ui.input('customer.name', r.customer.name, { required: true })) +
      ui.field('Mã CIF', ui.input('customer.cif', r.customer.cif), 'để trống nếu chưa được cấp') +
      ui.field('Điện thoại', ui.input('customer.phone', r.customer.phone, { type: 'tel' })) +
      ui.field('Email', ui.input('customer.email', r.customer.email, { type: 'email' })) +
      '</div></div>' +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Công việc') +
      '<div class="f-row">' +
      ui.field('Loại việc', ui.select('work_type_group', workTypeGroups(), (wtOf(i) && (wtOf(i).group || wtOf(i).name)) || '', { attrs: ' data-role="work-type-group" required' })) +
      ui.field('Sản phẩm', ui.select('work_type_code', productOptions((wtOf(i) && (wtOf(i).group || wtOf(i).name)) || '', i.work_type_code), i.work_type_code, { attrs: ' data-role="work-type-product" required' }), 'chọn sản phẩm thuộc đúng loại việc') +
      ui.field('Ngày phát sinh', ui.input('occurrence_date', i.occurrence_date, { type: 'date', required: true })) +
      '</div></div>' +
      '<div style="margin-top:1.125rem">' +
      ui.field('Lý do sửa', ui.input('reason', '', { required: true, placeholder: 'Bổ sung số điện thoại, đổi loại việc…' })) +
      '</div>' +
      ui.formEnd(approval ? 'Gửi đề nghị sửa' : 'Lưu thay đổi') + '</form>',
      { size: 'md', sub: i.item_id });
  }

  function submitEdit(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    if (!i || !canEdit(i)) { ui.toast('Không có quyền sửa việc này.', 'err'); return; }
    var r = reqOf(i);
    var d = new FormData(form);
    var reason = String(d.get('reason')).trim();
    var changes = {};
    var selectedWt = U.byId(st().workTypes, 'code', String(d.get('work_type_code') || ''));
    if (!selectedWt || (selectedWt.group || selectedWt.name) !== String(d.get('work_type_group') || '')) {
      ui.toast('Sản phẩm không thuộc loại việc đã chọn.', 'err'); return;
    }

    ['work_type_code', 'occurrence_date'].forEach(function (k) {
      var v = String(d.get(k));
      if (v !== String(i[k])) changes[k] = v;
    });
    var selectedProduct = selectedWt ? selectedWt.name : '';
    if (selectedProduct !== String(i.product_name || '')) changes.product_name = selectedProduct;
    ['name', 'cif', 'phone', 'email'].forEach(function (k) {
      var v = String(d.get('customer.' + k) || '').trim();
      if (v !== String(r.customer[k] || '')) changes['customer.' + k] = v;
    });

    if (!Object.keys(changes).length) { ui.toast('Không có thay đổi nào.', 'warn'); return; }

    if (U.isGas()) {
      LS.api.proposeRevision(i.item_id, changes, reason).then(function (result) {
        ui.closeDialog();
        return LS.app.refreshServer(result.applied ? 'Đã lưu thay đổi.' : 'Đã gửi đề nghị sửa cho kiểm soát.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể lưu thay đổi.', 'err'); });
      return;
    }

    if (editNeedsApproval(i)) {
      i.pending = { fields: changes, by: st().session, at: U.now(), reason: reason };
      logEvent(i.item_id, 'DE_NGHI_SUA', reason);
      D.queueNotifications(i, 'DE_NGHI_SUA', st(), st().session);
      ui.toast('Đã gửi đề nghị sửa cho kiểm soát.');
    } else {
      applyChanges(i, changes);
      i.version += 1;
      logEvent(i.item_id, 'SUA_THONG_TIN', reason + ' (' +
        Object.keys(changes).map(function (k) { return FIELD_LABEL[k] || k; }).join(', ') + ')');
      ui.toast('Đã lưu thay đổi.');
    }
    U.save();
    ui.closeDialog();
    LS.app.render();
  }

  function applyChanges(item, changes) {
    var r = reqOf(item);
    Object.keys(changes).forEach(function (k) {
      if (k.indexOf('customer.') === 0) r.customer[k.slice(9)] = changes[k];
      else item[k] = changes[k];
    });
    if (changes.work_type_code && item.assigned_at) {
      item.due_at = D.dueFrom(item.assigned_at, item.work_type_code, st());
      var wt = wtOf(item);
      item.checklist = (wt ? wt.checklist : []).map(function () { return false; });
    }
    if (r.customer.cif) r.customer.kind = 'DA_CO_CIF';
  }

  function revision(itemId, approve) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !i.pending) return;
    if (['KS_LS', 'QUAN_LY_LS'].indexOf(me().role) === -1) { ui.toast('Chỉ kiểm soát được duyệt.', 'err'); return; }

    if (U.isGas()) {
      LS.api.resolveRevision(itemId, approve, '').then(function () {
        return LS.app.refreshServer(approve ? 'Đã áp dụng thay đổi.' : 'Đã từ chối đề nghị.');
      }).catch(function (error) { ui.toast(error.message || 'Không thể duyệt đề nghị.', 'err'); });
      return;
    }

    if (approve) {
      applyChanges(i, i.pending.fields);
      i.version += 1;
      logEvent(itemId, 'DUYET_SUA', 'Duyệt đề nghị của ' + userName(i.pending.by) + '.');
      ui.toast('Đã áp dụng thay đổi.');
    } else {
      logEvent(itemId, 'TU_CHOI_SUA', 'Từ chối đề nghị của ' + userName(i.pending.by) + '.');
      ui.toast('Đã từ chối đề nghị.');
    }
    i.pending = null;
    U.save();
    LS.app.render();
  }

  /* ============================ Hộp thoại: đăng ký việc mới ============================ */

  function catalogOptions(key, unitId) {
    var rows = (st().catalogOptions || []).filter(function (x) {
      return x.catalog_key === key && x.active && (!unitId || !x.unit_id || x.unit_id === unitId);
    }).sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });
    return rows;
  }

  function workTypeGroups() {
    var seen = {};
    return st().workTypes.filter(function (w) { return w.active; }).sort(function (a, b) {
      return (a.sort_order || 9999) - (b.sort_order || 9999);
    }).reduce(function (out, w) {
      var group = w.group || w.name;
      if (!seen[group]) { seen[group] = true; out.push([group, group]); }
      return out;
    }, []);
  }

  function productOptions(group, selectedCode) {
    return st().workTypes.filter(function (w) {
      return w.active && (!group || (w.group || w.name) === group);
    }).sort(function (a, b) {
      return (a.sort_order || 9999) - (b.sort_order || 9999);
    }).map(function (w) { return [w.code, w.name]; });
  }

  function syncProductOptions(groupSelect, selectedCode) {
    var row = groupSelect && groupSelect.closest('.row-item');
    var product = row && row.querySelector('[data-role="work-type-product"]');
    if (!product) return;
    var options = productOptions(groupSelect.value, selectedCode);
    product.innerHTML = '<option value="">Chọn sản phẩm</option>' + options.map(function (op) {
      return '<option value="' + U.attr(op[0]) + '"' + (String(op[0]) === String(selectedCode || '') ? ' selected' : '') + '>' + U.esc(op[1]) + '</option>';
    }).join('');
  }

  function rowForm(idx) {
    return '<div class="row-item">' +
      ui.field('Loại việc', ui.select('wg_' + idx, workTypeGroups(), '', { attrs: ' data-role="work-type-group" required' })) +
      ui.field('Sản phẩm', ui.select('wt_' + idx, [], '', { blank: 'Chọn sản phẩm', attrs: ' data-role="work-type-product" required' })) +
      ui.field('Ngày phát sinh', ui.input('dt_' + idx, U.localDate(), { type: 'date', required: true })) +
      ui.iconBtn('trash', { act: 'del-row', label: 'Xóa dòng việc' }) +
      '</div>';
  }

  function newRequest() {
    var u = me() || { full_name: '', unit_id: '' };
    ui.openDialog('Đăng ký việc mới',
      '<form data-form="new-request">' +
      ui.sectionTitle('Khách hàng') +
      '<div class="f-row customer-fields">' +
      ui.field('Tên khách hàng', ui.input('name', '', { required: true })) +
      ui.field('Mã CIF', ui.input('cif', '', { id: 'cifInput' })) +
      ui.field('Điện thoại', ui.input('phone', '', { type: 'tel', placeholder: '09xx xxx xxx' })) +
      ui.field('Email', ui.input('email', '', { type: 'email' })) +
      '</div>' +

      '<div style="margin-top:1rem">' + ui.sectionTitle('Mức ưu tiên') +
      '<div class="f-row">' +
      ui.checkbox('priority_vip', false, 'Khách hàng VIP') +
      ui.checkbox('priority_important', false, 'Quan trọng') +
      ui.checkbox('priority_urgent', false, 'Xử lý gấp') +
      '</div></div>' +

      '<div style="margin-top:1.25rem">' + ui.sectionTitle('Danh sách việc') +
      '<div class="rows" id="rows">' + rowForm(0) + '</div>' +
      ui.btn('Thêm dòng việc', { act: 'add-row', icon: 'plus', sm: true, kind: 'line' }) +
      '</div>' +

      '<div style="margin-top:1.25rem">' +
      ui.field('Ghi chú cho LS', ui.textarea('note', '', { placeholder: 'Thông tin cần kiểm soát lưu ý' })) +
      '</div>' +
      ui.formEnd('Gửi sang LS') + '</form>',
      { size: 'md', sub: 'Một hồ sơ, nhiều việc' });
  }

  function submitNewRequest(form) {
    var u = me();
    var d = new FormData(form);
    var rows = form.querySelectorAll('.row-item');
    if (!rows.length) { ui.toast('Cần ít nhất một dòng việc.', 'err'); return; }

    var cif = String(d.get('cif') || '').trim();
    var kind = cif ? 'DA_CO_CIF' : 'KH_MOI';
    var payload = {
      customer: {
        name: String(d.get('name')).trim(), kind: kind,
        cif: cif,
        phone: String(d.get('phone') || '').trim(), email: String(d.get('email') || '').trim(),
        priority_flags: ['VIP', 'QUAN_TRONG', 'XU_LY_GAP'].filter(function (x, idx) { return d.get(['priority_vip', 'priority_important', 'priority_urgent'][idx]) !== null; })
      },
      requestor: { id: u && u.user_id ? u.user_id : '', name: u && u.full_name ? u.full_name : '', kind: u && u.role ? u.role : 'VRM_PRM' },
      note: String(d.get('note') || '').trim(), items: []
    };
    Array.prototype.forEach.call(rows, function (row) {
      var group = row.querySelector('[data-role="work-type-group"]');
      var product = row.querySelector('[data-role="work-type-product"]');
      var date = row.querySelector('[name^="dt_"]');
      var wt = U.byId(st().workTypes, 'code', product.value);
      payload.items.push({
        work_type_code: product.value,
        product_name: wt ? wt.name : '',
        work_type_group: group.value,
        occurrence_date: date.value
      });
    });
    if (!payload.customer.name || payload.items.some(function (item) {
      var wt = U.byId(st().workTypes, 'code', item.work_type_code);
      return !item.work_type_code || !item.product_name || !item.occurrence_date || !wt || (wt.group || wt.name) !== item.work_type_group;
    })) {
      ui.toast('Hãy điền đủ khách hàng, loại việc, sản phẩm và ngày phát sinh.', 'err'); return;
    }
    if (U.isGas()) {
      // Dựng ngay dòng tạm trên màn hình rồi mới gọi máy chủ. Mã việc thật do
      // máy chủ cấp nên dòng tạm bị khóa thao tác cho tới khi có mã trả về.
      var tmpReq = 'TAM_REQ_' + Date.now().toString(36).toUpperCase();
      var tmpIds = [];

      st().requests.unshift({
        request_id: tmpReq, unit_id: u.unit_id, created_by: u.user_id, created_at: U.now(),
        note: payload.note, customer: payload.customer, requestor: payload.requestor
      });

      payload.items.forEach(function (it, idx) {
        var wt = U.byId(st().workTypes, 'code', it.work_type_code);
        var tmpId = tmpReq + '_' + (idx + 1);
        tmpIds.push(tmpId);
        st().items.unshift({
          item_id: tmpId, request_id: tmpReq, work_type_code: it.work_type_code,
          product_name: it.product_name, occurrence_date: it.occurrence_date,
          status: 'CHO_TIEP_NHAN', assigned_user_id: '', assigned_by: '',
          submitted_at: U.now(), accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: '',
          appointment: null, checklist: (wt ? wt.checklist : []).map(function () { return false; }),
          note: '', pending: null, version: 1, syncing: true
        });
      });

      ui.closeDialog();
      LS.app.render();
      ui.toast('Đang gửi ' + payload.items.length + ' việc sang LS…', 'ok');

      LS.app.background(LS.api.createRequest(payload), {
        label: 'Đăng ký việc mới',
        onOk: function (result) {
          var ids = (result && result.item_ids) || [];
          var req = U.byId(st().requests, 'request_id', tmpReq);
          if (req) req.request_id = result.request_id;
          tmpIds.forEach(function (tmp, idx) {
            var row = U.byId(st().items, 'item_id', tmp);
            if (!row) return;
            row.item_id = ids[idx] || tmp;
            row.request_id = result.request_id;
            row.syncing = false;
          });
          LS.app.render();
          ui.toast('Đã gửi ' + (ids.length || payload.items.length) + ' việc sang LS.', 'ok');
        },
        rollback: function () {
          st().requests = st().requests.filter(function (r) { return r.request_id !== tmpReq; });
          st().items = st().items.filter(function (i) { return tmpIds.indexOf(i.item_id) === -1; });
        }
      });
      return;
    }

    var reqId = U.uid('REQ');

    st().requests.unshift({
      request_id: reqId, unit_id: u.unit_id, created_by: u.user_id, created_at: U.now(),
      note: String(d.get('note') || '').trim(),
      customer: {
        name: String(d.get('name')).trim(), kind: kind,
        cif: cif,
        phone: String(d.get('phone') || '').trim(),
        email: String(d.get('email') || '').trim(),
        priority_flags: payload.customer.priority_flags
      },
      requestor: { id: u.user_id, kind: u.role || 'VRM_PRM', name: u.full_name || '' }
    });

    var n = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var sel = row.querySelector('[data-role="work-type-product"]');
      var date = row.querySelector('[name^="dt_"]');
      var wt = U.byId(st().workTypes, 'code', sel.value);
      var id = U.uid('ITEM');
      st().items.unshift({
        item_id: id, request_id: reqId, work_type_code: sel.value,
        product_name: wt ? wt.name : '', occurrence_date: date.value,
        status: 'CHO_TIEP_NHAN', assigned_user_id: '', assigned_by: '',
        submitted_at: U.now(), accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: '',
        appointment: null, checklist: (wt ? wt.checklist : []).map(function () { return false; }),
        note: '', pending: null, version: 1
      });
      logEvent(id, 'TAO_VIEC', unitName(u.unit_id) + ' đăng ký yêu cầu.');
      n += 1;
    });

    U.save();
    ui.closeDialog();
    LS.app.render();
    ui.toast('Đã gửi ' + n + ' việc sang LS.');
  }

  /* ============================ Xuất dữ liệu ============================ */

  function exportCsv() {
    var u = me();
    if (['QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) { ui.toast('Không có quyền xuất báo cáo.', 'err'); return; }
    var limit = st().settings.export_row_limit;
    var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['ma_su_kien', 'ma_viec', 'su_kien', 'nguoi_thuc_hien', 'thoi_gian', 'noi_dung'].join(',')];

    visibleEvents().slice(0, limit).forEach(function (e) {
      rows.push([e.event_id, e.item_id, D.label(e.type), userName(e.by) || e.by, U.fmtDT(e.at), e.reason].map(q).join(','));
    });

    LS.app.download('nhat_ky_ls_' + U.localDate() + '.csv', rows.join('\r\n'), 'text/csv');
    // Xuất báo cáo cũng phải lưu vết: ai xuất, lúc nào, bao nhiêu dòng.
    LS.admin.logCfg('Báo cáo', 'Xuất nhật ký CSV, ' + (rows.length - 1) + ' dòng.');
    U.save();
    ui.toast('Đã xuất ' + (rows.length - 1) + ' dòng.');
  }

  /* ============================ Quét quá hạn ============================ */

  /** Chạy một lần mỗi phiên: việc vừa quá hạn thì phát thông báo theo quy tắc. */
  function sweepOverdue() {
    var changed = false;
    st().items.forEach(function (i) {
      var s = D.sla(i, st());
      if (!s || !s.late) return;
      var made = D.queueNotifications(i, 'QUA_HAN', st(), null);
      if (made.length) changed = true;
    });
    if (changed) U.save();
  }

  return {
    work: work, room: room, roomBoard: roomBoard, queue: queue, mine: mine, personalDashboard: personalDashboard, board: board, periods: periods, audit: audit,
    report: report, exportReport: exportReport, refreshReport: refreshReport, setReportFilter: setReportFilter,
    headerSummary: headerSummary,
    detail: detail, saveChecklistToggle: saveChecklistToggle, flow: flow, quickAssign: quickAssign, submitFlow: submitFlow,
    editItem: editItem, submitEdit: submitEdit, revision: revision,
    newRequest: newRequest, submitNewRequest: submitNewRequest, rowForm: rowForm, syncProductOptions: syncProductOptions,
    exportCsv: exportCsv, downloadDailyImage: downloadDailyImage, sweepOverdue: sweepOverdue,
    visibleItems: visibleItems, setFilter: setFilter, toggleSort: toggleSort, resetFilters: resetFilters, resetFilter: resetFilter, openFilter: openFilter, setDraftFilter: setDraftFilter, applyFilter: applyFilter, applyReportFilter: applyReportFilter,
    staffList: staffList, userName: userName, unitName: unitName, itemLabel: itemLabel, itemRef: itemRef,
    roomShowBacklog: roomShowBacklog
  };
})();
