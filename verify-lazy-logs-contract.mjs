/**
 * Nhật ký sự kiện và nhật ký cấu hình tải theo yêu cầu, không đi theo bootstrap.
 *
 * Bootstrap chạy ở mỗi lần đăng nhập và mỗi lượt tải lại sau thao tác; quét ngược bảng Events để lấy 800
 * dòng ở đó là chi phí mà người không mở Nhật ký vẫn phải trả. Bài này chứng minh bằng hàm thật:
 * máy chủ lọc đúng phạm vi vai trò, dừng quét khi qua đầu khoảng ngày, phân trang không mất/lặp, và màn hình
 * chỉ gọi máy chủ khi được mở.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ---------- Bảng giả cho DataRepository thật ---------- */
function makeSheet(headers, rows) {
  const grid = [headers, ...rows], stats = { rowsRead: 0 };
  return { stats, sheet: {
    getLastRow: () => grid.length, getLastColumn: () => headers.length,
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => { stats.rowsRead += numRows; return grid.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)); },
      setValues: () => {}
    }),
    appendRow: (r) => grid.push(r)
  } };
}
function loadRepo(sheets) {
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'FAKE_ID', setProperty: () => {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] || null }), getActiveSpreadsheet: () => null },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, Utilities: { formatDate: () => '' },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) }, console
  };
  vm.createContext(sandbox);
  vm.runInContext(read('DataRepository.gs'), sandbox);
  return sandbox.DataRepository;
}

const HEADERS = ['event_id', 'item_id', 'type', 'by', 'at', 'reason', 'before_json', 'after_json'];
const day = (d, h = 9) => '2026-10-' + String(d).padStart(2, '0') + 'T' + String(h).padStart(2, '0') + ':00:00+07:00';
const row = (id, item, by, at, reason = 'ghi chú ' + id) => [id, item, 'DANG_THUC_HIEN', by, at, reason, '{"secret":1}', '{"secret":2}'];

/** 30 ngày, mỗi ngày hai sự kiện: LS1 trên A1 (phòng P1), LS2 trên B1 (phòng P2); thêm một sự kiện toàn cục không gắn hồ sơ. */
function eventRows() {
  // Hai nghìn sự kiện cũ của tháng trước nằm ở đầu bảng: quét ngược không dừng đúng chỗ sẽ phải đọc hết.
  const rows = Array.from({ length: 2000 }, (_, i) => row('OLD' + i, 'A1', 'LS0', '2026-09-15T09:00:00+07:00'));
  for (let d = 1; d <= 30; d++) { rows.push(row('A' + d, 'A1', 'LS1', day(d))); rows.push(row('B' + d, 'B1', 'LS2', day(d, 10))); }
  rows.push(row('G1', '', 'LS1', day(30, 11), 'Tạm dừng toàn bộ'));
  return rows;
}

