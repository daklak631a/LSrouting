import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Ho_Chi_Minh';
const read = (file) => fs.readFileSync(file, 'utf8');
const node = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, querySelectorAll: () => [] });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: node, body: node(), querySelectorAll: () => [], querySelector: () => null };
const client = { LS: {}, document, console, Promise, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form.fields; } get(key) { return this.fields[key] ?? null; } } };
vm.createContext(client);
for (const file of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read('js/' + file + '.js'), client);
const LS = client.LS, D = LS.domain;
LS.load(D.seed);
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
LS.ui.openDialog = () => {};
LS.ui.closeDialog = () => {};
LS.ui.toast = () => {};
LS.ui.dialogOpen = () => false;
let dialog = '';
LS.ui.openDialog = (title, body) => { dialog = body; };
const st = LS.db();
const [officer, other] = st.users.filter((user) => user.role === 'CAN_BO_LS' && user.active);
const leader = st.users.find((user) => user.role === 'KS_LS');
st.session = leader.user_id;
st.workTypes.forEach((type) => { type.checklist = []; });
const db = {
  Settings: [{ key: 'work_days', value: '0,1,2,3,4,5,6' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }],
  Users: st.users.map((user) => ({ ...user, is_active: user.active })),
  WorkTypes: st.workTypes.map((type) => ({ type_code: type.code, group_name: type.group, display_name: type.name, sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' })),
  Requests: [{ request_id: 'R1', unit_id: officer.unit_id, period_id: 'P1', email: 'customer@example.com' }],
  WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
};
const server = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2) }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(server);
vm.runInContext(read('TimeTracking.gs'), server);
vm.runInContext(read('Code.gs'), server);
const tx = {
  rows: (name) => db[name] || [],
  find: (name, key, value) => { const object = (db[name] || []).find((row) => String(row[key]) === String(value)); return object ? { object, name } : null; },
  write: (found, fields) => Object.assign(found.object, fields),
  append: (name, row) => (db[name] ||= []).push(row),
  select: (name, key, predicate) => (db[name] || []).filter((row) => predicate((column) => row[column] ?? '')).map((object) => ({ object, name })),
  tailWhere: (name, limit, predicate, options = {}) => {
    const rows = [];
    for (const row of [...(db[name] || [])].reverse()) {
      if (options.stopWhen?.(row)) break;
      if (predicate(row)) rows.push(row);
      if (rows.length >= limit) break;
    }
    return { rows };
  }
};
server.DataRepository = { tx: (fn) => fn(tx), getAll: tx.rows, tailWhere: tx.tailWhere, find: (name, key, value) => tx.find(name, key, value)?.object || null };
server.markPlanDirty_ = () => {};
server.Notifications = { queue: () => 0 };
let actor = db.Users.find((user) => user.user_id === officer.user_id);
server.requireActor_ = () => actor;
const now = new Date().toISOString();
let stamp = now;
server.stamp_ = () => stamp;
let sequence = 0;
const make = (code = 'LEGACY_05', fields = {}) => {
  const type = st.workTypes.find((row) => row.code === code);
  const item = { item_id: 'RESULT_' + (++sequence), request_id: 'R1', period_id: 'P1', work_type_code: code, product_name: type.name,
    status: 'DANG_THUC_HIEN', assigned_user_id: officer.user_id, version: 1, checklist_json: '[]',
    dossier_received_at: now, processing_started_at: now, execution_state: 'ACTIVE', ...fields };
  db.WorkItems.push(item);
  return item;
};
const appointment = { at: now, channel: 'EMAIL' };
const transition = (item, to, options = {}) => server.transitionItem(item.item_id, to, { expected_version: item.version, ...options });
const schedule = (item) => transition(item, 'DANG_HEN_KH', { appointment });
function sync(items = db.WorkItems) {
  st.requests = [{ request_id: 'R1', unit_id: officer.unit_id, customer: { name: 'Fixture' } }];
  st.items = items.map((item) => ({ ...item, checklist: [], appointment: item.appointment_json ? JSON.parse(item.appointment_json) : null,
    result_credit: JSON.parse(item.result_credit_json || '{}'), result_flags: item.result_flags_json ? JSON.parse(item.result_flags_json) : null }));
}
function totals(refresh = true) {
  if (refresh) sync();
  st.session = leader.user_id;
  const html = LS.screens.board();
  const out = {};
  for (const def of D.DAILY_ROWS.filter((row) => !row.header)) {
    const row = new RegExp('<td class="dm-act">(?:<button[\\s\\S]*?</button>)?(?:<i>)?' + def.label + '(?:</i>)?</td>[\\s\\S]*?<td class="num dm-total">([^<]*)</td>').exec(html);
    assert.ok(row, 'Daily report row: ' + def.key);
    out[def.key] = Number(row[1] === '-' ? 0 : row[1]);
  }
  return out;
}
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('Receiving a dossier starts backlog once and does not create drafting results', () => {
  const item = make('LEGACY_05', { collateral_mode: 'CO_SAN', status: 'DA_PHAN_CONG', dossier_received_at: '', processing_started_at: '', execution_state: '' });
  assert.equal(totals().HD_TIN_DUNG, 0);
  assert.equal(totals().TON_TIN_DUNG, 0);
  transition(item, 'DANG_THUC_HIEN');
  const accepted = item.dossier_received_at;
  assert.throws(() => server.confirmDossierReceipt(item.item_id, item.version), /đã có giờ nhận đủ/);
  assert.equal(item.dossier_received_at, accepted);
  const report = totals();
  assert.equal(report.HD_TIN_DUNG, 0);
  assert.equal(report.HD_THE_CHAP, 0);
  assert.equal(report.TON_TIN_DUNG, 1);
  assert.equal(report.TON_THE_CHAP, 0, 'Existing collateral creates no new mortgage backlog');
});

test('Existing collateral does not automatically create a mortgage result when scheduling', () => {
  const item = make('LEGACY_05', { collateral_mode: 'CO_SAN' });
  schedule(item);
  assert.deepEqual(Object.keys(JSON.parse(item.result_credit_json)), ['HD_TIN_DUNG']);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: false, RLOS: true } });
  assert.equal(totals().HD_TIN_DUNG, 1);
  assert.equal(totals().HD_THE_CHAP, 0);
});

