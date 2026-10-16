/**
 * Menu KS/QL gọn còn 5 mục: Hàng chờ (chỉ hồ sơ chờ phân công + quy tắc phân công nhanh),
 * Quản lý hồ sơ (mọi trạng thái, chia theo phòng), Kết quả & kế hoạch, Báo cáo (3 tab), Nhật ký.
 * Chạy: node verify-leader-nav-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {}, FormData: class {} };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens', 'admin']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain, S = LS.screens;
LS.app = { render() {} };
LS.load(D.seed);
const st = LS.db();

/* ---------- Menu ---------- */
assert.deepEqual(Array.from(D.ROLES.KS_LS.nav), ['queue', 'tracking', 'board', 'report', 'audit']);
assert.deepEqual(Array.from(D.ROLES.QUAN_LY_LS.nav), ['board', 'queue', 'tracking', 'report', 'audit']);
assert.ok(D.ROLES.PHONG_PGD.nav.includes('work'), 'Phòng/PGD vẫn có Đề nghị & hồ sơ');
for (const role of ['KS_LS', 'QUAN_LY_LS']) D.ROLES[role].nav.forEach((id) => assert.ok(D.SCREENS[id], role + ' có mục menu không tồn tại: ' + id));
assert.equal(D.screenFor('KS_LS', 'board').short, 'Kết quả & kế hoạch');
assert.equal(D.screenFor('ADMIN', 'board').short, 'Tổng hợp', 'Admin giữ tên cũ');
assert.equal(D.SCREENS.tracking.short, 'Quản lý hồ sơ');

/* ---------- Dữ liệu: hai phòng, mỗi trạng thái một hồ sơ cho từng phòng ---------- */
const officer = st.users.find((u) => u.role === 'CAN_BO_LS');
const unitA = st.requests[0].unit_id;
const unitB = st.units.find((x) => x.unit_id !== unitA && x.kind !== 'LS' && x.unit_id !== 'PHONG_LS') || { unit_id: 'U_B', name: 'Phòng B', kind: 'PGD', active: true };
if (!st.units.includes(unitB)) st.units.push(unitB);
const requestB = Object.assign(JSON.parse(JSON.stringify(st.requests[0])), { request_id: 'REQ_B', unit_id: unitB.unit_id });
st.requests.push(requestB);
st.items.length = 0;
const today = LS.localDate();
const statuses = Object.keys(D.STATUS);
const expectedTab = { DA_PHAN_CONG: 'assigned', DANG_THUC_HIEN: 'running', DA_SOAN_XONG: 'running', CHO_KS_DUYET: 'running', DANG_HEN_KH: 'appointment', TAM_DUNG: 'paused', HOAN_THANH_LS: 'done', HUY: 'canceled' };
const waiting = ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CAN_BO_SUNG'];
const base = { work_type_code: 'LEGACY_05', product_name: 'Món', occurrence_date: today, checklist: [], pending: null, version: 1, carried_to_item_id: '', due_at: '', completed_at: '', appointment: null };
let n = 0;
const ids = {};
for (const [tag, request] of [['A', st.requests[0]], ['B', requestB]]) {
  for (const status of statuses) {
    const item = Object.assign({}, base, { item_id: `T_${tag}_${status}`, source_stt: `T_${tag}_${status}`, request_id: request.request_id, status,
      assigned_user_id: waiting.includes(status) || status === 'CHUA_GIAO_HO_SO' ? '' : officer.user_id });
    st.items.push(item); ids[item.item_id] = true; n += 1;
  }
}
// Một hồ sơ đang xử lý đã quá hạn ở phòng A.
const overdue = Object.assign({}, base, { work_type_code: 'LEGACY_03', item_id: 'T_A_LATE', source_stt: 'T_A_LATE', request_id: st.requests[0].request_id, status: 'DANG_THUC_HIEN', assigned_user_id: officer.user_id, due_at: '2026-01-01T01:00:00.000Z' });
st.items.push(overdue);
const has = (html, id) => html.includes(`data-row="${id}"`);
const track = (tab, unit) => { S.setFilter('tracking', 'tab', tab); S.setFilter('tracking', 'tunit', unit || ''); S.setFilter('tracking', 'page', 1); return S.tracking(); };

