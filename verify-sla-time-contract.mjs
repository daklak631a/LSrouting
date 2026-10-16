import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = f => fs.readFileSync(f, 'utf8');
const sourceCode = read('Code.gs');
const screensSource = read('js/screens.js');
const appSource = read('js/app.js');
const apiSource = read('js/gas-api.js');
assert.match(sourceCode, /function confirmDossierReceipt\(itemId, expectedVersion\)/);
assert.match(screensSource, /data-act="dossier-received"/);
assert.match(appSource, /a === 'dossier-received'/);
assert.match(apiSource, /write\('confirmDossierReceipt'/);
const client = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), client);
vm.runInNewContext(read('js/domain.js'), client);
assert.ok(client.LS.domain.FLOW.CHO_PHAN_CONG, 'A new request waits for KS/Quản lý LS to assign it');
const T = client.LSTiming;
assert.ok(T, 'Client and GAS must share the timing engine');
const cal = { days: [1,2,3,4,5], open:'07:30', close:'18:00', breakFrom:'11:30', breakTo:'13:30', holidays:[] };
const item = { item_id:'A', work_type_code:'W', product_name:'Vay', assigned_user_id:'LS2', status:'HOAN_THANH_LS',
  submitted_at:'2026-09-25T16:00:00+07:00', dossier_received_at:'2026-09-25T16:00:00+07:00', accepted_at:'2026-09-25T16:00:00+07:00', first_assigned_at:'2026-09-25T16:00:00+07:00',
  processing_started_at:'2026-09-25T16:00:00+07:00', completed_at:'2026-09-28T09:00:00+07:00',
  processing_sessions:[{ user_id:'LS1', work_type_code:'W', product_name:'Vay', start:'2026-09-25T16:00:00+07:00', end:'2026-09-25T17:00:00+07:00' },
    { user_id:'LS2', work_type_code:'W', product_name:'Vay', start:'2026-09-28T08:00:00+07:00', end:'2026-09-28T09:00:00+07:00' }],
  sla_pause_log:[['2026-09-25T17:00:00+07:00','2026-09-28T08:00:00+07:00']] };
assert.equal(T.metrics(item, cal).xu_ly, 2);
assert.equal(T.metrics(item, cal).toan_trinh, 2);
const notReceived = T.metrics({ submitted_at:item.dossier_received_at, completed_at:item.completed_at }, cal);
assert.equal(notReceived.nhan_den_xong, null, 'Never infer dossier receipt from the branch submission time');
assert.equal(notReceived.toan_trinh, 3.5, 'Full lifecycle may be measured from branch submission without claiming dossier receipt');
const report = T.report([item], cal, { from:'2026-09-25', to:'2026-09-28', now:'2026-09-28T10:00:00+07:00' });
assert.equal(report.rows.length, 2);
assert.equal(report.rows.find(r => r.user_id === 'LS1').processing_hours, 1);
assert.equal(report.rows.find(r => r.user_id === 'LS2').processing_hours, 1);
assert.equal(report.total.occupied_hours, 2);
const copy = { ...item, item_id:'OLD', carried_to_item_id:'A' };
assert.equal(T.report([copy,item], cal, {from:'2026-09-25',to:'2026-09-28'}).total.processing_hours, 2, 'Carryover must not duplicate time');
const parallel = { ...item, item_id:'B' };
assert.equal(T.report([item,parallel], cal, {from:'2026-09-25',to:'2026-09-28'}).total.occupied_hours, 2, 'Concurrent dossiers count once for occupied staff time');
assert.equal(T.report([item,parallel], cal, {from:'2026-09-25',to:'2026-09-28'}).total.processing_hours, 4);