test('Scheduling new collateral credits the draft while warehouse work stays open', () => {
  const parent = make('LEGACY_05', { collateral_mode: 'MOI', requested_mortgage_contract_count: 3 });
  const child = make('LEGACY_26', { parent_item_id: parent.item_id, collateral_mode: 'MOI', requested_mortgage_contract_count: 3 });
  schedule(parent);
  schedule(child);
  assert.equal(totals().HD_TIN_DUNG, 1);
  assert.equal(totals().HD_THE_CHAP, 1, 'Appointment records the drafted mortgage contract for its assigned officer');
  assert.equal(child.status, 'DANG_HEN_KH', 'Appointment does not complete the overall collateral dossier');
  assert.equal(JSON.parse(child.result_credit_json).HD_THE_CHAP.user_id, officer.user_id);
  assert.equal(JSON.parse(child.result_credit_json).HD_THE_CHAP.source, 'APPOINTMENT');
  assert.equal(JSON.parse(child.result_credit_json).NHAP_KHO, undefined, 'Warehouse work remains outstanding');
  server.recordWorkStep(child.item_id, 'HD_THE_CHAP', true, 2, child.version);
  server.recordWorkStep(child.item_id, 'HD_THE_CHAP', true, 2, child.version);
  assert.equal(totals().HD_THE_CHAP, 2, 'Actual count overrides the planned 3; repeated tick adds nothing');
  server.recordWorkStep(child.item_id, 'HD_THE_CHAP', false, null, child.version);
  assert.equal(totals().HD_THE_CHAP, 0, 'Untick removes the result');
  server.recordWorkStep(child.item_id, 'HD_THE_CHAP', true, 2, child.version);
  server.recordWorkStep(child.item_id, 'NHAP_KHO', true, null, child.version);
  transition(parent, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: true } });
  const beforeComplete = child.version;
  const options = { expected_version: beforeComplete, steps: [], step_quantities: { HD_THE_CHAP: 2 } };
  server.transitionItem(child.item_id, 'HOAN_THANH_LS', options);
  assert.equal(server.transitionItem(child.item_id, 'HOAN_THANH_LS', options).idempotent, true);
  assert.equal(totals().HD_THE_CHAP, 2, 'Completing both parent and child must not add mortgage contracts');
  assert.equal(totals().HD_TIN_DUNG, 1);
  assert.equal(totals().RLOS, 1);
});

