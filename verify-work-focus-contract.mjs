import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=f=>fs.readFileSync(f,'utf8');
const server={};
vm.runInNewContext(read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//)[1],server);
vm.runInNewContext(read('Code.gs'),server);
const T=server.LSTiming, ts=time=>'2026-10-05T'+time+':00+07:00';
const cal={days:[1,2,3,4,5],open:'07:30',close:'18:00',breakFrom:'11:30',breakTo:'13:30',holidays:[]};
let clock=ts('09:00'),actor={user_id:'LS1',role:'CAN_BO_LS'},serial=0;
const db={WorkItems:[],Requests:[{request_id:'R',unit_id:'B',created_by:'QLKH'}],Events:[],
  WorkTypes:[{type_code:'W',sla_hours:4,checklist_json:'[]',requires_appointment:false}],
  Users:[{user_id:'LS1',role:'CAN_BO_LS',is_active:true},{user_id:'LS2',role:'CAN_BO_LS',is_active:true}],
  Settings:[{key:'work_open',value:'07:30'},{key:'work_close',value:'18:00'},{key:'work_break',value:'11:30-13:30'}]};
const tx={rows:n=>db[n]||[],find:(n,k,id)=>{const o=(db[n]||[]).find(r=>r[k]===id);return o?{object:o}:null;},
  write:(found,fields)=>Object.assign(found.object,fields),append:(n,row)=>{(db[n]||=([])).push(row);},
  tailWhere:(n,limit,match)=>{const all=(db[n]||[]).filter(r=>!match||match(r));return {rows:all.slice(-(limit||all.length)).reverse(),scanned:all.length,exhausted:true,nextBeforeRow:1};}};
tx.scan=(n,fn)=>tx.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));tx.select=(n,idCol,match)=>tx.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>tx.find(n,idCol,o[idCol]));
server.DataRepository={tx:fn=>{
  const before=JSON.parse(JSON.stringify(db));
  try{return fn(tx);}catch(e){Object.keys(db).forEach(k=>{db[k]=before[k];});throw e;}
},scanSnapshot:(n,fn)=>{const r=(db[n]||[]);r.forEach(o=>fn(c=>o[c]===undefined?"":o[c]));return r.length;}, getAll:n=>db[n]||[],find:(n,k,id)=>tx.find(n,k,id)?.object};
server.requireActor_=()=>actor;server.currentUser_=()=>actor;server.stamp_=()=>clock;server.id_=()=> 'ID'+(++serial);
server.markPlanDirty_=()=>{};server.Notifications={queue:()=>0};
const base=id=>({item_id:id,request_id:'R',period_id:'P',status:'DA_PHAN_CONG',assigned_user_id:'LS1',
  work_type_code:'W',product_name:'Vay',version:1,processing_started_at:'',dossier_received_at:'',
  processing_sessions_json:'[]',sla_pause_log_json:'[]',pause_log_json:'[]'});
