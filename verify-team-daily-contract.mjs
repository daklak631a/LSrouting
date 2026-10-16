/**
 * Kiểm màn "Phân giao toàn phòng" (chỉ xem) và bảng kết quả ngày theo mẫu phòng LS.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const read = (f) => fs.readFileSync(f, 'utf8');
const fail = (msg) => { throw new Error(msg); };
const store = {};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, querySelectorAll: () => [], getContext: () => null });
const document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [] };
const ctx = { LS: {}, document, console, Promise, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  window: { addEventListener() {}, location: { search: '' } }, navigator: {}, FormData: class {} };
vm.createContext(ctx);
for (const f of ['core', 'domain', 'gas-api', 'ui', 'charts', 'screens']) vm.runInContext(read(`js/${f}.js`), ctx, { filename: f });
const LS = ctx.LS, D = LS.domain;
LS.app = { render() {} };
LS.load(D.seed);
const st = LS.db();

/* 1. Cán bộ LS có màn xem toàn phòng; người ngoài LS không có. */
if (D.ROLES.CAN_BO_LS.nav.indexOf('team') === -1) fail('Cán bộ LS phải có màn Phân giao toàn phòng.');
if (D.ROLES.PHONG_PGD.nav.indexOf('team') !== -1) fail('Phòng/PGD không được xem phân giao nội bộ của LS.');

