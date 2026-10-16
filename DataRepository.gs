/**
 * DataRepository.gs — truy xuất kho dữ liệu Google Sheet.
 *
 * Bốn quy ước quan trọng:
 *
 * 1. Mọi thao tác ghi chạy trong một lần giữ khóa duy nhất (`tx`). Khóa này là
 *    hàng chờ phía máy chủ: nhiều người bấm cùng lúc thì lần lượt vào, không ai
 *    ghi đè ai. Vì vậy phần giữ khóa phải thật ngắn — việc nặng (đồng bộ Sheet kế
 *    hoạch, tab thời gian) chạy ở trigger nền, không chạy trong khóa.
 *
 * 2. Mỗi tab chỉ đọc từ Sheet **một lần** cho mỗi lượt chạy. Dữ liệu đọc *ngoài*
 *    khóa có thể đã cũ khi vào khóa, nên `tx` bỏ các bản đọc đó và đọc lại —
 *    ghi dựa trên bản cũ là cách âm thầm ghi đè thay đổi của người khác.
 *
 * 3. Giao dịch ghi vào nhiều tab bằng một Sheets API batchUpdate. API kiểm tra
 *    toàn bộ yêu cầu trước khi áp dụng và ghi tất cả cùng nhau, tránh trạng thái
 *    nửa lô. Một lô 50 hồ sơ được gửi trong một lượt gọi API.
 *
 * 4. Các bảng danh mục ít đổi (Users, Units, WorkTypes…) được chia sẻ giữa các
 *    lượt chạy qua CacheService, chỉ dùng cho đọc ngoài khóa. Mỗi lần ghi vào
 *    bảng đó sẽ đổi "thế hệ" cache nên người sau không bao giờ đọc bản cũ.
 *
 * 5. Khóa theo dòng: dòng dữ liệu không bao giờ bị xóa hay dời chỗ, nên bảng đã
 *    đọc *trước* khóa (tx(fn, { warm })) vẫn dùng được trong khóa. Vào khóa chỉ
 *    đọc phần đuôi người khác vừa thêm, và đọc lại đúng dòng sắp sửa. Hai người
 *    sửa hai hồ sơ khác nhau chỉ nối đuôi nhau vài lệnh gọi nhỏ, không phải chờ
 *    nhau đọc trọn bảng. Bảng chỉ-thêm (Events, Inbox…) ghi mà không cần đọc.
 */