test('Completed contract quantities can be corrected without reopening the dossier', () => {
  const item = make('LEGACY_05');
  schedule(item);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: true } });
  assert.equal(totals().HD_TIN_DUNG, 1);
  assert.equal(totals().HD_THE_CHAP, 1);
  server.recordWorkStep(item.item_id, 'HD_TIN_DUNG', true, 3, item.version);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 2, item.version);
  assert.equal(item.status, 'HOAN_THANH_LS', 'Quantity correction keeps the dossier completed');
  assert.equal(totals().HD_TIN_DUNG, 3);
  assert.equal(totals().HD_THE_CHAP, 2);
  assert.ok(db.Events.some((event) => event.item_id === item.item_id && /Điều chỉnh số lượng/.test(event.reason)), 'Every quantity correction is auditable');
});

test('A counted completion fallback can be corrected to four without reopening or changing its date', () => {
  const item = make('LEGACY_05', { collateral_mode: 'NONE' });
  transition(item, 'HOAN_THANH_LS', { result_flags: { RLOS: true } });
  assert.equal(JSON.parse(item.result_credit_json || '{}').HD_TIN_DUNG, undefined);
  assert.equal(totals().HD_TIN_DUNG, 1, 'This implicit result is already included in the report');
  const completedAt = item.completed_at;
  server.recordWorkStep(item.item_id, 'HD_TIN_DUNG', true, 4, item.version);
  assert.equal(totals().HD_TIN_DUNG, 4);
  assert.equal(JSON.parse(item.result_credit_json).HD_TIN_DUNG.at, completedAt);
  assert.equal(item.status, 'HOAN_THANH_LS');
});

test('Other collateral procedures count four mortgage contracts and allow corrections down to two', () => {
  const item = make('LEGACY_28', { status: 'HOAN_THANH_LS', completed_at: now, result_flags_json: '{"HD_THE_CHAP":true}' });
  assert.equal(totals().HD_THE_CHAP, 1);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  assert.equal(totals().HD_THE_CHAP, 4, 'One work item with four contracts yields four results');
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 2, item.version);
  assert.equal(totals().HD_THE_CHAP, 2);
  const credit = JSON.parse(item.result_credit_json).HD_THE_CHAP;
  assert.equal(credit.at, item.completed_at);
  assert.equal(credit.user_id, officer.user_id);
  assert.equal(item.status, 'HOAN_THANH_LS');
  server.saveResultFlags(item.item_id, { HD_THE_CHAP: false }, item.version);
  assert.equal(totals().HD_THE_CHAP, 0);
  assert.equal(totals().KHAC, 1);
  server.saveResultFlags(item.item_id, { HD_THE_CHAP: true }, item.version);
  assert.equal(totals().HD_THE_CHAP, 2, 'Restoring the result retains its corrected quantity');
});

test('LS can edit the quantity of a completed other-collateral mortgage result in its detail dialog', () => {
  make('LEGACY_28', { status: 'HOAN_THANH_LS', completed_at: now, result_flags_json: '{"HD_THE_CHAP":true}' });
  sync(); st.session = officer.user_id;
  LS.screens.detail(st.items[0].item_id);
  assert.match(dialog, /data-key="HD_THE_CHAP"/);
  LS.screens.recordStepQuantity(st.items[0].item_id, 'HD_THE_CHAP', 4);
  assert.equal(totals(false).HD_THE_CHAP, 4);
});

test('Draft quantities stay editable while the dossier is awaiting signing or warehouse completion', () => {
  const loan = make('LEGACY_05', { collateral_mode: 'NONE' });
  schedule(loan);
  const collateral = make('LEGACY_26');
  schedule(collateral);
  server.recordWorkStep(collateral.item_id, 'NHAP_KHO', true, null, collateral.version);
  sync(); st.session = officer.user_id;
  LS.screens.detail(loan.item_id);
  assert.match(dialog, /data-key="HD_TIN_DUNG"/);
  LS.screens.recordStepQuantity(loan.item_id, 'HD_TIN_DUNG', 4);
  LS.screens.recordStepQuantity(collateral.item_id, 'HD_THE_CHAP', 4);
  const report = totals(false);
  assert.equal(report.HD_TIN_DUNG, 4);
  assert.equal(report.HD_THE_CHAP, 4);
  assert.equal(report.NHAP_KHO, 1, 'Mortgage quantity never increases warehouse task results');
});

