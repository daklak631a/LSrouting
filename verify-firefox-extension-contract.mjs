import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8'), props=new Map(), cache=new Map();
const users=[{user_id:'KS',role:'KS_LS',is_active:true},{user_id:'QL',role:'QUAN_LY_LS',is_active:true},
  {user_id:'GS',role:'GIAM_SAT',is_active:true},{user_id:'CB',role:'CAN_BO_LS',is_active:true}];
const token='a'.repeat(64),exp=Date.now()+3600000;
props.set('LS_SESS_'+token,JSON.stringify({u:'KS',exp}));
const db=[{item_id:'A',request_id:'R1',period_id:'P',status:'CHO_PHAN_CONG',submitted_at:'T'},
  {item_id:'B',request_id:'R1',period_id:'P',status:'CHO_PHAN_CONG',submitted_at:'T'},
  {item_id:'C',request_id:'R2',period_id:'P',status:'HUY'},
  {item_id:'D',request_id:'R3',period_id:'OLD',status:'CHO_PHAN_CONG'},
  {item_id:'E',request_id:'R4',period_id:'P',status:'CHO_PHAN_CONG',assigned_user_id:'CB'},
  {item_id:'F',request_id:'R5',period_id:'P',status:'HOAN_THANH_LS'}].map(i=>({...i,occurrence_date:'2026-10-07'}));
const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Utilities:{formatDate:()=> '2026-10-07',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(alg,s)=>[...crypto.createHash(alg).update(s).digest()]},
  DataRepository:{getAll:n=>n==='Users'?users:db,find:(n,k,v)=>users.find(u=>u[k]===v)||null},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}};
vm.runInNewContext(read('Code.gs'),ctx);
ctx.activePlan_=()=>({period_id:'P'});
const connection=ctx.api({name:'connectFirefoxExtension',token});
assert.notEqual(connection.token,token);assert.match(connection.token,/^qe1_[a-f0-9]{64}$/);
assert.equal(connection.expires_at,exp);
const post=t=>ctx.doPost({postData:{contents:JSON.stringify({action:'assignment_queue',token:t})}});
let response=post(connection.token);
assert.equal(response.ok,true);assert.equal(response.data.count,1,'Multiple work items in one request count as one dossier');
assert.ok(!JSON.stringify(response).includes(token),'App session token must never be returned');
assert.deepEqual(Object.keys(response.data.waiting[0]).sort(),['key','stamp']);
assert.equal(ctx.REQUEST_,null,'HTTP auth context must be restored');
assert.equal(post(token).code,'INVALID');
for(const role of ['QUAN_LY_LS','GIAM_SAT','CAN_BO_LS','PHONG_PGD','ADMIN']) {
  users[0].role=role;
  assert.equal(post(connection.token).ok,role==='QUAN_LY_LS','Feed accepts exactly KS/QL LS');
}
users[0].role='KS_LS';users[0].must_change_password=true;
assert.equal(post(connection.token).code,'FORBIDDEN');users[0].must_change_password=false;
users[0].is_active=false;assert.equal(post(connection.token).code,'FORBIDDEN','Locked account must revoke feed');users[0].is_active=true;
ctx.endSession_(token);assert.equal(post(connection.token).code,'SESSION','Logout revokes extension token');
assert.equal(ctx.doPost({postData:{contents:JSON.stringify({action:'transitionItem',token:connection.token})}}).code,'INVALID','HTTP cannot write operations');
assert.equal(ctx.doPost({postData:{contents:'x'.repeat(5000)}}).code,'INVALID');

const ext={};vm.runInNewContext(read('extension-firefox/queue.js')+'\nthis.compare=LS_QUEUE.compare;',ext);
const data=waiting=>({period_id:'P',count:waiting.length,waiting});
const initial=ext.compare(null,data([{key:'R1',stamp:'A:T|B:T'}]));
assert.equal(initial.fresh,1);
assert.equal(ext.compare(initial.snapshot,data([{key:'R1',stamp:'A:T|B:T'}])).fresh,0,'Repeated poll must not notify twice');
assert.equal(ext.compare(initial.snapshot,data([{key:'R1',stamp:'B:T'}])).fresh,0,'Partial assignment must not create a new notification');
assert.equal(ext.compare(initial.snapshot,data([{key:'R1',stamp:'A:T|B:T|C:T'}])).fresh,1,'Adding new work to a waiting dossier notifies once');
assert.equal(ext.compare(initial.snapshot,data([])).count,0);
assert.throws(()=>ext.compare(null,{period_id:'P',count:2,waiting:[]}),/Invalid queue/);

