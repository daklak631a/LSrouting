// Regression of the 2026-10-05 review: real source, synthetic data, no production writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const ts=t=>'2026-10-05T'+t+':00+07:00';
const client={LS:{},window:{},localStorage:{getItem:()=>null,setItem(){}}};
for(const name of ['core','domain','ui','screens'])vm.runInNewContext(read('js/'+name+'.js'),client);
const U=client.LS,D=U.domain,state=D.seed();
state.session=state.users.find(u=>u.role==='CAN_BO_LS').user_id;U.replace(state);
U.ui.openDialog=()=>{};U.ui.toast=()=>{};
assert.doesNotThrow(()=>U.screens.openFilter('mine'));
const w=state.workTypes[0],req=state.requests[0];
state.items=[{item_id:'Q',source_stt:'Q',request_id:req.request_id,work_type_code:w.code,
  assigned_user_id:state.session,status:'DANG_THUC_HIEN',execution_state:'QUEUED',
  dossier_received_at:ts('09:00'),processing_started_at:'',processing_sessions:[],checklist:[],version:1}];
assert.match(U.screens.mine(),/data-act="start-work"/);
state.items[0].execution_state='WAITING';assert.match(U.screens.mine(),/Làm tiếp/);

let actor={user_id:'LS1',full_name:'LS1',role:'CAN_BO_LS'},now=ts('16:00'),seq=0;
const properties=new Map();
const s={Utilities:{getUuid:()=>String(++seq).padStart(32,'0')},Session:{getScriptTimeZone:()=> 'Asia/Ho_Chi_Minh'},Logger:{log(){}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})}};
for(const f of ['TimeTracking.gs','Code.gs','Notifications.gs'])vm.runInNewContext(read(f),s);
const cal={days:[1,2,3,4,5],open:'07:30',close:'18:00',breakFrom:'11:30',breakTo:'13:30',holidays:[]};
const db={WorkItems:[],Events:[],Requests:[{request_id:'R',unit_id:'B',requestor_id:'QLKH',created_by:'QLKH',customer_name:'Synthetic'}],
  Users:[{user_id:'LS1',role:'CAN_BO_LS',is_active:true,full_name:'LS1'},
    {user_id:'QLKH',unit_id:'B',role:'PHONG_PGD',is_active:true,full_name:'QLKH'},
    {user_id:'OTHER',unit_id:'B',role:'PHONG_PGD',is_active:true}],
  WorkTypes:[{type_code:'W',sla_hours:4,display_name:'Synthetic',requires_appointment:false,checklist_json:'[]'}],
  Settings:[],MonthlyPlans:[{period_id:'P',status:'ACTIVE',start_date:'2026-10-01'},{period_id:'P2',status:'ACTIVE',start_date:'2026-11-01'}],
  NotifyRules:[{event:'DANG_HEN_KH',audience:'PHONG_PHU_TRACH',enabled:true,channels:'IN_APP',needs_confirm:false}],
  Channels:[{code:'IN_APP',status:'HOAT_DONG',config_json:'{}'}],Templates:[],NotificationOutbox:[],NotificationIdempotency:[],NotificationMetrics:[],Inbox:[],Units:[]};
const t={rows:n=>db[n]||[],find:(n,k,v)=>{const o=(db[n]||[]).find(o=>o[k]===v);return o?{object:o}:null;},
  write:(f,x)=>Object.assign(f.object,x),append:(n,x)=>{(db[n]||=[]).push(x);},tail:n=>db[n]||[],
  tailWhere:(n,limit,match)=>({rows:(db[n]||[]).filter(match).slice(-limit),exhausted:true})};
s.DataRepository={tx:fn=>fn(t),find:(n,k,v)=>t.find(n,k,v)?.object,getAll:n=>db[n]||[]};
s.requireActor_=()=>actor;s.currentUser_=()=>actor;s.stamp_=()=>now;s.id_=p=>p+(++seq);
s.markPlanDirty_=()=>{};s.timingCalendar_=()=>cal;s.notificationDateTime_=v=>v||'';
const make=(id,start,end)=>({item_id:id,period_id:'P',request_id:'R',assigned_user_id:'LS1',work_type_code:'W',
  status:'HOAN_THANH_LS',version:1,dossier_received_at:ts(start),processing_started_at:ts(start),completed_at:ts(end),
  processing_sessions_json:JSON.stringify([{user_id:'LS1',start:ts(start),end:ts(end)}]),sla_pause_log_json:'[]',pause_log_json:'[]'});
