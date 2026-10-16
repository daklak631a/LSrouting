import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const server = { console };
vm.runInNewContext(fs.readFileSync('TimeTracking.gs', 'utf8'), server);
vm.runInNewContext(fs.readFileSync('Code.gs', 'utf8'), server);
const cal = {days:[1,2,3,4,5],open:'07:30',close:'18:00',breakFrom:'11:30',breakTo:'13:30',holidays:[]};
const plan = {period_id:'SEP',name:'Tháng 9',start_date:'2026-09-01',end_date:'2026-09-30',spreadsheet_id:'BOOK',status:'ACTIVE'};
const receipt = '2026-09-28T08:00:00+07:00', now = '2026-09-28T11:00:00+07:00';
const item = {item_id:'A',request_id:'R',period_id:'SEP',work_type_code:'W',product_name:'Vay',source_stt:'PGD_1',
  assigned_user_id:'LS2',status:'HOAN_THANH_LS',submitted_at:'2026-09-28T07:30:00+07:00',dossier_received_at:receipt,accepted_at:receipt,first_assigned_at:receipt,
  processing_started_at:'2026-09-28T09:00:00+07:00',completed_at:'2026-09-28T10:30:00+07:00',due_at:'2026-09-28T11:00:00+07:00',version:3,
  processing_sessions_json:JSON.stringify([{user_id:'LS1',work_type_code:'W',product_name:'Vay',start:'2026-09-28T09:00:00+07:00',end:'2026-09-28T10:00:00+07:00'},
    {user_id:'LS2',work_type_code:'W',product_name:'Vay',start:'2026-09-28T10:00:00+07:00',end:'2026-09-28T10:30:00+07:00'}])};
const parallel = {...item,item_id:'B',work_type_code:'OTHER',processing_sessions_json:JSON.stringify([
  {user_id:'LS1',work_type_code:'OTHER',product_name:'Khác',start:'2026-09-28T09:30:00+07:00',end:'2026-09-28T10:30:00+07:00'}])};
const legacy = {item_id:'LEGACY',request_id:'R',period_id:'SEP',status:'HOAN_THANH_LS',submitted_at:receipt,
  completed_at:item.completed_at,assigned_user_id:'LS2',work_type_code:'W'};
const tables = {WorkItems:[item,parallel,legacy],Requests:[{request_id:'R',unit_id:'PGD',cif:'00123',customer_name:'=IMPORTXML("untrusted")'}],
  Users:[{user_id:'LS1',full_name:'Người thứ nhất'},{user_id:'LS2',full_name:'Người thứ hai'}],
  WorkTypes:[{type_code:'W',display_name:'Hợp đồng',sla_hours:3},{type_code:'OTHER',display_name:'Khác',sla_hours:3}],
  Units:[{unit_id:'PGD',name:'Phòng giao dịch',kind:'DON_VI_GUI',is_active:true,source_tab:'PGD'}],
  Settings:[{key:'source_template_spreadsheet_id',value:'TEMPLATE'},{key:'work_open',value:'07:30'},{key:'work_close',value:'18:00'},{key:'work_break',value:'11:30-13:30'}],CatalogOptions:[],MonthlyPlans:[plan]};

assert.equal(typeof server.buildMonthlyTimeSheets_, 'function', 'Monthly workbook must include dossier timing projections');
const sheets = server.buildMonthlyTimeSheets_(plan,tables,cal,now);
const get = name => sheets.find(s=>s.name===name);
const detail = get('Thời gian hồ sơ'), daily = get('Thời gian theo ngày'), totals = get('Tổng hợp thời gian'), sessions = get('Phiên xử lý');
assert.ok(detail && daily && totals && sessions,'All four sheets are required');
const cell = (sheet,row,label) => sheet.rows[row][sheet.headers.indexOf(label)];
const itemRow = detail.rows.findIndex(r=>r[0]==='A'), legacyRow=detail.rows.findIndex(r=>r[0]==='LEGACY');
assert.equal(cell(detail,itemRow,'Giờ nhận hồ sơ đủ'),'28/09/2026 08:00:00');
assert.equal(cell(detail,itemRow,'Giờ hoàn thành'),'28/09/2026 10:30:00');
assert.equal(cell(detail,itemRow,'Giờ xử lý hồ sơ'),1.5);
const timing = server.LSTiming.metrics(item,cal,now);
assert.equal(timing.toan_trinh,3,'Toàn trình vẫn tính từ lúc gửi đề nghị');
assert.equal(timing.sla_da_dung,2.5,'SLA bắt đầu từ lúc LS nhận đủ hồ sơ');
assert.equal(cell(detail,itemRow,'SLA đã dùng (giờ làm)'),2.5);
assert.equal(cell(detail,itemRow,'Kết quả SLA'),'Đúng hạn');

