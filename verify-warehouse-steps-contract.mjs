/**
 * Hợp đồng: việc TSĐB có ô tick phần việc (soạn xong HĐ thế chấp, nhập kho, xuất kho).
 *
 * - Hoàn thành việc TSĐB phải tick đủ; ô tick lưu người và giờ vào result_credit_json.
 * - Bảng ngày có dòng Nhập kho TSĐB, Xuất kho TSĐB; mỗi phần tính theo ngày tick, không đếm lại lúc hoàn thành.
 * - Tạm dừng (kể cả vì việc khác: họp, đi nhập kho) vẫn dừng SLA.
 * Chạy: node verify-warehouse-steps-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

/* ---------- Client ---------- */
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], querySelector: () => null };
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {},
  FormData: class { constructor(form) { this.fields = form._fields; } get(k) { return k in this.fields ? this.fields[k] : null; } } };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain;
const toasts = [];
let dialog = '';
LS.app = { render() {}, background() {}, refreshServer: () => Promise.resolve() };
LS.ui.openDialog = (title, body) => { dialog = body; };
LS.ui.closeDialog = () => {};
LS.ui.dialogOpen = () => false;
LS.ui.toast = (message, kind) => { toasts.push([message, kind]); };
LS.load(D.seed);
const st = LS.db();
const wt = (code) => st.workTypes.find((w) => w.code === code);
const stepKeys = (code, extra) => Array.from(D.collateralStepKeys(Object.assign({ work_type_code: code, product_name: wt(code).name, collateral_mode: 'NONE' }, extra || {}), wt(code)));

// 1. Ô tick bắt buộc theo loại việc.
assert.deepEqual(stepKeys('LEGACY_26'), ['HD_THE_CHAP', 'NHAP_KHO'], 'Nhập mới/Nhập thêm/ĐKTC: soạn xong HĐ thế chấp, nhập kho');
assert.deepEqual(stepKeys('LEGACY_22'), ['HD_THE_CHAP', 'NHAP_KHO'], 'Nhập tăng TSĐB');
assert.deepEqual(stepKeys('LEGACY_25'), ['HD_THE_CHAP', 'NHAP_KHO'], 'Thay đổi TSĐB');
assert.deepEqual(stepKeys('LEGACY_23'), ['HD_THE_CHAP', 'XUAT_KHO'], 'Xuất giảm TSĐB: soạn phụ lục rồi xuất kho');
assert.deepEqual(stepKeys('LEGACY_24'), ['XUAT_KHO'], 'Xuất TSĐB / xóa thế chấp: chỉ xuất kho');
for (const code of ['LEGACY_27', 'LEGACY_28', 'LEGACY_29', 'LEGACY_05', 'LEGACY_01', 'LEGACY_20']) assert.deepEqual(stepKeys(code), [], code + ' không có ô phần việc TSĐB');
assert.deepEqual(stepKeys('LEGACY_28', { collateral_mode: 'MOI' }), ['HD_THE_CHAP', 'NHAP_KHO'], 'Việc kèm TSĐB mới luôn soạn HĐ thế chấp rồi nhập kho');

