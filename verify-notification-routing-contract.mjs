/**
 * Kiểm hợp đồng bộ máy gửi tin: định tuyến kênh, người nhận và hạn mức.
 * Mỗi khẳng định dưới đây từng là một lỗi thật đã gặp; giữ lại để không tái diễn.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const ctx = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), ctx);
vm.runInNewContext(read('js/domain.js'), ctx);
const D = ctx.LS.domain;

const fail = (msg) => { throw new Error(msg); };
const st = D.seed();
const base = st.items.find((i) => i.assigned_user_id);
const req = st.requests.find((r) => r.request_id === base.request_id);
const item = (id, extra) => Object.assign({}, base, { item_id: id }, extra || {});
const only = (rows) => rows.length === 1 ? rows[0] : fail('Mong đợi đúng một tin, nhận ' + rows.length);

/* 1. Quy tắc dùng kênh trong app mà không khai mẫu vẫn phải phát được.
      Thông báo trong app không đi qua nhà cung cấp nên không có "mẫu được duyệt". */
for (const event of ['DE_NGHI_SUA', 'HOAN_THANH_LS']) {
  const row = only(D.queueNotifications(item('C1_' + event), event, st, null));
  if (row.channel !== 'IN_APP' || row.status !== 'DA_GUI') {
    fail('Quy tắc IN_APP không khai mẫu phải gửi được, nhận: ' + row.channel + '/' + row.status + ' — ' + row.note);
  }
  if (!row.body) fail('Tin trong app phải có nội dung mặc định.');
}

/* 2. Kênh khách chọn lúc hẹn ký chỉ áp cho tin hẹn ký, không kéo theo tin nội bộ. */
const appt = { at: '2026-09-25T02:00:00.000Z', date: '2026-09-25', time: '09:00', place: 'PGD', via_group: false, channel: 'EMAIL' };
const noiBo = only(D.queueNotifications(item('C2', { appointment: appt }), 'HOAN_THANH_LS', st, null));
if (noiBo.channel !== 'IN_APP') fail('Việc có lịch hẹn không được kéo tin nội bộ sang kênh báo khách.');

/* 3. Địa chỉ phải khớp kiểu của kênh: email không nhận số điện thoại. */
if (D.addressFor('EMAIL', { kind: 'KHACH', email: '', phone: '0908123456' })) {
  fail('Kênh email không được nhận số điện thoại làm người nhận.');
}
if (D.addressFor('SMS', { kind: 'NOI_BO', email: 'a@b.vn', phone: '' })) {
  fail('Kênh SMS chỉ gửi cho khách có số điện thoại.');
}
if (D.addressFor('IN_APP', { kind: 'NOI_BO', id: 'U001' }) !== 'U001') {
  fail('Tin trong app phải gắn với user_id, không phải email.');
}

/* 4. Mẫu phải khai theo từng kênh; không khớp kênh thì không được rơi về mẫu khác. */
const ruleHenKy = st.notifyRules.find((r) => r.id === 'R6');
if (D.templateFor(ruleHenKy, 'EMAIL', st).channel !== 'EMAIL') fail('Quy tắc hẹn ký phải có mẫu riêng cho email.');
if (D.templateFor({ template: 'TPL_HEN_KY' }, 'EMAIL', st)) {
  fail('Không được rơi về một mẫu đã duyệt bất kỳ của kênh — đó là cách gửi nhầm nội dung.');
}

/* 5. Khách không có kênh liên hệ thì tin phải đi vào nhóm nội bộ. */
const gmf = st.channels.find((c) => c.code === 'GMF');
gmf.config.group_id = 'GRP-LS-001';
gmf.config.api_checked = true;
gmf.status = 'HOAT_DONG';
gmf.test_mode = false;
st.settings.gateway_url = 'https://gateway.example/send';
st.settings.gateway_token_set = 'true';

