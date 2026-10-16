import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise the actual GAS adapter and renderer, not a duplicate formatter.
function harness() {
  const pending = [];
  const runner = { withSuccessHandler(fn) { this.success = fn; return this; },
    withFailureHandler(fn) { this.failure = fn; return this; },
    getTimeReport() { pending.push(this.success); }, getReport() { pending.push(this.success); },
    api(req) { return this[req.name](...req.args); } };
  const ctx = { LS: {}, window: {}, document: {}, console,
    localStorage: { getItem: () => null, setItem() {} },
    google: { script: { run: runner } },
    FormData: class { constructor(values) { this.values = values; } get(k) { return this.values[k]; } } };
  for (const file of ['core', 'domain', 'ui', 'charts', 'gas-api', 'screens']) {
    vm.runInNewContext(fs.readFileSync('js/' + file + '.js', 'utf8'), ctx, { filename: file + '.js' });
  }
  const state = ctx.LS.domain.seed();
  state.session = state.users.find(u => u.role === 'QUAN_LY_LS').user_id;
  state.items = [];
  ctx.LS.replace(state); ctx.LS.setBackend('GAS');
  let html = '';
  ctx.LS.app = { render() { html = ctx.LS.screens.timeReport(); }, downloadXlsx() {} };
  return { ctx, pending, state, html: () => html };
}
const payload = () => ({ from: '2026-09-01', to: '2026-09-29', formula_version: 'sla_time_v2',
  total: { occupied_hours: 1, processing_hours: 1, completed: 0, other_operation_hours: 0, other_operation_count: 0 },
  quality: { missing_handoff: 1, unattributed_sessions: 0 },
  days: [{ day: '2026-09-28', occupied_hours: 1, processing_hours: 1, completed: 0, other_operation_hours: 0, other_operation_count: 0 }],
  rows: [{ day: '2026-09-28', user_id: 'A', work_type_code: 'W', product_name: 'Demo product',
    processing_hours: 1, occupied_hours: 1, completed: 0, items: 1, on_time: 0, timed_completed: 0, other_operation_hours: 0, other_operation_count: 0 }] });
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const run = h => h.ctx.LS.screens.runTimeReport({ from: '2026-09-01', to: '2026-09-29' });

const h = harness();
run(h); h.pending.shift()(payload()); await tick();
assert.doesNotMatch(h.html(), /Không lấy được báo cáo|toFixed/, 'Missing nullable SLA average must render as unavailable');
assert.match(h.html(), /Demo product/);
assert.match(h.html(), /60 phút/, 'Giờ hiện bằng số phút');
assert.doesNotMatch(h.html(), /\d\.\d\dh/, 'Không hiện số giờ thập phân');
assert.match(h.html(), /—/);

for (const average of [null, undefined, 0, '0', '2.5']) {
  const sample = harness(), data = payload();
  data.rows[0].avg_sla_hours = average;
  data.rows[0].timed_completed = average == null ? 0 : 1;
  data.total.occupied_hours = '1'; data.rows[0].processing_hours = '1';
  run(sample); sample.pending.shift()(data); await tick();
  assert.doesNotMatch(sample.html(), /Không lấy được báo cáo|toFixed|NaN/);
  if (average != null) assert.match(sample.html(), Number(average) === 2.5 ? /2\s*giờ\s*30\s*phút/ : /0\s*phút/);
}

const empty = harness();
run(empty); empty.pending.shift()({ ...payload(), rows: [], days: [],
  total: { occupied_hours: 0, processing_hours: 0, completed: 0, other_operation_hours: 0, other_operation_count: 0 } }); await tick();
assert.match(empty.html(), /0\s*phút/);
assert.doesNotMatch(empty.html(), /Không lấy được báo cáo/);

const bad = harness();
run(bad); const invalid = payload(); delete invalid.total.occupied_hours;
bad.pending.shift()(invalid); await tick();
assert.match(bad.html(), /Dữ liệu báo cáo thời gian không hợp lệ/, 'Missing required totals must fail explicitly, not silently become zero');
assert.doesNotMatch(bad.html(), /toFixed/);

for (const corrupt of [null, '', true, 'oops', Infinity]) {
  const sample = harness(), data = payload(); data.total.processing_hours = corrupt;
  run(sample); sample.pending.shift()(data); await tick();
  assert.match(sample.html(), /Dữ liệu báo cáo thời gian không hợp lệ/);
}
run(bad); bad.pending.shift()(payload()); await tick();
assert.match(bad.html(), /Demo product/, 'Retry after invalid response must recover');

const switched = harness();
run(switched); switched.pending.shift()(payload()); await tick();
switched.ctx.LS.screens.resetFilters();
switched.state.session = switched.state.users.find(u => u.role === 'CAN_BO_LS').user_id;
assert.doesNotMatch(switched.ctx.LS.screens.timeReport(), /Demo product/, 'Session reset must discard prior role report');

const late = harness();
run(late); late.ctx.LS.screens.resetFilters();
late.state.session = late.state.users.find(u => u.role === 'CAN_BO_LS').user_id;
late.pending.shift()(payload()); await tick();
assert.doesNotMatch(late.ctx.LS.screens.timeReport(), /Demo product/, 'Late response must not repopulate prior session data');

const summary = harness();
summary.ctx.LS.screens.refreshReport();
summary.ctx.LS.screens.resetFilters();
summary.pending.shift()(summary.ctx.LS.domain.reportFromItems('2026-09', '2026-09', 'unit', summary.state));
await tick();
assert.match(summary.ctx.LS.screens.report(), /Chưa chạy báo cáo/);

const personal = harness();
personal.state.session = personal.state.users.find(u => u.role === 'CAN_BO_LS').user_id;
personal.ctx.LS.app.render = () => personal.ctx.LS.screens.personalDashboard();
assert.doesNotThrow(() => personal.ctx.LS.screens.personalDashboard());
personal.ctx.LS.screens.resetFilters(); personal.pending.shift()(payload()); await tick();
// Reset while loading must discard the result without dereferencing null cache.
assert.equal(personal.pending.length, 0);

const smoke = harness(); smoke.ctx.LS.setBackend('BROWSER');
smoke.state.items = smoke.ctx.LS.domain.seed().items;
for (const role of ['PHONG_PGD', 'CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS', 'ADMIN']) {
  const user = smoke.state.users.find(u => u.role === role);
  if (!user) continue;
  smoke.state.session = user.user_id; smoke.ctx.LS.screens.resetFilters();
  for (const screen of ['work', 'queue', 'mine', 'board', 'report', 'timeReport', 'personalDashboard', 'periods', 'audit']) {
    assert.doesNotThrow(() => smoke.ctx.LS.screens[screen](), role + ': ' + screen);
  }
}
console.log('Time report GAS adapter, rendering, missing data and session isolation OK');
