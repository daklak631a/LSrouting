/**
 * charts.js — đồ thị dựng bằng HTML/CSS, không thư viện ngoài.
 *
 * Chọn HTML thay vì SVG co giãn: chữ luôn nét và đúng cỡ trên điện thoại, đồ thị
 * tự co theo khung, và GAS không phải tải thêm gì. Mỗi đồ thị đều kèm bảng số
 * liệu (mở bằng "Xem bảng số liệu") nên không có số nào chỉ đọc được bằng màu.
 *
 * Màu theo vai trò, không theo thứ hạng: --viz-1 teal, --viz-2 cam, --viz-3 xanh
 * dương — bộ ba đã chạy kiểm tra mù màu (validate_palette) trên nền trắng.
 * Chữ, số, chú giải luôn dùng màu chữ; ô màu bên cạnh mới mang nhận diện.
 */
LS.charts = (function () {
  'use strict';

  var U = LS;

  function niceStep(raw) {
    if (raw <= 1) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  /** Trục tròn số: 0 → max đẹp, khoảng 4 vạch. */
  function ticks(max, integer) {
    if (!(max > 0)) return { max: integer ? 4 : 1, list: integer ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1] };
    var step = niceStep(max / 4);
    if (integer) step = Math.max(1, Math.round(step));
    var top = Math.ceil(max / step) * step, list = [];
    for (var v = 0; v <= top + 1e-9; v += step) list.push(Math.round(v * 100) / 100);
    return { max: top, list: list };
  }

  function fmt(v, unit) {
    var n = Math.round(Number(v || 0) * 10) / 10;
    return n.toLocaleString('vi-VN') + (unit || '');
  }

  function legend(series) {
    if (series.length < 2) return '';
    return '<div class="viz-legend">' + series.map(function (s, i) {
      return '<span class="viz-key"><i class="viz-sw" style="background:var(--viz-' + (s.slot || i + 1) + ')"></i>' + U.esc(s.name) + '</span>';
    }).join('') + '</div>';
  }

  function head(o) {
    return '<figcaption class="viz-head"><div><div class="viz-title">' + U.esc(o.title) + '</div>' +
      (o.sub ? '<div class="viz-sub">' + U.esc(o.sub) + '</div>' : '') + '</div>' + legend(o.series) + '</figcaption>';
  }

  function dataTable(o, labels) {
    return '<details class="viz-table"><summary>Xem bảng số liệu</summary><div class="tw"><table class="t"><thead><tr><th>' +
      U.esc(o.labelHead || '') + '</th>' + o.series.map(function (s) { return '<th class="num">' + U.esc(s.name) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + labels.map(function (l, i) {
        return '<tr><td>' + U.esc(l) + '</td>' + o.series.map(function (s) { return '<td class="num"><span class="tid">' + fmt(s.values[i], o.unit) + '</span></td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  function empty(o) {
    return '<figure class="viz">' + head({ title: o.title, sub: o.sub, series: [] }) +
      '<div class="viz-empty">' + U.esc(o.emptyText || 'Chưa có dữ liệu trong kỳ đã chọn.') + '</div></figure>';
  }

  function tip(label, series, i, unit) {
    return label + '\n' + series.map(function (s) { return s.name + ': ' + fmt(s.values[i], unit); }).join('\n');
  }

  /**
   * Cột đứng theo thời gian, một trục. o = { title, sub, labels[], series:[{name, values[]}],
   * unit, integer, labelHead }. Tối đa 3 chuỗi; nhãn trục X tự thưa bớt khi quá dày.
   */
  function columns(o) {
    var labels = o.labels || [];
    var total = 0, max = 0, peak = { i: -1, v: -1 };
    o.series.forEach(function (s) { s.values.forEach(function (v, i) { total += v || 0; if (v > max) max = v; if (v > peak.v) peak = { i: i, v: v, s: s }; }); });
    if (!labels.length || !total) return empty(o);
    var ax = ticks(max, o.integer !== false);
    var every = Math.max(1, Math.ceil(labels.length / 12));
    var grid = ax.list.map(function (t) {
      return '<div class="viz-grid" style="bottom:' + (t / ax.max * 100) + '%"><span>' + fmt(t) + '</span></div>';
    }).join('');
    var groups = labels.map(function (l, i) {
      var bars = o.series.map(function (s, k) {
        var v = s.values[i] || 0;
        var isPeak = peak.i === i && peak.s === s;
        return '<i class="viz-col" style="height:' + (v / ax.max * 100) + '%;background:var(--viz-' + (s.slot || k + 1) + ')">' +
          (isPeak && v ? '<b class="viz-cap">' + fmt(v, o.unit) + '</b>' : '') + '</i>';
      }).join('');
      return '<div class="viz-g" tabindex="-1" data-tip="' + U.attr(tip(l, o.series, i, o.unit)) + '" aria-label="' + U.attr(tip(l, o.series, i, o.unit).replace(/\n/g, ', ')) + '">' +
        '<div class="viz-bars">' + bars + '</div>' +
        '<div class="viz-xl">' + (i % every === 0 ? U.esc(l) : '') + '</div></div>';
    }).join('');
    return '<figure class="viz">' + head(o) +
      '<div class="viz-cols"><div class="viz-plot">' + grid + '</div><div class="viz-groups" style="--n:' + labels.length + '">' + groups + '</div></div>' +
      dataTable(o, labels) + '</figure>';
  }

  /**
   * Thanh ngang, một hoặc nhiều chuỗi xếp chồng. o = { title, sub, rows:[{label, note}],
   * series:[{name, values[]}], unit, sort }. Số tổng ghi ở đầu thanh.
   */
  function bars(o) {
    var rows = (o.rows || []).map(function (r, i) {
      var sum = o.series.reduce(function (n, s) { return n + (s.values[i] || 0); }, 0);
      return { r: r, i: i, sum: sum };
    });
    if (!rows.some(function (x) { return x.sum > 0; })) return empty(o);
    if (o.sort) rows.sort(function (a, b) { return b.sum - a.sum; });
    var max = Math.max.apply(null, rows.map(function (x) { return x.sum; }));
    var body = rows.map(function (x) {
      var segs = o.series.map(function (s, k) {
        var v = s.values[x.i] || 0;
        return v ? '<i class="viz-seg" style="flex:' + v + ' 0 0;background:var(--viz-' + (s.slot || k + 1) + ')"></i>' : '';
      }).join('');
      return '<div class="viz-row" data-tip="' + U.attr(tip(x.r.label, o.series, x.i, o.unit)) + '">' +
        '<div class="viz-rl"><span class="t1">' + U.esc(x.r.label) + '</span>' + (x.r.note ? '<span class="t2">' + U.esc(x.r.note) + '</span>' : '') + '</div>' +
        '<div class="viz-track"><div class="viz-fill" style="width:' + (max ? x.sum / max * 100 : 0) + '%">' + segs + '</div>' +
        '<span class="viz-val">' + fmt(x.sum, o.unit) + '</span></div></div>';
    }).join('');
    return '<figure class="viz">' + head(o) + '<div class="viz-hbars">' + body + '</div>' +
      dataTable(o, (o.rows || []).map(function (r) { return r.label; })) + '</figure>';
  }

  /* ---------------------------- Chú thích nổi khi rê/chọn ---------------------------- */

  var tipEl = null;

  function showTip(target) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'viz-tip';
      tipEl.setAttribute('role', 'status');
      document.body.appendChild(tipEl);
    }
    var lines = String(target.getAttribute('data-tip') || '').split('\n');
    tipEl.innerHTML = '<b>' + U.esc(lines[0]) + '</b>' + lines.slice(1).map(function (l) { return '<div>' + U.esc(l) + '</div>'; }).join('');
    tipEl.classList.add('on');
    var r = target.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    var y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }

  function hideTip() { if (tipEl) tipEl.classList.remove('on'); }

  function bind() {
    document.addEventListener('mouseover', function (ev) {
      var t = ev.target.closest && ev.target.closest('.viz [data-tip]');
      if (t) showTip(t); else hideTip();
    });
    document.addEventListener('focusin', function (ev) {
      var t = ev.target.closest && ev.target.closest('.viz [data-tip]');
      if (t) showTip(t); else hideTip();
    });
    window.addEventListener('scroll', hideTip, true);
  }

  /* ---------------------------- Chia khoảng thời gian ---------------------------- */

  /**
   * Chia [fromDate, toDate] thành các ô ngày / tuần / tháng tùy độ dài, để một đồ
   * thị năm không thành 365 cột li ti. Trả { labels, keyOf(dateStr) → index }.
   */
  function buckets(fromDate, toDate) {
    var a = new Date(fromDate + 'T00:00:00'), b = new Date(toDate + 'T00:00:00');
    var days = Math.round((b - a) / 86400000) + 1;
    var mode = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
    var labels = [], index = {};
    var d = new Date(a.getTime());
    if (mode === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (mode === 'month') d.setDate(1);
    while (d <= b) {
      var key = U.localDate(d);
      index[key] = labels.length;
      labels.push(mode === 'month' ? 'T' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2)
        : (mode === 'week' ? 'Tuần ' : '') + U.pad(d.getDate()) + '/' + U.pad(d.getMonth() + 1));
      if (mode === 'day') d.setDate(d.getDate() + 1);
      else if (mode === 'week') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
    }
    function keyOf(value) {
      if (!value) return -1;
      var x = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
      if (!isFinite(x.getTime()) || x < a || x > new Date(b.getTime() + 86399999)) return -1;
      if (mode === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      if (mode === 'month') x.setDate(1);
      var k = index[U.localDate(x)];
      return k === undefined ? -1 : k;
    }
    return { mode: mode, labels: labels, keyOf: keyOf };
  }

  return { columns: columns, bars: bars, buckets: buckets, bind: bind };
})();