function serverFor(actor, extra = {}) {
  const { sheet, stats } = makeSheet(HEADERS, eventRows());
  const repo = loadRepo({ Events: sheet });
  const server = {};
  vm.runInNewContext(read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//)[1], server);
  vm.runInNewContext(read('Code.gs'), server);
  const tables = {
    Requests: [{ request_id: 'RA', unit_id: 'P1' }, { request_id: 'RB', unit_id: 'P2' }],
    WorkItems: [{ item_id: 'A1', request_id: 'RA' }, { item_id: 'B1', request_id: 'RB' }], ...extra.tables
  };
  server.DataRepository = { tailWhere: repo.tailWhere, getAll: (n) => tables[n] || [],
    tail: (n) => (extra.config || []).slice(-300) };
  server.currentUser_ = () => actor;
  return { server, stats };
}
const ids = (data) => Array.from(data.events, (e) => e.event_id);
const range = { from: day(1, 0), to: day(30, 23) };

test('cán bộ LS chỉ thấy sự kiện do chính mình làm, có nội dung nhưng không có ảnh chụp trước/sau', () => {
  const { server } = serverFor({ user_id: 'LS1', role: 'CAN_BO_LS' });
  const data = server.getAuditLog({ ...range, limit: 5000 });
  assert.equal(data.events.length, 31, '30 ngày + 1 sự kiện toàn cục của chính LS1');
  assert.ok(Array.from(data.events).every(e => e.by === 'LS1'));
  assert.equal(data.events[0].event_id, 'G1', 'mới nhất trước');
  assert.equal(data.events[1].reason, 'ghi chú A30', 'nội dung sự kiện phải có để cột Nội dung không trống');
  assert.ok(Array.from(data.events).every(e => !('before_json' in e) && !('after_json' in e)), 'ảnh chụp dữ liệu khách chỉ màn Lịch sử cần');
});

test('KS/QL thấy sự kiện gắn hồ sơ của mọi người, bỏ sự kiện toàn cục', () => {
  const { server } = serverFor({ user_id: 'KS1', role: 'KS_LS' });
  const data = server.getAuditLog({ ...range, limit: 5000 });
  assert.equal(data.events.length, 60);
  assert.ok(!ids(data).includes('G1'));
});

test('Phòng/PGD chỉ thấy sự kiện của hồ sơ thuộc đơn vị mình', () => {
  const { server } = serverFor({ user_id: 'P1U', role: 'PHONG_PGD', unit_id: 'P1' });
  const data = server.getAuditLog({ ...range, limit: 5000 });
  assert.equal(data.events.length, 30);
  assert.ok(Array.from(data.events).every(e => e.item_id === 'A1'));
});

test('Quản trị nhận mốc thời gian không kèm nội dung, kèm nhật ký cấu hình trong khoảng ở trang đầu', () => {
  const config = [{ id: 'C1', at: day(5), by: 'ADM', area: 'Lịch', detail: 'đổi giờ' }, { id: 'C2', at: '2026-09-01T09:00:00+07:00', by: 'ADM', area: 'Lịch', detail: 'cũ' }];
  const { server } = serverFor({ user_id: 'ADM', role: 'ADMIN' }, { config });
  const first = server.getAuditLog({ ...range, limit: 10 });
  assert.ok(Array.from(first.events).every(e => !('reason' in e) && !('before_json' in e)), 'Quản trị không nhận nội dung có thể chứa thông tin khách');
  assert.deepEqual(Array.from(first.config_log, c => c.id), ['C1'], 'chỉ dòng cấu hình nằm trong khoảng');
  assert.equal(first.more, true);
  const next = server.getAuditLog({ ...range, limit: 10, cursor: first.cursor });
  assert.equal(next.config_log.length, 0, 'trang sau không lặp lại nhật ký cấu hình');
});

test('phân trang theo con trỏ không mất và không lặp dòng', () => {
  const { server } = serverFor({ user_id: 'KS1', role: 'KS_LS' });
  const seen = []; let cursor = ''; let pages = 0;
  for (;;) {
    const data = server.getAuditLog({ ...range, limit: 7, cursor });
    seen.push(...ids(data)); pages++;
    if (!data.more) break;
    cursor = data.cursor;
    assert.ok(pages < 20, 'vòng lặp phân trang không được treo');
  }
  assert.equal(seen.length, 60);
  assert.equal(new Set(seen).size, 60, 'không dòng nào lặp');
});

test('khoảng ngày ngắn dừng quét ở đầu khoảng thay vì đọc ngược tới trần', () => {
  const { server, stats } = serverFor({ user_id: 'KS1', role: 'KS_LS' });
  const data = server.getAuditLog({ from: day(29, 0), to: day(30, 23), limit: 100 });
  assert.equal(data.events.length, 4);
  assert.equal(data.more, false);
  assert.ok(stats.rowsRead <= 501, 'chỉ đọc một khối cuối bảng (500 dòng + tiêu đề), không đọc 2.000 dòng cũ: ' + stats.rowsRead);
});

test('khoảng sai và vai trò không có màn Nhật ký bị chặn', () => {
  const ks = serverFor({ user_id: 'KS1', role: 'KS_LS' }).server;
  assert.throws(() => ks.getAuditLog({ from: 'x', to: day(2) }), /khoảng ngày/);
  assert.throws(() => ks.getAuditLog({ from: day(2), to: day(1) }), /khoảng ngày/);
  assert.throws(() => ks.getAuditLog({ from: '2024-01-01T00:00:00+07:00', to: day(2) }), /366/);
  assert.throws(() => ks.getAuditLog({ ...range, cursor: 'abc' }), /Mốc/);
  assert.throws(() => serverFor({ user_id: 'GS', role: 'GIAM_SAT' }).server.getAuditLog(range), /quyền/);
});

test('nhật ký cấu hình chỉ Quản trị lấy được', () => {
  const config = [{ id: 'C1', at: day(5), by: 'ADM', area: 'Lịch', detail: 'x' }];
  assert.equal(serverFor({ user_id: 'ADM', role: 'ADMIN' }, { config }).server.getConfigLog().rows.length, 1);
  assert.throws(() => serverFor({ user_id: 'KS1', role: 'KS_LS' }).server.getConfigLog(), /Quản trị/);
});

test('bootstrap không còn quét Events hay đọc ConfigLog; hai API mới đã được đăng ký', () => {
  const src = read('Code.gs');
  const start = src.indexOf('function getBootstrap()'), body = src.slice(start, src.indexOf('\n}\n', start));
  assert.doesNotMatch(body, /tailWhere\('Events'/);
  assert.doesNotMatch(body, /tail\('ConfigLog'/);
  assert.match(body, /events: \[\]/);
  assert.match(src, /getAuditLog: getAuditLog, getConfigLog: getConfigLog/);
  assert.match(read('js/gas-api.js'), /getAuditLog: function[\s\S]*getConfigLog: function/);
});

/* ---------- Màn hình ---------- */
function screenFor(role, userId) {
  const ctx = { LS: {}, window: {}, localStorage: { getItem: () => null, setItem() {} } };
  for (const name of ['core', 'domain', 'ui', 'charts', 'screens']) vm.runInNewContext(read('js/' + name + '.js'), ctx);
  const state = ctx.LS.domain.seed();
  state.session = (state.users.find(u => u.role === role) || {}).user_id;
  ctx.LS.replace(state);
  ctx.LS.setBackend('GAS');
  const calls = [], waiting = [], renders = [];
  ctx.LS.api = { getAuditLog(opts) { calls.push(opts); return new Promise((resolve, reject) => waiting.push({ resolve, reject })); } };
  ctx.LS.app = { render() { renders.push(1); }, download() {} };
  return { ctx, state, calls, waiting, renders };
}
const settle = () => new Promise(r => setImmediate(r));
const ev = (id, at) => ({ event_id: id, item_id: 'I1', type: 'DANG_THUC_HIEN', by: 'U', at, reason: 'nội dung ' + id });

test('mở màn Nhật ký không gọi máy chủ; chỉ khi bấm "Xem nhật ký" mới tải, một lần cho mỗi lần bấm', async () => {
  const s = screenFor('KS_LS');
  assert.equal(s.calls.length, 0, 'chưa mở màn thì chưa gọi');
  const opened = s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 0, 'mở màn vẫn chưa gọi');
  assert.match(opened, /data-act="audit-run"/, 'có nút chạy xem nhật ký');
  assert.match(opened, /Chưa xem nhật ký/);
  assert.doesNotMatch(opened, /Đang tải nhật ký/);
  s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 0, 'vẽ lại nhiều lần cũng không gọi');
  s.ctx.LS.screens.auditRun();
  assert.equal(s.calls.length, 1);
  assert.match(s.ctx.LS.screens.audit(), /Đang tải nhật ký/);
  assert.equal(s.calls.length, 1, 'vẽ lại trong lúc đang tải không gọi thêm');
  s.waiting[0].resolve({ events: [ev('E1', new Date().toISOString())], cursor: 5, more: true, config_log: [] });
  await settle();
  const html = s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 1, 'có dữ liệu rồi thì vẽ lại không gọi nữa');
  assert.match(html, /nội dung E1/);
  assert.match(html, /data-act="audit-more"/);
  assert.match(html, /1\+/, 'còn trang sau thì số đếm có dấu +');
});

