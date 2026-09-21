import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };
const server = read('Code.gs');
const admin = read('js/admin.js');

const required = [
  [server, 'function handoverOpenWork_', 'Server phải có thao tác bàn giao việc mở khi đổi vai trò cán bộ.'],
  [server, 'handoverOpenWork_(t, code, data.replacement_user_id', 'Đổi vai trò phải gọi bàn giao với cán bộ thay thế đã chọn.'],
  [server, "throw new Error('Còn ' + openItems.length + ' việc đang mở; chọn cán bộ thay thế trước khi đổi vai trò hoặc khóa.')", 'Lỗi thiếu cán bộ thay thế phải nói rõ cách xử lý.'],
  [admin, 'Nếu đổi khỏi Cán bộ LS khi còn việc mở, chọn cán bộ thay thế', 'Form người dùng phải hướng dẫn bàn giao khi đổi vai trò.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) fail(message);
}

const events = [];
const writes = [];
const queued = [];
const item = { item_id: 'ITEM_1', status: 'DANG_THUC_HIEN', assigned_user_id: 'OLD', version: 4 };
const found = { object: item };
const tx = {
  find: () => found,
  write: (row, fields) => { Object.assign(row.object, fields); writes.push(fields); },
  append: (table, row) => { if (table === 'Events') events.push(row); }
};
const context = {
  Notifications: { queue: (...args) => queued.push(args) },
  Utilities: { getUuid: () => '00000000-0000-0000-0000-000000000001' }
};
vm.runInNewContext(server, context);
const moved = context.handoverOpenWork_(tx, 'OLD', 'NEW', 'ADMIN', [item], 'Bàn giao kiểm thử.');
if (moved !== 1 || item.assigned_user_id !== 'NEW' || item.version !== 5) {
  fail('Bàn giao phải đổi người nhận và tăng version của việc đang mở.');
}
if (events.length !== 1 || events[0].type !== 'DOI_NGUOI' || queued.length !== 1) {
  fail('Bàn giao phải ghi nhật ký và xếp thông báo cho người nhận mới.');
}

console.log('Role-change contract passed.');