test('Historical appointment results are projected at their original event time without rewriting rows', () => {
  const bookedAt = new Date(new Date(now).getTime() - 86400000).toISOString();
  const item = make('LEGACY_26', { status: 'DANG_HEN_KH', appointment_json: JSON.stringify(appointment), requested_mortgage_contract_count: 8 });
  db.Events.push({ event_id: 'HISTORY', item_id: item.item_id, type: 'DANG_HEN_KH', by: officer.user_id, at: bookedAt, after_json: '{}' });
  const projected = server.projectAppointmentDraftCredits_([item], db.WorkTypes, server.DataRepository);
  assert.equal(item.result_credit_json, undefined, 'Reading the projection does not write business data');
  const credit = JSON.parse(projected[0].result_credit_json).HD_THE_CHAP;
  assert.equal(credit.at, bookedAt);
  assert.equal(credit.user_id, officer.user_id);
  assert.equal(credit.quantity, 1, 'Planned quantities are not treated as actual completed contracts');
  sync(projected);
  assert.equal(totals(false).TON_THE_CHAP, 0);
  assert.equal(totals(false).HD_THE_CHAP, 0, 'Yesterday\'s appointment is not moved to today');
  assert.equal(JSON.parse(projected[0].result_credit_json).NHAP_KHO, undefined);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.at, bookedAt);
  assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.quantity, 4);
});

test('An explicit draft removal after an old appointment is not recreated from history', () => {
  const item = make('LEGACY_26', { status: 'DANG_HEN_KH', appointment_json: JSON.stringify(appointment) });
  const old = { HD_THE_CHAP: { user_id: officer.user_id, at: now, quantity: 4 } };
  db.Events.push({ item_id: item.item_id, type: 'DANG_HEN_KH', by: officer.user_id, at: now, after_json: '{}' });
  db.Events.push({ item_id: item.item_id, type: 'GHI_NHAN_PHAN_VIEC', by: officer.user_id, at: now, before_json: JSON.stringify(old), after_json: '{}' });
  const projected = server.projectAppointmentDraftCredits_([item], db.WorkTypes, server.DataRepository);
  assert.equal(JSON.parse(projected[0].result_credit_json || '{}').HD_THE_CHAP, undefined);
});

test('Old appointment credit remains with the original LS after reassignment', () => {
  const item = make('LEGACY_26', { status: 'DANG_HEN_KH', assigned_user_id: other.user_id, appointment_json: JSON.stringify(appointment) });
  db.Events.push({ item_id: item.item_id, type: 'DANG_HEN_KH', by: officer.user_id, at: now, after_json: '{}' });
  const projected = server.projectAppointmentDraftCredits_([item], db.WorkTypes, server.DataRepository);
  assert.equal(JSON.parse(projected[0].result_credit_json).HD_THE_CHAP.user_id, officer.user_id);
  actor = db.Users.find((user) => user.user_id === other.user_id);
  assert.throws(() => server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version), /cán bộ khác/);
  actor = db.Users.find((user) => user.user_id === leader.user_id);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.user_id, officer.user_id);
});

test('Completed warehouse result quantities can be corrected without reopening the dossier', () => {
  const item = make('LEGACY_24');
  server.recordWorkStep(item.item_id, 'XUAT_KHO', true, 2, item.version);
  transition(item, 'HOAN_THANH_LS');
  assert.equal(totals().XUAT_KHO, 2);
  server.recordWorkStep(item.item_id, 'XUAT_KHO', true, 4, item.version);
  assert.equal(item.status, 'HOAN_THANH_LS');
  assert.equal(totals().XUAT_KHO, 4);
});