test('Xem thêm nối trang kế bằng con trỏ; vào lại màn thì phải bấm xem lại', async () => {
  const s = screenFor('KS_LS');
  s.ctx.LS.screens.audit();
  s.ctx.LS.screens.auditRun();
  s.waiting[0].resolve({ events: [ev('E1', new Date().toISOString())], cursor: 77, more: true, config_log: [] });
  await settle();
  s.ctx.LS.screens.audit();
  s.ctx.LS.screens.auditMore();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].cursor, 77);
  s.waiting[1].resolve({ events: [ev('E2', new Date().toISOString())], cursor: 1, more: false, config_log: [] });
  await settle();
  const html = s.ctx.LS.screens.audit();
  assert.ok(html.includes('nội dung E1') && html.includes('nội dung E2'));
  assert.doesNotMatch(html, /data-act="audit-more"/, 'hết trang thì không còn nút');
  s.ctx.LS.screens.enterScreen('audit');
  const again = s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 2, 'vào lại màn không tự tải');
  assert.doesNotMatch(again, /nội dung E1/, 'dữ liệu lần trước đã bỏ');
  s.ctx.LS.screens.auditRun();
  assert.equal(s.calls.length, 3, 'bấm xem là tải lại từ đầu');
  assert.equal(s.calls[2].cursor, '');
});

