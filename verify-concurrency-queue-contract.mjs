// Khi 10–60 người dùng cùng lúc: khóa ghi phải ngắn, lệnh ghi gửi lại không
// sinh dòng trùng, và việc nặng (Sheet kế hoạch) chạy ở hàng chờ nền.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = f => fs.readFileSync(f, 'utf8');
const code = read('Code.gs');

/* ---------- 1. DataRepository: gom ghi, lỗi thì không ghi gì, đọc lại trong khóa ---------- */
function fakeSheet(rows) {
  const grid = rows.map(r => r.slice());
  const calls = { setValues: 0, appendRow: 0, getDataRange: 0 };
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
        getValues: () => grid.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w)),
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
function loadRepo(sheets, extra) {
  const ctx = Object.assign({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'KHO', setProperty() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] || null }), getActiveSpreadsheet: () => null },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { formatDate: () => '' }
  }, extra || {});
  vm.runInNewContext(read('DataRepository.gs'), ctx);
  return ctx.DataRepository;
}

{
  const items = fakeSheet([['item_id', 'status', 'version'], ['I1', 'A', 1], ['I2', 'A', 1], ['I3', 'A', 1]]);
  const events = fakeSheet([['event_id', 'item_id']]);
  const repo = loadRepo({ WorkItems: items, Events: events });

  repo.tx(t => {
    ['I1', 'I2', 'I3'].forEach((id, n) => {
      t.write(t.find('WorkItems', 'item_id', id), { status: 'B', version: 2 });
      t.append('Events', { event_id: 'E' + n, item_id: id });
    });
    assert.equal(t.find('Events', 'event_id', 'E2').object.item_id, 'I3', 'Rows appended in the transaction are visible to lookups');
    assert.equal(events.grid.length, 1, 'Nothing reaches the Sheet before the transaction commits');
  });
  assert.equal(items.calls.setValues, 1, 'Three adjacent edited rows are written as one range');
  assert.equal(events.calls.setValues + events.calls.appendRow, 1, 'Three appended rows are written in one call');
  assert.deepEqual(items.grid.slice(1).map(r => r[1]), ['B', 'B', 'B']);
  assert.equal(events.grid.length, 4);

  // Lỗi giữa giao dịch: không có dòng nào được ghi, bộ nhớ đệm không giữ dòng ma.
  assert.throws(() => repo.tx(t => {
    t.append('Events', { event_id: 'GHOST', item_id: 'I1' });
    t.write(t.find('WorkItems', 'item_id', 'I1'), { status: 'C' });
    throw new Error('validation failed');
  }), /validation failed/);
  assert.equal(events.grid.length, 4, 'A failed transaction must not leave half-written rows');
  assert.equal(items.grid[1][1], 'B');
  assert.equal(repo.find('Events', 'event_id', 'GHOST'), null, 'Discarded rows must not stay in the cache');

  // Đọc ngoài khóa rồi người khác ghi: giao dịch sau phải đọc lại, không ghi đè bằng bản cũ.
  repo.getAll('WorkItems');
  items.grid[2][1] = 'CHANGED_BY_OTHER_USER';
  repo.tx(t => {
    const found = t.find('WorkItems', 'item_id', 'I2');
    assert.equal(found.object.status, 'CHANGED_BY_OTHER_USER', 'tx must re-read data loaded outside the lock');
  });
}

// Hết lượt chờ khóa → lỗi LS_BUSY để trình duyệt tự thử lại (không phải lỗi nghiệp vụ).
{
  const repo = loadRepo({}, { LockService: { getScriptLock: () => ({ waitLock() { throw new Error('Lock timeout'); }, releaseLock() {} }) } });
  assert.throws(() => repo.tx(() => 1), /^Error: LS_BUSY|LS_BUSY/);
}

// Bảng danh mục dùng chung qua CacheService; ghi vào bảng thì thế hệ cache đổi ngay.
{
  const store = new Map();
  const CacheService = { getScriptCache: () => ({ get: k => store.get(k) ?? null, put: (k, v) => store.set(k, v), remove: k => store.delete(k) }) };
  const users = fakeSheet([['user_id', 'full_name'], ['U1', 'Cũ']]);
  const first = loadRepo({ Users: users }, { CacheService });
  assert.equal(first.getAll('Users')[0].full_name, 'Cũ');
  const second = loadRepo({ Users: users }, { CacheService });
  second.getAll('Users');
  assert.equal(users.calls.getDataRange, 1, 'A second execution reads reference tables from the shared cache');
  second.tx(t => t.write(t.find('Users', 'user_id', 'U1'), { full_name: 'Mới' }));
  const third = loadRepo({ Users: users }, { CacheService });
  assert.equal(third.getAll('Users')[0].full_name, 'Mới', 'A write must invalidate the shared cache for everyone');
}

