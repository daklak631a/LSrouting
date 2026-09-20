import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const core = read('js/core.js');
const domain = read('js/domain.js');
const app = read('js/app.js');
const screens = read('js/screens.js');
const domainSource = read('js/domain.js');
const gasApi = read('js/gas-api.js');
const server = read('Code.gs');

// Apps Script uses ordinary V8 syntax; parse it independently of the Node extension rule for .gs.
vm.runInNewContext(server, {});

if (!fs.existsSync('js/gas-api.js')) throw new Error('Missing GAS browser adapter.');
if (!core.includes('replace: replace') || !core.includes('setBackend: setBackend')) {
  throw new Error('Core store cannot be replaced by the authoritative GAS snapshot.');
}
if (!app.includes('LS.api.bootstrap')) throw new Error('Application startup does not load the GAS snapshot.');
if (!screens.includes('LS.api.createRequest') || !screens.includes('LS.api.transitionItem')) {
  throw new Error('Operational forms are still not connected to the GAS API.');
}
if (!server.includes('function adminSaveCatalog') || !server.includes('function adminSaveDelivery') || !server.includes('function adminRunOutbox')) {
  throw new Error('GAS administration endpoints are incomplete.');
}
if (server.includes('setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)')) {
  throw new Error('Web app must not allow arbitrary iframe embedding.');
}

const ctx = { LS: {} };
vm.runInNewContext(domain, ctx);
const flow = ctx.LS.domain.FLOW;
if (!(flow.DA_SOAN_XONG || []).some((step) => step.to === 'HOAN_THANH_LS' && step.roles.includes('CAN_BO_LS')) ||
    !(flow.DANG_HEN_KH || []).some((step) => step.to === 'HOAN_THANH_LS' && step.roles.includes('CAN_BO_LS'))) {
  throw new Error('Client flow does not expose direct LS completion.');
}
if (!/DA_SOAN_XONG:[\s\S]*HOAN_THANH_LS: \['CAN_BO_LS'\]/.test(server) ||
    !/DANG_HEN_KH:[\s\S]*HOAN_THANH_LS: \['CAN_BO_LS'\]/.test(server)) {
  throw new Error('Server flow does not allow LS to record final completion.');
}
['DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'].forEach((status) => {
  const start = server.indexOf(status + ': {');
  const end = server.indexOf('\n  },', start);
  const block = start >= 0 && end >= 0 ? server.slice(start, end) : '';
  if (!block.includes("DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS']")) {
    throw new Error('Server flow does not allow reassignment from ' + status + '.');
  }
});
if (!server.includes('function dueAt_') || !server.includes('fields.due_at = dueAt_(t, ts, slaHours)')) {
  throw new Error('Server does not calculate SLA due dates from the working calendar.');
}
if (!server.includes('CatalogOptions')) throw new Error('GAS schema/server must expose source-aligned dropdown catalog.');
if (!server.includes('source_stt')) throw new Error('GAS work items must preserve source STT.');
if (!server.includes('catalogOptions')) throw new Error('Bootstrap must return source-aligned dropdown catalog.');
if (!server.includes('catalogOption')) throw new Error('Admin catalog API must support dropdown entries.');
if (!gasApi.includes('catalogOptions')) throw new Error('Client bootstrap must retain dropdown catalog.');
if (!screens.includes('requestor: { id: u && u.user_id') || !screens.includes('u.user_id')) {
  throw new Error('Request screen must bind requestor to the signed-in user.');
}
if (screens.includes('name="kind"') || screens.includes('name="requestor_id"')) {
  throw new Error('Request screen must not ask users to choose customer kind or requestor.');
}
if (!screens.includes("var kind = cif ? 'DA_CO_CIF' : 'KH_MOI'")) {
  throw new Error('Request screen must derive customer kind from CIF presence.');
}
if (!server.includes("var requestorId = u.user_id") || !server.includes("var kind = cif ? 'DA_CO_CIF' : 'KH_MOI'")) {
  throw new Error('GAS must derive requestor and customer kind from authenticated data.');
}
if (!server.includes("DA_PHAN_CONG: ['KS_LS', 'QUAN_LY_LS']") ||
    (!domainSource.includes("label: 'Tiếp nhận'") && !domainSource.includes("label: 'Tiếp nhận và phân công'"))) {
  throw new Error('Initial intake must open the LS assignment flow directly.');
}
if (!screens.includes('catalogOptions')) throw new Error('Request screen must use source dropdown catalog.');
if (!fs.existsSync('js/admin.js') || !read('js/admin.js').includes('catalogOption')) {
  throw new Error('Admin screen must expose dropdown catalog management.');
}
if (!server.includes('priority_flags_json') || !gasApi.includes('priority_flags_json') || !screens.includes('priority_vip')) {
  throw new Error('Customer priority labels must persist through GAS and the request form.');
}
if (!screens.includes('function performanceReport') || !screens.includes("['day', 'Ngày']") || !screens.includes("['range', 'Khoảng ngày']")) {
  throw new Error('Board must expose day/week/month/year/range performance reporting.');
}
if (!screens.includes('assignmentRecommendation') || !read('js/admin.js').includes('ASSIGNMENT_RULE')) {
  throw new Error('Quick assignment must use editable Admin responsibility rules.');
}
if (!domainSource.includes("ADMIN: { label: 'Quản trị hệ thống', nav: ['admin', 'board', 'report', 'periods', 'audit'] }")) {
  throw new Error('Admin must be able to open the operational board.');
}
if (!screens.includes('queueTabs') || !screens.includes('function paginate') || !screens.includes('function roomBoard')) {
  throw new Error('Queue and PGD views must expose multipage lists and a room dashboard.');
}
if (!domainSource.includes("short: 'Toàn bộ phòng'") || !domainSource.includes("short: 'Dashboard phòng'")) {
  throw new Error('PGD navigation must include room-wide list and dashboard screens.');
}

console.log('GAS contract check passed.');