test('đổi khoảng ngày phải bấm xem lại; lỗi hiện thông báo và không tự gọi lặp', async () => {
  const s = screenFor('KS_LS');
  s.ctx.LS.screens.audit();
  s.ctx.LS.screens.auditRun();
  s.waiting[0].resolve({ events: [], cursor: 1, more: false, config_log: [] });
  await settle();
  s.ctx.LS.screens.setFilter('audit', 'period', 'month');
  const changed = s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 1, 'đổi kỳ không tự gọi máy chủ');
  assert.match(changed, /data-act="audit-run"/);
  s.ctx.LS.screens.auditRun();
  assert.equal(s.calls.length, 2, 'bấm xem thì lấy kỳ mới');
  s.waiting[1].reject(new Error('Máy chủ bận'));
  await settle();
  const html = s.ctx.LS.screens.audit();
  assert.match(html, /Máy chủ bận/);
  s.ctx.LS.screens.audit();
  assert.equal(s.calls.length, 2, 'đang lỗi thì không tự thử lại mỗi lần vẽ');
  s.ctx.LS.screens.auditReload();
  assert.equal(s.calls.length, 3, 'nút Xem lại thử lại');
});

test('kết quả của lần bấm cũ đến muộn không ghi đè lần bấm mới', async () => {
  const s = screenFor('KS_LS');
  s.ctx.LS.screens.audit();
  s.ctx.LS.screens.auditRun();
  s.ctx.LS.screens.enterScreen('audit');
  s.ctx.LS.screens.audit();
  s.ctx.LS.screens.auditRun();
  s.waiting[0].resolve({ events: [ev('OLD', new Date().toISOString())], cursor: 1, more: false, config_log: [] });
  s.waiting[1].resolve({ events: [ev('NEW', new Date().toISOString())], cursor: 1, more: false, config_log: [] });
  await settle();
  const html = s.ctx.LS.screens.audit();
  assert.ok(html.includes('nội dung NEW') && !html.includes('nội dung OLD'));
});

test('Xuất CSV lấy theo khoảng đang xem từ máy chủ, không chỉ các trang đã tải', async () => {
  const s = screenFor('QUAN_LY_LS');
  s.state.settings.export_row_limit = 5000;
  s.ctx.LS.admin = { logCfg() {} };
  s.ctx.LS.ui.toast = () => {};
  let saved = '';
  s.ctx.LS.app.download = (name, text) => { saved = text; };
  s.ctx.LS.screens.exportCsv();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].limit, 5000);
  assert.equal(s.calls[0].cursor, undefined);
  s.waiting[0].resolve({ events: [ev('E1', new Date().toISOString()), ev('E2', new Date().toISOString())] });
  await settle();
  assert.equal(saved.split('\r\n').length, 3, 'tiêu đề + 2 dòng');
});

test('Nhật ký cấu hình của Quản trị chỉ tải khi bấm "Xem nhật ký" và bảng Dữ liệu không còn đếm số dòng không có thật', () => {
  const admin = read('js/admin.js');
  const view = admin.slice(admin.indexOf('function cfglog()'), admin.indexOf('function reloadConfigLog()'));
  assert.doesNotMatch(view, /loadConfigLog\(\)/, 'mở mục không tự tải');
  assert.match(view, /act: 'cfglog-reload'/);
  assert.match(admin, /function reloadConfigLog\(\) \{ loadConfigLog\(\)/);
  assert.match(admin, /LS\.api\.getConfigLog\(\)/);
  assert.match(admin, /U\.isGas\(\) \? \[\] : \[\['Sự kiện'/);
});
