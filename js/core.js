/**
 * core.js — tiện ích dùng chung, bộ biểu tượng, kho dữ liệu.
 * Mọi module khác treo vào đối tượng LS.
 */
/* SLA_TIME_SHARED_BEGIN */
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
/* SLA_TIME_SHARED_END */
var LS = (function () {
  'use strict';

  var STORE_KEY = 'ls_routing_v3';
  var backend = 'BROWSER';

  /* ============================ Chuỗi & thời gian ============================ */

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function attr(v) { return esc(v).replace(/\n/g, ' '); }

  function now() { return new Date().toISOString(); }

  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + '_' + Date.now().toString(36).toUpperCase() + seq.toString(36).toUpperCase();
  }

  function fmtDate(v) {
    if (!v) return '—';
    var raw = String(v);
    var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    var dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      var day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3]);
      var checked = new Date(year, month - 1, day);
      if (month >= 1 && month <= 12 && checked.getFullYear() === year && checked.getMonth() === month - 1 && checked.getDate() === day) {
        return pad(day) + '/' + pad(month) + '/' + year;
      }
    }
    var d = new Date(v);
    return isNaN(d.getTime()) ? esc(v) : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtTime(v) {
    var d = new Date(v);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDT(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? esc(v) : fmtTime(v) + ' ' + fmtDate(v);
  }

  /** "2 giờ trước", "trong 30 phút" — đọc nhanh hơn dấu thời gian tuyệt đối. */
  function fmtGap(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return m + ' phút';
    var h = Math.round(m / 60);
    if (h < 48) return h + ' giờ';
    return Math.round(h / 24) + ' ngày';
  }

  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[p.length - 2].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
  }

  /** Che bớt số điện thoại / email khi hiển thị trong nhật ký và hàng đợi gửi. */
  function mask(v) {
    v = String(v || '');
    if (!v) return '—';
    if (v.indexOf('@') > 0) {
      var parts = v.split('@');
      return parts[0].slice(0, 2) + '***@' + parts[1];
    }
    return v.length > 6 ? v.slice(0, 3) + '***' + v.slice(-2) : '***';
  }

  function pct(part, total) { return total ? Math.round((part / total) * 100) : null; }

  /**
   * Tra theo khóa bằng chỉ mục dựng một lần cho mỗi (danh sách, cột), thay vì duyệt tuần tự: màn hình gọi hàng
   * chục nghìn lần mỗi lần vẽ (mỗi dòng hồ sơ tra hồ sơ khách, loại việc, cán bộ), duyệt tuần tự trên vài nghìn
   * dòng làm mỗi lần bấm chậm cả giây. Kết quả luôn kiểm lại trước khi trả; danh sách đổi độ dài hoặc phần tử
   * đổi mã tại chỗ thì dựng lại chỉ mục, nên không bao giờ trả sai so với cách duyệt cũ.
   */
  var byIdIndex = typeof WeakMap === 'function' ? new WeakMap() : null;
  function byIdScan(list, key, val) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i][key] === val) return i;
    return -1;
  }
  function byIdBuild(list, key) {
    var map = new Map();
    for (var i = 0; i < list.length; i++) {
      var k = list[i] ? list[i][key] : undefined;
      if (k !== undefined && !map.has(k)) map.set(k, i);
    }
    return { len: list.length, map: map };
  }
  function byId(list, key, val) {
    if (!list || !list.length) return null;
    if (!byIdIndex || list.length < 64) { var j = byIdScan(list, key, val); return j === -1 ? null : list[j]; }
    var perList = byIdIndex.get(list);
    if (!perList) { perList = {}; byIdIndex.set(list, perList); }
    var idx = perList[key];
    if (!idx || idx.len !== list.length) idx = perList[key] = byIdBuild(list, key);
    var at = idx.map.get(val);
    if (at !== undefined && list[at] && list[at][key] === val) return list[at];
    // Không có trong chỉ mục hoặc chỉ mục cũ (phần tử đổi mã tại chỗ, đổi thứ tự): dò tuần tự như cách cũ;
    // tìm thấy thì dựng lại chỉ mục cho các lần sau.
    var found = byIdScan(list, key, val);
    if (found !== -1) perList[key] = byIdBuild(list, key);
    return found === -1 ? null : list[found];
  }

  function where(list, fn) { return list.filter(fn); }

  function sum(list, fn) {
    var t = 0;
    list.forEach(function (x) { t += fn(x) || 0; });
    return t;
  }

  /* ============================ Lịch làm việc ============================ */

  function hm(t) {
    var p = String(t || '0:0').split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  function isWorkday(d, cal) {
    if (cal.days.indexOf(d.getDay()) === -1) return false;
    return cal.holidays.indexOf(localDate(d)) === -1;
  }

  function segments(cal) {
    var o = hm(cal.open), c = hm(cal.close);
    if (cal.breakFrom && cal.breakTo) return [[o, hm(cal.breakFrom)], [hm(cal.breakTo), c]];
    return [[o, c]];
  }

  /**
   * Tính số mili-giây làm việc thực tế giữa hai mốc. Không dùng phép trừ
   * Date đơn giản vì hồ sơ có thể chạy qua giờ nghỉ trưa, buổi tối, cuối tuần
   * hoặc ngày lễ. Mốc ngày/giờ được giữ theo múi giờ trình duyệt của ứng dụng
   * (GAS luôn chạy theo Asia/Ho_Chi_Minh).
   */
  function workingMilliseconds(fromIso, toIso, cal) {
    if (!fromIso || !toIso) return null;
    var from = new Date(fromIso), to = new Date(toIso);
    if (!isFinite(from.getTime()) || !isFinite(to.getTime()) || to < from) return null;
    cal = cal || { days: [1, 2, 3, 4, 5], open: '07:30', close: '18:00', breakFrom: '11:30', breakTo: '13:30', holidays: [] };
    var total = 0, cursor = new Date(from.getTime()), guard = 0, segs = segments(cal);
    while (cursor < to && guard++ < 10000) {
      if (!isWorkday(cursor, cal)) {
        cursor.setDate(cursor.getDate() + 1); cursor.setHours(0, 0, 0, 0); continue;
      }
      var dayStart = new Date(cursor.getTime()); dayStart.setHours(0, 0, 0, 0);
      var nextDay = new Date(dayStart.getTime()); nextDay.setDate(nextDay.getDate() + 1);
      var moved = false;
      segs.forEach(function (seg) {
        if (cursor >= to || moved && cursor >= nextDay) return;
        var start = new Date(dayStart.getTime()); start.setMinutes(seg[0]);
        var end = new Date(dayStart.getTime()); end.setMinutes(seg[1]);
        var a = cursor > start ? cursor : start;
        var b = to < end ? to : end;
        if (b > a) total += b.getTime() - a.getTime();
        if (cursor < end) { cursor = new Date(end.getTime()); moved = true; }
      });
      if (cursor < nextDay && cursor < to) { cursor = nextDay; }
    }
    return total;
  }

  function workingHours(fromIso, toIso, cal) {
    var ms = workingMilliseconds(fromIso, toIso, cal);
    return ms === null ? null : Math.round((ms / 3600000) * 10) / 10;
  }

  /**
   * Cộng giờ làm việc thật vào một mốc, bỏ qua ngoài giờ, nghỉ trưa, cuối tuần và ngày lễ.
   * Giao lúc 16h chiều thứ Sáu với SLA 4 giờ phải ra sáng thứ Hai, không phải 20h thứ Sáu.
   */
  function addWorkingHours(startIso, hours, cal) {
    var need = Math.round(Number(hours) * 60);
    var d = new Date(startIso);
    var segs = segments(cal);
    var guard = 0;

    while (need > 0 && guard < 500) {
      guard += 1;
      if (!isWorkday(d, cal)) { d = nextOpen(d, cal); continue; }

      var cur = d.getHours() * 60 + d.getMinutes();
      var moved = false;

      for (var i = 0; i < segs.length; i++) {
        var s = segs[i][0], e = segs[i][1];
        if (cur >= e) continue;
        var from = Math.max(cur, s);
        var avail = e - from;
        if (avail <= 0) continue;

        if (avail >= need) {
          d.setHours(0, from + need, 0, 0);
          return d.toISOString();
        }
        need -= avail;
        cur = e;
        moved = true;
      }

      if (!moved && cur < segs[0][0]) { d.setHours(0, segs[0][0], 0, 0); continue; }
      d = nextOpen(d, cal);
    }
    return d.toISOString();
  }

  function nextOpen(d, cal) {
    var n = new Date(d.getTime());
    n.setDate(n.getDate() + 1);
    n.setHours(0, hm(cal.open), 0, 0);
    return n;
  }

  /** Kỳ báo cáo: tuần bắt đầu thứ Hai theo mặc định, đổi được trong cấu hình. */
  function periodRange(period, from, to, weekStart) {
    var d = new Date();
    if (period === 'custom') {
      return {
        from: new Date((from || localDate()) + 'T00:00:00').getTime(),
        to: new Date((to || localDate()) + 'T23:59:59').getTime()
      };
    }
    var start;
    if (period === 'month') start = new Date(d.getFullYear(), d.getMonth(), 1);
    else if (period === 'quarter') start = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    else if (period === 'year') start = new Date(d.getFullYear(), 0, 1);
    else {
      var first = weekStart === 'SUNDAY' ? 0 : 1;
      var back = (d.getDay() - first + 7) % 7;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    }
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: Date.now() };
  }

  /* ============================ Biểu tượng ============================ */

  var PATHS = {
    inbox: 'M4 13h4l1.5 2.5h5L16 13h4M4 13l2.4-7.4A2 2 0 0 1 8.3 4h7.4a2 2 0 0 1 1.9 1.6L20 13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    clipboard: 'M9 4.5h6v3H9zM9 6H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2',
    shield: 'M12 3 20 6v6c0 4.4-3.2 7.9-8 9-4.8-1.1-8-4.6-8-9V6zM9 12l2 2 4-4',
    briefcase: 'M4 8h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
    chart: 'M3 21h18M7 21V11M12 21V5M17 21v-8',
    sliders: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3M15 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0M11 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0M15 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
    filter: 'M4 5h16l-6.2 7.1v5.8l-3.6 1.8v-7.6z',
    history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v5h5M12 8v4.3l3 1.7',
    search: 'M18 11a7 7 0 1 0-14 0 7 7 0 0 0 14 0M20.5 20.5 16 16',
    plus: 'M12 5v14M5 12h14',
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    check: 'm5 12.5 4.5 4.5L19 7',
    warn: 'M12 3.8 2.6 20h18.8zM12 10v4.2M12 17.4v.2',
    info: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 11.5V16M12 8v.2',
    ban: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M6 6l12 12',
    mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
    chat: 'M21 11.5a8 8 0 0 1-11.7 7.1L4.2 20l1.3-4.6A8 8 0 1 1 21 11.5z',
    send: 'M21.5 3 10.5 14M21.5 3l-7 18-3.9-6.9L3.5 10z',
    bell: 'M18 10.5a6 6 0 0 0-12 0c0 5.5-2 6.5-2 6.5h16s-2-1-2-6.5M10.2 20.2a2.2 2.2 0 0 0 3.6 0',
    users: 'M16 20.5v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M13 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M17 4.3a3.5 3.5 0 0 1 0 6.4M21 20.5v-2a4 4 0 0 0-3-3.9',
    tag: 'M11.2 3.5H4.5a1 1 0 0 0-1 1v6.7a1.5 1.5 0 0 0 .44 1.06l7.8 7.8a1.5 1.5 0 0 0 2.12 0l6.24-6.24a1.5 1.5 0 0 0 0-2.12l-7.8-7.8A1.5 1.5 0 0 0 11.2 3.5zM7.8 7.8v.2',
    calendar: 'M4.5 6h15v14.5h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
    building: 'M4 21V4.8a1 1 0 0 1 1-1h8.6a1 1 0 0 1 1 1V21M14.6 10.5H19a1 1 0 0 1 1 1V21M2.8 21h18.4M7.5 8h3.5M7.5 12h3.5M7.5 16h3.5',
    clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M12 7.2V12l3.2 1.9',
    download: 'M12 3.5v11M7.6 10.2 12 14.6l4.4-4.4M4 20h16',
    refresh: 'M20.5 12a8.5 8.5 0 1 1-2.7-6.2M19.5 3v4h-4',
    trash: 'M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.2 7l.9 12.1a1 1 0 0 0 1 .9h7.8a1 1 0 0 0 1-.9L17.8 7',
    pencil: 'M4 20.2h4.2L20 8.4 15.8 4.2 4 16zM14.4 5.6l4.2 4.2',
    eye: 'M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off': 'M3 3l18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.2 3.8M6.2 6.2A16.7 16.7 0 0 0 2.5 12S6 18 12 18c1.2 0 2.3-.2 3.3-.6M9.7 9.7a3.2 3.2 0 0 0 4.5 4.5',
    arrow: 'M4 12h14.5M13 6.5l5.5 5.5-5.5 5.5',
    lock: 'M5.5 10.8h13V21h-13zM8.5 10.8V7.6a3.5 3.5 0 0 1 7 0v3.2',
    play: 'M7.5 4.8 19.5 12l-12 7.2z',
    pause: 'M9.5 5v14M15 5v14',
    database: 'M20 6c0 1.66-3.58 3-8 3S4 7.66 4 6s3.58-3 8-3 8 1.34 8 3zM4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3',
    activity: 'M3 12.5h4l2.8 7.2L14 4.5l2.6 8h4.4',
    key: 'M11.5 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0M10.8 12.2 20 3l1.5 1.5-1.6 1.6 1.6 1.6-2.6 2.6-1.6-1.6-2 2',
    keyboard: 'M3.5 6.5h17v11h-17zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8',
    file: 'M6.5 3.5h7l4.5 4.5v12.5h-11.5zM13.5 3.5V8H18',
    zap: 'M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z',
    right: 'm9.5 6 6 6-6 6',
    down: 'm6.5 9.5 5.5 5.5 5.5-5.5',
    link: 'M9.8 14.2 14.2 9.8M11.2 7.4 12.8 5.8a4 4 0 0 1 5.6 5.6l-1.6 1.6M12.8 16.6l-1.6 1.6a4 4 0 0 1-5.6-5.6l1.6-1.6',
    logout: 'M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 8l-4 4 4 4M6 12h9'
  };

  /** icon('mail', 18) → SVG nội tuyến, kế thừa currentColor. */
  function icon(name, size) {
    var d = PATHS[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + d + '"/></svg>';
  }

  /* ============================ Kho dữ liệu ============================ */

  var state = null;

  function load(seedFn) {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.schema === 3 && p.items && p.channels) {
          // Cache local cũ có thể giữ bộ 5 loại việc demo trước đây. Nâng danh mục
          // lên đủ 29 sản phẩm, nhưng vẫn giữ hồ sơ, người dùng và lịch sử đang có.
          var seed = null;
          if (!p.workTypes || !p.workTypes.some(function (w) { return w.code === 'LEGACY_29'; })) {
            seed = seedFn();
            p.workTypes = seed.workTypes || [];
          }
          // Bổ sung danh mục nguồn cho cache cũ mà không xoá dữ liệu nghiệp vụ demo.
          if (!p.catalogOptions) p.catalogOptions = (seed || seedFn()).catalogOptions || [];
          state = p;
          save();
          return state;
        }
      }
    } catch (e) { /* dữ liệu hỏng thì dựng lại từ mẫu */ }
    state = seedFn();
    return state;
  }

  function save() {
    // GAS là nguồn dữ liệu chính; không bao giờ coi cache trình duyệt là bản ghi nghiệp vụ.
    if (backend === 'GAS') return true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  function reset(seedFn) {
    var session = state ? state.session : null;
    state = seedFn();
    if (session && byId(state.users, 'user_id', session)) state.session = session;
    save();
    return state;
  }

  function db() { return state; }
  function replace(next) { state = next; return state; }
  function setBackend(next) { backend = next === 'GAS' ? 'GAS' : 'BROWSER'; }
  function isGas() { return backend === 'GAS'; }

  function normalizePhone(value) {
    var s = String(value === null || value === undefined ? '' : value).trim().replace(/[\s().-]/g,'');
    if (typeof value === 'number' && /^([35789]\d{8}|2\d{9})$/.test(s)) s = '0' + s;
    return s.replace(/^(?:\+84|0084|84)([35789]\d{8})$/,'0$1');
  }
  function validPhone(value) { return !value || /^(?:0\d{9,10}|\+[1-9]\d{7,14})$/.test(normalizePhone(value)); }
  function validEmail(value) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()); }

  return {
    STORE_KEY: STORE_KEY,
    normalizePhone:normalizePhone,validPhone:validPhone,validEmail:validEmail,
    esc: esc, attr: attr, now: now, localDate: localDate, pad: pad, uid: uid,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtDT: fmtDT, fmtGap: fmtGap,
    initials: initials, mask: mask, pct: pct, byId: byId, where: where, sum: sum,
    addWorkingHours: addWorkingHours, workingMilliseconds: workingMilliseconds, workingHours: workingHours,
    isWorkday: isWorkday, periodRange: periodRange,
    icon: icon,
    load: load, save: save, reset: reset, db: db,
    replace: replace, setBackend: setBackend, isGas: isGas
  };
})();