// Số lượng kế hoạch phải được hỏi ngay lúc QLKH đăng ký, tách khỏi số thực tế LS tick sau.
const requestQuantityKeys = (item, type) => Array.from(D.requestCollateralQuantityKeys(item, type));
assert.deepEqual(requestQuantityKeys({ work_type_code: 'LEGACY_26', product_name: wt('LEGACY_26').name, collateral_mode: 'NONE' }, wt('LEGACY_26')), ['HD_THE_CHAP'], 'Nhập mới TSĐB yêu cầu số HĐ thế chấp');
assert.deepEqual(requestQuantityKeys({ work_type_code: 'LEGACY_23', product_name: wt('LEGACY_23').name, collateral_mode: 'NONE' }, wt('LEGACY_23')), ['HD_THE_CHAP', 'XUAT_KHO'], 'Xuất giảm TSĐB hỏi số HĐ và số bìa xuất');
assert.deepEqual(requestQuantityKeys({ work_type_code: 'LEGACY_24', product_name: wt('LEGACY_24').name, collateral_mode: 'NONE' }, wt('LEGACY_24')), ['XUAT_KHO'], 'Xuất TSĐB hỏi số bìa xuất');
const creditWithCollateral = { group: 'Món', name: 'Vay mới TSBĐ - Tiêu dùng', code: 'CREDIT_TEST' };
assert.deepEqual(requestQuantityKeys({ work_type_code: 'CREDIT_TEST', product_name: creditWithCollateral.name, collateral_mode: 'CO_SAN' }, creditWithCollateral), [], 'Khoản vay dùng TSĐB có sẵn không hỏi số HĐ thế chấp cần soạn');
assert.deepEqual(requestQuantityKeys({ work_type_code: 'CREDIT_TEST', product_name: creditWithCollateral.name, collateral_mode: 'NONE' }, creditWithCollateral), [], 'Chọn không có TSĐB thì không hỏi số HĐ thế chấp dù tên sản phẩm có TSBĐ');
assert.deepEqual(Array.from(D.draftContractKeys({ work_type_code: 'CREDIT_TEST', product_name: creditWithCollateral.name, collateral_mode: 'NONE' }, creditWithCollateral)), ['HD_TIN_DUNG'], 'Không có TSĐB chỉ soạn HĐ tín dụng');
assert.deepEqual(requestQuantityKeys({ work_type_code: 'CREDIT_TEST', product_name: 'Vay món', collateral_mode: 'MOI' }, creditWithCollateral), ['HD_THE_CHAP'], 'Khoản vay tạo TSĐB mới vẫn hỏi số HĐ thế chấp');
const requestRow = LS.screens.rowForm(91);
assert.match(requestRow, /data-role="request-quantity-fields"/, 'Form đăng ký có vùng nhập số lượng TSBĐ');
assert.match(requestRow, /Số HĐ thế chấp cần soạn/, 'Form ghi số hợp đồng thế chấp dự kiến');
assert.match(requestRow, /Số bìa tài sản cần xuất/, 'Form ghi số bìa tài sản dự kiến xuất');
assert.match(requestRow, /class="request-row-head"[^]*data-act="del-row"[^]*class="request-main-fields"/, 'Nút xóa nằm trên đầu dòng việc, tách khỏi các ô nhập');
const quantityNodes = {
  '[data-role="work-type-product"]': { value: 'LEGACY_23' },
  '[data-role="collateral-mode-field"]': { hidden: true },
  '[data-role="collateral-mode"]': { value: 'NONE' },
  '[data-role="request-quantity-fields"]': { hidden: true },
  '[data-role="request-quantity-mortgage-field"]': { hidden: true },
  '[data-role="request-quantity-export-field"]': { hidden: true },
  '[data-role="request-quantity-mortgage"]': { value: '', required: false },
  '[data-role="request-quantity-export"]': { value: '', required: false }
};
const quantityRow = { querySelector: (selector) => quantityNodes[selector] || null };
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-mortgage-field"]'].hidden, false, 'Xuất giảm hiển thị số HĐ thế chấp');
assert.equal(quantityNodes['[data-role="request-quantity-export-field"]'].hidden, false, 'Xuất giảm hiển thị số bìa xuất');
assert.equal(quantityNodes['[data-role="request-quantity-mortgage"]'].required, true);
assert.equal(quantityNodes['[data-role="request-quantity-export"]'].required, true);
quantityNodes['[data-role="work-type-product"]'].value = 'LEGACY_24';
quantityNodes['[data-role="request-quantity-export"]'].value = '3';
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-mortgage-field"]'].hidden, true, 'Xóa thế chấp không hỏi số HĐ');
assert.equal(quantityNodes['[data-role="request-quantity-export-field"]'].hidden, false, 'Xóa thế chấp vẫn hỏi số bìa xuất');
assert.equal(quantityNodes['[data-role="request-quantity-export"]'].required, true);
quantityNodes['[data-role="work-type-product"]'].value = '';
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-export"]'].value, '', 'Ẩn số lượng cũ khi chọn lại loại việc không liên quan TSBĐ');
st.workTypes.push({ code: 'CREDIT_TEST', group: 'Món', name: creditWithCollateral.name, active: true });
quantityNodes['[data-role="work-type-product"]'].value = 'CREDIT_TEST';
quantityNodes['[data-role="collateral-mode-field"]'].hidden = false;
quantityNodes['[data-role="collateral-mode"]'].value = 'CO_SAN';
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-mortgage-field"]'].hidden, true, 'TSBĐ có sẵn không hỏi số HĐ mới');
assert.equal(quantityNodes['[data-role="request-quantity-mortgage"]'].required, false, 'TSBĐ có sẵn không bắt nhập số HĐ mới');
quantityNodes['[data-role="collateral-mode"]'].value = 'NONE';
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-mortgage-field"]'].hidden, true, 'Không có TSĐB không hiện ô số HĐ thế chấp');
assert.equal(quantityNodes['[data-role="request-quantity-mortgage"]'].required, false, 'Không có TSĐB không bắt nhập số HĐ thế chấp');
quantityNodes['[data-role="collateral-mode"]'].value = 'MOI';
LS.screens.syncRequestQuantities(quantityRow);
assert.equal(quantityNodes['[data-role="request-quantity-mortgage-field"]'].hidden, false, 'TSBĐ mới vẫn hỏi số HĐ');
assert.equal(quantityNodes['[data-role="request-quantity-mortgage"]'].required, true, 'TSBĐ mới vẫn bắt số HĐ');
assert.equal(quantityNodes['[data-role="request-quantity-mortgage"]'].value, '1', 'Số HĐ mới mặc định là 1');
assert.match(requestRow, /class="request-details-line"/, 'Tình trạng TSBĐ và số HĐ cùng một hàng');

// 2. Bảng ngày có dòng Nhập kho, Xuất kho; kế hoạch ngày giao được cho hai dòng này.
assert.equal(Array.from(D.DAILY_ROWS).map((r) => r.key).join(), 'HD_THE_CHAP,HD_TIN_DUNG,NHAP_KHO,XUAT_KHO,RLOS,TON,TON_THE_CHAP,TON_TIN_DUNG,KHAC');
assert.equal(D.DAILY_ROWS.find((r) => r.key === 'NHAP_KHO').unit, 'tài sản');

