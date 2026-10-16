// Khóa theo dòng: bảng đọc trước khóa vẫn dùng được trong khóa, nhưng mọi dòng
// sắp sửa đều được đọc lại, phần đuôi người khác vừa thêm được bù vào, và bảng
// chỉ-thêm (Events…) ghi mà không đọc trọn. Chạy: node verify-row-lock-contract.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function fakeSheet(rows) {
  const grid = rows.map(r => r.slice());
  const calls = { setValues: 0, appendRow: 0, getDataRange: 0, rowReads: 0 };
  const sheet = {
    grid, calls,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getMaxRows: () => 1000,
    insertRowsAfter() {},
    getDataRange: () => ({ getValues: () => { calls.getDataRange++; return grid.map(r => r.slice()); } }),
    getRange: (r, c, n = 1, w = 1) => {
      const range = {
        setNumberFormat: () => range,
        getValues: () => { calls.rowReads++; return grid.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w)); },
        setValues: vals => {
          calls.setValues++;
          vals.forEach((row, y) => { grid[r - 1 + y] = grid[r - 1 + y] || []; row.forEach((v, x) => { grid[r - 1 + y][c - 1 + x] = v; }); });
          return range;
        }
      };
      return range;
    },
    appendRow: row => { calls.appendRow++; grid.push(row.slice()); }
  };
  return sheet;
}
function loadRepo(sheets) {
  const lock = { held: false };
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'KHO', setProperty() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] || null }), getActiveSpreadsheet: () => null },
    LockService: { getScriptLock: () => ({ waitLock() { lock.held = true; }, releaseLock() { lock.held = false; } }) },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: () => '' }
  };
  vm.runInNewContext(fs.readFileSync('DataRepository.gs', 'utf8'), ctx);
  return { repo: ctx.DataRepository, lock };
}
const plain = x => JSON.parse(JSON.stringify(x));   // mảng tạo trong vm khác realm
const itemRows = n => [['item_id', 'status', 'version']].concat(Array.from({ length: n }, (_, i) => ['I' + (i + 1), 'A', 1]));

// 1. { warm } đọc trọn bảng TRƯỚC khi lấy khóa; trong khóa không đọc trọn lại.
{
  const items = fakeSheet(itemRows(50));
  const { repo, lock } = loadRepo({ WorkItems: items });
  const orig = items.getDataRange;
  let readWhileLocked = 0;
  items.getDataRange = () => { if (lock.held) readWhileLocked++; return orig(); };
  repo.tx(t => t.write(t.find('WorkItems', 'item_id', 'I7'), { status: 'B' }), { warm: ['WorkItems'] });
  assert.equal(readWhileLocked, 0, 'warm-up must happen outside the lock');
  assert.equal(items.calls.getDataRange, 1);
  assert.equal(items.grid[7][1], 'B');
}

// 1b. Chạy đúng thứ tự: đọc trước khóa → người khác ghi → vào khóa.
{
  const items = fakeSheet(itemRows(50));
  const events = fakeSheet([['event_id', 'item_id'], ['E0', 'I1']]);
  const { repo } = loadRepo({ WorkItems: items, Events: events });
  repo.getAll('WorkItems');                     // bản đọc trước khóa (warm)
  items.grid[2][1] = 'KHAC_SUA'; items.grid[2][2] = 2;   // người khác sửa I2
  items.grid.push(['I51', 'MOI', 1]);           // người khác thêm I51
  const fullBefore = items.calls.getDataRange;
  repo.tx(t => {
    const i2 = t.find('WorkItems', 'item_id', 'I2');
    assert.equal(i2.object.status, 'KHAC_SUA', 'row edited by another user must be re-read in the lock');
    assert.equal(Number(i2.object.version), 2);
    assert.equal(t.find('WorkItems', 'item_id', 'I51').object.status, 'MOI', 'rows appended by others must be visible');
    t.write(i2, { status: 'B', version: 3 });
    t.append('Events', { event_id: 'E1', item_id: 'I2' });
  });
  assert.equal(items.calls.getDataRange, fullBefore, 'the lock must not re-read the whole WorkItems table');
  assert.equal(events.calls.getDataRange, 0, 'appending an event must not read the whole Events table');
  assert.deepEqual(plain(items.grid[2]), ['I2', 'B', 3], 'the write lands on the right row');
  assert.equal(items.grid[1][1], 'A', 'other rows are untouched');
  assert.deepEqual(plain(events.grid[2]), ['E1', 'I2']);

  // Giao dịch thứ hai trong cùng lượt chạy vẫn thấy thay đổi của người khác ở dòng khác.
  items.grid[5][1] = 'KHAC_SUA_2';
  repo.tx(t => assert.equal(t.find('WorkItems', 'item_id', 'I5').object.status, 'KHAC_SUA_2'));
}

