/**
 * Hợp đồng: dòng đã chuyển tháng (carried_to_item_id) không được lọt vào hàng
 * chờ và không được thao tác.
 *
 * Lỗi đã gặp: getBootstrap liệt kê WorkItems của kỳ đang chạy nhưng QUÊN lọc
 * carried_to_item_id (mọi truy vấn danh sách khác đều lọc). Dòng cũ đã sinh dòng
 * mới ở kỳ sau vẫn hiện trong "Hàng chờ phân công"; bấm Phân công thì DataRepository
 * chặn với "Hồ sơ đã chuyển tháng", nên những bộ đó không bao giờ giao được.
 *
 * Hai lớp bảo vệ được kiểm:
 *  A. Lưới cuối ở DataRepository.write_: ghi vào dòng đã chuyển phải ném lỗi.
 *  B. getBootstrap phải lọc !carried_to_item_id ngay khi dựng danh sách việc.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

/* ---- A. Hành vi thật: không ghi được vào dòng đã chuyển tháng ---- */

function makeSheet(headers, rows) {
  const grid = [headers, ...rows];
  return {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getDataRange: () => ({ getValues: () => grid }),
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => grid.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
      setValues: () => {}, setNumberFormat() { return this; }
    }),
    appendRow: (r) => grid.push(r), deleteRows: () => {}
  };
}

function loadRepo(sheetsByName) {
  const code = fs.readFileSync('DataRepository.gs', 'utf8');
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

const H = ['item_id', 'period_id', 'status', 'carried_to_item_id', 'version'];

test('A1. ghi vào dòng đã chuyển tháng bị chặn', () => {
  const sheet = makeSheet(H, [
    ['IT_OLD', 'P9', 'CHO_PHAN_CONG', 'IT_NEW', '2'],  // đã chuyển -> cấm sửa
    ['IT_NEW', 'P10', 'CHO_PHAN_CONG', '', '1']         // dòng mới -> hợp lệ
  ]);
  const repo = loadRepo({ WorkItems: sheet });
  assert.throws(() => {
    repo.tx((t) => {
      const f = t.find('WorkItems', 'item_id', 'IT_OLD');
      t.write(f, { status: 'DA_PHAN_CONG', assigned_user_id: 'U9' });
      return true;
    });
  }, /chuyển tháng/i, 'phải ném lỗi đã chuyển tháng khi ghi vào dòng cũ');
});

/* ---- B. getBootstrap phải lọc dòng đã chuyển khi dựng danh sách việc ---- */

const server = fs.readFileSync('Code.gs', 'utf8');

test('B1. danh sách việc của kỳ đang chạy loại dòng carried_to_item_id', () => {
  // Chuẩn hóa khoảng trắng để không phụ thuộc cách xuống dòng.
  const flat = server.replace(/\s+/g, ' ');
  const ok = flat.includes('var periodItems = allWorkItems.filter(function (i) { return i.period_id === activePlan.period_id && !i.carried_to_item_id; })');
  assert.ok(ok, 'getBootstrap phải lọc !i.carried_to_item_id cùng với period_id');
});

test('B2. không quay lại truy vấn thiếu bộ lọc carried', () => {
  const flat = server.replace(/\s+/g, ' ');
  const bad = flat.includes(
    "var items = DataRepository.getAll('WorkItems').filter(function (i) { return i.period_id === activePlan.period_id; });"
  );
  assert.ok(!bad, 'không được liệt kê việc kỳ đang chạy mà bỏ lọc carried_to_item_id');
});

test('B3. lưới chặn ghi dòng đã chuyển vẫn còn trong DataRepository', () => {
  const repo = fs.readFileSync('DataRepository.gs', 'utf8');
  assert.ok(/carried_to_item_id[\s\S]{0,80}chuyển tháng/.test(repo),
    'write_ phải chặn khi dòng WorkItems có carried_to_item_id');
});