/* ---------- Việc TSĐB trên màn hình (chế độ cục bộ) ---------- */
const [officer, other] = st.users.filter((u) => u.role === 'CAN_BO_LS' && u.active);
const ks = st.users.find((u) => u.role === 'KS_LS');
const request = st.requests[0];
let seq = 0;
const mk = (code, extra) => {
  const item = Object.assign(JSON.parse(JSON.stringify(st.items[0])), {
    item_id: 'STEP_' + (++seq), request_id: request.request_id, work_type_code: code, product_name: wt(code).name, status: 'DANG_THUC_HIEN',
    assigned_user_id: officer.user_id, checklist: [], completed_at: '', syncing: false, version: 3, pending: null, collateral_mode: 'NONE',
    execution_state: 'ACTIVE', dossier_received_at: '2026-10-01T01:00:00Z', processing_started_at: '2026-10-01T01:00:00Z',
    processing_sessions: [{ user_id: officer.user_id, start: '2026-10-01T01:00:00Z', end: '' }],
    appointment: { at: '2026-10-01T02:00:00Z', date: '2026-10-01', time: '09:00', place: 'PGD', channel: 'SMS' }
  }, extra || {});
  delete item.result_flags; delete item.result_credit;
  st.items.push(item);
  return item;
};
const form = (item, fields, to = 'HOAN_THANH_LS') => {
  const attrs = { 'data-id': item.item_id, 'data-to': to, 'data-from': item.status, 'data-version': String(item.version) };
  return { _fields: fields, getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
};
const detailHtml = (item) => { let out = ''; const prev = LS.ui.openDialog; LS.ui.openDialog = (t, b) => { out = b; }; LS.screens.detail(item.item_id); LS.ui.openDialog = prev; return out; };
const toggle = (html, key) => new RegExp(`<input type="checkbox" data-act="step-toggle" data-id="[^"]*" data-key="${key}"( checked)?( disabled)?>`).exec(html);

function cells(html, label) {
  const staff = [...html.matchAll(/<th class="dm-staff">([^<]*)<\/th>/g)].map((m) => m[1]);
  const row = html.match(new RegExp('<td class="dm-act">(?:<button[\\s\\S]*?</button>)?(?:<i>)?' + label + '(?:</i>)?</td><td class="dm-unit">.*?</td>((?:<td class="num">\\d*</td>)+)'));
  assert.ok(row, 'Bảng ngày phải có dòng ' + label);
  const nums = [...row[1].matchAll(/<td class="num">(\d*)<\/td>/g)].map((m) => Number(m[1] || 0));
  const out = {};
  staff.forEach((s, n) => { out[s] = nums[n]; });
  return out;
}
const labels = Array.from(D.dailyStaffLabels(st.users.filter((u) => u.role === 'CAN_BO_LS')));
const staffIds = st.users.filter((u) => u.role === 'CAN_BO_LS').map((u) => u.user_id);
const lab = (u) => labels[staffIds.indexOf(u.user_id)];
const ROWS = ['Soạn thảo HĐ thế chấp', 'Nhập kho TSĐB', 'Xuất kho TSĐB', 'Còn soạn HĐ thế chấp', 'Khác'];
const snapshot = () => {
  const keep = st.session; st.session = ks.user_id;
  const html = LS.screens.board();
  st.session = keep;
  return Object.fromEntries(ROWS.map((k) => [k, cells(html, k)]));
};
const delta = (a, b, row, u) => b[row][lab(u)] - a[row][lab(u)];

st.session = officer.user_id;
const nhap = mk('LEGACY_26', { requested_mortgage_contract_count: 2 });
assert.equal(D.steps(nhap, wt('LEGACY_26'))[0].quantity, 2, 'LS thấy số HĐ QLKH dự kiến trước khi tick');
LS.screens.flow(nhap.item_id, 'HOAN_THANH_LS');
assert.match(dialog, /name="step_qty_HD_THE_CHAP" required[^>]*value="2"|value="2"[^>]*name="step_qty_HD_THE_CHAP" required/, 'Ô hoàn thành điền sẵn số dự kiến');
const s0 = snapshot();

// Chi tiết hồ sơ: hộp phần việc, ô nhập kho khóa cho tới khi tick soạn xong HĐ thế chấp.
let html = detailHtml(nhap);
assert.match(html, /data-steps-box=/);
assert.match(html, /Phần việc phải tick/);
assert.match(html, /QLKH dự kiến soạn HĐ thế chấp/);
assert.match(html, /2 hợp đồng/);
assert.ok(toggle(html, 'HD_THE_CHAP') && !toggle(html, 'HD_THE_CHAP')[2], 'Ô soạn xong HĐ thế chấp tick được');
assert.ok(toggle(html, 'NHAP_KHO')[2], 'Ô nhập kho khóa khi chưa soạn xong HĐ thế chấp');

toasts.length = 0;
LS.screens.recordStepToggle(nhap.item_id, 'NHAP_KHO', true);
assert.equal(D.steps(nhap, wt('LEGACY_26')).filter((s) => s.done).length, 0, 'Không nhập kho trước khi soạn xong HĐ thế chấp');
assert.match(toasts[toasts.length - 1][0], /trước khi tick nhập/);

// Tick soạn xong HĐ thế chấp: tính vào dòng HĐ thế chấp ngay hôm tick, hết tồn.
LS.screens.recordStepToggle(nhap.item_id, 'HD_THE_CHAP', true, 2);
assert.equal(nhap.result_credit.HD_THE_CHAP.user_id, officer.user_id);
assert.equal(nhap.result_credit.HD_THE_CHAP.quantity, 2, 'Số HĐ thế chấp dự kiến được ghi đúng');
assert.equal(nhap.version, 4);
const s1 = snapshot();
assert.equal(delta(s0, s1, 'Soạn thảo HĐ thế chấp', officer), 2, 'Số HĐ thế chấp tính ngay khi tick, chưa cần hoàn thành');
assert.equal(delta(s0, s1, 'Còn soạn HĐ thế chấp', officer), -1, 'Một hồ sơ đã soạn thì hết một hồ sơ tồn');
assert.equal(delta(s0, s1, 'Nhập kho TSĐB', officer), 0);
assert.ok(toggle(detailHtml(nhap), 'NHAP_KHO') && !toggle(detailHtml(nhap), 'NHAP_KHO')[2], 'Hết khóa ô nhập kho');

// Chưa nhập kho thì chưa hoàn thành được.
toasts.length = 0;
LS.screens.submitFlow(form(nhap, { notification_mode: 'NONE' }));
assert.equal(nhap.status, 'DANG_THUC_HIEN');
assert.match(toasts[toasts.length - 1][0], /nhập kho/i);

LS.screens.recordStepToggle(nhap.item_id, 'NHAP_KHO', true);
const s2 = snapshot();
assert.equal(delta(s1, s2, 'Nhập kho TSĐB', officer), 1, 'Nhập kho tính theo ngày tick');
assert.equal(delta(s1, s2, 'Soạn thảo HĐ thế chấp', officer), 0);

// Không bỏ tick soạn xong HĐ thế chấp khi đã nhập kho.
toasts.length = 0;
LS.screens.recordStepToggle(nhap.item_id, 'HD_THE_CHAP', false);
assert.ok(nhap.result_credit.HD_THE_CHAP, 'Đã nhập kho thì không bỏ tick soạn xong HĐ thế chấp');
assert.match(toasts[toasts.length - 1][0], /Bỏ tick nhập/);

// Hoàn thành: không đếm lại.
LS.screens.submitFlow(form(nhap, { notification_mode: 'NONE' }));
assert.equal(nhap.status, 'HOAN_THANH_LS');
const s3 = snapshot();
assert.equal(delta(s0, s3, 'Soạn thảo HĐ thế chấp', officer), 2, 'Hoàn thành không tính lại số lượng HĐ thế chấp');
assert.equal(delta(s0, s3, 'Nhập kho TSĐB', officer), 1);
assert.equal(delta(s0, s3, 'Khác', officer), 0, 'Việc TSĐB đã tick đủ không rơi vào Khác');
assert.deepEqual(Array.from(D.dailyActivityKeys(nhap, wt('LEGACY_26'))), []);
assert.ok(toggle(detailHtml(nhap), 'NHAP_KHO')[2], 'Hồ sơ đã hoàn thành: các ô khóa, chỉ xem');
assert.ok(st.events.some((e) => e.item_id === nhap.item_id && e.type === 'GHI_NHAN_PHAN_VIEC'), 'Tick ghi vào nhật ký');
const finalCount = mk('LEGACY_26', { requested_mortgage_contract_count: 2 });
LS.screens.recordStepToggle(finalCount.item_id, 'HD_THE_CHAP', true, 2);
LS.screens.recordStepToggle(finalCount.item_id, 'NHAP_KHO', true);
LS.screens.flow(finalCount.item_id, 'HOAN_THANH_LS');
assert.match(dialog, /value="2"[^>]*name="step_qty_HD_THE_CHAP" required/, 'Ô hoàn thành hiện số đã ghi nhận');
LS.screens.submitFlow(form(finalCount, { notification_mode: 'NONE', step_qty_HD_THE_CHAP: '3' }));
assert.equal(finalCount.status, 'HOAN_THANH_LS');
assert.equal(finalCount.result_credit.HD_THE_CHAP.quantity, 3, 'LS sửa số thực tế ngay khi hoàn thành');

// Hoàn thành và tick ngay trong hộp thoại: việc xuất kho.
const xuat = mk('LEGACY_24');
LS.screens.flow(xuat.item_id, 'HOAN_THANH_LS');
assert.match(dialog, /name="step_XUAT_KHO"/, 'Hộp thoại hoàn thành có ô xuất kho');
assert.doesNotMatch(dialog, /name="step_HD_THE_CHAP"/, 'Xuất TSĐB không soạn HĐ thế chấp');
const x0 = snapshot();
toasts.length = 0;
LS.screens.submitFlow(form(xuat, { notification_mode: 'NONE' }));
assert.equal(xuat.status, 'DANG_THUC_HIEN', 'Chưa tick xuất kho thì chưa hoàn thành');
LS.screens.submitFlow(form(xuat, { step_XUAT_KHO: 'on', step_qty_XUAT_KHO: '3', notification_mode: 'NONE' }));
assert.equal(xuat.status, 'HOAN_THANH_LS');
assert.equal(xuat.result_credit.XUAT_KHO.quantity, 3, 'Số bìa tài sản xuất được ghi theo số LS nhập');
const x1 = snapshot();
assert.equal(delta(x0, x1, 'Xuất kho TSĐB', officer), 3, 'Số bìa xuất có dòng riêng, không còn rơi vào Khác');
assert.equal(delta(x0, x1, 'Khác', officer), 0);

// Việc không có ô phần việc (mượn TSĐB) hoàn thành như cũ; hồ sơ TSĐB hoàn thành từ trước không đổi cách đếm.
const borrow = mk('LEGACY_27');
LS.screens.submitFlow(form(borrow, { notification_mode: 'NONE' }));
assert.equal(borrow.status, 'HOAN_THANH_LS');
const legacy = mk('LEGACY_26', { status: 'HOAN_THANH_LS', completed_at: new Date().toISOString() });
assert.deepEqual(Array.from(D.steps(legacy, wt('LEGACY_26'))), [], 'Hồ sơ hoàn thành trước khi có ô phần việc không bị đòi tick');
assert.deepEqual(Array.from(D.dailyActivityKeys(legacy, wt('LEGACY_26'))), ['HD_THE_CHAP'], 'Giữ cách đếm cũ cho hồ sơ cũ');

// Ô đã hiện đủ ở chi tiết của người khác: chỉ người giữ hồ sơ hoặc KS/QL tick được.
const mine = mk('LEGACY_26');
st.session = other.user_id;
LS.screens.recordStepToggle(mine.item_id, 'HD_THE_CHAP', true, 1);
assert.equal(mine.result_credit, undefined, 'Cán bộ không giữ hồ sơ không tick được');
st.session = ks.user_id;
assert.ok(!toggle(detailHtml(mine), 'HD_THE_CHAP')[2], 'Kiểm soát LS tick được');
LS.screens.recordStepToggle(mine.item_id, 'HD_THE_CHAP', true, 1);
assert.equal(mine.result_credit.HD_THE_CHAP.user_id, officer.user_id, 'KS tick hộ thì tính cho cán bộ đang giữ hồ sơ');
assert.equal(mine.result_credit.HD_THE_CHAP.by, ks.user_id);

// Đổi người: phần chưa tick có thể ghi cho người cũ, gồm cả nhập kho.
const handover = mk('LEGACY_26', { status: 'TAM_DUNG' });
assert.deepEqual(Array.from(D.handoverPartsFor(handover, wt('LEGACY_26'))).map((p) => p.key), ['HD_THE_CHAP', 'NHAP_KHO']);
assert.deepEqual(Array.from(D.handoverPartsFor(mk('LEGACY_24'), wt('LEGACY_24'))).map((p) => p.key), ['XUAT_KHO']);

// GAS trả lời chậm: kết quả tick trước không được xóa tick sau đang chờ lưu.
{
  const callbacks = [], originalBackground = LS.app.background, originalApi = LS.api.recordWorkStep;
  LS.setBackend('GAS'); st.session = officer.user_id;
  LS.api.recordWorkStep = () => Promise.resolve();
  LS.app.background = (promise, options) => { callbacks.push(options); return promise; };
  const rapid = mk('LEGACY_26');
  LS.screens.recordStepToggle(rapid.item_id, 'HD_THE_CHAP', true, 1);
  const firstCredit = JSON.stringify(rapid.result_credit);
  LS.screens.recordStepToggle(rapid.item_id, 'NHAP_KHO', true);
  callbacks[0].onOk({ version: 4, result_credit_json: firstCredit });
  assert.ok(rapid.result_credit.NHAP_KHO, 'Phản hồi tick trước không xóa tick nhập kho đang chờ');
  assert.equal(rapid.version, 5);
  callbacks[1].onOk({ version: 5, result_credit_json: JSON.stringify(rapid.result_credit) });
  const count = callbacks.length;
  LS.screens.recordStepToggle(rapid.item_id, 'NHAP_KHO', true);
  assert.equal(rapid.version, 5, 'Tick lại ô đã tick không tăng phiên bản cục bộ');
  assert.equal(callbacks.length, count, 'Tick không đổi giá trị thì không gửi lại');
  rapid.assigned_user_id = other.user_id; st.session = other.user_id;
  LS.screens.recordStepToggle(rapid.item_id, 'NHAP_KHO', false);
  assert.ok(rapid.result_credit.NHAP_KHO, 'Người mới không gỡ phần người cũ đã làm qua hàm giao diện');
  LS.setBackend('LOCAL'); LS.app.background = originalBackground; LS.api.recordWorkStep = originalApi;
}

/* ---------- Máy chủ ---------- */
const sctx = { console, Utilities: { getUuid: () => Math.random().toString(16).slice(2).padEnd(16, 'a') }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' } };
vm.createContext(sctx);
vm.runInContext(read('TimeTracking.gs'), sctx);
vm.runInContext(read('Code.gs'), sctx);
vm.runInContext(read('SetupSheetDB.gs'), sctx);

assert.deepEqual(Array.from(vm.runInContext('HANDOVER_PART_KEYS_', sctx)), Array.from(D.HANDOVER_PARTS).map((p) => p.key), 'Client và máy chủ chung danh sách phần việc');
assert.deepEqual(Array.from(vm.runInContext('DAILY_PLAN_KEYS_', sctx)), Array.from(D.DAILY_ROWS).filter((r) => !r.header).map((r) => r.key), 'Kế hoạch ngày giao được cho mọi dòng của bảng ngày');
assert.ok(vm.runInContext('API_WRITE_', sctx).includes('recordWorkStep'), 'Tick phần việc là lệnh ghi có op_id');
assert.equal(typeof vm.runInContext('apiFunctions_()', sctx).recordWorkStep, 'function');
assert.match(read('js/gas-api.js'), /write\('recordWorkStep'/);
assert.match(read('js/app.js'), /step-toggle/);

// Client và máy chủ phân loại giống nhau trên mọi loại việc, kể cả việc kèm TSĐB mới.
for (const w of st.workTypes) {
  for (const mode of ['NONE', 'MOI']) {
    const client = Array.from(D.collateralStepKeys({ work_type_code: w.code, product_name: w.name, collateral_mode: mode }, w));
    const server = Array.from(sctx.collateralStepKeys_({ group_name: w.group, display_name: w.name }, { product_name: w.name, collateral_mode: mode }));
    assert.deepEqual(server, client, `${w.code} (${mode}): client và máy chủ phải phân loại giống nhau`);
  }
}

const db = {
  Settings: [{ key: 'work_days', value: '1,2,3,4,5,6,0' }, { key: 'work_open', value: '00:00' }, { key: 'work_close', value: '23:59' }, { key: 'work_break', value: '12:00-12:00' }],
  WorkTypes: [
    { type_code: 'IN', group_name: 'TSĐB', display_name: 'Nhập mới/ Nhập thêm TSĐB/ ĐKTC', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' },
    { type_code: 'OUT', group_name: 'TSĐB', display_name: 'Xuất TSĐB/ Xóa thế chấp', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' },
    { type_code: 'LOAN', group_name: 'Món', display_name: 'Món - Vay mới', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' }],
  Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 1' }, { user_id: 'LS2', role: 'CAN_BO_LS', is_active: true, full_name: 'LS 2' },
    { user_id: 'KS', role: 'KS_LS', is_active: true, full_name: 'KS' }, { user_id: 'PH', role: 'PHONG_PGD', is_active: true, full_name: 'Phòng', unit_id: 'U1' }],
  Units: [{ unit_id: 'U1', kind: 'DON_VI_GUI', is_active: true, name: 'Phòng 1' }],
  Requests: [{ request_id: 'R1', unit_id: 'U1', period_id: 'P1' }], WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
};
const t = {
  rows: (n) => db[n] || [],
  find: (n, k, v) => { const o = (db[n] || []).find((r) => String(r[k]) === String(v)); return o ? { object: o, name: n } : null; },
  select: (n, key, predicate) => (db[n] || []).filter((row) => predicate((column) => row[column])).map((object) => ({ object, name: n })),
  write: (f, fields) => Object.assign(f.object, fields),
  append: (n, row) => (db[n] = db[n] || []).push(row),
  tailWhere: () => ({ rows: [] })
};
sctx.DataRepository = { tx: (fn) => fn(t), getAll: (n) => db[n] || [], find: (n, k, v) => { const f = t.find(n, k, v); return f ? f.object : null; } };
sctx.markPlanDirty_ = () => {};
sctx.Notifications = { queue: () => 0 };
let actor = db.Users[0];
sctx.requireActor_ = () => actor;
const [ls1, ls2, ksU, phU] = db.Users;
const mkItem = (type, extra) => {
  const it = Object.assign({ item_id: 'S' + (db.WorkItems.length + 1), request_id: 'R1', period_id: 'P1', work_type_code: type, product_name: type, status: 'DANG_THUC_HIEN',
    assigned_user_id: 'LS1', version: 4, checklist_json: '[]', collateral_mode: 'NONE', dossier_received_at: '2026-09-30T01:00:00.000Z', processing_started_at: '2026-09-30T01:00:00.000Z' }, extra || {});
  db.WorkItems.push(it);
  return it;
};
const events = (it, type) => db.Events.filter((e) => e.item_id === it.item_id && e.type === type);
const recordStep = (it, key, done, version = it.version, quantity) =>
  sctx.recordWorkStep(it.item_id, key, done,
    quantity === undefined ? (key === 'HD_THE_CHAP' || key === 'XUAT_KHO' ? 1 : null) : quantity, version);

// Tick từng phần.
const a = mkItem('IN');
actor = ls1;
assert.match(fail(() => recordStep(a, 'NHAP_KHO', true)), /Tick "Đã soạn xong HĐ thế chấp" trước/, 'Nhập kho sau khi soạn xong HĐ thế chấp');
assert.match(fail(() => recordStep(a, 'XUAT_KHO', true)), /không áp dụng/, 'Việc nhập không có ô xuất kho');
assert.match(fail(() => recordStep(a, 'KHAC', true)), /không áp dụng/);
assert.equal(a.result_credit_json, undefined, 'Lệnh sai không ghi gì');
assert.match(fail(() => recordStep(a, 'HD_THE_CHAP', true, a.version - 1)), /cập nhật/, 'Phiên bản cũ bị từ chối');
assert.match(fail(() => recordStep(a, 'HD_THE_CHAP', true, a.version, 0)), /Số lượng/, 'Số lượng 0 bị từ chối');
let r = recordStep(a, 'HD_THE_CHAP', true, a.version, 2);
assert.equal(a.version, 5);
assert.equal(r.version, 5);
assert.equal(JSON.parse(a.result_credit_json).HD_THE_CHAP.user_id, 'LS1');
assert.equal(JSON.parse(a.result_credit_json).HD_THE_CHAP.quantity, 2);
assert.equal(r.result_credit_json, a.result_credit_json, 'Trả lại cho giao diện');
assert.equal(events(a, 'GHI_NHAN_PHAN_VIEC').length, 1);
assert.match(events(a, 'GHI_NHAN_PHAN_VIEC')[0].reason, /Đã tick: Đã soạn xong HĐ thế chấp/);
r = recordStep(a, 'HD_THE_CHAP', true, a.version, 2);
assert.equal(r.idempotent, true, 'Tick lại ô đã tick không đổi gì');
assert.equal(a.version, 5);

// Quyền: người khác không tick hộ; KS tick hộ tính cho người giữ hồ sơ; Phòng/PGD không có quyền.
actor = ls2;
assert.match(fail(() => recordStep(a, 'NHAP_KHO', true)), /người được giao/);
actor = phU;
assert.match(fail(() => recordStep(a, 'NHAP_KHO', true)), /Vai trò/);
actor = ksU;
recordStep(a, 'NHAP_KHO', true);
assert.equal(JSON.parse(a.result_credit_json).NHAP_KHO.user_id, 'LS1', 'KS tick hộ: tính cho cán bộ đang giữ hồ sơ');
assert.equal(JSON.parse(a.result_credit_json).NHAP_KHO.by, 'KS');

// Bỏ tick: đúng thứ tự ngược; cán bộ không gỡ phần người khác làm.
actor = ls1;
assert.match(fail(() => recordStep(a, 'HD_THE_CHAP', false)), /Bỏ tick nhập\/xuất kho/);
// Phần KS tick hộ đã tính cho cán bộ giữ hồ sơ nên chính cán bộ đó gỡ được.
recordStep(a, 'NHAP_KHO', false);
assert.equal(JSON.parse(a.result_credit_json).NHAP_KHO, undefined);
assert.ok(events(a, 'GHI_NHAN_PHAN_VIEC').some((e) => /Bỏ tick: Đã nhập kho/.test(e.reason)));

// Chỉ tick khi hồ sơ đã tiếp nhận và còn mở.
actor = ls1;
const early = mkItem('IN', { status: 'DA_PHAN_CONG', dossier_received_at: '' });
assert.match(fail(() => recordStep(early, 'HD_THE_CHAP', true)), /đã tiếp nhận/);
const closed = mkItem('IN', { status: 'HOAN_THANH_LS', completed_at: '2026-10-01T01:00:00.000Z' });
assert.match(fail(() => recordStep(closed, 'HD_THE_CHAP', false)), /đã hoàn thành; chỉ được điều chỉnh số lượng kết quả/);
recordStep(closed, 'HD_THE_CHAP', true, closed.version, 4);
assert.equal(JSON.parse(closed.result_credit_json).HD_THE_CHAP.quantity, 4, 'Kết quả hoàn thành cũ đang tính một HĐ được sửa thành bốn');
assert.equal(JSON.parse(closed.result_credit_json).HD_THE_CHAP.at, closed.completed_at);
const loan = mkItem('LOAN');
assert.match(fail(() => recordStep(loan, 'HD_THE_CHAP', true)), /không áp dụng/, 'Hồ sơ vay tick HĐ thế chấp lúc hoàn thành, không dùng ô phần việc');

// Hoàn thành: thiếu ô nào báo ô đó, trạng thái giữ nguyên.
const b = mkItem('IN');
actor = ls1;
let msg = fail(() => sctx.transitionItem(b.item_id, 'HOAN_THANH_LS', { expected_version: b.version }));
assert.match(msg, /Chưa tick: Đã soạn xong HĐ thế chấp, Đã nhập kho TSĐB/);
assert.equal(b.status, 'DANG_THUC_HIEN');
assert.equal(b.result_credit_json, undefined);
assert.match(fail(() => sctx.transitionItem(b.item_id, 'HOAN_THANH_LS', { expected_version: b.version, steps: ['NHAP_KHO'] })), /Chưa tick: Đã soạn xong HĐ thế chấp/);
assert.match(fail(() => sctx.transitionItem(b.item_id, 'HOAN_THANH_LS', { expected_version: b.version, steps: ['XUAT_KHO'] })), /không áp dụng/);
assert.match(fail(() => sctx.transitionItem(b.item_id, 'HOAN_THANH_LS', { expected_version: b.version, steps: ['ABC'] })), /không hợp lệ/);
assert.match(fail(() => sctx.transitionItem(b.item_id, 'TAM_DUNG', { expected_version: b.version, reason: 'x', steps: ['NHAP_KHO'] })), /khi hoàn thành/);
assert.match(fail(() => sctx.transitionItem(loan.item_id, 'HOAN_THANH_LS', { expected_version: loan.version, steps: ['HD_THE_CHAP'] })), /không có phần việc/);
// Tick một phần trước, phần còn lại tick ngay lúc hoàn thành.
recordStep(b, 'HD_THE_CHAP', true, b.version, 2);
const draftAt = JSON.parse(b.result_credit_json).HD_THE_CHAP.at;
r = sctx.transitionItem(b.item_id, 'HOAN_THANH_LS', { expected_version: b.version, steps: ['NHAP_KHO'] });
assert.equal(b.status, 'HOAN_THANH_LS');
const credit = JSON.parse(b.result_credit_json);
assert.deepEqual(Object.keys(credit).sort(), ['HD_THE_CHAP', 'NHAP_KHO']);
assert.equal(credit.HD_THE_CHAP.at, draftAt, 'Ô đã tick từ trước giữ nguyên người và giờ');
assert.equal(credit.NHAP_KHO.user_id, 'LS1');
assert.equal(r.result_credit_json, b.result_credit_json, 'Trả lại cho giao diện');
const corrected = mkItem('IN', { requested_mortgage_contract_count: 2 });
recordStep(corrected, 'HD_THE_CHAP', true, corrected.version, 2);
recordStep(corrected, 'NHAP_KHO', true);
const originalDraft = JSON.parse(corrected.result_credit_json).HD_THE_CHAP;
assert.match(fail(() => sctx.transitionItem(corrected.item_id, 'HOAN_THANH_LS', { expected_version: corrected.version, step_quantities: { HD_THE_CHAP: 0 } })), /Số lượng/, 'Không nhận số thực tế bằng 0');
sctx.transitionItem(corrected.item_id, 'HOAN_THANH_LS', { expected_version: corrected.version, step_quantities: { HD_THE_CHAP: 3 } });
assert.equal(JSON.parse(corrected.result_credit_json).HD_THE_CHAP.quantity, 3, 'Số thực tế sửa khi hoàn thành được lưu');
assert.equal(JSON.parse(corrected.result_credit_json).HD_THE_CHAP.at, originalDraft.at, 'Giữ mốc ghi nhận bước đã làm');
const ownedByPrevious = mkItem('IN', { result_credit_json: JSON.stringify({ HD_THE_CHAP: { user_id: 'LS2', at: '2026-09-30T01:00:00.000Z', quantity: 2 }, NHAP_KHO: { user_id: 'LS1', at: '2026-09-30T02:00:00.000Z' } }) });
assert.match(fail(() => sctx.transitionItem(ownedByPrevious.item_id, 'HOAN_THANH_LS', { expected_version: ownedByPrevious.version, step_quantities: { HD_THE_CHAP: 3 } })), /cán bộ khác/, 'Không sửa số hợp đồng của người xử lý trước');
assert.equal(ownedByPrevious.status, 'DANG_THUC_HIEN');

// Việc xuất kho; KS duyệt hoàn thành tick hộ thì tính cho cán bộ đang giữ hồ sơ.
const c = mkItem('OUT');
actor = ksU;
// KS không có nút hoàn thành ở DANG_THUC_HIEN; kiểm cổng tick qua hồ sơ chờ KS duyệt (trạng thái cũ).
const legacyReview = mkItem('OUT', { status: 'CHO_KS_DUYET' });
sctx.transitionItem(legacyReview.item_id, 'HOAN_THANH_LS', { expected_version: legacyReview.version, steps: ['XUAT_KHO'] });
assert.equal(JSON.parse(legacyReview.result_credit_json).XUAT_KHO.user_id, 'LS1');
assert.equal(JSON.parse(legacyReview.result_credit_json).XUAT_KHO.by, 'KS');
actor = ls1;
assert.match(fail(() => sctx.transitionItem(c.item_id, 'HOAN_THANH_LS', { expected_version: c.version })), /Chưa tick: Đã xuất kho TSĐB/);

// Đổi người: ghi nhận phần đã làm cho người cũ, gồm nhập kho; không nhập kho trước khi soạn xong HĐ thế chấp.
actor = ksU;
const d = mkItem('IN', { status: 'TAM_DUNG' });
assert.match(fail(() => sctx.transitionItem(d.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'x', handover_parts: ['XUAT_KHO'] })), /không áp dụng/, 'Bàn giao không ghi nhầm xuất kho cho việc nhập kho');
assert.equal(d.result_credit_json, undefined);
assert.match(fail(() => sctx.transitionItem(d.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'x', handover_parts: ['NHAP_KHO'] })), /trước khi tick nhập/);
sctx.transitionItem(d.item_id, 'DA_PHAN_CONG', { assignee_id: 'LS2', reason: 'LS1 có việc', handover_parts: ['HD_THE_CHAP', 'NHAP_KHO'] });
assert.deepEqual(Object.keys(JSON.parse(d.result_credit_json)).sort(), ['HD_THE_CHAP', 'NHAP_KHO']);
assert.equal(JSON.parse(d.result_credit_json).NHAP_KHO.user_id, 'LS1');
// Người nhận việc không gỡ phần cán bộ cũ đã làm; Kiểm soát gỡ được.
d.status = 'DANG_THUC_HIEN';
actor = ls2;
assert.match(fail(() => recordStep(d, 'NHAP_KHO', false)), /Kiểm soát hoặc Quản lý/);
actor = ksU;
recordStep(d, 'NHAP_KHO', false);
assert.equal(JSON.parse(d.result_credit_json).NHAP_KHO, undefined);

// Tạm dừng vì việc khác (họp, đi nhập kho...) vẫn dừng SLA như mọi lần tạm dừng.
const e = mkItem('IN', { due_at: '2026-10-05T10:00:00.000Z', sla_pause_log_json: '[]', processing_sessions_json: '[]', pause_log_json: '[]' });
actor = ls1;
sctx.transitionItem(e.item_id, 'TAM_DUNG', { expected_version: e.version, reason: 'Đi nhập kho cho hồ sơ khác' });
assert.equal(e.status, 'TAM_DUNG');
assert.equal(JSON.parse(e.sla_pause_log_json).length, 1, 'Tạm dừng mở một khoảng dừng SLA');
assert.equal(JSON.parse(e.sla_pause_log_json)[0][1], '', 'Khoảng dừng SLA còn mở cho tới khi tiếp tục');
assert.ok(e.sla_paused_at, 'Ghi mốc dừng để lùi hạn khi tiếp tục');

console.log('Warehouse steps contract passed: ticks -> daily matrix by tick day -> completion gate -> pause stops SLA.');