test('Completed legacy results without a receipt timestamp can correct quantity without changing timing', () => {
  const item = make('LEGACY_28', { status: 'HOAN_THANH_LS', completed_at: now, dossier_received_at: '', processing_started_at: '', result_flags_json: '{"HD_THE_CHAP":true}' });
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  assert.equal(totals().HD_THE_CHAP, 4);
  assert.equal(item.dossier_received_at, '');
  assert.equal(item.processing_started_at, '');
  assert.equal(item.completed_at, now);
});

test('Desktop, mobile, personal results and Excel use the corrected contract quantity', () => {
  const item = make('LEGACY_26');
  schedule(item);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  assert.equal(totals().HD_THE_CHAP, 4);
  const label = D.DAILY_ROWS.find((row) => row.key === 'HD_THE_CHAP').label;
  assert.match(LS.screens.board(), new RegExp('dm-card-label">' + label + '</span>\\s*<span class="dm-card-num"><b>4</b>'));
  st.session = officer.user_id;
  assert.match(LS.screens.personalDashboard(), new RegExp('dm-card-label">' + label + '</span>\\s*<span class="dm-card-num"><b>4</b>'));
  st.session = leader.user_id;
  let sheets;
  LS.app.downloadXlsx = (filename, value) => { sheets = value; };
  LS.screens.exportBoard();
  const rows = sheets[0].rows;
  const result = rows.find((row) => row[0] === label);
  assert.equal(result[rows[2].indexOf('TỔNG')], 4);
  assert.equal(result.slice(2).reduce((sum, value) => sum + Number(value || 0), 0), 8, 'Staff four and total four; no duplicate credit');
});

test('Rejected corrections preserve the saved quantity, owner and date', () => {
  const item = make('LEGACY_26');
  schedule(item);
  server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 4, item.version);
  const saved = JSON.stringify(item), events = db.Events.length;
  for (const quantity of [0, -1, 1.5, 'abc']) {
    assert.throws(() => server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, quantity, item.version), /số nguyên/);
  }
  assert.throws(() => server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 2, item.version - 1), /người khác cập nhật/);
  actor = db.Users.find((user) => user.user_id === other.user_id);
  assert.throws(() => server.recordWorkStep(item.item_id, 'HD_THE_CHAP', true, 2, item.version), /người được giao/);
  assert.equal(JSON.stringify(item), saved);
  assert.equal(db.Events.length, events);
});

test('Historical projection keeps actual saved quantity and completion does not shift its result date', () => {
  const bookedAt = new Date(new Date(now).getTime() - 86400000).toISOString();
  const item = make('LEGACY_26', { status: 'DANG_HEN_KH', appointment_json: JSON.stringify(appointment) });
  const actual = { HD_THE_CHAP: { user_id: officer.user_id, at: bookedAt, quantity: 4, source: 'APPOINTMENT' } };
  db.Events.push({ item_id: item.item_id, type: 'DANG_HEN_KH', by: leader.user_id, at: bookedAt, after_json: JSON.stringify({ result_credit_json: JSON.stringify(actual) }) });
  const projected = server.projectAppointmentDraftCredits_([item], db.WorkTypes, server.DataRepository);
  assert.equal(JSON.parse(projected[0].result_credit_json).HD_THE_CHAP.quantity, 4);
  transition(item, 'HOAN_THANH_LS', { steps: ['NHAP_KHO'] });
  assert.equal(item.status, 'HOAN_THANH_LS');
  assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.at, bookedAt);
  assert.equal(totals().HD_THE_CHAP, 0, 'Yesterday stays yesterday after completing today');
  assert.equal(totals().NHAP_KHO, 1);
});

test('New appointments, canceled and carried predecessors do not scan history; unknown history is not invented', () => {
  const fresh = make('LEGACY_26', { appointment_json: JSON.stringify({ ...appointment, draft_credit_version: 1 }) });
  const canceled = make('LEGACY_26', { status: 'HUY', appointment_json: JSON.stringify(appointment) });
  const carried = make('LEGACY_26', { carried_to_item_id: 'NEXT', appointment_json: JSON.stringify(appointment) });
  const noScan = { tailWhere() { assert.fail('No legacy credit to recover'); } };
  const items = [fresh, canceled, carried];
  assert.equal(server.projectAppointmentDraftCredits_(items, db.WorkTypes, noScan), items);
  const unknown = make('LEGACY_26', { appointment_json: JSON.stringify(appointment) });
  db.Events.push({ item_id: unknown.item_id, type: 'DANG_HEN_KH', by: leader.user_id, at: now, after_json: '{}' });
  const projected = server.projectAppointmentDraftCredits_([unknown], db.WorkTypes, server.DataRepository);
  assert.equal(projected[0].result_credit_json, undefined, 'No proof of the original LS: keep it uncredited');
  assert.equal(unknown.result_credit_json, undefined);
});

