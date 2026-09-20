/**
 * DataRepository.gs — truy xuất kho dữ liệu Google Sheet.
 *
 * Hai quy ước quan trọng:
 *
 * 1. Mọi thao tác ghi chạy trong một lần giữ khóa duy nhất. Các hàm hậu tố `_`
 *    là nội bộ, giả định khóa đã được giữ — gọi LockService lần thứ hai trong
 *    cùng một lượt chạy sẽ tự chặn chính nó.
 *
 * 2. Mỗi tab chỉ đọc từ Sheet **một lần** cho mỗi lượt chạy. Một lệnh phân công
 *    đụng tới WorkItems, Requests, Users, WorkTypes, NotifyRules, Templates,
 *    Channels và NotificationOutbox; không có bộ nhớ đệm thì đó là hàng chục
 *    lần đọc toàn bảng cho một cú bấm nút.
 */
var DataRepository = (function () {
  var LOCK_MS = 20000;
  var PROP_SHEET_ID = 'LS_SHEET_ID';

  var book_ = null;
  var cache = {};   // tên tab -> { sheet, headers, values }
  var reads = 0;    // đếm số lần thực sự chạm Sheet, dùng khi đo tốc độ

  function book() {
    if (book_) return book_;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
      if (!id) throw new Error('Chưa cấu hình kho dữ liệu. Đặt thuộc tính script ' + PROP_SHEET_ID + '.');
      ss = SpreadsheetApp.openById(id);
    }
    book_ = ss;
    return ss;
  }

  function sheet_(name) {
    var s = book().getSheetByName(name);
    if (!s) throw new Error('Không tìm thấy bảng dữ liệu: ' + name);
    return s;
  }

  /** Đọc một tab, dùng lại kết quả trong cùng lượt chạy. */
  function load_(name) {
    if (cache[name]) return cache[name];
    var s = sheet_(name);
    var values = s.getLastRow() > 0 ? s.getDataRange().getValues() : [[]];
    reads += 1;
    cache[name] = { sheet: s, headers: values[0] || [], values: values };
    return cache[name];
  }

  function invalidate_(name) { delete cache[name]; }

  function toObject_(headers, row) {
    var o = {};
    for (var j = 0; j < headers.length; j++) o[headers[j]] = row[j];
    return o;
  }

  function rowsToObjects_(name) {
    var c = load_(name);
    var out = [];
    for (var i = 1; i < c.values.length; i++) out.push(toObject_(c.headers, c.values[i]));
    return out;
  }

  /**
   * Chỉ lấy `limit` dòng cuối. Events và NotificationOutbox chỉ thêm, không xóa;
   * đọc trọn bảng để rồi hiển thị vài trăm dòng là cách chắc chắn làm chậm dần
   * theo từng tháng vận hành.
   */
  function tail_(name, limit) {
    var s = sheet_(name);
    var last = s.getLastRow();
    var cols = s.getLastColumn();
    if (last <= 1 || cols === 0) return [];

    var headers = s.getRange(1, 1, 1, cols).getValues()[0];
    var take = Math.min(limit || 500, last - 1);
    var start = last - take + 1;
    var values = s.getRange(start, 1, take, cols).getValues();
    reads += 1;

    var out = [];
    for (var i = values.length - 1; i >= 0; i--) out.push(toObject_(headers, values[i]));
    return out;
  }

  function append_(name, obj) {
    var c = load_(name);
    var row = [];
    for (var j = 0; j < c.headers.length; j++) {
      var v = obj[c.headers[j]];
      row.push(v !== undefined && v !== null ? v : '');
    }
    c.sheet.appendRow(row);
    c.values.push(row);  // giữ bộ nhớ đệm đúng với Sheet trong cùng lượt chạy
  }

  function findRow_(name, keyCol, keyVal) {
    var c = load_(name);
    var col = c.headers.indexOf(keyCol);
    if (col === -1) throw new Error('Bảng ' + name + ' không có cột ' + keyCol + '.');
    for (var i = 1; i < c.values.length; i++) {
      if (String(c.values[i][col]) === String(keyVal)) {
        return { name: name, sheet: c.sheet, headers: c.headers, rowIndex: i + 1, object: toObject_(c.headers, c.values[i]) };
      }
    }
    return null;
  }

  /** Ghi cả nhóm ô liền nhau trong một lệnh thay vì mỗi ô một lệnh. */
  function write_(found, fields) {
    var c = cache[found.name];
    var keys = Object.keys(fields).filter(function (k) { return found.headers.indexOf(k) !== -1; });
    if (!keys.length) return;

    var cols = keys.map(function (k) { return found.headers.indexOf(k); });
    var min = Math.min.apply(null, cols);
    var max = Math.max.apply(null, cols);

    var row = c ? c.values[found.rowIndex - 1].slice() : null;
    if (!row) {
      row = found.sheet.getRange(found.rowIndex, 1, 1, found.headers.length).getValues()[0];
    }
    keys.forEach(function (k) { row[found.headers.indexOf(k)] = fields[k]; });

    found.sheet.getRange(found.rowIndex, min + 1, 1, max - min + 1)
      .setValues([row.slice(min, max + 1)]);

    if (c) c.values[found.rowIndex - 1] = row;
  }

  /** Chạy fn trong một lần giữ khóa; fn nhận các hàm nội bộ không khóa. */
  function tx(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(LOCK_MS);
    try {
      return fn({
        append: append_, find: findRow_, write: write_,
        rows: rowsToObjects_, tail: tail_, invalidate: invalidate_
      });
    } finally {
      lock.releaseLock();
    }
  }

  return {
    getAll: rowsToObjects_,
    tail: tail_,
    find: function (name, keyCol, keyVal) {
      var f = findRow_(name, keyCol, keyVal);
      return f ? f.object : null;
    },
    insert: function (name, obj) { return tx(function (t) { t.append(name, obj); return true; }); },
    tx: tx,
    sheetReads: function () { return reads; },
    clearCache: function () { cache = {}; },
    setSheetId: function (id) { PropertiesService.getScriptProperties().setProperty(PROP_SHEET_ID, id); }
  };
})();