// Phiên đã khép trong ngày mà làm sau giờ đóng cửa: giờ làm thêm có trong cả bảng hồ sơ lẫn bảng phiên.
const late = {...item,item_id:'LATE',source_stt:'PGD_9',processing_started_at:'2026-09-28T17:30:00+07:00',completed_at:'2026-09-28T18:45:00+07:00',
  processing_sessions_json:JSON.stringify([{user_id:'LS1',work_type_code:'W',product_name:'Vay',start:'2026-09-28T17:30:00+07:00',end:'2026-09-28T18:45:00+07:00'}])};
const lateSheets = server.buildMonthlyTimeSheets_(plan,{...tables,WorkItems:[late]},cal,'2026-09-28T20:00:00+07:00');
const lateDetail = lateSheets.find(s=>s.name==='Thời gian hồ sơ'), lateSessions = lateSheets.find(s=>s.name==='Phiên xử lý');
assert.equal(cell(lateDetail,0,'Giờ xử lý hồ sơ'),1.25,'30 phút trong lịch + 45 phút làm thêm');
assert.equal(cell(lateSessions,0,'Giờ làm trong kỳ'),1.25,'Bảng phiên cộng cùng phần làm thêm');
assert.equal(cell(lateDetail,0,'SLA đã dùng (giờ làm)'),8,'SLA nhận 08:00 đến 18:45 chỉ đếm giờ trong lịch (3,5 + 4,5), không cộng 45 phút làm thêm');
assert.equal(cell(detail,legacyRow,'Giờ nhận hồ sơ đủ'),'');
assert.equal(cell(detail,legacyRow,'SLA đã dùng (giờ làm)'),'');
assert.match(cell(detail,legacyRow,'Chất lượng dữ liệu'),/Thiếu mốc bàn giao/);
const userTotal = totals.rows.find(r=>r[0]==='Cán bộ' && r[2]==='LS1');
assert.equal(userTotal[totals.headers.indexOf('Giờ hồ sơ')],2);
assert.equal(userTotal[totals.headers.indexOf('Giờ cán bộ gộp trùng')],1.5,'Cross-activity overlap must be merged for a staff total');
assert.equal(sessions.rows.length,3);
assert.equal(daily.rows.filter(r=>r[daily.headers.indexOf('Mã cán bộ')]==='LS1').length,2);
const legacyOpen={...legacy,status:'DANG_THUC_HIEN',processing_started_at:'2026-09-28T09:00:00+07:00',completed_at:'',pause_log_json:'[]'};
const openProjection=server.buildMonthlyTimeSheets_(plan,{...tables,WorkItems:[legacyOpen]},cal,now).find(s=>s.name==='Phiên xử lý');
assert.equal(cell(openProjection,0,'Giờ kết thúc phiên'),'','Running legacy sessions must not invent a completion timestamp');

const aug = {...plan,period_id:'AUG',start_date:'2026-08-01',end_date:'2026-08-31'};
const carried = {...item,item_id:'NEXT',period_id:'SEP',origin_item_id:'ORIGIN',completed_at:'2026-09-01T09:00:00+07:00',
  processing_sessions_json:JSON.stringify([{user_id:'LS1',work_type_code:'W',start:'2026-08-31T16:00:00+07:00',end:'2026-09-01T09:00:00+07:00'}])};
const old = {...carried,item_id:'ORIGIN',period_id:'AUG',carried_to_item_id:'NEXT'};
const history = server.buildMonthlyTimeSheets_(aug,{...tables,WorkItems:[old,carried]},cal,now);
assert.equal(history.find(s=>s.name==='Thời gian hồ sơ').rows.length,1);
assert.equal(history.find(s=>s.name==='Phiên xử lý').rows.length,1,'Archived workbook must use the latest lineage without double counting');
assert.equal(history.find(s=>s.name==='Thời gian theo ngày').rows[0][daily.headers.indexOf('Giờ hồ sơ')],2);

