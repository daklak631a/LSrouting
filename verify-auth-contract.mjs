import fs from 'node:fs';
import assert from 'node:assert/strict';

const code = fs.readFileSync('Code.gs', 'utf8');
const setup = fs.readFileSync('SetupSheetDB.gs', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const api = fs.readFileSync('js/gas-api.js', 'utf8');
const admin = fs.readFileSync('js/admin.js', 'utf8');

assert.match(setup, /login_code/);
assert.match(setup, /password_hash/);
assert.match(setup, /appendIfMissingRow_\(users, 'user_id', 'ADMIN'/);
assert.match(code, /function authenticateUser\(loginCode, password\)/);
assert.match(code, /D@kl@k631/);
assert.match(code, /D@klak631/);
assert.match(code, /function adminImportUsers\(rows\)/);
assert.match(code, /PropertiesService\.getUserProperties\(\)/);
assert.match(app, /Mã cán bộ \/ user/);
assert.match(app, /LS\.api\.authenticate/);
assert.match(api, /call\('authenticateUser'/);
assert.match(admin, /Nhập Excel\/CSV/);
assert.match(admin, /LS\.api\.importUsers/);

console.log('Auth contract check passed.');