const nhom = only(D.queueNotifications(
  item('C5', { appointment: Object.assign({}, appt, { via_group: true, channel: 'NHOM' }) }), 'DANG_HEN_KH', st, null));
if (nhom.channel !== 'GMF' || nhom.recipient !== 'GRP-LS-001') {
  fail('Đường nhóm nội bộ phải gửi vào mã nhóm đã cấu hình, nhận: ' + nhom.channel + '/' + nhom.recipient + ' — ' + nhom.note);
}
if (nhom.status === 'KHONG_GUI') fail('Tin nhóm nội bộ không gửi được: ' + nhom.note);

/* 6. Hạn mức thư là hạn mức mỗi ngày, không phải hạn mức trọn đời. */
const email = st.channels.find((c) => c.code === 'EMAIL');
email.config.daily_quota = 100;
email.config.used_today = 100;
email.config.quota_date = '2020-01-01';
if (D.emailUsedToday(email.config) !== 0) fail('Bộ đếm thư của ngày cũ phải trở về 0.');
email.config.quota_date = ctx.LS.localDate();
if (D.emailUsedToday(email.config) !== 100) fail('Bộ đếm thư trong ngày phải giữ nguyên.');

/* 7. Telegram phải bật được sau khi cấu hình; trước đây điều kiện đọc một ô
      readonly không có gì ghi vào nên kênh vĩnh viễn không kích hoạt được. */
const tele = st.channels.find((c) => c.code === 'TELEGRAM');
if (D.channelReady('TELEGRAM', st).ok) fail('Telegram chưa cấu hình mà đã báo sẵn sàng.');
tele.config.bot_name = '@ls_routing_bot';
tele.config.token_set = true;
tele.config.group_chat_id = '-1001234567890';
if (!D.channelReady('TELEGRAM', st).ok) {
  fail('Telegram cấu hình đủ mà vẫn không bật được: ' +
    D.channelReady('TELEGRAM', st).checks.filter((c) => !c.ok).map((c) => c.label).join(', '));
}
if (D.CHANNELS.TELEGRAM.fields.some((f) => f.readonly)) {
  fail('Điều kiện bật kênh không được phụ thuộc một ô chỉ đọc mà không quy trình nào ghi vào.');
}

/* 8. Mọi loại việc tín dụng của LS đều kết thúc bằng việc khách lên ký. */
const khongHen = st.workTypes.filter((w) => !w.needs_appointment).map((w) => w.code);
if (khongHen.length) fail('Loại việc chưa bật bắt buộc hẹn khách ký: ' + khongHen.join(', '));

/* 9. Mọi mã loại việc trong dữ liệu mẫu phải có trong danh mục. */
const typeCodes = new Set(st.workTypes.map((w) => w.code));
const orphan = [...new Set(st.items.map((i) => i.work_type_code))].filter((c) => !typeCodes.has(c));
if (orphan.length) fail('Dữ liệu mẫu tham chiếu loại việc không tồn tại: ' + orphan.join(', '));

/* ---------------------------- Phía máy chủ ---------------------------- */

const notifications = read('Notifications.gs');
const server = read('Code.gs');
const gasApi = read('js/gas-api.js');
const setup = read('SetupSheetDB.gs');

vm.runInNewContext(notifications, {});
vm.runInNewContext(setup, {});