var DataRepository = (function () {
  var LOCK_MS = 25000;
  var PROP_SHEET_ID = 'LS_SHEET_ID';
  var SHARED_TTL_S = 300;
  var SHARED_MAX_CHARS = 95000;
  var SHARED_TABLES = ['Users', 'Units', 'WorkTypes', 'Reasons', 'CatalogOptions', 'Settings',
    'NotifyRules', 'Templates', 'Channels', 'MonthlyPlans'];

  var book_ = null;
  var cache = {};   // tên tab -> { sheet, headers, values, locked, idx, pending, dirty }
  var reads = 0;    // đếm số lần thực sự chạm Sheet, dùng khi đo tốc độ
  var txDepth = 0;
  var txPeriodStates = null;
  var atomicFlushFallback = false;
  // Đọc lại từng dòng quá nhiều (vd. giao lô 100 hồ sơ) thì đọc trọn bảng một lần rẻ hơn.
  var ROW_READ_MAX = 12;

  /**
   * Kho dữ liệu là file mà `LS_SHEET_ID` trỏ tới — luôn luôn, kể cả khi script
   * được gắn vào một bảng tính.
   *
   * Trước đây hàm này hỏi `getActiveSpreadsheet()` trước. Với script gắn vào
   * bảng tính, lệnh đó trả về chính bảng tính chứa script, nên toàn bộ đọc ghi
   * rơi vào file đó và `LS_SHEET_ID` bị bỏ qua — trong khi
   * `createStorageWorkbook()` đã dựng 18 bảng ở một file khác. Cấu hình tường
   * minh phải thắng ngữ cảnh ngầm.
   */
  function book() {
    if (book_) return book_;
    var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
    if (id) {
      book_ = SpreadsheetApp.openById(id);
      return book_;
    }
    // Chưa khai kho: cho phép dùng bảng tính đang mở để `createStorageWorkbook()`
    // và `setupSheetDB()` có chỗ khởi tạo lần đầu.
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Chưa cấu hình kho dữ liệu. Chạy createStorageWorkbook() hoặc đặt thuộc tính script ' + PROP_SHEET_ID + '.');
    book_ = ss;
    return ss;
  }

  function sheet_(name) {
    var s = book().getSheetByName(name);
    if (!s) throw new Error('Không tìm thấy bảng dữ liệu: ' + name);
    return s;
  }

  /* ------------------------- Cache chia sẻ giữa các lượt ------------------------- */

  function scriptCache_() {
    try { return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null; }
    catch (ignore) { return null; }
  }

  function sharedGen_(sc, name) {
    var key = 'LS_TBLGEN_' + name;
    var gen = sc.get(key);
    if (!gen) {
      gen = String(Date.now());
      sc.put(key, gen, 21600);
    }
    return gen;
  }

  /** Đổi thế hệ: mọi bản cache cũ của bảng lập tức không còn ai đọc tới. */
  function bumpShared_(name) {
    var sc = scriptCache_();
    if (!sc) return;
    try { sc.put('LS_TBLGEN_' + name, String(Date.now()) + '_' + Math.floor(Math.random() * 1e6), 21600); }
    catch (ignore) { try { sc.remove('LS_TBLGEN_' + name); } catch (ignore2) {} }
  }

  function readShared_(name) {
    if (txDepth > 0 || SHARED_TABLES.indexOf(name) === -1) return null;
    var sc = scriptCache_();
    if (!sc) return null;
    try {
      var gen = sharedGen_(sc, name);
      var hit = sc.get('LS_TBL_' + name + '_' + gen);
      if (hit) {
        var parsed = JSON.parse(hit);
        return { sheet: null, headers: parsed.h, values: [parsed.h].concat(parsed.v), locked: false, shared: true };
      }
      return { gen: gen, sc: sc };
    } catch (ignore) { return null; }
  }

  function writeShared_(miss, name, headers, values) {
    if (!miss || !miss.sc) return;
    try {
      // Lưu giá trị đã chuẩn hóa: JSON biến Date thành chuỗi UTC và làm lệch ngày.
      var rows = [];
      for (var i = 1; i < values.length; i++) {
        var row = [];
        for (var j = 0; j < headers.length; j++) row.push(cellText_(headers[j], values[i][j]));
        rows.push(row);
      }
      var text = JSON.stringify({ h: headers, v: rows });
      if (text.length <= SHARED_MAX_CHARS) miss.sc.put('LS_TBL_' + name + '_' + miss.gen, text, SHARED_TTL_S);
    } catch (ignore) { /* cache chỉ là tối ưu, không bao giờ được làm hỏng lượt đọc */ }
  }

  /* ----------------------------- Đọc ----------------------------- */

  function fullRead_(name) {
    var s = sheet_(name);
    var values = s.getLastRow() > 0 ? s.getDataRange().getValues() : [[]];
    reads += 1;
    return { sheet: s, headers: values[0] || [], values: values, locked: txDepth > 0 };
  }

  /** Đọc một tab, dùng lại kết quả trong cùng lượt chạy. */
  function load_(name) {
    var c = cache[name];
    if (c && !c.appendOnly) return c;
    if (c) {
      // Bảng mới chỉ thêm dòng trong giao dịch, giờ cần tìm/đọc: đọc đủ rồi gắn lại dòng chờ ghi.
      var full = fullRead_(name);
      full.pending = [];
      (c.pending || []).forEach(function (i) { full.values.push(c.values[i]); full.pending.push(full.values.length - 1); });
      cache[name] = full;
      return full;
    }
    var miss = readShared_(name);
    if (miss && miss.values) {
      cache[name] = miss;
      return miss;
    }
    cache[name] = fullRead_(name);
    if (!cache[name].locked) writeShared_(miss, name, cache[name].headers, cache[name].values);
    return cache[name];
  }

  /** Ghi thêm dòng trong khóa mà chưa đọc bảng: chỉ cần hàng tiêu đề. */
  function headersOnly_(name) {
    var s = sheet_(name);
    var cols = s.getLastColumn();
    var headers = cols ? s.getRange(1, 1, 1, cols).getValues()[0] : [];
    reads += 1;
    return { sheet: s, headers: headers, values: [headers], locked: true, appendOnly: true };
  }

  /**
   * Đọc lại trọn bảng trong khóa. aligned = vị trí dòng vẫn đúng (đọc lại chỉ vì
   * rẻ hơn đọc từng dòng): giữ các dòng đã sửa. Ngược lại là bảng bị lệch dòng.
   */
  function reload_(name, aligned) {
    var old = cache[name];
    var dirty = old && old.dirty && Object.keys(old.dirty).length ? old.dirty : null;
    if (dirty && !aligned) {
      // Vị trí dòng đã sửa không còn tin được: bỏ cả giao dịch, trình duyệt sẽ gửi lại.
      throw new Error('LS_BUSY: Bảng ' + name + ' vừa đổi cấu trúc trong lúc ghi; thao tác sẽ được thử lại.');
    }
    var full = fullRead_(name);
    if (dirty) {
      // Đang giữ khóa từ lúc đọc lại các dòng này, nên bản sửa trong bộ nhớ là bản đúng.
      // Dòng thêm trong giao dịch (vượt quá Sheet) được gắn lại ở dưới cùng dòng chờ ghi.
      Object.keys(dirty).forEach(function (r) { if (Number(r) - 1 < full.values.length) full.values[Number(r) - 1] = old.values[Number(r) - 1]; });
      full.dirty = dirty;
    }
    if (old && old.pending && old.pending.length) {
      full.pending = [];
      old.pending.forEach(function (i) { full.values.push(old.values[i]); full.pending.push(full.values.length - 1); });
    }
    cache[name] = full;
    return full;
  }

  /**
   * Bảng đọc trước khóa, lần đầu chạm tới trong khóa: chỉ đọc thêm phần đuôi
   * người khác vừa ghi. Dòng cũ có thể đã bị sửa — findRow_ đọc lại đúng dòng cần.
   */
  function sync_(name) {
    var c = cache[name];
    if (!c || c.locked || c.synced) return c;
    var s = c.sheet || (c.sheet = sheet_(name));
    var last = s.getLastRow();
    var have = c.values.length;
    if (!c.headers.length || last < have) return reload_(name);
    if (last > have) {
      var extra = s.getRange(have + 1, 1, last - have, c.headers.length).getValues();
      reads += 1;
      for (var i = 0; i < extra.length; i++) c.values.push(extra[i]);
      c.idx = null;
    }
    c.synced = true;
    c.fresh = {};
    c.rowReads = 0;
    return c;
  }

  /** Trong khóa mà bảng vẫn là bản đọc trước khóa. */
  function staleInTx_(c) { return txDepth > 0 && !!c && !c.locked && !c.appendOnly; }

  /**
   * Danh mục (người dùng, loại việc, cấu hình…) đọc trước khóa được dùng thẳng
   * trong khóa khi chỉ đọc: chúng hiếm khi đổi và cache chia sẻ đã đổi thế hệ
   * sau mỗi lần ghi. Chỉ khi GHI vào một dòng danh mục mới kiểm tra lại dòng đó.
   */
  function catalog_(name) { return SHARED_TABLES.indexOf(name) !== -1; }

  function invalidate_(name) { delete cache[name]; }

  // Cột chỉ chứa ngày, không chứa giờ. Sheet trả chúng về dạng Date nên phải
  // dựng lại đúng chuỗi đã ghi, nếu không mọi phép so sánh chuỗi đều sai.
  var DATE_ONLY = ['start_date', 'end_date', 'activation_at', 'occurrence_date', 'quota_date', 'off_from', 'off_to'];

  /**
   * Google Sheet tự diễn giải chuỗi giống ngày tháng: ghi "2026-09" vào ô thì
   * đọc ra là một Date, không còn là "2026-09". Định dạng cột thành văn bản ngăn
   * được việc đó cho dữ liệu mới; hàm này lo phần đã trót bị đổi kiểu.
   */
  function cellText_(header, value) {
    if (header === 'phone' || header === 'zalo_phone') return typeof normalizePhone_ === 'function' ? normalizePhone_(value, true) : String(value || '');
    if (header === 'cif' || header === 'login_code' || header === 'telegram_chat_id' || /_id$/.test(header)) return String(value === undefined || value === null ? '' : value);
    // `instanceof Date` sai khi giá trị đến từ một realm khác; so sánh tag nội
    // bộ thì đúng trong mọi trường hợp.
    if (Object.prototype.toString.call(value) !== '[object Date]') return value;
    var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
    if (header === 'month_key') return Utilities.formatDate(value, tz, 'yyyy-MM');
    if (DATE_ONLY.indexOf(header) !== -1) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    return value.toISOString();
  }

  function toObject_(headers, row) {
    var o = {};
    for (var j = 0; j < headers.length; j++) o[headers[j]] = cellText_(headers[j], row[j]);
    return o;
  }

  function rowsToObjects_(name) {
    var c = load_(name);
    // Danh mục (người dùng, loại việc…) cũ vài giây vẫn dùng được; bảng nghiệp vụ
    // mà quét cả bảng trong khóa thì phải đọc lại trọn để không quyết định trên bản cũ.
    if (staleInTx_(c) && !catalog_(name)) c = reload_(name);
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
    flushTable_(name);
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

  /**
   * Quét ngược từ dòng cuối theo từng khối, chỉ giữ dòng thỏa `match`.
   *
   * `tail_` cắt trước rồi mới lọc, nên khi nhiều người dùng chung một bảng
   * chỉ-thêm (Inbox, Events), phần đuôi có thể toàn dòng của người khác và
   * người đang đăng nhập thấy rỗng. Hàm này lọc trong lúc quét nên luôn lấy đủ
   * `limit` dòng của đúng người, miễn là còn trong tầm `maxScan`.
   *
   * Trả về { rows, scanned, exhausted }. `exhausted` là false khi chạm trần
   * quét — dấu hiệu bảng đã quá dài và cần lưu trữ bớt.
   *
   * `options.stopWhen(row)` trả true khi dòng đã cũ hơn phạm vi cần lấy: dừng quét
   * ngay (coi như hết), khỏi đọc ngược tới tận trần cho một khoảng ngày ngắn.
   */
  function tailWhere_(name, limit, match, options) {
    var opts = options || {};
    var want = limit || 500;
    var maxScan = opts.maxScan || 20000;
    // Mỗi khối là một lệnh gọi Sheet. Khối đầu nhỏ để tìm vài dòng cuối vẫn rẻ;
    // không chỉ định kích thước thì khối sau gấp đôi (tối đa 4.000): quét 20.000
    // dòng khi tải lại màn hình còn 7 lệnh gọi thay vì 40.
    var chunk = opts.chunk || 500;
    var grow = !opts.chunk;

    flushTable_(name);
    var s = sheet_(name);
    var last = s.getLastRow();
    var cols = s.getLastColumn();
    if (last <= 1 || cols === 0) return { rows: [], scanned: 0, exhausted: true, nextBeforeRow: 1 };

    var headers = s.getRange(1, 1, 1, cols).getValues()[0];
    var out = [];
    var scanned = 0;
    var cursor = opts.beforeRow === undefined ? last : Math.min(last, Math.max(1, Math.floor(Number(opts.beforeRow)) || 1));

    while (cursor > 1 && out.length < want && scanned < maxScan) {
      var take = Math.min(chunk, cursor - 1, maxScan - scanned);
      // Khối rỗng hoặc âm sẽ đẩy con trỏ đi lùi và treo vòng lặp. Điều kiện
      // while ở trên đã bảo đảm take >= 1; chốt thêm ở đây để một lần sửa sau
      // này không biến hàm đọc dữ liệu thành vòng lặp vô hạn.
      if (take < 1) break;
      var start = cursor - take + 1;
      var values = s.getRange(start, 1, take, cols).getValues();
      reads += 1;
      scanned += take;
      var nextCursor = start - 1;
      for (var i = values.length - 1; i >= 0 && out.length < want; i--) {
        var obj = toObject_(headers, values[i]);
        if (opts.stopWhen && opts.stopWhen(obj)) { nextCursor = 1; break; }
        if (!match || match(obj)) out.push(obj);
        nextCursor = start + i - 1;
      }
      cursor = nextCursor;
      if (grow) chunk = Math.min(chunk * 2, 4000);
    }

    return { rows: out, scanned: scanned, exhausted: cursor <= 1, nextBeforeRow: cursor };
  }

  /* ----------------------------- Ghi (gom lại) ----------------------------- */

  /** Dòng mới chỉ nằm trong bộ nhớ tới khi giao dịch xong; tìm kiếm vẫn thấy nó. */
  function append_(name, obj) {
    var c = cache[name];
    if (!c) c = txDepth > 0 ? (cache[name] = headersOnly_(name)) : load_(name);
    else if (staleInTx_(c)) c = sync_(name);
    var row = [];
    for (var j = 0; j < c.headers.length; j++) {
      var v = obj[c.headers[j]];
      row.push(cellText_(c.headers[j], v !== undefined && v !== null ? v : ''));
    }
    c.values.push(row);  // giữ bộ nhớ đệm đúng với Sheet trong cùng lượt chạy
    var index = c.values.length - 1;
    if (c.fresh) c.fresh[index] = true;   // dòng của chính giao dịch này, chưa có trên Sheet
    if (!c.pending) c.pending = [];
    c.pending.push(index);
    if (c.idx) {
      Object.keys(c.idx).forEach(function (col) {
        var key = String(row[Number(col)]);
        if (!(key in c.idx[col])) c.idx[col][key] = index;
      });
    }
  }

  /** Tìm theo khóa bằng chỉ mục dựng một lần, không quét tuần tự mỗi lần gọi. */
  function findRow_(name, keyCol, keyVal) {
    var c = load_(name);
    if (staleInTx_(c) && !catalog_(name)) c = sync_(name);
    var col = c.headers.indexOf(keyCol);
    if (col === -1) throw new Error('Bảng ' + name + ' không có cột ' + keyCol + '.');
    if (!c.idx) c.idx = {};
    var map = c.idx[col];
    if (!map) {
      map = Object.create(null);
      for (var i = 1; i < c.values.length; i++) {
        var k = String(c.values[i][col]);
        if (!(k in map)) map[k] = i;
      }
      c.idx[col] = map;
    }
    var at = map[String(keyVal)];
    if (at === undefined) {
      // Danh mục chưa đối chiếu phần đuôi: có thể dòng vừa được thêm (vd. user mới).
      if (staleInTx_(c) && catalog_(name) && !c.synced) { sync_(name); return findRow_(name, keyCol, keyVal); }
      return null;
    }
    if (staleInTx_(c) && !catalog_(name) && !c.fresh[at]) {
      if (c.rowReads >= ROW_READ_MAX) { reload_(name, true); return findRow_(name, keyCol, keyVal); }
      // Đọc lại đúng dòng này trong khóa: người khác có thể vừa sửa nó.
      var row = c.sheet.getRange(at + 1, 1, 1, c.headers.length).getValues()[0];
      reads += 1;
      c.rowReads += 1;
      if (String(cellText_(keyCol, row[col])) !== String(keyVal)) { reload_(name); return findRow_(name, keyCol, keyVal); }
      var before = c.values[at];
      c.values[at] = row;
      c.fresh[at] = true;
      Object.keys(c.idx).forEach(function (k) {
        if (String(before[Number(k)]) !== String(row[Number(k)])) delete c.idx[k];
      });
    }
    return { name: name, sheet: c.sheet, headers: c.headers, rowIndex: at + 1, object: toObject_(c.headers, c.values[at]) };
  }

  /** Đọc giá trị ô theo tên cột trên mảng thô, không dựng cả đối tượng dòng. */
  function rowGetter_(c) {
    var pos = {};
    c.headers.forEach(function (h, j) { pos[h] = j; });
    return function (row) {
      return function (col) { return pos[col] === undefined ? '' : cellText_(col, row[pos[col]]); };
    };
  }

  /**
   * Quét bảng mà không đọc lại trọn bảng trong khóa: dùng bản đã đọc trước khóa cộng phần đuôi vừa thêm.
   * CHỈ dùng cho cột không bao giờ đổi sau khi tạo dòng (mã hồ sơ, việc chính, kỳ, mã STT, đơn vị gửi…),
   * vì giá trị các cột đó trên bản cũ vẫn đúng. fn(get) nhận get(col) trả giá trị ô.
   */
  function scan_(name, fn) {
    var c = load_(name);
    if (staleInTx_(c) && !catalog_(name)) c = sync_(name);
    var getter = rowGetter_(c);
    for (var i = 1; i < c.values.length; i++) fn(getter(c.values[i]));
  }

  /**
   * Chọn dòng theo điều kiện mà không đọc lại trọn bảng trong khóa: lọc ứng viên trên bản đã đọc (đã nối
   * phần đuôi mới thêm), rồi đọc lại đúng từng dòng ứng viên trong khóa và lọc lần nữa trên dữ liệu mới.
   * Nhiều ứng viên quá thì findRow_ tự chuyển sang đọc trọn bảng một lần, vẫn đúng. Điều kiện nên dựa trên
   * cột không đổi; nếu dựa trên cột đổi được thì chỉ dùng khi dòng chỉ có thể đổi bởi chính người đang gọi.
   */
  function select_(name, idCol, match) {
    var c = load_(name);
    if (staleInTx_(c) && !catalog_(name)) c = sync_(name);
    var getter = rowGetter_(c), idPos = c.headers.indexOf(idCol), ids = [];
    if (idPos === -1) throw new Error('Bảng ' + name + ' không có cột ' + idCol + '.');
    for (var i = 1; i < c.values.length; i++) {
      if (match(getter(c.values[i]))) ids.push(String(c.values[i][idPos]));
    }
    var out = [];
    ids.forEach(function (id) {
      var found = findRow_(name, idCol, id);
      if (found && match(function (col) { var v = found.object[col]; return v === undefined ? '' : v; })) out.push(found);
    });
    return out;
  }

  /** Ghi nhận thay đổi ô; lệnh ghi Sheet thật chạy một lần lúc chốt giao dịch. */
  function write_(found, fields) {
    if (found.name === 'WorkItems') {
      // Ngoại lệ duy nhất: lệnh ghi tự đặt lại liên kết chuyển tiếp (nối lại, hoàn tác chuyển tiếp sớm).
      var relinking = !!fields && Object.prototype.hasOwnProperty.call(fields, 'carried_to_item_id');
      if (found.object && found.object.carried_to_item_id && !relinking) {
        throw new Error('Hồ sơ đã chuyển tháng; mở hồ sơ kỳ mới nhất để tiếp tục.');
      }
      if (txDepth > 0 && found.object && found.object.period_id) {
        if (!txPeriodStates) {
          txPeriodStates = {};
          try {
            var plans = load_('MonthlyPlans');
            if (staleInTx_(plans) && !plans.locked) plans = reload_('MonthlyPlans', true);
            for (var i = 1; i < plans.values.length; i++) {
              var plan = toObject_(plans.headers, plans.values[i]);
              txPeriodStates[plan.period_id] = plan.status;
            }
          } catch (ignorePlanRead) { /* Legacy tests/first-run schemas may not have plans yet. */ }
        }
        var periodState = txPeriodStates[found.object.period_id];
        var isCarryMark = fields && fields.carried_to_item_id && !found.object.carried_to_item_id;
        if (periodState === 'ARCHIVED' && !isCarryMark) {
          throw new Error('Kỳ hồ sơ đã đóng; không được sửa hồ sơ cũ.');
        }
      }
    }
    var c = cache[found.name];
    var keys = Object.keys(fields).filter(function (k) { return found.headers.indexOf(k) !== -1; });
    if (!keys.length) return;
    if (!c) c = load_(found.name);

    var cols = keys.map(function (k) { return found.headers.indexOf(k); });
    var min = Math.min.apply(null, cols);
    var max = Math.max.apply(null, cols);

    if (staleInTx_(c) && !(c.fresh && c.fresh[found.rowIndex - 1])) {
      // Dòng danh mục lấy từ bản đọc trước khóa: ai đó đổi nó trong lúc chờ khóa
      // thì bỏ giao dịch để thử lại, không ghi đè bằng giá trị tính trên bản cũ.
      var s = c.sheet || (c.sheet = sheet_(found.name));
      var live = s.getRange(found.rowIndex, 1, 1, c.headers.length).getValues()[0];
      reads += 1;
      var same = c.headers.every(function (h, j) {
        return String(cellText_(h, live[j])) === String(cellText_(h, c.values[found.rowIndex - 1][j]));
      });
      if (!same) { c.values[found.rowIndex - 1] = live; c.idx = null; }
      if (!same) throw new Error('LS_BUSY: Dữ liệu ' + found.name + ' vừa được người khác cập nhật; thao tác sẽ được thử lại.');
      c.values[found.rowIndex - 1] = live;
      if (!c.fresh) c.fresh = {};
      c.fresh[found.rowIndex - 1] = true;
    }

    var row = c.values[found.rowIndex - 1].slice();
    keys.forEach(function (k) { row[found.headers.indexOf(k)] = cellText_(k, fields[k]); });
    c.values[found.rowIndex - 1] = row;

    if (c.idx) cols.forEach(function (col) { delete c.idx[col]; });
    if (!c.dirty) c.dirty = {};
    var span = c.dirty[found.rowIndex];
    c.dirty[found.rowIndex] = span ? { min: Math.min(span.min, min), max: Math.max(span.max, max) } : { min: min, max: max };
  }

  function hasChanges_(c) {
    return !!(c && ((c.pending && c.pending.length) || (c.dirty && Object.keys(c.dirty).length)));
  }

  /** Đẩy thay đổi của một bảng xuống Sheet. */
  function flushTable_(name) {
    var c = cache[name];
    if (!hasChanges_(c)) return;
    if (txDepth > 0 && !atomicFlushFallback) throw new Error('LS_UNSAFE_EARLY_FLUSH: Không ghi Sheet giữa một giao dịch.');
    var sheet = c.sheet || sheet_(name);
    var width = c.headers.length;
    var appended = {};
    (c.pending || []).forEach(function (i) { appended[i + 1] = true; });

    // Sửa dòng có sẵn: gộp các dòng liền nhau thành một vùng ghi.
    var rows = Object.keys(c.dirty || {}).map(Number).filter(function (r) { return !appended[r]; }).sort(function (a, b) { return a - b; });
    var k = 0;
    while (k < rows.length) {
      var first = rows[k], last = first, min = c.dirty[first].min, max = c.dirty[first].max;
      while (k + 1 < rows.length && rows[k + 1] === last + 1) {
        k += 1; last = rows[k];
        min = Math.min(min, c.dirty[last].min); max = Math.max(max, c.dirty[last].max);
      }
      var block = [];
      for (var r = first; r <= last; r++) block.push(c.values[r - 1].slice(min, max + 1));
      sheet.getRange(first, min + 1, block.length, max - min + 1).setNumberFormat('@').setValues(block);
      k += 1;
    }

    // Dòng mới: một lệnh cho cả khối.
    var fresh = (c.pending || []).map(function (i) { return c.values[i]; });
    if (fresh.length === 1) {
      var nextRow = sheet.getLastRow() + 1;
      if (typeof sheet.getMaxRows === 'function' && nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      sheet.getRange(nextRow, 1, 1, width).setNumberFormat('@');
      sheet.appendRow(fresh[0]);
    } else if (fresh.length > 1) {
      var start = sheet.getLastRow() + 1;
      var need = start + fresh.length - 1;
      if (typeof sheet.getMaxRows === 'function' && need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
      sheet.getRange(start, 1, fresh.length, width).setNumberFormat('@').setValues(fresh);
    }

    c.pending = [];
    c.dirty = {};
    if (SHARED_TABLES.indexOf(name) !== -1) bumpShared_(name);
  }

  function flushAll_() {
    var names = Object.keys(cache).filter(function (name) { return hasChanges_(cache[name]); });
    if (!names.length) return;

    // Local contract harnesses do not load Apps Script advanced services. A
    // deployed script must enable Sheets in appsscript.json; fail closed if it
    // is missing so production never silently uses non-atomic range writes.
    if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || !Sheets.Spreadsheets.batchUpdate) {
      if (typeof ScriptApp !== 'undefined') throw new Error('LS_ATOMIC_WRITE_UNAVAILABLE: Cần bật Google Sheets API nâng cao để ghi giao dịch nhiều bảng an toàn.');
      atomicFlushFallback = true;
      try { names.forEach(flushTable_); }
      finally { atomicFlushFallback = false; }
      return;
    }

    var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
    if (!id) throw new Error('LS_ATOMIC_WRITE_UNAVAILABLE: Thiếu mã kho dữ liệu cho giao dịch an toàn.');
    function cell_(header, value) {
      var normalized = cellText_(header, value);
      var userEnteredValue = normalized === '' || normalized === null || normalized === undefined
        ? { stringValue: '' }
        : typeof normalized === 'boolean' ? { boolValue: normalized }
          : typeof normalized === 'number' ? { numberValue: normalized }
            : { stringValue: String(normalized) };
      return { userEnteredValue: userEnteredValue, userEnteredFormat: { numberFormat: { type: 'TEXT' } } };
    }
    var requests = [];
    names.forEach(function (name) {
      var c = cache[name], sheet = c.sheet || (c.sheet = sheet_(name));
      var sheetId = sheet.getSheetId();
      var appended = {};
      (c.pending || []).forEach(function (i) { appended[i + 1] = true; });
      Object.keys(c.dirty || {}).map(Number).filter(function (row) { return !appended[row]; })
        .sort(function (a, b) { return a - b; }).forEach(function (row) {
          var span = c.dirty[row];
          requests.push({ updateCells: {
            start: { sheetId: sheetId, rowIndex: row - 1, columnIndex: span.min },
            rows: [{ values: c.values[row - 1].slice(span.min, span.max + 1).map(function (v, offset) {
              return cell_(c.headers[span.min + offset], v);
            }) }],
            fields: 'userEnteredValue,userEnteredFormat.numberFormat'
          } });
        });
      if (c.pending && c.pending.length) {
        requests.push({ appendCells: {
          sheetId: sheetId,
          rows: c.pending.map(function (i) { return { values: c.values[i].map(function (v, col) { return cell_(c.headers[col], v); }) }; }),
          fields: 'userEnteredValue,userEnteredFormat.numberFormat'
        } });
      }
    });
    if (!requests.length) return;
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
    names.forEach(function (name) {
      var c = cache[name];
      c.pending = [];
      c.dirty = {};
      if (SHARED_TABLES.indexOf(name) !== -1) bumpShared_(name);
    });
  }

  /** Giao dịch hỏng: bỏ mọi thay đổi chưa ghi, kể cả bản sao trong bộ nhớ. */
  function discardChanges_() {
    Object.keys(cache).forEach(function (name) {
      if (hasChanges_(cache[name])) delete cache[name];
    });
  }

  function busy_(err) {
    return new Error('LS_BUSY: Hệ thống đang xử lý thao tác của người khác. Thao tác của bạn đang chờ lượt và sẽ được thử lại. (' + (err && err.message ? err.message : err) + ')');
  }

  /**
   * Dọn dữ liệu cũ: xóa KHỐI dòng cũ nhất liên tiếp ở đầu bảng mà `eligible(obj)`
   * trả về true, dừng ngay khi gặp dòng đầu tiên không thỏa.
   *
   * Vì sao chỉ xóa khối liền ở đầu, không xóa mọi dòng khớp rải rác:
   *  - Bảng chỉ-thêm luôn nối dòng mới xuống cuối, nên dòng cũ nhất nằm trên đầu;
   *    xóa từ đầu thì phần còn lại vẫn đúng thứ tự thời gian.
   *  - DataRepository dựa trên bất biến "dòng không bị dời chỗ" trong lúc chạy.
   *    Xóa phải nằm gọn trong một lần giữ khóa (không ai ghi xen), xóa một dải
   *    liền kề bằng `deleteRows` rồi bỏ cache — không bao giờ xóa giữa lúc có
   *    giao dịch khác đang tham chiếu chỉ số dòng.
   *  - Gặp một dòng chưa đủ điều kiện (vd tin còn THAT_BAI, thông báo chưa đọc)
   *    thì dừng, thà giữ lại còn hơn xóa nhầm dòng chưa xong. Lần chạy sau tiếp tục.
   *
   * Phải gọi NGOÀI giao dịch; hàm tự giữ khóa ghi. Trả về
   * { deleted, scanned, stopped }. `stopped=true` nghĩa là dừng vì gặp dòng
   * không đủ điều kiện hoặc chạm trần maxDelete (còn dòng cũ chưa dọn hết).
   */
  function pruneLeading_(name, eligible, options) {
    if (txDepth > 0) throw new Error('LS_PRUNE_IN_TX: pruneLeading phải chạy ngoài giao dịch.');
    var opts = options || {};
    var maxDelete = opts.maxDelete || 5000;
    var scanChunk = opts.chunk || 1000;
    var lock = LockService.getScriptLock();
    try { lock.waitLock(LOCK_MS); } catch (err) { throw busy_(err); }
    txDepth = 1;
    try {
      var s = sheet_(name);
      var last = s.getLastRow();
      var cols = s.getLastColumn();
      if (last <= 1 || cols === 0) return { deleted: 0, scanned: 0, stopped: true };
      var headers = s.getRange(1, 1, 1, cols).getValues()[0];
      var dataRows = last - 1;
      var limit = Math.min(maxDelete, dataRows);
      var eligibleCount = 0, scanned = 0, stopped = false;
      while (eligibleCount < limit && scanned < dataRows) {
        var take = Math.min(scanChunk, dataRows - scanned);
        var block = s.getRange(2 + scanned, 1, take, cols).getValues();
        reads += 1;
        var broke = false;
        for (var i = 0; i < block.length; i++) {
          if (eligibleCount >= limit) { stopped = true; broke = true; break; }
          if (eligible(toObject_(headers, block[i]))) eligibleCount += 1;
          else { stopped = true; broke = true; break; }
        }
        scanned += take;
        if (broke) break;
      }
      if (eligibleCount < dataRows && !stopped) stopped = true; // còn dòng cũ, chưa chạm đáy
      if (eligibleCount > 0) {
        s.deleteRows(2, eligibleCount);
        delete cache[name];
        if (SHARED_TABLES.indexOf(name) !== -1) bumpShared_(name);
      }
      return { deleted: eligibleCount, scanned: scanned, stopped: stopped };
    } finally {
      txDepth = 0;
      lock.releaseLock();
    }
  }

  /**
   * Xóa đúng một dòng theo khóa. Như pruneLeading, phải chạy NGOÀI giao dịch và tự giữ
   * khóa ghi: dòng bị xóa làm các dòng sau dời chỗ nên không được có giao dịch khác đang
   * cầm chỉ số dòng. `guard(obj)` chạy trong khóa trên bản đọc mới từ Sheet; nó ném lỗi
   * để hủy xóa. Trả về { deleted, row }.
   */
  function deleteRow_(name, keyCol, keyVal, guard) {
    if (txDepth > 0) throw new Error('LS_DELETE_IN_TX: deleteRow phải chạy ngoài giao dịch.');
    var lock = LockService.getScriptLock();
    try { lock.waitLock(LOCK_MS); } catch (err) { throw busy_(err); }
    txDepth = 1;
    try {
      var s = sheet_(name);
      var last = s.getLastRow(), cols = s.getLastColumn();
      if (last <= 1 || cols === 0) return { deleted: 0, row: null };
      var headers = s.getRange(1, 1, 1, cols).getValues()[0];
      var keyIndex = headers.indexOf(keyCol);
      if (keyIndex === -1) throw new Error('Bảng ' + name + ' không có cột ' + keyCol + '.');
      var keys = s.getRange(2, keyIndex + 1, last - 1, 1).getValues();
      reads += 1;
      var at = -1;
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]) === String(keyVal)) { at = i; break; }
      }
      if (at === -1) return { deleted: 0, row: null };
      var row = toObject_(headers, s.getRange(2 + at, 1, 1, cols).getValues()[0]);
      if (guard) guard(row);
      s.deleteRow(2 + at);
      delete cache[name];
      if (SHARED_TABLES.indexOf(name) !== -1) bumpShared_(name);
      return { deleted: 1, row: row };
    } finally {
      txDepth = 0;
      Object.keys(cache).forEach(function (n) { cache[n].locked = false; cache[n].synced = false; cache[n].fresh = null; });
      lock.releaseLock();
    }
  }

  /**
   * Chạy fn trong một lần giữ khóa; fn nhận các hàm nội bộ không khóa.
   * Gọi lồng nhau trong cùng lượt chạy dùng lại khóa đang giữ.
   */
  function tx(fn, options) {
    var api = {
      append: append_, find: findRow_, write: write_,
      rows: rowsToObjects_, tail: tail_, tailWhere: tailWhere_, invalidate: invalidate_,
      scan: scan_, select: select_
    };
    if (txDepth > 0) return fn(api);

    // Đọc trước, ngoài khóa, các bảng lượt ghi sẽ dùng: phần đọc nặng không bắt
    // người khác đứng chờ. Bảng lỗi/thiếu thì để giao dịch tự đọc như cũ.
    ((options && options.warm) || []).forEach(function (name) {
      try { load_(name); } catch (ignore) { delete cache[name]; }
    });
    // Bảng chỉ-thêm (nhật ký, hộp thư…): lấy sẵn hàng tiêu đề, trong khóa chỉ còn ghi.
    ((options && options.append) || []).forEach(function (name) {
      if (cache[name]) return;
      try { cache[name] = headersOnly_(name); } catch (ignore) { delete cache[name]; }
    });

    var lock = LockService.getScriptLock();
    try { lock.waitLock(LOCK_MS); }
    catch (err) { throw busy_(err); }
    txDepth = 1;
    txPeriodStates = null;
    try {
      // Bản đọc ngoài khóa có thể đã cũ: giữ lại làm chỉ mục, nhưng mọi dòng
      // dùng trong khóa đều được đọc lại (xem sync_/findRow_).
      Object.keys(cache).forEach(function (name) { cache[name].synced = false; cache[name].fresh = null; });
      var result = fn(api);
      flushAll_();
      return result;
    } catch (err) {
      discardChanges_();
      throw err;
    } finally {
      txDepth = 0;
      txPeriodStates = null;
      Object.keys(cache).forEach(function (name) {
        // Bảng chỉ-thêm không khớp vị trí dòng với Sheet: không giữ lại sau khóa.
        if (cache[name].appendOnly) { delete cache[name]; return; }
        cache[name].locked = false; cache[name].synced = false; cache[name].fresh = null;
      });
      lock.releaseLock();
    }
  }

  return {
    getAll: rowsToObjects_,
    tail: tail_,
    tailWhere: tailWhere_,
    find: function (name, keyCol, keyVal) {
      var f = findRow_(name, keyCol, keyVal);
      return f ? f.object : null;
    },
    insert: function (name, obj) { return tx(function (t) { t.append(name, obj); return true; }); },
    tx: tx,
    pruneLeading: pruneLeading_,
    deleteRow: deleteRow_,
    sheetReads: function () { return reads; },
    clearCache: function () { cache = {}; },
    /** Sau khi sửa trực tiếp cấu trúc/dữ liệu Sheet ngoài repository. */
    invalidateShared: function (names) {
      (names || SHARED_TABLES).forEach(bumpShared_);
      cache = {};
    },
    setSheetId: function (id) {
      PropertiesService.getScriptProperties().setProperty(PROP_SHEET_ID, id);
      // Đổi kho mà giữ lại file đã mở là cách ghi tiếp vào kho cũ trong cùng lượt chạy.
      book_ = null;
      cache = {};
    }
  };
})();
