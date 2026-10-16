import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = { LS: {}, localStorage: { getItem: () => null, setItem() {} }, console };
vm.createContext(ctx);
for (const name of ['core', 'domain']) vm.runInContext(fs.readFileSync('js/' + name + '.js', 'utf8'), ctx);
assert.ok(fs.existsSync('js/planning.js'), 'Bộ kế hoạch cá nhân chưa được triển khai');
vm.runInContext(fs.readFileSync('js/planning.js', 'utf8'), ctx);
const P = ctx.LSPlanning, D = ctx.LS.domain;
const plain = x => JSON.parse(JSON.stringify(x));
const users = ['A', 'B', 'C'].map(user_id => ({ user_id, full_name: user_id, role: 'CAN_BO_LS', active: true }));
const state = { users, items: [], workTypes: [{ code: 'VAY', group: 'Món', name: 'Vay món' }], other_work: [], calendar: { days: [1,2,3,4,5], holidays: [] }, staffPlans: [] };
const per = P.period('week', '2026-10-14');
assert.equal(per.start, '2026-10-12'); assert.equal(per.end, '2026-10-18');
assert.equal(P.previous(per).start, '2026-10-05');
assert.equal(P.period('quarter', '2026-12-31').start, '2026-10-01');
assert.equal(P.previous(P.period('month','2026-01-01')).start, '2025-12-01');
assert.throws(() => P.period('week','2026-02-30'), /ngày/i);
assert.equal(P.workDays(per, state.calendar, users[0]), 5);
assert.equal(P.workDays(per, state.calendar, { ...users[0], availability_status: 'OFF', off_from: '2026-10-13', off_to: '2026-10-14' }), 3);
assert.equal(P.workDays(per, { days: [0], holidays: ['2026-10-18'] }, users[0]), 0);
state.items = [
 { item_id:'I1',work_type_code:'VAY', status:'HOAN_THANH_LS', assigned_user_id:'B', completed_at:'2026-10-14T03:00:00Z', result_credit:{ HD_TIN_DUNG:{user_id:'A',at:'2026-10-13T03:00:00Z',quantity:3} }, result_flags:{RLOS:true} },
 { item_id:'OLD',carried_to_item_id:'NEW',status:'HOAN_THANH_LS',work_type_code:'VAY',assigned_user_id:'B',completed_at:'2026-10-14T03:00:00Z' },
 { item_id:'CANCEL',status:'HUY',assigned_user_id:'A',result_credit:{HD_TIN_DUNG:{user_id:'A',at:'2026-10-13',quantity:99}} }
];
let c = P.context(state,D,'2026-10-15');
let evaluation = P.evaluate(c,per,[]);
assert.equal(evaluation.rows.find(x=>x.user_id==='A').actual.HD_TIN_DUNG,3,'Ghi đúng người làm và số lượng');
assert.equal(evaluation.rows.find(x=>x.user_id==='B').actual.HD_TIN_DUNG || 0,0,'Không chuyển kết quả sang người nhận cuối');
assert.equal(evaluation.rows.find(x=>x.user_id==='B').actual.RLOS,1);
assert.equal(evaluation.rows[0].ratios.HD_TIN_DUNG,null,'Chưa giao khác với đạt 0%');
let suggestion=P.suggest(c,per,'HD_TIN_DUNG',12,{A:4});
assert.equal(suggestion.values.A,4);assert.equal(Object.values(suggestion.values).reduce((a,b)=>a+b,0),12);
state.users[1]={...users[1],availability_status:'OFF',off_from:'2026-10-12',off_to:'2026-10-18'};
c=P.context(state,D,'2026-10-15');
suggestion=P.suggest(c,per,'HD_TIN_DUNG',11,{});
assert.equal(suggestion.values.B,0,'Nghỉ trọn kỳ không có chỉ tiêu gợi ý');
assert.throws(()=>P.suggest(c,per,'HD_TIN_DUNG',3,{A:4}), /khóa|tổng/i);
const month=P.period('month','2026-10-01');
const plans=[{...month,plan_id:month.key,lines:[{user_id:'A',targets:{HD_TIN_DUNG:30}}]}];
assert.equal(P.target(plans,'A','HD_TIN_DUNG',P.period('week','2026-10-26'),state.calendar).source,'month');
assert.equal(P.target(plans,'A','HD_TIN_DUNG',month,state.calendar).value,30);
assert.equal(P.target([{...month,lines:[{user_id:'A',targets:{TON_TIN_DUNG:2}}]}],'A','TON_TIN_DUNG',per,state.calendar).value,2,'Trần tồn là số tại cuối kỳ, không chia theo ngày');
state.users=users;state.items=[{item_id:'OPEN',status:'DANG_THUC_HIEN',work_type_code:'VAY',assigned_user_id:'A',occurrence_date:'2026-10-12',due_at:'2026-10-13T03:00:00Z'}];
c=P.context(state,D,'2026-10-15');
let ranked=P.rank(c,{item_id:'NEW',work_type_code:'VAY'},{});
assert.notEqual(ranked[0].user_id,'A','Ưu tiên tải thấp khi chưa có kế hoạch');
assert.ok(ranked[0].reasons.length);
const reserved={};const first=ranked[0].user_id;reserved[first]=10;
assert.notEqual(P.rank(c,{item_id:'NEW',work_type_code:'VAY'},reserved)[0].user_id,first,'Tải dự kiến được cộng dồn khi giao lô');
assert.deepEqual(plain(state.items[0].status),'DANG_THUC_HIEN','Gợi ý không sửa hồ sơ');
assert.ok(P.hierarchyIssues([
 { ...P.period('month','2026-10-01'),lines:[{user_id:'A',targets:{HD_TIN_DUNG:10}}] },
 { ...per,lines:[{user_id:'A',targets:{HD_TIN_DUNG:20}}] }
],state.calendar).length,'Chặn giao kỳ con vượt kỳ cha');
assert.equal(P.hierarchyIssues([
 { ...P.period('month','2026-10-01'),lines:[{user_id:'A',targets:{HD_TIN_DUNG:50}}] },
 { ...per,lines:[{user_id:'A',targets:{HD_TIN_DUNG:20}}] }
],state.calendar).length,0);
const nested=[{...P.period('quarter','2026-10-01'),lines:[{user_id:'A',targets:{HD_TIN_DUNG:40}}]},
 {...month,lines:[{user_id:'A',targets:{HD_TIN_DUNG:40}}]}, {...per,lines:[{user_id:'A',targets:{HD_TIN_DUNG:40}}]}];
