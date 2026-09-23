import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const css = read('css/styles.css');
const api = read('js/gas-api.js');
const admin = read('js/admin.js');
const app = read('js/app.js');
const screens = read('js/screens.js');
const ui = read('js/ui.js');

// Mobile is the primary operating surface: controls must be finger-sized and
// text inputs must be at least 16px so Android browsers do not zoom on focus.
['--tap: 48px;', 'font-size: 16px;', '.dashboard-tab { min-height: 44px;', '.btn-sm { min-height: 44px;', '.chip > span { min-height: 44px;'].forEach((rule) => {
  if (!css.includes(rule)) throw new Error('Thiếu chuẩn mobile cho điều khiển: ' + rule);
});
if (!/\.tabbar\s*\{[^}]*height:\s*68px;/.test(css)) {
  throw new Error('Thanh điều hướng mobile chưa đủ cao để thao tác.');
}

if (!css.includes('.auth-side { min-height: 100dvh;') || !css.includes('.password-toggle { right: .5rem; width: 48px; height: 48px;')) {
  throw new Error('Màn đăng nhập chưa được bố trí lại cho chiều cao điện thoại.');
}

// Mobile login is a focused app screen, not a narrowed desktop split layout.
['.auth-mobile-brand', 'min-height: 60px;', 'min-height: 64px;', 'font-size: 2.125rem;', 'border-radius: 30px;', 'grid-template-columns: 1fr;'].forEach((rule) => {
  if (!css.includes(rule)) throw new Error('Thiếu bề mặt đăng nhập mobile lớn, tập trung: ' + rule);
});
if (!app.includes('class="auth-mobile-brand"')) {
  throw new Error('Màn đăng nhập mobile chưa có nhận diện nằm trong thẻ đăng nhập.');
}

// Role workspaces use information-specific mobile cards instead of forcing every
// desktop table into the same tall vertical stack.
['mobile-record-table', 'audit-table', 'dashboard-metric-table', '.viz-title { font-size: 1rem;', '.viz-cols { height: 224px;', 'flex: 0 0 72px; min-width: 72px;'].forEach((rule) => {
  if (!css.includes(rule)) throw new Error('Thiếu nhịp đọc mobile cho màn hình nghiệp vụ: ' + rule);
});
if (!ui.includes("var tableClass = emptyOpts") || !screens.includes("tableClass: 'mobile-record-table'") ||
    !screens.includes("tableClass: 'audit-table'") || !screens.includes("tableClass: 'dashboard-metric-table'")) {
  throw new Error('Các bảng của từng vai trò chưa được gắn kiểu hiển thị mobile phù hợp.');
}

// A blank, undefined, or malformed score must never reach the management UI as NaN.
if (!api.includes('function finiteNumberOrNull(value)')) {
  throw new Error('Adapter GAS chưa chuẩn hoá số điểm không hợp lệ.');
}
if (!api.includes('score: finiteNumberOrNull(x.score)')) {
  throw new Error('Scorecard từ GAS vẫn có thể đưa NaN vào giao diện.');
}
if (!admin.includes('function finiteScore(value)') || !admin.includes('var score = finiteScore(x.score);')) {
  throw new Error('Trang quản trị chưa chặn phòng thủ giá trị điểm không hợp lệ.');
}

console.log('Mobile layout and finite-score contract passed.');