// 1c. { append } lấy tiêu đề bảng nhật ký trước khóa: trong khóa không đọc gì của Events.
{
  const events = fakeSheet([['event_id', 'item_id'], ['E0', 'I1']]);
  const { repo, lock } = loadRepo({ Events: events });
  let readsInLock = 0;
  const origRange = events.getRange, origCol = events.getLastColumn;
  events.getLastColumn = () => { if (lock.held) readsInLock++; return origCol(); };
  events.getRange = (...a) => { const r = origRange(...a); const gv = r.getValues; r.getValues = () => { if (lock.held) readsInLock++; return gv(); }; return r; };
  repo.tx(t => { t.append('Events', { event_id: 'E1', item_id: 'I9' }); }, { append: ['Events'] });
  assert.equal(readsInLock, 0, 'no header/table read of Events inside the lock');
  assert.deepEqual(plain(events.grid[2]), ['E1', 'I9']);
  // Không dùng tới thì cũng không để lại bản chỉ-thêm lệch vị trí dòng.
  repo.tx(() => 1, { append: ['Events'] });
  assert.equal(repo.find('Events', 'event_id', 'E1').item_id, 'I9');
}

// 2. Tìm dòng vừa thêm trong cùng giao dịch ở bảng chỉ-thêm vẫn thấy.
{
  const events = fakeSheet([['event_id', 'item_id'], ['E0', 'I1']]);
  const { repo } = loadRepo({ Events: events });
  repo.tx(t => {
    t.append('Events', { event_id: 'E1', item_id: 'I1' });
    t.append('Events', { event_id: 'E2', item_id: 'I1' });
    assert.equal(t.find('Events', 'event_id', 'E2').object.item_id, 'I1');
    assert.equal(t.find('Events', 'event_id', 'E0').object.item_id, 'I1');
  });
  assert.deepEqual(plain(events.grid.map(r => r[0])), ['event_id', 'E0', 'E1', 'E2'], 'pending rows are written exactly once');
}

// 3. Dòng bị dời chỗ (bất thường) → phát hiện lệch khóa, đọc lại trọn bảng, vẫn đúng dòng.
{
  const items = fakeSheet(itemRows(5));
  const { repo } = loadRepo({ WorkItems: items });
  repo.getAll('WorkItems');
  items.grid.splice(1, 0, ['I0', 'CHEN', 1]);   // chèn một dòng lên đầu: mọi dòng dời xuống
  repo.tx(t => {
    const i3 = t.find('WorkItems', 'item_id', 'I3');
    assert.equal(i3.object.item_id, 'I3');
    t.write(i3, { status: 'DUNG' });
  });
  assert.deepEqual(plain(items.grid.find(r => r[0] === 'I3')), ['I3', 'DUNG', 1], 'a shifted row must still be written to its real position');
  assert.equal(items.grid.find(r => r[0] === 'I2')[1], 'A');
}

// 4. Quét trọn bảng nghiệp vụ trong khóa phải là bản mới (không quyết định trên bản cũ).
{
  const items = fakeSheet(itemRows(3));
  const { repo } = loadRepo({ WorkItems: items });
  repo.getAll('WorkItems');
  items.grid[1][1] = 'MOI';
  repo.tx(t => assert.equal(t.rows('WorkItems')[0].status, 'MOI'));
}

// 5. Giao lô nhiều hồ sơ: quá ngưỡng đọc từng dòng thì đọc trọn một lần.
{
  const items = fakeSheet(itemRows(40));
  const { repo } = loadRepo({ WorkItems: items });
  repo.getAll('WorkItems');
  const readsBefore = items.calls.rowReads, fullBefore = items.calls.getDataRange;
  repo.tx(t => { for (let i = 1; i <= 40; i++) t.write(t.find('WorkItems', 'item_id', 'I' + i), { status: 'GIAO' }); });
  assert.ok(items.calls.rowReads - readsBefore <= 14, 'row-by-row reads are capped');
  assert.equal(items.calls.getDataRange - fullBefore, 1, 'then one full read replaces them');
  assert.ok(items.grid.slice(1).every(r => r[1] === 'GIAO'));
}

