import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const server = read('Code.gs');
const setup = read('SetupSheetDB.gs');
const api = read('js/gas-api.js');
const screens = read('js/screens.js');
const app = read('js/app.js');

// Việc kèm TSĐB phải là một dòng WorkItems thật để báo cáo tự đếm thành 2 việc.
if (!/'parent_item_id'/.test(setup)) fail('WorkItems phải có cột parent_item_id cho việc kèm.');
if (!/function addLinkedItem\(parentId, workTypeCode\)/.test(server)) fail('Máy chủ phải có addLinkedItem.');
const linked = server.slice(server.indexOf('function addLinkedItem('), server.indexOf('/* ---------------------------- Đề nghị sửa'));
if (!/t\.append\('WorkItems'/.test(linked)) fail('addLinkedItem phải tạo dòng WorkItems riêng.');
if (!/processing_started_at: ts/.test(linked)) fail('Việc kèm phải bắt đầu tính giờ ngay khi thêm.');
if (!/assigned_user_id: parent\.assigned_user_id/.test(linked)) fail('Việc kèm phải giao cho người đang làm việc chính.');
if (!/i\.parent_item_id === parentId && i\.work_type_code === workTypeCode/.test(linked)) fail('Phải chặn thêm trùng cùng một sản phẩm kèm.');
if (!/parent_item_id: i\.parent_item_id/.test(api) || !/addLinkedItem:/.test(api)) fail('gas-api phải chuyển parent_item_id và gọi addLinkedItem.');
if (!/data-act="linked-toggle"/.test(screens) || !/'add-linked'/.test(app)) fail('Chi tiết việc phải có ô tick thêm việc TSĐB.');

// Sau khi máy chủ lưu xong phải vẽ lại, không bắt người dùng tải lại trang.
const flowOk = screens.slice(screens.indexOf('LS.api.transitionItem('), screens.indexOf('/* ============================ Hộp thoại: sửa việc'));
if (!/LS\.app\.render\(\)/.test(flowOk.slice(flowOk.indexOf('onOk')))) fail('Chuyển trạng thái xong phải tự vẽ lại màn hình.');
if (!/refreshOnClose = true/.test(app) || !/onDialogClose/.test(app)) fail('Lượt tải lại bị hoãn vì hộp thoại phải chạy bù khi đóng.');

// Tích nhanh nhiều ô không được mất ô nào, và chuyển bước phải chờ lưu checklist.
if (/i\.syncing\) return;\s*var before = JSON\.parse\(JSON\.stringify\(i\)\), expected = i\.version;/.test(screens)) fail('Checklist không được bỏ qua lần tích trong lúc đang lưu.');
if (!/checklistPending\(i\.item_id\)/.test(screens)) fail('submitFlow phải chờ checklist lưu xong.');

console.log('Linked-item, auto-refresh and checklist queue contract OK');
