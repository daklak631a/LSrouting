import fs from 'node:fs';
import assert from 'node:assert/strict';

const screens = fs.readFileSync('js/screens.js', 'utf8');
const domain = fs.readFileSync('js/domain.js', 'utf8');
const server = fs.readFileSync('Code.gs', 'utf8');

assert.doesNotMatch(screens, /Xác nhận việc phải làm/);
assert.doesNotMatch(screens, /ui\.checkbox\('cl_/);
assert.doesNotMatch(screens, /tr\.checklist/);
assert.doesNotMatch(domain, /checklist: true/);
assert.doesNotMatch(server, /Cần hoàn tất toàn bộ danh sách việc phải làm/);

console.log('No checklist confirmation contract passed.');
