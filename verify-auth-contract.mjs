import fs from 'node:fs';
import vm from 'node:vm';
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
assert.match(app, /Mã cán bộ \/ user/);
assert.match(app, /LS\.api\.authenticate/);
assert.match(app, /LS\.api\.bootstrap\(\)\.then\(function \(snapshot\)/, 'F5 must restore this browser session before showing login');
assert.match(app, /LS\.api\.hasSession\(\)/, 'Without a stored token the login form must show immediately');
assert.match(app, /function restoreSession\(\)/, 'Session restoration must be retryable without re-entering credentials');
assert.match(app, /'restore-session': restoreSession/, 'Restore screen must provide an explicit retry action');
assert.match(app, /if \(!LS\.api\.hasSession\(\)\) \{ root\.innerHTML = authView\(\); return; \}/,
  'Only a cleared/expired session should return to login after bootstrap failure');
assert.doesNotMatch(app, /\.catch\(function \(\) \{ root\.innerHTML = authView\(\); \}\)/,
  'Transient bootstrap failures must not look like logout');

const restoreStart = app.indexOf('  function restoreSession()');
const restoreEnd = app.indexOf('  function passwordView(', restoreStart);
assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'Restore function must be isolated for behavior testing');
let hasSession = true;
const restoreContext = {
  LS: { api: { hasSession: () => hasSession, bootstrap: () => Promise.reject(new Error('temporary network failure')) } },
  U: { replace() {} }, S: { resetFilters() {} }, root: { innerHTML: '' },
  authView: () => 'LOGIN_VIEW', sessionRestoreErrorView: () => 'RETRY_VIEW',
  current: 'queue', lastRefresh: 0, render() {}
};
const restoreSession = vm.runInNewContext('(' + app.slice(restoreStart, restoreEnd).trim() + ')', restoreContext);
await restoreSession();
assert.equal(restoreContext.root.innerHTML, 'RETRY_VIEW', 'Network failure with a session must show retry, not login');
assert.equal(hasSession, true, 'Network failure must preserve the browser session');
hasSession = false;
await restoreSession();
assert.equal(restoreContext.root.innerHTML, 'LOGIN_VIEW', 'Expired session must return to login');

assert.match(api, /read\('authenticateUser'/);
assert.match(api, /\.api\(\{ name: name, args: args \|\| \[\], token: getToken\(\), op_id: opId \|\| '' \}\)/,
  'Every browser call must go through the api() gateway with its own session token');
assert.match(admin, /Nhập Excel\/CSV/);
assert.match(admin, /LS\.api\.importUsers/);
// The deploying account's UserProperties is ONE store shared by every visitor.
assert.doesNotMatch(code, /getUserProperties\(\)\.(setProperty|getProperty)\('LS_AUTH_USER_ID'/,
  'Business identity must never come from the shared UserProperties slot');

// Behaviour: two people logged in at once keep their own identity.
const props = new Map(), cache = new Map();
let uuid = 0, runs = 0;
const users = [
  { user_id: 'PGD_A', login_code: 'PGD_A', full_name: 'A', role: 'PHONG_PGD', unit_id: 'U1', is_active: true },
  { user_id: 'PGD_B', login_code: 'PGD_B', full_name: 'B', role: 'PHONG_PGD', unit_id: 'U2', is_active: true }
];
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, v),
    deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null,
    put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Utilities: { getUuid: () => { uuid++; return ('0000000' + uuid.toString(16)).slice(-8) + '-aaaa-bbbb-cccc-dddddddddddd'; }, sleep() {} },
  Session: { getActiveUser: () => ({ getEmail: () => '' }) },
  DataRepository: { getAll: () => users.slice(), find: (t, k, v) => users.find(u => u[k] === v) || null },
  Math
};
vm.runInNewContext(code, ctx);
ctx.getBootstrap = () => ({ who: ctx.currentUser_().user_id });
ctx.markInboxRead = () => { runs++; return { ok: true, who: ctx.currentUser_().user_id, run: runs }; };

const a = ctx.api({ name: 'authenticateUser', args: ['PGD_A', ''] });
const b = ctx.api({ name: 'authenticateUser', args: ['PGD_B', ''] });
assert.match(a.session_token, /^[a-f0-9]{64}$/);
assert.notEqual(a.session_token, b.session_token);
assert.equal(ctx.api({ name: 'getBootstrap', token: a.session_token }).who, 'PGD_A', 'A must stay A after B logs in');
assert.equal(ctx.api({ name: 'getBootstrap', token: b.session_token }).who, 'PGD_B');
assert.throws(() => ctx.api({ name: 'getBootstrap', token: 'f'.repeat(64) }), /LS_SESSION/);
assert.throws(() => ctx.api({ name: 'noSuchFunction' }), /không hợp lệ/);

// A retried write with the same op_id replays the stored result instead of writing again.
const first = ctx.api({ name: 'markInboxRead', token: a.session_token, op_id: 'op_retry_1' });
const again = ctx.api({ name: 'markInboxRead', token: a.session_token, op_id: 'op_retry_1' });
assert.equal(runs, 1, 'Same op_id must run once');
assert.equal(again.run, first.run);
assert.equal(again.replayed, true);
ctx.api({ name: 'markInboxRead', token: b.session_token, op_id: 'op_retry_1' });
assert.equal(runs, 2, 'op_id is scoped per session');

// A failed write releases its op_id so the retry can run.
let fail = true;
ctx.markInboxRead = () => { if (fail) { fail = false; throw new Error('LS_BUSY: bận'); } return { ok: true }; };
assert.throws(() => ctx.api({ name: 'markInboxRead', token: a.session_token, op_id: 'op_retry_2' }), /LS_BUSY/);
assert.equal(ctx.api({ name: 'markInboxRead', token: a.session_token, op_id: 'op_retry_2' }).ok, true);

// Logout ends only that browser's session.
ctx.api({ name: 'logoutUser', token: a.session_token });
assert.throws(() => ctx.api({ name: 'getBootstrap', token: a.session_token }), /LS_SESSION/);
assert.equal(ctx.api({ name: 'getBootstrap', token: b.session_token }).who, 'PGD_B');

console.log('Auth contract check passed.');
