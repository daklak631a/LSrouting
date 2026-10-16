import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const ctx={};vm.runInNewContext(read('TimeTracking.gs'),ctx);vm.runInNewContext(read('Code.gs'),ctx);
const realCurrentUser=ctx.currentUser_;
vm.runInNewContext(read('SetupSheetDB.gs'),ctx);vm.runInNewContext(read('Notifications.gs'),ctx);
let actor={user_id:'WATCH',full_name:'Giám sát',role:'GIAM_SAT',unit_id:'HE_THONG',is_active:true};
const plan={period_id:'P',month_key:'2026-09',name:'Tháng 9',status:'ACTIVE',start_date:'2026-09-01',end_date:'2026-09-30',spreadsheet_id:'PRIVATE_SHEET',spreadsheet_url:'PRIVATE_SHEET_URL'};
const tables={MonthlyPlans:[plan],Users:[actor,{user_id:'LS1',full_name:'Cán bộ 1',role:'CAN_BO_LS',is_active:true,email:'PRIVATE_STAFF_EMAIL',telegram_chat_id:'PRIVATE_CHAT',password_hash:'PRIVATE_HASH'}],
  Units:[{unit_id:'U1',name:'Phòng 1',is_active:true}],WorkTypes:[{type_code:'W',display_name:'Giải ngân',is_active:true}],Settings:[{key:'env',value:'THU_NGHIEM'},{key:'gateway_url',value:'PRIVATE_GATEWAY'}],
  Requests:[{request_id:'R',period_id:'P',unit_id:'U1',customer_name:'PRIVATE_CUSTOMER',cif:'PRIVATE_CIF',phone:'PRIVATE_PHONE',note:'PRIVATE_NOTE'}],
  WorkItems:[{item_id:'I',request_id:'R',period_id:'P',status:'HOAN_THANH_LS',work_type_code:'W',product_name:'PRIVATE_PRODUCT',assigned_user_id:'LS1',occurrence_date:'2026-09-28',dossier_received_at:'2026-09-28T07:30:00+07:00',processing_started_at:'2026-09-28T08:00:00+07:00',completed_at:'2026-09-28T09:00:00+07:00',processing_sessions_json:JSON.stringify([{user_id:'LS1',product_name:'PRIVATE_PRODUCT',start:'2026-09-28T08:00:00+07:00',end:'2026-09-28T09:00:00+07:00'}])}],PeriodSummary:[]};
let writes=0;ctx.DataRepository={getAll:n=>tables[n]||[],find:(n,k,v)=>(tables[n]||[]).find(r=>r[k]===v),tx(){writes++;throw new Error('UNEXPECTED_WRITE');},sheetReads:()=>0,tailWhere:(n,limit,match)=>{const all=(tables[n]||[]).filter(r=>!match||match(r));return {rows:all.slice(-(limit||all.length)).reverse(),scanned:all.length,exhausted:true,nextBeforeRow:1};}};
ctx.currentUser_=()=>actor;ctx.ensureRuntimeSchema_=()=>{};ctx.activePlan_=()=>plan;ctx.stamp_=()=> '2026-09-29T10:00:00+07:00';
assert.equal(ctx.requireRole_('GIAM_SAT'),'GIAM_SAT');
assert.equal(ctx.authGroup_({...actor,auth_group:'EXTERNAL'}),'INTERNAL','Read-only monitor still requires internal authentication');
ctx.PropertiesService={getUserProperties:()=>({getProperty:()=>null})};
ctx.Session={getActiveUser:()=>({getEmail:()=>actor.email})};actor.email='monitor@example.test';
assert.throws(()=>realCurrentUser(),/mật khẩu/,'Google email must not bypass internal password login');
actor.auth_group='EXTERNAL';assert.throws(()=>ctx.authenticateUser('WATCH',''),/mật khẩu/,'Stale auth group must not bypass password');
delete actor.email;delete actor.auth_group;
const boot=ctx.getBootstrap();
assert.deepEqual(Array.from(boot.items),[]);assert.deepEqual(Array.from(boot.requests),[]);
assert.doesNotMatch(JSON.stringify(boot),/PRIVATE_/,'Monitor bootstrap must not disclose dossiers, contact data, credentials, settings or Sheet links');
assert.equal(boot.monitorSummary.total.completed,1);
assert.equal(boot.monitorSummary.byUnit[0].completed,1);
const time=ctx.getTimeReport({from:'2026-09-01',to:'2026-09-29'});
assert.equal(time.total.processing_hours,1);assert.doesNotMatch(JSON.stringify(time),/PRIVATE_|"item_id"|"request_id"/);
ctx.periodSummaryRows_=()=>[];
const aggregate=ctx.getReport({from:'2026-09',to:'2026-09',group:'unit'});
assert.doesNotMatch(JSON.stringify(aggregate),/PRIVATE_|"item_id"|"request_id"/);
assert.throws(()=>ctx.getItemActivity('I'),/quyền/);assert.throws(()=>ctx.getTimingAudit(),/quyền/);
for(const [name,args] of [
  ['createRequest',[{}]],['createNextMonthlyPlan',[]],['transitionItem',['I','HUY',{}]],['assignWorkItemsBatch',[[]]],
  ['saveChecklist',['I',[],1]],['addLinkedItem',['I','W']],['proposeRevision',['I',{},'x',1]],['resolveRevision',['I',true,'x']],
  ['correctItemTimes',['I',{},'x',1]],['confirmLegacySessionOwner',['I','LS1','x',1]],['adminSaveCatalog',['user','WATCH',{}]],
  ['adminImportUsers',[[]]],['adminSaveSettings',[{}]],['adminSaveDelivery',['channel','EMAIL',{}]],
  ['adminRunOutbox',[]],['changeOutbox',['X','CONFIRM']],['rebuildPeriodSummaries',[]],['adminTestChannel',['EMAIL','x']],['adminResetUserPassword',['LS1','x']],
  ['activateMonthlyPlans',[]],['setupFirstMonthlyPlan',[]],['usePlanTemplate',['x']],['createStorageWorkbook',[]],['setupSheetDB',[]],
  ['installMonthlyPlanTrigger',[]],['installMaintenanceTrigger',[]],['maintenanceTick',[]],['outboxTick',[]],['overdueTick',[]],['reconcileTick',[]],['installOutboxWorker',[]],['markInboxRead',[[]]]
])assert.throws(()=>ctx[name](...args),/chỉ.*xem|quyền|quản trị|Vai trò/i,name+' must reject monitor before writing');
assert.equal(writes,0,'Monitor calls must not start write transactions');

