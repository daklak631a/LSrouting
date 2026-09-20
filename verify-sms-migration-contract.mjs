import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('SetupSheetDB.gs', 'utf8');

const required = [
  ['function appendIfMissingRow_', 'idempotent row helper'],
  ['appendIfMissingRow_(channels,', 'SMS channel migration call'],
  ['appendIfMissingRow_(templates,', 'SMS template migration call'],
  ["code: 'SMS'", 'SMS channel defaults'],
  ["code: 'TPL_SMS_HEN_KY'", 'SMS template defaults']
];

for (const [marker, label] of required) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
}

if (!source.includes("'SMS', 'CHUA_KICH_HOAT'")) throw new Error('SMS migration must remain disabled until configured');
if (!source.includes("'NHAP'")) throw new Error('SMS template migration must start as draft');

const context = {};
vm.runInNewContext(source, context);

function fakeSheet(rows) {
  return {
    rows,
    getLastColumn() { return this.rows[0].length; },
    getLastRow() { return this.rows.length; },
    getDataRange() { return { getValues: () => this.rows.map((row) => row.slice()) }; },
    getRange(row, column, rowCount, columnCount) {
      return { setValues: (values) => {
        if (row === this.rows.length + 1 && column === 1 && rowCount === 1 && columnCount === this.rows[0].length) {
          this.rows.push(values[0].slice());
          return;
        }
        throw new Error('Unexpected fake sheet write');
      } };
    }
  };
}

const header = ['code', 'status', 'config_json'];
const existing = fakeSheet([header, ['SMS', 'CHUA_KICH_HOAT', '{}']]);
const report = [];
if (context.appendIfMissingRow_(existing, 'code', 'SMS', { code: 'SMS' }, report, 'kênh')) throw new Error('Existing SMS row was duplicated');
if (existing.rows.length !== 2) throw new Error('Existing SMS row changed');

const missing = fakeSheet([header]);
if (!context.appendIfMissingRow_(missing, 'code', 'SMS', { code: 'SMS', status: 'CHUA_KICH_HOAT' }, report, 'kênh')) throw new Error('Missing SMS row was not added');
if (missing.rows.length !== 2 || missing.rows[1][0] !== 'SMS') throw new Error('SMS row was written incorrectly');
if (context.appendIfMissingRow_(missing, 'code', 'SMS', { code: 'SMS' }, report, 'kênh')) throw new Error('SMS row was duplicated on second run');

console.log('SMS migration contract passed.');
