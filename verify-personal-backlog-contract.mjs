import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export function backlogFixture(D) {
  const state = D.seed();
  const user = state.users.find(u => u.role === 'CAN_BO_LS');
  state.session = user.user_id;
  const loan = { code: 'DASH_LOAN', name: 'Vay món', group: 'Món', needs_appointment: true, sla_hours: 8, active: true, checklist: ['Kiểm tra hồ sơ'] };
  const warehouse = { code: 'DASH_WAREHOUSE', name: 'Xuất kho TSĐB', group: 'TSĐB', needs_appointment: false, sla_hours: 8, active: true, checklist: [] };
  const other = { code: 'DASH_OTHER', name: 'Công việc khác', group: 'Khác', needs_appointment: false, sla_hours: 8, active: true, checklist: [] };
  state.workTypes.push(loan, warehouse, other);
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today + 'T12:00:00+07:00') - 86400000).toISOString();
  const base = {
    ...state.items[0], request_id: state.requests[0].request_id,
    assigned_user_id: user.user_id, status: 'DANG_THUC_HIEN', work_type_code: loan.code,
    assigned_at: today + 'T08:00:00+07:00',
    dossier_received_at: today + 'T08:00:00+07:00', processing_started_at: today + 'T08:00:00+07:00',
    processing_sessions: [{ user_id: user.user_id, start: today + 'T08:00:00+07:00', end: '' }],
    execution_state: 'ACTIVE', completed_at: '', carried_to_item_id: '', appointment: null,
    occurrence_date: today, due_at: '2099-10-08T16:00:00+07:00', version: 1,
    checklist: loan.checklist.map(() => false), result_credit: {}, result_flags: {},
    syncing: false, pause_log: [], sla_pause_log: [], pending: null
  };
  const item = (id, fields = {}) => ({ ...structuredClone(base), item_id: id, source_stt: id, ...fields });
  state.items = [
    item('ACTIVE', { appointment: { at: today + 'T10:00:00+07:00', place: 'Chi nhánh' } }),
    item('LATE', { due_at: '2020-01-01T09:00:00+07:00', appointment: { at: today + 'T10:00:00+07:00' } }),
    item('RECEIVE', { status: 'DA_PHAN_CONG', dossier_received_at: '', processing_started_at: '', processing_sessions: [], execution_state: '', due_at: '2020-01-01T09:00:00+07:00' }),
    item('QUEUED', { execution_state: 'QUEUED', processing_started_at: '', processing_sessions: [] }),
    item('WAITING', { execution_state: 'WAITING', processing_sessions: [] }),
    item('PAUSED', { work_type_code: other.code, status: 'TAM_DUNG', execution_state: '', processing_sessions: [] }),
    item('APPOINTMENT', { appointment: null }),
    item('WAREHOUSE', { work_type_code: warehouse.code, checklist: warehouse.checklist.map(() => false) }),
    item('OLD_MONTH', { period_id: 'OLD_PERIOD', occurrence_date: '2025-01-02', assigned_at: '2025-01-02T08:00:00+07:00', execution_state: 'WAITING', processing_sessions: [] }),
    item('YESTERDAY', { work_type_code: other.code, occurrence_date: yesterday.slice(0, 10), assigned_at: yesterday, execution_state: 'WAITING', processing_sessions: [] }),
    item('CARRIED_PREDECESSOR', { carried_to_item_id: 'OLD_MONTH' }),
    item('DONE', { status: 'HOAN_THANH_LS', completed_at: today + 'T09:00:00+07:00' }),
    item('CANCELED', { status: 'HUY' }),
    item('FOREIGN', { assigned_user_id: 'OTHER_LS' }),
    item('SYNCING', { syncing: true })
  ];
  return state;
}