// Real installers migrate public handlers once and retain private scheduled handlers.
let triggers=['activateMonthlyPlans','maintenanceTick','outboxTick','overdueTick','reconcileTick'].map(name=>({getHandlerFunction:()=>name}));
const added=[];
ctx.ScriptApp={getProjectTriggers:()=>triggers.slice(),deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},newTrigger:name=>{
  const builder={timeBased:()=>builder,everyMinutes:()=>builder,everyHours:()=>builder,everyDays:()=>builder,atHour:()=>builder,
    create:()=>{added.push(name);triggers.push({getHandlerFunction:()=>name});}};return builder;
}};
ctx.installMonthlyPlanTrigger_();ctx.installMaintenanceTrigger_();ctx.Notifications.ensureWorkerTriggers();
assert.deepEqual(added.sort(),['activateMonthlyPlans_','autoReturnTick_','maintenanceTick_','outboxTick_','overdueTick_','planSyncTick_','reconcileTick_'].sort());
ctx.installMonthlyPlanTrigger_();ctx.installMaintenanceTrigger_();ctx.Notifications.ensureWorkerTriggers();assert.equal(added.length,7);
assert.equal(triggers.length,7,'Migrated jobs must not remain duplicated');

const uiCtx={LS:{},window:{},document:{},localStorage:{getItem:()=>null,setItem(){}}};
for(const name of ['core','domain','ui','charts','screens','gas-api','admin'])vm.runInNewContext(read('js/'+name+'.js'),uiCtx);
const state=uiCtx.LS.domain.seed();state.users.push({...actor,active:true});state.session=actor.user_id;state.monitorSummary=boot.monitorSummary;uiCtx.LS.replace(state);
assert.deepEqual(Array.from(uiCtx.LS.domain.ROLES.GIAM_SAT.nav),['monitor','time-report','report']);
assert.equal(uiCtx.LS.screens.visibleItems().length,0,'Even browser demo must not expose dossier rows for monitor');
assert.doesNotMatch(uiCtx.LS.screens.monitorDashboard(),/PRIVATE_|data-act="detail"|data-act="flow"|data-act="new-request"/);
assert.match(uiCtx.LS.screens.monitorDashboard(),/Phòng 1/);
let dialog='';uiCtx.LS.ui.openDialog=(title,body)=>{dialog=body;};uiCtx.LS.ui.toast=()=>{};
uiCtx.LS.screens.detail(state.items[0].item_id);assert.equal(dialog,'','Monitor cannot open a dossier by item ID');
state.session=state.users.find(u=>u.role==='ADMIN').user_id;
uiCtx.LS.admin.userDialog('WATCH');assert.match(dialog,/GIAM_SAT/);

let success;
const runner={withSuccessHandler:fn=>{success=fn;return runner;},withFailureHandler:()=>runner,getBootstrap:()=>success(boot),api:req=>runner[req.name](...req.args)};
uiCtx.google={script:{run:runner}};
const adapted=await uiCtx.LS.api.bootstrap();
assert.equal(adapted.monitorSummary.total.completed,1,'GAS adapter must preserve monitor aggregates');
assert.equal(adapted.items.length,0);assert.equal(adapted.requests.length,0);
assert.doesNotMatch(JSON.stringify(adapted),/PRIVATE_/,'Adapter must not restore demo dossiers or private data');
uiCtx.LS.replace(adapted);assert.match(uiCtx.LS.screens.monitorDashboard(),/Phòng 1/);

// Admin can persist the role; EXTERNAL supplied by the caller is ignored.
const saved=[];actor={user_id:'ADMIN',role:'ADMIN',is_active:true};
ctx.DataRepository.tx=fn=>fn({
  rows:n=>tables[n]||[],find:(n,k,v)=>{const row=(tables[n]||[]).find(r=>r[k]===v);return row?{object:row}:null;},
  write:(found,data)=>Object.assign(found.object,data),append:(n,data)=>saved.push({table:n,data}),
  tailWhere:(n,limit,match)=>{const all=(tables[n]||[]).filter(r=>!match||match(r));return {rows:all.slice(-(limit||all.length)).reverse(),scanned:all.length,exhausted:true,nextBeforeRow:1};}
});
ctx.logConfig_=()=>{};ctx.syncMonthlyPlanWorkbook_=()=>{};
ctx.adminSaveCatalog('user','WATCH_NEW',{login_code:'WATCH_NEW',full_name:'Giám sát mới',unit_id:'U1',role:'GIAM_SAT',auth_group:'EXTERNAL',is_active:true});
assert.equal(saved.find(x=>x.table==='Users').data.role,'GIAM_SAT');
assert.equal(saved.find(x=>x.table==='Users').data.auth_group,'INTERNAL');
console.log('Monitor aggregate privacy, internal auth, read/report allowlist, mutation denial and UI role configuration passed.');