db.WorkItems=[make('A','09:00','10:00'),make('B','10:00','11:00')];
s.correctItemTimes('A',{dossier_received_at:ts('09:00'),completed_at:ts('11:00')},'Correct',1);
let report=s.LSTiming.report(db.WorkItems,cal,{from:'2026-10-05',to:'2026-10-05',now,user_id:'LS1'});
assert.equal(report.total.processing_hours,2);assert.equal(report.total.occupied_hours,2);
assert.equal(s.LSTiming.metrics(db.WorkItems[0],cal).nhan_den_xong,2,'Gross receipt duration remains accurate');
assert.equal(JSON.parse(db.Events.at(-1).after_json).overlap_trimmed,true);
// Split around a conflict, preserve other officers, and never fall back to invented hours if fully trimmed.
db.WorkItems=[make('A','09:00','10:00'),make('B','10:00','11:00'),{...make('OTHER_LS','11:00','11:15'),assigned_user_id:'LS2',
  processing_sessions_json:JSON.stringify([{user_id:'LS2',start:ts('11:00'),end:ts('11:15')}])}];
s.correctItemTimes('A',{dossier_received_at:ts('09:00'),completed_at:ts('11:30')},'Correct',1);
assert.equal(s.LSTiming.metrics(db.WorkItems[0],cal).xu_ly,1.5);
assert.equal(JSON.parse(db.WorkItems[0].processing_sessions_json).length,2);
db.WorkItems=[make('A','09:00','10:00'),make('B','09:00','10:00')];
s.correctItemTimes('A',{dossier_received_at:ts('09:00'),completed_at:ts('10:00')},'Correct',1);
assert.equal(s.LSTiming.metrics(db.WorkItems[0],cal).xu_ly,0);
// Existing reschedule UI reaches actual dispatcher; owner, reason and version guards remain.
db.WorkItems=[{...make('DEADLINE','09:00','10:00'),status:'DANG_THUC_HIEN',completed_at:'',due_at:ts('13:30')}];
assert.ok(s.API_WRITE_.includes('rescheduleItem'));
s.api({name:'rescheduleItem',args:['DEADLINE',ts('17:00'),'Client timeline changed',1]});
assert.equal(db.WorkItems[0].due_at_override,new Date(ts('17:00')).toISOString());
assert.throws(()=>s.api({name:'rescheduleItem',args:['DEADLINE',ts('18:00'),'Changed',1]}),/cập nhật/);
actor={user_id:'OTHER',role:'PHONG_PGD',unit_id:'B'};
assert.throws(()=>s.rescheduleItem('DEADLINE',ts('18:00'),'Changed',2),/quyền|người gửi|tạo|Chỉ/);
actor={user_id:'QLKH',role:'PHONG_PGD',unit_id:'OTHER_UNIT'};
// Results reach exactly the creator even after a unit move; same occurrence is sent once.
db.Users.find(u=>u.user_id==='QLKH').unit_id='OTHER_UNIT';
const parent={...make('N','09:00','10:00'),status:'DANG_HEN_KH',appointment_json:JSON.stringify({at:ts('10:00'),channel:'IN_APP'})};
assert.equal(s.Notifications.queue(t,parent,'DANG_HEN_KH','LS1'),1);
assert.equal(s.Notifications.queue(t,parent,'DANG_HEN_KH','LS1'),0);
parent.version++;parent.appointment_json=JSON.stringify({at:ts('15:00'),channel:'IN_APP'});
assert.equal(s.Notifications.queue(t,parent,'DANG_HEN_KH','LS1'),1);
assert.deepEqual([...new Set(db.NotificationOutbox.map(n=>n.recipient))],['QLKH']);
assert.deepEqual(Array.from(D.recipientsFor('PHONG_PHU_TRACH',state.items[0],{...state,requests:[{...req,created_by:'X',requestor:{id:'X'}}],users:[{user_id:'X',role:'PHONG_PGD',active:true,unit_id:'NEW'}]})).map(x=>x.id),['X']);
actor={user_id:'ADMIN',full_name:'Admin',role:'ADMIN'};
db.NotificationOutbox.push({outbox_id:'UNKNOWN',status:'CAN_DOI_SOAT',recipient_kind:'NOI_BO',channel:'EMAIL',claim_token:'T',retry_count:0,created_at:now});
assert.throws(()=>s.changeOutbox('UNKNOWN','RETRY'),/không cần/);
s.changeOutbox('UNKNOWN','CANCEL');assert.throws(()=>s.changeOutbox('UNKNOWN','RETRY'),/không cần/);
assert.equal(db.NotificationOutbox.find(o=>o.outbox_id==='UNKNOWN').claim_token,'');
db.NotificationOutbox.push({outbox_id:'FAILED',status:'THAT_BAI',recipient_kind:'NOI_BO',channel:'EMAIL',retry_count:1,created_at:now});
s.changeOutbox('FAILED','RETRY');assert.equal(db.NotificationOutbox.at(-1).status,'CHO_GUI');
actor={user_id:'KS',role:'KS_LS'};
db.WorkItems=[{...make('CARRY','09:00','10:00'),status:'DANG_THUC_HIEN',completed_at:'',due_at:ts('17:00'),due_at_override:ts('17:00'),execution_state:'WAITING'}];
s.carryOpenWorkToPlan_('P','P2',actor);
assert.equal(db.WorkItems.find(i=>i.carryover_from_item_id==='CARRY').due_at_override,ts('17:00'));
const paused=make('PAUSED','09:00','11:00');
paused.processing_sessions_json=JSON.stringify([{user_id:'LS1',start:ts('09:00'),end:ts('10:00')}]);
paused.sla_pause_log_json=JSON.stringify([[ts('10:00'),ts('11:00')]]);
assert.equal(s.LSTiming.metrics(paused,cal).toan_trinh,s.LSTiming.metrics(s.sanitizeAdminItem_(paused),cal).toan_trinh);
paused.customer_name='PRIVATE';paused.pause_log_json=JSON.stringify([[ts('10:00'),ts('11:00'),'PRIVATE']]);
assert.ok(!JSON.stringify(s.sanitizeAdminItem_(paused)).includes('PRIVATE'));
// Durable counter is keyed by authenticated account, not browser or deployment.
db.Settings=[{key:'update_notice_json',value:JSON.stringify({id:'N1',version:'v1',display_limit:3})}];
actor={user_id:'LS1',role:'CAN_BO_LS'};
for(let k=1;k<=3;k++)assert.equal(s.claimUpdateNotice('N1').count,k);
assert.equal(s.claimUpdateNotice('N1').show,false);
actor={user_id:'LS2',role:'CAN_BO_LS'};assert.equal(s.claimUpdateNotice('N1').count,1);
db.Settings[0].value=JSON.stringify({id:'N2',version:'v2',display_limit:3});assert.equal(s.claimUpdateNotice('N2').count,1);
assert.equal(s.claimUpdateNotice('N1').show,false);
// Actual refresh function drops stale write epochs, out-of-order reads and old sessions automatically.
const app=read('js/app.js'),start=app.indexOf('  function refreshServer(message, silent)'),end=app.indexOf('  /* --- Ghi nền',start);
let resolves=[],live={session:'U',version:1},epoch=0,pending=0,scheduled=0;
const env={U:{isGas:()=>true,replace:x=>{live=x;}},st:()=>live,syncing:0,refreshSequence:0,
  LS:{api:{bootstrap:()=>new Promise(r=>resolves.push(r)),queueStatus:()=>({epoch,pending})}},scheduleRefresh:()=>scheduled++,ui:{dialogOpen:()=>false,toast(){}},render(){}};
const refresh=vm.runInNewContext('('+app.slice(start,end).trim()+')',env);
let promise=refresh();live={session:'U',version:2};epoch++;
resolves.shift()({session:'U',version:1});await promise;assert.equal(live.version,2);assert.equal(scheduled,1);
const first=refresh(),second=refresh();const r1=resolves.shift(),r2=resolves.shift();
r2({session:'U',version:4});await second;r1({session:'U',version:3});await first;assert.equal(live.version,4);
promise=refresh();live.session='OTHER';resolves.shift()({session:'U',version:5});await promise;assert.equal(live.session,'OTHER');
pending=1;await refresh();assert.equal(resolves.length,0);
console.log('Logic fixes: filter, row resume, dispatcher, overlap correction, recipient/occurrence, quarantine, carry, report privacy, popup account limit and stale refresh passed.');