/* ---------- 2. Thao tác người dùng không còn đồng bộ Sheet kế hoạch trong lượt gọi ---------- */
function body(name) {
  const start = code.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const next = code.indexOf('\nfunction ', start + 10);
  return code.slice(start, next);
}
for (const name of ['createRequest', 'transitionItem', 'assignWorkItemsBatch', 'confirmDossierReceipt',
  'saveChecklist', 'addLinkedItem', 'proposeRevision', 'resolveRevision', 'correctItemTimes', 'confirmLegacySessionOwner']) {
  const src = body(name);
  assert.doesNotMatch(src, /syncMonthlyPlanWorkbook_\(|writePeriodSummary_\(/, name + ' must not rebuild the plan workbook while the user waits');
  assert.match(src, /markPlanDirty_\(/, name + ' must queue a background plan sync');
}
assert.match(read('Notifications.gs'), /planSyncTick_: function \(\) \{ return ScriptApp\.newTrigger\('planSyncTick_'\)\.timeBased\(\)\.everyMinutes\(5\)/);
assert.match(read('Notifications.gs'), /if \(event === 'QUA_HAN'\) throttle = Math\.max\(throttle, 1440\)/, 'Overdue reminders must not add rows every few hours');
assert.match(body('getBootstrap'), /ensureRuntimeSchema_\(\)/);
assert.match(body('ensureRuntimeSchema_'), /LS_RUNTIME_READY/, 'Bootstrap must skip schema/trigger checks once the deployment is ready');
assert.doesNotMatch(body('activePlan_'), /DataRepository\.tx/, 'Loading the active plan must not take the global write lock');

// Hàng chờ nền: xử lý từng kỳ, xóa dấu trước khi đọc, lỗi thì xếp lại.
{
  const props = new Map([['LS_PLAN_DIRTY_P1', '1'], ['LS_PLAN_SUMMARY_P1', '1'], ['LS_PLAN_DIRTY_P2', '2']]);
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)),
      deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Logger: { log() {} }
  };
  vm.runInNewContext(code, ctx);
  const synced = [], summaries = [];
  ctx.DataRepository = { clearCache() {} };
  ctx.writePeriodSummary_ = id => summaries.push(id);
  ctx.syncMonthlyPlanWorkbookNow_ = id => { synced.push(id); if (id === 'P2') throw new Error('Drive lỗi'); return { ok: true }; };
  const out = ctx.syncDirtyPlans_();
  assert.deepEqual(synced, ['P1', 'P2'], 'Dirty plans are synced oldest first');
  assert.deepEqual(summaries, ['P1']);
  assert.equal(out.failed, 1);
  assert.ok(!props.has('LS_PLAN_DIRTY_P1'), 'Synced plan leaves the queue');
  assert.ok(props.has('LS_PLAN_DIRTY_P2'), 'Failed plan is queued again');
  assert.ok(!props.has('LS_PLAN_SYNC_AT'), 'Sync mutex is released');

  ctx.markPlanDirty_('P3');
  assert.ok(props.has('LS_PLAN_DIRTY_P3'));
  ctx.PropertiesService = { getScriptProperties: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => ctx.markPlanDirty_('P4'), 'A committed write must never be reported as failed because of the sync queue');
}

/* ---------- 3. Trình duyệt: hàng chờ tuần tự, thử lại cùng op_id ---------- */
{
  const sent = [];
  let failNext = 1;
  const runner = {
    withSuccessHandler(fn) { this.ok = fn; return this; },
    withFailureHandler(fn) { this.fail = fn; return this; },
    api(req) {
      const ok = this.ok, fail = this.fail;
      sent.push(req);
      setTimeout(() => {
        if (req.name === 'createRequest' && failNext-- > 0) fail(new Error('NetworkError: Connection failure due to HTTP 0'));
        else ok({ ok: true, name: req.name, op: req.op_id });
      }, 5);
    }
  };
  const ctx = { LS: { domain: { seed: () => ({}) } }, window: {}, google: { script: { run: runner } }, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), Math, Promise, console };
  ctx.window.localStorage = { getItem: () => 'a'.repeat(64), setItem() {}, removeItem() {} };
  vm.runInNewContext(read('js/gas-api.js'), ctx);
  const states = [];
  ctx.LS.api.onQueueChange(s => states.push(s.pending));

  const p1 = ctx.LS.api.createRequest({ customer: { name: 'KH' } });
  const p2 = ctx.LS.api.transitionItem('I1', 'DANG_THUC_HIEN', {});
  assert.equal(sent.length, 1, 'Second write waits until the first is confirmed');
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.name, 'createRequest');
  assert.equal(r2.name, 'transitionItem');
  const creates = sent.filter(r => r.name === 'createRequest');
  assert.equal(creates.length, 2, 'HTTP 0 is retried automatically');
  assert.equal(creates[0].op_id, creates[1].op_id, 'A retry reuses the op_id so the server can de-duplicate');
  assert.notEqual(creates[0].op_id, sent.find(r => r.name === 'transitionItem').op_id);
  assert.equal(sent.findIndex(r => r.name === 'transitionItem'), 2, 'Writes reach the server in click order');
  assert.ok(sent.every(r => r.token === 'a'.repeat(64)), 'Every call carries this browser session token');
  assert.equal(states[states.length - 1], 0, 'Queue drains');
}

console.log('Concurrency & write-queue contract passed.');