assert.equal(P.hierarchyIssues(nested,state.calendar).length,0,'Không cộng tuần lần nữa khi đã nằm trong tháng');
assert.equal(P.target(nested.slice(1),'A','HD_TIN_DUNG',nested[0],state.calendar).value,40,'Quý tổng hợp tháng, không cộng trùng tuần');
assert.equal(P.target(nested.slice(1),'A','HD_TIN_DUNG',P.period('week','2026-10-19'),state.calendar).value,0,'Phân bổ tuần đã dùng hết chỉ tiêu tháng');
state.items=[{item_id:'DONE',status:'HOAN_THANH_LS',work_type_code:'VAY',assigned_user_id:'A',completed_at:'2026-10-14T03:00:00Z',due_at:'2026-10-14T04:00:00Z',dossier_received_at:'2026-10-13T03:00:00Z',dossier_received_by:'A'}];
c=P.context(state,D,'2026-10-15');evaluation=P.evaluate(c,per,[]);
assert.equal(evaluation.rows.find(x=>x.user_id==='A').onTimeRate,100,'Đánh giá đúng hạn theo hồ sơ đủ mốc');
assert.equal(evaluation.rows.find(x=>x.user_id==='A').received,1,'Đầu vào được nhận khác với số kết quả');
const oldEvaluation=P.evaluate(c,P.previous(per),[]);
assert.equal(oldEvaluation.rows[0].backlog,null,'Không dùng tồn hiện tại làm tồn cuối kỳ trước');
state.items=[];state.activity_credits=[2,3].map(quantity=>({work_type_code:'VAY',result_credit:{HD_TIN_DUNG:{user_id:'A',at:'2026-10-13T03:00:00Z',quantity}}}));
assert.equal(P.evaluate(P.context(state,D,'2026-10-15'),per,[]).rows.find(x=>x.user_id==='A').actual.HD_TIN_DUNG,5,'Hai phần ghi nhận ẩn mã hồ sơ vẫn cộng đủ số lượng');
state.users[0]={...users[0],availability_status:'AVAILABLE',off_from:'2026-10-12',off_to:'2026-10-18'};
assert.equal(P.workDays(per,state.calendar,state.users[0]),0,'Khoảng nghỉ đã khai báo vẫn có hiệu lực như luật hiện hành');
const supplyPeriods=['2026-10-05','2026-09-28','2026-09-21'].map(d=>P.period('week',d));
const supplyUser={...users[0],availability_status:'AVAILABLE',off_from:'',off_to:''};
const supply={...c,users:[supplyUser],events:supplyPeriods.map(q=>({user_id:'A',key:'HD_TIN_DUNG',day:q.start,quantity:5})),intakes:[],
 plans:supplyPeriods.map(q=>({...q,lines:[{user_id:'A',targets:{HD_TIN_DUNG:30}}]}))};
assert.equal(P.capacity(supply,supplyUser,per,'HD_TIN_DUNG').confidence,'SUPPLY_LIMITED','Chưa đủ đầu vào thì không tự suy ra cán bộ yếu');
assert.equal(P.suggest(supply,per,'HD_TIN_DUNG',30,{}).unallocated,0,'Không ép hạ chỉ tiêu do dữ liệu đầu vào thiếu');
assert.equal(P.evaluate({...c,users:[supplyUser]},month,nested.slice(1)).rows[0].expected.HD_TIN_DUNG,32,'Nhịp lũy kế theo lịch phân bổ tuần, không chia đều lại toàn tháng');
console.log('Staff planning: periods, leave, attributed quantities, missing plans, pinned allocation, hierarchy and balanced assignment passed.');
