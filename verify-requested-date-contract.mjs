import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = f => fs.readFileSync(f,'utf8'), ctx = {};
vm.runInNewContext(read('TimeTracking.gs'),ctx);
vm.runInNewContext(read('Code.gs'),ctx);
let actor = { user_id:'QLKH', role:'PHONG_PGD', unit_id:'B', full_name:'A' }, serial=0;
const db={WorkItems:[],Requests:[],Events:[],CatalogOptions:[],Settings:[],Units:[{unit_id:'B',kind:'PGD',is_active:true}],
  Users:[{user_id:'LS1',role:'CAN_BO_LS',is_active:true,full_name:'LS'}],
  WorkTypes:[{type_code:'W',display_name:'Vay',is_active:true,checklist_json:'[]'},
    {type_code:'COL',display_name:'TSBĐ',is_active:true,checklist_json:'[]'}]};
const tx={rows:n=>db[n]||[],find:(n,k,v)=>{const object=(db[n]||[]).find(r=>r[k]===v);return object?{object}:null;},
  append:(n,row)=>(db[n]||=([])).push({...row}),write:(found,fields)=>Object.assign(found.object,fields)};
tx.scan=(n,fn)=>tx.rows(n).forEach(o=>fn(c=>o[c]===undefined?'':o[c]));tx.select=(n,idCol,match)=>tx.rows(n).filter(o=>match(c=>o[c]===undefined?'':o[c])).map(o=>tx.find(n,idCol,o[idCol]));
ctx.DataRepository={getAll:n=>db[n]||[],find:(n,k,v)=>tx.find(n,k,v)?.object,tx:fn=>fn(tx),tailWhere:()=>({rows:[]}),sheetReads:()=>0};
ctx.requireActor_=()=>actor;ctx.currentUser_=()=>actor;
ctx.stamp_=()=> '2026-10-05T10:00:00+07:00';ctx.id_=()=> 'ID'+(++serial);
ctx.activePlan_=()=>({period_id:'P',month_key:'2026-10',start_date:'2026-10-01',end_date:'2026-10-31'});
ctx.assertCurrentWorkItem_=()=>{};ctx.markPlanDirty_=()=>{};ctx.Notifications={queue:()=>0};
ctx.validatePhone_=v=>v||'';ctx.validateEmail_=v=>v||'';ctx.normalizeCollateralMode_=v=>v||'NONE';
const payload=()=>({customer:{name:'Customer'},items:[{work_type_code:'W',product_name:'Vay',occurrence_date:'2026-10-06'}]});
for (const date of ['', '2026-02-30', '06/10/2026']) {
  const p=payload();p.items[0].occurrence_date=date;
  const count=db.Requests.length;
  assert.throws(()=>ctx.createRequest(p),/ngày/i);
  assert.equal(db.Requests.length,count,'Invalid date must fail before saving any row');
}
const first=ctx.createRequest(payload()), second=ctx.createRequest(payload());
assert.equal(first.items[0].occurrence_date,'2026-10-06');
actor={user_id:'KS',role:'KS_LS'};
const single=ctx.transitionItem(first.item_ids[0],'DA_PHAN_CONG',{assignee_id:'LS1',expected_version:1});
assert.equal(single.occurrence_date,'2026-10-06');
const batch=ctx.assignWorkItemsBatch([{item_id:second.item_ids[0],assignee_id:'LS1',expected_version:1}]);
assert.equal(batch.items[0].occurrence_date,'2026-10-06');
const child=ctx.addLinkedItem(first.item_ids[0],'COL');
assert.equal(db.WorkItems.find(i=>i.item_id===child.item_id).occurrence_date,'2026-10-06');
db.CatalogOptions=[{catalog_key:'ASSIGNMENT_RULE',is_active:true,role_kind:'LS1',metadata_json:JSON.stringify({auto_assign:true,assignee_id:'LS1',work_type_codes:['W']})}];
actor={user_id:'QLKH',role:'PHONG_PGD',unit_id:'B'};
const automatic=ctx.createRequest(payload());
assert.equal(automatic.items[0].status,'DA_PHAN_CONG');
assert.equal(automatic.items[0].occurrence_date,'2026-10-06');
assert.ok(db.WorkItems.every(i=>i.occurrence_date==='2026-10-06'),'Stored dates survive manual, batch, automatic assignment and linked work');
actor={user_id:'KS',role:'KS_LS'};
ctx.ensureRuntimeSchema_=()=>{};ctx.ensureMonthlyTimeSheets_=()=>{};ctx.updateNotice_=()=>null;ctx.Logger={log(){}};
const reloaded=ctx.getBootstrap();
assert.equal(reloaded.items.length,db.WorkItems.length);
assert.ok(reloaded.items.every(i=>i.occurrence_date==='2026-10-06'),'Real bootstrap reload must retain T+1 after assignment');