const ctx = {
  LS: {}, window: {}, document: {}, localStorage: { getItem: () => null, setItem() {} },
  FormData: class { constructor(form) { this.values = form.values; } get(k) { return this.values[k] ?? null; } }
};
for (const file of ['core', 'domain', 'ui', 'charts', 'screens']) {
  vm.runInNewContext(fs.readFileSync('js/' + file + '.js', 'utf8'), ctx);
}
const U = ctx.LS, S = U.screens, state = backlogFixture(U.domain);
U.replace(state);
U.app = { render() {} };
let dialog = '', error = '';
U.ui.openDialog = (_, body) => { dialog = body; };
U.ui.closeDialog = () => {};
U.ui.dialogOpen = () => false;
U.ui.toast = message => { error = message; };
const backlog = () => S.personalDashboard().match(/<section class="personal-backlog"[\s\S]*?<\/section>/)[0];
const row = (html, id) => html.match(new RegExp('<tr[^>]*data-row="' + id + '"[^>]*>[\\s\\S]*?<\\/tr>'))?.[0] || '';
const group = (html, age) => {
  const marker = 'data-backlog-age="' + age + '"';
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const next = html.indexOf('data-backlog-age="', start + marker.length);
  return html.slice(start, next < 0 ? html.length : next);
};
let html = backlog();
assert.equal((html.match(/data-row=/g) || []).length, 11);
assert.equal((html.match(/data-backlog-kind=/g) || []).length, 10, 'Draft counts stay visible; warehouse, receipt and other tags appear when applicable');
const todayGroup = group(html, 'today'), previousGroup = group(html, 'previous');
assert.match(todayGroup, /Hôm nay/);
assert.match(previousGroup, /Tồn các ngày trước/);
assert.match(todayGroup, /Kho TSĐB 1/);
assert.match(todayGroup, /HĐTD 6/);
assert.match(todayGroup, /HĐTC 0/);
assert.match(todayGroup, /Chưa nhận HS 1/);
assert.match(todayGroup, /RLOS 6/);
assert.match(todayGroup, /Khác 1/);
assert.doesNotMatch(previousGroup, /Kho TSĐB/);
assert.match(previousGroup, /HĐTC 0/);
assert.match(previousGroup, /HĐTD 1/);
assert.match(previousGroup, /RLOS 1/);
assert.match(previousGroup, /Khác 1/);
assert.equal((html.match(/class="personal-backlog-detail"/g) || []).length, 2, 'Today and previous backlog expand independently');
assert.doesNotMatch(html, /<details class="personal-backlog-detail"[^>]*\bopen\b/, 'Long item rows are collapsed by default');
assert.match(row(html, 'ACTIVE'), /data-backlog-parts="HDTD,RLOS"/);
assert.match(row(html, 'WAREHOUSE'), /data-backlog-parts="KHO"/);
assert.match(row(html, 'PAUSED'), /data-backlog-parts="KHAC"/);
assert.match(row(html, 'RECEIVE'), /data-backlog-parts="CHUA_NHAN"/, 'Unreceived work stays visible separately from drafting backlog');
assert.match(todayGroup, /1 quá hạn/);
assert.match(previousGroup, /data-row="OLD_MONTH"/, 'Open backlog is independent of the report day and month');
assert.match(previousGroup, /data-row="YESTERDAY"/, 'All earlier assignment dates share the previous-days group');
assert.doesNotMatch(todayGroup, /data-row="(?:OLD_MONTH|YESTERDAY)"/);
assert.doesNotMatch(html, /data-row="(?:FOREIGN|DONE|CANCELED|CARRIED_PREDECESSOR)"/);
assert.doesNotMatch(S.mine(), /data-row="CARRIED_PREDECESSOR"/);
assert.ok(html.indexOf('data-row="LATE"') < html.indexOf('data-row="ACTIVE"'));
assert.match(row(html, 'ACTIVE'), /data-to="HOAN_THANH_LS"[^>]*aria-keyshortcuts="c"/);
assert.match(row(html, 'RECEIVE'), /data-to="DANG_THUC_HIEN"/);
assert.doesNotMatch(row(html, 'RECEIVE'), /data-to="HOAN_THANH_LS"/);
assert.match(row(html, 'QUEUED'), /data-act="start-work"/);
assert.match(row(html, 'WAITING'), /Làm tiếp/);
assert.doesNotMatch(row(html, 'QUEUED') + row(html, 'WAITING'), /data-to="HOAN_THANH_LS"/);
assert.match(row(html, 'PAUSED'), /data-to="DANG_THUC_HIEN"/);
assert.doesNotMatch(row(html, 'PAUSED'), /data-act="start-work"|data-to="HOAN_THANH_LS"/);
assert.match(row(html, 'APPOINTMENT'), /data-to="DANG_HEN_KH"/);
assert.doesNotMatch(row(html, 'APPOINTMENT'), /data-to="HOAN_THANH_LS"/);
assert.match(row(html, 'SYNCING'), /Đang lưu/);
assert.doesNotMatch(row(html, 'SYNCING'), /data-act="flow"|data-act="start-work"/);
state.global_pause = { operation_id: 'PAUSE' };
assert.doesNotMatch(backlog(), /data-act="flow"|data-act="start-work"/);
state.global_pause = null;

const active = state.items.find(i => i.item_id === 'ACTIVE');
S.flow(active.item_id, 'HOAN_THANH_LS');
assert.match(dialog, /data-form="flow"/);
assert.match(dialog, /data-checklist-box="ACTIVE"/);
assert.match(dialog, /data-act="checklist-toggle"/);
assert.match(dialog, /name="notification_mode"/);
const form = {
  values: { notification_mode: 'NONE' },
  getAttribute: key => ({ 'data-id': active.item_id, 'data-to': 'HOAN_THANH_LS', 'data-from': active.status, 'data-version': String(active.version) })[key] || null,
  setAttribute() {}
};
S.submitFlow(form);
assert.match(error, /tích đủ/);
assert.equal(active.status, 'DANG_THUC_HIEN');
active.checklist.forEach((_, index) => S.saveChecklistToggle(active.item_id, index, true));
S.submitFlow(form);
assert.equal(active.status, 'HOAN_THANH_LS');
assert.doesNotMatch(backlog(), /data-row="ACTIVE"/, 'Completion removes the item and recomputes group counts');
assert.match(group(backlog(), 'today'), /HĐTD 5/);
assert.match(group(backlog(), 'today'), /RLOS 5/);
state.items = [];
assert.match(backlog(), /Không có việc tồn/);
state.session = state.users.find(u => u.role === 'PHONG_PGD').user_id;
assert.doesNotMatch(S.personalDashboard(), /class="personal-backlog"/);
console.log('Personal backlog: grouping, scope, carryover, priority, workflow guards, checklist and completion passed.');