for (const role of ['KS_LS', 'QUAN_LY_LS']) {
  st.session = st.users.find((u) => u.role === role).user_id;

  /* Hàng chờ: chỉ hồ sơ chưa giao, không còn hàng tab trạng thái. */
  S.setFilter('queue', 'view', ''); S.setFilter('queue', 'qunit', ''); S.setFilter('queue', 'page', 1);
  const queue = S.queue();
  for (const status of statuses) for (const tag of ['A', 'B']) {
    const id = `T_${tag}_${status}`;
    const waits = ['CHO_PHAN_CONG', 'CHO_HOAN_THIEN', 'CHO_TIEP_NHAN', 'CAN_BO_SUNG'].includes(status);
    assert.equal(has(queue, id), waits, `${role}: ${status} ${waits ? 'phải' : 'không được'} nằm trong Hàng chờ`);
  }
  assert.doesNotMatch(queue, /data-act="queue-tab"/, 'Hàng chờ không còn tab trạng thái');
  assert.match(queue, /data-act="queue-view"[^>]*data-view="rules"/, 'Quy tắc phân công nhanh mở ngay trong Hàng chờ');

  /* Quản lý hồ sơ: mọi trạng thái đều xem được ở tab "Tất cả"; mỗi trạng thái đúng tab của nó. */
  const all = track('all');
  // Tab Tất cả chỉ có hồ sơ đã phân công (kể cả hoàn thành): hồ sơ chờ phân công ở Hàng chờ, hồ sơ hủy ở tab Đã hủy.
  for (const id of Object.keys(ids)) {
    const status = id.replace(/^T_[AB]_/, '');
    const tracked = !waiting.includes(status) && !['HUY','HOAN_THANH_LS'].includes(status);
    assert.equal(has(all, id), tracked, `${role}: ${status} ${tracked ? 'phải' : 'không được'} nằm trong tab Tất cả`);
  }
  assert.ok(has(track('canceled'), 'T_A_HUY') && has(track('canceled'), 'T_B_HUY'), 'Hồ sơ đã hủy xem ở tab Đã hủy');
  const tabsHtml = track('all');
  assert.ok(tabsHtml.lastIndexOf('data-tab="canceled"') > tabsHtml.lastIndexOf('data-tab="done"'), 'Tab Đã hủy nằm cuối hàng');
  assert.match(tabsHtml, /class="btn btn-quiet btn-sm queue-tab-end"[^>]*data-tab="canceled"/, 'Tab Đã hủy là tab phụ, nét nhạt');
  for (const status of statuses) {
    if (!expectedTab[status]) continue;
    const html = track(expectedTab[status]);
    assert.ok(has(html, `T_A_${status}`) && has(html, `T_B_${status}`), `${role}: ${status} phải nằm ở tab ${expectedTab[status]}`);
  }
  assert.ok(!has(track('done'), 'T_A_DANG_THUC_HIEN'), 'Tab Hoàn thành không lẫn hồ sơ đang xử lý');
  assert.ok(!has(track('assigned'), 'T_A_HOAN_THANH_LS'));
  const late = track('late');
  assert.ok(has(late, 'T_A_LATE'), 'Hồ sơ quá hạn nằm ở tab Quá hạn');
  assert.ok(!has(late, 'T_A_HOAN_THANH_LS') && !has(late, 'T_A_HUY'), 'Hồ sơ đã xong hoặc đã hủy không bị tính quá hạn');

  /* Chia theo phòng: chip từng phòng có số đếm; chọn phòng thì chỉ còn hồ sơ phòng đó, số trên tab đếm riêng phòng. */
  const chips = track('all');
  assert.match(chips, new RegExp(`data-act="unit-chip" data-screen="tracking" data-unit="${unitA}"`));
  assert.match(chips, new RegExp(`data-act="unit-chip" data-screen="tracking" data-unit="${unitB.unit_id}"`));
  assert.match(chips, /Tất cả phòng/);
  const onlyB = track('all', unitB.unit_id);
  assert.ok(has(onlyB, 'T_B_DANG_THUC_HIEN') && !has(onlyB, 'T_A_DANG_THUC_HIEN'), 'Chọn phòng B chỉ thấy hồ sơ đang mở phòng B');
  assert.match(onlyB, new RegExp(unitB.name), 'Tiêu đề nêu tên phòng đang xem');
  const perUnit = statuses.length - waiting.length - 2; // trừ chờ phân công, đã hủy và hoàn thành
  assert.match(onlyB, new RegExp(`Đang mở · ${perUnit}\\b`), 'Số trên tab Đang mở đếm riêng phòng đang chọn');
  const onlyA = track('late', unitA);
  assert.ok(has(onlyA, 'T_A_LATE'));
  assert.match(track('all', unitA), new RegExp(`Đang mở · ${perUnit + 1}\\b`), 'Phòng A có thêm hồ sơ quá hạn');
  assert.match(track('done', unitA), new RegExp(`data-unit="${unitB.unit_id}"[^>]*>[^<]*<span>1</span>`), 'Chip phòng B đếm theo tab đang xem (Hoàn thành)');

  /* Tìm kiếm / lọc cán bộ vẫn dùng được trên màn mới. */
  S.setFilter('tracking', 'staff', 'khong-ton-tai');
  assert.ok(!has(track('all'), 'T_A_DANG_THUC_HIEN'), 'Lọc theo cán bộ có tác dụng');
  S.setFilter('tracking', 'staff', '');
}