// 5b. Vừa thêm dòng, sửa dòng vừa thêm, rồi vượt ngưỡng đọc lại: không nhân đôi, không lệch.
{
  const items = fakeSheet(itemRows(30));
  const { repo } = loadRepo({ WorkItems: items });
  repo.getAll('WorkItems');
  items.grid.push(['I31', 'KHAC_THEM', 1]);
  repo.tx(t => {
    t.append('WorkItems', { item_id: 'N1', status: 'MOI', version: 1 });
    t.write(t.find('WorkItems', 'item_id', 'N1'), { status: 'MOI_SUA' });
    for (let i = 1; i <= 20; i++) t.write(t.find('WorkItems', 'item_id', 'I' + i), { status: 'GIAO' });
    assert.equal(t.find('WorkItems', 'item_id', 'N1').object.status, 'MOI_SUA');
  });
  const ids = items.grid.slice(1).map(r => r[0]);
  assert.equal(ids.length, 32, 'exactly one new row');
  assert.equal(ids[30], 'I31', 'the row appended by someone else stays in place');
  assert.deepEqual(plain(items.grid[32]), ['N1', 'MOI_SUA', 1]);
  assert.ok(items.grid.slice(1, 21).every(r => r[1] === 'GIAO'));
  assert.ok(items.grid.slice(21, 31).every(r => r[1] === 'A'));
}

// 6. Lỗi giữa giao dịch vẫn không ghi gì.
{
  const items = fakeSheet(itemRows(3));
  const events = fakeSheet([['event_id', 'item_id']]);
  const { repo } = loadRepo({ WorkItems: items, Events: events });
  repo.getAll('WorkItems');
  assert.throws(() => repo.tx(t => {
    t.write(t.find('WorkItems', 'item_id', 'I1'), { status: 'X' });
    t.append('Events', { event_id: 'GHOST', item_id: 'I1' });
    throw new Error('validation failed');
  }), /validation failed/);
  assert.equal(items.grid[1][1], 'A');
  assert.equal(events.grid.length, 1);
}

// 6b. Danh mục: đọc trong khóa dùng bản trước khóa; dòng mới vẫn tìm thấy; ghi thì
// phát hiện người khác vừa đổi dòng đó và bắt thử lại thay vì ghi đè.
{
  const users = fakeSheet([['user_id', 'full_name'], ['U1', 'A'], ['U2', 'B']]);
  const { repo, lock } = loadRepo({ Users: users });
  repo.getAll('Users');
  let readsInLock = 0; const gr = users.getRange, glr = users.getLastRow;
  users.getRange = (...a) => { const r = gr(...a); const gv = r.getValues; r.getValues = () => { if (lock.held) readsInLock++; return gv(); }; return r; };
  users.getLastRow = () => { if (lock.held) readsInLock++; return glr(); };
  repo.tx(t => { assert.equal(t.find('Users', 'user_id', 'U2').object.full_name, 'B'); t.rows('Users'); });
  assert.equal(readsInLock, 0, 'read-only catalog lookups cost nothing inside the lock');

  users.grid.push(['U3', 'Mới tạo']);
  repo.tx(t => assert.equal(t.find('Users', 'user_id', 'U3').object.full_name, 'Mới tạo', 'a user created seconds ago is still found'));

  const { repo: r2 } = loadRepo({ Users: users });
  r2.getAll('Users');
  users.grid[1][1] = 'ADMIN_DOI';
  assert.throws(() => r2.tx(t => t.write(t.find('Users', 'user_id', 'U1'), { full_name: 'GHI_DE' })), /LS_BUSY/);
  assert.equal(users.grid[1][1], 'ADMIN_DOI', 'a concurrent catalog edit is never overwritten');
  r2.tx(t => t.write(t.find('Users', 'user_id', 'U2'), { full_name: 'B2' }));
  assert.equal(users.grid[2][1], 'B2', 'an unchanged catalog row is written normally');
}

// 7. Các lượt ghi hồ sơ trong Code.gs đọc sẵn bảng ngoài khóa.
{
  const code = fs.readFileSync('Code.gs', 'utf8');
  const body = name => { const s = code.indexOf('function ' + name + '('); return code.slice(s, code.indexOf('\nfunction ', s + 10)); };
  for (const name of ['transitionItem', 'assignWorkItemsBatch', 'saveChecklist', 'confirmDossierReceipt', 'createRequest']) {
    assert.match(body(name), /\}, (ITEM|NOTIFY)_WARM_\);/, name + ' must warm its tables outside the lock');
  }
}

console.log('row-lock contract ok');
