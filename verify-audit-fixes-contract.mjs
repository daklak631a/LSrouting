// Regression checks for the actionable findings in docs/PROJECT_AUDIT_2026-10-01.md.
// Synthetic data only; no Sheets, Gmail, provider, or deployment calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createApp } from './gateway/src/server.js';
import { loadConfig } from './gateway/src/config.js';
import { createStore } from './gateway/src/store/index.js';
import { createRegistry } from './gateway/src/providers/index.js';

const read = p => fs.readFileSync(p, 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const iso = value => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function fixture() {
  let seq = 0;
  const ctx = { console, Utilities: {
    getUuid: () => String(++seq).padStart(32, '0'),
    formatDate(date, zone, pattern) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
      return pattern === 'yyyy-MM' ? `${values.year}-${values.month}` : `${values.year}-${values.month}-${values.day}`;
    }
  }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('TimeTracking.gs'), ctx);
  vm.runInContext(read('Code.gs'), ctx);
  ctx.id_ = prefix => prefix + '_' + (++seq);
  ctx.stamp_ = () => '2026-10-01T03:00:00.000Z';
  ctx.markPlanDirty_ = () => {};
  ctx.provisionMonthlyPlanWorkbook_ = () => {};
  ctx.writePeriodSummary_ = () => {};
  ctx.writeOperationalScoreSnapshot_ = () => {};
  ctx.Notifications = { queue: () => 0 };
  const db = {
    Settings: [], Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', full_name: 'Synthetic LS', is_active: true, unit_id: 'U1' }],
    WorkTypes: [
      { type_code: 'A', display_name: 'A', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' },
      { type_code: 'B', display_name: 'B', sla_hours: 8, is_active: true, checklist_json: '[]' }
    ],
    MonthlyPlans: [
      { period_id: 'SEP', month_key: '2026-09', status: 'ACTIVE', start_date: '2026-09-01', end_date: '2026-09-30', spreadsheet_id: 'test-sep' },
      { period_id: 'OCT', month_key: '2026-10', status: 'SCHEDULED', start_date: '2026-10-01', end_date: '2026-10-31', activation_at: '2026-10-01', spreadsheet_id: 'test-oct' }
    ],
    Units: [{ unit_id: 'U1', name: 'Synthetic unit', kind: 'PGD', is_active: true }],
    Requests: [{ request_id: 'R1', period_id: 'SEP', unit_id: 'U1', customer_name: 'Synthetic customer', created_by: 'PG1', requestor_id: 'PG1' }],
    WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
  };
  const t = {
    rows: name => clone(db[name] || []),
    find(name, key, value) {
      const row = (db[name] || []).find(r => String(r[key]) === String(value));
      return row ? { name, row, object: clone(row) } : null;
    },
    write: (found, fields) => Object.assign(found.row, clone(fields)),
    append: (name, row) => (db[name] ||= []).push(clone(row)),
    tailWhere: () => ({ rows: [] })
  };
t.scan=(n,fn)=>t.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));t.select=(n,idCol,match)=>t.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>t.find(n,idCol,o[idCol]));
  ctx.DataRepository = { tx: fn => fn(t), getAll: name => t.rows(name), find: (name, key, value) => t.find(name, key, value)?.object || null };
  ctx.requireActor_ = () => db.Users[0];
  function item(extra = {}) {
    const row = Object.assign({ item_id: 'I' + (db.WorkItems.length + 1), period_id: 'SEP', request_id: 'R1', work_type_code: 'A', product_name: 'Synthetic product', occurrence_date: '2026-09-30', status: 'DANG_THUC_HIEN', assigned_user_id: 'LS1', version: 1, checklist_json: '[]', dossier_received_at: '2026-09-30T01:00:00.000Z', processing_started_at: '2026-09-30T01:00:00.000Z', processing_sessions_json: '[{"user_id":"LS1","work_type_code":"A","start":"2026-09-30T01:00:00.000Z","end":""}]', sla_pause_log_json: '[]' }, extra);
    db.WorkItems.push(row); return row;
  }
  return { ctx, db, t, item };
}

