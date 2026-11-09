import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };
const server = read('Code.gs');
const screens = read('js/screens.js');
const app = read('js/app.js');
const api = read('js/gas-api.js');

[
  [server, "'handoverStaffWork'", 'handoverStaffWork phải nằm trong danh sách lệnh ghi.'],
  [server, 'handoverStaffWork: handoverStaffWork', 'handoverStaffWork phải được đăng ký trong cổng api.'],
  [server, 'closeStaleSessions_()', 'Phải có tác vụ khép phiên làm bỏ quên.'],
  [server, "reason = 'QLKH tạm dừng hồ sơ.'", 'Phòng/PGD tạm dừng hồ sơ đã giao phải dùng câu cố định.'],
  [server, "reason = 'QLKH tiếp tục hồ sơ.'", 'Phòng/PGD tiếp tục hồ sơ đã giao phải dùng câu cố định.'],
  [server, 'Phòng/PGD không ghi chú thêm', 'Hủy hồ sơ đã giao chỉ nhận lý do trong danh mục.'],
  [screens, 'function staffHandoverDialog', 'Phải có danh mục bàn giao cho từng cán bộ LS.'],
  [screens, 'function requesterLocked', 'Phòng/PGD phải bị khóa ô ghi chú sau khi giao.'],
  [app, "'staff-handover'", 'Nút bàn giao phải được nối vào app.'],
  [api, 'handoverStaffWork', 'Client phải gọi được handoverStaffWork.']
].forEach(([source, marker, message]) => { if (!source.includes(marker)) fail(message); });

// Bàn giao: mỗi hồ sơ một người nhận, chỉ Kiểm soát/Quản lý được làm.
function makeContext(users, items, role = 'KS_LS') {
  const events = [];
  const tx = {
    find: (table, key, value) => {
      const list = table === 'Users' ? users : items;
      const row = list.find((x) => x[key] === value);
      return row ? { object: row } : null;
    },
    rows: (table) => (table === 'Users' ? users : items).map((x) => ({ ...x })),
    write: (found, fields) => Object.assign(found.object, fields),
    append: (table, row) => { if (table === 'Events') events.push(row); }
  };
  const context = {
    Notifications: { queue: () => 0 },
    Utilities: { getUuid: () => '00000000-0000-0000-0000-000000000001' },
    Logger: { log() {} }
  };
  vm.runInNewContext(read('TimeTracking.gs'), context);
  vm.runInNewContext(server, context);
  context.DataRepository = { tx: (fn) => fn(tx), getAll: () => [] };
  context.requireActor_ = () => ({ user_id: 'KS1', role });
  context.markPlanDirty_ = () => {};
  context.assertCurrentWorkItem_ = () => {};
  context.stamp_ = () => '2026-11-10T03:00:00.000Z';
  context.timingCalendar_ = () => ({});
  context.localBusinessDate_ = (v) => new Date((v ? new Date(v).getTime() : new Date('2026-11-10T03:00:00.000Z').getTime()) + 7 * 3600000).toISOString().slice(0, 10);
  return { context, events };
}

const staff = () => [
  { user_id: 'OFF', role: 'CAN_BO_LS', is_active: true, full_name: 'Nguoi Nghi', availability_status: 'OFF', off_from: '2026-11-09', off_to: '2026-11-12' },
  { user_id: 'A', role: 'CAN_BO_LS', is_active: true, full_name: 'A' },
  { user_id: 'B', role: 'CAN_BO_LS', is_active: true, full_name: 'B' }
];
const work = (id, extra = {}) => ({ item_id: id, status: 'DANG_THUC_HIEN', assigned_user_id: 'OFF', version: 2, period_id: 'P1', processing_sessions_json: '[]', ...extra });

