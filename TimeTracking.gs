// Generated from js/core.js by build-gas.mjs.

// Pure timing engine; build-gas.mjs copies this exact block to TimeTracking.gs.
var LSTiming = (function () {
  'use strict';
  var HOUR = 3600000, DAY = 86400000, OFFSET = 7 * HOUR;
  // Trước khi cán bộ LS bấm "Tiếp nhận hồ sơ": chưa có mốc nhận là đúng, không phải thiếu dữ liệu.
  var BEFORE_RECEIPT = ['CHO_PHAN_CONG','CHO_HOAN_THIEN','CHO_TIEP_NHAN','CAN_BO_SUNG','CHUA_GIAO_HO_SO','DA_PHAN_CONG'];
  function awaitingReceipt(status) { return BEFORE_RECEIPT.indexOf(status) !== -1; }
  function array(item, key) {
    var v = item[key];
    if (v === undefined) v = item[key + '_json'];
    try { if (typeof v === 'string') v = JSON.parse(v); } catch (e) { v = []; }
    return Array.isArray(v) ? v : [];
  }
  function ms(v) { return v ? new Date(v).getTime() : NaN; }
  function dayKey(v) { return new Date(ms(v) + OFFSET).toISOString().substring(0, 10); }
  function calendar(c) {
    c = c || {};
    return { days:c.days || [1,2,3,4,5], open:c.open || '07:30', close:c.close || '18:00',
      breakFrom:c.breakFrom === undefined ? '11:30' : c.breakFrom, breakTo:c.breakTo === undefined ? '13:30' : c.breakTo, holidays:c.holidays || [] };
  }
  function calendarIssues(c) {
    c = c || {};
    var issues = [], time = /^([01]\d|2[0-3]):[0-5]\d$/;
    function minute(value) { return time.test(String(value || '')) ? Number(value.slice(0,2))*60+Number(value.slice(3,5)) : null; }
    var open = minute(c.open), close = minute(c.close);
    if (!Array.isArray(c.days) || !c.days.length || c.days.some(function(d){return !Number.isInteger(Number(d)) || Number(d)<0 || Number(d)>6;}) ||
        new Set(c.days.map(Number)).size !== c.days.length) issues.push('Chọn ít nhất một ngày làm việc hợp lệ.');
    if (open === null || close === null || close <= open) issues.push('Giờ kết thúc phải sau giờ bắt đầu.');
    var breakFrom = c.breakFrom === undefined ? '' : c.breakFrom, breakTo = c.breakTo === undefined ? '' : c.breakTo;
    if (!!breakFrom !== !!breakTo) issues.push('Nhập đủ giờ bắt đầu và kết thúc nghỉ giữa ca.');
    else if (breakFrom || breakTo) {
      var pauseStart=minute(breakFrom),pauseEnd=minute(breakTo);
      if (pauseStart===null || pauseEnd===null || pauseEnd<=pauseStart || open===null || close===null || pauseStart<open || pauseEnd>close)
        issues.push('Khoảng nghỉ phải nằm trong giờ làm và có giờ kết thúc sau giờ bắt đầu.');
    }
    if (!Array.isArray(c.holidays) || c.holidays.some(function(day){
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return true;
      var value=String(day).split('-').map(Number),date=new Date(Date.UTC(value[0],value[1]-1,value[2]));
      return date.getUTCFullYear()!==value[0] || date.getUTCMonth()!==value[1]-1 || date.getUTCDate()!==value[2];
    })) issues.push('Ngày nghỉ phải đúng dạng YYYY-MM-DD.');
    return issues;
  }
  function at(day, time) { return ms(day + 'T' + time + ':00+07:00'); }
  function windows(from, to, c) {
    c = calendar(c); var out = [];
    if (!(to > from)) return out;
    var d = Math.floor((from + OFFSET) / DAY) * DAY - OFFSET, guard = 0;
    while (d < to && guard++ < 36600) {
      var key = dayKey(new Date(d).toISOString()), weekday = new Date(d + OFFSET).getUTCDay();
      if (c.days.indexOf(weekday) !== -1 && c.holidays.indexOf(key) === -1) {
        var parts = c.breakFrom && c.breakTo ? [[c.open,c.breakFrom],[c.breakTo,c.close]] : [[c.open,c.close]];
        parts.forEach(function (p) { var a = Math.max(from,at(key,p[0])), b = Math.min(to,at(key,p[1])); if (b > a) out.push([a,b]); });
      }
      d += DAY;
    }
    return out;
  }
  function subtract(spans, pauses, end) {
    pauses.forEach(function (p) {
      var a=ms(p[0]), b=p[1]?ms(p[1]):end;
      if (!(b>a)) return;
      spans=spans.reduce(function(out,s){
        if(b<=s[0] || a>=s[1]) out.push(s);
        else { if(a>s[0])out.push([s[0],a]); if(b<s[1])out.push([b,s[1]]); }
        return out;
      },[]);
    });
    return spans;
  }
  function hours(spans, c) { return spans.reduce(function(n,s){return n+windows(s[0],s[1],c).reduce(function(v,w){return v+(w[1]-w[0])/HOUR;},0);},0); }
  function between(a,b,c,pauses) {
    var start=ms(a),end=ms(b); if(!isFinite(start)||!isFinite(end)||end<start)return null;
    return hours(subtract([[start,end]],pauses||[],end),c);
  }
  // Làm thêm ngoài lịch: tối đa 4 giờ cho mỗi phiên/lượt, tính từ đầu khoảng ngoài giờ. Chỉ để ghi giờ người làm, không đụng SLA/hạn.
  var OVERTIME_CAP = 4 * HOUR;
  // Khoảng làm ngoài lịch của một phiên ĐÃ khép lại trong cùng một ngày (UTC+7): trước giờ mở và sau giờ đóng của ngày làm việc,
  // hoặc cả phiên nếu rơi vào ngày nghỉ/lễ. Nghỉ trưa không tính. Phiên còn chạy hoặc kéo qua nửa đêm (thường là quên tạm dừng)
  // thì không có khoảng này; phần trong lịch của nó vẫn tính như cũ.
  function overtime(start, end, c) {
    c = calendar(c);
    if (!isFinite(start) || !isFinite(end) || !(end > start)) return [];
    var key = dayKey(new Date(start).toISOString());
    if (key !== dayKey(new Date(end).toISOString())) return [];
    var spans, weekday = new Date(start + OFFSET).getUTCDay();
    if (c.days.indexOf(weekday) === -1 || c.holidays.indexOf(key) !== -1) spans = [[start, end]];
    else {
      var open = at(key, c.open), close = at(key, c.close); spans = [];
      if (start < open) spans.push([start, Math.min(end, open)]);
      if (end > close) spans.push([Math.max(start, close), end]);
    }
    if (c.breakFrom && c.breakTo) spans = subtract(spans, [[at(key, c.breakFrom), at(key, c.breakTo)]], end);
    var left = OVERTIME_CAP;
    return spans.map(function (s) { var len = Math.min(s[1] - s[0], left); left -= len; return [s[0], s[0] + len]; }).filter(function (s) { return s[1] > s[0]; });
  }
  function overtimeHours(list, c) {
    return list.reduce(function (n, s) {
      return s.closed ? n + overtime(s.start, s.end, c).reduce(function (v, w) { return v + (w[1] - w[0]) / HOUR; }, 0) : n;
    }, 0);
  }
  function sessions(item, now) {
    if (item.carried_to_item_id) return [];
    var end=ms(item.completed_at || (item.status==='HUY' ? item.updated_at : now || new Date().toISOString()));
    var recorded=array(item,'processing_sessions');
    if (!recorded.length && item.timing_source === 'CORRECTED') return [];
    if (recorded.length) return recorded.map(function(s){
      return {user_id:s.user_id || '',work_type_code:s.work_type_code || item.work_type_code,product_name:s.product_name || item.product_name || '',
        start:ms(s.start),end:Math.min(s.end?ms(s.end):end,end),closed:!!s.end || !!item.completed_at || item.status==='HUY'};
    }).filter(function(s){return s.end>s.start;});
    // Legacy time can be measured, but its operator must not be invented.
    if (!item.processing_started_at || !isFinite(end)) return [];
    return subtract([[ms(item.processing_started_at),end]],array(item,'pause_log'),end).map(function(s){
      return {user_id:'',work_type_code:item.work_type_code,product_name:item.product_name || '',start:s[0],end:s[1],closed:s[1]<end || !!item.completed_at || item.status==='HUY'};
    }).filter(function(s){return s.end>s.start;});
  }
  function metrics(item,c,now) {
    var end=item.completed_at || (item.status==='HUY' ? item.updated_at : now || new Date().toISOString());
    var receipt=item.dossier_received_at;
    var assigned=item.first_assigned_at || item.assigned_at;
    var submitted=item.submitted_at;
    var recordedSessions=array(item,'processing_sessions');
    var hasProcessMarkers=!!item.processing_started_at || recordedSessions.length>0;
    var processList=hasProcessMarkers ? sessions(item,now) : [];
    var processSpans=processList.map(function(s){return [s.start,s.end];});
    // Phiên đã khép mà làm ngoài lịch (sau giờ vẫn bấm hoàn thành) tính thêm vào giờ xử lý, không vào SLA.
    var extraHours=overtimeHours(processList,c);
    // Không có phiên làm nào thì không có căn cứ để nói hồ sơ đã xử lý bao lâu: khoảng nhận → xong
    // còn gồm cả thời gian chờ khách, đã có riêng ở nhan_den_xong.
    var correctedZero=item.timing_source==='CORRECTED' && hasProcessMarkers && !recordedSessions.length;
    var processHours=processSpans.length ? hours(processSpans,c)+extraHours
      : correctedZero || !item.completed_at && hasProcessMarkers ? 0 : null;
    // Giờ đồng hồ thật của các phiên, kể cả phần ngoài lịch làm việc (đêm, nghỉ trưa, cuối tuần, lễ).
    var wallHours=processSpans.length ? processSpans.reduce(function(n,s){return n+(s[1]-s[0])/HOUR;},0) : correctedZero ? 0 : null;
    return {tiep_nhan:between(assigned,receipt,c),phan_cong:between(item.submitted_at,assigned,c),
      nhan_den_xong:receipt?between(receipt,end,c):null,
      xu_ly:processHours,xu_ly_ngoai_gio:extraHours,xu_ly_thuc_te:wallHours,
      toan_trinh:submitted?between(submitted,end,c,array(item,'sla_pause_log')):null,
      sla_da_dung:receipt?between(receipt,end,c,array(item,'sla_pause_log')):null};
  }
  // Giờ một cán bộ trực tiếp làm trên một hồ sơ: trong lịch làm việc (tính vào giờ làm) và theo đồng hồ thật.
  function workTime(item,c,now,userId) {
    var mine=sessions(item,now).filter(function(s){return s.user_id===userId;});
    var spans=mine.map(function(s){return [s.start,s.end];}), extra=overtimeHours(mine,c);
    return {sessions:spans.length,hours:hours(spans,c)+extra,overtime:extra,wall:spans.reduce(function(n,s){return n+(s[1]-s[0])/HOUR;},0)};
  }
  function workState(item) {
    if (!item || item.completed_at || ['DANG_THUC_HIEN','DA_SOAN_XONG','CHO_KS_DUYET'].indexOf(item.status) === -1) return '';
    if (item.execution_state) return item.execution_state;
    var list=array(item,'processing_sessions'),last=list[list.length-1];
    if (last) return last.end ? 'WAITING' : 'ACTIVE';
    return item.processing_started_at ? 'ACTIVE' : 'QUEUED';
  }
  function nextSessions(item,to,ts,userId,executionState) {
    var list=array(item,'processing_sessions').map(function(s){return Object.assign({},s);});
    if (!list.length && item.processing_started_at) {
      list=sessions(item,ts).map(function(s){return {user_id:s.user_id,work_type_code:s.work_type_code,product_name:s.product_name,start:new Date(s.start).toISOString(),end:new Date(s.end).toISOString()};});
    }
    var focus=executionState === undefined ? item.execution_state : executionState;
    var running=['DANG_THUC_HIEN','DA_SOAN_XONG','CHO_KS_DUYET'].indexOf(to)!==-1 && ['QUEUED','WAITING'].indexOf(focus)===-1;
    var last=list[list.length-1], owner=userId || item.assigned_user_id || '';
    if(last&&!last.end&&(!running||last.user_id!==owner||last.work_type_code!==item.work_type_code))last.end=ts;
    if(running&&(!last||last.end))list.push({user_id:owner,work_type_code:item.work_type_code,product_name:item.product_name || '',start:ts,end:''});
    return list;
  }
  function nextPauses(item,to,ts) {
    var list=array(item,'sla_pause_log').map(function(p){return p.slice();}),last=list[list.length-1];
    var paused=['TAM_DUNG','DANG_HEN_KH','CAN_BO_SUNG','CHUA_GIAO_HO_SO'].indexOf(to)!==-1;
    if(paused&&(!last||last[1]))list.push([ts,'']);
    if(!paused&&last&&!last[1])last[1]=ts;
    return list;
  }
  function deadline(item,sla,c,now) {
    if (item.due_at_override) return item.due_at_override;
    if(!item.dossier_received_at)return '';
    var start=ms(item.dossier_received_at), end=ms(now || new Date().toISOString());
    var paused=hours(array(item,'sla_pause_log').map(function(p){return [Math.max(start,ms(p[0])),Math.min(end,p[1]?ms(p[1]):end)];}).filter(function(p){return p[1]>p[0];}),c);
    var left=Number(sla)+paused;
    var ws=windows(start,start+3660*DAY,c);
    for(var k=0;k<ws.length;k++){var h=(ws[k][1]-ws[k][0])/HOUR;if(left<=h)return new Date(ws[k][0]+left*HOUR).toISOString();left-=h;}
    throw new Error('Không thể tính hạn theo lịch làm việc.');
  }
  function unionHours(spans) {
    var merged=spans.slice().sort(function(a,b){return a[0]-b[0];}).reduce(function(out,s){var p=out[out.length-1];if(p&&s[0]<=p[1])p[1]=Math.max(p[1],s[1]);else out.push(s.slice());return out;},[]);
    return merged.reduce(function(n,s){return n+(s[1]-s[0])/HOUR;},0);
  }
  function clip(spans,from,to) {
    return spans.map(function(w){return [Math.max(w[0],from),Math.min(w[1],to)];}).filter(function(w){return w[1]>w[0];});
  }
  function report(items,c,opts) {
    opts=opts||{}; var from=at(opts.from,'00:00'),to=at(opts.to,'00:00')+DAY,rows={},occupied={},missing=0,missingOwners=0;
    function row(day,user,type,product){
      var key=JSON.stringify([day,user,type,product]);
      return rows[key] || (rows[key]={day:day,user_id:user,work_type_code:type,product_name:product,processing_hours:0,occupied_hours:0,overtime_hours:0,completed:0,sla_hours:0,sla_count:0,cycle_hours:0,cycle_count:0,timed_completed:0,on_time:0,other_operation_hours:0,other_operation_count:0,_spans:[],_items:{}});
    }
    items.filter(function(i){return !i.carried_to_item_id;}).forEach(function(i){
      var work=sessions(i,opts.now),completed=ms(i.completed_at),day=String(i.occurrence_date || '').substring(0,10);
      var relevant=(!opts.user_id || i.assigned_user_id===opts.user_id || work.some(function(s){return s.user_id===opts.user_id;})) && (!opts.work_type_code || i.work_type_code===opts.work_type_code);
      var inPeriod=(day>=opts.from&&day<=opts.to)||(completed>=from&&completed<to)||work.some(function(s){return s.start<to&&s.end>from;});
      if(!i.dossier_received_at&&!awaitingReceipt(i.status)&&relevant&&inPeriod)missing++;
      work.forEach(function(s){
        var ws=windows(Math.max(from,s.start),Math.min(to,s.end),c);
        if(!s.user_id&&ws.length&&(!opts.user_id||i.assigned_user_id===opts.user_id)&&(!opts.work_type_code||s.work_type_code===opts.work_type_code))missingOwners++;
        if(opts.user_id&&s.user_id!==opts.user_id)return;
        if(opts.work_type_code&&s.work_type_code!==opts.work_type_code)return;
        var extra=s.closed?clip(overtime(s.start,s.end,c),from,to):[];
        ws.concat(extra).forEach(function(w){
          var day=dayKey(new Date(w[0]).toISOString()),r=row(day,s.user_id,s.work_type_code,s.product_name),key=day+'|'+s.user_id;
          r.processing_hours+=(w[1]-w[0])/HOUR;r._spans.push(w);r._items[i.origin_item_id || i.item_id]=true;
          if(extra.indexOf(w)!==-1)r.overtime_hours+=(w[1]-w[0])/HOUR;
          if(s.user_id)(occupied[key]=occupied[key]||[]).push(w);
        });
      });
      var done=ms(i.completed_at);
      if(i.status==='HOAN_THANH_LS'&&done>=from&&done<to&&(!opts.user_id||i.assigned_user_id===opts.user_id)&&(!opts.work_type_code||i.work_type_code===opts.work_type_code)){
        var r=row(dayKey(i.completed_at),i.assigned_user_id || '',i.work_type_code,i.product_name || ''),m=metrics(i,c,opts.now);
        r.completed++;r._items[i.origin_item_id || i.item_id]=true;
        if(m.sla_da_dung!==null){r.sla_hours+=m.sla_da_dung;r.sla_count++;}
        if(m.toan_trinh!==null){r.cycle_hours+=m.toan_trinh;r.cycle_count++;}
        if(i.dossier_received_at && i.due_at && i.sla_no_fault!==true){r.timed_completed++;if(ms(i.completed_at)<=ms(i.due_at))r.on_time++;}
      }
    });
    (opts.operations || []).forEach(function(op){
      // Tạm dừng "Khác" chỉ tính khi máy chủ đã gắn việc khác ghi số lượng (counted) — có người làm thật, không phải nghỉ riêng.
      if((['QTTD_TSBĐ','BAO_CAO'].indexOf(op.category)===-1 && op.counted!==true) || (opts.user_id && op.user_id!==opts.user_id) || opts.work_type_code)return;
      var start=ms(op.started_at),end=ms(op.ended_at || opts.now || new Date().toISOString());
      if(!isFinite(start)||!isFinite(end)||end<=start)return;
      var closed=op.closed!==undefined ? !!op.closed : !!op.ended_at && end<ms(opts.now || new Date().toISOString());
      var spans=windows(Math.max(from,start),Math.min(to,end),c),counted=false;
      var extraOps=closed?clip(overtime(start,end,c),from,to):[];
      spans.concat(extraOps).forEach(function(w){
        var day=dayKey(new Date(w[0]).toISOString()),r=row(day,op.user_id,'TAC_NGHIEP_KHAC',op.category_label || op.category),key=day+'|'+op.user_id;
        r._spans.push(w);r.other_operation_hours+=(w[1]-w[0])/HOUR;if(extraOps.indexOf(w)!==-1)r.overtime_hours+=(w[1]-w[0])/HOUR;
        if(!counted){r._items[op.operation_id]=true;r.other_operation_count++;counted=true;}
        (occupied[key]=occupied[key]||[]).push(w);
      });
    });
    var out=Object.keys(rows).sort().map(function(k){var r=rows[k];r.occupied_hours=r.user_id?unionHours(r._spans):0;r.items=Object.keys(r._items).length;
      r.avg_sla_hours=r.sla_count?r.sla_hours/r.sla_count:null;
      r.avg_cycle_hours=r.cycle_count?r.cycle_hours/r.cycle_count:null;delete r._spans;delete r._items;return r;});
    var daily={};
    out.forEach(function(r){var d=daily[r.day] || (daily[r.day]={day:r.day,processing_hours:0,occupied_hours:0,overtime_hours:0,completed:0,other_operation_hours:0,other_operation_count:0});d.processing_hours+=r.processing_hours;d.overtime_hours+=r.overtime_hours;d.completed+=r.completed;d.other_operation_hours+=r.other_operation_hours;d.other_operation_count+=r.other_operation_count;});
    Object.keys(occupied).forEach(function(k){var day=k.substring(0,10);daily[day].occupied_hours+=unionHours(occupied[k]);});
    return {from:opts.from,to:opts.to,formula_version:'sla_time_v5',rows:out,days:Object.keys(daily).sort().map(function(k){return daily[k];}),quality:{missing_handoff:missing,unattributed_sessions:missingOwners},
      total:{processing_hours:out.reduce(function(n,r){return n+r.processing_hours;},0),overtime_hours:out.reduce(function(n,r){return n+r.overtime_hours;},0),occupied_hours:Object.keys(occupied).reduce(function(n,k){return n+unionHours(occupied[k]);},0),completed:out.reduce(function(n,r){return n+r.completed;},0),other_operation_hours:out.reduce(function(n,r){return n+r.other_operation_hours;},0),other_operation_count:out.reduce(function(n,r){return n+r.other_operation_count;},0)}};
  }
  return {awaitingReceipt:awaitingReceipt,array:array,calendar:calendar,calendarIssues:calendarIssues,dayKey:dayKey,between:between,overtime:overtime,sessions:sessions,metrics:metrics,workTime:workTime,workState:workState,nextSessions:nextSessions,nextPauses:nextPauses,deadline:deadline,report:report,unionHours:unionHours};
})();
