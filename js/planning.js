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