const server = {};
vm.runInNewContext(read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//)[1], server);
vm.runInNewContext(read('Code.gs'), server);
let actor = {user_id:'LS2',role:'CAN_BO_LS'}, events = [];
let stored = { ...item, version:4, request_id:'R', period_id:'P', processing_sessions_json:JSON.stringify(item.processing_sessions), sla_pause_log_json:JSON.stringify(item.sla_pause_log) };
delete stored.processing_sessions; delete stored.sla_pause_log;
const settings = [['work_open','07:30'],['work_close','18:00'],['work_break','11:30-13:30']].map(([key,value])=>({key,value}));
const t = { rows:name=>name==='Settings'?settings:[], find:(name,key,id)=> name==='WorkItems'&&id==='A'?{object:stored}:name==='WorkTypes'?{object:{sla_hours:4}}:null,
  write:(found,fields)=>Object.assign(found.object,fields), append:(name,row)=>{if(name==='Events')events.push(row);}, tailWhere:()=>({rows:[]}) };
t.scan=(n,fn)=>t.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));t.select=(n,idCol,match)=>t.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>t.find(n,idCol,o[idCol]));
server.DataRepository = {tx:fn=>fn(t),getAll:()=>[]};
server.requireActor_=()=>actor; server.currentUser_=()=>actor; server.stamp_=()=> '2026-09-28T10:00:00+07:00';
server.id_=()=> 'EVT'; server.syncMonthlyPlanWorkbook_=()=>{}; server.writePeriodSummary_=()=>{};
assert.throws(()=>server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:item.completed_at},'',4),/lý do/i);
actor = {user_id:'OTHER',role:'CAN_BO_LS'};
assert.throws(()=>server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:item.completed_at},'Sửa',4),/quyền|phụ trách|được giao/i);
actor = {user_id:'LS2',role:'CAN_BO_LS'};
assert.throws(()=>server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:'2026-09-29T09:00:00+07:00'},'Sửa',4),/tương lai/i);
assert.throws(()=>server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:item.completed_at},'Sửa',3),/cập nhật|phiên bản/i);
const saved=server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:'2026-09-28T09:30:00+07:00'},'Ghi nhận giờ hoàn thành thực tế',4);
assert.equal(saved.version,5);
assert.equal(stored.completed_at,'2026-09-28T02:30:00.000Z');
assert.equal(events.at(-1).type,'SUA_THOI_GIAN');
assert.ok(JSON.parse(events.at(-1).before_json).completed_at);
assert.equal(JSON.parse(events.at(-1).before_json).completed_at,item.completed_at,'Audit must retain the original completion time');
assert.equal(T.metrics(stored,cal).xu_ly,2.5);
assert.equal(T.metrics(stored,cal).toan_trinh,2.5);
actor={user_id:'ADMIN',role:'ADMIN'};
assert.throws(()=>server.correctItemTimes('A',{dossier_received_at:item.dossier_received_at,completed_at:item.completed_at},'Sửa',5),/quyền/i);

// Run the real server lifecycle: branch submits (create), KS assigns, LS receives
// (SLA starts), transfer, both operators' sessions, and completion.
let clock='2026-09-28T08:00:00+07:00';
server.stamp_=()=>clock;
server.Notifications={queue:()=>0};
const oldFind=t.find;
t.find=(name,key,id)=>name==='Users'?{object:{user_id:id,role:'CAN_BO_LS',is_active:true,full_name:id}}:oldFind(name,key,id);
actor={user_id:'KS',role:'KS_LS'};
stored={item_id:'A',request_id:'R',period_id:'P',status:'CHO_PHAN_CONG',version:1,work_type_code:'W',product_name:'Vay',
  submitted_at:'2026-09-28T01:00:00.000Z',dossier_received_at:'',completed_at:'',processing_started_at:'',assigned_user_id:'',processing_sessions_json:'[]',sla_pause_log_json:'[]'};
