/**
 * Hợp đồng: tự trả việc đã giao nhưng chưa tiếp nhận về Phòng/PGD.
 *
 * Yêu cầu: đầu ngày làm việc, việc ở DA_PHAN_CONG mà cán bộ LS chưa bấm "Tiếp
 * nhận hồ sơ" (chưa có dossier_received_at), chỉ tự chuyển CHUA_GIAO_HO_SO đúng ngày làm việc T+1,
 * bỏ cán bộ đang giao nhưng nhớ vào last_assignee_id, ghi Event + thông báo cho
 * người gửi và cán bộ LS. Việc giao TRONG ngày, đã nhận, hoặc đã chuyển tháng thì
 * không bị trả. Ngày nghỉ (cuối tuần/lễ) không chạy.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

function loadCode(tables, today) {
  let eventWritesPending = false;
  const ctx = {
    console,
    JSON, Math, Date, String, Number, Object, Array, Boolean,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {}, deleteProperty: () => {}, getProperties: () => ({}) }) },
    CacheService: { getScriptCache: () => null },
    SpreadsheetApp: { openById: () => ({}), getActiveSpreadsheet: () => null },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: { getUuid: (() => { let n = 0; return () => 'uuid-' + (++n); })(), formatDate: () => today },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    Logger: { log: () => {} },
    ScriptApp: { newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }), getProjectTriggers: () => [] }
  };
  ctx.DataRepository = {
    tx: (fn) => fn({
      rows: (n) => (tables[n] || []).map((r) => Object.assign({}, r)),
      find: (n, k, v) => { const o = (tables[n] || []).find((x) => x[k] === v); return o ? { object: o } : null; },
      tailWhere: (n, limit, match) => {
        if (eventWritesPending) throw new Error('LS_UNSAFE_EARLY_FLUSH: Event query ran after a transaction append.');
        return { rows: (tables[n] || []).filter(match).slice(-limit).reverse(), scanned: (tables[n] || []).length, exhausted: true };
      },
      write: (f, d) => Object.assign(f.object, d),
      append: (n, r) => { if (n === 'Events') eventWritesPending = true; (tables[n] || (tables[n] = [])).push(r); }
    }),
    getAll: (n) => (tables[n] || []).map((r) => Object.assign({}, r))
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
  ctx.localBusinessDate_ = () => today;         // ép "hôm nay" xác định
  return ctx;
}

function freshTables(today) {
  return {
    Settings: [],                                // dùng lịch mặc định T2–T6
    Requests: [{ request_id: 'R1', unit_id: 'U', requestor_id: 'PG1', created_by: 'PG1' }],
    WorkItems: [
      { item_id: 'W1', period_id: 'P', request_id: 'R1', status: 'DA_PHAN_CONG', assigned_user_id: 'LS1', assigned_at: '2026-10-02T09:00:00+07:00', occurrence_date: '2026-10-02', dossier_received_at: '', version: 1 },
      { item_id: 'W2', period_id: 'P', request_id: 'R1', status: 'DA_PHAN_CONG', assigned_user_id: 'LS2', assigned_at: today + 'T08:00:00+07:00', occurrence_date: today, dossier_received_at: '', version: 1 },
      { item_id: 'W3', period_id: 'P', request_id: 'R1', status: 'DANG_THUC_HIEN', assigned_user_id: 'LS3', assigned_at: '2026-10-02T09:00:00+07:00', occurrence_date: '2026-10-04', dossier_received_at: '2026-10-02T10:00:00+07:00', version: 2 },
      { item_id: 'W4', period_id: 'P', request_id: 'R1', status: 'DA_PHAN_CONG', assigned_user_id: 'LS4', assigned_at: '2026-10-02T09:00:00+07:00', occurrence_date: '2026-10-04', dossier_received_at: '', carried_to_item_id: 'WX', version: 1 },
      { item_id: 'W5', period_id: 'P', request_id: 'R1', status: 'DA_PHAN_CONG', assigned_user_id: 'LS5', assigned_at: '2026-10-02T09:00:00+07:00', occurrence_date: '2026-10-01', dossier_received_at: '', version: 1 },
      { item_id: 'W6', period_id: 'P', request_id: 'R1', status: 'DA_PHAN_CONG', assigned_user_id: 'LS6', assigned_at: '2026-10-04T09:00:00+07:00', occurrence_date: '2026-09-30', dossier_received_at: '', version: 1 }
    ],
    Events: [], Inbox: []
  };
}

test('chỉ tự trả hồ sơ của ngày làm việc trước, không trả hồ sơ T+2/T+3', () => {
  const today = '2026-10-05'; // Thứ Hai
  const tables = freshTables(today);
  const ctx = loadCode(tables, today);
  const r = ctx.autoReturnStaleAssignments_();
  assert.equal(r.returned, 1, 'chỉ W1 phát sinh ngày làm việc trước bị trả');

  const w1 = tables.WorkItems.find((x) => x.item_id === 'W1');
  assert.equal(w1.status, 'CHUA_GIAO_HO_SO');
  assert.equal(w1.assigned_user_id, '', 'bỏ cán bộ đang giao');
  assert.equal(w1.last_assignee_id, 'LS1', 'nhớ cán bộ cũ');

  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W2').status, 'DA_PHAN_CONG', 'giao hôm nay: giữ nguyên');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W3').status, 'DANG_THUC_HIEN', 'đã nhận: giữ nguyên');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W4').status, 'DA_PHAN_CONG', 'đã chuyển tháng: giữ nguyên');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W5').status, 'DA_PHAN_CONG', 'T+2: giữ nguyên');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W6').status, 'DA_PHAN_CONG', 'T+3: giữ nguyên dù mới được phân công hôm qua');

  const ev = tables.Events.find((e) => e.item_id === 'W1' && e.type === 'TU_TRA_QLKH');
  assert.ok(ev, 'có Event tự trả');
  assert.equal(JSON.parse(ev.before_json).assigned_user_id, 'LS1', 'Event lưu cán bộ cũ');
  assert.equal(JSON.parse(ev.after_json).status, 'CHUA_GIAO_HO_SO', 'Tự trả không lẫn với hồ sơ cần bổ sung thật');

  const inboxUsers = tables.Inbox.filter((n) => n.item_id === 'W1').map((n) => n.user_id).sort();
  assert.deepEqual(inboxUsers, ['LS1', 'PG1'], 'báo cho người gửi và cán bộ LS');
});

test('T+1 tính theo lịch làm việc, bỏ qua cuối tuần và ngày lễ', () => {
  const today = '2026-10-06'; // Thứ Ba; Thứ Hai là ngày lễ
  const tables = freshTables(today);
  tables.Settings = [{ key: 'holidays', value: '2026-10-05' }];
  const ctx = loadCode(tables, today);
  const r = ctx.autoReturnStaleAssignments_();
  assert.equal(r.returned, 1, 'ngày làm việc trước là Thứ Sáu 02/10');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W1').status, 'CHUA_GIAO_HO_SO');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W5').status, 'DA_PHAN_CONG', 'ngày T+2 không bị trả');
});

test('ngày nghỉ: không chạy', () => {
  const today = '2026-10-04'; // Chủ Nhật
  const tables = freshTables(today);
  tables.WorkItems.push({ item_id: 'H1', period_id: 'P', request_id: 'R1', status: 'CHUA_GIAO_HO_SO', occurrence_date: today, version: 3 });
  const ctx = loadCode(tables, today);
  const r = ctx.autoReturnStaleAssignments_();
  assert.equal(r.returned, 0);
  assert.equal(r.skipped, 'non_business_day');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'W1').status, 'DA_PHAN_CONG', 'ngày nghỉ không đụng dữ liệu');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'H1').status, 'CHUA_GIAO_HO_SO', 'ngày nghỉ không phục hồi hồ sơ');
});

test('việc PHÁT SINH HÔM NAY đang bị trả về thì tự đưa lại vào Hàng chờ phân công', () => {
  const today = '2026-10-05'; // Thứ Hai
  const tables = {
    Settings: [],
    Requests: [{ request_id: 'R1', unit_id: 'U', requestor_id: 'PG1', created_by: 'PG1' }],
    WorkItems: [
      { item_id: 'H1', period_id: 'P', request_id: 'R1', status: 'CHUA_GIAO_HO_SO', assigned_user_id: '', last_assignee_id: 'LS1', occurrence_date: today, version: 3 },
      { item_id: 'H2', period_id: 'P', request_id: 'R1', status: 'CHUA_GIAO_HO_SO', assigned_user_id: '', last_assignee_id: 'LS2', occurrence_date: '2026-10-02', version: 3 }
    ],
    Events: [], Inbox: []
  };
  const ctx = loadCode(tables, today);
  const r = ctx.autoReturnStaleAssignments_();
  assert.equal(r.recovered, 1, 'chỉ việc phát sinh hôm nay được đưa lại');
  const h1 = tables.WorkItems.find((x) => x.item_id === 'H1');
  assert.equal(h1.status, 'CHO_PHAN_CONG', 'việc hôm nay về lại Chờ phân công');
  assert.equal(h1.last_assignee_id, 'LS1', 'vẫn nhớ cán bộ cũ để lúc phân công lại hiện ra');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'H2').status, 'CHUA_GIAO_HO_SO', 'việc hôm trước vẫn giữ để Phòng/PGD đẩy lại');
  assert.ok(tables.Events.find((e) => e.item_id === 'H1' && e.type === 'TU_VAO_PHAN_CONG'), 'ghi Event tự đưa lại vào phân công');
  assert.equal(h1.version, 4, 'tăng version để chặn thao tác từ màn hình cũ');
  const afterFirstRun = JSON.stringify(tables);
  const repeated = ctx.autoReturnStaleAssignments_();
  assert.equal(repeated.recovered, 0, 'chạy lại không phục hồi lần hai');
  assert.equal(JSON.stringify(tables), afterFirstRun, 'chạy lại không tăng version, ghi Event hay thông báo trùng');
});

test('phục hồi không đụng hồ sơ cần bổ sung, hồ sơ tương lai hoặc dòng đã chuyển tháng', () => {
  const today = '2026-10-05';
  const tables = freshTables(today);
  const excluded = [
    { item_id: 'SUPPLEMENT', status: 'CAN_BO_SUNG', occurrence_date: today },
    { item_id: 'FUTURE', status: 'CHUA_GIAO_HO_SO', occurrence_date: '2026-10-06' },
    { item_id: 'CARRIED', status: 'CHUA_GIAO_HO_SO', occurrence_date: today, carried_to_item_id: 'NEW' }
  ].map((row) => ({ period_id: 'P', request_id: 'R1', assigned_user_id: '', last_assignee_id: 'LS1', version: 3, ...row }));
  tables.WorkItems.push(...excluded);
  const before = JSON.stringify(excluded);
  const ctx = loadCode(tables, today);
  assert.equal(ctx.autoReturnStaleAssignments_().recovered, 0);
  assert.equal(JSON.stringify(excluded), before);
  assert.ok(!tables.Events.some((event) => event.type === 'TU_VAO_PHAN_CONG'));
});

test('chỉ sửa cờ CAN_BO_SUNG khi có Event tự trả hệ thống khớp đúng lần cập nhật', () => {
  const today = '2026-10-05';
  const updatedAt = '2026-10-05T00:00:00.000Z';
  const tables = freshTables(today);
  const addLegacy = (itemId, day) => {
    tables.WorkItems.push({ item_id: itemId, period_id: 'P', request_id: 'R1', status: 'CAN_BO_SUNG',
      occurrence_date: day, assigned_user_id: '', last_assignee_id: '', dossier_received_at: '', updated_at: updatedAt, version: 3 });
    tables.Events.push({ item_id: itemId, type: 'TU_TRA_QLKH', by: 'SYSTEM', at: updatedAt,
      before_json: JSON.stringify({ status: 'DA_PHAN_CONG', assigned_user_id: 'LS_OLD' }),
      after_json: JSON.stringify({ status: 'CAN_BO_SUNG', assigned_user_id: '' }) });
  };
  addLegacy('LEGACY_TODAY', today);
  addLegacy('LEGACY_PREVIOUS', '2026-10-02');
  tables.WorkItems.push({ item_id: 'REAL_SUPPLEMENT', period_id: 'P', request_id: 'R1', status: 'CAN_BO_SUNG',
    occurrence_date: today, assigned_user_id: '', last_assignee_id: '', updated_at: updatedAt, version: 3 });
  const ctx = loadCode(tables, today);
  const result = ctx.autoReturnStaleAssignments_();
  assert.equal(result.recovered, 1, 'việc bị tự trả nhầm hôm nay quay lại hàng chờ');
  assert.equal(result.corrected_flags, 1, 'việc ngày trước có cờ tự trả sai thành Chưa giao hồ sơ');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'LEGACY_TODAY').status, 'CHO_PHAN_CONG');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'LEGACY_TODAY').last_assignee_id, 'LS_OLD');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'LEGACY_PREVIOUS').status, 'CHUA_GIAO_HO_SO');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'LEGACY_PREVIOUS').last_assignee_id, 'LS_OLD');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'REAL_SUPPLEMENT').status, 'CAN_BO_SUNG', 'việc bổ sung thật không đổi');
  assert.equal(tables.WorkItems.find((x) => x.item_id === 'LEGACY_TODAY').version, 4);
});

test('trigger 7h được cài một lần và handler thực thi phục hồi hôm nay', () => {
  const today = '2026-10-05';
  const tables = freshTables(today);
  tables.WorkItems.push({ item_id: 'H1', period_id: 'P', request_id: 'R1', status: 'CHUA_GIAO_HO_SO', occurrence_date: today, last_assignee_id: 'LS1', assigned_user_id: '', version: 3 });
  const ctx = loadCode(tables, today);
  const installed = [];
  ctx.ScriptApp = {
    getProjectTriggers: () => installed,
    deleteTrigger: (trigger) => installed.splice(installed.indexOf(trigger), 1),
    newTrigger(handler) {
      const schedule = { getHandlerFunction: () => handler };
      const builder = {
        timeBased() { return this; },
        everyMinutes(value) { schedule.minutes = value; return this; },
        everyHours(value) { schedule.hours = value; return this; },
        everyDays(value) { schedule.days = value; return this; },
        atHour(value) { schedule.hour = value; return this; },
        create() { installed.push(schedule); }
      };
      return builder;
    }
  };
  vm.runInContext(fs.readFileSync('Notifications.gs', 'utf8'), ctx);
  ctx.Notifications.ensureWorkerTriggers();
  ctx.Notifications.ensureWorkerTriggers();
  const daily = installed.filter((trigger) => trigger.getHandlerFunction() === 'autoReturnTick_');
  assert.equal(daily.length, 1);
  assert.equal(daily[0].days, 1);
  assert.equal(daily[0].hour, 7);
  assert.equal(ctx.autoReturnTick_().recovered, 1);
  assert.equal(tables.WorkItems.find((row) => row.item_id === 'H1').status, 'CHO_PHAN_CONG');
});