{
  const items = [work('I1'), work('I2'), work('I3', { assigned_user_id: 'A' })];
  const { context } = makeContext(staff(), items);
  const result = context.handoverStaffWork('OFF', [{ item_id: 'I1', assignee_id: 'A' }, { item_id: 'I2', assignee_id: 'B' }]);
  if (result.count !== 2 || items[0].assigned_user_id !== 'A' || items[1].assigned_user_id !== 'B') fail('Mỗi hồ sơ phải sang đúng người nhận đã chọn.');
  if (items[0].version !== 3 || items[0].execution_state !== 'QUEUED') fail('Hồ sơ bàn giao phải tăng version và vào hàng chờ làm.');
  let blocked = '';
  try { context.handoverStaffWork('OFF', [{ item_id: 'I3', assignee_id: 'B' }]); } catch (e) { blocked = e.message; }
  if (!blocked) fail('Không được bàn giao hồ sơ không do người đó giữ.');
  blocked = '';
  try { context.handoverStaffWork('OFF', [{ item_id: 'I1', assignee_id: 'OFF' }]); } catch (e) { blocked = e.message; }
  if (!blocked) fail('Người nhận phải khác người bàn giao.');
}
{
  const { context } = makeContext(staff(), [work('I1')], 'CAN_BO_LS');
  let blocked = '';
  try { context.handoverStaffWork('OFF', [{ item_id: 'I1', assignee_id: 'A' }]); } catch (e) { blocked = e.message; }
  if (!blocked) fail('Cán bộ LS không được tự bàn giao việc.');
}
{
  const { context } = makeContext(staff(), [work('I1')]);
  let blocked = '';
  try { context.handoverStaffWork('OFF', [{ item_id: 'I1', assignee_id: 'OFF' }]); } catch (e) { blocked = e.message; }
  const away = staff(); away[1].availability_status = 'OFF'; away[1].off_from = '2026-11-01'; away[1].off_to = '2026-11-30';
  const second = makeContext(away, [work('I1')]);
  let toAbsent = '';
  try { second.context.handoverStaffWork('OFF', [{ item_id: 'I1', assignee_id: 'A' }]); } catch (e) { toAbsent = e.message; }
  if (!blocked || !toAbsent) fail('Không được giao cho người đang nghỉ.');
}

// Phiên bị bỏ quên: khép lúc đóng cửa ngày bắt đầu, không cộng giờ sang ngày sau.
{
  const sessions = JSON.stringify([{ user_id: 'A', work_type_code: 'WT', start: '2026-11-06T02:00:00.000Z', end: '' }]);
  const items = [
    work('OLD', { assigned_user_id: 'A', execution_state: 'ACTIVE', processing_sessions_json: sessions, processing_started_at: '2026-11-06T02:00:00.000Z' }),
    work('TODAY', { assigned_user_id: 'A', execution_state: 'ACTIVE', processing_sessions_json: JSON.stringify([{ user_id: 'A', work_type_code: 'WT', start: '2026-11-10T01:00:00.000Z', end: '' }]) }),
    work('ABSENT', { assigned_user_id: 'OFF', execution_state: 'ACTIVE', processing_sessions_json: JSON.stringify([{ user_id: 'OFF', work_type_code: 'WT', start: '2026-11-10T01:00:00.000Z', end: '' }]) })
  ];
  const { context, events } = makeContext(staff(), items);
  const result = context.closeStaleSessions_();
  if (result.closed !== 2) fail('Phải khép phiên của ngày trước và phiên của người đang nghỉ, giữ phiên hôm nay của người đi làm.');
  const old = JSON.parse(items[0].processing_sessions_json);
  if (old[0].end !== '2026-11-06T11:00:00.000Z') fail('Phiên ngày trước phải khép đúng giờ đóng cửa 18:00 ngày bắt đầu.');
  if (items[0].execution_state !== 'WAITING' || items[1].execution_state !== 'ACTIVE' || items[2].execution_state !== 'WAITING') fail('Trạng thái làm việc sau khi khép phiên không đúng.');
  if (events.filter((e) => e.type === 'TU_DUNG_PHIEN').length !== 2) fail('Mỗi phiên bị khép phải để lại sự kiện.');
}

console.log('Bàn giao việc khi LS nghỉ, khép phiên bỏ quên và khóa ghi chú của Phòng/PGD: đạt.');
