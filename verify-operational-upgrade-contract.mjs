import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const code = read('Code.gs');
const notifications = read('Notifications.gs');
const setup = read('SetupSheetDB.gs');
const admin = read('js/admin.js');

const importFn = code.slice(code.indexOf('function adminImportUsers'), code.indexOf('function adminSaveSettings'));
if (!importFn.includes('handoverOpenWork_')) fail('Import người dùng phải dùng cùng luật bàn giao việc đang mở như sửa từng tài khoản.');
if (!/otherAdmins/.test(importFn) || !/tài khoản quản trị đang hoạt động duy nhất/.test(importFn)) fail('Import không được khóa quản trị cuối cùng.');
if (!/sameEmail|email.*trùng|Email đã/.test(importFn)) fail('Import phải chặn email trùng.');

if (!notifications.includes('rate_per_hour')) fail('Worker chưa áp dụng giới hạn rate_per_hour.');
if (!notifications.includes('recordWorkerRun_')) fail('Worker chưa ghi heartbeat/lần chạy cuối.');
if (!notifications.includes("o.channel !== 'EMAIL'")) fail('Email hết lease không được tự động gửi lại mù.');
if (!setup.includes('function maintenanceTick')) fail('Chưa có maintenance tick cho vận hành định kỳ.');

if (!setup.includes('function backupStorageWorkbook_')) fail('Chưa có backup kho Sheet tự động.');
if (!setup.includes('installMaintenanceTrigger')) fail('Chưa cài trigger maintenance định kỳ.');

if (!admin.includes('operationalScoreSnapshots')) fail('Admin chưa hiển thị lịch sử điểm đã chốt.');
if (!admin.includes('Lịch sử điểm đã chốt')) fail('Thiếu nhãn lịch sử điểm trong admin.');

console.log('Operational upgrade contract passed.');
