import fs from 'node:fs';
import vm from 'node:vm';

const setupSource = fs.readFileSync('SetupSheetDB.gs', 'utf8');
const setup = {};
vm.runInNewContext(setupSource, setup);
const rows = setup.legacyWorkTypeRows_();

const expectedGroups = ['Món', 'HM SXKD', 'Thấu chi', 'Thẻ tín dụng', 'TSĐB', 'Khác'];
const expectedProducts = [
  'Món - Vay mới TSĐB- Tiêu dùng',
  'Món- Vay lại TSĐB- Tiêu dùng',
  'Món- Vay mới SXKD',
  'Món- Vay lại SXKD',
  'Món- Nhà ở - Vay mới',
  'Món- Nhà ở - Vay lại',
  'Món -Nhà ở - GN tiến độ/ tăng thêm',
  'Món- Ôtô- Vay mới',
  'Món- Cho vay/HMTC cầm cố STK/TG',
  'Món - Vay mới Tín chấp (Lương....)',
  'Món - Vay lại Tín chấp (Lương....)',
  'HM SXKD- Mới- Khởi tạo HM',
  'HM SXKD- Giải ngân từng lần',
  'Thấu chi - Vay mới- Tiêu dùng',
  'Thấu chi - Vay mới- SXKD',
  'Thấu chi - Vay mới- Tín chấp',
  'Thấu chi - Tái cấp- Tiêu dùng',
  'Thấu chi - Tái cấp- SXKD',
  'Thấu chi - Tái cấp- Tín chấp',
  'Thẻ tín dụng - Có TSĐB',
  'Thẻ tín dụng - Tín chấp',
  'ĐC Nhập tăng TSĐB/ Ký lại PLHD',
  'ĐC Xuất giảm TSĐB/ Ký lại PLHD',
  'Xuất TSĐB/ Xóa thế chấp',
  'Thay đổi TSĐB (Đổi GCN QSDD, Hoàn công,,,)',
  'Nhập mới/ Nhập thêm TSĐB/ ĐKTC',
  'Mượn TSĐB',
  'Thủ tục TSĐB khác',
  'Công việc tín dụng khác'
];

if (rows.length !== expectedProducts.length) throw new Error(`Expected ${expectedProducts.length} GAS work types, got ${rows.length}`);
if (rows.map((row) => row[2]).join('|') !== expectedProducts.join('|')) throw new Error('GAS work type/product catalog does not match the approved list');
if (!expectedGroups.every((group) => rows.some((row) => row[1] === group))) throw new Error('A work type group is missing from GAS catalog');

const domainSource = fs.readFileSync('js/domain.js', 'utf8');
if (!domainSource.includes("'LEGACY_29'")) throw new Error('Demo domain catalog is not synchronized to all 29 work types');
if (!domainSource.includes("['LEGACY_12', 'HM SXKD'")) throw new Error('Demo domain catalog is missing the HM SXKD group');
if (!domainSource.includes("['LEGACY_22', 'TSĐB'")) throw new Error('Demo domain catalog is missing the TSĐB group');

const screensSource = fs.readFileSync('js/screens.js', 'utf8');
if (!screensSource.includes("function wtLabel(w)")) throw new Error('Work type selectors do not have a shared type/product label');
if (!screensSource.includes("wtLabel(w)")) throw new Error('Work type selectors do not show type and product together');
if (!screensSource.includes('function workTypeGroups()')) throw new Error('Work type and product are not separated into dependent selectors');
if (!screensSource.includes('function syncProductOptions(')) throw new Error('Product selector is not filtered by work type');
if (!screensSource.includes("ui.field('Loại việc', ui.select('wg_")) throw new Error('New request form still uses a product as the work type selector');
if (!screensSource.includes('customer-fields')) throw new Error('Customer fields are not marked for one-row layout');
if (screensSource.includes("ui.input('requestor_display'") || screensSource.includes("ui.input('unit_display'")) throw new Error('Logged-in staff and unit are redundantly shown in the new request form');
const appSource = fs.readFileSync('js/app.js', 'utf8');
if (!appSource.includes('S.syncProductOptions')) throw new Error('Work type change does not refresh the product selector');

const coreSource = fs.readFileSync('js/core.js', 'utf8');
if (!coreSource.includes("p.workTypes.some(function (w) { return w.code === 'LEGACY_29'; })")) throw new Error('Old browser cache is not migrated to the 29-product catalog');

console.log('Work type catalog contract passed: 29 products, grouped labels, demo/GAS parity.');
