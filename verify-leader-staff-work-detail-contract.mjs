import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = {
  LS: {}, window: {}, document: {},
  localStorage: { getItem: () => null, setItem() {} }
};
for (const file of ['core', 'domain', 'ui', 'charts', 'screens']) {
  vm.runInNewContext(fs.readFileSync('js/' + file + '.js', 'utf8'), ctx);
}

const U = ctx.LS, D = U.domain, S = U.screens;
const styles = fs.readFileSync('css/styles.css', 'utf8');
const state = D.seed();
const leader = state.users.find(user => user.role === 'KS_LS');
const staff = state.users.find(user => user.role === 'CAN_BO_LS');
assert.ok(leader && staff, 'Seed includes a leader and LS officer');
const today = U.localDate();
const template = structuredClone(state.items[0]);
const requestTemplate = structuredClone(state.requests[0]);
const request = suffix => {
  const value = structuredClone(requestTemplate);
  value.request_id = 'REQ_' + suffix;
  value.customer = { ...value.customer, name: 'Khách ' + suffix, cif: 'CIF-' + suffix };
  return value;
};
const addRequest = suffix => {
  const value = request(suffix);
  state.requests.push(value);
  return value.request_id;
};
const item = (id, suffix, fields = {}) => ({
  ...structuredClone(template),
  item_id: id,
  source_stt: id,
  request_id: addRequest(suffix),
  assigned_user_id: staff.user_id,
  assigned_at: today + 'T08:00:00+07:00',
  occurrence_date: today,
  due_at: today + 'T17:00:00+07:00',
  status: 'DA_PHAN_CONG',
  execution_state: '',
  processing_started_at: '',
  processing_sessions: [],
  completed_at: '',
  carried_to_item_id: '',
  syncing: false,
  ...fields
});
state.items = [
  item('ACTIVE_WORK', 'ACTIVE', {
    status: 'DANG_THUC_HIEN', execution_state: 'ACTIVE',
    processing_started_at: today + 'T08:30:00+07:00',
    processing_sessions: [{ user_id: staff.user_id, start: today + 'T08:30:00+07:00', end: '' }]
  }),
  item('ASSIGNED_WORK', 'ASSIGNED'),
  item('COMPLETED_WORK', 'COMPLETED', { status: 'HOAN_THANH_LS', completed_at: today + 'T09:00:00+07:00' }),
  item('CANCELED_WORK', 'CANCELED', { status: 'HUY' }),
  item('OTHER_STAFF_WORK', 'OTHER', { assigned_user_id: 'U004' }),
  item('CARRIED_SOURCE', 'CARRIED', { carried_to_item_id: 'CARRIED_COPY' })
];
state.session = leader.user_id;
U.replace(state);
U.app = { render() {} };

let dialogTitle = '', dialogBody = '', dialogSub = '', toast = '';
U.ui.openDialog = (title, body, options = {}) => { dialogTitle = title; dialogBody = body; dialogSub = options.sub || ''; };
U.ui.toast = message => { toast = message; };

const board = S.board();
assert.match(board, /data-act="staff-work-detail"/, 'Each officer summary exposes a work-detail action');
assert.match(board, new RegExp('data-user-id="' + staff.user_id + '"'), 'Action carries the selected officer ID');
assert.match(fs.readFileSync('js/app.js', 'utf8'), /'staff-work-detail': function \(el\) \{\s*S\.staffWorkDetail\(el\.getAttribute\('data-user-id'\)\);\s*\}/,
  'The work-detail action is connected to the click dispatcher');

S.staffWorkDetail(staff.user_id);
assert.match(dialogTitle, new RegExp(staff.full_name));
assert.match(dialogSub, /2 việc đang mở/);
assert.match(dialogBody, /Khách ACTIVE/);
assert.match(dialogBody, /Khách ASSIGNED/);
assert.match(dialogBody, /Đang xử lý/);
assert.match(dialogBody, /Đã phân công/);
assert.match(dialogBody, /Món/);
assert.match(dialogBody, /data-label="Phần việc"/);
assert.match(dialogBody, /data-label="Tiến độ"/);
assert.match(dialogBody, /HĐTD/);
assert.match(dialogBody, /RLOS/);
assert.ok(/\.assignment-work-preview-inner\s*\{[^}]*max-width:\s*960px;/.test(styles),
  'Inline detail stays compact instead of spanning the full assignment dialog');
assert.ok(/\.assignment-work-preview-inner \.staff-work-detail-table\s*\{[^}]*table-layout:\s*fixed;/.test(styles),
  'Officer detail columns use predictable widths');
assert.ok(/\.assignment-work-preview-inner \.staff-work-detail-table th:nth-child\(1\),\s*\.assignment-work-preview-inner \.staff-work-detail-table td:nth-child\(1\)\s*\{\s*width:\s*44%;/.test(styles),
  'The customer and work column gets enough space to stay readable');
assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.assignment-work-preview-inner\s*\{\s*max-width:\s*none;/.test(styles),
  'The inline detail can still use the full width on small screens');
assert.doesNotMatch(dialogBody, /data-label="Ngày giao"|data-label="Đơn vị gửi"|data-label="Hạn xử lý"/);
assert.doesNotMatch(dialogBody, /data-act="close-dialog"/, 'Read-only detail relies on the visible dialog-header close control');
assert.match(fs.readFileSync('js/ui.js', 'utf8'), /if \(!first\) first = el\.dialog\.querySelector\('button'\);/,
  'Read-only dialogs move focus to the visible header close control when the body has no form field');
assert.doesNotMatch(dialogBody, /Khách COMPLETED|Khách CANCELED|Khách OTHER|Khách CARRIED/);

dialogTitle = '';
dialogBody = '';
dialogSub = '';
toast = '';
state.session = staff.user_id;
S.staffWorkDetail(staff.user_id);
assert.match(toast, /Chỉ Kiểm soát LS hoặc Quản lý LS/);
assert.equal(dialogTitle, '', 'A non-leader cannot open another officer’s assignment detail');
assert.equal(dialogBody, '');
assert.equal(dialogSub, '');

console.log('Leader staff detail: per-officer action, open assignments, work state, metadata, and role guard passed.');