/* 2. Máy chủ: đường đọc riêng, chỉ-đọc, không nằm trong danh sách ghi, không lộ liên hệ. */
const server = read('Code.gs');
const fn = server.slice(server.indexOf('function getTeamAssignments'), server.indexOf('function periodSummaryRows_'));
if (!/getTeamAssignments: getTeamAssignments/.test(server)) fail('getTeamAssignments chưa được đăng ký vào cổng api.');
if (/API_WRITE_ = \[[^\]]*getTeamAssignments/.test(server)) fail('getTeamAssignments là đường đọc, không được đưa vào danh sách ghi.');
if (/\bphone:|\bemail:|\bnote:/.test(fn.slice(fn.indexOf('rows.push')))) fail('Màn phân giao toàn phòng không được trả số điện thoại, email hay ghi chú.');
if (!/CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'/.test(fn)) fail('Phải giới hạn vai trò được xem phân giao toàn phòng.');

// Chạy API thật với dữ liệu giả: cán bộ xem được đồng nghiệp, không có quyền ghi hay liên hệ khách.
{
  const teamDb = {
    Requests: [{ request_id:'R', customer_name:'Khách giả', phone:'0905123456', email:'private@example.test', note:'PRIVATE_NOTE', unit_id:'PGD' }],
    Users: [{ user_id:'LS_OTHER', full_name:'Cán bộ khác' }], Units: [{ unit_id:'PGD', name:'Phòng giả' }],
    WorkTypes: [{ type_code:'W', display_name:'Việc giả' }],
    WorkItems: [{ item_id:'W1', request_id:'R', assigned_user_id:'LS_OTHER', work_type_code:'W', status:'DANG_THUC_HIEN', assigned_at:'2026-10-07T09:00:00+07:00' }]
  };
  const apiCtx = { DataRepository:{ getAll:name=>teamDb[name] || [] },
    Utilities:{ DigestAlgorithm:{ MD5:'md5' }, computeDigest:(alg,value)=>Array.from(crypto.createHash(alg).update(value).digest()) } };
  vm.runInNewContext(read('TimeTracking.gs'), apiCtx);
  vm.runInNewContext(server, apiCtx);
  apiCtx.stamp_ = ()=> '2026-10-07T10:00:00+07:00';
  for (const role of ['CAN_BO_LS','KS_LS','QUAN_LY_LS']) {
    apiCtx.currentUser_ = ()=> ({ user_id:'SELF', role });
    const result = apiCtx.getTeamAssignments({ from:'2026-10-05', to:'2026-10-11' });
    if (result.rows.length !== 1 || result.rows[0].is_mine) fail('Vai trò LS phải xem được việc của đồng nghiệp: ' + role);
    if (/0905123456|private@example|PRIVATE_NOTE/.test(JSON.stringify(result))) fail('API phân giao không được lộ liên hệ hoặc ghi chú.');
  }
  for (const role of ['PHONG_PGD','GIAM_SAT','ADMIN']) {
    apiCtx.currentUser_ = ()=> ({ user_id:'SELF', role });
    let denied = false;
    try { apiCtx.getTeamAssignments({ from:'2026-10-05', to:'2026-10-11' }); } catch (e) { denied = /quyền/.test(e.message); }
    if (!denied) fail('Vai trò ngoài phạm vi không được xem phân giao: ' + role);
  }
}

/* 3. Phân loại hoạt động cho bảng ngày. */
const wt = (code) => st.workTypes.find((w) => w.code === code);
// Việc đã hoàn thành trước khi có ô phần việc TSĐB: giữ cách đếm cũ theo tên loại việc và tick lúc hoàn thành.
const keys = (code, extra) => D.dailyActivityKeys(Object.assign({ work_type_code: code, collateral_mode: '', status: 'HOAN_THANH_LS' }, extra || {}), wt(code));
if (keys('LEGACY_16').indexOf('HD_THE_CHAP') !== -1) fail('Thấu chi tín chấp không phải HĐ thế chấp.');
if (keys('LEGACY_01').indexOf('HD_THE_CHAP') === -1 || keys('LEGACY_01').indexOf('HD_TIN_DUNG') === -1) fail('Vay TSĐB phải tính cả HĐ thế chấp và HĐ tín dụng.');
for (const mode of ['NONE', 'CO_SAN', 'MOI']) {
  if (keys('LEGACY_01', { collateral_mode: mode }).includes('HD_THE_CHAP')) fail('Chế độ ' + mode + ' không tự cộng HĐ thế chấp tại việc tín dụng.');
}
// Cầm cố không còn dòng riêng: tính như hồ sơ vay (HĐ tín dụng + Rlos), không phải HĐ thế chấp.
const camCo = keys('LEGACY_09');
if (camCo.indexOf('HD_TIN_DUNG') === -1 || camCo.indexOf('RLOS') === -1 || camCo.indexOf('HD_THE_CHAP') !== -1 || camCo.indexOf('HD_CAM_CO') !== -1) fail('Cầm cố phải tính như hồ sơ vay, không vào HĐ thế chấp và không còn dòng riêng.');
if (D.dailyBacklogKeys({ collateral_mode: 'NONE', dossier_received_at: '2026-10-05T01:00:00Z' }, wt('LEGACY_09')).join() !== 'TON_TIN_DUNG') fail('Hồ sơ cầm cố đã nhận chỉ tính vào tồn HĐ tín dụng.');
if (keys('LEGACY_13').join() !== 'HD_TIN_DUNG,RLOS') fail('Giải ngân từng lần tính như hồ sơ vay; không còn dòng giải ngân TP.');
// Soạn thảo HĐ thế chấp = làm TSĐB mới hoặc làm phụ lục TSĐB.
for (const code of ['LEGACY_22', 'LEGACY_23', 'LEGACY_25', 'LEGACY_26']) {
  if (keys(code).join() !== 'HD_THE_CHAP') fail('Việc TSBĐ ' + code + ' (TSĐB mới / phụ lục TSĐB) phải vào dòng Soạn thảo HĐ thế chấp.');
}
for (const code of ['LEGACY_24', 'LEGACY_27', 'LEGACY_28']) {
  if (keys(code).join() !== 'KHAC') fail('Việc TSBĐ ' + code + ' (xuất, mượn, thủ tục khác) không soạn HĐ thế chấp nên vào dòng Khác.');
}
if (keys('LEGACY_24', { result_flags: { HD_THE_CHAP: true } }).join() !== 'HD_THE_CHAP') fail('Cán bộ tick đã soạn HĐ thế chấp thì phải tính vào HĐ thế chấp.');
if (keys('LEGACY_26', { result_flags: { HD_THE_CHAP: false } }).join() !== 'KHAC') fail('Bỏ tick HĐ thế chấp của việc TSĐB thì tính vào dòng Khác.');
if (keys('LEGACY_28', { collateral_mode: 'MOI' }).join() !== 'HD_THE_CHAP') fail('Việc kèm TSĐB mới luôn là HĐ thế chấp.');
if (keys('LEGACY_29')[0] !== 'KHAC') fail('Việc tín dụng khác phải vào dòng Khác.');
if (D.dailyBacklogKeys({ collateral_mode: 'NONE', dossier_received_at: '2026-10-05T01:00:00Z' }, wt('LEGACY_26')).join() !== 'TON_THE_CHAP') fail('Việc TSĐB mới đã nhận tính vào tồn soạn HĐ thế chấp.');
if (D.dailyBacklogKeys({ collateral_mode: 'NONE', dossier_received_at: '2026-10-05T01:00:00Z' }, wt('LEGACY_24')).length) fail('Việc xuất TSĐB đang mở không tính vào tồn soạn HĐ.');
for (const code of ['LEGACY_01', 'LEGACY_09', 'LEGACY_26']) {
  for (const status of ['DA_PHAN_CONG', 'TAM_DUNG']) {
    if (D.dailyBacklogKeys({ status, assigned_user_id: 'LS1', assigned_at: '2026-10-05T01:00:00Z', processing_started_at: '' }, wt(code)).length) fail('Chưa nhận và chưa từng xử lý thì không tính tồn: ' + code + ' ' + status);
  }
  for (const status of ['TAM_DUNG', 'DANG_THUC_HIEN']) {
    if (!D.dailyBacklogKeys({ status, assigned_user_id: 'LS1', assigned_at: '2026-10-05T01:00:00Z', processing_started_at: '2026-10-05T01:00:00Z' }, wt(code)).length) fail('Hồ sơ cũ đã bắt đầu xử lý vẫn tính tồn khi thiếu mốc nhận: ' + code + ' ' + status);
  }
}
if (D.DAILY_ROWS.some((r) => ['THU_NO', 'NHAC_NO', 'HD_CAM_CO', 'TSBD', 'GIAI_NGAN', 'TON_CAM_CO'].includes(r.key))) fail('Đã bỏ các dòng thu nợ, nhắc nợ, HĐ cầm cố, TSBĐ, giải ngân TP và tồn HĐ cầm cố.');
if (Array.from(D.DAILY_ROWS).map((r) => r.key).join() !== 'HD_THE_CHAP,HD_TIN_DUNG,NHAP_KHO,XUAT_KHO,RLOS,TON,TON_THE_CHAP,TON_TIN_DUNG,KHAC') fail('Bảng ngày phải có 9 dòng theo đúng thứ tự (thêm Nhập kho, Xuất kho TSĐB).');

/* 3b. Email khách có link chỉ đường và khung HTML theo thương hiệu. */
const mapNs = vm.runInNewContext(read('Notifications.gs') + '\n;({ Notifications })', { Utilities: {}, DataRepository: {} });
const html = mapNs.Notifications.emailHtml('Lịch hẹn', 'Xin chào\nChỉ đường: https://www.google.com/maps/dir/?api=1&destination=PGD', { bank_name: 'Ngân hàng', brand_color: '#123456', hotline: '1900' });
if (!/Chỉ đường bằng Google Maps/.test(html) || !/#123456/.test(html)) fail('Email HTML phải có nút chỉ đường, và màu thương hiệu.');
if (/<script/i.test(mapNs.Notifications.emailHtml('<script>x</script>', 'a<b', {}))) fail('Email HTML phải thoát ký tự đặc biệt.');
if (D.mapLink('PGD A B', {}).indexOf('destination=PGD%20A%20B') === -1) fail('Link chỉ đường phải mã hóa địa chỉ.');
if (D.mapLink('', { sign_place: 'X', sign_map_url: 'https://maps.app.goo.gl/abc' }) !== 'https://maps.app.goo.gl/abc') fail('Nơi ký chung phải dùng link Maps Admin đã dán.');

/* 3c. Xóa user: chỉ Admin, chặn tự xóa, và có kiểm tra dữ liệu liên quan. */
const srv = read('Code.gs');
const del = srv.slice(srv.indexOf('function adminDeleteUser'), srv.indexOf('function adminImportUsers'));
if (!/requireAdmin_\(\)/.test(del) || !/admin\.user_id/.test(del) || !/OPEN_STATUS/.test(del) || !/isLateOpen_/.test(del) || !/handoverOpenWork_/.test(del)) fail('adminDeleteUser phải chỉ cho Admin, chặn tự xóa, bắt bàn giao việc còn hạn và cho xóa khi việc đã quá hạn/hoàn thành.');
if (!/adminDeleteUser'/.test(srv.slice(srv.indexOf('var API_WRITE_'), srv.indexOf('function apiFunctions_')))) fail('adminDeleteUser là lệnh ghi, phải nằm trong API_WRITE_.');

/* 4. Bảng ngày và màn phân giao hiển thị được. */
const ks = st.users.find((u) => u.role === 'KS_LS');
st.session = ks.user_id;
// Bảng ngày: phân công chưa nhận không tăng tồn; tiếp nhận tăng tồn, tạm dừng sau nhận vẫn là tồn.
{
  const total = (label) => {
    const row = new RegExp('<td class="dm-act"><i>' + label + '</i></td>[\\s\\S]*?<td class="num dm-total">([^<]+)</td>').exec(LS.screens.board());
    if (!row) fail('Thiếu dòng tồn: ' + label);
    return Number(row[1] === '-' ? 0 : row[1]);
  };
  const prior = [total('Còn soạn HĐ thế chấp'), total('Còn soạn HĐ tín dụng')];
  const pending = Object.assign({}, st.items[0], { item_id: 'RECEIPT_BACKLOG', work_type_code: 'LEGACY_01', status: 'DA_PHAN_CONG',
    assigned_user_id: st.users.find((u) => u.role === 'CAN_BO_LS' && u.active).user_id, dossier_received_at: '',
    completed_at: '', carried_to_item_id: '', collateral_mode: '', result_credit: null, result_credit_json: '' });
  st.items.push(pending);
  if (total('Còn soạn HĐ thế chấp') !== prior[0] || total('Còn soạn HĐ tín dụng') !== prior[1]) fail('Bảng ngày không tính hồ sơ phân công chưa nhận vào tồn.');
  pending.dossier_received_at = new Date().toISOString();
  for (const status of ['DANG_THUC_HIEN', 'TAM_DUNG']) {
    pending.status = status;
    if (total('Còn soạn HĐ thế chấp') !== prior[0] + 1 || total('Còn soạn HĐ tín dụng') !== prior[1] + 1) fail('Hồ sơ đã nhận chưa xong phải tính tồn, kể cả tạm dừng.');
  }
  st.items.pop();
}
st.items.forEach((i, n) => { if (i.assigned_user_id && n % 2 === 0) { i.status = 'HOAN_THANH_LS'; i.completed_at = new Date().toISOString(); } });
st.settings.daily_plan_json = JSON.stringify({ HD_TIN_DUNG: 4 });
LS.screens.togglePlan();
const board = LS.screens.board();
LS.screens.togglePlan();
if (!/daily-matrix/.test(board) || !/KẾ HOẠCH NGÀY/.test(board) || !/% HOÀN THÀNH/.test(board)) fail('Tab Kết quả thực hiện phải có bảng ngày theo mẫu.');
if (!/25,00%|50,00%|75,00%|100,00%|0,00%/.test(board) && !/%/.test(board)) fail('Bảng ngày phải có cột % hoàn thành.');

st.session = st.users.find((u) => u.role === 'CAN_BO_LS').user_id;
LS.screens.team();
await new Promise((r) => setTimeout(r, 20));
const team = LS.screens.team();
if (!/<table/.test(team)) fail('Màn phân giao toàn phòng phải hiện bảng hồ sơ.');
if (/<button[^>]*data-act="(transition|assign)/.test(team)) fail('Màn phân giao toàn phòng chỉ để xem, không có nút thao tác.');

console.log('Team assignment + daily matrix contract passed.');

/* 5. Mẫu email khách chuẩn thương hiệu: dựng khớp giữa máy chủ và trình duyệt, và sửa được dữ liệu cũ sai kênh. */
{
  const tpl = st.templates.find((t) => t.code === 'TPL_MAIL_HEN_KY');
  if (tpl.channel !== 'EMAIL' || !/link_ban_do/.test(tpl.body)) fail('Mẫu email hẹn khách phải là EMAIL và có link chỉ đường.');
  const vars = { ten_khach: 'Công ty ABC', ten_ngan_hang: 'Ngân hàng X', gio_ky: '09:00', ngay_ky: '22/09/2026', noi_ky: 'PGD Bến Thành', link_ban_do: 'https://maps.app.goo.gl/abc', hotline: '1900 1234' };
  const render = (s) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => vars[k] || '');
  const settings = { bank_name: 'Ngân hàng X', brand_color: '#0a5c8a', hotline: '1900 1234', logo_url: 'https://example.com/logo.png' };
  const clientHtml = D.emailHtml(render(tpl.subject), render(tpl.body), settings);
  const serverHtml = mapNs.Notifications.emailHtml(render(tpl.subject), render(tpl.body), settings);
  if (clientHtml !== serverHtml) fail('Email dựng ở trình duyệt (xem trước) phải giống hệt bản máy chủ gửi đi.');
  if (!/Thời gian/.test(clientHtml) || !/Địa điểm/.test(clientHtml) || !/Chỉ đường bằng Google Maps/.test(clientHtml) || !/#0a5c8a/.test(clientHtml) || !/logo\.png/.test(clientHtml)) {
    fail('Email chuẩn phải có thẻ thời gian/địa điểm, nút chỉ đường, màu và logo thương hiệu.');
  }
  vars.link_ban_do = ''; vars.noi_ky = '';
  const bare = D.emailHtml('x', render(tpl.body), settings);
  if (/Địa điểm|Chỉ đường/.test(bare)) fail('Dòng có biến rỗng không được để lại nhãn cụt.');

  // Migration trên Sheet giả: mẫu sai kênh (SMS) và đang nháp.
  const setupNs = vm.runInNewContext(read('SetupSheetDB.gs') + '\n;({ upgradeMailMapLink_ })', {});
  const mkSheet = (row) => {
    const data = [['code', 'channel', 'status', 'subject', 'body', 'approved_by', 'approved_at'], row];
    return { data, getLastRow: () => data.length, getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
      getRange: (r, c) => ({ setValue: (v) => { data[r - 1][c - 1] = v; } }) };
  };
  const wrong = mkSheet(['TPL_MAIL_HEN_KY', 'SMS', 'NHAP', 'cũ', 'Kính chào {{ten_khach}} {{dia_diem}}', '', '']);
  const rep = [];
  setupNs.upgradeMailMapLink_(wrong, rep);
  if (wrong.data[1][1] !== 'EMAIL' || wrong.data[1][2] !== 'CHO_DUYET' || !/link_ban_do/.test(wrong.data[1][4]) || !rep.length) fail('Mẫu sai kênh phải được sửa về EMAIL, bản chuẩn, chờ duyệt.');
  const keep = mkSheet(['TPL_MAIL_HEN_KY', 'EMAIL', 'DA_DUYET', 'tùy chỉnh', 'Nội dung Admin đã chốt', 'U006', '2026']);
  setupNs.upgradeMailMapLink_(keep, []);
  if (keep.data[1][4] !== 'Nội dung Admin đã chốt' || keep.data[1][2] !== 'DA_DUYET') fail('Mẫu đã duyệt đúng kênh không được bị ghi đè.');
}

/* 6. Email khách là thông báo (không phải thư mời), không số tổng đài, có banner nhẹ. */
{
  const tpl = st.templates.find((t) => t.code === 'TPL_MAIL_HEN_KY');
  if (/mời/i.test(tpl.subject + tpl.body)) fail('Email hẹn khách là thông báo lịch hẹn, không dùng chữ "mời".');
  if (!/Thông báo/.test(tpl.subject) || !/cán bộ Quản lý/.test(tpl.body)) fail('Tiêu đề phải là Thông báo và hướng dẫn đổi lịch qua cán bộ Quản lý.');
  if (/hotline|tổng đài/i.test(tpl.body)) fail('Email hẹn khách không ghi số tổng đài.');
  const withHotline = D.emailHtml('x', 'a', { hotline: '1900 1234', email_banner_url: 'https://example.com/b.jpg', bank_name: 'BIDV Đắk Lắk' });
  if (/1900 1234|Tổng đài/.test(withHotline)) fail('Chân thư không còn số tổng đài.');
  if (!/<img src="https:\/\/example\.com\/b\.jpg" alt="BIDV Đắk Lắk"/.test(withHotline)) fail('Banner phải hiện đầu thư kèm chữ thay thế là tên ngân hàng.');
  if (/<img[^>]*banner/i.test(D.emailHtml('x', 'a', { email_banner_url: 'http://insecure/b.jpg' }))) fail('Chỉ nhận banner https.');
  if (st.settings.bank_name !== 'BIDV Đắk Lắk') fail('Tên ngân hàng mặc định phải là BIDV Đắk Lắk.');
  const banner = fs.statSync('assets/email-banner-bidv-daklak.jpg').size;
  if (banner > 150 * 1024) fail('Banner email phải nhẹ (dưới 150 KB), hiện ' + Math.round(banner / 1024) + ' KB.');

  const setupNs = vm.runInNewContext(read('SetupSheetDB.gs') + '\n;({ upgradeMailMapLink_ })', {});
  const oldBody = 'Kính chào Quý khách {{ten_khach}},\n{{ten_ngan_hang}} trân trọng mời Quý khách đến ký hồ sơ theo lịch hẹn dưới đây:\nThời gian: {{gio_ky}} ngày {{ngay_ky}}\nĐịa điểm: {{noi_ky}}\nChỉ đường: {{link_ban_do}}\nQuý khách vui lòng mang theo giấy tờ tùy thân (CCCD/CMND) khi đến ký.\nNếu cần đổi lịch, vui lòng liên hệ tổng đài {{hotline}}.\nTrân trọng,\n{{ten_ngan_hang}}';
  const data = [['code', 'name', 'channel', 'status', 'subject', 'body', 'approved_by', 'approved_at'],
    ['TPL_MAIL_HEN_KY', 'Email mời khách đến ký hồ sơ', 'EMAIL', 'DA_DUYET', 'Thư mời ký hồ sơ tại {{ten_ngan_hang}}', oldBody, 'U006', '2026']];
  const sheet = { getLastRow: () => data.length, getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }), getRange: (r, c) => ({ setValue: (v) => { data[r - 1][c - 1] = v; } }) };
  setupNs.upgradeMailMapLink_(sheet, []);
  if (/mời|tổng đài/i.test(data[1][5] + data[1][4]) || data[1][3] !== 'CHO_DUYET' || !/Thông báo/.test(data[1][1] + data[1][4])) fail('Bản chuẩn đời trước phải được nâng lên bản Thông báo, chờ duyệt lại.');
}

/* 7. Tên cột cán bộ: tên gọi; trùng tên thì viết tắt chữ đầu; không bao giờ bị cắt vụn bởi lỗi tách chữ. */
{
  const u = (full_name) => ({ full_name, user_id: full_name });
  const labels = D.dailyStaffLabels([u('Đặng Thị Thúy Hà'), u('Bùi Vĩnh Thiện'), u('Lê Thị Hương Trà'), u('User LS test 1'), u('Nguyễn Văn Hà'), u('Trần Văn Quế')]);
  const want = ['ĐTT HÀ', 'THIỆN', 'TRÀ', '1', 'NV HÀ', 'QUẾ'];
  if (labels.join('|') !== want.join('|')) fail('Tên cột sai: ' + labels.join('|') + ' (mong đợi ' + want.join('|') + ')');
  const same = D.dailyStaffLabels([u('Nguyễn Văn Hà'), u('Ngô Việt Hà')]);
  if (same[0] === same[1]) fail('Hai người trùng tên và trùng chữ đầu vẫn phải khác nhau.');
  const png = read('js/screens.js').slice(read('js/screens.js').indexOf('function downloadDailyImage'));
  if (!/function headCell/.test(png) || !/measureText/.test(png)) fail('Ảnh PNG phải tự chia dòng/co chữ để tên không tràn sang cột bên cạnh.');
}

/* 8. Cột Kế hoạch ngày và % hoàn thành mặc định ẩn, có nút bật/tắt; ảnh và Excel theo cùng trạng thái. */
{
  st.session = st.users.find((u) => u.role === 'KS_LS').user_id;
  const hidden = LS.screens.board();
  if (/KẾ HOẠCH NGÀY|% HOÀN THÀNH/.test(hidden.slice(hidden.indexOf('daily-matrix'), hidden.indexOf('</table>', hidden.indexOf('daily-matrix'))))) fail('Mặc định bảng ngày không hiện cột Kế hoạch và %.');
  if (!/Hiện kế hoạch/.test(hidden)) fail('Phải có nút Hiện kế hoạch / %.');
  LS.screens.togglePlan();
  const shown = LS.screens.board();
  if (!/KẾ HOẠCH NGÀY/.test(shown) || !/Ẩn kế hoạch/.test(shown)) fail('Bấm nút phải hiện cột Kế hoạch và %.');
  LS.screens.togglePlan();
  const src = read('js/screens.js');
  if ((src.match(/m\.showPlan/g) || []).length < 8) fail('HTML, PNG và Excel đều phải theo trạng thái ẩn/hiện kế hoạch.');
}