test('Recovered loan appointment credit can correct to four but cannot be unticked as a manual draft', () => {
  const item = make('LEGACY_05', { collateral_mode: 'NONE', status: 'DANG_HEN_KH', appointment_json: JSON.stringify(appointment) });
  db.Events.push({ item_id: item.item_id, type: 'DANG_HEN_KH', by: officer.user_id, at: now, after_json: '{}' });
  assert.throws(() => server.recordWorkStep(item.item_id, 'HD_TIN_DUNG', false, null, item.version), /đã ghi nhận lúc hẹn ký/);
  server.recordWorkStep(item.item_id, 'HD_TIN_DUNG', true, 4, item.version);
  assert.equal(totals().HD_TIN_DUNG, 4);
  assert.equal(JSON.parse(item.result_credit_json).HD_TIN_DUNG.at, now);
});

test('Actual GAS adapter saves four then two and redraws; rejected saves restore the previous total', async () => {
  const item = make('LEGACY_28', { status: 'HOAN_THANH_LS', completed_at: now, result_flags_json: '{"HD_THE_CHAP":true}' });
  sync(); st.session = officer.user_id;
  let pending, renders = 0;
  const originalApp = LS.app;
  const runner = {
    withSuccessHandler(fn) { this.success = fn; return this; },
    withFailureHandler(fn) { this.failure = fn; return this; },
    api(request) {
      assert.equal(request.name, 'recordWorkStep');
      try { this.success(server.recordWorkStep(...request.args)); }
      catch (error) { this.failure(error); }
    }
  };
  client.google = { script: { run: runner } };
  LS.app = { ...originalApp, render() { renders++; }, background(promise, options) {
    pending = promise.then(options.onOk, () => options.rollback());
  } };
  LS.setBackend('GAS');
  try {
    for (const quantity of [4, 2]) {
      st.session = officer.user_id;
      LS.screens.recordStepQuantity(item.item_id, 'HD_THE_CHAP', quantity);
      assert.equal(totals(false).HD_THE_CHAP, quantity, 'Optimistic report reflects the edit immediately');
      await pending;
      await Promise.resolve();
      assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.quantity, quantity, 'Server persisted actual quantity');
      assert.equal(totals().HD_THE_CHAP, quantity, 'Reload keeps the same result');
    }
    const savedVersion = item.version;
    actor = db.Users.find((user) => user.user_id === other.user_id);
    st.session = officer.user_id;
    LS.screens.recordStepQuantity(item.item_id, 'HD_THE_CHAP', 8);
    await pending;
    assert.equal(totals(false).HD_THE_CHAP, 2, 'Rejected edit restores the last saved report total');
    assert.equal(item.version, savedVersion);
    assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.at, now);
    assert.ok(renders >= 6, 'Optimistic updates, server responses and rollback redraw the report');
  } finally {
    LS.setBackend('BROWSER'); LS.app = originalApp; delete client.google;
  }
});

test('Unticking a loan mortgage result removes its own scheduling credit and can be reversed', () => {
  const item = make();
  schedule(item);
  const originalAt = JSON.parse(item.result_credit_json).HD_THE_CHAP.at;
  sync();
  const live = st.items[0], wt = st.workTypes.find((type) => type.code === item.work_type_code);
  assert.ok(Array.from(D.resultFlagsFor(live, wt)).some((flag) => flag.key === 'HD_THE_CHAP'), 'Own scheduled mortgage must remain editable');
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: false, RLOS: false } });
  assert.equal(totals().HD_THE_CHAP, 0);
  assert.equal(totals().HD_TIN_DUNG, 1);
  server.saveResultFlags(item.item_id, { HD_THE_CHAP: true }, item.version);
  assert.equal(totals().HD_THE_CHAP, 1);
  assert.equal(totals().RLOS, 0, 'Partial correction preserves the unticked RLOS result');
  assert.equal(JSON.parse(item.result_credit_json).HD_THE_CHAP.at, originalAt);
});

