/**
 * Hợp đồng hành vi của DataRepository.tailWhere.
 *
 * Nạp thẳng DataRepository.gs vào một ngữ cảnh có stub cho API Apps Script rồi
 * gọi hàm thật, thay vì chỉ kiểm chuỗi ký tự trong mã nguồn. Đây là chỗ duy
 * nhất chứng minh được cách quét ngược thực sự lấy đủ dòng của đúng người —
 * điều mà cách cũ (cắt đuôi rồi mới lọc) không làm được.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const SRC = 'DataRepository.gs';

/** Mang tra ve tu vm sandbox thuoc realm khac; dua ve realm nay truoc khi so sanh. */
const ids = (rows) => Array.from(rows, (r) => r.id);

/** Bảng giả: hàng 1 là tiêu đề, dữ liệu từ hàng 2. Đếm số lần đọc range. */
function makeSheet(headers, rows) {
  const grid = [headers, ...rows];
  const stats = { rangeReads: 0, rowsRead: 0 };
  const sheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getDataRange: () => ({ getValues: () => { stats.rangeReads++; stats.rowsRead += grid.length; return grid; } }),
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => {
        stats.rangeReads++;
        stats.rowsRead += numRows;
        return grid.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols));
      },
      setValues: () => {}
    }),
    appendRow: (r) => grid.push(r)
  };
  return { sheet, stats };
}

function loadRepo(sheetsByName) {
  const code = fs.readFileSync(SRC, 'utf8');
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FAKE_ID', setProperty: () => {} }) },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (n) => sheetsByName[n] || null }),
      getActiveSpreadsheet: () => null
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: () => '' },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.DataRepository;
}

const HEADERS = ['id', 'user_id', 'at'];
function inboxRows(n, owners) {
  return Array.from({ length: n }, (_, i) => [`N${i + 1}`, owners[i % owners.length], `t${i + 1}`]);
}

test('lọc theo người nhận trong lúc quét, không cắt đuôi trước', () => {
  // 1000 thông báo của 20 người: cách cũ (tail 200 rồi lọc) chỉ còn ~10 dòng.
  const owners = Array.from({ length: 20 }, (_, i) => `U${i}`);
  const { sheet } = makeSheet(HEADERS, inboxRows(1000, owners));
  const repo = loadRepo({ Inbox: sheet });

  const got = repo.tailWhere('Inbox', 200, (n) => n.user_id === 'U3');
  assert.equal(got.rows.length, 50, 'U3 có đúng 50 thông báo trong 1000 dòng');
  assert.ok(got.rows.every(r => r.user_id === 'U3'));
});

test('trả về mới nhất trước', () => {
  const { sheet } = makeSheet(HEADERS, inboxRows(30, ['U1']));
  const repo = loadRepo({ Inbox: sheet });
  const got = repo.tailWhere('Inbox', 5, () => true);
  assert.deepEqual(ids(got.rows), ['N30', 'N29', 'N28', 'N27', 'N26']);
});

test('dừng sớm khi đã đủ limit, không quét cả bảng', () => {
  const { sheet, stats } = makeSheet(HEADERS, inboxRows(5000, ['U1']));
  const repo = loadRepo({ Inbox: sheet });
  const before = stats.rowsRead;
  const got = repo.tailWhere('Inbox', 10, () => true);
  const scannedRows = stats.rowsRead - before - 1; // trừ lần đọc hàng tiêu đề
  assert.equal(got.rows.length, 10);
  assert.ok(scannedRows <= 500, `chỉ đọc một khối, thực tế ${scannedRows} dòng`);
  assert.equal(got.exhausted, false, 'chưa quét hết bảng');
});

test('tôn trọng trần maxScan và báo chưa quét hết', () => {
  const owners = ['U1', ...Array.from({ length: 49 }, (_, i) => `U${i + 2}`)];
  const { sheet } = makeSheet(HEADERS, inboxRows(5000, owners));
  const repo = loadRepo({ Inbox: sheet });
  const got = repo.tailWhere('Inbox', 500, (n) => n.user_id === 'U1', { maxScan: 1000 });
  assert.ok(got.scanned <= 1000, `quét ${got.scanned} dòng, phải <= 1000`);
  assert.equal(got.exhausted, false);
  assert.equal(got.rows.length, 20, '1000 dòng cuối chứa đúng 20 dòng của U1');
});

test('quét hết bảng nhỏ thì báo exhausted', () => {
  const { sheet } = makeSheet(HEADERS, inboxRows(12, ['U1', 'U2']));
  const repo = loadRepo({ Inbox: sheet });
  const got = repo.tailWhere('Inbox', 100, (n) => n.user_id === 'U2');
  assert.equal(got.rows.length, 6);
  assert.equal(got.exhausted, true);
  assert.equal(got.scanned, 12, 'quét đúng số dòng dữ liệu, không đụng hàng tiêu đề');
});

test('bảng rỗng không lỗi', () => {
  const { sheet } = makeSheet(HEADERS, []);
  const repo = loadRepo({ Inbox: sheet });
  const got = repo.tailWhere('Inbox', 50, () => true);
  assert.deepEqual(ids(got.rows), []);
  assert.equal(got.exhausted, true);
});

test('không có bộ lọc thì lấy đuôi như tail', () => {
  const { sheet } = makeSheet(HEADERS, inboxRows(100, ['U1']));
  const repo = loadRepo({ Inbox: sheet });
  const a = ids(repo.tailWhere('Inbox', 10, null).rows);
  const b = ids(repo.tail('Inbox', 10));
  assert.deepEqual(a, b, 'tailWhere không lọc phải khớp tail');
});

test('ranh giới: limit lớn hơn số dòng', () => {
  const { sheet } = makeSheet(HEADERS, inboxRows(3, ['U1']));
  const repo = loadRepo({ Inbox: sheet });
  const got = repo.tailWhere('Inbox', 100, () => true);
  assert.deepEqual(ids(got.rows), ['N3', 'N2', 'N1']);
  assert.equal(got.exhausted, true);
});