const item=id=>db.WorkItems.find(i=>i.item_id===id);
const receive=(id,start_now)=>server.transitionItem(id,'DANG_THUC_HIEN',{expected_version:item(id).version,start_now,reason:'Tiếp nhận / tiếp tục'});
const focus=id=>server.focusWorkItem(id,item(id).version);
const transition=(id,to,opts={})=>server.transitionItem(id,to,{expected_version:item(id).version,...opts});
db.WorkItems=[base('A'),base('B'),base('C'),{...base('OTHER'),assigned_user_id:'LS2'}];
receive('A',true);
assert.equal(T.workState(item('A')),'ACTIVE');
const dueA=item('A').due_at,slaA=item('A').sla_pause_log_json;
clock=ts('09:30');receive('B',false);
assert.equal(T.workState(item('A')),'ACTIVE','Receiving B into queue must keep A running');
assert.equal(T.workState(item('B')),'QUEUED');
assert.equal(item('B').processing_started_at,'');
assert.equal(item('B').processing_sessions_json,'[]');
assert.equal(item('B').dossier_received_at,clock,'Queue receipt still starts SLA');
assert.ok(item('B').due_at);
clock=ts('10:00');const switched=focus('B');
assert.equal(switched.focus_updates.length,2);
assert.equal(T.workState(item('A')),'WAITING');
assert.equal(item('A').status,'DANG_THUC_HIEN','Internal wait must not change business status');
assert.equal(item('A').due_at,dueA,'Internal switching must not freeze SLA');
assert.equal(item('A').sla_pause_log_json,slaA);
assert.equal(JSON.parse(item('A').processing_sessions_json).at(-1).end,clock);
assert.equal(JSON.parse(item('B').processing_sessions_json)[0].start,clock,'A ends exactly when B begins');
assert.equal(JSON.parse(db.Events.find(e=>e.type==='CHO_LAM_TIEP').before_json).execution_state,'ACTIVE');
clock=ts('10:10');receive('C',false);
assert.equal(T.workState(item('B')),'ACTIVE');
assert.equal(T.workState(item('C')),'QUEUED');
assert.throws(()=>transition('C','HOAN_THANH_LS'),/Làm ngay|Làm tiếp/);
clock=ts('10:30');transition('B','HOAN_THANH_LS');
assert.equal(T.workState(item('B')),'');
assert.equal(T.workState(item('A')),'WAITING','Finishing B must preserve A for explicit resume');
focus('A');
assert.equal(JSON.parse(item('A').processing_sessions_json).at(-1).start,clock);
clock=ts('11:00');transition('A','HOAN_THANH_LS');
const report=T.report(db.WorkItems,cal,{from:'2026-10-05',to:'2026-10-05',user_id:'LS1',now:clock});
assert.equal(T.metrics(item('A'),cal,clock).xu_ly,1.5);
assert.equal(T.metrics(item('B'),cal,clock).xu_ly,0.5);
assert.equal(report.total.processing_hours,2,'Switch and resume must retain all two hours without overlap');
assert.equal(report.total.occupied_hours,2);
assert.equal(T.metrics(item('B'),cal,clock).nhan_den_xong,1,'Receipt duration differs from actual processing');

// A stale retry must not switch another dossier or create a second session.
clock=ts('13:30');focus('C');
const version=item('C').version,sessions=item('C').processing_sessions_json;
assert.throws(()=>server.focusWorkItem('C',version-1),/cập nhật/);
assert.throws(()=>server.focusWorkItem('C'),/cập nhật/);
assert.equal(item('C').processing_sessions_json,sessions);
focus('C');assert.equal(item('C').processing_sessions_json,sessions,'Same active target must not duplicate its session');
actor={user_id:'LS2',role:'CAN_BO_LS'};
assert.throws(()=>focus('C'),/được giao/);
receive('OTHER',true);
assert.equal(T.workState(item('C')),'ACTIVE','Different LS must not stop one another');
actor={user_id:'KS',role:'KS_LS'};
assert.throws(()=>focus('C'),/Chỉ cán bộ LS/);
actor={user_id:'LS1',role:'CAN_BO_LS'};
clock=ts('14:00');transition('C','TAM_DUNG',{reason:'Chờ khách bổ sung giấy tờ'});
assert.throws(()=>focus('C'),/Tiếp nhận hoặc tiếp tục/);
assert.equal(T.workState(item('C')),'');
assert.equal(T.metrics(item('C'),cal,ts('15:00')).xu_ly,0.5,'External pause must freeze actual work');
db.WorkItems.push(base('D'));receive('D',true);
clock=ts('14:30');receive('C',true);
assert.equal(T.workState(item('D')),'WAITING','Resume externally paused C must switch away from D');
assert.equal(T.workState(item('C')),'ACTIVE');
assert.ok(JSON.parse(item('C').sla_pause_log_json).at(-1)[1],'External SLA pause must close on resume');