// Số badge giữ mọi hồ sơ chờ; thông báo chỉ theo ngày phát sinh hiện tại.
db[0].occurrence_date='2026-10-06';db[1].occurrence_date='2026-10-08';
db.push({item_id:'TODAY',request_id:'R_TODAY',period_id:'P',status:'CHO_PHAN_CONG',occurrence_date:'2026-10-07',submitted_at:'T'});
db.push({item_id:'RETURNED',request_id:'R_RETURNED',period_id:'P',status:'CHUA_GIAO_HO_SO',occurrence_date:'2026-10-07'});
let dailyFeed=ctx.assignmentQueueSignal_();
assert.equal(dailyFeed.count,2);
assert.deepEqual(Array.from(dailyFeed.notify_waiting,r=>r.key),['R_TODAY']);
const daily=ext.compare(null,dailyFeed);
assert.equal(daily.count,2);assert.equal(daily.fresh,1);
assert.equal(ext.compare(daily.snapshot,dailyFeed).fresh,0);
ctx.Utilities.formatDate=()=> '2026-10-08';
dailyFeed=ctx.assignmentQueueSignal_();
assert.deepEqual(Array.from(dailyFeed.notify_waiting,r=>r.key),['R1']);
const tomorrow=ext.compare(daily.snapshot,dailyFeed);
assert.equal(tomorrow.count,2);assert.equal(tomorrow.fresh,1);assert.equal(tomorrow.dayChanged,true);

// Run the actual Firefox background script with fake WebExtension APIs.
let store={},notifications=0,badge='',fetches=0;const handlers={},alarm={};
const listener=k=>({addListener:fn=>{handlers[k]=fn;}});
const browser={storage:{local:{get:async key=>key==='auth'?{auth:store.auth}:{...store},set:async values=>{Object.assign(store,values);},clear:async()=>{store={};}}},
  action:{setBadgeText:async({text})=>{badge=text;},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
  notifications:{create:async()=>{notifications++;},clear:async()=>{},onClicked:listener('clicked')},
  runtime:{getURL:p=>'moz-extension://local/'+p,onMessage:listener('message'),onInstalled:listener('installed'),onStartup:listener('startup')},
  alarms:{get:async()=>alarm,create:async()=>{},onAlarm:listener('alarm')},tabs:{query:async()=>[],create:async()=>{}}};
let feed={ok:true,user_id:'KS',role:'KS_LS',data:data([{key:'R1',stamp:'A:T'}])};
const bg={browser,URL,AbortSignal,fetch:async(url,opts)=>{fetches++;assert.equal(opts.method,'POST');assert.ok(!url.includes('qe1_'));return{ok:true,json:async()=>feed};}};
vm.runInNewContext(read('extension-firefox/config.js')+'\n'+read('extension-firefox/queue.js')+'\n'+read('extension-firefox/background.js')+'\nthis.pollNow=check;',bg);
const url='https://script.google.com/macros/s/AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH/exec';
const sender={tab:{id:7,url},url:'https://abc-script.googleusercontent.com/userCodeAppPanel'};
assert.equal((await handlers.message({type:'PAIR',data:connection},{...sender,tab:{id:8,url:'https://script.google.com/macros/s/other/exec'}})).connected,false);
await handlers.message({type:'PAIR',data:connection},sender);await bg.pollNow();
assert.equal(badge,'1');assert.equal(notifications,1);
await bg.pollNow();assert.equal(notifications,1);
feed={...feed,data:data([])};await bg.pollNow();assert.equal(badge,'');
const popup={url:'moz-extension://local/popup.html'};
assert.ok(!JSON.stringify(await handlers.message({type:'STATUS'},popup)).includes(connection.token),'Popup status must omit scoped token');
feed={ok:false,code:'SESSION'};await bg.pollNow();assert.equal(store.auth,undefined);assert.ok(fetches>=3);

// Page bridge: session restoration must not disconnect/destroy the notification baseline.
let bridgeHandler,reply,opened=0;
const page={LS:{},localStorage:{getItem:()=>null,setItem(){}},window:{location:{origin:'https://app.googleusercontent.com'},
  addEventListener:(event,fn)=>{bridgeHandler=fn;},postMessage:msg=>{reply=msg.data;}}};
vm.runInNewContext(read('js/core.js'),page);
vm.runInNewContext(read('js/gas-api.js'),page);
page.LS.api.hasSession=()=>true;
page.LS.api.connectFirefoxExtension=()=>Promise.resolve(connection);
const request={source:page.window,data:{channel:'LS_ROUTING_FIREFOX_V1',direction:'request',action:'CONNECT',id:'test_pair_1'}};
bridgeHandler(request);assert.equal(reply.retry,true,'While restoring user state, keep existing extension connection');
page.LS.replace({users:[{user_id:'KS',role:'KS_LS'}],session:'KS'});
bridgeHandler(request);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(reply.token,connection.token);
page.LS.api.hasSession=()=>false;bridgeHandler(request);assert.equal(reply.disconnected,true);
page.LS.app={showAssignmentQueue:()=>{opened++;}};
bridgeHandler({...request,data:{...request.data,action:'OPEN_QUEUE'}});assert.equal(opened,1);
console.log('Firefox queue: scoped auth, KS/QL roles, logout revocation, no write/PII, count/dedup, background badge, session expiry passed.');