// Submit a visible T+1 date with stale native value (autofill/event not dispatched).
const native={value:'2026-10-05'},display={value:'06/10/2026',getAttribute:k=>k==='data-date-kind'?'date':'date-id',setCustomValidity(){}};
const client={LS:{},window:{},localStorage:{getItem:()=>null,setItem(){}},
  document:{getElementById:id=>id==='date-id'?native:null},
  FormData:class{get(k){return ({name:'Customer',cif:'',phone:'',email:''})[k]??null;}}};
for(const f of ['core','domain','ui','screens'])vm.runInNewContext(read('js/'+f+'.js'),client);
const resendDateMarkup=client.LS.ui.input('occurrence_date','',{type:'date',required:true,min:'2026-10-07',nativeAttrs:' data-request-native-date'});
const resendDateInputs=resendDateMarkup.match(/<input\b[^>]*>/g);
assert.equal(resendDateInputs.length,2);
assert.doesNotMatch(resendDateInputs[0],/data-request-native-date|min=/,'Resend-only attributes must not land on the visible text field');
assert.match(resendDateInputs[1],/type="date" name="occurrence_date"[^>]*min="2026-10-07"[^>]*data-request-native-date/,'Resend attributes must be attached to the named native date field');
const U=client.LS,state=U.domain.seed();state.session=state.users.find(u=>u.role==='PHONG_PGD').user_id;U.replace(state);
const wt=state.workTypes.find(w=>w.code==='LEGACY_29');let captured=null;
const row={querySelector:s=>s.includes('work-type-group')?{value:wt.group||wt.name}:s.includes('work-type-product')?{value:wt.code}:s.includes('name^=')?native:s.includes('data-date-display')?display:null};
U.isGas=()=>true;U.api={createRequest:p=>{captured=p;return Promise.resolve({});}};
const entryToasts=[];U.app={render(){},background(){}};U.ui.closeDialog=()=>{};U.ui.toast=(message)=>entryToasts.push(message);
U.screens.submitNewRequest({querySelectorAll:()=>[row]});
assert.ok(captured,'New request should reach the GAS API: '+entryToasts.join('; '));
assert.equal(captured.items[0].occurrence_date,'2026-10-06','Visible date is authoritative at submit even without input/change event');
assert.equal(native.value,'2026-10-06');
console.log('T+1 date: invalid-date rejection, single/batch/automatic assignment, linked work and stale native form submit passed.');