assert.throws(()=>server.transitionItem('A','CHO_TIEP_NHAN',{reason:'Đã bàn giao',expected_version:1}),/Không thể chuyển/,'There is no separate handover step any more');
clock='2026-09-28T09:00:00+07:00';
server.transitionItem('A','DA_PHAN_CONG',{assignee_id:'LS1',expected_version:1});
assert.equal(stored.due_at,'','Assignment before LS receipt must not start SLA');
assert.equal(stored.dossier_received_at,'','Assignment must not be mistaken for LS receipt');
actor={user_id:'LS1',role:'CAN_BO_LS'};
clock='2026-09-28T10:00:00+07:00';
server.transitionItem('A','DANG_THUC_HIEN',{expected_version:2});
assert.equal(stored.submitted_at,'2026-09-28T01:00:00.000Z','LS receipt must preserve the branch submit time');
assert.equal(new Date(stored.dossier_received_at).toISOString(),'2026-09-28T03:00:00.000Z','Tiếp nhận hồ sơ records the receipt time');
assert.equal(stored.dossier_received_by,'LS1');
assert.equal(stored.timing_source,'CONFIRMED');
assert.equal(stored.due_at,'2026-09-28T09:00:00.000Z','4 working hours from 10:00 ends at 16:00 (lunch break excluded)');
const handoffDeadline=stored.due_at;
clock='2026-09-28T10:30:00+07:00';actor={user_id:'KS',role:'KS_LS'};
server.transitionItem('A','DA_PHAN_CONG',{assignee_id:'LS2',reason:'Chuyển người',expected_version:3});
assert.equal(stored.due_at,handoffDeadline,'Transfer must not reset SLA');
assert.equal(new Date(stored.dossier_received_at).toISOString(),'2026-09-28T03:00:00.000Z','Transfer must not move the receipt time');
clock='2026-09-28T10:45:00+07:00';actor={user_id:'LS2',role:'CAN_BO_LS'};
server.transitionItem('A','DANG_THUC_HIEN',{expected_version:4});
assert.equal(new Date(stored.dossier_received_at).toISOString(),'2026-09-28T03:00:00.000Z','The second officer taking over keeps the original receipt time');
clock='2026-09-28T11:00:00+07:00';
server.transitionItem('A','HOAN_THANH_LS',{expected_version:5});
assert.equal(T.metrics(stored,cal).xu_ly,0.75);
assert.equal(T.metrics(stored,cal).toan_trinh,3,'Full lifecycle starts when Phòng/PGD submits');
assert.equal(T.metrics(stored,cal).nhan_den_xong,1,'Receipt-to-completion starts when LS confirms receipt');
const allocated=T.report([stored],cal,{from:'2026-09-28',to:'2026-09-28'});
assert.equal(allocated.rows.find(r=>r.user_id==='LS1').processing_hours,0.5);
assert.equal(allocated.rows.find(r=>r.user_id==='LS2').processing_hours,0.25);
server.DataRepository.getAll=name=>name==='WorkItems'?[stored]:name==='Settings'?settings:name==='Users'?[{user_id:'LS1',full_name:'LS1'},{user_id:'LS2',full_name:'LS2'}]:[];
server.DataRepository.tailWhere=()=>({rows:[]});
const ownReport=server.getTimeReport({from:'2026-09-28',to:'2026-09-28',user_id:'LS1'});
assert.ok(ownReport.rows.every(r=>r.user_id==='LS2'),'LS cannot override their own report scope');
assert.equal(ownReport.total.processing_hours,0.25);
actor={user_id:'PGD',role:'PHONG_PGD'};
assert.throws(()=>server.getTimeReport({from:'2026-09-28',to:'2026-09-28'}),/quyền/i);
actor={user_id:'ADMIN',role:'ADMIN'};
assert.ok(server.getTimeReport({from:'2026-09-28',to:'2026-09-28'}).rows.every(r=>!r.product_name),'Admin aggregates must not expose dossier product labels');

// The quick receipt checkbox is bound to the assigned officer and starts SLA
// only at the LS confirmation time.
actor={user_id:'LS1',role:'CAN_BO_LS'};
clock='2026-09-28T08:00:00+07:00';
stored={item_id:'B',request_id:'R',period_id:'P',status:'DANG_THUC_HIEN',version:1,work_type_code:'W',product_name:'Vay',
  assigned_user_id:'LS1',submitted_at:'',dossier_received_at:'',completed_at:'',processing_started_at:'',processing_sessions_json:'[]',sla_pause_log_json:'[]'};
t.find=(name,key,id)=>name==='WorkItems'&&id==='B'?{object:stored}:name==='Users'?{object:{user_id:id,role:'CAN_BO_LS',is_active:true,full_name:id}}:oldFind(name,key,id);
// Legacy rows only: a freshly assigned item must use "Tiếp nhận hồ sơ", not the tick box.
stored.status='DA_PHAN_CONG';
assert.throws(()=>server.confirmDossierReceipt('B',1),/Tiếp nhận hồ sơ/);
stored.status='DANG_THUC_HIEN';
const receipt=server.confirmDossierReceipt('B',1);
assert.equal(receipt.dossier_received_at,clock);
assert.equal(stored.dossier_received_by,'LS1');
assert.equal(stored.due_at,'2026-09-28T07:00:00.000Z');
assert.equal(events.at(-1).type,'XAC_NHAN_NHAN_DU_HO_SO');

// Batch assignment may happen before branch handoff/LS receipt; it must leave
// both receipt time and SLA deadline empty while persisting priority.
actor={user_id:'KS',role:'KS_LS'};
stored={item_id:'C',request_id:'R',period_id:'P',status:'CHO_PHAN_CONG',version:1,work_type_code:'W',product_name:'Vay',
  assigned_user_id:'',submitted_at:'',dossier_received_at:'',completed_at:'',processing_started_at:'',processing_sessions_json:'[]',sla_pause_log_json:'[]'};
t.find=(name,key,id)=>name==='WorkItems'&&id==='C'?{object:stored}:name==='Users'?{object:{user_id:id,role:'CAN_BO_LS',is_active:true,full_name:id}}:oldFind(name,key,id);
const batch=server.assignWorkItemsBatch([{item_id:'C',assignee_id:'LS1',expected_version:1,is_priority:true}]);
assert.equal(batch.count,1);
assert.equal(stored.status,'DA_PHAN_CONG');
assert.equal(stored.dossier_received_at,'');
assert.equal(stored.due_at,'');
assert.equal(stored.is_priority,true);
console.log('SLA handoff, working calendar, daily user/activity allocation, concurrency, carryover and audited time correction passed.');
