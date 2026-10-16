// Generated from js/planning.js and js/domain.js.
/* Shared planning engine. Generated into Planning.gs by build-gas.mjs. */
var LSPlanning = (function () {
  'use strict';
  var KEYS = ['HD_THE_CHAP','HD_TIN_DUNG','NHAP_KHO','XUAT_KHO','RLOS','TON_THE_CHAP','TON_TIN_DUNG'];
  function date(value) {
    var s = String(value || ''), d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      d = new Date(s + 'T00:00:00Z');
      if (isFinite(d.getTime()) && d.toISOString().slice(0,10) === s) return s;
    } else if (s) {
      d = new Date(s);
      if (isFinite(d.getTime())) return new Date(d.getTime()+7*3600000).toISOString().slice(0,10);
    }
    throw new Error('Ngày kế hoạch không hợp lệ.');
  }
  function add(day, n) { var d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  function period(type, value) {
    var day=date(value), d=new Date(day+'T00:00:00Z'), start,end;
    if (type==='week') { start=add(day,-((d.getUTCDay()+6)%7));end=add(start,6); }
    else if (type==='month' || type==='quarter') {
      var month=type==='quarter'?Math.floor(d.getUTCMonth()/3)*3:d.getUTCMonth();
      start=new Date(Date.UTC(d.getUTCFullYear(),month,1)).toISOString().slice(0,10);
      end=new Date(Date.UTC(d.getUTCFullYear(),month+(type==='quarter'?3:1),0)).toISOString().slice(0,10);
    } else throw new Error('Chọn kỳ tuần, tháng hoặc quý.');
    return {type:type,start:start,end:end,key:type+':'+start};
  }
  function previous(p) { return period(p.type,add(p.start,-1)); }
  function active(u) { return u.role==='CAN_BO_LS' && u.active!==false && String(u.is_active).toLowerCase()!=='false'; }
  function off(u,day) {
    if (String(u.availability_status || '').toUpperCase()!=='OFF' && !u.off_from && !u.off_to) return false;
    return (!u.off_from || day>=String(u.off_from).slice(0,10)) && (!u.off_to || day<=String(u.off_to).slice(0,10));
  }
  function each(p,fn) { for(var d=p.start;d<=p.end;d=add(d,1))fn(d); }
  function working(day,cal) { return (cal.days || [1,2,3,4,5]).indexOf(new Date(day+'T00:00:00Z').getUTCDay())!==-1 && (cal.holidays || []).indexOf(day)===-1; }
  function workDays(p,cal,u) { var n=0;each(p,function(d){if(working(d,cal||{}) && (!u || !off(u,d)))n++;});return n; }
  function byId(rows,key,id) { return (rows || []).filter(function(r){return r[key]===id;})[0]; }
  function context(st,D,now) {
    var at=now || new Date().toISOString(),today=date(at),events=[],outcomes=[],intakes=[],seen={},items=st.items || [],types=st.workTypes || [],parents={};
    items.forEach(function(i){ if(i.parent_item_id && D.collateralStepKeys(i,byId(types,'code',i.work_type_code)||{}).indexOf('HD_THE_CHAP')!==-1)parents[i.parent_item_id]=true; });
    function push(i,k,u,at,q) {
      if(!u || !at || KEYS.indexOf(k)===-1)return;
      var day=date(at), root=i.origin_item_id || i.item_id, key=[root,k,u,day,at].join('|');
      if(root && seen[key])return;if(root)seen[key]=true;
      events.push({user_id:u,key:k,day:day,quantity:Math.max(1,Math.floor(Number(q)||1)),work_type_code:i.work_type_code});
    }
    items.concat(st.activity_credits || []).forEach(function(i){
      if(i.status==='HUY')return;
      var wt=byId(types,'code',i.work_type_code)||{},childMortgage=parents[i.item_id] && D.dailyIsCredit(i,wt);
      D.creditedParts(i,wt).forEach(function(p){if(!(childMortgage && p.key==='HD_THE_CHAP'))push(i,p.key,p.user_id,p.at,p.quantity);});
      if(i.status==='HOAN_THANH_LS' && !i.carried_to_item_id)D.dailyActivityKeys(i,wt).forEach(function(k){if(!(childMortgage && k==='HD_THE_CHAP'))push(i,k,i.assigned_user_id,i.completed_at,1);});
    });
    items.forEach(function(i){
      if(i.status==='HUY' || i.carried_to_item_id)return;
      var wt=byId(types,'code',i.work_type_code)||{},exempt=!!i.sla_exempt || (D.slaExempt?D.slaExempt(i,st):false);
      if(i.status==='HOAN_THANH_LS' && i.completed_at)outcomes.push({user_id:i.assigned_user_id,day:date(i.completed_at),timed:!!i.due_at && !exempt,onTime:!!i.due_at && new Date(i.completed_at)<=new Date(i.due_at),exempt:exempt});
      if(i.dossier_received_at) {
        var pending=Object.assign({},i,{result_credit:{},result_credit_json:'{}'}),expected={};
        D.handoverPartsFor(pending,wt).forEach(function(part){expected[part.key]=Math.max(1,Number(part.key==='HD_THE_CHAP'?i.requested_mortgage_contract_count:part.key==='XUAT_KHO'?i.requested_export_folder_count:1)||1);});
        intakes.push({user_id:i.dossier_received_by || i.assigned_user_id,day:date(i.dossier_received_at),expected:expected});
      }
    });
    var historicalUsers=(st.users || []).filter(function(u){return u.role==='CAN_BO_LS';}),users=historicalUsers.filter(active),loads={};
    historicalUsers.forEach(function(u){loads[u.user_id]={open:0,late:0,backlog:{},byType:{}};});
    items.forEach(function(i){
      var l=loads[i.assigned_user_id];
      if(!l || i.carried_to_item_id || !D.STATUS[i.status] || !D.STATUS[i.status].open || String(i.occurrence_date || '')>today)return;
      l.open++;l.byType[i.work_type_code]=(l.byType[i.work_type_code] || 0)+1;
      var wt=byId(types,'code',i.work_type_code)||{};
      D.draftBacklogAt(i,wt,today).forEach(function(k){if(!(parents[i.item_id] && k==='TON_THE_CHAP'))l.backlog[k]=(l.backlog[k] || 0)+1;});
      var exempt=!!i.sla_exempt || (D.slaExempt?D.slaExempt(i,st):false);
      if(i.due_at && new Date(i.due_at)<new Date(String(at).length===10?at+'T12:00:00+07:00':at) && !i.sla_paused_at && !exempt)l.late++;
    });
    return {today:today,users:users,historicalUsers:historicalUsers,items:items,events:events,outcomes:outcomes,intakes:intakes,loads:loads,calendar:st.calendar || {},plans:st.staffPlans || [],domain:D,types:types};
  }
  function line(plan,id) { return byId(plan.lines,'user_id',id); }
  function size(p){return new Date(p.end)-new Date(p.start);}
  function committed(plans,parent,id,key,cal,u) {
    var children=(plans || []).filter(function(q){return size(q)<size(parent) && q.start<=parent.end && q.end>=parent.start && line(q,id) && Object.prototype.hasOwnProperty.call(line(q,id).targets,key);});
    var total=0,covered=0;
    each(parent,function(day){
      if(!working(day,cal || {}) || (u && off(u,day)))return;
      var matches=children.filter(function(q){return q.start<=day && q.end>=day;}).sort(function(a,b){return size(b)-size(a);});
      if(!matches.length)return;
      var q=matches[0],den=workDays(q,cal || {},u);if(!den)return;
      total+=Number(line(q,id).targets[key])/den;covered++;
    });return {total:total,covered:covered};
  }
  function target(plans,id,key,p,cal,u) {
    var n=0,sources={},found=false,memo={};
    var exact=(plans || []).filter(function(q){return q.start===p.start && q.end===p.end && line(q,id) && Object.prototype.hasOwnProperty.call(line(q,id).targets,key);})[0];
    if(exact)return {value:Number(line(exact,id).targets[key]),source:exact.type};
    if(key.indexOf('TON_')===0) {
      var ceilings=(plans || []).filter(function(q){return q.start<=p.end && q.end>=p.end && line(q,id) && Object.prototype.hasOwnProperty.call(line(q,id).targets,key);});
      ceilings.sort(function(a,b){return (new Date(a.end)-new Date(a.start))-(new Date(b.end)-new Date(b.start));});
      return ceilings.length?{value:Number(line(ceilings[0],id).targets[key]),source:ceilings[0].type}:{value:null,source:''};
    }
    each(p,function(day){
      if(!working(day,cal||{}) || (u && off(u,day)))return;
      var candidates=(plans || []).filter(function(q){return q.start<=day && q.end>=day && line(q,id) && Object.prototype.hasOwnProperty.call(line(q,id).targets,key);});
      candidates.sort(function(a,b){
        var af=a.start>=p.start && a.end<=p.end,bf=b.start>=p.start && b.end<=p.end;
        return af && bf?size(b)-size(a):af?-1:bf?1:size(a)-size(b);
      });
      if(!candidates.length)return;
      var q=candidates[0],den=workDays(q,cal || {},u);found=true;sources[q.type]=true;
      if(q.start>=p.start && q.end<=p.end){if(den)n+=Number(line(q,id).targets[key])/den;return;}
      var cacheKey=q.key || q.type+':'+q.start;
      if(!memo[cacheKey])memo[cacheKey]=committed(plans,q,id,key,cal,u);
      var used=memo[cacheKey],remaining=Number(line(q,id).targets[key])-used.total;
      if(den>used.covered)n+=Math.max(0,remaining)/(den-used.covered);
    });
    return {value:found?Math.round(n*100)/100:null,source:Object.keys(sources).join('+')};
  }
  function evaluate(c,p,plans) {
    var saved=(plans || []).filter(function(q){return q.key===p.key && q.status==='CLOSED' && q.snapshot;})[0];
    if(saved)return saved.snapshot;
    var roster=c.users.slice(),seen={};roster.forEach(function(u){seen[u.user_id]=true;});
    function include(id){if(!id || seen[id])return;seen[id]=true;roster.push(byId(c.historicalUsers,'user_id',id) || {user_id:id,full_name:id,active:false});}
    (plans || []).filter(function(q){return q.start<=p.end && q.end>=p.start;}).forEach(function(q){q.lines.forEach(function(l){include(l.user_id);});});
    c.events.forEach(function(e){if(e.day>=p.start && e.day<=p.end)include(e.user_id);});
    var rows=roster.map(function(u){
      var actual={},targets={},ratios={},l=c.loads[u.user_id] || {open:0,late:0,backlog:{}},days=workDays(p,c.calendar,u);
      c.events.forEach(function(e){if(e.user_id===u.user_id && e.day>=p.start && e.day<=p.end)actual[e.key]=(actual[e.key] || 0)+e.quantity;});
      KEYS.forEach(function(k){targets[k]=target(plans,u.user_id,k,p,c.calendar,u).value;ratios[k]=targets[k]>0 && k.indexOf('TON_')!==0?Math.round((actual[k] || 0)*1000/targets[k])/10:null;});
      var current=p.start<=c.today && p.end>=c.today;
      var completed=(c.outcomes || []).filter(function(x){return x.user_id===u.user_id && x.day>=p.start && x.day<=p.end;});
      var timed=completed.filter(function(x){return x.timed;}),onTime=timed.filter(function(x){return x.onTime;}).length;
      var received=(c.intakes || []).filter(function(x){return x.user_id===u.user_id && x.day>=p.start && x.day<=p.end;}).length;
      var elapsed=p.start>c.today?0:workDays({start:p.start,end:p.end<c.today?p.end:c.today},c.calendar,u),expected={};
      KEYS.forEach(function(k){expected[k]=targets[k]===null?null:p.start>c.today?0:target(plans,u.user_id,k,{start:p.start,end:p.end<c.today?p.end:c.today},c.calendar,u).value;});
      return {user_id:u.user_id,name:u.full_name,actual:actual,targets:targets,ratios:ratios,days:days,elapsedDays:elapsed,expected:expected,
        received:received,onTimeRate:timed.length?Math.round(onTime*1000/timed.length)/10:null,timedDone:timed.length,slaExemptDone:completed.filter(function(x){return x.exempt;}).length,
        open:current?l.open:null,late:current?l.late:null,backlog:current?l.backlog:null,backlog_as_of:current?c.today:null};
    });
    return {period:{type:p.type,start:p.start,end:p.end,key:p.key},rows:rows,captured_at:c.today};
  }
  function capacity(c,u,p,key) {
    var samples=[],q=previous(p),count=0,supplyLimited=false;
    for(var t=0;t<3;t++) {
      var total=0; c.events.forEach(function(e){if(e.user_id===u.user_id && e.key===key && e.day>=q.start && e.day<=q.end)total+=e.quantity;});
      var goal=target(c.plans,u.user_id,key,q,c.calendar,u).value,input=0;
      (c.intakes || []).forEach(function(x){if(x.user_id===u.user_id && x.day>=q.start && x.day<=q.end)input+=Number((x.expected || {})[key]) || 0;});
      if(goal>total && input<goal)supplyLimited=true;
      var days=workDays(q,c.calendar,u);if(total && days){samples.push(total/days);count+=total;} q=previous(q);
    }
    samples.sort(function(a,b){return a-b;});
    var daysNext=workDays(p,c.calendar,u),rate=samples.length?samples[Math.floor(samples.length/2)]:null;
    return {value:rate===null?null:Math.floor(rate*daysNext),days:daysNext,confidence:supplyLimited?'SUPPLY_LIMITED':samples.length>=2 && count>=10?'STABLE':samples.length?'LIMITED':'NO_DATA'};
  }
  function suggest(c,p,key,total,pinned) {
    if(KEYS.indexOf(key)===-1 || key.indexOf('TON_')===0)throw new Error('Chọn chỉ tiêu kết quả để gợi ý.');
    if(!Number.isInteger(Number(total)) || total<0 || total>1000000)throw new Error('Tổng chỉ tiêu phải là số nguyên không âm.');
    total=Number(total);pinned=pinned || {};var values={},rows=[],fixed=0;
    c.users.forEach(function(u){var cap=capacity(c,u,p,key),locked=Object.prototype.hasOwnProperty.call(pinned,u.user_id);values[u.user_id]=locked?Number(pinned[u.user_id]):0;
      if(locked && (!Number.isInteger(values[u.user_id]) || values[u.user_id]<0))throw new Error('Chỉ tiêu khóa không hợp lệ.');
      fixed+=values[u.user_id];rows.push({user_id:u.user_id,capacity:cap.value,days:cap.days,confidence:cap.confidence,locked:locked});});
    if(fixed>total)throw new Error('Tổng các dòng khóa vượt tổng chỉ tiêu.');
    var remaining=total-fixed,pool=rows.filter(function(r){return !r.locked && r.days>0;}),limits={},weights={};
    pool.forEach(function(r){limits[r.user_id]=r.confidence!=='STABLE'?total:Math.ceil(r.capacity*1.1);weights[r.user_id]=r.capacity===null?r.days:Math.max(1,r.capacity);});
    while(remaining>0) {
      var available=pool.filter(function(r){return values[r.user_id]<limits[r.user_id];});if(!available.length)break;
      var sum=available.reduce(function(n,r){return n+weights[r.user_id];},0),budget=remaining,added=0;
      available.forEach(function(r){var n=Math.min(limits[r.user_id]-values[r.user_id],Math.floor(budget*weights[r.user_id]/sum));values[r.user_id]+=n;added+=n;});
      remaining-=added;
      if(!added){available.sort(function(a,b){return values[a.user_id]/weights[a.user_id]-values[b.user_id]/weights[b.user_id] || a.user_id.localeCompare(b.user_id);});values[available[0].user_id]++;remaining--;}
    }
    return {values:values,rows:rows,unallocated:remaining,warning:remaining?'Tổng vượt khả năng tham khảo '+remaining+' đơn vị.':''};
  }
  function rank(c,item,reservations) {
    var p=period('week',c.today),keys=c.domain.handoverPartsFor(item,byId(c.types || [],'code',item.work_type_code)||{}).map(function(k){return k.key;});
    return c.users.filter(function(u){return !off(u,c.today);}).map(function(u){
      var l=c.loads[u.user_id],reserved=Number((reservations || {})[u.user_id]) || 0,gap=0,planned=false;
      keys.forEach(function(k){var goal=target(c.plans,u.user_id,k,p,c.calendar,u).value;if(goal>0){planned=true;var done=0;c.events.forEach(function(e){if(e.user_id===u.user_id && e.key===k && e.day>=p.start && e.day<=p.end)done+=e.quantity;});gap=Math.max(gap,Math.max(0,1-done/goal));}});
      var reasons=['Đang mở '+l.open+' việc'];if(reserved)reasons.push('Dự kiến nhận thêm '+reserved);if(l.late)reasons.push(l.late+' việc cần kiểm tra hạn');if(planned && gap)reasons.push('Còn chỉ tiêu phù hợp');
      var familiar=c.events.filter(function(e){return e.user_id===u.user_id && e.work_type_code===item.work_type_code && e.day>=add(c.today,-28);}).length>=3;
      if(familiar)reasons.push('Có kinh nghiệm loại việc này');
      return {user_id:u.user_id,user:u,score:l.open+reserved+2*l.late-0.5*gap-(familiar?0.1:0),reasons:reasons,open:l.open,planned:planned};
    }).sort(function(a,b){return a.score-b.score || a.user_id.localeCompare(b.user_id);});
  }
  function hierarchyIssues(plans,cal) {
    var issues=[],order={week:1,month:2,quarter:3};
    plans.forEach(function(parent){
      var children=plans.filter(function(q){return order[q.type]<order[parent.type] && q.start<=parent.end && q.end>=parent.start;});
      if(!children.length)return;
      parent.lines.forEach(function(l){Object.keys(l.targets).forEach(function(k){
        if(k.indexOf('TON_')===0)return;
        var child=committed(children,parent,l.user_id,k,cal).total;
        if(child>l.targets[k]+0.01)issues.push('Chỉ tiêu '+k+' của '+l.user_id+' ở kỳ con vượt kế hoạch '+parent.key+'.');
      });});
    });return issues;
  }
  return {KEYS:KEYS,date:date,add:add,period:period,previous:previous,workDays:workDays,context:context,target:target,evaluate:evaluate,capacity:capacity,suggest:suggest,rank:rank,hierarchyIssues:hierarchyIssues};
})();