// Chọn theo thứ: tuần bắt đầu Thứ 2, mỗi dòng điền sẵn hôm nay và vẫn đổi được sang ngày khác.
const S=U.screens;
assert.equal(S.requestWeekStart('2026-10-05'),'2026-10-05');
assert.equal(S.requestWeekStart('2026-10-11'),'2026-10-05','Chủ nhật vẫn thuộc tuần bắt đầu Thứ 2');
assert.equal(S.requestWeekStart('2027-01-01'),'2026-12-28');
assert.equal(S.requestWeekStart('2026-02-30'),'');
assert.equal(S.requestWeekDate('2026-12-28',4),'2027-01-01');
assert.equal(S.requestWeekDate('2026-10-05',7),'2026-10-12');
const firstRow=S.rowForm(0), anotherRow=S.rowForm(0);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
assert.match(firstRow,new RegExp('name="dt_0" value="' + today + '"'),'Ngày phát sinh mặc định hôm nay');
assert.equal((firstRow.match(/data-role="request-weekday"/g)||[]).length,5);
if ([1, 2, 3, 4, 5].includes(new Date(today + 'T12:00:00Z').getUTCDay())) {
  assert.match(firstRow,new RegExp('value="' + today + '" data-role="request-weekday" checked'),'Thứ hôm nay được đánh dấu tương ứng');
}
assert.notEqual(/data-request-weekdays="([^"]+)"/.exec(firstRow)[1],/data-request-weekdays="([^"]+)"/.exec(anotherRow)[1],'Các dòng độc lập cả sau xóa/thêm dòng');
const chosenDate={value:''}, chosenDisplay={value:'',setCustomValidity(){}}, chosenWeek={value:'2026-10-05'};
const box={innerHTML:'',getAttribute:k=>k==='data-request-weekdays'?'request_weekday_test':null,querySelector:()=>chosenWeek};
const dateRow={querySelector:s=>s==='[data-request-weekdays]'?box:(s==='[name^="dt_"]'||s==='[data-request-native-date], [name^="dt_"]')?chosenDate:s==='[data-date-display-for]'?chosenDisplay:null};
S.selectRequestWeekday({checked:true,value:'2026-10-06',closest:()=>dateRow});
assert.equal(chosenDate.value,'2026-10-06');
assert.equal(chosenDisplay.value,'06/10/2026');
assert.match(box.innerHTML,/value="2026-10-06" data-role="request-weekday" checked/);
S.selectRequestWeek({value:'2026-10-12',closest:()=>dateRow});
assert.equal(chosenDate.value,'2026-10-13','Đổi sang tuần sau giữ đúng thứ đã chọn');
assert.equal(chosenDisplay.value,'13/10/2026');
chosenDate.value='2027-01-02'; S.syncRequestWeekdays(dateRow);
assert.match(box.innerHTML,/Tuần 28\/12\/2026/,'Ngày chọn tay ngoài hai tuần vẫn có đúng tuần');
assert.doesNotMatch(box.innerHTML,/data-role="request-weekday" checked/,'Thứ 7/chủ nhật chọn tay không giả thành ngày trong tuần');
assert.match(read('js/app.js'),/S\.syncRequestWeekdays\(display\.closest\('\.row-item'\)\)/);
assert.match(read('js/app.js'),/S\.selectRequestWeekday\(t\)/);
assert.match(read('js/app.js'),/S\.selectRequestWeek\(t\)/);
const nativeOnlyDate={value:''}, nativeOnlyBox={innerHTML:'',getAttribute:k=>k==='data-request-weekdays'?'resend_weekday_test':null,querySelector:()=>({value:'2026-10-05'})};
const nativeOnlyRow={querySelector:s=>s==='[data-request-weekdays]'?nativeOnlyBox:s==='[data-request-native-date], [name^="dt_"]'?nativeOnlyDate:null};
S.selectRequestWeekday({checked:true,value:'2026-10-07',closest:()=>nativeOnlyRow});
assert.equal(nativeOnlyDate.value,'2026-10-07','Quick weekday choice updates the native date field without a secondary display field');
assert.match(nativeOnlyBox.innerHTML,/value="2026-10-07" data-role="request-weekday" checked/);
assert.match(read('js/screens.js'),/data-request-native-date/,'Resend date input is connected to the shared weekday chooser');
assert.match(read('js/screens.js'),/data-min-date=/,'Resend chooser marks earlier dates as unavailable');
console.log('Weekday chooser: today default, single date per row, week switching and manual date synchronization passed.');
