import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8');
const ctx={};vm.runInNewContext(read('Code.gs'),ctx);
assert.equal(typeof ctx.normalizePhone_,'function','Phone normalization must exist before persistence and sending');
const ui={LS:{},localStorage:{getItem:()=>null},window:{}};vm.runInNewContext(read('js/core.js'),ui);
for(const [input,expected] of [['0942739739','0942739739'],[942739739,'0942739739'],['+84 942 739 739','0942739739'],['009123','009123'],['942739739','942739739'],['','']]) {
  assert.equal(ctx.normalizePhone_(input),expected);assert.equal(ui.LS.normalizePhone(input),expected);
}
assert.throws(()=>ctx.validatePhone_('942739739'),/điện thoại/);
assert.throws(()=>ctx.validateEmail_('a@'),/email/i);
assert.equal(ctx.validateEmail_(' STAFF@EXAMPLE.VN '),'staff@example.vn');

// Emulate Sheets interpreting unformatted digit strings as numbers.
const values=[['request_id','phone','cif'],['OLD',942739739,'00123']],formats={};
const sheet={getLastRow:()=>values.length,getLastColumn:()=>values[0].length,getDataRange:()=>({getValues:()=>values.map(r=>r.slice())}),
  getRange:(r,c,n=1,w=1)=>({setNumberFormat(){for(let y=r;y<r+n;y++)for(let x=c;x<c+w;x++)formats[y+':'+x]=true;return this;},
    getValues:()=>values.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValues:rows=>rows.forEach((row,y)=>row.forEach((v,x)=>{values[r+y-1][c+x-1]=coerce(v,r+y,c+x);} ))}),
  appendRow:row=>values.push(row.map((v,x)=>coerce(v,values.length+1,x+1)))};
function coerce(v,r,c){return !formats[r+':'+c]&&typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;}
ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'SHEET'})};ctx.SpreadsheetApp={openById:()=>({getSheetByName:()=>sheet})};
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
vm.runInNewContext(read('DataRepository.gs'),ctx);
ctx.DataRepository.tx(t=>t.append('Requests',{request_id:'NEW',phone:'0942739739',cif:'000157110'}));
assert.equal(values[2][1],'0942739739','Underlying Sheet must preserve initial zero');assert.equal(values[2][2],'000157110');
ctx.DataRepository.clearCache();assert.equal(ctx.DataRepository.getAll('Requests')[0].phone,'0942739739','Numeric legacy mobile repaired on read');
ctx.DataRepository.tx(t=>t.write(t.find('Requests','request_id','NEW'),{phone:'0987654321',cif:'000012'}));
assert.equal(values[2][1],'0987654321');assert.equal(values[2][2],'000012');
values.push(['OLD_TEXT','942739739','00123']);ctx.DataRepository.clearCache();
assert.equal(ctx.DataRepository.getAll('Requests')[2].phone,'0942739739','Legacy phone text in storage must also recover its lost zero');
assert.equal(ctx.normalizePhone_('123456789',true),'123456789','Unrecognized legacy prefix must not be guessed');

let seq=0;ctx.Utilities={getUuid:()=>String(++seq).padStart(32,'0')};
ctx.Session={getScriptTimeZone:()=> 'Asia/Ho_Chi_Minh'};ctx.Utilities.formatDate=()=> '2026-09-29';
vm.runInNewContext(read('Notifications.gs'),ctx);
const item={item_id:'I',request_id:'R',assigned_user_id:'LS',work_type_code:'W',completed_at:'2026-09-29T09:00:00+07:00',appointment_json:JSON.stringify({date:'2026-09-30',time:'09:00',at:'2026-09-30T09:00:00+07:00',place:'PGD 1',channel:'SMS'})};
const tables={Requests:[{request_id:'R',unit_id:'U',created_by:'SENDER',requestor_id:'SENDER',customer_name:'Khách thử',phone:'0942739739'}],
  Users:[{user_id:'SENDER',unit_id:'U',role:'PHONG_PGD',is_active:true,email:'sender@example.vn'},
    {user_id:'MANAGER',unit_id:'U',role:'PHONG_PGD',is_active:true,email:'manager@example.vn',receive_completion_email:true},
    {user_id:'OTHER',unit_id:'U',role:'PHONG_PGD',is_active:true,email:'other@example.vn'},
    {user_id:'OUTSIDE',unit_id:'X',role:'PHONG_PGD',is_active:true,email:'outside@example.vn',receive_completion_email:true}],
  WorkItems:[item],Units:[{unit_id:'U',name:'PGD 1'}],WorkTypes:[{type_code:'W',display_name:'Giải ngân'}],Settings:[],
  NotifyRules:[{rule_id:'R9',event:'HOAN_THANH_LS',audience:'PHONG_PHU_TRACH',channels:'EMAIL',template_code:'TPL_DONE_INTERNAL',enabled:true,needs_confirm:false}],
  Templates:[{code:'TPL_DONE_INTERNAL',channel:'EMAIL',status:'DA_DUYET',subject:'Xong {{ma_viec}}',body:'{{lich_hen}} · {{can_bo_ls}}'}],
  Channels:[{code:'EMAIL',status:'HOAT_DONG',enabled:true,test_mode:false,config_json:JSON.stringify({sender:'ls@example.vn',mode:'MAILAPP',scope_ok:true,daily_quota:100,used_today:0})}],NotificationIdempotency:[],NotificationOutbox:[],NotificationMetrics:[]};