const cases = [];
function check(name, fn) {
  try { fn(); cases.push({ name, ok: true }); }
  catch (error) { cases.push({ name, ok: false, error: error.message }); }
}
async function checkAsync(name, fn) {
  try { await fn(); cases.push({ name, ok: true }); }
  catch (error) { cases.push({ name, ok: false, error: error.message }); }
}

check('A02 cross-table writes use one atomic Sheets batch', () => {
  const sheets = {};
  function fakeSheet(id, rows) {
    const grid = rows.map(row => row.slice());
    return {
      grid, getSheetId: () => id, getLastRow: () => grid.length, getLastColumn: () => grid[0].length,
      getDataRange: () => ({ getValues: () => grid.map(row => row.slice()) }),
      getRange: (row, col, count = 1, width = 1) => ({
        getValues: () => grid.slice(row - 1, row - 1 + count).map(line => line.slice(col - 1, col - 1 + width)),
        setNumberFormat() { return this; },
        setValues(values) { values.forEach((line, dy) => line.forEach((value, dx) => { grid[row - 1 + dy][col - 1 + dx] = value; })); return this; }
      })
    };
  }
  sheets.WorkItems = fakeSheet(11, [['item_id', 'status', 'version'], ['I1', 'DA_PHAN_CONG', 1]]);
  sheets.Events = fakeSheet(12, [['event_id', 'item_id']]);
  let failNext = false, batchCount = 0;
  function cellValue(cell) {
    const value = cell.userEnteredValue;
    return value.stringValue !== undefined ? value.stringValue : value.boolValue !== undefined ? value.boolValue : value.numberValue;
  }
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'STORE', setProperty() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] || null }), getActiveSpreadsheet: () => null },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, Utilities: { formatDate: () => '' },
    Sheets: { Spreadsheets: { batchUpdate(body) {
      batchCount++;
      if (failNext) { failNext = false; throw new Error('Injected atomic batch validation failure'); }
      body.requests.forEach(request => {
        if (request.updateCells) {
          const update = request.updateCells, sheet = Object.values(sheets).find(item => item.getSheetId() === update.start.sheetId);
          update.rows.forEach((line, y) => line.values.forEach((cell, x) => {
            sheet.grid[update.start.rowIndex + y][update.start.columnIndex + x] = cellValue(cell);
          }));
        } else if (request.appendCells) {
          const append = request.appendCells, sheet = Object.values(sheets).find(item => item.getSheetId() === append.sheetId);
          append.rows.forEach(line => sheet.grid.push(line.values.map(cellValue)));
        }
      });
    } } }
  };
  vm.createContext(ctx); vm.runInContext(read('DataRepository.gs'), ctx);
  const repo = ctx.DataRepository;
  failNext = true;
  assert.throws(() => repo.tx(t => {
    t.write(t.find('WorkItems', 'item_id', 'I1'), { status: 'DANG_THUC_HIEN', version: 2 });
    t.append('Events', { event_id: 'E1', item_id: 'I1' });
  }), /Injected atomic batch validation failure/);
  assert.equal(sheets.WorkItems.grid[1][1], 'DA_PHAN_CONG');
  assert.equal(sheets.Events.grid.length, 1);
  repo.tx(t => {
    t.write(t.find('WorkItems', 'item_id', 'I1'), { status: 'DANG_THUC_HIEN', version: 2 });
    t.append('Events', { event_id: 'E1', item_id: 'I1' });
  });
  assert.equal(batchCount, 2);
  assert.equal(sheets.WorkItems.grid[1][1], 'DANG_THUC_HIEN');
  assert.equal(sheets.Events.grid.length, 2);
});

check('A03 retries a pending monthly handoff after activation', () => {
  const { ctx, db, item } = fixture(); item();
  let attempts = 0;
  ctx.carryOpenWorkToPlan_ = () => { attempts++; if (attempts === 1) throw new Error('injected carry failure'); };
  assert.throws(() => ctx.activateDueMonthlyPlans_(false), /injected carry failure/);
  assert.equal(db.MonthlyPlans.find(p => p.period_id === 'OCT').handoff_status, 'PENDING');
  ctx.activateDueMonthlyPlans_(false);
  assert.equal(attempts, 2);
  assert.equal(db.MonthlyPlans.find(p => p.period_id === 'OCT').handoff_status, 'COMPLETED');
});