// Exercise the actual Sheet writer against an in-memory grid; external GAS services are mocked.
class Sheet {
  constructor(name){this.name=name;this.cells=new Map();this.maxRows=1000;this.maxCols=26;this.filter=null;}
  key(r,c){return r+':'+c;}
  getRange(r,c,h=1,w=1){
    assert.ok(r+h-1<=this.maxRows && c+w-1<=this.maxCols,'Writer must expand the sheet before setting data');
    const self=this,range={
      setValues(values){assert.equal(values.length,h);for(let y=0;y<h;y++){assert.equal(values[y].length,w);for(let x=0;x<w;x++)self.cells.set(self.key(r+y,c+x),values[y][x]);}return range;},
      setValue(v){return range.setValues([[v]]);},getValue(){return self.cells.get(self.key(r,c))||'';},
      getValues(){return Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>self.cells.get(self.key(r+y,c+x))||''));},
      clearContent(){for(let y=0;y<h;y++)for(let x=0;x<w;x++)self.cells.delete(self.key(r+y,c+x));return range;},
      createFilter(){self.filter={remove(){self.filter=null;}};return self.filter;}
    };for(const method of ['setFontWeight','setFontSize','setBackground','setFontColor','setWrap','setNumberFormat'])range[method]=()=>range;
    return range;
  }
  getMaxRows(){return this.maxRows;}getMaxColumns(){return this.maxCols;}
  insertRowsAfter(_,n){this.maxRows+=n;}insertColumnsAfter(_,n){this.maxCols+=n;}
  getLastRow(){return Math.max(0,...[...this.cells.keys()].map(k=>Number(k.split(':')[0])));}
  setFrozenRows(n){this.frozen=n;}setColumnWidth(){}setColumnWidths(){}getFilter(){return this.filter;}
  clearContents(){this.cells.clear();}getFrozenRows(){return this.frozen||0;}
}
const book={sheets:new Map(),getSheetByName(name){return this.sheets.get(name)||null;},insertSheet(name){const sheet=new Sheet(name);this.sheets.set(name,sheet);return sheet;}};
const sourceTab=book.insertSheet('PGD');sourceTab.cells.set('4:7','=SUM(A1:A2)');
book.insertSheet('Tổng hợp');book.insertSheet('Danh mục');
const unmanaged=book.insertSheet('Thời gian hồ sơ');unmanaged.cells.set('1:1','User-owned notes');
server.writeMonthlyTimeSheet_(book,detail,plan,now);
assert.equal(unmanaged.cells.get('1:1'),'User-owned notes','Existing unrelated sheet must not be overwritten');
const managed=[...book.sheets.values()].find(s=>String(s.cells.get('1:1')).startsWith('LS-Routing |')&&s.name.startsWith('Thời gian hồ sơ'));
assert.ok(managed);assert.equal(managed.cells.get('4:'+String(detail.headers.indexOf('Tên khách hàng')+1)),"'=IMPORTXML(\"untrusted\")",'Customer text must never execute as a Sheet formula');
assert.equal(managed.cells.get('4:'+String(detail.headers.indexOf('CIF')+1)),'00123','CIF leading zeros must be retained');
const count=book.sheets.size;
server.writeMonthlyTimeSheet_(book,{...detail,rows:detail.rows.slice(0,1)},plan,now);
assert.equal(book.sheets.size,count,'Repeated sync must reuse the managed tab');
assert.equal(managed.getLastRow(),4,'Shrinking data must remove stale output rows');
assert.equal(sourceTab.cells.get('4:7'),'=SUM(A1:A2)','Source template formulas must remain intact');

const props=new Map();let locked=false;
server.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})};
server.LockService={getScriptLock:()=>({tryLock:()=>!locked,releaseLock(){}})};
server.SpreadsheetApp={openById:()=>book};
server.DataRepository={getAll:name=>tables[name]||[],find:()=>plan,clearCache(){}};
server.stamp_=()=>now;server.repairMonthlySummaryFormulas_=()=>{};server.ensurePlanTabHeader_=()=>{};
server.syncMonthlyPlanWorkbook_('SEP');
assert.ok(book.getSheetByName('Thời gian theo ngày'),'Normal workflow workbook sync must publish timing tables');
assert.ok(props.size,'Successful output must mark the projection version for bootstrap backfill');
const before=book.getSheetByName('Thời gian theo ngày').getLastRow();
tables.WorkItems=[];locked=true;
server.syncMonthlyTimeSheets_(book,plan);
assert.equal(book.getSheetByName('Thời gian theo ngày').getLastRow(),before,'Contended refresh must not partially clear published tables');
locked=false;
server.syncMonthlyTimeSheets_(book,plan);
assert.equal(book.getSheetByName('Thời gian theo ngày').getLastRow(),3,'Empty dataset retains headers and removes old data');
console.log('Monthly Sheet time projection contract passed.');
