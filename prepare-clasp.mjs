/**
 * Kiểm tra máy đã sẵn sàng `clasp push` chưa, và nói rõ còn thiếu bước nào.
 *
 * Không đụng vào file thông tin đăng nhập: đó là credential của người dùng,
 * ghi đè nó có thể làm hỏng công cụ khác đang dùng cùng file.
 *
 *   node prepare-clasp.mjs              kiểm tra
 *   node prepare-clasp.mjs <scriptId>   tạo luôn .clasp.json rồi kiểm tra
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ok = (m) => console.log('  [ok]    ' + m);
const warn = (m) => console.log('  [thiếu] ' + m);
const info = (m) => console.log('          ' + m);

let blocking = 0;

console.log('\nKiểm tra sẵn sàng đẩy mã lên Apps Script\n');

/* 1. clasp */
let claspVersion = '';
try {
  claspVersion = execSync('clasp --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  ok('clasp ' + claspVersion);
} catch {
  warn('chưa cài clasp');
  info('npm install -g @google/clasp@2.4.2');
  blocking += 1;
}
const major = Number(String(claspVersion).split('.')[0] || 0);

/* 2. Thông tin đăng nhập */
const rcPath = path.join(os.homedir(), '.clasprc.json');
if (!fs.existsSync(rcPath)) {
  warn('chưa đăng nhập clasp');
  info('clasp login');
  blocking += 1;
} else {
  let rc = {};
  try { rc = JSON.parse(fs.readFileSync(rcPath, 'utf8')); } catch { /* file hỏng */ }
  const v3 = !!rc.tokens;
  const v2 = !!rc.token;

  if (v2 && major === 2) ok('thông tin đăng nhập khớp clasp 2.x');
  else if (v3 && major >= 3) ok('thông tin đăng nhập khớp clasp 3.x');
  else if (v3 && major === 2) {
    warn('file đăng nhập ở định dạng clasp 3.x nhưng clasp đang cài là 2.x');
    info('Hai bản đọc file này khác nhau nên clasp 2.x không lấy được token.');
    info('Sao lưu rồi đăng nhập lại bằng bản 2.x:');
    info('  cp "' + rcPath + '" "' + rcPath + '.v3.bak" && clasp login');
    info('Hoặc chuyển hẳn sang clasp 3.x — khi đó sửa @google/clasp@2.4.2 trong');
    info('.github/workflows/deploy-gas.yml và README cho khớp.');
    blocking += 1;
  } else if (v2 && major >= 3) {
    warn('file đăng nhập ở định dạng clasp 2.x nhưng clasp đang cài là 3.x');
    info('  cp "' + rcPath + '" "' + rcPath + '.v2.bak" && clasp login');
    blocking += 1;
  } else {
    warn('không đọc được định dạng file đăng nhập');
    info('clasp login');
    blocking += 1;
  }
}

/* 3. .clasp.json */
const scriptIdArg = process.argv[2];
if (scriptIdArg && !fs.existsSync('.clasp.json')) {
  fs.writeFileSync('.clasp.json', JSON.stringify({ scriptId: scriptIdArg, rootDir: '.' }, null, 2) + '\n');
  ok('đã tạo .clasp.json cho scriptId ' + scriptIdArg);
}
if (!fs.existsSync('.clasp.json')) {
  warn('chưa có .clasp.json');
  info('Chưa có dự án Apps Script nào thì tạo thẳng từ dòng lệnh:');
  info('  clasp create --type standalone --title "LS-Routing" --rootDir .');
  info('Đã có dự án rồi thì lấy scriptId ở Apps Script → Project Settings → IDs:');
  info('  node prepare-clasp.mjs <scriptId>');
  info('Đừng tạo dự án mới nếu bản cũ đang chạy: URL web app sẽ đổi.');
  info('Đừng dùng `clasp clone`: lệnh đó kéo mã cũ trên Apps Script về đè lên repo.');
  blocking += 1;
} else {
  const cfg = JSON.parse(fs.readFileSync('.clasp.json', 'utf8'));
  if (!cfg.scriptId) { warn('.clasp.json thiếu scriptId'); blocking += 1; }
  else ok('.clasp.json trỏ tới ' + cfg.scriptId);
  if (cfg.rootDir && cfg.rootDir !== '.') {
    warn('rootDir đang là "' + cfg.rootDir + '"; .claspignore viết theo gốc repo nên phải là "."');
    blocking += 1;
  }
}

/* 4. Những file sẽ được đẩy lên */
const expected = ['appsscript.json', 'Code.gs', 'DataRepository.gs', 'Notifications.gs', 'SetupSheetDB.gs', 'Index.gas.html'];
const missing = expected.filter((f) => !fs.existsSync(f));
if (missing.length) { warn('thiếu file: ' + missing.join(', ')); blocking += 1; }
else ok('đủ 6 file sẽ đẩy lên: ' + expected.join(', '));

/* 5. Bản build phải khớp mã nguồn */
try {
  const before = fs.readFileSync('Index.gas.html', 'utf8');
  execSync('node build-gas.mjs', { stdio: 'ignore' });
  const after = fs.readFileSync('Index.gas.html', 'utf8');
  if (before === after) ok('Index.gas.html đã khớp js/');
  else {
    warn('Index.gas.html chưa dựng lại — vừa dựng lại giúp bạn, nhớ commit');
    info('Đẩy bản cũ lên Apps Script nghĩa là chạy mã không khớp kho mã.');
  }
} catch {
  warn('không chạy được build-gas.mjs');
  blocking += 1;
}

/* 6. doGet phải trỏ đúng tên file HTML sau khi clasp đổi tên */
const doGet = fs.readFileSync('Code.gs', 'utf8');
if (doGet.includes("createHtmlOutputFromFile('Index.gas')")) {
  ok("doGet gọi 'Index.gas' — khớp tên Index.gas.html sau khi clasp đẩy lên");
} else {
  warn('doGet không trỏ tới Index.gas; kiểm tra lại tên file HTML');
  blocking += 1;
}

console.log('');
if (blocking) {
  console.log('Còn ' + blocking + ' việc phải làm trước khi `clasp push`.\n');
  process.exit(1);
}
console.log('Sẵn sàng. Chạy:  clasp push\n');
console.log('Sau lần đẩy đầu tiên, trong Apps Script chạy lần lượt:');
console.log('  createStorageWorkbook()   tạo kho 18 bảng dữ liệu');
console.log('  setupSheetDB()            bổ sung cột và danh mục còn thiếu');
console.log('  setupFirstMonthlyPlan()   dựng kỳ kế hoạch tháng hiện tại\n');