var LSPlanResults = (function () {
var U={byId:function(rows,key,id){return rows.filter(function(r){return r[key]===id;})[0];},db:function(){return {workTypes:[]};}};
var STATUS={"CHO_PHAN_CONG":{"label":"Chờ phân công","tone":"warn","open":true},"CHO_HOAN_THIEN":{"label":"Chờ phân công","tone":"warn","open":true,"legacy":true},"CHO_TIEP_NHAN":{"label":"Chờ tiếp nhận","tone":"warn","open":true,"legacy":true},"CAN_BO_SUNG":{"label":"Chưa giao hồ sơ","tone":"warn","open":true},"CHUA_GIAO_HO_SO":{"label":"Chưa giao hồ sơ","tone":"warn","open":true},"DA_PHAN_CONG":{"label":"Đã phân công","tone":"info","open":true},"DANG_THUC_HIEN":{"label":"Đã tiếp nhận hồ sơ","tone":"info","open":true},"DA_SOAN_XONG":{"label":"Đã soạn xong","tone":"violet","open":true,"legacy":true},"DANG_HEN_KH":{"label":"Đang hẹn khách ký","tone":"violet","open":true},"CHO_KS_DUYET":{"label":"Chờ kiểm soát duyệt","tone":"gold","open":true,"legacy":true},"HOAN_THANH_LS":{"label":"Hoàn thành","tone":"ok","open":false},"TAM_DUNG":{"label":"Tạm dừng","tone":"neutral","open":true},"HUY":{"label":"Đã hủy","tone":"neutral","open":false}};
  var DAILY_ROWS = [
    { key: 'HD_THE_CHAP', label: 'Soạn thảo HĐ thế chấp', unit: 'hợp đồng' },
    { key: 'HD_TIN_DUNG', label: 'Soạn thảo HĐ tín dụng', unit: 'hợp đồng' },
    { key: 'NHAP_KHO', label: 'Nhập kho TSĐB', unit: 'tài sản' },
    { key: 'XUAT_KHO', label: 'Xuất kho TSĐB', unit: 'tài sản' },
    { key: 'RLOS', label: 'Giao dịch trên Rlos', unit: 'khoản vay' },
    { key: 'TON', label: 'Tồn soạn hiện nay:', unit: '', header: true },
    { key: 'TON_THE_CHAP', label: 'Còn soạn HĐ thế chấp', unit: 'hồ sơ', sub: true },
    { key: 'TON_TIN_DUNG', label: 'Còn soạn HĐ tín dụng', unit: 'hồ sơ', sub: true },
    { key: 'KHAC', label: 'Khác', unit: 'khác' }
  ];

  /**
   * Việc khác cán bộ LS tự ghi kèm số lượng (không gắn hồ sơ nào). Tổng của chúng cộng vào dòng "Khác"
   * của bảng ngày theo từng người; từng loại chỉ hiện khi bung dòng Khác. Khớp OTHER_WORK_CATEGORIES_ ở Code.gs.
   */
  var OTHER_WORK_TYPES = [
    { code: 'HOP_DAU_NGAY', label: 'Họp đầu ngày', unit: 'lần' },
    { code: 'XEM_VAN_BAN', label: 'Xem văn bản', unit: 'văn bản' },
    { code: 'SAP_XEP_KHO', label: 'Sắp xếp kho hồ sơ', unit: 'hồ sơ' },
    { code: 'SCAN_HOAN_THIEN', label: 'Scan hoàn thiện hồ sơ', unit: 'hồ sơ' },
    { code: 'DINH_GIA_LAI', label: 'Định giá lại TSBĐ', unit: 'tài sản' },
    { code: 'XUAT_KHO_THU_NO', label: 'Xuất kho, thu nợ cầm cố', unit: 'khoản' }
  ];
  var OTHER_WORK_MAX_QUANTITY = 999;
  var OTHER_WORK_MEETING_MINUTES = 15;

  /** Chia `amount` thành các phần nguyên theo tỉ lệ `weights`, tổng đúng bằng `amount`. Khớp apportion_ ở Code.gs. */
  function apportion(amount, weights) {
    var total = weights.reduce(function (n, w) { return n + w; }, 0);
    if (!(total > 0) || !(amount > 0)) return weights.map(function () { return 0; });
    var shares = weights.map(function (w, i) { var exact = amount * w / total; return { i: i, base: Math.floor(exact), frac: exact - Math.floor(exact) }; });
    var left = amount - shares.reduce(function (n, x) { return n + x.base; }, 0);
    shares.slice().sort(function (a, b) { return b.frac - a.frac || a.i - b.i; }).slice(0, left).forEach(function (x) { x.base += 1; });
    return shares.map(function (x) { return x.base; });
  }

  /**
   * Chia số phút làm việc của một lượt Tạm dừng toàn bộ cho các việc khác đã ghi trong lượt đó: Họp đầu ngày
   * cố định 15 phút mỗi lần (không quá thời gian đã dừng), phần còn lại chia đều theo từng loại việc, trong một
   * loại chia theo số lượng. Trả về mảng phút cùng thứ tự `rows` ({ category, quantity }). Khớp splitPauseMinutes_ ở Code.gs.
   */
  function splitPauseMinutes(totalMinutes, rows) {
    var total = Math.max(0, Math.floor(Number(totalMinutes) || 0)), out = rows.map(function () { return 0; });
    var meeting = [], byType = {}, order = OTHER_WORK_TYPES.map(function (t) { return t.code; }).filter(function (c) { return c !== 'HOP_DAU_NGAY'; });
    rows.forEach(function (r, i) {
      if (r.category === 'HOP_DAU_NGAY') meeting.push(i);
      else (byType[r.category] = byType[r.category] || []).push(i);
    });
    var meetingMinutes = Math.min(total, OTHER_WORK_MEETING_MINUTES * meeting.reduce(function (n, i) { return n + rows[i].quantity; }, 0));
    apportion(meetingMinutes, meeting.map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[meeting[k]] = m; });
    var types = order.filter(function (c) { return byType[c]; });
    var each = apportion(total - meetingMinutes, types.map(function () { return 1; }));
    types.forEach(function (c, n) {
      apportion(each[n], byType[c].map(function (i) { return rows[i].quantity; })).forEach(function (m, k) { out[byType[c][k]] = m; });
    });
    return out;
  }

  /** Việc khác trong khoảng ngày (YYYY-MM-DD), gộp theo loại: số lượng và số phút. userId rỗng là mọi người. */
  function otherWorkSummary(rows, from, to, userId) {
    var byCategory = {};
    (rows || []).forEach(function (r) {
      var day = String(r.work_date || '').substring(0, 10);
      if (!r || r.canceled_at || (userId && r.user_id !== userId) || day < from || day > to) return;
      var type = OTHER_WORK_TYPES.filter(function (t) { return t.code === r.category; })[0];
      if (!type) return;
      var g = byCategory[r.category] || (byCategory[r.category] = { category: r.category, label: type.label, unit: type.unit, quantity: 0, minutes: 0 });
      g.quantity += Math.max(1, Number(r.quantity) || 1);
      g.minutes += Math.max(0, Number(r.minutes) || 0);
    });
    return OTHER_WORK_TYPES.filter(function (t) { return byCategory[t.code]; }).map(function (t) { return byCategory[t.code]; });
  }

  function dailyIsCredit_(wt, item) {
    var credit = /^(món|hm sxkd|thấu chi|thẻ tín dụng)/;
    return credit.test(String((wt && wt.group) || '').toLowerCase()) ||
      credit.test(String((wt && wt.name) || '').toLowerCase());
  }

  /** Cầm cố (sổ tiết kiệm, tiền gửi) là hợp đồng riêng, không gộp vào thế chấp. */
  function dailyIsPledge_(wt, item) {
    return /cầm cố/.test(String((wt && wt.name) || (item && item.product_name) || '').toLowerCase());
  }

  /** Loại việc cầm cố (sổ tiết kiệm, tiền gửi): mặc định cầm cố của phòng đi về cán bộ trong quy tắc phân công nhanh. */
  function isPledgeWorkType(wt) { return dailyIsPledge_(wt, null); }

  /**
   * Các loại việc một quy tắc phân công nhanh áp dụng: danh sách `work_type_codes`, hoặc mã đơn của
   * quy tắc cũ. Rỗng nghĩa là mọi sản phẩm. Khớp ruleWorkTypeCodes ở Code.gs.
   */
  function ruleWorkTypeCodes(rule) {
    var list = rule && Array.isArray(rule.work_type_codes) ? rule.work_type_codes : [];
    list = list.map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x && x !== 'ALL'; });
    if (!list.length && rule && rule.work_type_code && rule.work_type_code !== 'ALL') list = [String(rule.work_type_code)];
    return list;
  }

  /** Quy tắc khớp một việc? Phòng, loại việc và sản phẩm đều là điều kiện thu hẹp; để trống là không thu hẹp. */
  function ruleMatches(rule, unitId, item) {
    var codes = ruleWorkTypeCodes(rule);
    return (!rule.unit_id || rule.unit_id === unitId) && (!codes.length || codes.indexOf(item.work_type_code) !== -1) &&
      (!rule.product_name || String(rule.product_name).trim().toLowerCase() === String(item.product_name || '').trim().toLowerCase());
  }

  /** Quy tắc càng cụ thể càng được chọn trước: phòng, rồi loại việc, rồi sản phẩm; bằng nhau thì theo thứ tự ưu tiên. */
  function ruleScore(rule) {
    return (rule.unit_id ? 4 : 0) + (ruleWorkTypeCodes(rule).length ? 2 : 0) + (rule.product_name ? 1 : 0);
  }

  /** Hồ sơ vay cũ chưa tách việc TSĐB: phần thế chấp còn ghi nhận tại việc tín dụng. */
  function dailyIsMortgage_(wt, item) {
    if (dailyIsPledge_(wt, item)) return false;
    // MOI có việc TSĐB riêng; CO_SAN/NONE không phát sinh hợp đồng thế chấp mới.
    if (item && item.collateral_mode) return false;
    var name = String((wt && wt.name) || '').toLowerCase();
    return /tsđb|tsbđ|nhà ở|ôtô|ô tô/.test(name) && !/tín chấp/.test(name);
  }

  /** Việc thuộc nhóm TSĐB (nhập, xuất, đổi, mượn TSĐB...). */
  function dailyIsCollateral_(wt, item) {
    var text = String((wt && wt.group) || '').toLowerCase() + ' ' + String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    return /tsđb|tsbđ/.test(text);
  }

  /**
   * Việc TSĐB có soạn hợp đồng thế chấp: làm TSĐB mới (nhập mới, nhập thêm, đăng ký thế chấp) hoặc làm phụ lục TSĐB
   * (nhập tăng, xuất giảm, ký lại phụ lục, thay đổi TSĐB). Xuất TSĐB / xóa thế chấp, mượn TSĐB và thủ tục khác
   * không soạn HĐ thế chấp nên tính vào dòng Khác. Việc kèm TSĐB mới (collateral_mode MOI) luôn là TSĐB mới.
   */
  function dailyIsMortgageDoc_(wt, item) {
    if (!dailyIsCollateral_(wt, item)) return false;
    if (item && item.collateral_mode === 'MOI') return true;
    var name = String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    return /nhập mới|nhập thêm|đktc|nhập tăng|xuất giảm|plhd|phụ lục|thay đổi/.test(name);
  }

  /**
   * Các ô tick cán bộ phải tick trước khi hoàn thành việc TSĐB, theo thứ tự làm:
   *  - có soạn HĐ thế chấp: soạn xong HĐ thế chấp, rồi nhập kho (xuất giảm thì xuất kho);
   *  - xuất TSĐB / xóa thế chấp: chỉ xuất kho;
   *  - mượn TSĐB, thủ tục khác: không có ô nào.
   * Khớp collateralStepKeys_ ở Code.gs.
   */
  function collateralStepKeys(item, wt) {
    if (dailyIsCredit_(wt, item) || !dailyIsCollateral_(wt, item)) return [];
    var name = String((wt && wt.name) || (item && item.product_name) || '').toLowerCase();
    if (dailyIsMortgageDoc_(wt, item)) return /xuất/.test(name) ? ['HD_THE_CHAP', 'XUAT_KHO'] : ['HD_THE_CHAP', 'NHAP_KHO'];
    return /xuất|xóa thế chấp/.test(name) ? ['XUAT_KHO'] : [];
  }

  /**
   * Những kết quả cán bộ LS xác nhận (tick) khi hoàn thành hồ sơ. Số tick đi thẳng vào bảng ngày:
   *  - HĐ thế chấp: hồ sơ vay có tài sản bảo đảm, hoặc việc TSĐB làm TSĐB mới / phụ lục TSĐB;
   *  - Rlos: giao dịch trên Rlos của hồ sơ vay.
   */
  var RESULT_FLAGS = [
    { key: 'HD_THE_CHAP', label: 'Đã soạn HĐ thế chấp (làm TSĐB mới / phụ lục TSĐB)', short: 'HĐ thế chấp' },
    { key: 'RLOS', label: 'Đã làm giao dịch trên Rlos', short: 'Rlos' }
  ];

  /** Hồ sơ vay (món, HM SXKD, thấu chi, thẻ tín dụng). */
  function dailyIsCredit(item, wt) { return dailyIsCredit_(wt, item); }

  /**
   * Hợp đồng được xem là đã soạn khi LS đặt lịch ký: hồ sơ vay ghi HĐ tín dụng,
   * còn việc TSĐB có bước soạn HĐ thế chấp ghi HĐ thế chấp; bước kho vẫn độc lập.
   */
  function draftContractKeys(item, wt) {
    if (dailyIsCredit_(wt, item)) {
      var keys = ['HD_TIN_DUNG'];
      if (dailyIsMortgage_(wt, item)) keys.push('HD_THE_CHAP');
      return keys;
    }
    if (collateralStepKeys(item, wt).indexOf('HD_THE_CHAP') !== -1) return ['HD_THE_CHAP'];
    return [];
  }

  /** Số lượng kế hoạch QLKH khai báo khi đăng ký việc, không thay thế số thực tế LS ghi nhận khi xử lý. */
  function requestCollateralQuantityKeys(item, wt) {
    var steps = collateralStepKeys(item, wt);
    var drafts = draftContractKeys(item, wt);
    var noNewMortgageCredit = dailyIsCredit_(wt, item) &&
      ['CO_SAN', 'NONE'].indexOf(String(item && item.collateral_mode || '').toUpperCase()) !== -1;
    var newCollateralCredit = dailyIsCredit_(wt, item) && item && item.collateral_mode === 'MOI';
    var keys = [];
    if (!noNewMortgageCredit && (newCollateralCredit || drafts.indexOf('HD_THE_CHAP') !== -1 || steps.indexOf('HD_THE_CHAP') !== -1)) keys.push('HD_THE_CHAP');
    if (steps.indexOf('XUAT_KHO') !== -1) keys.push('XUAT_KHO');
    return keys;
  }

  /**
   * Bàn giao giữa chừng: cán bộ cũ đã làm xong phần nào thì phần đó tính cho cán bộ cũ, ngày bàn giao;
   * người nhận chỉ được tính phần còn lại khi hoàn thành. Lưu ở result_credit_json:
   * { "HD_THE_CHAP": { "user_id": "...", "at": "...", "by": "..." } }. Khớp HANDOVER_PART_KEYS_ ở Code.gs.
   */
  var HANDOVER_PARTS = [
    { key: 'HD_TIN_DUNG', label: 'Soạn HĐ tín dụng', short: 'HĐ tín dụng' },
    { key: 'HD_THE_CHAP', label: 'Soạn HĐ thế chấp (TSĐB mới / phụ lục TSĐB)', short: 'HĐ thế chấp' },
    { key: 'RLOS', label: 'Giao dịch trên Rlos', short: 'Rlos' },
    { key: 'NHAP_KHO', label: 'Nhập kho TSĐB', short: 'Nhập kho' },
    { key: 'XUAT_KHO', label: 'Xuất kho TSĐB', short: 'Xuất kho' }
  ];

  /** Nhãn ô tick của việc TSĐB; việc kho ghi vào cùng result_credit_json với phần bàn giao. */
  var COLLATERAL_STEP_LABELS = {
    HD_THE_CHAP: 'Đã soạn xong HĐ thế chấp', NHAP_KHO: 'Đã nhập kho TSĐB', XUAT_KHO: 'Đã xuất kho TSĐB'
  };
  var STEP_QUANTITY_LABELS = {
    HD_TIN_DUNG: 'Số lượng HĐ tín dụng', HD_THE_CHAP: 'Số lượng HĐ thế chấp', XUAT_KHO: 'Số lượng tài sản xuất'
  };

  function stepQuantityLabel(key) { return STEP_QUANTITY_LABELS[key] || ''; }

  function resultCredit(item) {
    var c = item && item.result_credit;
    if (c === undefined && item) c = item.result_credit_json;
    if (typeof c === 'string') { try { c = JSON.parse(c || '{}'); } catch (err) { c = null; } }
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  }

  function scheduledMortgageCredit_(item, wt) {
    var c = resultCredit(item).HD_THE_CHAP;
    return dailyIsCredit_(wt, item) && c && c.user_id &&
      (c.source === 'APPOINTMENT' || c.source === 'APPOINTMENT_HISTORY' || c.by === c.user_id);
  }

  /** Các phần đã ghi nhận, sau khi áp dụng điều chỉnh tick kết quả. */
  function creditedParts(item, wt) {
    var c = resultCredit(item);
    wt = wt || U.byId(U.db().workTypes, 'code', item.work_type_code);
    var flags = savedResultFlags(item) || {};
    return HANDOVER_PARTS.filter(function (p) {
      if (!c[p.key] || !c[p.key].user_id) return false;
      if (p.key === 'HD_THE_CHAP' && c[p.key].user_id === item.assigned_user_id &&
          ['COMPLETION', 'RESULT_CORRECTION'].indexOf(c[p.key].source) !== -1 && flags.HD_THE_CHAP === false) return false;
      if (p.key !== 'HD_THE_CHAP' || !dailyIsCredit_(wt, item)) return true;
      if (item.collateral_mode === 'MOI') return false;
      if (!scheduledMortgageCredit_(item, wt)) return true;
      if (flags.HD_THE_CHAP === false) return false;
      return ['CO_SAN', 'NONE'].indexOf(item.collateral_mode) === -1 || flags.HD_THE_CHAP === true;
    }).map(function (p) {
      return { key: p.key, short: p.short, user_id: c[p.key].user_id, at: c[p.key].at || '', by: c[p.key].by || '', quantity: Math.max(1, Math.floor(Number(c[p.key].quantity) || 1)) };
    });
  }

  function isCredited_(item, key) { var c = resultCredit(item); return !!(c[key] && c[key].user_id); }

  /**
   * Ô tick còn hiệu lực của việc TSĐB. Việc đã hoàn thành trước khi có các ô này (chưa đủ ô được ghi nhận)
   * giữ cách tính cũ: HĐ thế chấp theo tick lúc hoàn thành, còn lại tính vào Khác.
   */
  function stepKeys(item, wt) {
    var keys = collateralStepKeys(item, wt);
    if (item && item.status === 'HOAN_THANH_LS' && !keys.every(function (k) { return isCredited_(item, k); })) return [];
    return keys;
  }

  /** Các ô tick của việc TSĐB: [{ key, label, user_id, at, done }] theo thứ tự làm. */
  function steps(item, wt) {
    var credit = resultCredit(item);
    return stepKeys(item, wt).map(function (k) {
      var c = credit[k] || {};
      return { key: k, label: COLLATERAL_STEP_LABELS[k], user_id: c.user_id || '', at: c.at || '', by: c.by || '', done: !!c.user_id,
        quantity: Math.max(1, Math.floor(Number(c.user_id ? c.quantity : (k === 'HD_THE_CHAP' ? item.requested_mortgage_contract_count : item.requested_export_folder_count)) || 1)) };
    });
  }

  /** Phần có thể ghi nhận cho cán bộ cũ khi đổi người: hồ sơ vay có 3 phần, việc TSĐB là các ô tick của việc đó. */
  function handoverPartsFor(item, wt) {
    var collateral = collateralStepKeys(item, wt);
    var keys = dailyIsCredit_(wt, item) ? (item.collateral_mode === 'MOI' ? ['HD_TIN_DUNG', 'RLOS'] : ['HD_TIN_DUNG', 'HD_THE_CHAP', 'RLOS'])
      : dailyIsCollateral_(wt, item) ? (collateral.length ? collateral : ['HD_THE_CHAP']) : [];
    return HANDOVER_PARTS.filter(function (p) { return keys.indexOf(p.key) !== -1 && !isCredited_(item, p.key); });
  }

  /**
   * Các tick áp dụng cho hồ sơ: vay có cả hai, loại việc khác không có. Việc TSĐB có ô tick riêng (steps)
   * thì không tick lúc hoàn thành; mượn TSĐB và thủ tục khác vẫn có ô HĐ thế chấp như cũ.
   */
  function resultFlagsFor(item, wt) {
    var list = dailyIsCredit_(wt, item) ? RESULT_FLAGS.slice()
      : dailyIsCollateral_(wt, item) && !stepKeys(item, wt).length ? RESULT_FLAGS.filter(function (x) { return x.key === 'HD_THE_CHAP'; }) : [];
    // Phần cán bộ trước đã làm và đã được tính cho họ thì người hoàn thành không tick lại.
    return list.filter(function (x) {
      var ownCredit = resultCredit(item)[x.key];
      if (x.key === 'HD_THE_CHAP' && ownCredit && ownCredit.user_id === item.assigned_user_id &&
          ['COMPLETION', 'RESULT_CORRECTION'].indexOf(ownCredit.source) !== -1) return true;
      if (x.key === 'HD_THE_CHAP' && dailyIsCredit_(wt, item)) {
        if (item.collateral_mode === 'MOI') return false;
        if (scheduledMortgageCredit_(item, wt) && resultCredit(item).HD_THE_CHAP.user_id === item.assigned_user_id) return true;
      }
      return !isCredited_(item, x.key);
    });
  }

  /** Cách phân loại theo tên loại việc — giá trị tick sẵn, và cho hồ sơ hoàn thành trước khi có tick. */
  function dailyGuessFlags(item, wt) {
    if (dailyIsCredit_(wt, item)) return { HD_THE_CHAP: dailyIsMortgage_(wt, item), RLOS: true };
    return { HD_THE_CHAP: dailyIsMortgageDoc_(wt, item) };
  }

  /** Tick đã lưu của hồ sơ, hoặc null nếu hồ sơ chưa được ghi nhận (hoàn thành trước khi có tick). */
  function savedResultFlags(item) {
    var flags = item && item.result_flags;
    if (flags === undefined && item) flags = item.result_flags_json;
    if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch (err) { flags = null; } }
    return flags && typeof flags === 'object' && !Array.isArray(flags) ? flags : null;
  }

  /** Giá trị cuối của từng tick: tick đã lưu thắng, tick chưa ghi nhận lấy theo cách phân loại. */
  function resolvedResultFlags(item, wt) {
    var out = dailyGuessFlags(item, wt), saved = savedResultFlags(item) || {};
    if (scheduledMortgageCredit_(item, wt) && !item.collateral_mode) out.HD_THE_CHAP = true;
    Object.keys(out).forEach(function (key) { if (typeof saved[key] === 'boolean') out[key] = saved[key]; });
    return out;
  }

  /**
   * Các dòng hoạt động tính cho người hoàn thành việc. Phần đã ghi nhận cho cán bộ trước lúc
   * bàn giao không nằm ở đây (đếm riêng theo creditedParts), nên không bị đếm hai lần.
   */
  function dailyActivityKeys(item, wt) {
    var flags = resolvedResultFlags(item, wt), keys = [];
    if (dailyIsCredit_(wt, item)) {
      keys.push('HD_TIN_DUNG');
      if (flags.RLOS === true) keys.push('RLOS');
      if (flags.HD_THE_CHAP === true && item.collateral_mode !== 'MOI') keys.push('HD_THE_CHAP');
    } else if (dailyIsCollateral_(wt, item)) {
      // Việc TSĐB có ô tick riêng: HĐ thế chấp, nhập kho, xuất kho đã tính cho người tick theo ngày tick.
      if (stepKeys(item, wt).length) return [];
      // Việc TSĐB mà HĐ thế chấp đã tính cho cán bộ trước: người hoàn thành không được tính gì thêm.
      if (creditedParts(item, wt).some(function (part) { return part.key === 'HD_THE_CHAP'; })) return [];
      keys.push(flags.HD_THE_CHAP === true ? 'HD_THE_CHAP' : 'KHAC');
    } else {
      keys.push('KHAC');
    }
    return keys.filter(function (k) { return !isCredited_(item, k); });
  }

  /**
   * LS đã cầm hồ sơ: có mốc nhận, hoặc trạng thái đã qua bước tiếp nhận nhưng thiếu mốc (Kiểm soát/Quản lý chuyển hộ,
   * hồ sơ chuyển kỳ, dữ liệu cũ — cùng cách hiểu "thiếu mốc bàn giao" của màn kiểm tra thời gian).
   * Tạm dừng từ trước khi nhận (chưa từng xử lý) vẫn là chưa nhận.
   */
  function dossierReceived(item) {
    if (!item) return false;
    if (item.dossier_received_at) return true;
    if (LSTiming.awaitingReceipt(item.status) || item.status === 'HUY') return false;
    return !(item.status === 'TAM_DUNG' && !item.processing_started_at);
  }

  /** Hồ sơ đã được LS tiếp nhận và còn mở: tính phần hợp đồng chưa soạn xong vào tồn. */
  function dailyBacklogKeys(item, wt) {
    if (!dossierReceived(item)) return [];
    var keys = dailyIsCredit_(wt, item) ? (dailyIsMortgage_(wt, item) ? ['TON_THE_CHAP', 'TON_TIN_DUNG'] : ['TON_TIN_DUNG'])
      : dailyIsMortgageDoc_(wt, item) ? ['TON_THE_CHAP'] : [];
    // Hợp đồng đã soạn xong (đã tính cho cán bộ trước) thì không còn tồn.
    var mortgageDone = creditedParts(item, wt).some(function (p) { return p.key === 'HD_THE_CHAP'; });
    return keys.filter(function (k) {
      return !(k === 'TON_THE_CHAP' && mortgageDone) && !(k === 'TON_TIN_DUNG' && isCredited_(item, 'HD_TIN_DUNG'));
    });
  }

  /**
   * Tồn soạn hợp đồng tính đến ngày `toDate` (YYYY-MM-DD): một nguồn duy nhất cho dòng "Tồn soạn hiện nay"
   * của bảng Kết quả thực hiện và thẻ HĐTD/HĐTC của Việc tồn, để hai nơi luôn ra cùng một số.
   * Việc đã đóng, đã chuyển sang kỳ sau, hoặc Phòng/PGD đã dời sang ngày sau `toDate` thì chưa tính.
   */
  function draftBacklogAt(item, wt, toDate) {
    if (!item || item.carried_to_item_id || !(STATUS[item.status] && STATUS[item.status].open)) return [];
    var dueDay = String(item.occurrence_date || '').substring(0, 10);
    if (dueDay && toDate && dueDay > toDate) return [];
    return dailyBacklogKeys(item, wt);
  }


return {STATUS:STATUS,creditedParts:creditedParts,dailyActivityKeys:dailyActivityKeys,collateralStepKeys:collateralStepKeys,dailyIsCredit:dailyIsCredit,draftBacklogAt:draftBacklogAt,handoverPartsFor:handoverPartsFor};
})();