check('A04 carried rows reject stale transitions', () => {
  const { ctx, db, item } = fixture();
  const old = item({ carried_to_item_id: 'ITEM_NEW' });
  assert.throws(() => ctx.transitionItem(old.item_id, 'HOAN_THANH_LS', { expected_version: 1 }), /đã chuyển tháng/);
  assert.equal(old.status, 'DANG_THUC_HIEN');
  assert.equal(db.Events.length, 0);
});

check('A05 carry preserves priority, pending review, and remaps parents', () => {
  const { ctx, db, item } = fixture();
  const parent = item({ is_priority: true, pending_json: '{"kind":"CANCEL","by":"PG1"}' });
  const child = item({ parent_item_id: parent.item_id, work_type_code: 'B' });
  ctx.carryOpenWorkToPlan_('SEP', 'OCT', { user_id: 'SYSTEM' });
  const nextParent = db.WorkItems.find(r => r.carryover_from_item_id === parent.item_id);
  const nextChild = db.WorkItems.find(r => r.carryover_from_item_id === child.item_id);
  assert.equal(nextParent.is_priority, true);
  assert.equal(nextParent.pending_json, parent.pending_json);
  assert.equal(nextChild.parent_item_id, nextParent.item_id);
});

check('A06 month boundaries use Vietnam local date', () => {
  const { ctx } = fixture();
  ctx.stamp_ = () => '2026-09-30T18:00:00.000Z'; // 01:00 on 1 Oct in Vietnam
  assert.equal(ctx.localBusinessDate_(ctx.stamp_()), '2026-10-01');
  assert.equal(ctx.monthKey_('2026-09-30T18:00:00.000Z'), '2026-10');
});

check('A07 later receipt correction moves generated processing start consistently', () => {
  const { ctx, item } = fixture();
  const row = item();
  const result = ctx.correctItemTimes(row.item_id, { dossier_received_at: '2026-09-30T01:30:00.000Z' }, 'Correct accidental early receipt', 1);
  assert.equal(result.dossier_received_at, '2026-09-30T01:30:00.000Z');
  assert.equal(result.processing_started_at, '2026-09-30T01:30:00.000Z');
  const sessions = JSON.parse(result.processing_sessions_json);
  assert.equal(sessions[0].start, result.dossier_received_at);
});

check('A08 management-created linked work waits for LS receipt', () => {
  const { ctx, db, item } = fixture();
  const parent = item({ status: 'DA_PHAN_CONG', dossier_received_at: '', processing_started_at: '', processing_sessions_json: '' });
  ctx.requireActor_ = () => ({ user_id: 'KS1', role: 'KS_LS' });
  const result = ctx.addLinkedItem(parent.item_id, 'B');
  const child = db.WorkItems.find(i => i.item_id === result.item_id);
  assert.equal(child.status, 'DA_PHAN_CONG');
  assert.equal(child.dossier_received_at, '');
  assert.equal(child.processing_started_at, '');
  assert.equal(child.due_at, '');
  assert.equal(child.processing_sessions_json, '[]');
});

check('A09 handoff metrics match submit-to-assign and assign-to-receive', () => {
  const { ctx } = fixture();
  const metrics = ctx.LSTiming.metrics({
    submitted_at: '2026-09-30T00:30:00.000Z', assigned_at: '2026-09-30T00:45:00.000Z',
    first_assigned_at: '2026-09-30T00:45:00.000Z', dossier_received_at: '2026-09-30T01:00:00.000Z',
    processing_started_at: '', completed_at: ''
  }, { days: [1,2,3,4,5], open: '00:00', close: '23:59', breakFrom: '23:59', breakTo: '23:59' }, '2026-09-30T03:00:00.000Z');
  assert.equal(metrics.phan_cong, 0.25);
  assert.equal(metrics.tiep_nhan, 0.25);
});

