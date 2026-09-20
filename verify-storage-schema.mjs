import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('SetupSheetDB.gs', 'utf8');
const context = {};
vm.runInNewContext(source, context);

const workTypes = context.legacyWorkTypeRows_();
const units = ['GBS', 'GDT', 'KHCN1', 'KHCN2', 'PGD_TBM', 'PGD_DBM', 'PGD_BMT', 'PGD_NBM'];

if (workTypes.length !== 29) throw new Error(`Expected 29 legacy work types, got ${workTypes.length}`);
if (!units.every((unit) => source.includes(`['${unit}'`))) throw new Error('A legacy sending unit is missing');
if (!source.includes('function createStorageWorkbook()')) throw new Error('Storage workbook creator is missing');
if (Object.keys(context.SCHEMA).length !== 18) throw new Error('Expected 18 storage sheets');
if (!context.SCHEMA.NotificationMetrics || !context.SCHEMA.NotificationMetrics.includes('unit_cost')) throw new Error('Notification metrics schema is missing');
if (!source.includes("['SMS'")) throw new Error('SMS channel seed is missing');
if (!context.SCHEMA.CatalogOptions || !context.SCHEMA.CatalogOptions.includes('source_tab')) throw new Error('Source dropdown schema is missing');
if (!context.SCHEMA.WorkItems.includes('source_stt')) throw new Error('Source STT field is missing');
if (!source.includes('Trần Thị Lệ Trang') || !source.includes('Nguyễn Vy') || !source.includes('Lưu Trà Mai')) {
  throw new Error('Source VRM/PRM dropdown snapshot is incomplete');
}
if (!source.includes("function sourceCatalogRows_()")) throw new Error('Source dropdown seeder is missing');

console.log(`Schema check passed: ${workTypes.length} work types, ${units.length} sending units, ${Object.keys(context.SCHEMA).length} storage sheets.`);