const must = [
  [notifications, "audience === 'NHOM'", 'Máy chủ phải có người nhận là nhóm nội bộ.'],
  [notifications, 'function addressFor_', 'Máy chủ phải chọn địa chỉ theo từng kênh.'],
  [notifications, 'function emailQuota_', 'Hạn mức thư phải tính theo ngày.'],
  [notifications, 'next_try_at', 'Tin thất bại phải có mốc thử lại.'],
  [notifications, 'function sweepOverdue', 'Phải có bộ quét việc quá hạn phía máy chủ.'],
  [notifications, "ScriptApp.newTrigger('overdueTick')", 'Bộ quét quá hạn phải có trigger.'],
  [notifications, "code !== 'IN_APP'", 'Tin trong app không được đòi mẫu đã duyệt.'],
  [server, 'function requireRole_', 'Vai trò phải được kiểm theo danh sách cho phép.'],
  [server, 'function changeOutbox', 'Cán bộ phải xác nhận được tin của việc mình phụ trách.'],
  [server, 'function changeOwnPassword', 'Phải có đường đổi mật khẩu tạm.'],
  [server, 'function requireActor_', 'Thao tác ghi phải chặn tài khoản còn mật khẩu tạm.'],
  [server, 'function sanitizeAdminItem_', 'Quản trị không được đọc dữ liệu khách qua bảng việc.'],
  [server, 'function adminTestChannel', 'Phải có cách gửi thử để kiểm chứng cấu hình kênh.'],
  [server, "event = 'DOI_NGUOI'", 'Chuyển việc sang người khác phải phát đúng sự kiện.'],
  [server, "Notifications.queue(t, item, 'DE_NGHI_SUA'", 'Đề nghị sửa phải báo cho kiểm soát.'],
  [setup, "'telegram_chat_id'", 'Bảng Users phải có chat id Telegram.'],
  [setup, "'R8'", 'Phải nạp quy tắc báo nhóm nội bộ.'],
  [setup, 'TPL_MAIL_HEN_KY', 'Phải có mẫu email hẹn ký làm kênh dự phòng.'],
  // Khách không có kênh liên hệ vẫn phải hẹn được, nếu không hồ sơ đó không bao
  // giờ hoàn thành được vì mọi loại việc đều bắt buộc hẹn.
  [server, '!opts.appointment.via_group', 'Phải cho hẹn qua nhóm nội bộ khi khách chưa có điện thoại và email.'],
  [server, "String(doneType.object.requires_appointment) === 'true'", 'Máy chủ phải chặn hoàn thành khi loại việc cần hẹn mà chưa hẹn.'],
  [setup, 'function upgradeWorkTypeAppointment_', 'Kho tạo từ bản cũ phải được bật bắt buộc hẹn khách ký.']
];
for (const [source, needle, message] of must) if (!source.includes(needle)) fail(message);

if (server.includes("if (u.role === 'ADMIN') {\n    result.outbox") ) {
  fail('Hàng đợi gửi tin không được chỉ dành cho quản trị.');
}
if (!/outbox: u\.role === 'ADMIN' \? \[\] : DataRepository\.tail\('NotificationOutbox'/.test(server)) {
  fail('Bootstrap phải trả hàng đợi cho cán bộ theo phạm vi việc họ nhìn thấy.');
}
if (!/out\.templates = \[\];/.test(gasApi) || !/out\.notifyRules = \[\];/.test(gasApi)) {
  fail('Adapter GAS không được giữ lại dữ liệu mẫu khi máy chủ không trả mục đó.');
}

/* Bảng biến bị cấm phải giống nhau ở cả ba nơi. */
const forbidden = (source) => {
  const start = source.indexOf('FORBIDDEN');
  const block = source.slice(start, source.indexOf('};', start));
  return ['GMF', 'ZBS', 'SMS', 'TELEGRAM', 'EMAIL'].map((code) => {
    const m = new RegExp(code + ":\\s*\\[([^\\]]*)\\]").exec(block);
    return code + '=' + (m ? m[1].replace(/['\s]/g, '') : '?');
  }).join('|');
};
const clientVars = forbidden(read('js/domain.js'));
const serverVars = forbidden(notifications);
const adminVars = forbidden(server.slice(server.indexOf('FORBIDDEN_VARS')));
if (clientVars !== serverVars || clientVars !== adminVars) {
  fail('Danh sách biến bị cấm lệch nhau:\n  client: ' + clientVars + '\n  worker: ' + serverVars + '\n  admin : ' + adminVars);
}

console.log('Notification routing contract passed.');