check('A12 Admin DTO removes nested and free-text customer data', () => {
  const { ctx } = fixture();
  const row = ctx.sanitizeAdminItem_({ item_id: 'I1', status: 'DA_PHAN_CONG', note: 'SYNTHETIC_CUSTOMER',
    pending_json: '{"customer":"SYNTHETIC_CUSTOMER"}', processing_sessions_json: '[{"product_name":"SYNTHETIC_PRODUCT"}]' });
  const mail = ctx.sanitizeAdminOutbox_({ outbox_id: 'O1', recipient_kind: 'NOI_BO', recipient: 'staff@example.test',
    body: 'SYNTHETIC_CUSTOMER', note: 'SYNTHETIC_CUSTOMER echoed by provider' });
  for (const value of [JSON.stringify(row), JSON.stringify(mail)]) assert.doesNotMatch(value, /SYNTHETIC_CUSTOMER|SYNTHETIC_PRODUCT/);
  assert.equal(Object.hasOwn(mail, 'note'), false, 'Admin must not receive untrusted provider notes');
});

check('A13 temporary-password users cannot change assignment rules', () => {
  const { ctx } = fixture();
  ctx.requireActor_ = () => { throw new Error('must change password'); };
  ctx.currentUser_ = () => ({ user_id: 'KS1', role: 'KS_LS', must_change_password: true });
  assert.throws(() => ctx.adminSaveCatalog('catalogOption', 'RULE_AUDIT', {
    catalog_key: 'ASSIGNMENT_RULE', label: 'Synthetic rule', metadata_json: '{"assignee_id":"LS1","auto_assign":true}'
  }), /must change password/);
});

await checkAsync('A11 gateway does not retry an uncertain provider result', async () => {
  const token = 'synthetic-audit-token-'.repeat(2);
  const config = loadConfig({ GATEWAY_TOKEN: token, MOCK_PROVIDERS: 'true' });
  const store = await createStore(config.store); const registry = createRegistry({ config, store }); let delivered = 0;
  registry.register('SMS', { channel: 'SMS', async send() { delivered++; throw new Error('accepted by provider, reply timed out'); } });
  const server = createApp({ config, store, registry }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const send = () => fetch(`http://127.0.0.1:${server.address().port}/send`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-Idempotency-Key': 'audit-uncertain'
    }, body: JSON.stringify({ channel: 'SMS', provider: 'synthetic', to: '0912345678', body: 'synthetic', item_id: 'I1', template: 'TEST' }) });
    const first = await send(); const firstBody = await first.json();
    const second = await send(); await second.text();
    assert.equal(firstBody.outcome, 'unknown');
    assert.equal(second.status, 409);
    assert.equal(delivered, 1);
  } finally { await new Promise(resolve => server.close(resolve)); await store.close(); }
});

await checkAsync('A10 an email sent before persistence failure is not scheduled again', async () => {
  const src = read('Notifications.gs');
  const fail = src.slice(src.indexOf('  function failClaim_('), src.indexOf('  function runOutbox('));
  const unknown = src.slice(src.indexOf('  function markUnknownClaim_('), src.indexOf('  function runOutbox('));
  const run = src.slice(src.indexOf('  function runOutbox('), src.indexOf('  function subject_('));
  const outbox = { outbox_id: 'O1', channel: 'EMAIL', claim_token: 'C1', status: 'DANG_GUI', retry_count: 0 };
  let sends = 0;
  const ctx = { claimPending_: () => ({ items: [clone(outbox)], remaining: 0 }),
    sendClaimed_: () => { sends++; return { id: 'MAILAPP' }; }, finishClaim_: () => { throw new Error('Injected Sheets failure after successful MailApp'); },
    cfg_: () => ({ max_retry: 3 }), recordMetric_() {}, metricStatus_: s => s, recordWorkerRun_() {}, backoff_: () => '2026-10-01T03:05:00Z',
    DataRepository: { tx: fn => fn({ find: () => ({ object: outbox }), write: (_found, fields) => Object.assign(outbox, fields) }) } };
  vm.runInNewContext(fail + unknown + run, ctx); ctx.runOutbox(1);
  assert.equal(sends, 1);
  assert.equal(outbox.status, 'CAN_DOI_SOAT');
  assert.equal(outbox.next_try_at, '');
});

const failed = cases.filter(row => !row.ok);
console.log(JSON.stringify({ total: cases.length, passed: cases.length - failed.length, failed, cases }, null, 2));
if (failed.length) process.exitCode = 1;