test('A transferred mortgage credit remains on the original officer and is never counted again', () => {
  const item = make('LEGACY_05', { assigned_user_id: other.user_id, collateral_mode: 'NONE', result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: officer.user_id, by: leader.user_id, at: now, quantity: 2 } }) });
  actor = db.Users.find((user) => user.user_id === other.user_id);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: false, RLOS: true } });
  assert.equal(totals().HD_THE_CHAP, 2);
  assert.equal(totals().HD_TIN_DUNG, 1);
});

test('Carryover copies count once and retain result corrections', () => {
  const old = make('LEGACY_05', { collateral_mode: 'NONE', result_flags_json: '{"HD_THE_CHAP":false,"RLOS":false}' });
  db.MonthlyPlans = [{ period_id: 'P2', start_date: LS.localDate() }];
  server.carryOpenWorkToPlan_('P1', 'P2', leader);
  const carried = db.WorkItems.find((item) => item.carryover_from_item_id === old.item_id);
  assert.ok(carried);
  assert.equal(old.carried_to_item_id, carried.item_id);
  assert.equal(carried.result_flags_json, old.result_flags_json);
  server.carryOpenWorkToPlan_('P1', 'P2', leader);
  assert.equal(db.WorkItems.length, 2, 'Repeated carryover does not add another copy');
  assert.equal(totals().TON_TIN_DUNG, 1, 'Old and next-period copies represent one open dossier');
});

test('A completed result does not disappear when its officer is inactive', () => {
  make('LEGACY_10', { status: 'HOAN_THANH_LS', completed_at: now, collateral_mode: 'NONE', result_flags_json: '{"RLOS":false}' });
  officer.active = false;
  assert.equal(totals().HD_TIN_DUNG, 1);
  officer.active = true;
});

test('A recorded step without quantity defaults to actual one, not the planned quantity', () => {
  const item = make('LEGACY_26', { requested_mortgage_contract_count: 4, result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: officer.user_id, by: officer.user_id, at: now } }) });
  sync();
  const live = st.items[0], wt = st.workTypes.find((type) => type.code === item.work_type_code);
  assert.equal(D.steps(live, wt)[0].quantity, 1, 'Displayed actual count must match the report instead of changing on completion');
  assert.equal(totals().HD_THE_CHAP, 1);
});

test('Historical linked mortgage credits count on the collateral work rather than both rows', () => {
  const parent = make('LEGACY_05', { result_credit_json: JSON.stringify({ HD_TIN_DUNG: { user_id: officer.user_id, by: officer.user_id, at: now }, HD_THE_CHAP: { user_id: officer.user_id, by: officer.user_id, at: now } }) });
  make('LEGACY_26', { parent_item_id: parent.item_id, assigned_user_id: other.user_id,
    result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: other.user_id, by: other.user_id, at: now, quantity: 3 } }) });
  assert.equal(totals().HD_THE_CHAP, 3);
  assert.equal(totals().HD_TIN_DUNG, 1);
  assert.equal(totals().TON_THE_CHAP, 0);
});

test('An old automatic existing-collateral credit requires an explicit mortgage confirmation', () => {
  const item = make('LEGACY_05', { collateral_mode: 'CO_SAN', result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: officer.user_id, by: officer.user_id, at: now } }) });
  assert.equal(totals().HD_THE_CHAP, 0);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: false } });
  assert.equal(totals().HD_THE_CHAP, 1, 'Explicit additional drafting is still recognized');
});

test('Completion on a later day preserves contract attribution to the drafting day', () => {
  const item = make();
  stamp = new Date(new Date(now).getTime() - 86400000).toISOString();
  schedule(item);
  const draftedAt = JSON.parse(item.result_credit_json).HD_TIN_DUNG.at;
  stamp = now;
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: true } });
  assert.equal(totals().HD_TIN_DUNG, 0, 'Today does not count yesterday\'s draft again');
  assert.equal(totals().HD_THE_CHAP, 0);
  assert.equal(totals().RLOS, 1);
  assert.equal(JSON.parse(item.result_credit_json).HD_TIN_DUNG.at, draftedAt);
});