const tx={rows:n=>tables[n]||[],find:(n,k,v)=>{const object=(tables[n]||[]).find(x=>x[k]===v);return object?{object}:null;},
  append:(n,r)=>(tables[n]||(tables[n]=[])).push(r),write:(f,d)=>Object.assign(f.object,d),tail:(n,count)=>(tables[n]||[]).slice(-count)};
// Chỉ đúng cán bộ đã đưa hồ sơ (SENDER) nhận email; MANAGER cùng đơn vị dù bật
// receive_completion_email cũng KHÔNG nhận, OTHER/OUTSIDE cũng không.
assert.equal(ctx.Notifications.queue(tx,item,'HOAN_THANH_LS','LS'),1);
assert.deepEqual(tables.NotificationOutbox.map(r=>r.recipient).sort(),['sender@example.vn']);
assert.ok(tables.NotificationOutbox.every(r=>r.channel==='EMAIL'&&r.status==='CHO_GUI'&&r.body.includes('30/09/2026')&&r.body.includes('09:00')));
assert.equal(ctx.Notifications.queue(tx,item,'HOAN_THANH_LS','LS'),0,'Completion must not queue duplicates');
assert.equal(ctx.Notifications.addressFor('SMS',{kind:'KHACH',phone:'942739739'}),'','Ambiguous legacy text must not be sent');
tables.Users.find(x=>x.user_id==='MANAGER').is_active=false;
const retryItem={...item,item_id:'I2'};tables.WorkItems.push(retryItem);
assert.equal(ctx.Notifications.queue(tx,retryItem,'HOAN_THANH_LS','LS'),1,'Locked manager must not receive dossier email');
tables.Users.find(x=>x.user_id==='SENDER').email='';
const missingItem={...item,item_id:'I3',appointment_json:'{}'};tables.WorkItems.push(missingItem);
ctx.Notifications.queue(tx,missingItem,'HOAN_THANH_LS','LS');
const missing=tables.NotificationOutbox.find(x=>x.item_id==='I3');
assert.equal(missing.status,'KHONG_GUI');assert.match(missing.note,/email/);
tables.Users.find(x=>x.user_id==='SENDER').email='sender@example.vn';
const noAppointment={...item,item_id:'I5',appointment_json:'{}'};tables.WorkItems.push(noAppointment);
ctx.Notifications.queue(tx,noAppointment,'HOAN_THANH_LS','LS');
assert.match(tables.NotificationOutbox.find(x=>x.item_id==='I5').body,/Chưa có lịch hẹn/);
assert.equal(ctx.Notifications.queue(tx,{...item,item_id:'I4'},'HOAN_THANH_LS','LS',null,'IN_APP'),0,'Explicit internal-only must not enqueue email');

for(const name of ['domain','ui','charts','screens','admin'])vm.runInNewContext(read('js/'+name+'.js'),ui);
const state=ui.LS.domain.seed(), ls=state.users.find(x=>x.role==='CAN_BO_LS');state.session=ls.user_id;
const work=state.items.find(x=>x.assigned_user_id===ls.user_id);work.status='DA_SOAN_XONG';
state.workTypes.find(x=>x.code===work.work_type_code).needs_ks_approval=false;
work.appointment={at:'2026-09-30T02:00:00.000Z',date:'2026-09-30',time:'09:00',place:'PGD 1'};
ui.LS.replace(state);let dialog='';ui.LS.ui.openDialog=(title,body)=>dialog=body;ui.LS.ui.toast=()=>{};
ui.LS.screens.flow(work.item_id,'HOAN_THANH_LS');
assert.match(dialog,/value="DEFAULT" checked/);assert.match(dialog,/Email Phòng\/PGD/);assert.match(dialog,/Lịch hẹn KH/);
state.session=state.users.find(x=>x.role==='ADMIN').user_id;ui.LS.admin.userDialog();assert.match(dialog,/receive_completion_email/);
console.log('Contact text persistence, legacy numeric recovery, email routing, appointment context and idempotency passed.');
