import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const schema = read('SetupSheetDB.gs');
const server = read('Code.gs');
const api = read('js/gas-api.js');
const screens = read('js/screens.js');
const domain = read('js/domain.js');

if (!schema.includes('MonthlyPlans:')) throw new Error('Monthly plan storage schema is missing.');
if (!/MonthlyPlans:\s*\[[\s\S]*period_id[\s\S]*activation_at[\s\S]*spreadsheet_id[\s\S]*status/.test(schema)) {
  throw new Error('Monthly plan storage does not retain identity, workbook link, activation time, and state.');
}
if (!/Requests:\s*\[[\s\S]*period_id/.test(schema) || !/WorkItems:\s*\[[\s\S]*period_id[\s\S]*carryover_from_item_id/.test(schema)) {
  throw new Error('Requests and work items are not scoped to a monthly plan with carryover lineage.');
}
if (!server.includes('function createNextMonthlyPlan') || !server.includes('function activateDueMonthlyPlans_') || !server.includes('function activateMonthlyPlans')) {
  throw new Error('The server cannot prepare and activate monthly plans.');
}
if (!schema.includes('function installMonthlyPlanTrigger') || !schema.includes("newTrigger('activateMonthlyPlans')")) {
  throw new Error('Automatic monthly activation trigger is missing.');
}
if (!server.includes('function createMonthlyPlanWorkbook_') || !server.includes('function syncMonthlyPlanWorkbook_')) {
  throw new Error('The server does not create and synchronize the monthly plan workbook.');
}
if (!server.includes('function repairMonthlySummaryFormulas_') || !server.includes('$Q$49=0')) {
  throw new Error('Monthly summary formulas are not guarded against zero denominators.');
}
if (!server.includes('DriveApp.getFileById') || !schema.includes('source_template_spreadsheet_id')) {
  throw new Error('Monthly workbook creation does not preserve the configured source template.');
}
if (!server.includes('carryover_from_item_id') || !server.includes('CHUYEN_TIEP_THANG')) {
  throw new Error('Open work cannot be carried forward with an immutable lineage event.');
}
if (!server.includes('activePlan_') || !server.includes("period_id: activePlan.period_id")) {
  throw new Error('New work is not bound to the active monthly plan.');
}
if (!api.includes('createNextMonthlyPlan') || !api.includes('monthlyPlans')) {
  throw new Error('The browser API does not expose monthly plans.');
}
if (!screens.includes('function periods') || !screens.includes('create-next-monthly-plan')) {
  throw new Error('The KS/Admin period history and create-plan controls are missing.');
}
if (!read('js/app.js').includes('st().activePlan')) throw new Error('All roles must see the active monthly plan in the app shell.');
if (!domain.includes("'periods'")) throw new Error('KS/Admin navigation does not expose period history.');

console.log('Monthly plan lifecycle contract passed.');