// All historical active sessions are closed when switching, with no retroactive rewrite.
const legacy={...base('LEG'),status:'DANG_THUC_HIEN',dossier_received_at:ts('13:30'),processing_started_at:ts('13:30')};
db.WorkItems.push(legacy);clock=ts('15:00');focus('D');
assert.equal(T.workState(legacy),'WAITING');
assert.ok(JSON.parse(legacy.processing_sessions_json).every(s=>s.end),'Legacy open span ends at switch');
assert.ok(JSON.parse(legacy.processing_sessions_json).every(s=>!s.user_id),'Legacy operator is not invented');
assert.equal(db.WorkItems.filter(i=>i.assigned_user_id==='LS1'&&T.workState(i)==='ACTIVE').length,1);
db.WorkItems.push({...base('NO_RECEIPT'),status:'DANG_THUC_HIEN'});
assert.throws(()=>focus('NO_RECEIPT'),/Tiếp nhận/);
item('D').carried_to_item_id='NEXT';assert.throws(()=>focus('D'),/chuyển tháng/);delete item('D').carried_to_item_id;
assert.throws(()=>focus('A'),/Tiếp nhận hoặc tiếp tục/,'Finished dossiers cannot be started directly');
assert.throws(()=>server.focusWorkItem('MISSING',1),/Không tìm thấy/);

// Transaction failure after switching A must roll back both targets and history.
const snapshot=JSON.stringify(db);
const realAppend=tx.append;tx.append=(n,row)=>{if(row.type==='LAM_TIEP')throw Error('Injected event failure');realAppend(n,row);};
assert.throws(()=>focus('C'),/Injected/);
assert.equal(JSON.stringify(db),snapshot,'Switch must commit both session boundaries or neither');tx.append=realAppend;

// Administrative return and handover queue work; they cannot start a second officer clock.
actor={user_id:'KS',role:'KS_LS'};transition('A','DANG_THUC_HIEN',{reason:'Bổ sung'});
assert.equal(T.workState(item('A')),'QUEUED');
server.handoverOpenWork_(tx,'LS1','LS2','KS',[item('D')],'Bàn giao');
assert.equal(T.workState(item('D')),'QUEUED');
assert.ok(JSON.parse(item('D').processing_sessions_json).every(s=>s.end));
assert.equal(T.workState(item('OTHER')),'ACTIVE');

// The legacy receipt checkbox also switches at one timestamp.
actor={user_id:'LS2',role:'CAN_BO_LS'};
db.WorkItems.push({...base('CHECK'),assigned_user_id:'LS2',status:'DANG_THUC_HIEN'});
clock=ts('15:10');const receipt=server.confirmDossierReceipt('CHECK',1);
assert.equal(T.workState(item('OTHER')),'WAITING');
assert.equal(T.workState(item('CHECK')),'ACTIVE');
assert.equal(JSON.parse(item('OTHER').processing_sessions_json).at(-1).end,JSON.parse(item('CHECK').processing_sessions_json)[0].start);
assert.equal(receipt.focus_updates[0].item_id,'OTHER');

// Linked work is queued, leaving its parent running and its SLA starting at receipt.
db.WorkTypes.push({type_code:'COL',display_name:'TSĐB nhập mới',is_active:true,sla_hours:4,checklist_json:'[]'});
server.localBusinessDate_=()=> '2026-10-05';
const linked=server.addLinkedItem('CHECK','COL');
assert.equal(T.workState(item(linked.item_id)),'QUEUED');
assert.equal(item(linked.item_id).processing_started_at,'');
assert.equal(item(linked.item_id).processing_sessions_json,'[]');
assert.equal(T.workState(item('CHECK')),'ACTIVE');

// Real UI renderers and actions: default receipt queue, resume banner, filtered tabs.
const client={LS:{},window:{},document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},created:[],createElement(){const attrs={},el={values:{},setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];},querySelector:()=>null,querySelectorAll:()=>[],set innerHTML(h){this._h=h;const m=/name="start_now" value="([a-z]+)"/.exec(h);this.values={start_now:m&&m[1]};},get innerHTML(){return this._h;}};this.created.push(el);return el;}},localStorage:{getItem:()=>null,setItem(){}},FormData:class{constructor(form){this.values=form.values;}get(k){return this.values[k]??null;}}};
for(const f of ['core','domain','ui','screens'])vm.runInNewContext(read('js/'+f+'.js'),client);
const U=client.LS,D=U.domain,S=U.screens,state=D.seed();state.session=state.users.find(u=>u.role==='CAN_BO_LS').user_id;
const w=state.workTypes.find(w=>!w.requires_appointment),request=state.requests[0];
const a={...base('UI_A'),request_id:request.request_id,assigned_user_id:state.session,work_type_code:w.code,
  source_stt:'A',status:'DANG_THUC_HIEN',execution_state:'WAITING',execution_changed_at:ts('10:00'),
  dossier_received_at:ts('09:00'),processing_started_at:ts('09:00'),processing_sessions:[{user_id:state.session,start:ts('09:00'),end:ts('10:00')}],pause_log:[[ts('10:00'),'']],checklist:[]};
