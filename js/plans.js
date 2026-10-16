LS.planUI = (function () {
  'use strict';
  var U=LS,D=LS.domain,P=LSPlanning,ui=LS.ui,view=null,request=0;
  function state(){return U.db();}
  function me(){return U.byId(state().users,'user_id',state().session);}
  function leader(){var u=me();return u && ['KS_LS','QUAN_LY_LS','ADMIN'].indexOf(u.role)!==-1;}
  function defs(){return D.DAILY_ROWS.filter(function(r){return P.KEYS.indexOf(r.key)!==-1;});}
  function localContext(){return P.context(state(),D);}
  function currentPlan(){return view.plans.filter(function(p){return p.key===view.period.key;})[0];}
  function isBacklog(key){return key.indexOf('TON_')===0;}
  function lineOf(id){return view.lines.filter(function(l){return l.user_id===id;})[0];}
  function remember(){
    var form=document.querySelector('[data-form="staff-plan"]');if(!form || !view)return;
    Array.prototype.forEach.call(form.querySelectorAll('[data-plan-user]'),function(input){
      var row=lineOf(input.getAttribute('data-plan-user')),key=input.getAttribute('data-plan-key');if(!row)return;
      if(input.value==='')delete row.targets[key];else row.targets[key]=Number(input.value);
    });
    Array.prototype.forEach.call(form.querySelectorAll('[data-plan-total]'),function(input){view.totals[input.getAttribute('data-plan-total')]=input.value;});
    Array.prototype.forEach.call(form.querySelectorAll('[data-plan-pin]'),function(box){view.pins[box.value]=box.checked;});
  }
  function number(n){return n===null || n===undefined?'—':String(Math.round(n*100)/100);}
  function sumOf(key){return view.lines.reduce(function(n,l){var v=l.targets[key];return n+(v===undefined || v===null || isNaN(v)?0:Number(v));},0);}
  function draw(){
    var p=view.period,plan=currentPlan(),closed=!!plan && plan.status==='CLOSED',can=leader() && !closed,keys=defs(),c=view.context;
    var ev=P.evaluate(c,p,view.plans),before=P.evaluate(c,P.previous(p),view.plans),started=p.start<=c.today,full=P.workDays(p,c.calendar);
    var roster=closed?ev.rows.map(function(r){return {user_id:r.user_id,full_name:r.name};}):c.users;
    function rowOf(rows,id){return rows.filter(function(r){return r.user_id===id;})[0];}
    function actualOf(r,k){if(!r)return null;return isBacklog(k)?(r.backlog?r.backlog[k] || 0:null):r.actual[k] || 0;}
    var head='<tr><th scope="col" class="plan-staff-h">Cán bộ</th><th scope="col" class="num">Ngày làm</th><th scope="col" class="num">Đang mở</th><th scope="col" class="num">Đúng hạn</th>'+
      keys.map(function(d){return '<th scope="col" class="plan-key-h'+(isBacklog(d.key)?' is-backlog':'')+'">'+U.esc(d.label)+'<small>'+U.esc(d.unit)+(isBacklog(d.key)?' · tối đa':'')+'</small></th>';}).join('')+'</tr>';
    var body=roster.map(function(u){
      var row=rowOf(ev.rows,u.user_id) || {actual:{},targets:{},ratios:{},backlog:null,onTimeRate:null,open:null},prior=rowOf(before.rows,u.user_id);
      var draft=lineOf(u.user_id) || {targets:row.targets},days=closed?row.days:P.workDays(p,c.calendar,u);
      var cells=keys.map(function(d){
        var k=d.key,goal=draft.targets[k],a=started?actualOf(row,k):null,ratio=row.ratios[k];
        var meta='<span title="Kỳ trước: thực hiện / kế hoạch">Trước '+number(prior?actualOf(prior,k):null)+'/'+number(prior?prior.targets[k]:null)+'</span>';
        if(a!==null)meta+='<span class="plan-done'+(ratio>=100?' is-met':'')+'">TH '+number(a)+(ratio===null || ratio===undefined?'':' · '+number(ratio)+'%')+'</span>';
        var tip='';
        if(can && !isBacklog(k)){var cap=P.capacity(c,u,p,k);tip=cap.confidence==='NO_DATA'?'Chưa có mẫu':cap.confidence==='SUPPLY_LIMITED'?'Đầu vào cần kiểm tra':cap.confidence==='LIMITED'?'Ít mẫu':'Năng suất ổn định';if(cap.value!==null)tip+=' · tham khảo '+cap.value;}
        var main=can?'<input type="number" inputmode="numeric" min="0" max="1000000" step="1" data-plan-user="'+U.attr(u.user_id)+'" data-plan-key="'+U.attr(k)+'" value="'+(goal===undefined || goal===null?'':U.attr(goal))+'"'+
          (tip?' title="'+U.attr(tip)+'"':'')+' aria-label="'+U.attr(d.label+' – '+u.full_name)+'">':'<b class="plan-value">'+number(row.targets[k])+'</b>';
        return '<td class="plan-cell'+(isBacklog(k)?' is-backlog':'')+'">'+main+'<div class="plan-meta">'+meta+'</div></td>';
      }).join('');
      return '<tr data-plan-staff-row><th scope="row"><span class="plan-name">'+U.esc(u.full_name)+'</span>'+
        (can?'<label class="plan-pin"><input type="checkbox" data-plan-pin value="'+U.attr(u.user_id)+'"'+(view.pins[u.user_id]?' checked':'')+'> Khóa</label>':'')+'</th>'+
        '<td class="num">'+number(days)+(days<full?'<div class="plan-meta">nghỉ '+(full-days)+'</div>':'')+'</td><td class="num">'+number(row.open)+'</td>'+
        '<td class="num">'+(row.onTimeRate===null || row.onTimeRate===undefined?'—':number(row.onTimeRate)+'%')+'</td>'+cells+'</tr>';
    }).join('');
    var foot=leader()?'<tr class="plan-sum"><th scope="row" colspan="4">Tổng giao</th>'+keys.map(function(d){return '<td data-plan-sum="'+U.attr(d.key)+'">'+(isBacklog(d.key)?'':number(sumOf(d.key)))+'</td>';}).join('')+'</tr>'+
      (can?'<tr class="plan-total-row"><th scope="row" colspan="4"><span>Tổng phòng</span>'+ui.btn('Gợi ý',{data:' data-plan-act="suggest"',kind:'line',sm:true,title:'Chia tổng phòng theo năng suất, giữ nguyên dòng Khóa'})+'</th>'+keys.map(function(d){
        return '<td>'+(isBacklog(d.key)?'':'<input type="number" min="0" step="1" data-plan-total="'+U.attr(d.key)+'" value="'+U.attr(view.totals[d.key] || '')+'" aria-label="Tổng phòng – '+U.attr(d.label)+'">')+'</td>';
      }).join('')+'</tr>':''):'';
    var history=view.history.length?'<details class="plan-history"><summary>Lịch sử ('+view.history.length+')</summary>'+view.history.map(function(h){return '<p>v'+h.version+' · '+U.esc(h.action==='CLOSE'?'Chốt kỳ':'Giao kế hoạch')+' · '+U.esc(h.by)+' · '+U.esc(U.fmtDT(h.at))+'</p>';}).join('')+'</details>':'';
    var prev=P.previous(p);
    var html='<form data-form="staff-plan" class="plan-form"><div class="plan-bar"><div class="plan-pick">'+
      ui.field('Kỳ',ui.select('staff_plan_type',[['week','Tuần'],['month','Tháng'],['quarter','Quý']],p.type))+
      ui.field('Ngày trong kỳ',ui.input('staff_plan_date',p.start,{type:'date'}))+ui.btn('Xem kỳ',{data:' data-plan-act="load"',kind:'line'})+'</div>'+
      '<div class="plan-status"><b>'+U.esc(U.fmtDate(p.start)+' → '+U.fmtDate(p.end))+'</b><span>'+(plan?'v'+plan.version+' · '+(closed?'Đã chốt':'Đã giao'):'Chưa giao')+' · '+full+' ngày làm</span>'+
        '<span>Kỳ trước '+U.esc(U.fmtDate(prev.start)+' → '+U.fmtDate(prev.end))+'</span></div>'+
      '<div class="plan-actions">'+(can?ui.btn('Tải mẫu Excel',{data:' data-plan-act="template"',kind:'line',icon:'download'})+ui.btn('Nhập Excel',{data:' data-plan-act="import"',kind:'line',icon:'file'})+
        '<input type="file" hidden data-plan-file accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv">'+
        ui.btn('Sao chép kỳ trước',{data:' data-plan-act="copy"',kind:'line'}):'')+
      (leader() && plan && !closed && p.end<c.today?ui.btn('Chốt kỳ',{data:' data-plan-act="close"',kind:'line',disabled:view.saving}):'')+
      (can?'<button type="submit" class="btn btn-primary" data-plan-save'+(view.saving?' disabled':'')+'>'+(view.saving?'Đang lưu…':'Giao kế hoạch')+'</button>':'')+'</div></div>'+
      (view.warning?ui.banner('warn','Cần kiểm tra',U.esc(view.warning)):'')+
      '<div class="plan-matrix-wrap"><table class="plan-matrix"><thead>'+head+'</thead><tbody>'+body+'</tbody>'+(foot?'<tfoot>'+foot+'</tfoot>':'')+'</table></div>'+history+'</form>';
    ui.openDialog(leader()?'Giao kế hoạch cán bộ':'Kế hoạch của tôi',html,{size:'xl plan-dialog'});
  }
  /** Mẫu Excel theo đúng kỳ đang mở: điền sẵn cán bộ và số đang giao, sửa xong nhập lại. */
  function template(){
    var p=view.period,keys=defs();
    var rows=[['Kỳ',p.key,U.fmtDate(p.start)+' → '+U.fmtDate(p.end)],['Mã CB','Họ tên'].concat(keys.map(function(d){return d.label+' ('+d.unit+')';}))];
    view.context.users.forEach(function(u){
      var l=lineOf(u.user_id) || {targets:{}};
      rows.push([u.user_id,u.full_name].concat(keys.map(function(d){var v=l.targets[d.key];return v===undefined || v===null?'':Number(v);})));
    });
    LS.app.downloadXlsx('mau_giao_ke_hoach_'+p.type+'_'+p.start,[{name:'Giao kế hoạch',rows:rows,headerRows:[1],autoFilter:false}]);
  }
  function norm(v){return String(v===undefined || v===null?'':v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim();}
  /** Điền bảng từ file Excel; chưa lưu cho đến khi bấm Giao kế hoạch. */
  function fill(matrix){
    var h=-1,fileKey='';
    matrix.forEach(function(r,i){
      if(h!==-1)return;
      if(norm(r[0])==='ky')fileKey=String(r[1] || '').trim();
      if(r.some(function(x){return norm(x)==='ho ten';}))h=i;
    });
    if(h===-1)throw new Error('File không có dòng tiêu đề "Họ tên".');
    var header=matrix[h].map(norm),idCol=header.indexOf('ma cb'),nameCol=header.indexOf('ho ten'),cols={};
    defs().forEach(function(d){
      var names=[norm(d.label+' ('+d.unit+')'),norm(d.label),norm(d.key)];
      for(var i=0;i<header.length;i++)if(names.indexOf(header[i])!==-1){cols[d.key]=i;break;}
    });
    if(!Object.keys(cols).length)throw new Error('File không có cột chỉ tiêu nào.');
    var errors=[],missing=[],updates=[];
    matrix.slice(h+1).forEach(function(r,i){
      var id=idCol===-1?'':String(r[idCol] || '').trim(),name=String(r[nameCol] || '').trim();
      if(!id && !name)return;
      var target=id?lineOf(id):null;
      if(!target){var same=view.context.users.filter(function(u){return norm(u.full_name)===norm(name);});if(same.length===1)target=lineOf(same[0].user_id);}
      if(!target){missing.push(name || id);return;}
      var values={};
      Object.keys(cols).forEach(function(k){
        var v=r[cols[k]],n=Number(String(v).trim());
        if(v===undefined || v===null || String(v).trim()===''){values[k]=null;return;}
        if(!Number.isInteger(n) || n<0 || n>1000000)errors.push('dòng '+(h+i+2)+' ('+(name || id)+')');else values[k]=n;
      });
      updates.push([target,values]);
    });
    if(errors.length)throw new Error('Số chỉ tiêu không hợp lệ ở '+errors.slice(0,3).join(', ')+(errors.length>3?'…':'')+'.');
    if(!updates.length)throw new Error('File không có dòng cán bộ nào khớp.');
    updates.forEach(function(u){Object.keys(u[1]).forEach(function(k){if(u[1][k]===null)delete u[0].targets[k];else u[0].targets[k]=u[1][k];});});
    var notes=[];
    if(fileKey && fileKey!==view.period.key)notes.push('File mẫu của kỳ '+fileKey+', đang mở kỳ '+view.period.key+'.');
    if(missing.length)notes.push('Không khớp cán bộ: '+missing.join(', ')+'.');
    view.warning=notes.join(' ');draw();ui.toast('Đã điền '+updates.length+' cán bộ từ Excel.','ok');
  }
  function importFile(file){
    if(!file || !view || view.saving)return;remember();
    var read=file.arrayBuffer?file.arrayBuffer():new Promise(function(ok,fail){var r=new FileReader();r.onload=function(){ok(r.result);};r.onerror=fail;r.readAsArrayBuffer(file);});
    Promise.all([LS.app.loadXlsx(),read]).then(function(res){
      var X=res[0],book=X.read(res[1],{type:'array'}),sheet=book.Sheets[book.SheetNames[0]];
      if(!sheet)throw new Error('File không có sheet dữ liệu.');
      fill(X.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:false}));
    }).catch(function(e){ui.toast(e.message || 'Không đọc được file Excel.','err');});
  }
  /** Dán khối số chép từ Excel vào một ô: trải sang phải và xuống dưới như bảng tính. */
  function paste(input,text){
    var grid=String(text || '').replace(/\r/g,'').replace(/\n$/,'').split('\n').map(function(r){return r.split('\t');});
    if(grid.length<2 && grid[0].length<2)return false;
    var form=input.form,ids=[],keys=[];
    Array.prototype.forEach.call(form.querySelectorAll('[data-plan-user]'),function(x){
      var id=x.getAttribute('data-plan-user'),k=x.getAttribute('data-plan-key');
      if(ids.indexOf(id)===-1)ids.push(id);if(keys.indexOf(k)===-1)keys.push(k);
    });
    var r0=ids.indexOf(input.getAttribute('data-plan-user')),c0=keys.indexOf(input.getAttribute('data-plan-key'));
    grid.forEach(function(r,i){r.forEach(function(v,j){
      var id=ids[r0+i],k=keys[c0+j],cell=null,s=String(v).trim().replace(/[.,\s](?=\d{3}$)/g,'');
      if(id && k)Array.prototype.forEach.call(form.querySelectorAll('[data-plan-user]'),function(x){if(x.getAttribute('data-plan-user')===id && x.getAttribute('data-plan-key')===k)cell=x;});
      if(cell && (s==='' || /^\d+$/.test(s)))cell.value=s;
    });});
    keys.forEach(updateSum);return true;
  }
  function updateSum(key){
    remember();
    var cell=document.querySelector('[data-plan-sum="'+key+'"]');
    if(cell && !isBacklog(key))cell.textContent=number(sumOf(key));
  }
  function open(type,onDate){
    var u=me();if(!u || ['KS_LS','QUAN_LY_LS','ADMIN','CAN_BO_LS'].indexOf(u.role)===-1){ui.toast('Bạn không có quyền xem kế hoạch.','err');return Promise.resolve();}
    var p=P.period(type || 'week',onDate || U.localDate()),token=++request;
    ui.openDialog('Kế hoạch cán bộ','<p data-plan-loading>Đang lấy kế hoạch…</p>',{size:'xl plan-dialog'});
    var load=U.isGas()?LS.api.getWorkPlanning(p.type,p.start):Promise.resolve({context:localContext(),plans:state().staffPlans || [],history:(state().staffPlanHistory || []).filter(function(h){return h.plan_id===p.key;})});
    return load.then(function(data){
      if(token!==request || state().session!==u.user_id || !me() || me().role!==u.role || (U.isGas() && !document.querySelector('[data-plan-loading]')))return;
      var c=data.context;c.domain=D;c.types=state().workTypes;c.plans=data.plans;
      if(!leader()){
        c.users=c.users.filter(function(x){return x.user_id===u.user_id;});
        c.historicalUsers=(c.historicalUsers || []).filter(function(x){return x.user_id===u.user_id;});
        c.events=c.events.filter(function(x){return x.user_id===u.user_id;});
        c.outcomes=(c.outcomes || []).filter(function(x){return x.user_id===u.user_id;});c.intakes=(c.intakes || []).filter(function(x){return x.user_id===u.user_id;});
        data.plans=data.plans.map(function(q){var copy=Object.assign({},q,{lines:q.lines.filter(function(l){return l.user_id===u.user_id;})});
          if(q.snapshot)copy.snapshot=Object.assign({},q.snapshot,{rows:q.snapshot.rows.filter(function(r){return r.user_id===u.user_id;})});return copy;});
        c.plans=data.plans;
      }
      var plan=data.plans.filter(function(q){return q.key===p.key;})[0];
      var lines=c.users.map(function(x){var found=plan && plan.lines.filter(function(l){return l.user_id===x.user_id;})[0];return {user_id:x.user_id,targets:found?Object.assign({},found.targets):{}};});
      view={period:p,context:c,plans:data.plans,history:data.history,lines:lines,pins:{},totals:{},warning:'',saving:false};draw();
    }).catch(function(e){ui.toast(e.message,'err');ui.openDialog('Kế hoạch cán bộ','<p>'+U.esc(e.message)+'</p>',{size:'lg'});});
  }
  function applyPlan(plan,action){
    if(LS.screens)LS.screens.setFilter('board','plan','1');
    state().staffPlans=(state().staffPlans || []).filter(function(q){return q.key!==plan.key;}).concat([plan]);
    view.plans=view.plans.filter(function(q){return q.key!==plan.key;}).concat([plan]);view.context.plans=view.plans;
    var h={plan_id:plan.plan_id,version:plan.version,by:state().session,at:new Date().toISOString(),action:action};view.history.push(h);
    if(!U.isGas()){(state().staffPlanHistory || (state().staffPlanHistory=[])).push(Object.assign({},h,{plan_json:JSON.stringify(plan)}));U.save();}
    view.saving=false;draw();if(LS.app)LS.app.render();ui.toast(action==='CLOSE'?'Đã chốt kỳ.':'Đã giao kế hoạch.','ok');
  }
  function publish(){
    if(!leader() || !view || view.saving)return;remember();
    try {
      view.lines.forEach(function(l){Object.keys(l.targets).forEach(function(k){if(!Number.isInteger(l.targets[k]) || l.targets[k]<0 || l.targets[k]>1000000)throw new Error('Chỉ tiêu phải là số nguyên không âm.');});});
      var plan=currentPlan(),issues=P.hierarchyIssues(view.plans.filter(function(q){return q.key!==view.period.key;}).concat([Object.assign({},view.period,{lines:view.lines})]),view.context.calendar);
      if(issues.length)throw new Error(issues[0]);
      view.saving=true;draw();
      var payload={type:view.period.type,date:view.period.start,expected_version:plan?plan.version:0,lines:view.lines};
      var run=U.isGas()?LS.api.saveStaffPlan(payload):Promise.resolve(Object.assign({},view.period,{plan_id:view.period.key,status:'PUBLISHED',version:payload.expected_version+1,lines:JSON.parse(JSON.stringify(view.lines)),assigned_by:state().session,assigned_at:new Date().toISOString()}));
      run.then(function(result){applyPlan(result,'PUBLISH');}).catch(function(e){view.saving=false;view.warning=e.message;draw();ui.toast(e.message,'err');});
    }catch(e){ui.toast(e.message,'err');}
  }
  function action(name){
    if(!view || view.saving)return;remember();var form=document.querySelector('[data-form="staff-plan"]');
    if(name==='load'){open(form.elements.staff_plan_type.value,form.elements.staff_plan_date.value);return;}
    if(!leader())return;
    try {
      if(name==='suggest') {
        var keys=defs().map(function(d){return d.key;}).filter(function(k){return !isBacklog(k) && String(view.totals[k] || '')!=='';}),notes=[];
        if(!keys.length)throw new Error('Nhập tổng phòng cho ít nhất một chỉ tiêu.');
        keys.forEach(function(k){
          var pins={};view.lines.forEach(function(l){if(view.pins[l.user_id])pins[l.user_id]=l.targets[k] || 0;});
          var s=P.suggest(view.context,view.period,k,Number(view.totals[k]),pins);
          view.lines.forEach(function(l){l.targets[k]=s.values[l.user_id];});
          if(s.warning)notes.push(defs().filter(function(d){return d.key===k;})[0].label+': '+s.warning);
        });
        view.warning=notes.join(' ');draw();
      } else if(name==='copy') {
        var prior=P.previous(view.period),ev=P.evaluate(view.context,prior,view.plans);
        view.lines.forEach(function(l){
          if(view.pins[l.user_id])return;
          var r=ev.rows.filter(function(x){return x.user_id===l.user_id;})[0],u=U.byId(view.context.users,'user_id',l.user_id);
          if(r)P.KEYS.forEach(function(k){var n=r.targets[k];
            if(n!==null && n!==undefined)l.targets[k]=isBacklog(k)?n:Math.round(n*P.workDays(view.period,view.context.calendar,u)/Math.max(1,P.workDays(prior,view.context.calendar,u)));});
        });draw();
      } else if(name==='template') template();
      else if(name==='import') {var input=form.querySelector('[data-plan-file]');if(input){input.value='';input.click();}}
      else if(name==='close') {
        var plan=currentPlan();if(!plan || plan.status==='CLOSED')return;view.saving=true;draw();
        var closed=Object.assign({},plan,{status:'CLOSED',version:plan.version+1,snapshot:P.evaluate(view.context,view.period,view.plans)});
        var run=U.isGas()?LS.api.closeStaffPlan(plan.plan_id,plan.version):Promise.resolve(closed);
        run.then(function(result){applyPlan(result,'CLOSE');}).catch(function(e){view.saving=false;view.warning=e.message;draw();});
      }
    }catch(e){ui.toast(e.message,'err');}
  }
  function summary(userId){
    var plans=state().staffPlans || [],p=P.period('week',U.localDate());
    if(!plans.some(function(q){return q.key===p.key;}))p=P.period('month',U.localDate());
    if(!plans.some(function(q){return q.key===p.key;}))p=P.period('quarter',U.localDate());
    var c=localContext(),ev=P.evaluate(c,p,plans),row=ev.rows.filter(function(r){return r.user_id===userId;})[0];
    if(!row)return '';
    var entries=defs().filter(function(d){return row.targets[d.key]!==null;}).map(function(d){var actual=d.key.indexOf('TON_')===0?(row.backlog?row.backlog[d.key] || 0:null):row.actual[d.key] || 0;
      return '<div><span>'+U.esc(d.label)+'</span><b>'+number(actual)+' / '+number(row.targets[d.key])+'</b><small>'+U.esc(d.unit)+'</small></div>';}).join('');
    return ui.block({title:'Kế hoạch của tôi',icon:'clipboard',actions:ui.btn('Xem kế hoạch',{data:' data-plan-act="open"',kind:'line',sm:true}),body:ui.pad(entries?'<p class="t2">'+U.esc(U.fmtDate(p.start)+' → '+U.fmtDate(p.end))+'</p><div class="plan-personal">'+entries+'</div>':'<p class="t2">Chưa giao kế hoạch cá nhân trong kỳ.</p>')});
  }
  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-plan-act]');if(!el)return;e.preventDefault();var name=el.getAttribute('data-plan-act');if(name==='open')open();else action(name);
  });
  document.addEventListener('submit',function(e){if(e.target.getAttribute('data-form')==='staff-plan'){e.preventDefault();publish();}});
  document.addEventListener('input',function(e){var key=e.target.getAttribute && e.target.getAttribute('data-plan-key');if(key && view)updateSum(key);});
  document.addEventListener('change',function(e){if(e.target.hasAttribute && e.target.hasAttribute('data-plan-file'))importFile(e.target.files[0]);});
  document.addEventListener('paste',function(e){
    var t=e.target;if(!view || !t.hasAttribute || !t.hasAttribute('data-plan-user'))return;
    if(paste(t,(e.clipboardData || window.clipboardData).getData('text')))e.preventDefault();
  });
  // Enter trong ô chỉ tiêu xuống dòng dưới cùng cột, không gửi form như bảng tính.
  document.addEventListener('keydown',function(e){
    var t=e.target;if(e.key!=='Enter' || !view || !t.hasAttribute || (!t.hasAttribute('data-plan-user') && !t.hasAttribute('data-plan-total')))return;
    e.preventDefault();if(!t.hasAttribute('data-plan-user'))return;
    var key=t.getAttribute('data-plan-key'),col=Array.prototype.filter.call(t.form.querySelectorAll('[data-plan-key]'),function(x){return x.getAttribute('data-plan-key')===key;});
    var next=col[col.indexOf(t)+(e.shiftKey?-1:1)];if(next){next.focus();next.select();}
  });
  return {open:open,summary:summary};
})();
