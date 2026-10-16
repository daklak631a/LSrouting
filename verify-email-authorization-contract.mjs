import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const helper = source.match(/function authorizeMailAppScope\(\)\s*\{([\s\S]*?)\n\}/);

assert.ok(helper, 'Code.gs must expose a selectable Apps Script email-scope authorization helper');
assert.match(helper[1], /MailApp\.getRemainingDailyQuota\(\)/, 'authorization must exercise the MailApp send scope');
assert.match(helper[1], /return\s*\{\s*authorized:\s*true\s*\}/, 'helper must return a non-sensitive authorization result');
assert.doesNotMatch(helper[1], /sendEmail|appendRow|\.append\(|\.write\(|newTrigger/, 'authorization must not send mail, write data, or start triggers');
assert.doesNotMatch(helper[1], /return\s+remaining/, 'helper must not expose the remaining quota');

console.log('PASS email authorization only reads MailApp quota; it does not send, write, or start triggers');