const b={...a,item_id:'UI_B',source_stt:'B',execution_state:'ACTIVE',processing_sessions:[{user_id:state.session,start:ts('10:00'),end:''}],pause_log:[]};
const c={...base('UI_C'),source_stt:'C',request_id:request.request_id,assigned_user_id:state.session,work_type_code:w.code,checklist:[]};
state.items=[a,b,c];U.replace(state);
U.app={render(){}};U.ui.toast=()=>{};U.ui.closeDialog=()=>{};
let dialog='';U.ui.openDialog=(title,body)=>{dialog=body;};
assert.match(S.focusBar(),/Chuyển làm A/);
b.status='HOAN_THANH_LS';assert.match(S.focusBar(),/Làm tiếp A/);
a.status='TAM_DUNG';assert.doesNotMatch(S.focusBar(),/Làm tiếp|data-act="resume-work"/,'External pause must not offer an internal resume');a.status='DANG_THUC_HIEN';
b.status='DANG_THUC_HIEN';S.flow(c.item_id,'DANG_THUC_HIEN');
// Tiếp nhận một chạm: đang làm hồ sơ khác thì hồ sơ mới vào danh sách chờ, không mở hộp thoại.
assert.equal(client.document.created.pop().values.start_now,'queue','Receive queue defaults when another dossier is active');
assert.match(S.mine(),/Chờ làm tiếp/);
assert.match(S.mine(),/Chờ bắt đầu/);
const priorPeriodActive={...a,item_id:'UI_OLD_PERIOD',period_id:'SEP',execution_state:'ACTIVE',
  processing_sessions:[{user_id:state.session,start:ts('09:00'),end:''}],pause_log:[]};
state.items.push(priorPeriodActive);
U.now=()=>ts('10:30');S.startWork(a.item_id);
assert.equal(a.execution_state,'ACTIVE');assert.equal(b.execution_state,'WAITING');
assert.equal(priorPeriodActive.execution_state,'WAITING','Local fallback must also stop active work from a previous period');
assert.equal(a.processing_sessions.at(-1).start,b.processing_sessions.at(-1).end);
assert.ok(S.focusBar().includes('Chuyển làm B'));

// Exercise actual flow submission, keeping A active when C is received into queue.
const form={values:{start_now:'queue'},getAttribute:k=>({'data-id':c.item_id,'data-to':'DANG_THUC_HIEN',
  'data-from':c.status,'data-version':String(c.version)})[k]||null,setAttribute(){}};
U.ui.dialogOpen=()=>false;
S.submitFlow(form);
assert.equal(c.execution_state,'QUEUED');assert.equal(a.execution_state,'ACTIVE');
assert.equal(c.processing_started_at,'');assert.equal(c.processing_sessions.length,0);

// Unknown server outcome must release the focus button lock while refresh reconciles data.
let focusCalls=0;
U.isGas=()=>true;U.api={focusWorkItem:()=>{focusCalls++;return Promise.resolve();}};
U.app.background=()=>Promise.resolve();
S.startWork(b.item_id);await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(b.syncing,false);S.startWork(b.item_id);await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(focusCalls,2,'An unknown outcome cannot permanently disable focus controls');
assert.ok(read('js/app.js').includes("'start-work': function (el) { S.startWork"));
assert.match(read('js/gas-api.js'),/write\('focusWorkItem'/);
assert.match(read('SetupSheetDB.gs'),/'execution_state', 'execution_changed_at'/);
console.log('Work focus: queue, atomic switching, resume, exact time, SLA, guards, rollback, legacy, handover and UI passed.');
