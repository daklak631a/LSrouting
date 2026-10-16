import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = f => fs.readFileSync(f, 'utf8');
const ctx = {};
vm.runInNewContext(read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//)[1], ctx);
vm.runInNewContext(read('Code.gs'), ctx);
let actor = { user_id: 'LS1', role: 'CAN_BO_LS', unit_id: 'U1' };
const now = '2026-09-29T10:00:00+07:00';
const base = { period_id: 'P', request_id: 'R', status: 'DA_SOAN_XONG', assigned_user_id: 'LS1', version: 2,
  occurrence_date: '2026-09-28', work_type_code: 'W', product_name: 'Vay',
  processing_started_at: '2026-09-28T08:00:00+07:00', completed_at: '',
  pause_log_json: JSON.stringify([['2026-09-28T09:00:00+07:00', now]]) };
const items = [{ ...base, item_id: 'A', submitted_at: '2026-09-01T07:00:00+07:00' },
  { ...base, item_id: 'B' }, { ...base, item_id: 'C', status: 'HOAN_THANH_LS', dossier_received_at: '2026-09-28T07:30:00+07:00' },
  { ...base, item_id: 'FOREIGN', assigned_user_id: 'LS2', request_id: 'R2' },
  { ...base, item_id: 'OLD', carried_to_item_id: 'A' }];
const events = [{ event_id: 'EA', item_id: 'A', type: 'TAO_VIEC', by: 'PGD', at: base.processing_started_at, after_json: JSON.stringify({ submitted_at: base.processing_started_at }) },
  { event_id: 'EB', item_id: 'B', type: 'CHO_TIEP_NHAN', by: 'PGD', at: '2026-09-28T07:30:00+07:00', after_json: JSON.stringify({ dossier_received_at: '2026-09-28T07:30:00+07:00' }) },
  { event_id: 'EC', item_id: 'C', type: 'HOAN_THANH_LS', by: 'LS1', at: '2026-09-28T09:00:00+07:00', after_json: '{}' }];
const tables = { WorkItems: items, Events: events, MonthlyPlans: [{ period_id: 'P', status: 'ACTIVE' }],
  Requests: [{ request_id: 'R', unit_id: 'U1' }, { request_id: 'R2', unit_id: 'U2' }],
  Users: [{ user_id: 'LS1', role: 'CAN_BO_LS' }, { user_id: 'LS2', role: 'CAN_BO_LS' }],
  Settings: [], WorkTypes: [{ type_code: 'W', sla_hours: 8 }], NotificationOutbox: [] };
const transaction = { rows: n => tables[n] || [], find: (n, k, v) => { const object = (tables[n] || []).find(r => r[k] === v); return object ? { object } : null; },
  write: (found, fields) => Object.assign(found.object, fields), append: (n, row) => (tables[n] ||= []).push(row) };
ctx.DataRepository = { getAll: n => tables[n] || [], find: (n,k,v) => transaction.find(n,k,v)?.object,
  tx: fn => fn(transaction), tailWhere: (n, limit, match) => ({ rows: (tables[n] || []).filter(match).slice(-limit).reverse(), exhausted: true, nextBeforeRow: 1 }) };
ctx.currentUser_ = () => actor; ctx.requireActor_ = () => actor; ctx.stamp_ = () => now;
ctx.id_ = () => 'NEW_EVENT'; ctx.writePeriodSummary_ = () => {}; ctx.syncMonthlyPlanWorkbook_ = () => {};

assert.equal(typeof ctx.getTimingAudit, 'function', 'On-demand timing audit API required');
const audit = ctx.getTimingAudit();
assert.equal(audit.rows.length, 3, 'Exclude foreign assignments and old carryover rows');
assert.ok(audit.rows.find(r => r.item_id === 'A').problems.includes('MISSING_HANDOFF'));
assert.equal(audit.rows.find(r => r.item_id === 'A').suggestions.dossier_received_at, undefined, 'Request creation must never be inferred as handoff');
assert.equal(audit.rows.find(r => r.item_id === 'B').suggestions.dossier_received_at, '2026-09-28T00:30:00.000Z');
assert.equal(audit.rows.find(r => r.item_id === 'C').suggestions.completed_at, '2026-09-28T02:00:00.000Z');
assert.equal(items[0].dossier_received_at, undefined, 'Audit is read-only');
const chronology={...base,item_id:'CHRONOLOGY',status:'HOAN_THANH_LS',dossier_received_at:'2026-09-28T09:00:00+07:00',
  processing_started_at:'2026-09-28T10:00:00+07:00',completed_at:'2026-09-28T11:00:00+07:00',
  processing_sessions_json:JSON.stringify([{user_id:'LS1',start:'2026-09-28T08:00:00+07:00',end:'2026-09-28T08:30:00+07:00'}])};
items.push(chronology);
assert.ok(ctx.getTimingAudit().rows.find(r=>r.item_id==='CHRONOLOGY')?.problems.includes('INVALID_ORDER'), 'Receipt after a saved earlier processing session must be flagged');
assert.throws(()=>ctx.correctItemTimes('CHRONOLOGY',{dossier_received_at:chronology.dossier_received_at,completed_at:chronology.completed_at},'Rà lại mốc',2),/trước.*phiên|trước.*xử lý/);
assert.equal(chronology.version,2,'Rejected chronology correction must not write');
items.pop();
const future={...base,item_id:'FUTURE',dossier_received_at:'2026-09-30T08:00:00+07:00',processing_started_at:'',pause_log_json:'[]'};
items.push(future);
assert.ok(ctx.getTimingAudit().rows.find(r=>r.item_id==='FUTURE')?.problems.includes('INVALID_ORDER'),'Future receipt must be flagged');
items.pop();
assert.throws(() => ctx.confirmLegacySessionOwner('A', 'LS1', '', 2), /lý do/i);
assert.throws(() => ctx.confirmLegacySessionOwner('A', 'LS2', 'Xác nhận', 2), /quyền|chính mình/i);
assert.throws(() => ctx.confirmLegacySessionOwner('A', 'LS1', 'Xác nhận', 1), /cập nhật|phiên bản/i);
const before = ctx.LSTiming.metrics(items[0], {}, now).xu_ly;
ctx.confirmLegacySessionOwner('A', 'LS1', 'Tôi xác nhận phiên này do mình xử lý', 2);
assert.equal(ctx.LSTiming.metrics(items[0], {}, now).xu_ly, before, 'Owner confirmation must preserve measured time');
assert.equal(ctx.LSTiming.sessions(items[0], now)[0].user_id, 'LS1');
assert.equal(items[0].version, 3);
assert.equal(events.at(-1).type, 'XAC_NHAN_NGUOI_XU_LY');
assert.ok(JSON.parse(events.at(-1).before_json).processing_started_at);
assert.throws(() => ctx.confirmLegacySessionOwner('A', 'LS1', 'Lặp lại', 3), /không.*phiên|đã xác định/i);

const mixed = { ...base, item_id: 'MIXED', processing_sessions_json: JSON.stringify([
  { user_id:'LS2',start:'2026-09-28T07:30:00+07:00',end:'2026-09-28T08:00:00+07:00' },
  { user_id:'',start:'2026-09-28T08:00:00+07:00',end:'2026-09-28T09:00:00+07:00' },
  { user_id:'',start:'2026-09-28T09:00:00+07:00',end:'2026-09-28T10:00:00+07:00' },
  { user_id:'LS2',start:now,end:'' }]) };
items.push(mixed);
ctx.confirmLegacySessionOwner('MIXED',[{start:'2026-09-28T08:00:00+07:00',user_id:'LS1'}],'Xác nhận đúng một phiên',2);
assert.deepEqual(Array.from(ctx.LSTiming.sessions(mixed,now),s=>s.user_id),['LS2','LS1','']);
assert.equal(JSON.parse(mixed.processing_sessions_json).length,4,'Owner confirmation must not drop a just-started known session');
assert.throws(()=>ctx.confirmLegacySessionOwner('MIXED',[{start:'2026-09-28T09:00:00+07:00',user_id:'LS2'}],'Sai phạm vi',3),/chính mình/);
assert.throws(()=>ctx.confirmLegacySessionOwner('MIXED',[{start:'2026-09-28T07:30:00+07:00',user_id:'LS1'}],'Ghi đè chủ cũ',3),/thay đổi/);

actor = { user_id: 'PGD', role: 'PHONG_PGD', unit_id: 'U1' };
assert.throws(() => ctx.getTimingAudit(), /quyền/i);
assert.throws(() => ctx.getItemActivity('FOREIGN'), /quyền/i);
assert.equal(ctx.getItemActivity('B').events[0].event_id, 'EB');
actor = { user_id: 'LS2', role: 'CAN_BO_LS' };
assert.throws(() => ctx.getItemActivity('B'), /quyền/i);
actor = { user_id: 'ADMIN', role: 'ADMIN' };
assert.throws(() => ctx.getTimingAudit(), /quyền/i);
assert.equal(Object.hasOwn(ctx.getItemActivity('B').events[0], 'after_json'), false, 'Admin must not receive raw customer snapshots');
console.log('Timing audit evidence, scoped owner confirmation and item activity access OK');
