/**
 * Hợp đồng chuyển tháng:
 *  1. Sang tháng mà chưa ai bấm "Tạo tháng kế tiếp": hệ thống tự mở kỳ tháng hiện tại, hồ sơ mới
 *     từ ngày 1 vào đúng tháng mới, việc đang mở của tháng trước tự chuyển sang.
 *  2. Bấm "Tạo tháng kế tiếp" chỉ tạo trước kỳ (SCHEDULED), không chuyển tiếp sớm — chuyển sớm làm
 *     việc đang mở biến khỏi màn hình và bị khóa tới đầu tháng sau.
 *  3. Kho đã trót chuyển sớm: hoàn tác một lần sau khi deploy.
 *  4. Dòng gốc đã chuyển tháng (vẫn giữ trạng thái mở) không bị đếm là việc đang mở / quá hạn,
 *     không nhận nhắc quá hạn, không chặn khóa/xóa cán bộ.
 *  5. Bản chuyển tiếp giữ người gửi gốc và mốc dừng SLA.
 * Chạy: node verify-month-rollover-contract.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

function fixture(today, plans) {
  let seq = 0;
  const ctx = { console, Utilities: {
    getUuid: () => String(++seq).padStart(32, '0'),
    formatDate(date, zone, pattern) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return pattern === 'yyyy-MM' ? `${v.year}-${v.month}` : `${v.year}-${v.month}-${v.day}`;
    }
  }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('TimeTracking.gs'), ctx);
  vm.runInContext(read('Code.gs'), ctx);
  const realMonth = ctx.monthKey_, realDay = ctx.localBusinessDate_;
  ctx.monthKey_ = (d) => (d ? realMonth(d) : today.slice(0, 7));
  ctx.localBusinessDate_ = (d) => (d ? realDay(d) : today);
  ctx.id_ = (prefix) => prefix + '_' + (++seq);
  ctx.stamp_ = () => today + 'T03:00:00.000Z';
  ctx.markPlanDirty_ = () => {};
  ctx.provisionMonthlyPlanWorkbook_ = () => {};
  ctx.writePeriodSummary_ = () => {};
  ctx.writeOperationalScoreSnapshot_ = () => {};
  ctx.Notifications = { queue: () => 0 };
  const db = {
    Settings: [], Users: [{ user_id: 'LS1', role: 'CAN_BO_LS', full_name: 'LS 1', is_active: true, unit_id: 'U1' },
      { user_id: 'LS2', role: 'CAN_BO_LS', full_name: 'LS 2', is_active: true, unit_id: 'U1' },
      { user_id: 'KS1', role: 'KS_LS', full_name: 'KS', is_active: true }],
    WorkTypes: [{ type_code: 'A', display_name: 'A', sla_hours: 8, is_active: true, requires_appointment: false, checklist_json: '[]' }],
    MonthlyPlans: clone(plans),
    Units: [{ unit_id: 'U1', name: 'Phòng 1', kind: 'PGD', is_active: true }],
    Requests: [{ request_id: 'R1', period_id: 'SEP', unit_id: 'U1', customer_name: 'KH', created_by: 'PG1', requestor_id: 'PG1' }],
    WorkItems: [], Events: [], Inbox: [], CatalogOptions: []
  };
  const t = {
    rows: (name) => clone(db[name] || []),
    find(name, key, value) {
      const row = (db[name] || []).find((r) => String(r[key]) === String(value));
      return row ? { name, row, object: clone(row) } : null;
    },
    write: (found, fields) => Object.assign(found.row, clone(fields)),
    append: (name, row) => (db[name] ||= []).push(clone(row)),
    tailWhere: () => ({ rows: [] })
  };
  ctx.DataRepository = { tx: (fn) => fn(t), getAll: (name) => t.rows(name), find: (name, key, value) => t.find(name, key, value)?.object || null };
  let actor = db.Users[0];
  ctx.requireActor_ = () => actor;
  const item = (extra) => {
    const row = Object.assign({ item_id: 'I' + (db.WorkItems.length + 1), period_id: 'SEP', request_id: 'R1', work_type_code: 'A', status: 'DANG_THUC_HIEN',
      assigned_user_id: 'LS1', version: 1, occurrence_date: '2026-09-20', submitted_at: '2026-09-20T02:00:00.000Z', checklist_json: '[]',
      dossier_received_at: '2026-09-20T03:00:00.000Z', processing_started_at: '2026-09-20T03:00:00.000Z', due_at: '2026-09-21T03:00:00.000Z' }, extra || {});
    db.WorkItems.push(row);
    return row;
  };
  return { ctx, db, item, as: (u) => { actor = u; } };
}

const SEP_ONLY = [{ period_id: 'SEP', month_key: '2026-09', name: 'T9', status: 'ACTIVE', start_date: '2026-09-01', end_date: '2026-09-30', activation_at: '2026-09-01', spreadsheet_id: 's' }];

check('1. Sang tháng chưa ai tạo kỳ: tự mở kỳ tháng mới và chuyển việc đang mở', () => {
  const { ctx, db, item } = fixture('2026-10-01', SEP_ONLY);
  const open = item({ status: 'TAM_DUNG', sla_paused_at: '2026-09-30T08:00:00.000Z' });
  const done = item({ status: 'HOAN_THANH_LS', completed_at: '2026-09-25T03:00:00.000Z' });
  const plan = ctx.activePlan_();
  assert.equal(plan.month_key, '2026-10', 'Kỳ đang hoạt động phải là tháng 10');
  assert.equal(db.MonthlyPlans.find((p) => p.period_id === 'SEP').status, 'ARCHIVED');
  assert.equal(db.MonthlyPlans.filter((p) => p.month_key === '2026-10').length, 1, 'Chỉ tạo một kỳ cho tháng mới');
  const copy = db.WorkItems.find((i) => i.carryover_from_item_id === open.item_id);
  assert.ok(copy, 'Việc đang mở phải được chuyển sang tháng mới');
  assert.equal(copy.period_id, plan.period_id);
  assert.equal(copy.sla_paused_at, '2026-09-30T08:00:00.000Z', 'Giữ mốc dừng SLA của việc đang tạm dừng');
  assert.equal(db.WorkItems.find((i) => i.item_id === open.item_id).carried_to_item_id, copy.item_id);
  assert.ok(!db.WorkItems.some((i) => i.carryover_from_item_id === done.item_id), 'Việc đã xong ở lại tháng cũ');
  const req = db.Requests.find((r) => r.request_id === copy.request_id);
  assert.equal(req.created_by, 'PG1', 'Bản chuyển tiếp giữ người gửi gốc');
  // Gọi lại: không tạo kỳ hay bản sao thứ hai.
  ctx.activePlan_();
  assert.equal(db.MonthlyPlans.length, 2);
  assert.equal(db.WorkItems.filter((i) => i.carryover_from_item_id === open.item_id).length, 1);
});

check('1b. Hồ sơ tạo ngày 1 gắn vào kỳ tháng mới', () => {
  const { ctx } = fixture('2026-10-01', SEP_ONLY);
  assert.equal(ctx.activePlan_().month_key, '2026-10');
  const { ctx: same } = fixture('2026-09-30', SEP_ONLY);
  assert.equal(same.activePlan_().month_key, '2026-09', 'Ngày cuối tháng vẫn ở tháng hiện tại');
});

check('2. Tạo tháng kế tiếp không chuyển tiếp sớm', () => {
  const { ctx, db, item, as } = fixture('2026-09-25', SEP_ONLY);
  const open = item();
  as(db.Users[2]);
  const next = ctx.createNextMonthlyPlan();
  assert.equal(next.status, 'SCHEDULED');
  assert.equal(db.WorkItems.length, 1, 'Không sinh bản sao trước ngày kích hoạt');
  assert.equal(db.WorkItems[0].carried_to_item_id || '', '', 'Việc tháng này vẫn làm được bình thường');
  assert.equal(ctx.activePlan_().month_key, '2026-09');
  assert.ok(open);
});

check('3. Hoàn tác chuyển tiếp sớm của bản cũ', () => {
  const plans = SEP_ONLY.concat([{ period_id: 'OCT', month_key: '2026-10', name: 'T10', status: 'SCHEDULED', start_date: '2026-10-01', end_date: '2026-10-31', activation_at: '2026-10-01' }]);
  const { ctx, db, item } = fixture('2026-09-26', plans);
  const orig = item({ carried_to_item_id: 'COPY1', version: 2 });
  db.Requests.push({ request_id: 'R2', period_id: 'OCT', carryover_from_request_id: 'R1', unit_id: 'U1' });
  db.WorkItems.push({ item_id: 'COPY1', period_id: 'OCT', request_id: 'R2', carryover_from_item_id: orig.item_id, status: 'DANG_THUC_HIEN', version: 1 });
  const touched = item({ item_id: 'I9', carried_to_item_id: 'COPY9' });
  db.WorkItems.push({ item_id: 'COPY9', period_id: 'OCT', request_id: 'R2', carryover_from_item_id: 'I9', status: 'DANG_THUC_HIEN', version: 3 });
  assert.equal(ctx.repairEarlyCarryover_(), 1);
  assert.equal(db.WorkItems.find((i) => i.item_id === orig.item_id).carried_to_item_id, '', 'Dòng gốc dùng lại được');
  const copy = db.WorkItems.find((i) => i.item_id === 'COPY1');
  assert.equal(copy.period_id, '', 'Bản sao sớm tách khỏi kỳ tháng mới');
  assert.equal(copy.carried_to_item_id, orig.item_id, 'Bản sao sớm bị loại khỏi báo cáo như dòng đã thay thế');
  assert.equal(db.Requests.find((r) => r.request_id === 'R2').period_id, '');
  assert.equal(db.WorkItems.find((i) => i.item_id === 'I9').carried_to_item_id, 'COPY9', 'Bản sao đã có người sửa thì giữ nguyên');
  assert.equal(ctx.repairEarlyCarryover_(), 0, 'Chạy lại không làm gì thêm');
  // Kỳ mới kích hoạt: chuyển tiếp lại từ trạng thái mới nhất.
  const { ctx: later } = { ctx };
  later.localBusinessDate_ = () => '2026-10-01'; later.monthKey_ = (d) => (d ? '2026-10' : '2026-10');
  later.activePlan_();
  const fresh = db.WorkItems.filter((i) => i.carryover_from_item_id === orig.item_id && i.period_id === 'OCT');
  assert.equal(fresh.length, 1, 'Chuyển tiếp lại đúng một bản ở kỳ mới');
  assert.ok(touched);
});

check('4. Dòng gốc đã chuyển tháng không bị tính là việc đang mở', () => {
  const { ctx, db, item, as } = fixture('2026-10-05', SEP_ONLY);
  const stale = item({ carried_to_item_id: 'NEW', due_at: '2026-09-21T03:00:00.000Z' });
  assert.equal(ctx.isLateOpen_(stale, Date.parse('2026-10-05T00:00:00Z')), false, 'Không chấm quá hạn trên dòng gốc');
  for (const fn of ['requestCancel', 'confirmDossierReceipt', 'saveChecklist', 'proposeRevision', 'resolveRevision']) {
    as(fn === 'resolveRevision' ? db.Users[2] : db.Users[0]);
    assert.match(fail(() => ctx[fn](stale.item_id, fn === 'saveChecklist' ? [] : 'lý do', stale.version)), /chuyển tháng/, fn + ' phải chặn dòng đã chuyển tháng');
  }
  const notif = read('Notifications.gs');
  assert.match(notif, /OPEN_FOR_SLA\.indexOf\(i\.status\) !== -1 && !i\.carried_to_item_id/, 'Quét quá hạn bỏ qua dòng gốc');
  const code = read('Code.gs');
  assert.match(code, /function handoverOpenWork_[\s\S]{0,900}!item\.carried_to_item_id/, 'Bàn giao khi khóa cán bộ bỏ qua dòng gốc');
  const repo = read('DataRepository.gs');
  assert.match(repo, /carried_to_item_id && !relinking/, 'Kho chỉ cho ghi dòng gốc khi lệnh tự đặt lại liên kết chuyển tiếp');
});

check('5. Màn hình: mở thông báo cũ dẫn tới dòng tháng mới', () => {
  const screens = read('js/screens.js');
  assert.match(screens, /x\.carryover_from_item_id === itemId/);
  assert.match(read('js/gas-api.js'), /origin_item_id: i\.origin_item_id/);
  assert.doesNotMatch(read('Code.gs').slice(read('Code.gs').indexOf('function createNextMonthlyPlan'), read('Code.gs').indexOf('function createMonthlyPlanWorkbook_')),
    /carryOpenWorkToPlan_\(/, 'createNextMonthlyPlan không được gọi chuyển tiếp');
});

console.log('Month rollover contract passed (' + passed + ' nhóm).');
