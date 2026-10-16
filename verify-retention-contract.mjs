/**
 * Hợp đồng hành vi của DataRepository.pruneLeading — job dọn dữ liệu cũ.
 *
 * Nạp thẳng DataRepository.gs rồi gọi hàm thật trên bảng giả có deleteRows.
 * Bảo đảm: chỉ xóa khối dòng cũ nhất liên tiếp thỏa điều kiện, dừng ngay khi
 * gặp dòng chưa đủ điều kiện, giữ đúng thứ tự phần còn lại, tôn trọng trần
 * maxDelete, và không bao giờ xóa quá phần đủ điều kiện ở đầu bảng.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const SRC = 'DataRepository.gs';
const ids = (rows) => Array.from(rows, (r) => r.id);

/** Bảng giả: hàng 1 là tiêu đề. deleteRows cắt thật khỏi lưới. */
function makeSheet(headers, rows) {
  const grid = [headers, ...rows];
  const log = { deletes: [] };
  const sheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getDataRange: () => ({ getValues: () => grid }),
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => grid.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
      setValues: () => {}, setNumberFormat: () => ({ setValues: () => {} })
    }),
    appendRow: (r) => grid.push(r),
    deleteRows: (start, num) => { log.deletes.push([start, num]); grid.splice(start - 1, num); }
  };
  return { sheet, grid, log };
}

function loadRepo(sheetsByName) {
  const code = fs.readFileSync(SRC, 'utf8');
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FAKE_ID', setProperty: () => {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheetsByName[n] || null }), getActiveSpreadsheet: () => null },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: () => '' },
    CacheService: { getScriptCache: () => null },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.DataRepository;
}

const H = ['id', 'status', 'created_at'];
const DAY = 86400000;
const ageIso = (days) => new Date(Date.now() - days * DAY).toISOString();
function rows(specs) { return specs.map((s, i) => [`R${i + 1}`, s.status, s.age === undefined ? ageIso(100) : ageIso(s.age)]); }

// Điều kiện giống job thật cho Outbox: đã xong (DA_GUI/KHONG_GUI) và cũ hơn 7 ngày.
const outboxEligible = (o) => (o.status === 'DA_GUI' || o.status === 'KHONG_GUI') &&
  (Date.now() - Date.parse(o.created_at)) > 7 * DAY;

test('xóa khối dòng cũ liên tiếp đủ điều kiện ở đầu bảng', () => {
  const { sheet, grid } = makeSheet(H, rows([
    { status: 'DA_GUI', age: 30 }, { status: 'KHONG_GUI', age: 20 }, { status: 'DA_GUI', age: 10 },
    { status: 'DA_GUI', age: 2 },      // chưa đủ 7 ngày -> dừng tại đây
    { status: 'DA_GUI', age: 30 }      // cũ nhưng nằm sau dòng chưa đủ -> KHÔNG xóa
  ]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.equal(r.deleted, 3, 'xóa đúng 3 dòng đầu đủ điều kiện');
  assert.equal(r.stopped, true, 'dừng vì gặp dòng chưa đủ điều kiện');
  assert.deepEqual(grid.slice(1).map(x => x[0]), ['R4', 'R5'], 'giữ đúng phần còn lại, đúng thứ tự');
});

test('không xóa gì khi dòng cũ nhất chưa đủ điều kiện', () => {
  const { sheet, log } = makeSheet(H, rows([
    { status: 'THAT_BAI', age: 30 },   // chưa xong -> chặn ngay từ đầu
    { status: 'DA_GUI', age: 30 }
  ]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.equal(r.deleted, 0);
  assert.equal(log.deletes.length, 0, 'không gọi deleteRows');
});

test('xóa sạch khi toàn bộ đủ điều kiện, báo không còn tồn', () => {
  const { sheet, grid } = makeSheet(H, rows([
    { status: 'DA_GUI', age: 30 }, { status: 'DA_GUI', age: 20 }, { status: 'KHONG_GUI', age: 10 }
  ]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.equal(r.deleted, 3);
  assert.equal(r.stopped, false, 'đã dọn hết, không còn dòng cũ');
  assert.equal(grid.length, 1, 'chỉ còn hàng tiêu đề');
});

test('tôn trọng trần maxDelete, báo còn tồn để chạy tiếp lần sau', () => {
  const many = rows(Array.from({ length: 20 }, () => ({ status: 'DA_GUI', age: 30 })));
  const { sheet, grid } = makeSheet(H, many);
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible, { maxDelete: 5, chunk: 3 });
  assert.equal(r.deleted, 5, 'chỉ xóa tối đa 5 dòng/lượt');
  assert.equal(r.stopped, true, 'còn dòng cũ chưa dọn');
  assert.equal(grid.length - 1, 15, 'còn 15 dòng dữ liệu');
});

test('xóa bắt đầu từ hàng 2 (không đụng hàng tiêu đề)', () => {
  const { sheet, log } = makeSheet(H, rows([{ status: 'DA_GUI', age: 30 }, { status: 'DA_GUI', age: 20 }]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.deepEqual(log.deletes, [[2, 2]], 'deleteRows(2, 2): bắt đầu đúng hàng dữ liệu đầu tiên');
});

test('bảng rỗng không lỗi', () => {
  const { sheet } = makeSheet(H, []);
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.equal(r.deleted, 0);
  assert.equal(r.scanned, 0);
  assert.equal(r.stopped, true);
});

test('sau khi dọn, đọc lại ra đúng các dòng mới nhất', () => {
  const { sheet } = makeSheet(H, rows([
    { status: 'DA_GUI', age: 30 }, { status: 'DA_GUI', age: 20 },
    { status: 'CHO_GUI', age: 1 }, { status: 'CHO_GUI', age: 0 }
  ]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  repo.pruneLeading('NotificationOutbox', outboxEligible);
  const left = repo.tail('NotificationOutbox', 10);
  assert.deepEqual(ids(left), ['R4', 'R3'], 'còn lại đúng 2 tin chưa gửi, mới nhất trước');
});

test('chỉ-đọc: không bao giờ xóa dòng chưa đủ điều kiện nằm xen giữa', () => {
  // R1,R2 đủ; R3 chưa đủ (mới); R4 đủ nhưng bị R3 chặn.
  const { sheet, grid } = makeSheet(H, rows([
    { status: 'DA_GUI', age: 30 }, { status: 'DA_GUI', age: 15 },
    { status: 'DA_GUI', age: 3 }, { status: 'DA_GUI', age: 40 }
  ]));
  const repo = loadRepo({ NotificationOutbox: sheet });
  const r = repo.pruneLeading('NotificationOutbox', outboxEligible);
  assert.equal(r.deleted, 2);
  assert.deepEqual(grid.slice(1).map(x => x[0]), ['R3', 'R4']);
});
