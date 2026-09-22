import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const setup = read('SetupSheetDB.gs');
const notifications = read('Notifications.gs');
const code = read('Code.gs');
const api = read('js/gas-api.js');
const readme = read('README.md');
const plan = read('planfix.md');

if (!setup.includes('NotificationIdempotency')) fail('Thiếu bảng chỉ mục idempotency notification.');
if (!setup.includes("claim_token") || !setup.includes("claim_until")) fail('Outbox phải có cột lease claim.');
if (!notifications.includes('function reserveIdempotency_')) fail('Thiếu hàm reserve idempotency bền vững.');
if (!notifications.includes('NotificationIdempotency')) fail('Worker chưa dùng chỉ mục idempotency bền vững.');
if (/tail\('NotificationOutbox',\s*2000\)/.test(notifications)) fail('Không được chống trùng bằng tail 2.000 dòng.');
if (!notifications.includes('claimPending_') || !notifications.includes('claim_until')) fail('Worker chưa claim theo lease trước khi gọi provider.');
if (/DataRepository\.tx\(function \(t\) \{[\s\S]{0,5000}send_\(t, o\)/.test(notifications)) fail('Không được gọi provider khi đang giữ transaction lock.');

if (!setup.includes('OperationalScoreSnapshots')) fail('Thiếu bảng snapshot điểm theo kỳ.');
if (!code.includes('writeOperationalScoreSnapshot_')) fail('Thiếu bước chốt snapshot điểm khi đóng kỳ.');
if (!code.includes('score_formula_v1')) fail('Snapshot điểm phải có version công thức.');
if (!code.includes('function ensureRuntimeSchema_') || !code.includes('ensureRuntimeSchema_();')) fail('Kho cũ phải tự migration schema hardening khi bootstrap.');
if (!api.includes('operationalScoreSnapshots')) fail('GAS API chưa truyền snapshot điểm về client.');
if (!api.includes('timedDone') || !api.includes('dataQuality')) fail('GAS API chưa truyền đủ chất lượng dữ liệu điểm.');
if (!readme.includes('20 bảng')) fail('README chưa cập nhật schema 20 bảng.');
if (!plan.includes('20 bảng')) fail('planfix chưa cập nhật schema 20 bảng.');

console.log('Reliability hardening contract passed.');