/* Phân trang của Quản lý hồ sơ không đụng vào trang của Hàng chờ. */
for (let i = 0; i < 30; i++) st.items.push(Object.assign({}, base, { item_id: 'T_PAGE_' + i, source_stt: 'T_PAGE_' + i, request_id: requestB.request_id, status: 'HOAN_THANH_LS', assigned_user_id: officer.user_id }));
assert.match(track('done', unitB.unit_id), /data-act="queue-page" data-screen="tracking"/, 'Nút phân trang gắn đúng màn');

/* ---------- Quy tắc phân công nhanh nằm trong Hàng chờ ---------- */
st.session = st.users.find((u) => u.role === 'KS_LS').user_id;
S.setFilter('queue', 'view', 'rules');
const rules = S.queue();
assert.match(rules, /Quay lại hàng chờ/);
assert.match(rules, /Cấu hình phân công nhanh/, 'Quy tắc phân công nhanh hiện trong Hàng chờ');
S.setFilter('queue', 'view', '');

/* ---------- Kết quả & kế hoạch: bỏ hai tab trùng với Quản lý hồ sơ ---------- */
const tabsOf = (html) => Array.from(html.matchAll(/data-act="board-tab" data-tab="(\w+)"/g)).map((m) => m[1]);
for (const role of ['KS_LS', 'QUAN_LY_LS']) {
  st.session = st.users.find((u) => u.role === role).user_id;
  assert.deepEqual(tabsOf(S.board()), ['report', 'staff', 'type', 'unit'], role + ' chỉ còn 4 tab ở Kết quả & kế hoạch');
  S.setFilter('board', 'tab', 'late');
  assert.deepEqual(tabsOf(S.board()).slice(0, 1), ['report'], 'Tab cũ đã lưu quay về Kết quả thực hiện');
  assert.match(S.board(), /daily-matrix/);
  S.setFilter('board', 'tab', 'report');
}
st.session = st.users.find((u) => u.role === 'ADMIN').user_id;
assert.deepEqual(tabsOf(S.board()), ['report', 'type', 'staff', 'unit', 'status', 'late'], 'Admin giữ đủ tab');

/* ---------- Báo cáo: ba tab cho KS/QL, màn riêng cho Admin ---------- */
const hubTabs = (html) => Array.from(html.matchAll(/data-act="report-hub" data-tab="(\w+)"/g)).map((m) => m[1]);
st.session = st.users.find((u) => u.role === 'KS_LS').user_id;
S.setFilter('report', 'hub', 'multi');
assert.deepEqual(hubTabs(S.reportEntry()), ['multi', 'time', 'plan']);
assert.match(S.reportEntry(), /Phạm vi báo cáo/, 'Tab Nhiều kỳ là báo cáo nhiều kỳ');
S.setFilter('report', 'hub', 'time');
assert.match(S.reportEntry(), /form data-form="time-report"/, 'Tab Thời gian & SLA có biểu mẫu báo cáo thời gian');
S.setFilter('report', 'hub', 'plan');
assert.match(S.reportEntry(), /Kế hoạch tháng/, 'Tab Kế hoạch tháng liệt kê các kỳ');
S.setFilter('report', 'hub', 'multi');
st.session = st.users.find((u) => u.role === 'ADMIN').user_id;
assert.deepEqual(hubTabs(S.reportEntry()), [], 'Admin không dùng tab gộp');
st.session = st.users.find((u) => u.role === 'CAN_BO_LS').user_id;
assert.deepEqual(hubTabs(S.reportEntry()), []);

console.log('Leader navigation contract passed: 5 menus, waiting-only queue, per-unit tracking, 3-tab report hub.');