test('Partial completion corrections retain a prior untick after transferring to another officer', () => {
  const item = make('LEGACY_05', { assigned_user_id: other.user_id, result_flags_json: '{"HD_THE_CHAP":false}',
    result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: officer.user_id, by: officer.user_id, at: now, source: 'APPOINTMENT' } }) });
  actor = db.Users.find((user) => user.user_id === other.user_id);
  transition(item, 'HOAN_THANH_LS', { result_flags: { RLOS: true } });
  assert.equal(totals().HD_THE_CHAP, 0);
  assert.equal(JSON.parse(item.result_flags_json).HD_THE_CHAP, false);
});

const form = (item, to, fields) => ({ fields,
  getAttribute: (key) => ({ 'data-id': item.item_id, 'data-to': to, 'data-from': item.status, 'data-version': String(item.version) })[key] || null,
  setAttribute() {}, removeAttribute() {} });

test('Actual completion form can untick and restore its scheduling mortgage result', () => {
  make(); sync();
  const item = st.items[0];
  st.session = officer.user_id;
  st.settings.sign_place = 'Fixture';
  LS.screens.submitFlow(form(item, 'DANG_HEN_KH', { appt_date: LS.localDate(), appt_time: '16:00', appt_channel: 'EMAIL' }));
  assert.equal(item.status, 'DANG_HEN_KH');
  assert.equal(item.result_credit.HD_TIN_DUNG.source, 'APPOINTMENT');
  LS.screens.flow(item.item_id, 'HOAN_THANH_LS');
  assert.match(dialog, /name="flag_HD_THE_CHAP" checked/);
  LS.screens.submitFlow(form(item, 'HOAN_THANH_LS', { notification_mode: 'NONE' }));
  assert.equal(item.status, 'HOAN_THANH_LS');
  assert.equal(totals(false).HD_THE_CHAP, 0);
  assert.equal(totals(false).HD_TIN_DUNG, 1);
  LS.screens.detail(item.item_id);
  assert.match(dialog, /data-act="step-quantity" data-id="[^"]+" data-key="HD_TIN_DUNG"/, 'Completed details expose the contract quantity editor.');
  LS.screens.recordStepQuantity(item.item_id, 'HD_TIN_DUNG', 4);
  assert.equal(item.status, 'HOAN_THANH_LS', 'Editing the result quantity does not reopen the dossier.');
  assert.equal(totals(false).HD_TIN_DUNG, 4, 'Local mode updates the completed contract result quantity.');
  st.session = officer.user_id;
  LS.screens.submitResultFlags(form(item, '', { flag_HD_THE_CHAP: 'on' }));
  assert.equal(totals(false).HD_THE_CHAP, 1);
  assert.equal(totals(false).RLOS, 0);
});

test('Reopening an unticked mortgage restores backlog and completing again adds no credit', () => {
  const item = make(); schedule(item);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: false, RLOS: false } });
  actor = db.Users.find((user) => user.user_id === leader.user_id);
  transition(item, 'DANG_THUC_HIEN', { reason: 'Correct drafting' });
  assert.equal(totals().TON_THE_CHAP, 1);
  assert.equal(totals().TON_TIN_DUNG, 0);
  actor = db.Users.find((user) => user.user_id === officer.user_id);
  server.focusWorkItem(item.item_id, item.version);
  transition(item, 'HOAN_THANH_LS', { result_flags: { HD_THE_CHAP: true, RLOS: true } });
  assert.equal(totals().HD_THE_CHAP, 1);
  assert.equal(totals().HD_TIN_DUNG, 1);
});

let failed = 0;
for (const [name, run] of cases) {
  db.WorkItems = []; db.Events = []; st.items = []; officer.active = true;
  stamp = now; dialog = '';
  actor = db.Users.find((user) => user.user_id === officer.user_id);
  try { await run(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
assert.equal(failed, 0, failed + ' result counting scenarios failed');
console.log('Result counting lifecycle contract passed: ' + cases.length + ' scenarios.');
