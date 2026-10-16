import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('js/admin.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const builder = fs.readFileSync('build-gas.mjs', 'utf8');
const guide = fs.readFileSync('docs/USER_IMPORT.md', 'utf8');
const workbookPath = 'templates/mau_nhap_users.xlsx';
const workbook = fs.readFileSync(workbookPath);

assert.ok(workbook.length > 1000, 'A real Excel workbook must be present in templates/');
assert.equal(workbook.subarray(0, 2).toString('ascii'), 'PK', 'The sample must be an XLSX zip package, not renamed TSV text');
assert.match(admin, /USER_IMPORT_COLUMNS\s*=\s*\[/);
assert.match(admin, /readAsArrayBuffer\(file\)/);
assert.match(admin, /X\.read\(reader\.result,\s*\{\s*type:\s*'array'/);
assert.match(admin, /book\.Sheets\.Users\s*\|\|\s*book\.Sheets\[book\.SheetNames\[0\]\]/);
assert.match(admin, /parseImportText\(reader\.result\)/, 'CSV/TSV import compatibility must remain available');
assert.match(admin, /mau_nhap_users\.xlsx/);
assert.match(admin, /LS_USER_IMPORT_TEMPLATE_B64/);
assert.match(builder, /templates',\s*'mau_nhap_users\.xlsx/);
assert.match(builder, /LS_USER_IMPORT_TEMPLATE_B64/);
assert.match(guide, /mau_nhap_users\.xlsx/);

console.log('Excel user-import workbook, download embedding, XLSX parsing, and legacy CSV/TSV compatibility passed.');
