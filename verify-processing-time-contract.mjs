import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = { LS: {}, window: {}, localStorage: { getItem: () => null, setItem() {} } };
for (const name of ['core', 'domain']) vm.runInNewContext(fs.readFileSync('js/' + name + '.js', 'utf8'), ctx);
const T = ctx.LSTiming, D = ctx.LS.domain;
const state = D.seed(), cal = { days: [1,2,3,4,5], open:'07:30', close:'18:00', breakFrom:'11:30', breakTo:'13:30', holidays:[] };
state.calendar = cal;
const ts = time => '2026-10-05T' + time + ':00+07:00';
const legacy = { item_id:'A', status:'HOAN_THANH_LS', assigned_user_id:'LS1', work_type_code:'W',
  dossier_received_at:ts('09:33'), processing_started_at:ts('09:33'), completed_at:ts('10:45'),
  processing_sessions_json:'[]', pause_log_json:'[]', sla_pause_log_json:'[]' };
assert.equal(T.metrics(legacy, cal).xu_ly, 1.2, 'Empty session JSON must not erase a measured 72-minute interval');
assert.equal(D.processingLabel(legacy, state), '1 giờ 12 phút', 'Từ 60 phút ghi giờ và phút');
assert.ok(T.sessions(legacy).every(s => !s.user_id), 'Missing historical operator must remain unconfirmed');
const pausedLegacy = { ...legacy, pause_log_json:JSON.stringify([[ts('10:00'),ts('10:15')]]) };
assert.equal(T.metrics(pausedLegacy, cal).xu_ly, 0.95, 'Explicit pause removes exactly 15 minutes');

const A = { ...legacy, status:'DANG_THUC_HIEN', completed_at:'', processing_sessions:[{user_id:'LS1',start:ts('09:33'),end:''}] };
delete A.processing_sessions_json;
const B = { ...A, item_id:'B', dossier_received_at:ts('10:00'), processing_started_at:ts('10:00'), processing_sessions:[{user_id:'LS1',start:ts('10:00'),end:''}] };
B.processing_sessions = T.nextSessions(B, 'TAM_DUNG', ts('10:15'), 'LS1');
B.status = 'TAM_DUNG';
assert.equal(T.metrics(A, cal, ts('10:45')).xu_ly, 1.2, 'Pausing B leaves A running');
assert.equal(T.metrics(B, cal, ts('10:45')).xu_ly, 0.25, 'Paused B remains at 15 minutes');
B.processing_sessions = T.nextSessions(B, 'DANG_THUC_HIEN', ts('10:30'), 'LS1');
B.status = 'DANG_THUC_HIEN';
const report = T.report([A,B], cal, {from:'2026-10-05',to:'2026-10-05',user_id:'LS1',now:ts('10:45')});
assert.equal(report.total.processing_hours, 1.7);
assert.equal(report.total.occupied_hours, 1.2, 'Overlapping dossiers must not double staff occupied time');

const waiting = { ...legacy, processing_sessions:[{user_id:'LS1',start:ts('09:33'),end:ts('09:45')}],
  sla_pause_log:[[ts('09:45'),ts('10:45')]] };
assert.equal(T.metrics(waiting, cal).xu_ly, 0.2);
assert.equal(T.metrics(waiting, cal).nhan_den_xong, 1.2, 'Receipt-to-completion is visible separately from active processing');
assert.equal(D.receiptDurationLabel(waiting, state), '1 giờ 12 phút');
assert.equal(D.processingLabel(waiting, state), '12 phút');
assert.equal(D.processingLabel({...A, processing_sessions:[{user_id:'LS1',start:ts('09:33'),end:ts('09:35')}],completed_at:ts('09:35')},state), '2 phút');
const short = T.nextSessions({...legacy,status:'TAM_DUNG',completed_at:''},'DANG_THUC_HIEN',ts('10:50'),'LS1');
assert.ok(short.length >= 2, 'Resuming a legacy dossier preserves its previous measured interval');

const cancelled = {...legacy,status:'HUY',completed_at:'',updated_at:ts('10:45')};
assert.equal(T.metrics(cancelled,cal,ts('17:00')).nhan_den_xong,1.2,'Canceled dossier does not keep accumulating time');

// Exercise the real DOM clock updater without replacing a dialog or calling GAS.
vm.runInNewContext(fs.readFileSync('js/ui.js','utf8'),ctx);
vm.runInNewContext(fs.readFileSync('js/screens.js','utf8'),ctx);
state.session=state.users.find(u=>u.role==='CAN_BO_LS').user_id;
state.items=[A]; ctx.LS.replace(state);
const nodes=['processing','receipt'].map(kind=>({kind,textContent:'old',getAttribute(){return 'A';}}));
ctx.document={querySelectorAll:selector=>nodes.filter(n=>selector==='[data-'+n.kind+'-clock]')};
ctx.LS.screens.refreshClocks(new Date(ts('10:45')));
assert.equal(nodes[0].textContent,'1 giờ 12 phút');
assert.equal(nodes[1].textContent,'1 giờ 12 phút');
ctx.LS.screens.refreshClocks(new Date(ts('10:46')));
assert.equal(nodes[0].textContent,'1 giờ 13 phút');

const received={item_id:'REC',status:'DANG_THUC_HIEN',assigned_user_id:state.session,work_type_code:state.workTypes[0].code,version:1};
state.items=[received];
ctx.LS.app={render(){}};ctx.LS.ui.dialogOpen=()=>false;ctx.LS.ui.toast=()=>{};
ctx.LS.screens.confirmDossierReceipt('REC');
assert.equal(received.processing_started_at,received.dossier_received_at,'Legacy receipt checkbox must start a processing clock');
assert.equal(received.processing_sessions.length,1);
assert.equal(received.processing_sessions[0].user_id,state.session);

console.log('Exact minute display, legacy fallback, independent pause/resume, waiting breakdown and staff overlap passed.');
