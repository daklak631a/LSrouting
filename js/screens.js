/**
 * screens.js — các màn hình vận hành: việc đã gửi, hàng chờ, việc của tôi, điều hành.
 * Kèm hộp thoại chi tiết việc, sửa việc, chuyển trạng thái và đăng ký việc mới.
 */
LS.screens = (function () {
  'use strict';

  var U = LS, D = LS.domain, ui = LS.ui;
  var filters = {};
  var filterDraft = null;

  function st() { return U.db(); }
  function me() { return st().session ? U.byId(st().users, 'user_id', st().session) : null; }
  function reqOf(i) { return U.byId(st().requests, 'request_id', i.request_id); }
  function wtOf(i) { return U.byId(st().workTypes, 'code', i.work_type_code); }
  function userName(id) { var u = U.byId(st().users, 'user_id', id); return u ? u.full_name : ''; }
  function itemRef(i) { return i.source_stt || i.item_id; }
  var focusBusy=false, globalPauseBusy=false;
  function canFocus(item) {
    var u=me();
    return !!(u && u.role==='CAN_BO_LS' && !st().global_pause && item.assigned_user_id===u.user_id && !item.syncing && !item.carried_to_item_id &&
      item.dossier_received_at && !item.completed_at && D.CLOCK_RUNNING.indexOf(item.status)!==-1);
  }
  function applyFocusUpdates(updates) {
    (updates || []).forEach(function(update) {
      var item=U.byId(st().items,'item_id',update.item_id);
      if(!item || Number(item.version)>Number(update.version))return;
      Object.keys(update).forEach(function(k){item[k]=update[k];});
      if(update.processing_sessions_json)item.processing_sessions=JSON.parse(update.processing_sessions_json);
      if(update.pause_log_json)item.pause_log=JSON.parse(update.pause_log_json);
      item.syncing=false;
    });
    personalTimeCache=null; timeReportCache=null;
  }
  function applyLinkedDateUpdates(updates) {
    (updates || []).forEach(function(update) {
      var item=U.byId(st().items,'item_id',update.item_id);
      if(!item || Number(item.version)>Number(update.version))return;
      item.occurrence_date=update.occurrence_date;
      item.version=update.version;
      item.updated_at=update.updated_at;
    });
    personalTimeCache=null; timeReportCache=null;
  }
  function localWorkFocus(target,ts) {
    visibleItems().filter(function(i){return i.item_id!==target.item_id && !i.carried_to_item_id && i.assigned_user_id===st().session && LSTiming.workState(i)==='ACTIVE';}).forEach(function(i) {
      i.processing_sessions=LSTiming.nextSessions(i,i.status,ts,i.assigned_user_id,'WAITING');
      D.applyClock(i,'DA_PHAN_CONG',ts);
      i.execution_state='WAITING';i.execution_changed_at=ts;i.updated_at=ts;i.version=Number(i.version)+1;
      logEvent(i.item_id,'CHO_LAM_TIEP','Chuyển sang làm '+itemRef(target));
    });
  }
  function startWork(itemId) {
    var item=U.byId(st().items,'item_id',itemId);
    if(focusBusy || st().global_pause || !item || !canFocus(item))return;
    if(!U.isGas()) {
      var ts=U.now();localWorkFocus(item,ts);
      item.processing_sessions=LSTiming.nextSessions(item,item.status,ts,item.assigned_user_id,'ACTIVE');
      D.applyClock(item,item.status,ts);
      item.processing_started_at=item.processing_started_at || ts;
      item.execution_state='ACTIVE';item.execution_changed_at=ts;item.updated_at=ts;item.version=Number(item.version)+1;
      logEvent(itemId,'BAT_DAU_LAM','Làm hồ sơ '+itemRef(item));U.save();ui.closeDialog();LS.app.render();return;
    }
    focusBusy=true;item.syncing=true;var expected=item.version;
    ui.closeDialog();LS.app.render();
    LS.app.background(LS.api.focusWorkItem(itemId,expected),{
      label:'Chuyển hồ sơ đang làm',
      onOk:function(result){focusBusy=false;item.syncing=false;applyFocusUpdates(result.focus_updates);LS.app.render();ui.toast('Đang làm '+itemRef(item),'ok');},
      rollback:function(){focusBusy=false;item.syncing=false;}
    }).finally(function(){focusBusy=false;item.syncing=false;LS.app.render();});
  }
  function focusBar() {
    var u=me();if(!u || u.role!=='CAN_BO_LS')return '';
    var own=visibleItems().filter(function(i){return i.assigned_user_id===u.user_id && !i.carried_to_item_id;});
    var active=own.filter(function(i){return LSTiming.workState(i)==='ACTIVE';});
    var waiting=own.filter(function(i){return LSTiming.workState(i)==='WAITING';}).sort(function(a,b){return new Date(b.execution_changed_at)-new Date(a.execution_changed_at);});
    // Một dải gọn: đang làm gì, hồ sơ chờ làm tiếp, và các nút thao tác nhanh.
    var operation=st().global_pause,info=[],actions='';
    if(operation)info.push('<span class="focus-item is-paused">Đang tạm dừng: <b>'+U.esc(globalPauseCategoryLabel(operation.category))+'</b> · từ '+U.esc(U.fmtDT(operation.started_at))+'</span>');
    if(active.length)info.push('<span class="focus-item is-active">Đang làm <b>'+U.esc(active.map(itemRef).join(', '))+'</b></span>');
    if(waiting.length){
      info.push('<span class="focus-item">'+waiting.length+' hồ sơ chờ làm tiếp · '+U.esc(itemLabel(waiting[0]))+'</span>');
      actions+=ui.btn(active.length?'Chuyển làm '+itemRef(waiting[0]):'Làm tiếp '+itemRef(waiting[0]),{act:'start-work',kind:'primary',sm:true,disabled:focusBusy || !!operation,data:' data-id="'+U.attr(waiting[0].item_id)+'"'});
    }
    actions+=ui.btn('Ghi việc khác',{act:'other-work',kind:'line',sm:true,icon:'plus'});
    actions+=operation?ui.btn('Kết thúc tạm dừng',{act:'global-pause-end',kind:'primary',sm:true,disabled:globalPauseBusy,data:' data-operation-id="'+U.attr(operation.operation_id)+'"'})
      :ui.btn('Tạm dừng toàn bộ',{act:'pause-all',kind:'danger-deep',sm:true,icon:'clock',disabled:globalPauseBusy});
    var body='<div class="focus-strip'+(operation?' is-paused':'')+'"><div class="focus-info">'+info.join('')+'</div><div class="focus-actions">'+actions+'</div></div>';
    return body;
  }

  var GLOBAL_PAUSE_LABELS={'QTTD_TSBĐ':'Hoàn thiện hồ sơ QTTD/TSBĐ','BAO_CAO':'Báo cáo','KHAC':'Khác'};
  function globalPauseCategoryLabel(category){return GLOBAL_PAUSE_LABELS[category] || 'Tác nghiệp khác';}
  function openGlobalPause(){
    if(globalPauseBusy || st().global_pause)return;
    ui.openDialog('Tạm dừng toàn bộ','<form data-form="global-pause">'+
      ui.field('Tạm dừng để làm',ui.select('category',Object.keys(GLOBAL_PAUSE_LABELS).map(function(k){return [k,GLOBAL_PAUSE_LABELS[k]];}),'',{blank:'Chọn công việc'}))+
      ui.formEnd('Bắt đầu tạm dừng')+'</form>');
  }
  function submitGlobalPause(form){
    if(globalPauseBusy || form.getAttribute('data-waiting'))return;
    var category=String(new FormData(form).get('category') || '');
    if(!GLOBAL_PAUSE_LABELS[category]){ui.toast('Chọn loại tác nghiệp.','err');return;}
    globalPauseBusy=true;form.setAttribute('data-waiting','1');ui.closeDialog();LS.app.render();
    var job;
    if(U.isGas())job=LS.api.startGlobalPause(category).then(function(result){
      applyFocusUpdates(result.focus_updates);st().global_pause=result.operation;return LS.app.refreshServer('',true);
    });
    else {
      var ts=U.now(),active=visibleItems().filter(function(i){return i.assigned_user_id===me().user_id && LSTiming.workState(i)==='ACTIVE';})
        .sort(function(a,b){return new Date(b.execution_changed_at || 0)-new Date(a.execution_changed_at || 0);});
      active.forEach(function(i){
        i.processing_sessions=LSTiming.nextSessions(i,i.status,ts,me().user_id,'WAITING');i.execution_state='WAITING';
        i.execution_changed_at=ts;i.updated_at=ts;i.version=Number(i.version)+1;logEvent(i.item_id,'TAM_DUNG_TOAN_BO',globalPauseCategoryLabel(category));
      });
      st().global_pause={operation_id:'LOCAL_OP_'+Date.now(),category:category,started_at:ts,paused_item_id:active.length?active[0].item_id:''};
      U.save();job=Promise.resolve();
    }
    job.then(function(){timeReportCache=null;personalTimeCache=null;ui.toast('Đã tạm dừng và ghi nhận tác nghiệp.','ok');})
      .catch(function(e){ui.toast(e.message || 'Không tạm dừng được.','err');})
      .finally(function(){globalPauseBusy=false;LS.app.render();});
  }
  function endGlobalPause(operationId, works){
    works=works || [];
    var operation=st().global_pause;
    if(globalPauseBusy || !operation || (operationId && operation.operation_id!==operationId))return;
    ui.closeDialog();
    globalPauseBusy=true;LS.app.render();var job;
    if(U.isGas())job=LS.api.endGlobalPause(operation.operation_id,works).then(function(result){
      applyFocusUpdates(result.focus_updates);st().global_pause=null;return LS.app.refreshServer('',true);
    });
    else {
      var ts=U.now();st().other_operations=st().other_operations || [];
      st().other_operations.push({operation_id:operation.operation_id,user_id:me().user_id,category:operation.category,started_at:operation.started_at,ended_at:ts,closed:true});
      // Việc khác ghi trong lượt này cùng việc ghi lúc kết thúc: chia số phút làm việc của lượt tạm dừng cho chúng.
      var cal=D.processingCalendar(st()),hours=LSTiming.between(operation.started_at,ts,cal);
      var extra=LSTiming.overtime(Date.parse(operation.started_at),Date.parse(ts),cal).reduce(function(n,w){return n+(w[1]-w[0])/3600000;},0);
      var minutes=hours===null?0:Math.round((hours+extra)*60);
      var attached=(st().other_work || []).filter(function(w){return w.operation_id===operation.operation_id && !w.canceled_at;});
      var fresh=works.map(function(w,n){return {work_id:'OW_'+Date.now()+'_'+n,user_id:me().user_id,work_date:U.localDate(),category:w.category,
        quantity:w.quantity,minutes:0,operation_id:operation.operation_id,at:ts,canceled_at:''};});
      var all=attached.concat(fresh),split=D.splitPauseMinutes(minutes,all.map(function(w){return {category:w.category,quantity:w.quantity};}));
      all.forEach(function(w,n){w.minutes=split[n];});
      st().other_work=(st().other_work || []).concat(fresh);
      var item=U.byId(st().items,'item_id',operation.paused_item_id);
      if(item && item.assigned_user_id===me().user_id && LSTiming.workState(item)==='WAITING' && !item.completed_at){
        item.processing_sessions=LSTiming.nextSessions(item,item.status,ts,me().user_id,'ACTIVE');item.execution_state='ACTIVE';
        item.execution_changed_at=ts;item.updated_at=ts;item.version=Number(item.version)+1;logEvent(item.item_id,'TIEP_TUC_TOAN_BO','Tiếp tục hồ sơ sau tác nghiệp khác.');
      }
      st().global_pause=null;U.save();job=Promise.resolve();
    }
    job.then(function(){timeReportCache=null;personalTimeCache=null;ui.toast('Đã kết thúc tạm dừng.','ok');})
      .catch(function(e){ui.toast(e.message || 'Không kết thúc được lượt tạm dừng.','err');})
      .finally(function(){globalPauseBusy=false;LS.app.render();});
  }


  /* ============================ Ghi việc khác (kèm số lượng) ============================ */

  function otherWorkType(code) {
    return D.OTHER_WORK_TYPES.filter(function (t) { return t.code === code; })[0] || null;
  }

  /** Lượt việc khác chưa hủy của chính người đang xem, mới ghi lên đầu. */
  function myOtherWork(match) {
    var u = me();
    return (st().other_work || []).filter(function (w) {
      return u && w.user_id === u.user_id && !w.canceled_at && otherWorkType(w.category) && match(w);
    }).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
  }

  /** Bảng đủ các việc: mỗi dòng một việc, ô số lượng bên phải; để trống hoặc 0 là không làm việc đó. */
  function otherWorkFieldsHtml() {
    return '<div class="ow-list" role="group" aria-label="Việc khác">' + D.OTHER_WORK_TYPES.map(function (t) {
      return '<label class="ow-row"><span class="ow-name">' + U.esc(t.label) + '</span>' +
        ui.input('qty_' + t.code, '', { type: 'number', min: 0, max: D.OTHER_WORK_MAX_QUANTITY, placeholder: '0', attrs: ' step="1" inputmode="numeric"' }) +
        '<span class="ow-unit">' + U.esc(t.unit) + '</span></label>';
    }).join('') + '</div>';
  }

  function readOtherWorks(form) {
    var d = new FormData(form), works = [], bad = '';
    D.OTHER_WORK_TYPES.forEach(function (t) {
      var raw = String(d.get('qty_' + t.code) || '').trim();
      if (!raw) return;
      var n = Number(raw);
      if (!isFinite(n) || Math.floor(n) !== n || n < 0 || n > D.OTHER_WORK_MAX_QUANTITY) bad = bad || t.label;
      else if (n > 0) works.push({ category: t.code, quantity: n });
    });
    return { works: works, bad: bad };
  }

  function otherWorkListHtml(list, title) {
    if (!list.length) return '';
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle(title) +
      ui.table([{ label: 'Việc' }, { label: 'Số lượng', cls: 'num' }, { label: 'Thời gian', cls: 'num' }, { label: 'Lúc', cls: 'fit' }, { label: '', cls: 'fit' }],
        list.map(function (w) {
          var type = otherWorkType(w.category);
          return { cells: [U.esc(type.label), '<span class="tid">' + w.quantity + ' ' + U.esc(type.unit) + '</span>',
            '<span class="tid">' + (w.minutes ? U.esc(D.durationLabel(w.minutes / 60)) : '') + '</span>',
            '<span class="t2">' + U.esc(U.fmtTime(w.at)) + '</span>',
            w.syncing ? '' : ui.iconBtn('trash', { act: 'other-work-cancel', label: 'Hủy lượt ' + type.label, data: ' data-id="' + U.attr(w.work_id) + '"' })] };
        })) + '</div>';
  }

  function openOtherWork() {
    var u = me(), today = U.localDate();
    if (!u || u.role !== 'CAN_BO_LS') return;
    ui.openDialog('Ghi việc khác',
      '<form data-form="other-work">' + otherWorkFieldsHtml() +
      otherWorkListHtml(myOtherWork(function (w) { return w.work_date === today; }), 'Đã ghi hôm nay') +
      ui.formEnd('Ghi nhận') + '</form>', { size: 'md' });
  }

  function submitOtherWork(form) {
    var u = me();
    if (!u || u.role !== 'CAN_BO_LS' || form.getAttribute('data-waiting')) return;
    var read = readOtherWorks(form);
    if (read.bad) { ui.toast('Số lượng "' + read.bad + '" phải là số nguyên từ 0 đến ' + D.OTHER_WORK_MAX_QUANTITY + '.', 'err'); return; }
    if (!read.works.length) { ui.toast('Nhập số lượng cho ít nhất một việc.', 'err'); return; }
    // Đang tạm dừng toàn bộ thì lượt ghi thuộc lượt tạm dừng đó và được chia giờ khi kết thúc.
    var operationId = st().global_pause ? st().global_pause.operation_id : '', stamp = Date.now();
    var entries = read.works.map(function (w, n) {
      return { work_id: 'LOCAL_OW_' + stamp + '_' + n, user_id: u.user_id, work_date: U.localDate(), category: w.category, quantity: w.quantity,
        minutes: 0, operation_id: operationId, at: U.now(), syncing: true };
    });
    st().other_work = (st().other_work || []).concat(entries);
    form.setAttribute('data-waiting', '1');
    ui.closeDialog(); LS.app.render();
    ui.toast('Đã ghi ' + entries.length + ' việc khác.', 'ok');
    if (!U.isGas()) { entries.forEach(function (e, n) { e.syncing = false; e.work_id = 'OW_' + stamp + '_' + n; }); U.save(); return; }
    LS.app.background(LS.api.recordOtherWork(read.works), {
      label: 'Ghi việc khác',
      onOk: function (result) {
        entries.forEach(function (e, n) {
          var saved = result && result.works && result.works[n];
          if (saved) { e.work_id = saved.work_id; e.operation_id = saved.operation_id || ''; }
          if (result && result.work_date) e.work_date = result.work_date;
          e.syncing = false;
        });
      },
      rollback: function () { st().other_work = (st().other_work || []).filter(function (w) { return entries.indexOf(w) === -1; }); }
    });
  }

  /** Kết thúc Tạm dừng toàn bộ: ghi luôn việc đã làm, số phút đã dừng được chia cho các việc đó (họp 15 phút/lần, còn lại chia đều). */
  function openEndGlobalPause(operationId) {
    var operation = st().global_pause;
    if (globalPauseBusy || !operation || (operationId && operation.operation_id !== operationId)) return;
    ui.openDialog('Kết thúc tạm dừng',
      '<form data-form="end-pause" data-operation-id="' + U.attr(operation.operation_id) + '">' + otherWorkFieldsHtml() +
      otherWorkListHtml(myOtherWork(function (w) { return w.operation_id === operation.operation_id; }), 'Đã ghi trong lượt tạm dừng này') +
      ui.formEnd('Kết thúc tạm dừng') + '</form>', { size: 'md', sub: globalPauseCategoryLabel(operation.category) });
  }

  function submitEndGlobalPause(form) {
    if (form.getAttribute('data-waiting')) return;
    var read = readOtherWorks(form);
    if (read.bad) { ui.toast('Số lượng "' + read.bad + '" phải là số nguyên từ 0 đến ' + D.OTHER_WORK_MAX_QUANTITY + '.', 'err'); return; }
    form.setAttribute('data-waiting', '1');
    endGlobalPause(form.getAttribute('data-operation-id'), read.works);
  }

  function cancelOtherWork(workId) {
    var w = (st().other_work || []).filter(function (x) { return x.work_id === workId; })[0], u = me();
    if (!w || w.syncing || !u || u.role !== 'CAN_BO_LS') return;
    if (w.user_id !== u.user_id || w.work_date !== U.localDate()) { ui.toast('Chỉ hủy được lượt do bạn ghi trong ngày hôm nay.', 'err'); return; }
    w.canceled_at = U.now();
    ui.closeDialog(); LS.app.render();
    ui.toast('Đã hủy lượt ghi.', 'ok');
    if (!U.isGas()) { U.save(); return; }
    LS.app.background(LS.api.cancelOtherWork(workId), { label: 'Hủy lượt việc khác', rollback: function () { w.canceled_at = ''; } });
  }

  function processingClock(item, now) {
    return '<span class="tid" data-processing-clock="'+U.attr(item.item_id)+'">'+U.esc(D.processingLabel(item,st(),now))+'</span>';
  }

  function receiptClock(item, now) {
    return '<span class="tid" data-receipt-clock="'+U.attr(item.item_id)+'">'+U.esc(D.receiptDurationLabel(item,st(),now))+'</span>';
  }

  /** Refresh clock text only, preserving open forms and making no GAS calls. */
  function refreshClocks(now) {
    if (!me()) return;
    now = now || new Date();
    ['processing','receipt'].forEach(function(kind) {
      document.querySelectorAll('[data-'+kind+'-clock]').forEach(function(node) {
        var item = U.byId(st().items,'item_id',node.getAttribute('data-'+kind+'-clock'));
        if (!item) return;
        // Chỉ tính lại khi đồng hồ còn chạy: hồ sơ đã đóng, hay chưa/không ở trạng thái "đang làm", có số đứng yên.
        // Danh sách dài trước đây tính lại mọi dòng mỗi giây, điện thoại giật theo nhịp đồng hồ.
        if (item.completed_at || !(D.STATUS[item.status] && D.STATUS[item.status].open)) return;
        if (kind === 'processing' && LSTiming.workState(item) !== 'ACTIVE') return;
        var value = kind==='processing' ? D.processingLabel(item,st(),now) : D.receiptDurationLabel(item,st(),now);
        if (node.textContent !== value) node.textContent=value;
      });
    });
  }

  /** Nhãn đọc được cho một việc: mã, khách hàng, loại việc. */
  function itemLabel(i) {
    var r = reqOf(i);
    return itemRef(i) + ' · ' + (r ? r.customer.name : '') + ' · ' + wtName(i.work_type_code);
  }
  function unitName(id) { var u = U.byId(st().units, 'unit_id', id); return u ? u.name : id; }
  /* Quản trị không nhận tên sản phẩm của khách; nói rõ là đã ẩn thay vì để ô trống. */
  function productLabel(i) {
    if (i.product_name) return i.product_name;
    var u = me();
    return u && u.role === 'ADMIN' ? 'Ẩn với quản trị' : '—';
  }
  function wtName(c) { var w = U.byId(st().workTypes, 'code', c); return w ? w.name : c; }
  function wtGroup(c) { var w = U.byId(st().workTypes, 'code', c); return w ? (w.group || w.name) : c; }
  function wtLabel(w) { return w ? ((w.group ? w.group + ' · ' : '') + w.name) : ''; }

  /** Chỉ còn VIP và Xử lý gấp; cờ "Quan trọng" cũ hiểu là VIP (khớp normalizePriorityFlags_ ở Code.gs). */
  function priorityFlags(customer) {
    var out = [];
    ((customer && customer.priority_flags) || []).forEach(function (x) {
      var v = x === 'QUAN_TRONG' ? 'VIP' : x;
      if ((v === 'VIP' || v === 'XU_LY_GAP') && out.indexOf(v) === -1) out.push(v);
    });
    return out.sort(function (a, b) { return a === 'XU_LY_GAP' ? -1 : b === 'XU_LY_GAP' ? 1 : 0; });
  }

  /**
   * Thứ tự ưu tiên trên mọi danh sách hồ sơ: Gấp → VIP → Ưu tiên LS (Kiểm soát đánh dấu) → còn lại.
   * Nhóm ưu tiên luôn nằm trên; trong mỗi nhóm vẫn theo kiểu sắp xếp người dùng đang chọn.
   */
  function priorityRank(item) {
    var r = reqOf(item), flags = priorityFlags(r && r.customer);
    if (flags.indexOf('XU_LY_GAP') !== -1) return 0;
    if (flags.indexOf('VIP') !== -1) return 1;
    return item && item.is_priority ? 2 : 3;
  }

  function priorityTags(customer) {
    // Cờ VIP và Gấp dùng chip chữ đậm, nền nhạt và màu riêng để dễ nhận ra cạnh tên khách hàng.
    // Nhãn viết tắt (cột 3) chỉ hiện trên thẻ mobile để tên khách và cờ ưu tiên gọn một dòng.
    var labels = { VIP: ['VIP', 'vip', 'VIP'], XU_LY_GAP: ['Xử lý gấp', 'urgent', 'Gấp'] };
    return priorityFlags(customer).map(function (x) {
      var l = labels[x];
      if (!l) return '';
      return '<span class="priority-flag priority-flag-' + l[1] + '" title="' + U.attr(l[0]) + '"><span class="tag-full">' + U.esc(l[0]) +
        '</span><span class="tag-short" aria-hidden="true">' + U.esc(l[2]) + '</span></span>';
    }).join(' ');
  }

  /** Nhãn "Ưu tiên LS" (cờ Kiểm soát đánh dấu): chữ đậm màu riêng, cùng phong cách cờ ưu tiên khách hàng. */
  function priorityLsTag() {
    return '<span class="priority-flag priority-flag-ls">Ưu tiên LS</span>';
  }

  function priorityRowClass(item) {
    var r = reqOf(item), flags = priorityFlags(r && r.customer), out = [];
    // Khi có nhiều cờ, nền dòng theo mức cần xử lý cao nhất; các nhãn vẫn hiện đủ.
    if (flags.indexOf('XU_LY_GAP') !== -1) out.push('priority-urgent');
    else if (flags.indexOf('VIP') !== -1) out.push('priority-vip');
    return out.join(' ');
  }

  function contactCell(r) {
    if (!r || !r.customer) return ui.tag('Chưa có liên hệ', 'neutral');
    var c = r.customer, links = [];
    if (c.phone) links.push('<a class="contact-link" href="tel:' + U.attr(c.phone) + '"><span class="contact-label">SĐT</span>' + U.esc(c.phone) + '</a>');
    if (c.email) links.push('<a class="contact-link" href="mailto:' + U.attr(c.email) + '"><span class="contact-label">Email</span>' + U.esc(c.email) + '</a>');
    return links.length ? '<div class="contact-stack">' + links.join('') + '</div>' : ui.tag('Chưa có liên hệ', 'neutral');
  }

  /* ============================ Phạm vi dữ liệu ============================ */

  function visibleItems() {
    var u = me();
    if (!u) return [];
    if (u.role === 'GIAM_SAT') return [];
    if (u.role === 'PHONG_PGD') {
      return st().items.filter(function (i) { var r = reqOf(i); return r && r.unit_id === u.unit_id; });
    }
    if (u.role === 'CAN_BO_LS') {
      return st().items.filter(function (i) { return i.assigned_user_id === u.user_id; });
    }
    return st().items.slice();
  }

  /** Danh sách đề nghị riêng của cán bộ Phòng/PGD; Toàn bộ phòng vẫn dùng visibleItems(). */
  function requestedByMe(item) {
    var u = me(), r = reqOf(item);
    if (!u || u.role !== 'PHONG_PGD') return true;
    var requesterId = r && (r.requestor_id || (r.requestor && r.requestor.id) || r.created_by);
    return String(requesterId || '') === String(u.user_id);
  }

  function visibleEvents() {
    var u = me();
    if (u && u.role === 'CAN_BO_LS') {
      return st().events.filter(function (e) { return e.by === u.user_id; });
    }
    var ids = {};
    visibleItems().forEach(function (i) { ids[i.item_id] = true; });
    return st().events.filter(function (e) { return ids[e.item_id]; });
  }

  function staffList(includeUnavailable) {
    return st().users.filter(function (u) {
      return D.userAvailable(u) || (includeUnavailable && u.role === 'CAN_BO_LS' && u.active);
    });
  }

  /**
   * Kỳ xem của Kết quả & kế hoạch: ngày, tuần hoặc tháng chứa ngày đang chọn. Kế hoạch kỳ nhân theo ngày làm việc
   * đã qua; tháng cũ hơn kỳ đang vận hành xem ở Báo cáo (máy chủ chỉ gửi kỳ hiện hành về máy).
   */
  var BOARD_PERIODS = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']];
  function reportRange() {
    var anchor = f('board', 'anchor', U.localDate()), period = f('board', 'period', 'day');
    if (period !== 'week' && period !== 'month') return dayRange(anchor);
    var d = new Date(anchor + 'T00:00:00');
    if (!isFinite(d.getTime())) d = new Date(U.localDate() + 'T00:00:00');
    var start, end;
    if (period === 'month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1); end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    } else {
      var first = st().settings && st().settings.week_start === 'SUNDAY' ? 0 : 1;
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() - first + 7) % 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    }
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    return { period: period, from: start.getTime(), to: end.getTime(), fromDate: U.localDate(start), toDate: U.localDate(end) };
  }

  /** Khoảng một ngày (YYYY-MM-DD) theo giờ địa phương; ngày sai hoặc trống thì lấy hôm nay. */
  function dayRange(day) {
    var d = new Date((day || U.localDate()) + 'T00:00:00');
    if (!isFinite(d.getTime())) d = new Date(U.localDate() + 'T00:00:00');
    var start = new Date(d.getTime()), end = new Date(d.getTime());
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    return { period: 'day', from: start.getTime(), to: end.getTime(), fromDate: U.localDate(start), toDate: U.localDate(end) };
  }

  function inRange(value, range) {
    if (!value) return false;
    var t = new Date(value).getTime();
    return t >= range.from && t <= range.to;
  }

  function elapsedHours(from, to) {
    if (!from || !to) return null;
    var a = new Date(from).getTime(), b = new Date(to).getTime();
    return isFinite(a) && isFinite(b) && b >= a ? (b - a) / 3600000 : null;
  }

  /**
   * Giờ làm việc giữa hai mốc (bỏ đêm, nghỉ trưa, cuối tuần, ngày lễ). Trước đây
   * bảng kết quả dùng giờ đồng hồ: hồ sơ nhận chiều thứ Sáu, xong sáng thứ Hai bị
   * tính ~64 giờ thay vì vài giờ làm.
   */
  function workHours(from, to) {
    if (!from || !to) return null;
    return U.workingHours(from, to, D.processingCalendar(st()));
  }

  function mean(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; }

  /** Việc trong phạm vi Tổng hợp: quyền xem của vai trò, rồi bộ lọc cán bộ / đơn vị. */
  function boardItems() {
    var staff = f('board', 'staff', ''), unit = f('board', 'unit', '');
    return visibleItems().filter(function (i) {
      if (staff && i.assigned_user_id !== staff) return false;
      if (unit) { var r = reqOf(i); if (!r || r.unit_id !== unit) return false; }
      return true;
    });
  }

  function boardStaff() {
    var staff = f('board', 'staff', '');
    return staffList(true).filter(function (u) { return !staff || u.user_id === staff; });
  }

  function sendingUnits() {
    return st().units.filter(function (x) { return x.kind === 'DON_VI_GUI' || x.kind === 'PGD'; });
  }

  function queueVisibleUnits() {
    return sendingUnits().filter(function (x) {
      var codes = [x.unit_id, x.name, x.source_tab].map(function (value) { return String(value || '').trim().toUpperCase(); });
      var active = x.is_active === undefined ? x.active : x.is_active;
      return codes.indexOf('GBS') === -1 && codes.indexOf('GDT') === -1 && active !== false &&
        String(active).toLowerCase() !== 'false' && String(active) !== '0';
    });
  }

  function isQueueUnitVisible(unitId) {
    return queueVisibleUnits().some(function (x) { return x.unit_id === unitId; });
  }

  /** Chỉ tiêu hoàn thành/tháng do quản trị đặt; 0 = chưa đặt. */
  function target(key) { var n = Number(st().settings[key]); return isFinite(n) && n > 0 ? n : 0; }

  /** Báo cáo xuyên kỳ: giao, hoàn thành, tồn, quá hạn và thời gian xử lý từng cán bộ. */
  function performanceReport(range) {
    var all = boardItems(), events = visibleEvents();
    var workload = D.staffWorkloadByGroup(all, st(), range.fromDate, range.toDate);
    var rows = boardStaff().map(function (u) {
      var mine = all.filter(function (i) { return i.assigned_user_id === u.user_id; });
      var assigned = mine.filter(function (i) { return inRange(i.assigned_at || i.accepted_at || i.submitted_at, range); });
      // Mốc chuẩn của nghiệp vụ là lúc LS xác nhận đã nhận đủ hồ sơ.
      var received = mine.filter(function (i) { return inRange(i.dossier_received_at, range); });
      var done = mine.filter(function (i) { return i.status === 'HOAN_THANH_LS' && inRange(i.completed_at, range); });
      var open = mine.filter(function (i) { return D.STATUS[i.status].open; });
      var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
      // Xử lý = đồng hồ khách hàng (từ Bắt đầu xử lý, đã trừ tạm dừng/chờ ký).
      // 0 phút là chưa đo được (phiên ngoài lịch chưa khép trong ngày), không đưa vào trung bình.
      var hours = done.map(function (i) { return D.processingHours(i, st()); }).filter(function (x) { return x > 0; });
      var receiveHours = received.map(function (i) { return LSTiming.metrics(i,D.processingCalendar(st())).tiep_nhan; }).filter(function (x) { return x !== null; });
      var totalHours = done.map(function (i) { return LSTiming.metrics(i,D.processingCalendar(st())).toan_trinh; }).filter(function (x) { return x !== null; });
      var timedDone = done.filter(function (i) { return i.due_at && !D.slaExempt(i, st()); });
      var onTime = timedDone.filter(function (i) { return new Date(i.completed_at) <= new Date(i.due_at); }).length;
      var touched = {};
      events.forEach(function (e) { if (e.by === u.user_id && inRange(e.at, range)) touched[e.item_id] = true; });
      var workloadRow = workload.rows.filter(function (x) { return x.user.user_id === u.user_id; })[0] || { byGroup: {}, total: 0 };
      return { user: u, assigned: assigned.length, done: done.length, open: open.length, late: late.length,
        touched: Object.keys(touched).length, avgHours: mean(hours), avgReceiveHours: mean(receiveHours), avgTotalHours: mean(totalHours),
        _receive: receiveHours, _total: totalHours,
        maxHours: hours.length ? Math.max.apply(null, hours) : null, onTime: timedDone.length ? Math.round(onTime * 100 / timedDone.length) : null,
        byGroup: workloadRow.byGroup, workloadTotal: workloadRow.total };
    });
    return { range: range, rows: rows,
      assigned: rows.reduce(function (n, x) { return n + x.assigned; }, 0), done: rows.reduce(function (n, x) { return n + x.done; }, 0),
      open: rows.reduce(function (n, x) { return n + x.open; }, 0), late: rows.reduce(function (n, x) { return n + x.late; }, 0),
      // Trung bình gộp trên từng hồ sơ; trung bình của các trung bình cán bộ lệch
      // về phía người làm ít hồ sơ.
      avgReceiveHours: mean([].concat.apply([], rows.map(function (x) { return x._receive; }))),
      avgTotalHours: mean([].concat.apply([], rows.map(function (x) { return x._total; }))),
      workload: workload };
  }

  /** Số ngày làm việc theo lịch đã cấu hình (tính ngày nghỉ), tối thiểu 1: nhân kế hoạch ngày ra kế hoạch kỳ. */
  function workDaysIn(range) {
    var n = 0, d = new Date(range.from), cal = D.processingCalendar(st());
    d.setHours(12, 0, 0, 0);
    while (d.getTime() <= range.to && n < 400) {
      var w = d.getDay();
      if (cal.days.indexOf(w) !== -1 && cal.holidays.indexOf(U.localDate(d)) === -1) n += 1;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, n);
  }

  function shortDay(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? Number(p[2]) + '-thg ' + Number(p[1]) : String(iso);
  }

  function pctText(value) {
    return value === null ? '' : (Math.round(value * 100) / 100).toFixed(2).replace('.', ',') + '%';
  }

  /**
   * Bảng kết quả ngày theo mẫu của phòng: hoạt động x cán bộ, tổng, kế hoạch ngày và
   * % hoàn thành. Việc hoàn thành được đếm theo ngày hoàn thành; dòng "Hồ sơ tồn" là
   * số hồ sơ vay còn mở tại thời điểm xem.
   */
  /**
   * Bảng kết quả theo ngày. `opts.only` là mã một cán bộ: bảng chỉ có cột của người đó (dashboard cá nhân),
   * không theo bộ lọc đơn vị/cán bộ của điều hành và không có cột kế hoạch.
   */
  function dailyMatrix(range, opts) {
    var only = opts && opts.only || '';
    var users = only ? [U.byId(st().users, 'user_id', only)].filter(Boolean) : boardStaff();
    var unit = only ? '' : f('board', 'unit', ''), staff = only || f('board', 'staff', '');
    var linkedMortgageParents = {};
    st().items.forEach(function (i) {
      var wt = U.byId(st().workTypes, 'code', i.work_type_code);
      if (i.parent_item_id && D.collateralStepKeys(i, wt).indexOf('HD_THE_CHAP') !== -1) linkedMortgageParents[i.parent_item_id] = true;
    });
    var contributions = [];
    function contribute(key, userId, quantity) {
      if (!userId || (staff && staff !== userId)) return;
      contributions.push({ key: key, user_id: userId, quantity: quantity });
    }
    visibleItems().filter(function (i) {
      var r = reqOf(i);
      return !i.carried_to_item_id && (!unit || (r && r.unit_id === unit));
    }).forEach(function (i) {
      var wt = U.byId(st().workTypes, 'code', i.work_type_code);
      var mortgageOnChild = D.dailyIsCredit(i, wt) && linkedMortgageParents[i.item_id];
      if (i.status !== 'HUY') D.creditedParts(i, wt).forEach(function (p) {
        if (inRange(p.at, range) && !(mortgageOnChild && p.key === 'HD_THE_CHAP')) contribute(p.key, p.user_id, p.quantity);
      });
      if (i.status === 'HOAN_THANH_LS' && inRange(i.completed_at, range)) {
        D.dailyActivityKeys(i, wt).forEach(function (key) {
          if (!(mortgageOnChild && key === 'HD_THE_CHAP')) contribute(key, i.assigned_user_id);
        });
      } else {
        // Tồn theo ngày đang xem: việc Phòng/PGD đã dời sang ngày sau ngày xem thì chưa tính vào tồn ngày đó,
        // nó nằm ở ngày phát sinh mới. Không có ngày phát sinh thì vẫn tính. Cùng hàm với thẻ HĐTD/HĐTC của Việc tồn.
        // Kỳ đang chạy tính tồn đến hôm nay; ngày/kỳ đã qua hoặc ngày sắp tới tính đến cuối kỳ xem.
        D.draftBacklogAt(i, wt, range.fromDate <= U.localDate() && range.toDate > U.localDate() ? U.localDate() : range.toDate).forEach(function (key) {
          if (!(mortgageOnChild && key === 'TON_THE_CHAP')) contribute(key, i.assigned_user_id);
        });
      }
    });
    (st().activity_credits || []).forEach(function (item) {
      var wt=U.byId(st().workTypes,'code',item.work_type_code);
      D.creditedParts(item,wt).forEach(function(part){
        if(inRange(part.at,range))contribute(part.key,part.user_id,part.quantity);
      });
    });
    // Việc khác cán bộ tự ghi kèm số lượng: cộng vào Khác của chính người đó. Không gắn đơn vị gửi nên bỏ qua khi lọc theo đơn vị.
    var otherWork = unit ? [] : (st().other_work || []).filter(function (w) {
      return w && !w.canceled_at && D.OTHER_WORK_TYPES.some(function (t) { return t.code === w.category; }) &&
        (!staff || staff === w.user_id) && inRange(w.work_date + 'T12:00:00', range);
    });
    otherWork.forEach(function (w) { contributions.push({ key: 'KHAC', user_id: w.user_id, quantity: w.quantity }); });
    // Kết quả lịch sử vẫn thuộc cán bộ đã làm, kể cả khi tài khoản đã ngừng hoạt động hoặc đổi vai trò.
    var knownUsers = {};
    users.forEach(function (u) { knownUsers[u.user_id] = true; });
    contributions.forEach(function (p) {
      if (knownUsers[p.user_id]) return;
      users.push(U.byId(st().users, 'user_id', p.user_id) || { user_id: p.user_id, full_name: p.user_id });
      knownUsers[p.user_id] = true;
    });
    var plan = D.dailyPlan(st().settings);
    var days = workDaysIn({ from: range.from, to: Math.min(range.to, Date.now()) < range.from ? range.to : Math.min(range.to, Date.now()) });
    var index = {};
    users.forEach(function (u, i) { index[u.user_id] = i; });
    var rows = D.DAILY_ROWS.map(function (def) {
      return { def: def, key: def.key, cells: users.map(function () { return 0; }), total: 0 };
    });
    var byKey = {};
    rows.forEach(function (r) { byKey[r.key] = r; });
    function add(key, col, quantity) {
      if (!byKey[key]) return;
      var amount = Math.max(1, Math.floor(Number(quantity) || 1));
      byKey[key].cells[col] += amount;
      byKey[key].total += amount;
    }

    contributions.forEach(function (p) { add(p.key, index[p.user_id], p.quantity); });
    rows.forEach(function (r) {
      var perDay = Number(plan[r.key]) || 0;
      r.plan = r.def.header ? null : (/^TON_/.test(r.key) ? perDay : perDay * days);
      r.pct = r.plan ? r.total * 100 / r.plan : null;
    });
    var personalPlans = typeof LSPlanning !== 'undefined' && (st().staffPlans || []).some(function (q) { return q.start <= range.toDate && q.end >= range.fromDate; });
    if (personalPlans) {
      rows.forEach(function (r) {
        r.staffPlans = users.map(function (u) { return LSPlanning.target(st().staffPlans, u.user_id, r.key,
          { start: range.fromDate, end: range.toDate }, st().calendar, u).value; });
        var assigned = r.staffPlans.filter(function (n) { return n !== null; });
        r.plan = r.def.header || !assigned.length ? null : assigned.reduce(function (a, b) { return a + b; }, 0);
        r.pct = /^TON_/.test(r.key) || !r.plan ? null : r.total * 100 / r.plan;
      });
    }
    // Dòng Khác gộp hồ sơ loại khác và việc khác; chi tiết từng loại chỉ hiện khi bung dòng Khác.
    var khacOpen = f('board', 'khac', '') === '1';
    if (khacOpen) {
      var khac = byKey.KHAC, details = [];
      var perType = {};
      D.OTHER_WORK_TYPES.forEach(function (t) {
        perType[t.code] = { def: { key: 'KHAC_' + t.code, label: t.label, unit: t.unit, sub: true, child: true }, key: 'KHAC_' + t.code,
          cells: users.map(function () { return 0; }), total: 0, plan: null, pct: null };
      });
      otherWork.forEach(function (w) {
        var row = perType[w.category], col = index[w.user_id];
        if (!row || col === undefined) return;
        row.cells[col] += w.quantity; row.total += w.quantity;
      });
      var dossiers = { def: { key: 'KHAC_HOSO', label: 'Hồ sơ loại khác', unit: 'hồ sơ', sub: true, child: true }, key: 'KHAC_HOSO',
        cells: khac.cells.slice(), total: khac.total, plan: null, pct: null };
      D.OTHER_WORK_TYPES.forEach(function (t) {
        perType[t.code].cells.forEach(function (n, c) { dossiers.cells[c] -= n; });
        dossiers.total -= perType[t.code].total;
        details.push(perType[t.code]);
      });
      rows.push(dossiers);
      details.forEach(function (r) { rows.push(r); });
    }
    return {
      users: users, labels: D.dailyStaffLabels(users), rows: rows, range: range, showPlan: !only && !(personalPlans && unit) && f('board', 'plan', '') === '1', khacOpen: khacOpen,
      dateLabel: range.fromDate === range.toDate ? shortDay(range.fromDate) : shortDay(range.fromDate) + ' → ' + shortDay(range.toDate)
    };
  }

  function dailyMatrixHtml(m) {
    var n = m.users.length, periodLabel = { week: 'TUẦN', month: 'THÁNG' }[m.range && m.range.period] || 'NGÀY';
    var head = '<tr><th class="dm-ngay">' + periodLabel + '</th><th class="dm-blank"></th><th class="dm-ls" colspan="' + (n + 1) + '" rowspan="2">LS</th>' + (m.showPlan ? '<th class="dm-blank" colspan="2"></th>' : '') + '</tr>' +
      '<tr><th class="dm-date">' + U.esc(m.dateLabel) + '</th><th class="dm-blank"></th>' + (m.showPlan ? '<th class="dm-blank" colspan="2"></th>' : '') + '</tr>' +
      '<tr><th class="dm-act">Hoạt động/Chỉ tiêu</th><th class="dm-unit">Đơn vị</th>' +
      m.labels.map(function (l) { return '<th class="dm-staff">' + U.esc(l) + '</th>'; }).join('') +
      '<th class="dm-total-h">TỔNG</th>' + (m.showPlan ? '<th class="dm-plan-h">KẾ HOẠCH ' + periodLabel + '</th><th class="dm-plan-h">% HOÀN THÀNH</th>' : '') + '</tr>';
    var body = m.rows.map(function (r) {
      var label = r.def.sub ? '<i>' + U.esc(r.def.label) + '</i>' : U.esc(r.def.label);
      // Mũi tên ở chữ Khác bung/thu gọn chi tiết việc khác; chi tiết mặc định ẩn.
      if (r.key === 'KHAC') label = '<button type="button" class="dm-toggle' + (m.khacOpen ? ' is-open' : '') + '" data-act="board-khac" aria-expanded="' + (m.khacOpen ? 'true' : 'false') +
        '" aria-label="' + (m.khacOpen ? 'Thu gọn' : 'Xem chi tiết') + ' dòng Khác"><span aria-hidden="true"></span></button>' + label;
      var cells = r.def.header ? m.users.map(function () { return '<td></td>'; }).join('') : r.cells.map(function (c, col) {
        var goal = m.showPlan && r.staffPlans ? r.staffPlans[col] : null;
        return '<td class="num">' + (c || '') + (goal !== null ? '<small class="dm-person-plan">KH ' +
          (Math.round(goal * 100) / 100) + (goal > 0 && !/^TON_/.test(r.key) ? ' · ' + Math.round(c * 100 / goal) + '%' : '') + '</small>' : '') + '</td>';
      }).join('');
      return '<tr' + (r.def.child ? ' class="dm-child"' : '') + '><td class="dm-act">' + label + '</td><td class="dm-unit">' + (r.def.sub ? '<i>' + U.esc(r.def.unit) + '</i>' : U.esc(r.def.unit)) + '</td>' + cells +
        '<td class="num dm-total">' + (r.def.header ? '-' : (r.total || '-')) + '</td>' +
        (m.showPlan ? '<td class="num">' + (r.plan === null ? '' : r.plan) + '</td><td class="num">' + pctText(r.pct) + '</td>' : '') + '</tr>';
    }).join('');
    return '<div class="daily-matrix-wrap"><table class="daily-matrix"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + dailyMatrixCards(m);
  }

  /**
   * Cùng số liệu bảng ngày nhưng dạng thẻ cho điện thoại: mỗi hoạt động một dòng, số tổng nổi bật bên phải,
   * kế hoạch / % ngay dưới, số từng cán bộ là các chip (chỉ người có số). Bảng gốc vẫn dùng cho máy tính, ảnh và Excel.
   */
  function dailyMatrixCards(m) {
    var multi = m.users.length > 1;
    return '<div class="dm-cards" role="list" aria-label="Kết quả thực hiện ' + U.attr(m.dateLabel) + '">' +
      '<div class="dm-cards-date">' + U.esc(m.dateLabel) + (multi ? ' · ' + m.users.length + ' cán bộ' : '') + '</div>' +
      m.rows.map(function (r) {
        if (r.def.header) return '<div class="dm-card-head" role="listitem">' + U.esc(String(r.def.label).replace(/:$/, '')) + '</div>';
        var toggle = r.key === 'KHAC' ? '<button type="button" class="dm-toggle' + (m.khacOpen ? ' is-open' : '') + '" data-act="board-khac" aria-expanded="' + (m.khacOpen ? 'true' : 'false') +
          '" aria-label="' + (m.khacOpen ? 'Thu gọn' : 'Xem chi tiết') + ' dòng Khác"><span aria-hidden="true"></span></button>' : '';
        var plan = m.showPlan && r.plan ? '<span class="dm-card-plan">KH ' + r.plan + ' · ' + U.esc(pctText(r.pct)) + '</span>' : '';
        var chips = multi && r.total ? '<div class="dm-card-staff">' + r.cells.map(function (c, idx) {
          return c ? '<span class="dm-chip"><span>' + U.esc(m.labels[idx]) + '</span><b>' + c + '</b></span>' : '';
        }).join('') + '</div>' : '';
        return '<div class="dm-card' + (r.def.sub ? ' dm-card-sub' : '') + (r.def.child ? ' dm-card-child' : '') + (r.total ? '' : ' is-zero') + '" role="listitem">' +
          '<div class="dm-card-main">' + toggle + '<span class="dm-card-label">' + U.esc(r.def.label) + '</span>' +
          '<span class="dm-card-num"><b>' + (r.total || 0) + '</b><span class="dm-card-unit">' + U.esc(r.def.unit) + '</span>' + plan + '</span></div>' +
          chips + '</div>';
      }).join('') + '</div>';
  }

  /** Cùng bố cục bảng ngày, dạng mảng dòng cho file Excel. */
  function dailyMatrixRows(m) {
    var periodLabel = { week: 'TUẦN', month: 'THÁNG' }[m.range && m.range.period] || 'NGÀY';
    var pad = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; };
    var n = m.users.length;
    var tail = m.showPlan ? ['TỔNG', 'KẾ HOẠCH ' + periodLabel, '% HOÀN THÀNH'] : ['TỔNG'];
    var out = [[periodLabel, ''].concat(['LS'], pad(n), pad(tail.length - 1)), [m.dateLabel, ''].concat(pad(n + tail.length)),
      ['Hoạt động/Chỉ tiêu', 'Đơn vị'].concat(m.labels, tail)];
    m.rows.forEach(function (r) {
      out.push([r.def.label, r.def.unit].concat(r.def.header ? pad(n) : r.cells.map(function (c) { return c || ''; }),
        m.showPlan ? [r.def.header ? '' : r.total, r.plan === null ? '' : r.plan, pctText(r.pct)] : [r.def.header ? '' : r.total]));
    });
    return out;
  }

  function reportLabel(range) {
    return range.fromDate === range.toDate ? U.fmtDate(range.fromDate) : U.fmtDate(range.fromDate) + ' → ' + U.fmtDate(range.toDate);
  }

  /** Kiểm soát / Quản lý LS: việc quá hạn xem ở Quản lý hồ sơ, phân bố trạng thái là các tab ở đó nên bỏ hai tab trùng. */
  function isLeader() {
    var u = me();
    return !!u && (u.role === 'KS_LS' || u.role === 'QUAN_LY_LS');
  }

  function boardTabKeys() {
    return isLeader() ? ['report', 'staff', 'type', 'unit'] : ['report', 'type', 'staff', 'unit', 'status', 'late'];
  }

  function dashboardTabs(active) {
    var all = {
      report: ['report', 'Kết quả thực hiện', 'chart'],
      type: ['type', 'Theo loại việc', 'activity'],
      staff: ['staff', 'Theo cán bộ', 'users'],
      unit: ['unit', 'Theo đơn vị gửi', 'building'],
      status: ['status', 'Phân bố trạng thái', 'activity'],
      late: ['late', 'Việc quá hạn', 'clock']
    };
    var tabs = boardTabKeys().map(function (k) { return all[k]; });
    return '<nav class="dashboard-tabs" aria-label="Các phần tổng hợp" role="tablist">' + tabs.map(function (x) {
      return '<button type="button" class="dashboard-tab' + (active === x[0] ? ' is-active' : '') + '" data-act="board-tab" data-tab="' + U.attr(x[0]) + '" role="tab" aria-selected="' + (active === x[0] ? 'true' : 'false') + '">' + U.icon(x[2], 15) + '<span>' + U.esc(x[1]) + '</span></button>';
    }).join('') + '</nav>';
  }

  /** Kế hoạch do Kiểm soát / Quản lý LS giao; Admin vẫn vào được để xử lý khi cần. */
  function canSetPlan() {
    var u = me();
    return !!(u && ['KS_LS', 'QUAN_LY_LS', 'ADMIN'].indexOf(u.role) !== -1);
  }

  function planDialog() {
    if (!canSetPlan()) { ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được giao kế hoạch.', 'err'); return; }
    if (LS.planUI) { LS.planUI.open(); return; }
    var s = st().settings, plan = D.dailyPlan(s);
    ui.openDialog('Giao kế hoạch',
      '<form data-form="work-plan">' +
      ui.sectionTitle('Kế hoạch ngày') +
      '<div class="f-row">' + D.DAILY_ROWS.filter(function (r) { return !r.header; }).map(function (r) {
        return ui.field((r.sub ? 'Tồn · ' : '') + r.label, ui.input('plan_' + r.key, plan[r.key] || '', { type: 'number', min: 0 }), r.unit);
      }).join('') + '</div>' +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Chỉ tiêu hoàn thành mỗi tháng') +
      '<div class="f-row">' +
      ui.field('Toàn LS', ui.input('target_done_month', s.target_done_month || '', { type: 'number', min: 0 }), 'việc / tháng') +
      ui.field('Mỗi cán bộ', ui.input('target_done_staff_month', s.target_done_staff_month || '', { type: 'number', min: 0 }), 'việc / tháng') +
      '</div></div>' +
      ui.formEnd('Lưu kế hoạch') + '</form>', { size: 'md' });
  }

  function submitPlan(form) {
    if (!canSetPlan() || form.getAttribute('data-waiting')) return;
    var d = new FormData(form), plan = {}, bad = '';
    D.DAILY_ROWS.forEach(function (r) {
      if (r.header || bad) return;
      var n = Number(d.get('plan_' + r.key) || 0);
      if (!isFinite(n) || n < 0 || Math.floor(n) !== n) bad = r.label; else if (n > 0) plan[r.key] = n;
    });
    var targets = {};
    ['target_done_month', 'target_done_staff_month'].forEach(function (k) {
      var n = Number(d.get(k) || 0);
      if (!isFinite(n) || n < 0 || Math.floor(n) !== n) bad = bad || 'Chỉ tiêu hoàn thành'; else targets[k] = n;
    });
    if (bad) { ui.toast('"' + bad + '" phải là số nguyên không âm.', 'err'); return; }

    function applied() {
      var s = st().settings;
      s.daily_plan_json = JSON.stringify(plan);
      s.target_done_month = targets.target_done_month;
      s.target_done_staff_month = targets.target_done_staff_month;
      // Bật cột Kế hoạch / % ngay để người giao thấy kế hoạch vừa đặt so với kết quả.
      setFilter('board', 'plan', '1');
      if (!U.isGas()) U.save();
      ui.closeDialog(); LS.app.render();
      ui.toast('Đã lưu kế hoạch.', 'ok');
    }
    if (!U.isGas()) { applied(); return; }
    // Màn hình đổi ngay, hộp thoại đóng; máy chủ nhận ở nền, bị từ chối thì hoàn tác và báo lý do.
    var oldSettings = { daily_plan_json: st().settings.daily_plan_json, target_done_month: st().settings.target_done_month,
      target_done_staff_month: st().settings.target_done_staff_month };
    applied();
    LS.app.background(LS.api.saveWorkPlan({ daily_plan: plan, target_done_month: targets.target_done_month, target_done_staff_month: targets.target_done_staff_month }), {
      label: 'Giao kế hoạch',
      rollback: function () { Object.keys(oldSettings).forEach(function (k) { st().settings[k] = oldSettings[k]; }); }
    });
  }

  function canManageStaffAbsence() {
    var u = me();
    return !!(u && ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1);
  }

  function staffAbsenceDialog() {
    if (!canManageStaffAbsence()) { ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được cấu hình nghỉ phép.', 'err'); return; }
    var staff = st().users.filter(function (u) { return u.role === 'CAN_BO_LS' && u.active; })
      .sort(function (a, b) { return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'); });
    // Người đang nghỉ hôm nay lên đầu, kèm số việc còn giữ để Kiểm soát bàn giao.
    staff.sort(function (a, b) { return (D.userAvailable(a) ? 1 : 0) - (D.userAvailable(b) ? 1 : 0); });
    var rows = staff.map(function (u) {
      var configured = String(u.availability_status || '').toUpperCase() === 'OFF' && (u.off_from || u.off_to);
      var dates = configured ? U.fmtDate(u.off_from) + ' → ' + U.fmtDate(u.off_to) : 'Chưa cài';
      var held = openHeldBy(u.user_id).length;
      return { cells: [
        '<div class="t1">' + U.esc(u.full_name) + '</div><div class="t2">' + U.esc(unitName(u.unit_id)) + '</div>',
        configured ? '<span class="tid">' + U.esc(dates) + '</span>' + (D.userAvailable(u) ? '' : ' ' + ui.tag('Đang nghỉ', 'warn')) : '<span class="t2">' + dates + '</span>',
        '<span class="tid">' + held + '</span>',
        '<button type="button" class="btn btn-line btn-sm" data-act="staff-absence-edit" data-id="' + U.attr(u.user_id) + '">Cài lịch</button> ' +
          '<button type="button" class="btn btn-line btn-sm" data-act="staff-handover" data-id="' + U.attr(u.user_id) + '"' + (held ? '' : ' disabled') + '>Bàn giao việc</button>'
      ] };
    });
    ui.openDialog('Nghỉ phép cán bộ LS',
      ui.table([{ label: 'Cán bộ LS' }, { label: 'Khoảng nghỉ' }, { label: 'Đang giữ', cls: 'num' }, { label: '' }], rows,
        { icon: 'users', title: 'Chưa có cán bộ LS đang hoạt động', text: '' }),
      { size: 'lg' });
  }

  /** Việc còn mở đang đứng tên một cán bộ LS (không tính bản đã chuyển kỳ). */
  function openHeldBy(userId) {
    return st().items.filter(function (i) {
      return i.assigned_user_id === userId && !i.carried_to_item_id && D.STATUS[i.status] && D.STATUS[i.status].open;
    });
  }

  /** Danh mục bàn giao của một cán bộ LS: Kiểm soát tick hồ sơ và chọn cán bộ nhận cho từng hồ sơ hoặc cả lô. */
  function staffHandoverDialog(userId) {
    if (!canManageStaffAbsence()) { ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được bàn giao việc.', 'err'); return; }
    var from = U.byId(st().users, 'user_id', userId);
    if (!from || from.role !== 'CAN_BO_LS') { ui.toast('Không tìm thấy cán bộ LS.', 'err'); return; }
    var held = openHeldBy(userId).sort(function (a, b) { return String(a.occurrence_date || '').localeCompare(String(b.occurrence_date || '')); });
    var receivers = staffList().filter(function (x) { return x.user_id !== userId; });
    if (!held.length) { ui.toast(from.full_name + ' không còn việc đang mở.', 'warn'); return; }
    if (!receivers.length) { ui.toast('Chưa có cán bộ LS nào đang làm việc để nhận bàn giao.', 'err'); return; }
    var options = receivers.map(function (x) { return [x.user_id, x.full_name + ' (' + staffLoad(x.user_id).open + ' đang mở)']; });
    var rows = held.map(function (i) {
      var r = reqOf(i);
      return { cells: [
        '<input type="checkbox" class="pick-box" name="pick" value="' + U.attr(i.item_id) + '" checked aria-label="Chọn ' + U.attr(itemRef(i)) + '">',
        '<span class="tid">' + U.esc(itemRef(i)) + '</span>',
        '<div class="t1">' + U.esc(r && r.customer && r.customer.name || '—') + '</div><div class="t2">' + U.esc(productLabel(i)) + '</div>',
        '<span class="tid">' + U.esc(U.fmtDate(i.occurrence_date)) + '</span>',
        ui.tag(D.label(i.status), D.tone(i.status)),
        ui.select('to_' + i.item_id, options, '', { blank: 'Chọn người nhận' })
      ] };
    });
    ui.openDialog('Bàn giao việc của ' + from.full_name,
      '<form data-form="staff-handover">' +
      '<input type="hidden" name="user_id" value="' + U.attr(userId) + '">' +
      '<div class="f-row">' +
      ui.field('Giao các hồ sơ đã tick cho', ui.select('bulk_to', options, '', { blank: 'Chọn người nhận' })) +
      '<div class="f"><label>&nbsp;</label>' + ui.btn('Áp dụng', { kind: 'line', act: 'handover-bulk' }) + '</div>' +
      '</div>' +
      '<label class="chan-check"><input type="checkbox" data-act="handover-pick-all" checked><span>Chọn tất cả (' + held.length + ' hồ sơ)</span></label>' +
      ui.table([{ label: '', cls: 'fit pick-col' }, { label: 'Mã' }, { label: 'Khách / sản phẩm' }, { label: 'Ngày' }, { label: 'Trạng thái' }, { label: 'Người nhận' }], rows) +
      ui.formEnd('Bàn giao hồ sơ đã tick') + '</form>',
      { size: 'lg', sub: held.length + ' việc đang mở' });
  }

  function handoverPickAll(el) {
    var form = el.closest('form');
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll('input[name="pick"]'), function (box) { box.checked = el.checked; });
  }

  function handoverBulk(el) {
    var form = el.closest('form');
    if (!form) return;
    var to = form.querySelector('[name="bulk_to"]');
    if (!to || !to.value) { ui.toast('Chọn người nhận chung trước.', 'err'); return; }
    Array.prototype.forEach.call(form.querySelectorAll('input[name="pick"]:checked'), function (box) {
      var select = form.querySelector('[name="to_' + box.value.replace(/["\\]/g, '') + '"]');
      if (select) select.value = to.value;
    });
  }

  function submitStaffHandover(form) {
    if (!canManageStaffAbsence() || form.getAttribute('data-waiting')) return;
    var d = new FormData(form), fromId = String(d.get('user_id') || ''), rows = [], missing = 0;
    Array.prototype.forEach.call(form.querySelectorAll('input[name="pick"]:checked'), function (box) {
      var to = String(d.get('to_' + box.value) || '');
      if (!to) missing += 1; else rows.push({ item_id: box.value, assignee_id: to });
    });
    if (!rows.length && !missing) { ui.toast('Tick ít nhất một hồ sơ để bàn giao.', 'err'); return; }
    if (missing) { ui.toast(missing + ' hồ sơ đã tick chưa chọn người nhận.', 'err'); return; }
    var from = U.byId(st().users, 'user_id', fromId);
    if (!from) return;
    var snapshots = rows.map(function (row) { return snapshotItem(U.byId(st().items, 'item_id', row.item_id)); }), ts = U.now();
    function applyRows() {
      rows.forEach(function (row) {
        var item = U.byId(st().items, 'item_id', row.item_id);
        if (!item) return;
        item.assigned_user_id = row.assignee_id; item.assigned_by = st().session; item.assigned_at = ts;
        item.version = Number(item.version || 0) + 1;
        if (D.CLOCK_RUNNING.indexOf(item.status) !== -1) { item.execution_state = 'QUEUED'; item.execution_changed_at = ts; }
        if (!U.isGas()) logEvent(item.item_id, 'DOI_NGUOI', 'Bàn giao do ' + from.full_name + ' nghỉ phép · giao ' + userName(row.assignee_id));
      });
    }
    applyRows();
    ui.closeDialog(); LS.app.render();
    ui.toast('Đã bàn giao ' + rows.length + ' hồ sơ.', 'ok');
    if (!U.isGas()) { U.save(); return; }
    LS.app.background(LS.api.handoverStaffWork(fromId, rows), {
      label: 'Bàn giao việc',
      onOk: function (result) {
        (result && result.items || []).forEach(function (remote) {
          var live = U.byId(st().items, 'item_id', remote.item_id);
          if (live) Object.keys(remote).forEach(function (key) { live[key] = remote[key]; });
        });
        LS.app.render();
      },
      rollback: function () { snapshots.forEach(restoreItem); }
    });
  }

  function staffAbsenceEditDialog(userId) {
    if (!canManageStaffAbsence()) { ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được cấu hình nghỉ phép.', 'err'); return; }
    var user = U.byId(st().users, 'user_id', userId);
    if (!user || user.role !== 'CAN_BO_LS' || !user.active) { ui.toast('Không tìm thấy cán bộ LS đang hoạt động.', 'err'); return; }
    ui.openDialog('Cài nghỉ phép',
      '<form data-form="staff-absence">' +
      '<input type="hidden" name="user_id" value="' + U.attr(user.user_id) + '">' +
      '<p class="t1">' + U.esc(user.full_name) + '</p>' +
      '<div class="f-row">' +
      ui.field('Nghỉ từ', ui.input('off_from', user.off_from || '', { type: 'date' })) +
      ui.field('Nghỉ đến', ui.input('off_to', user.off_to || '', { type: 'date' })) +
      '</div>' +
      ui.field('Lý do (không bắt buộc)', ui.input('off_reason', user.off_reason || '', { attrs: ' maxlength="160"', placeholder: 'Ví dụ: nghỉ phép' })) +
      ui.formEnd('Lưu lịch nghỉ') + '</form>',
      { size: 'sm' });
  }

  function myAbsenceDialog() {
    var user = me();
    if (!user || user.role !== 'CAN_BO_LS') { ui.toast('Chỉ cán bộ LS được tự khai nghỉ phép.', 'err'); return; }
    ui.openDialog('Khai báo nghỉ phép',
      '<form data-form="my-absence">' +
      '<div class="f-row">' +
      ui.field('Nghỉ từ', ui.input('off_from', user.off_from || '', { type: 'date' })) +
      ui.field('Nghỉ đến', ui.input('off_to', user.off_to || '', { type: 'date' })) +
      '</div>' +
      ui.field('Lý do (không bắt buộc)', ui.input('off_reason', user.off_reason || '', { attrs: ' maxlength="160"', placeholder: 'Ví dụ: nghỉ phép' })) +
      ui.formEnd('Lưu lịch nghỉ') + '</form>',
      { size: 'sm' });
  }

  function notifyLocalAbsenceChange(user, from, to, previousFrom, previousTo) {
    var name = user.full_name || user.user_id;
    var detail = from
      ? 'LS ' + name + ' tự khai nghỉ từ ' + from + ' đến ' + to + '. Hệ thống chặn phân công mới; việc đang giao giữ nguyên và SLA tiếp tục tính. Vui lòng xem việc đang mở để phân giao lại khi cần.'
      : 'LS ' + name + ' đã gỡ lịch nghỉ' + (previousFrom && previousTo ? ' (trước đó ' + previousFrom + ' đến ' + previousTo + ')' : '') + '. Việc đang giao giữ nguyên trạng thái.';
    st().inbox = st().inbox || [];
    st().users.filter(function (leader) {
      return leader.active && ['KS_LS', 'QUAN_LY_LS'].indexOf(leader.role) !== -1;
    }).forEach(function (leader, index) {
      st().inbox.unshift({ id: 'NTF_LOCAL_' + Date.now().toString(36) + '_' + index, user_id: leader.user_id,
        item_id: '', event: 'NGHI_PHEP_LS', at: U.now(), read: false, detail: detail, subject_user_id: user.user_id });
    });
  }

  function saveMyAbsence(form) {
    var user = me();
    if (!user || user.role !== 'CAN_BO_LS' || form.getAttribute('data-waiting')) return;
    var data = new FormData(form), from = String(data.get('off_from') || ''),
      to = String(data.get('off_to') || ''), reason = String(data.get('off_reason') || '').trim();
    if (!!from !== !!to) { ui.toast('Nhập đủ ngày bắt đầu và ngày kết thúc, hoặc xóa cả hai để gỡ lịch nghỉ.', 'err'); return; }
    if (from && from > to) { ui.toast('Ngày kết thúc nghỉ không được trước ngày bắt đầu.', 'err'); return; }
    if (reason.length > 160) { ui.toast('Lý do nghỉ tối đa 160 ký tự.', 'err'); return; }
    var previousFrom = String(user.off_from || ''), previousTo = String(user.off_to || '');
    var datesChanged = previousFrom !== from || previousTo !== to;
    var values = { off_from: from, off_to: to, off_reason: reason };
    function apply(result) {
      user.availability_status = result.availability_status;
      user.off_from = result.off_from; user.off_to = result.off_to; user.off_reason = result.off_reason;
      ui.closeDialog(); LS.app.render(); ui.toast('Đã lưu lịch nghỉ.', 'ok');
    }
    if (!U.isGas()) {
      if (datesChanged) notifyLocalAbsenceChange(user, from, to, previousFrom, previousTo);
      apply({ availability_status: from ? 'OFF' : 'AVAILABLE', off_from: from, off_to: to, off_reason: from ? reason : '' });
      U.save();
      return;
    }
    form.setAttribute('data-waiting', '1');
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    LS.app.background(LS.api.saveStaffAbsence(user.user_id, values), {
      label: 'Lịch nghỉ cá nhân',
      onOk: apply,
      rollback: function () { form.removeAttribute('data-waiting'); if (submit) submit.disabled = false; }
    });
  }

  function saveStaffAbsence(form) {
    if (!canManageStaffAbsence() || form.getAttribute('data-waiting')) return;
    var data = new FormData(form), userId = String(data.get('user_id') || ''), from = String(data.get('off_from') || ''),
      to = String(data.get('off_to') || ''), reason = String(data.get('off_reason') || '').trim();
    if (!!from !== !!to) { ui.toast('Nhập đủ ngày bắt đầu và ngày kết thúc, hoặc xóa cả hai để gỡ lịch nghỉ.', 'err'); return; }
    if (from && from > to) { ui.toast('Ngày kết thúc nghỉ không được trước ngày bắt đầu.', 'err'); return; }
    if (reason.length > 160) { ui.toast('Lý do nghỉ tối đa 160 ký tự.', 'err'); return; }
    var user = U.byId(st().users, 'user_id', userId);
    if (!user || user.role !== 'CAN_BO_LS' || !user.active) { ui.toast('Không tìm thấy cán bộ LS đang hoạt động.', 'err'); return; }
    if (!U.isGas()) {
      user.availability_status = from ? 'OFF' : 'AVAILABLE';
      user.off_from = from; user.off_to = to; user.off_reason = from ? reason : '';
      U.save(); ui.closeDialog(); LS.app.render(); ui.toast('Đã lưu lịch nghỉ.', 'ok'); return;
    }
    form.setAttribute('data-waiting', '1');
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    LS.app.background(LS.api.saveStaffAbsence(userId, { off_from: from, off_to: to, off_reason: reason }), {
      label: 'Lịch nghỉ',
      onOk: function (result) {
        user.availability_status = result.availability_status;
        user.off_from = result.off_from; user.off_to = result.off_to; user.off_reason = result.off_reason;
        ui.closeDialog(); LS.app.render(); ui.toast('Đã lưu lịch nghỉ.', 'ok');
      },
      rollback: function () { form.removeAttribute('data-waiting'); if (submit) submit.disabled = false; }
    });
  }

  function dailyResultBlock(report, active) {
    var range = report.range, periodWord = { week: 'tuần', month: 'tháng' }[range.period] || 'ngày';

    var filtersHtml = '<div class="report-filters">' +
      ui.field('Xem theo', ui.select('', BOARD_PERIODS, filterValue('board', 'period', 'day'), { attrs: draftAttrs('board', 'period') })) +
      ui.field('Ngày', ui.input('', filterValue('board', 'anchor', U.localDate()), { type: 'date', attrs: draftAttrs('board', 'anchor') })) +
      ui.field('Cán bộ LS', ui.select('', staffList(true).map(function (x) { return [x.user_id, x.full_name]; }), filterValue('board', 'staff', ''), { blank: 'Tất cả cán bộ', attrs: draftAttrs('board', 'staff') })) +
      ui.field('Đơn vị gửi', ui.select('', sendingUnits().map(function (x) { return [x.unit_id, x.name]; }), filterValue('board', 'unit', ''), { blank: 'Tất cả đơn vị', attrs: draftAttrs('board', 'unit') })) +
      (range.period === 'day' ? '' : '<span class="report-range-note">' + U.esc(reportLabel(range)) + '</span>') +
      '<div class="report-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-act="apply-report">' + U.icon('search', 15) + ' Xem</button>' +
      (canSetPlan() ? ui.btn('Giao kế hoạch', { act: 'plan-edit', sm: true, kind: 'primary', icon: 'clipboard', title: 'Giao chỉ tiêu từng cán bộ theo tuần, tháng, quý' }) : '') +
      (canManageStaffAbsence() ? ui.btn('Nghỉ phép cán bộ', { act: 'staff-absence', sm: true, kind: 'line', icon: 'users', title: 'Cài thời gian nghỉ để loại cán bộ khỏi phân công trong các ngày đó' }) : '') +
      ui.btn(f('board', 'plan', '') === '1' ? 'Ẩn kế hoạch / %' : 'Hiện kế hoạch / %', { act: 'board-plan', sm: true, kind: 'line', title: 'Bật/tắt cột Kế hoạch ngày và % hoàn thành (cả ảnh và Excel)' }) +
      ui.btn('Tải ảnh', { act: 'download-daily-image', icon: 'download', sm: true, title: 'Tải ảnh PNG vùng kết quả đang xem' }) +
      ui.btn('Tải Excel', { act: 'board-export', icon: 'file', sm: true, title: 'Tải file Excel toàn bộ các bảng của Tổng hợp' }) +
      '</div></div>';
    var body = dashboardTabs(active) + (active === 'report' ? dailyMatrixHtml(dailyMatrix(range)) + ui.strip([ui.metric('Phân công ' + periodWord, report.assigned), ui.metric('Hoàn thành ' + periodWord, report.done, 'ok'), ui.metric('Đang mở', report.open, 'info'), ui.metric('Quá hạn', report.late, report.late ? 'danger' : ''), ui.metric('Nhận hồ sơ TB', D.durationLabel(report.avgReceiveHours), '', 'hồ sơ nhận trong ' + periodWord), ui.metric('Toàn trình TB', D.durationLabel(report.avgTotalHours), '', 'gửi → hoàn thành trong ' + periodWord)].concat(targetMetric(report))) +
      resultCharts(report) +
      ui.table(
        [{ label: 'Cán bộ LS' }, { label: 'Đã giao', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'TB nhận', cls: 'num' }, { label: 'TB xử lý / hồ sơ', cls: 'num' }, { label: 'TB toàn trình', cls: 'num' }, { label: 'Đúng hạn', cls: 'num' }],
        report.rows.map(function (x) { return { cls: x.late ? 'flag' : '', cells: [
          '<div class="t1">' + U.esc(x.user.full_name) + '</div><div class="t2">' + U.esc(unitName(x.user.unit_id)) + (D.userOff(x.user) ? ' · ' + U.esc('Đang nghỉ') : '') + '</div>' +
            (isLeader() ? '<div style="margin-top:.3rem">' + ui.btn('Xem việc (' + x.open + ')', {
              act: 'staff-work-detail', kind: 'line', sm: true, icon: 'briefcase',
              data: ' data-user-id="' + U.attr(x.user.user_id) + '" aria-label="Xem việc được giao cho ' + U.attr(x.user.full_name) + '; ' + x.open + ' việc đang mở"',
              title: 'Xem các việc đang mở được giao cho cán bộ này'
            }) + '</div>' : ''),
          '<span class="tid">' + x.assigned + '</span>', '<span class="tid">' + x.done + '</span>', '<span class="tid">' + x.open + '</span>',
          x.late ? ui.tag(String(x.late), 'danger') : '<span class="tid">0</span>', x.avgReceiveHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + U.esc(D.durationLabel(x.avgReceiveHours)) + '</span>', x.avgHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + U.esc(D.durationLabel(x.avgHours)) + '</span>',
          x.avgTotalHours === null ? '<span class="t2">—</span>' : '<span class="tid">' + U.esc(D.durationLabel(x.avgTotalHours)) + '</span>',
          x.onTime === null ? '<span class="t2">—</span>' : '<span class="tid">' + x.onTime + '%</span>'
        ] }; }),
        { icon: 'users', title: 'Chưa có dữ liệu cán bộ LS', text: '' }
      ) + (report.workload && report.workload.groups.length ? '<div style="margin-top:1rem">' + ui.sectionTitle('Số lượng theo cán bộ và nhóm việc') +
        ui.table([{ label: 'Cán bộ LS' }].concat(report.workload.groups.map(function (g) { return { label: g, cls: 'num' }; })).concat([{ label: 'Tổng', cls: 'num' }]),
          report.workload.rows.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.user.full_name) + '</div>'].concat(report.workload.groups.map(function (g) { return '<span class="tid">' + Number(x.byGroup[g] || 0) + '</span>'; })).concat(['<span class="tid">' + x.total + '</span>']) }; }),
          { icon: 'users', title: 'Chưa có cán bộ LS', text: '' }) + '</div>' : '') : '');
    return ui.block({
      title: 'Kết quả thực hiện', icon: 'chart',
      filters: filtersHtml,
      body: body
    });
  }

  function staffOpenWorkItems(userId, sourceItems) {
    return (sourceItems || []).filter(function (item) {
      return item.assigned_user_id === userId && D.STATUS[item.status] &&
        D.STATUS[item.status].open && !item.carried_to_item_id;
    });
  }

  /** Xem các hồ sơ hiện còn mở đã giao cho một cán bộ LS trong phạm vi báo cáo. */
  function staffWorkDetail(userId, options) {
    options = options || {};
    if (!isLeader()) {
      ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được xem phân công cán bộ.', 'err');
      return;
    }
    var staff = U.byId(st().users, 'user_id', userId);
    if (!staff || staff.role !== 'CAN_BO_LS') {
      ui.toast('Không tìm thấy cán bộ LS.', 'err');
      return;
    }
    var sourceItems = options.sourceItems || (options.allOpen ? visibleItems() : boardItems());
    var items = sortItems(staffOpenWorkItems(userId, sourceItems), 'board');
    var activeCount = items.filter(function (item) { return LSTiming.workState(item) === 'ACTIVE'; }).length;
    var lateCount = items.filter(function (item) { var sla = D.sla(item, st()); return sla && sla.late; }).length;
    function progressLabel(item) {
      var focus = LSTiming.workState(item);
      if (focus === 'ACTIVE') return 'Đang xử lý';
      if (focus === 'WAITING') return 'Chờ làm tiếp';
      if (focus === 'QUEUED') return item.status === 'DA_PHAN_CONG' ? 'Đã giao · chờ bắt đầu' : 'Chờ bắt đầu';
      return D.label(item.status);
    }
    var body = ui.strip([
      ui.metric('Đang xử lý', activeCount, activeCount ? 'info' : ''),
      ui.metric('Chờ bắt đầu / làm tiếp', items.length - activeCount),
      ui.metric('Quá hạn', lateCount, lateCount ? 'danger' : '')
    ]) + ui.table(
      [{ label: 'Hồ sơ' }, { label: 'Phần việc' }, { label: 'Tiến độ' }, { label: '' }],
      items.map(function (item) {
        var request = reqOf(item), sla = D.sla(item, st()), kinds = personalBacklogKinds(item), product = productLabel(item);
        var work = wtGroup(item.work_type_code) + (product && product !== '—' ? ' · ' + product : '');
        return { attrs: ' data-row="' + U.attr(item.item_id) + '" data-backlog-parts="' + U.attr(kinds.join(',')) + '"', cells: [
          '<div class="t1">' + U.esc(request && request.customer ? request.customer.name : 'Chưa có tên khách') + '</div><div class="t2">' + U.esc(work) + '</div>' + dossierNoteHtml(item),
          backlogKindsHtml(item),
          '<div>' + ui.statusTag(item.status) + '</div><div class="t2">' + U.esc(progressLabel(item)) + '</div>' +
            (sla && sla.late ? '<div>' + ui.tag('Quá hạn', 'danger') + '</div>' : ''),
          ui.btn('Mở hồ sơ', { act: 'detail', kind: 'quiet', sm: true, data: ' data-id="' + U.attr(item.item_id) + '"' })
        ] };
      }),
      { icon: 'briefcase', title: 'Cán bộ này hiện không có việc đang mở', text: '' , tableClass: 'mobile-record-table staff-work-detail-table' }
    );
    if (options.inlineRow) {
      options.inlineRow.insertAdjacentHTML('afterend',
        '<tr class="assignment-work-preview" data-assignment-staff-preview data-user-id="' + U.attr(userId) + '">' +
          '<td colspan="5"><div class="assignment-work-preview-inner" id="assignment-staff-work-preview">' + body + '</div></td>' +
        '</tr>'
      );
      return;
    }
    ui.openDialog('Việc được giao · ' + staff.full_name, body, {
      size: 'xl', sub: unitName(staff.unit_id) + ' · ' + items.length + ' việc đang mở'
    });
  }

  /** Mở rộng việc đang mở ngay dưới dòng cán bộ, giữ nguyên radio đã chọn. */
  function assignmentStaffWorkPreview(el) {
    if (!isLeader()) {
      ui.toast('Chỉ Kiểm soát LS hoặc Quản lý LS được xem phân công cán bộ.', 'err');
      return;
    }
    var userId = el && el.getAttribute('data-user-id');
    var staff = U.byId(st().users, 'user_id', userId);
    var row = el && el.closest('tr[data-pick-assignee]');
    var rows = row && row.parentElement;
    if (!staff || staff.role !== 'CAN_BO_LS' || !row || !rows) {
      ui.toast('Không tìm thấy cán bộ LS trong danh sách phân công.', 'err');
      return;
    }

    var wasExpanded = el.getAttribute('aria-expanded') === 'true';
    Array.prototype.slice.call(rows.querySelectorAll('tr[data-assignment-staff-preview]')).forEach(function (preview) {
      preview.remove();
    });
    Array.prototype.slice.call(rows.querySelectorAll('button[data-act="assignment-staff-work-preview"]')).forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
    });
    if (wasExpanded) return;

    staffWorkDetail(userId, { sourceItems: visibleItems(), inlineRow: row });
    el.setAttribute('aria-expanded', 'true');
  }

  /** Chỉ tiêu cho kỳ đang xem: chỉ tiêu tháng quy theo số tháng (kỳ ngày/tuần không so). */
  function periodTarget(range, key) {
    var monthly = target(key);
    if (!monthly || ['month', 'year'].indexOf(range.period) === -1 && range.period !== 'range') return 0;
    var days = Math.round((range.to - range.from) / 86400000);
    if (range.period === 'range' && days < 27) return 0;
    return Math.round(monthly * (range.period === 'year' ? 12 : Math.max(1, Math.round(days / 30.4))));
  }

  function targetMetric(report) {
    if ((st().staffPlans || []).length) return [];
    var staffOnly = !!f('board', 'staff', '');
    var goal = periodTarget(report.range, staffOnly ? 'target_done_staff_month' : 'target_done_month');
    if (!goal) return [];
    var p = Math.round(report.done * 100 / goal);
    return [ui.metric('Đạt chỉ tiêu', p + '%', p >= 100 ? 'ok' : (p >= 70 ? 'info' : 'warn'), report.done + '/' + goal + ' việc')];
  }

  /** Hai đồ thị đầu tab Kết quả: nhịp phát sinh/hoàn thành và tải theo cán bộ. */
  function resultCharts(report) {
    var range = report.range, b = LS.charts.buckets(range.fromDate, range.toDate);
    var inflow = b.labels.map(function () { return 0; }), outflow = inflow.slice();
    boardItems().forEach(function (i) {
      var k = b.keyOf(i.occurrence_date);
      if (k !== -1 && i.status !== 'HUY') inflow[k] += 1;
      var d = i.status === 'HOAN_THANH_LS' ? b.keyOf(i.completed_at) : -1;
      if (d !== -1) outflow[d] += 1;
    });
    report.series = { labels: b.labels, inflow: inflow, outflow: outflow };
    var unitWord = { day: 'ngày', week: 'tuần', month: 'tháng' }[b.mode];
    var staffRows = report.rows.filter(function (x) { return x.done || x.open; });
    return '<div class="viz-pair">' +
      LS.charts.columns({
        title: 'Phát sinh và hoàn thành theo ' + unitWord, sub: reportLabel(range), labelHead: 'Mốc',
        labels: b.labels, integer: true,
        series: [{ name: 'Phát sinh', values: inflow }, { name: 'Hoàn thành', values: outflow, slot: 2 }],
        emptyText: 'Chưa có hồ sơ phát sinh hay hoàn thành trong kỳ.'
      }) +
      LS.charts.bars({
        title: 'Tải việc theo cán bộ LS', sub: 'Hoàn thành trong kỳ + đang mở hiện tại', labelHead: 'Cán bộ LS', sort: true,
        target: (st().staffPlans || []).length ? 0 : periodTarget(range, 'target_done_staff_month'),
        rows: staffRows.map(function (x) { return { label: x.user.full_name, note: x.late ? x.late + ' việc quá hạn' : '' }; }),
        series: [{ name: 'Hoàn thành', values: staffRows.map(function (x) { return x.done; }) },
          { name: 'Đang mở', values: staffRows.map(function (x) { return x.open; }), slot: 2 }],
        emptyText: 'Chưa có cán bộ nào có việc trong kỳ.'
      }) + '</div>';
  }

  function typeSummaryBlock(range) {
    var items = boardItems().filter(function (i) { return inRange(i.occurrence_date + 'T12:00:00', range); });
    var rows = st().workTypes.map(function (w) {
      var mine = items.filter(function (i) { return i.work_type_code === w.code; });
      var done = mine.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length;
      var open = mine.filter(function (i) { return D.STATUS[i.status].open; }).length;
      var late = mine.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length;
      return { n: mine.length, cells: [
        '<div class="t1">' + U.esc(w.name) + '</div>', '<span class="tid">' + mine.length + '</span>',
        '<span class="tid">' + mine.filter(function (i) { return !!i.assigned_user_id; }).length + '</span>',
        '<span class="tid">' + open + '</span>', '<span class="tid">' + done + '</span>',
        late ? ui.tag(String(late), 'danger') : '<span class="tid">0</span>'
      ] };
    }).filter(function (x) { return x.n; });
    var byGroup = {};
    items.forEach(function (i) { if (i.status === 'HUY') return; var g = wtGroup(i.work_type_code); byGroup[g] = (byGroup[g] || 0) + 1; });
    var groupNames = Object.keys(byGroup);
    var chart = LS.charts.bars({
      title: 'Phát sinh theo nhóm loại việc', sub: reportLabel(range), labelHead: 'Nhóm', sort: true,
      rows: groupNames.map(function (g) { return { label: g }; }),
      series: [{ name: 'Phát sinh', values: groupNames.map(function (g) { return byGroup[g]; }) }]
    });
    return ui.block({ title: 'Tổng hợp theo loại việc', icon: 'activity', body: chart + ui.table(
      [{ label: 'Loại việc' }, { label: 'Phát sinh', cls: 'num' }, { label: 'Đã phân công', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }], rows,
      { icon: 'activity', title: 'Chưa có hồ sơ trong kỳ', text: '' }) });
  }

  /** Dải số liệu gọn trên thanh đầu; không lặp lại trong thân màn hình. */
  function headerSummary(screen) {
    var all = visibleItems();
    if (screen === 'work') all = all.filter(requestedByMe);
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    var done = all.filter(function (i) { return i.status === 'HOAN_THANH_LS'; });
    if (screen === 'work') {
      return ui.strip([ui.metric('Đang mở', open.length), ui.metric('Chưa giao hồ sơ', all.filter(function (i) { return ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1; }).length, 'warn'), ui.metric('Quá hạn', late.length, late.length ? 'warn' : ''), ui.metric('Hoàn thành', done.length, 'ok')]);
    }
    if (screen === 'queue') {
      // Lọc theo đúng cửa sổ ngày của danh sách Hàng chờ, nếu không dải số đỉnh
      // trang báo có việc nhưng danh sách bên dưới lại trống.
      var qrange = queueWindow();
      var waiting = all.filter(function (i) { return withinQueueWindow(i, qrange) && UNASSIGNED_STATUS.indexOf(i.status) !== -1; });
      return ui.strip([ui.metric('Chờ phân công', waiting.filter(function (i) { return i.status !== 'CAN_BO_SUNG'; }).length, 'warn'),
        ui.metric('Chưa giao hồ sơ', waiting.filter(function (i) { return i.status === 'CAN_BO_SUNG'; }).length, 'warn'),
        ui.metric('Phát sinh hôm nay', waiting.filter(function (i) { return queueDayRank(i) === 0; }).length, 'info')]);
    }
    if (screen === 'tracking') {
      // Cùng cửa sổ tuần với danh sách Quản lý hồ sơ: trước đây ba ô sau đếm cả kỳ tháng nên lệch với bảng.
      all = all.filter(function (i) { return withinWorkflowWeek(i, currentWeekWindow()); });
      var live = all.filter(isTracked);
      var weekOpen = all.filter(function (i) { return D.STATUS[i.status].open; });
      var working = weekOpen.filter(function (i) { return !!i.assigned_user_id; });
      var weekLate = weekOpen.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
      var weekDone = all.filter(function (i) { return i.status === 'HOAN_THANH_LS'; });
      return ui.strip([ui.metric('Đã phân công trong kỳ', live.length), ui.metric('Đang xử lý', working.length, 'info'),
        ui.metric('Quá hạn', weekLate.length, weekLate.length ? 'danger' : ''), ui.metric('Hoàn thành', weekDone.length, 'ok')]);
    }
    if (screen === 'mine') {
      var fresh = all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; });
      return ui.strip([ui.metric('Việc đang mở', open.length), ui.metric('Chờ tiếp nhận', fresh.length, fresh.length ? 'warn' : ''), ui.metric('Quá hạn', late.length, late.length ? 'danger' : ''), ui.metric('Hoàn thành', done.length, 'ok')]);
    }
    if (screen === 'room' || screen === 'room-board') {
      // Cả bốn ô theo kỳ đang xem của phòng (trước đây ô Hoàn thành đếm toàn bộ lịch sử).
      var current = screen === 'room-board' ? applyFilters('room-board', roomBoardItems()) : roomItems(), needUnit = current.filter(function (i) { return ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1; });
      return ui.strip([ui.metric('Trong kỳ', current.length, 'info'), ui.metric('LS đang xử lý', current.filter(function (i) { return D.STATUS[i.status].open && i.assigned_user_id; }).length),
        ui.metric('Phòng cần bổ sung', needUnit.length, needUnit.length ? 'warn' : ''), ui.metric('Hoàn thành', current.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length, 'ok')]);
    }
    if (screen === 'board') {
      // Theo đúng bộ lọc cán bộ / đơn vị và kỳ của Kết quả & kế hoạch, để số trên đầu khớp số trong trang.
      var scope = boardItems(), range = reportRange();
      var bOpen = scope.filter(function (i) { return D.STATUS[i.status].open && !i.carried_to_item_id; });
      var bLate = bOpen.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
      var bDone = scope.filter(function (i) { return i.status === 'HOAN_THANH_LS' && inRange(i.completed_at, range); });
      var timedDone = bDone.filter(function (i) { return i.due_at && !D.slaExempt(i, st()); });
      var onTime = U.pct(timedDone.filter(function (i) { return new Date(i.completed_at) <= new Date(i.due_at); }).length, timedDone.length);
      return ui.strip([ui.metric('Chờ phân công', bOpen.filter(function (i) { return D.PRE_ASSIGN.indexOf(i.status) !== -1; }).length, 'warn'),
        ui.metric('LS đang xử lý', bOpen.filter(function (i) { return !!i.assigned_user_id; }).length, 'info'),
        ui.metric('Quá hạn', bLate.length, bLate.length ? 'danger' : ''),
        ui.metric('Đúng hạn trong kỳ', onTime === null ? null : onTime + '%', 'ok')]);
    }
    return '';
  }

  /** Tạo ảnh PNG của bảng kết quả ngày theo đúng bố cục mẫu phòng; không mở màn in/PDF. */
  function downloadDailyImage() {
    var range = reportRange();
    var m = dailyMatrix(range);
    var n = m.users.length;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) { ui.toast('Trình duyệt không hỗ trợ tạo ảnh báo cáo.', 'err'); return; }

    // Bề rộng cột cán bộ theo từ dài nhất của tên (tối thiểu 84, tối đa 130) để chữ không đè lên cột bên cạnh.
    ctx.font = 'bold 14px Arial, sans-serif';
    var longest = m.labels.reduce(function (mx, l) {
      return Math.max(mx, l.split(' ').reduce(function (w, word) { return Math.max(w, ctx.measureText(word).width); }, 0));
    }, 0);
    var colAct = 270, colUnit = 110, colStaff = Math.min(130, Math.max(84, Math.ceil(longest) + 20)), colTotal = 84;
    var colPlan = m.showPlan ? 118 : 0, colPct = m.showPlan ? 118 : 0;
    var width = colAct + colUnit + n * colStaff + colTotal + colPlan + colPct;
    var h1 = 30, h2 = 30, h3 = 56, rowH = 32;
    var height = h1 + h2 + h3 + m.rows.length * rowH + 40;
    canvas.width = width; canvas.height = height;

    var FONT = 'Arial, sans-serif';
    function box(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    function grid(x, y, w, h) { ctx.strokeStyle = '#cfdcda'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    function text(value, x, y, font, color, align) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
    }
    /** Chia chữ thành tối đa hai dòng vừa bề rộng ô; quá rộng thì giảm cỡ chữ, cùng lắm cắt bằng dấu …. */
    function fitLines(value, w, weight, size) {
      var words = String(value).split(' '), px = size;
      for (; px >= 10; px--) {
        ctx.font = weight + ' ' + px + 'px ' + FONT;
        var lines = [], line = '';
        words.forEach(function (word) {
          var next = line ? line + ' ' + word : word;
          if (line && ctx.measureText(next).width > w - 12) { lines.push(line); line = word; } else line = next;
        });
        lines.push(line);
        if (lines.length <= 2 && lines.every(function (l) { return ctx.measureText(l).width <= w - 12; })) return { lines: lines, px: px };
      }
      return { lines: [String(value).slice(0, Math.max(3, Math.floor((w - 12) / 8))) + '…'], px: 10 };
    }
    function headCell(x, y, w, h, fill, value, color) {
      box(x, y, w, h, fill); grid(x, y, w, h);
      var fit = fitLines(value, w, 'bold', 14);
      var lineH = fit.px + 4, top = y + h / 2 - (fit.lines.length * lineH) / 2 + lineH / 2;
      fit.lines.forEach(function (l, i) { text(l, x + w / 2, top + i * lineH, 'bold ' + fit.px + 'px ' + FONT, color, 'center'); });
    }
    function cell(x, y, w, h, fill, value, opts) {
      opts = opts || {};
      box(x, y, w, h, fill); grid(x, y, w, h);
      if (value === '' || value === null || value === undefined) return;
      var align = opts.align || 'center';
      var tx = align === 'left' ? x + 6 : (align === 'right' ? x + w - 6 : x + w / 2);
      text(value, tx, y + h / 2 + 1, (opts.font || '15px ') + FONT, opts.color || '#1d2b2a', align);
    }

    box(0, 0, width, height, '#ffffff');
    var fixed = colAct + colUnit, staffW = n * colStaff;
    cell(0, 0, colAct, h1, '#00403e', 'NGÀY', { font: 'bold 15px ', color: '#ffffff' });
    cell(0, h1, colAct, h2, '#ffffff', m.dateLabel);
    cell(colAct, 0, colUnit, h1 + h2, '#ffffff', '');
    cell(fixed, 0, staffW + colTotal, h1 + h2, '#006b68', 'LS', { font: 'bold 15px ', color: '#ffffff' });
    if (m.showPlan) cell(fixed + staffW + colTotal, 0, colPlan + colPct, h1 + h2, '#ffffff', '');

    var y = h1 + h2, x = 0;
    cell(x, y, colAct, h3, '#cfe5e3', 'Hoạt động/Chỉ tiêu', { font: 'bold 15px ', color: '#00403e' }); x += colAct;
    cell(x, y, colUnit, h3, '#cfe5e3', 'Đơn vị', { font: 'bold 15px ', color: '#00403e' }); x += colUnit;
    m.labels.forEach(function (l) { headCell(x, y, colStaff, h3, '#cfe5e3', l, '#00403e'); x += colStaff; });
    headCell(x, y, colTotal, h3, '#006b68', 'TỔNG', '#ffffff'); x += colTotal;
    if (m.showPlan) {
      headCell(x, y, colPlan, h3, '#f4e7c0', 'KẾ HOẠCH NGÀY', '#6b4a00'); x += colPlan;
      headCell(x, y, colPct, h3, '#f4e7c0', '% HOÀN THÀNH', '#6b4a00');
    }

    m.rows.forEach(function (r, index) {
      var ry = h1 + h2 + h3 + index * rowH, rx = 0;
      var italic = r.def.sub ? 'italic 15px ' : '15px ';
      cell(rx, ry, colAct, rowH, '#eef4f3', r.def.label, { align: 'left', font: italic }); rx += colAct;
      cell(rx, ry, colUnit, rowH, '#ffffff', r.def.unit, { align: 'left', font: italic }); rx += colUnit;
      m.users.forEach(function (u, c) {
        cell(rx, ry, colStaff, rowH, '#ffffff', r.def.header ? '' : (r.cells[c] || ''), { align: 'right' }); rx += colStaff;
      });
      cell(rx, ry, colTotal, rowH, '#eaf4f3', r.def.header ? '-' : (r.total || '-'), { align: 'right', font: 'bold 15px ', color: '#00403e' }); rx += colTotal;
      if (m.showPlan) {
        cell(rx, ry, colPlan, rowH, '#ffffff', r.plan === null ? '' : r.plan, { align: 'right' }); rx += colPlan;
        cell(rx, ry, colPct, rowH, '#ffffff', pctText(r.pct), { align: 'right' });
      }
    });

    text('Hệ thống hỗ trợ tín dụng LS · Xuất lúc ' + U.fmtDT(U.now()), 8, height - 16, '12px ' + FONT, '#666666');
    var link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'ket_qua_LS_' + range.fromDate + '_' + range.toDate + '.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    ui.toast('Đã tải ảnh kết quả ' + reportLabel(range) + '.');
  }

  function openLoad(userId) {
    return st().items.filter(function (i) {
      return i.assigned_user_id === userId && D.STATUS[i.status].open;
    }).length;
  }

  function staffLoad(userId) {
    var mine = st().items.filter(function (i) { return i.assigned_user_id === userId; });
    var open = mine.filter(function (i) { return D.STATUS[i.status].open; });
    var today = U.localDate();
    return {
      open: open.length,
      late: open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length,
      done: mine.filter(function (i) {
        return i.status === 'HOAN_THANH_LS' && i.completed_at && U.localDate(new Date(i.completed_at)) === today;
      }).length,
      // Đang mở = việc ĐÃ NHẬN hồ sơ (đang thực hiện), không tính việc mới giao chưa nhận.
      working: mine.filter(function (i) { return D.STATUS[i.status].open && i.dossier_received_at; }).length,
      // Phân công trong ngày = giao hôm nay nhưng cán bộ LS chưa tiếp nhận hồ sơ.
      assignedToday: mine.filter(function (i) {
        return i.status === 'DA_PHAN_CONG' && i.assigned_at && U.localDate(new Date(i.assigned_at)) === today;
      }).length
    };
  }

  function assignmentRules() {
    return (st().catalogOptions || []).filter(function (x) {
      return x.catalog_key === 'ASSIGNMENT_RULE' && x.active;
    }).map(function (x) {
      var m = x.metadata || {};
      return { id: x.option_id, unit_id: m.unit_id || x.unit_id || '', work_type_code: m.work_type_code || x.code || '',
        work_type_codes: Array.isArray(m.work_type_codes) ? m.work_type_codes : [],
        product_name: m.product_name || '', assignee_id: m.assignee_id || x.role_kind || '', priority: Number(m.priority || x.sort_order || 9999),
        auto_assign: !!m.auto_assign, priority_processing: !!m.priority_processing, label: x.label || '' };
    });
  }

  function assignmentRecommendation(item) {
    var r = reqOf(item), rules = assignmentRules(), unitId = r ? r.unit_id : '';
    var matched = rules.filter(function (x) {
      return D.ruleMatches(x, unitId, item);
    }).sort(function (a, b) {
      return D.ruleScore(b) - D.ruleScore(a) || a.priority - b.priority;
    });
    var candidates = matched.map(function (x) { return { user: U.byId(st().users, 'user_id', x.assignee_id), rule: x }; }).filter(function (x) { return D.userAvailable(x.user); });
    if (candidates.length) return { user: candidates[0].user, rule: candidates[0].rule };
    var replacement = matched.map(function (x) {
      var original = U.byId(st().users, 'user_id', x.assignee_id);
      var replacementId = original && original.replacement_user_id;
      return replacementId ? { user: U.byId(st().users, 'user_id', replacementId), rule: x, original: original } : null;
    }).filter(function (x) { return x && D.userAvailable(x.user); })[0];
    return replacement ? { user: replacement.user, rule: replacement.rule, replacementFor: replacement.original } : null;
  }

  /* ---------- Việc chính & việc kèm đi cùng một cán bộ (khớp followLinkedAssignment_ ở Code.gs) ---------- */

  var LINK_FOLLOW_STATUS = D.PRE_ASSIGN.concat(['DA_PHAN_CONG']);

  /** Các việc cùng nhóm (việc chính và mọi việc kèm), trừ chính nó; bỏ dòng đã chuyển kỳ. */
  function linkedGroup(item) {
    var rootId = item.parent_item_id || item.item_id;
    return st().items.filter(function (i) {
      return i.item_id !== item.item_id && !i.carried_to_item_id && !i.syncing && (i.item_id === rootId || i.parent_item_id === rootId);
    });
  }

  function linkFollowFree(i) {
    return LINK_FOLLOW_STATUS.indexOf(i.status) !== -1 && !i.dossier_received_at && !i.processing_started_at;
  }

  /** Cán bộ còn nhận việc được đang giữ một việc mở cùng nhóm; ưu tiên việc chính. */
  function linkedHolder(item) {
    return linkedGroup(item).filter(function (i) {
      return i.assigned_user_id && isOpenItem(i);
    }).sort(function (a, b) { return Number(!!a.parent_item_id) - Number(!!b.parent_item_id); }).map(function (i) {
      var user = U.byId(st().users, 'user_id', i.assigned_user_id);
      return D.userAvailable(user) ? { user: user, item: i } : null;
    }).filter(Boolean)[0] || null;
  }

  /**
   * Người nên nhận việc: ai đang giữ việc cùng nhóm thì người đó; chưa ai giữ thì theo quy tắc của việc chính,
   * rồi của chính việc này, rồi của việc kèm — để cả nhóm luôn về một người.
   */
  function pairRecommendation(item, reservations, planningContext) {
    var holder = linkedHolder(item);
    if (holder) return { user: holder.user, linkedItem: holder.item };
    var root = item.parent_item_id ? U.byId(st().items, 'item_id', item.parent_item_id) : null;
    var rootRec = root && D.PRE_ASSIGN.indexOf(root.status) !== -1 ? assignmentRecommendation(root) : null;
    var preferred = rootRec || assignmentRecommendation(item) || linkedGroup(item).filter(function (i) {
      return D.PRE_ASSIGN.indexOf(i.status) !== -1;
    }).map(assignmentRecommendation).filter(Boolean)[0] || null;
    if (preferred) return preferred;
    if (typeof LSPlanning === 'undefined') return null;
    var ranked = LSPlanning.rank(planningContext || LSPlanning.context(st(), D), item, reservations || {});
    return ranked.length ? {user:ranked[0].user, balanced:true, reasons:ranked[0].reasons} : null;
  }

  function recentCustomerProfile(request) {
    var customer = request && request.customer ? request.customer : request || {};
    return {
      cif: String(customer.cif || '').trim().toLowerCase().replace(/\s+/g, ''),
      phone: U.normalizePhone(customer.phone),
      name: String(customer.name || customer.customer_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    };
  }

  function sameRecentCustomer(a, b) {
    if (a.cif && b.cif) return a.cif === b.cif;
    if (a.phone && b.phone) return a.phone === b.phone;
    if (a.cif || b.cif || a.phone || b.phone) return false;
    return !!a.name && a.name === b.name;
  }

  /** Bản local dùng cùng cửa sổ hai tuần và quy tắc nhận diện như API GAS. */
  function recentAssigneesLocal(item) {
    var targetRequest = reqOf(item), target = recentCustomerProfile(targetRequest);
    if (!target.cif && !target.phone && !target.name) return [];
    var today = LSTiming.dayKey(new Date().toISOString()), monday = new Date(today + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7);
    var from = monday.toISOString().substring(0, 10), requests = st().requests, summaries = {};
    st().items.forEach(function (prior) {
      if (prior.item_id === item.item_id || prior.status !== 'HOAN_THANH_LS' || !prior.completed_at || prior.carried_to_item_id || !prior.assigned_user_id) return;
      var completed = new Date(prior.completed_at);
      if (!isFinite(completed.getTime())) return;
      var day = LSTiming.dayKey(completed.toISOString());
      if (day < from || day > today || !sameRecentCustomer(target, recentCustomerProfile(U.byId(requests, 'request_id', prior.request_id)))) return;
      var user = U.byId(st().users, 'user_id', prior.assigned_user_id);
      if (!user) return;
      var row = summaries[user.user_id] || (summaries[user.user_id] = { user_id: user.user_id, full_name: user.full_name, completed_count: 0, last_completed_at: '' });
      row.completed_count += 1;
      var completedAt = completed.toISOString();
      if (!row.last_completed_at || completedAt > row.last_completed_at) row.last_completed_at = completedAt;
    });
    return Object.keys(summaries).map(function (id) { return summaries[id]; }).sort(function (a, b) {
      return b.last_completed_at.localeCompare(a.last_completed_at) || b.completed_count - a.completed_count || a.full_name.localeCompare(b.full_name);
    });
  }

  function applyRecentAssigneeSuggestions(item, rec) {
    if (!canBatchAssign()) return;
    var lookup = U.isGas() ? LS.api.getRecentCustomerAssignees(item.item_id) : Promise.resolve(recentAssigneesLocal(item));
    lookup.then(function (suggestions) {
      var form = Array.prototype.slice.call(document.querySelectorAll('form[data-form="flow"]')).filter(function (candidate) {
        return candidate.getAttribute('data-id') === item.item_id;
      })[0];
      if (!form || !Array.isArray(suggestions)) return;
      var rows = Array.prototype.slice.call(form.querySelectorAll('[data-pick-assignee]'));
      var available = {};
      staffList().forEach(function (user) { available[user.user_id] = true; });
      var eligible = suggestions.filter(function (suggestion) { return available[suggestion.user_id]; });
      eligible.forEach(function (suggestion) {
        var row = rows.filter(function (candidate) {
          var radio = candidate.querySelector('input[name="assignee"]');
          return radio && radio.value === suggestion.user_id;
        })[0];
        if (!row) return;
        var cell = row.querySelector('.assignment-staff-cell'), radio = row.querySelector('input[name="assignee"]');
        if (cell && !cell.querySelector('[data-recent-customer-suggestion]')) {
          cell.insertAdjacentHTML('beforeend', '<div data-recent-customer-suggestion>' + ui.tag(
            'Đã hoàn thành ' + Number(suggestion.completed_count || 0) + ' việc với khách này · gần nhất ' + U.fmtDate(suggestion.last_completed_at), 'ok'
          ) + '</div>');
        }
      });
      var selected = form.querySelector('input[name="assignee"]:checked');
      if (!rec && !item.assigned_user_id && !selected && eligible.length) {
        var suggestedRow = rows.filter(function (candidate) {
          var radio = candidate.querySelector('input[name="assignee"]');
          return radio && radio.value === eligible[0].user_id;
        })[0];
        var suggestedRadio = suggestedRow && suggestedRow.querySelector('input[name="assignee"]');
        if (suggestedRadio) suggestedRadio.checked = true;
      }
    }).catch(function () { /* Gợi ý chỉ hỗ trợ; không làm gián đoạn việc giao. */ });
  }

  function linkedRole(i) { return i.parent_item_id ? 'việc kèm' : 'việc chính'; }

  /** Trong một lô, việc chính và việc kèm về cùng người: lấy người của việc chính, không có thì của dòng đầu nhóm. */
  function pairBatchEntries(entries) {
    var groupAssignee = {};
    entries.forEach(function (e) {
      var i = U.byId(st().items, 'item_id', e.item_id);
      if (!i || !e.assignee_id) return;
      var root = i.parent_item_id || i.item_id;
      if (!i.parent_item_id || !groupAssignee[root]) groupAssignee[root] = e.assignee_id;
    });
    return entries.map(function (e) {
      var i = U.byId(st().items, 'item_id', e.item_id), root = i ? (i.parent_item_id || i.item_id) : '';
      return root && groupAssignee[root] ? Object.assign({}, e, { assignee_id: groupAssignee[root] }) : e;
    });
  }

  /**
   * Giao tại chỗ các việc cùng nhóm còn rảnh cho `assigneeId` (màn hình đổi ngay, máy chủ làm cùng lúc giao).
   * Trả { snapshots, kept } để hoàn tác khi máy chủ từ chối và nhắc việc cùng nhóm đang do người khác làm.
   */
  function followLinkedLocal(item, assigneeId, ts, skip) {
    var snapshots = [], kept = [];
    linkedGroup(item).forEach(function (other) {
      if ((skip && skip[other.item_id]) || other.assigned_user_id === assigneeId) return;
      if (!linkFollowFree(other)) { if (other.assigned_user_id && isOpenItem(other)) kept.push(other); return; }
      snapshots.push({ item_id: other.item_id, data: JSON.parse(JSON.stringify(other)) });
      other.status = 'DA_PHAN_CONG'; other.assigned_user_id = assigneeId; other.assigned_by = st().session;
      other.assigned_at = ts; other.accepted_at = other.accepted_at || ts; other.first_assigned_at = other.first_assigned_at || ts;
      other.due_at = ''; other.execution_state = ''; other.version = Number(other.version || 0) + 1;
      D.applyClock(other, 'DA_PHAN_CONG', ts);
      if (!U.isGas()) logEvent(other.item_id, 'DA_PHAN_CONG', 'Giao cùng ' + linkedRole(item) + ' ' + itemRef(item));
      if (skip) skip[other.item_id] = true;
    });
    return { snapshots: snapshots, kept: kept };
  }

  function restoreSnapshots(snapshots) {
    (snapshots || []).forEach(function (s) {
      var live = U.byId(st().items, 'item_id', s.item_id);
      if (live) Object.keys(s.data).forEach(function (k) { live[k] = s.data[k]; });
    });
  }

  function keptLinkedWarning(kept) {
    if (!kept || !kept.length) return;
    ui.toast(kept.map(function (k) {
      return linkedRole(k).charAt(0).toUpperCase() + linkedRole(k).slice(1) + ' ' + itemRef(k) + ' đang do ' + (userName(k.assigned_user_id) || k.assigned_user_id) + ' xử lý';
    }).join('; ') + ' — đổi người riêng nếu cần.', 'warn');
  }

  /**
   * Việc Hoàn thành / Đã hủy không nằm trong danh sách làm việc: tra lại ở
   * Báo cáo, Nhật ký và Sheet kế hoạch (tab "Hồ sơ đã hủy").
   */
  function isOpenItem(i) { return !!(D.STATUS[i.status] && D.STATUS[i.status].open); }

  function canBatchAssign() {
    var u = me();
    return !!u && ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
  }

  // Tập hồ sơ của lô luôn đi theo chính bộ lọc đang dùng ở tab Chờ phân công.
  // Nhờ vậy quản lý có thể chọn một phòng, loại việc hay ngày trước khi mở lô,
  // thay vì phải lọc lại trong một hộp thoại khác.
  function batchAssignableItems() {
    var range = queueWindow();
    var rows = visibleItems().filter(function (i) {
      return D.PRE_ASSIGN.indexOf(i.status) !== -1 && withinQueueWindow(i, range);
    });
    rows = applyFilters('queue', rows);
    var unitId = f('queue', 'qunit', '');
    if (unitId) rows = rows.filter(function (i) { var r = reqOf(i); return r && r.unit_id === unitId; });
    return queuePriority(sortItems(rows, 'queue'));
  }

  function openBatchAssign() {
    if (!canBatchAssign()) { ui.toast('Bạn không có quyền phân công nhanh.', 'err'); return; }
    var items = batchAssignableItems(), staff = staffList();
    if (!items.length) { ui.toast('Không có hồ sơ chờ phân công theo bộ lọc hiện tại.', 'warn'); return; }
    if (!staff.length) { ui.toast('Chưa có cán bộ LS đang hoạt động.', 'err'); return; }

    var reserved = {}, groups = {}, recommendations = {};
    var planningContext = typeof LSPlanning !== 'undefined' ? LSPlanning.context(st(), D) : null;
    var rows = items.map(function (item) {
      var root = item.parent_item_id || item.item_id;
      var rec = groups[root] || pairRecommendation(item, reserved, planningContext), request = reqOf(item), load = rec ? staffLoad(rec.user.user_id) : null;
      if (rec) { groups[root] = rec; reserved[rec.user.user_id] = (reserved[rec.user.user_id] || 0) + 1; recommendations[item.item_id] = rec; }
      var suggestion = rec
        ? '<div class="t2">' + (rec.linkedItem ? 'Cùng ' + linkedRole(rec.linkedItem) + ' ' + U.esc(itemRef(rec.linkedItem)) + ': ' : 'Ưu tiên: ') +
          U.esc(rec.user.full_name) + ' · đang mở ' + load.open + ' việc' +
          (rec.replacementFor ? ' · thay ' + U.esc(rec.replacementFor.full_name) : '') +
          (rec.reasons ? ' · ' + U.esc(rec.reasons.join(' · ')) : '') + '</div>'
        : '<div class="t2">Chưa có quy tắc ưu tiên — chọn cán bộ trước khi giao.</div>';
      return {
        cells: [
          '<input type="checkbox" data-batch-include data-item-id="' + U.attr(item.item_id) + '"' + (rec ? ' checked' : '') +
            ' aria-label="Chọn ' + U.attr(itemRef(item)) + '">',
          '<div class="tid">' + U.esc(itemRef(item)) + '</div><div class="t1">' + U.esc((request && request.customer.name) || '') + '</div>' +
          '<div class="t2">' + U.esc(unitName(request && request.unit_id)) + ' · ' + U.esc(productLabel(item)) + '</div>',
          '<label class="batch-priority"><input type="checkbox" data-batch-priority data-item-id="' + U.attr(item.item_id) + '"' +
            ((item.is_priority || (rec && rec.rule && rec.rule.priority_processing)) ? ' checked' : '') + '> Ưu tiên LS</label>',
          ui.select('batch_assignee_' + item.item_id, staff.map(function (user) {
            var userLoad = staffLoad(user.user_id);
            return [user.user_id, user.full_name + ' — đang mở ' + userLoad.open + ' việc'];
          }), rec ? rec.user.user_id : '', { blank: 'Chọn cán bộ', attrs: ' data-batch-assignee data-item-id="' + U.attr(item.item_id) + '" data-version="' + U.attr(item.version) + '"' }) + suggestion
        ]
      };
    });

    var selected = Object.keys(recommendations).length;
    ui.openDialog('Phân công nhanh',
      '<div class="batch-assign-summary">' + items.length + ' hồ sơ · ' + selected + ' có gợi ý' +
        (items.length - selected ? ' · ' + (items.length - selected) + ' chưa có gợi ý' : '') + '</div>' +
      ui.table([{ label: 'Giao', cls: 'fit' }, { label: 'Hồ sơ' }, { label: 'Ưu tiên', cls: 'fit' }, { label: 'Cán bộ xử lý' }], rows) +
      '<div class="form-end">' +
        ui.btn('Cấu hình phân công nhanh', { kind: 'quiet', act: 'queue-view', icon: 'sliders', data: ' data-view="rules"' }) +
        ui.btn('Giao các hồ sơ đã chọn', { kind: 'primary', act: 'batch-assign-submit', icon: 'check' }) + '</div>',
      { sub: items.length + ' hồ sơ chờ phân công', size: 'lg' });
  }

  function submitBatchAssign() {
    var dialog = document.getElementById('dialog');
    if (!dialog) return;
    var entries = Array.prototype.slice.call(dialog.querySelectorAll('[data-batch-include]:checked')).map(function (box) {
      var itemId = box.getAttribute('data-item-id');
      var select = dialog.querySelector('[data-batch-assignee][data-item-id="' + itemId + '"]');
      var priority = dialog.querySelector('[data-batch-priority][data-item-id="' + itemId + '"]');
      return { item_id: itemId, assignee_id: select ? select.value : '', expected_version: select ? Number(select.getAttribute('data-version')) : NaN,
        is_priority: !!(priority && priority.checked) };
    });
    if (!entries.length) { ui.toast('Chọn ít nhất một hồ sơ để giao.', 'warn'); return; }
    var missing = entries.filter(function (entry) { return !entry.assignee_id || isNaN(entry.expected_version); });
    if (missing.length) { ui.toast('Mỗi hồ sơ được chọn phải có cán bộ nhận việc.', 'err'); return; }
    runBatchAssign(entries);
  }

  /* ---------- Chọn nhiều dòng ngay trên danh sách để phân công ---------- */

  var ASSIGNABLE_STATUS = D.PRE_ASSIGN;
  // Đang nằm ở phía cán bộ LS (kể cả mã cũ Đã soạn xong / Chờ KS duyệt còn sót lại).
  var IN_PROGRESS_STATUS = ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DANG_HEN_KH', 'TAM_DUNG', 'DA_SOAN_XONG', 'CHO_KS_DUYET'];
  // Hàng chờ của kiểm soát = mọi hồ sơ chưa có cán bộ, kể cả hồ sơ đang trả
  // phòng bổ sung (hiện nhãn "Chưa giao hồ sơ", không tích chọn giao được).
  // Hồ sơ tự trả do chưa giao nằm ở người đề nghị và Quản lý hồ sơ đến khi gửi lại.
  var UNASSIGNED_STATUS = ASSIGNABLE_STATUS.concat(['CAN_BO_SUNG']);
  var picked = {};
  var pickScope = [];

  function pickable(i) {
    return canBatchAssign() && !i.syncing && ASSIGNABLE_STATUS.indexOf(i.status) !== -1;
  }
  function pickedItems() {
    return st().items.filter(function (i) { return picked[i.item_id] && pickable(i); });
  }

  /** Thanh thao tác hàng loạt: hiện khi đã tích ít nhất một dòng. */
  function bulkAssignBar() {
    if (!canBatchAssign()) return '';
    var staff = staffList();
    var options = [['__rule', 'Theo gợi ý: quy tắc và cân tải']].concat(staff.map(function (user) {
      return [user.user_id, user.full_name + ' — đang mở ' + staffLoad(user.user_id).open + ' việc'];
    }));
    var count = pickedItems().length;
    return '<div class="bulk-bar' + (count ? ' is-on' : '') + '" id="bulk-bar" role="region" aria-label="Phân công các hồ sơ đã chọn">' +
      '<b id="bulk-count">Đã chọn ' + count + ' hồ sơ</b>' +
      ui.select('bulk_assignee', options, '', { blank: 'Chọn cán bộ nhận việc', attrs: ' id="bulk-assignee" aria-label="Cán bộ nhận việc"' }) +
      '<label class="batch-priority"><input type="checkbox" id="bulk-priority"> Ưu tiên LS</label>' +
      ui.btn('Phân công', { kind: 'primary', sm: true, act: 'bulk-assign', icon: 'check' }) +
      ui.btn('Bỏ chọn', { kind: 'quiet', sm: true, act: 'bulk-clear' }) +
      '</div>';
  }

  function refreshBulkBar() {
    var count = pickedItems().length;
    var bar = document.getElementById('bulk-bar');
    if (bar) bar.classList.toggle('is-on', count > 0);
    var label = document.getElementById('bulk-count');
    if (label) label.textContent = 'Đã chọn ' + count + ' hồ sơ';
    var all = document.querySelector('[data-act="pick-all"]');
    if (all) {
      var inScope = pickScope.filter(function (id) { return picked[id]; }).length;
      all.checked = pickScope.length > 0 && inScope === pickScope.length;
      all.indeterminate = inScope > 0 && inScope < pickScope.length;
    }
  }

  function togglePick(itemId, on) {
    if (on) picked[itemId] = true; else delete picked[itemId];
    refreshBulkBar();
  }

  function togglePickAll(on) {
    pickScope.forEach(function (id) { if (on) picked[id] = true; else delete picked[id]; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="pick-row"]'), function (box) {
      if (pickScope.indexOf(box.getAttribute('data-id')) !== -1) box.checked = !!on;
    });
    refreshBulkBar();
  }

  function clearPicks() {
    picked = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="pick-row"]'), function (box) { box.checked = false; });
    refreshBulkBar();
  }

  function submitBulkAssign() {
    var items = pickedItems();
    if (!items.length) { ui.toast('Tích chọn ít nhất một hồ sơ.', 'warn'); return; }
    if (items.length > 100) { ui.toast('Mỗi lần chỉ phân công tối đa 100 hồ sơ.', 'err'); return; }
    var sel = document.getElementById('bulk-assignee'), who = sel ? sel.value : '';
    var priorityBox = document.getElementById('bulk-priority'), forcePriority = !!(priorityBox && priorityBox.checked);
    if (!who) { ui.toast('Chọn cán bộ nhận việc hoặc "Theo gợi ý".', 'err'); return; }
    var noRule = [], reservations = {}, groupSuggestions = {};
    var planningContext = typeof LSPlanning !== 'undefined' ? LSPlanning.context(st(), D) : null;
    var entries = items.map(function (i) {
      var root = i.parent_item_id || i.item_id;
      var rec = who === '__rule' ? (groupSuggestions[root] || pairRecommendation(i, reservations, planningContext)) : null;
      if (rec) { groupSuggestions[root] = rec; reservations[rec.user.user_id] = (reservations[rec.user.user_id] || 0) + 1; }
      if (who === '__rule' && !rec) noRule.push(itemRef(i));
      return { item_id: i.item_id, assignee_id: who === '__rule' ? (rec ? rec.user.user_id : '') : who,
        expected_version: Number(i.version),
        is_priority: forcePriority || !!i.is_priority || !!(rec && rec.rule && rec.rule.priority_processing) };
    });
    if (noRule.length) {
      ui.toast('Chưa có quy tắc phù hợp cho: ' + noRule.slice(0, 5).join(', ') + (noRule.length > 5 ? '…' : '') + '. Chọn cán bộ cụ thể cho các hồ sơ này.', 'err');
      return;
    }
    picked = {};
    runBatchAssign(entries);
  }

  /** Ghi phân công cho nhiều hồ sơ: cập nhật màn hình ngay, máy chủ nhận theo hàng chờ. */
  function runBatchAssign(entries) {
    entries = pairBatchEntries(entries);
    var before = entries.map(function (entry) {
      var item = U.byId(st().items, 'item_id', entry.item_id);
      return item ? { item_id: item.item_id, data: JSON.parse(JSON.stringify(item)) } : null;
    }).filter(Boolean);
    var ts = U.now();
    entries.forEach(function (entry) {
      var item = U.byId(st().items, 'item_id', entry.item_id);
      if (!item) return;
      item.status = 'DA_PHAN_CONG'; item.assigned_user_id = entry.assignee_id; item.assigned_by = st().session;
      item.assigned_at = ts; item.accepted_at = item.accepted_at || ts;
      item.due_at = item.dossier_received_at ? D.dueFrom(item.dossier_received_at, item.work_type_code, st()) : '';
      item.is_priority = entry.is_priority;
      item.version = Number(item.version || 0) + 1; D.applyClock(item, 'DA_PHAN_CONG', ts);
    });
    // Việc cùng nhóm nằm ngoài lô đi theo người vừa nhận.
    var inBatch = {}, linkedSnapshots = [], linkedKept = [];
    entries.forEach(function (entry) { inBatch[entry.item_id] = true; });
    entries.forEach(function (entry) {
      var item = U.byId(st().items, 'item_id', entry.item_id);
      if (!item) return;
      var follow = followLinkedLocal(item, entry.assignee_id, ts, inBatch);
      linkedSnapshots = linkedSnapshots.concat(follow.snapshots); linkedKept = linkedKept.concat(follow.kept);
    });
    ui.closeDialog();
    keptLinkedWarning(linkedKept);

    if (!U.isGas()) {
      entries.forEach(function (entry) { logEvent(entry.item_id, 'DA_PHAN_CONG', 'Giao theo lô'); });
      U.save(); LS.app.render(); ui.toast('Đã phân công ' + entries.length + ' hồ sơ.', 'ok'); return;
    }

    // Coi như đã xong: màn hình đổi ngay và báo xong; máy chủ nhận lần lượt ở nền, chỉ báo lại nếu bị từ chối.
    LS.app.render();
    ui.toast('Đã phân công ' + entries.length + ' hồ sơ.', 'ok');
    LS.app.background(LS.api.assignWorkItemsBatch(entries), {
      label: 'Phân công nhanh',
      onOk: function (result) {
        (result.items || []).forEach(function (remote) {
          var item = U.byId(st().items, 'item_id', remote.item_id);
          if (!item) return;
          Object.keys(remote).forEach(function (key) { item[key] = remote[key]; });
        });
        applyFocusUpdates(result.linked_updates);
        if (!ui.dialogOpen()) LS.app.render();
      },
      rollback: function () {
        restoreSnapshots(linkedSnapshots);
        before.forEach(function (snapshot) {
          var item = U.byId(st().items, 'item_id', snapshot.item_id);
          if (item) Object.keys(snapshot.data).forEach(function (key) { item[key] = snapshot.data[key]; });
        });
      }
    });
  }

  /* ============================ Quyền thao tác ============================ */

  function actionsFor(item) {
    var u = me();
    if (!u) return [];
    // Dòng đang chờ máy chủ cấp mã: chưa thao tác được gì lên nó.
    if (item.syncing) return [];
    var r = reqOf(item), wt = wtOf(item);
    var actions = (D.FLOW[item.status] || []).filter(function (tr) {
      if (tr.roles.indexOf(u.role) === -1) return false;
      if (u.role === 'CAN_BO_LS' && item.assigned_user_id !== u.user_id) return false;
      if(u.role==='CAN_BO_LS' && ['QUEUED','WAITING'].indexOf(LSTiming.workState(item))!==-1 &&
          ['DANG_HEN_KH','DA_SOAN_XONG','CHO_KS_DUYET','HOAN_THANH_LS'].indexOf(tr.to)!==-1)return false;
      if (u.role === 'PHONG_PGD' && (!r || r.unit_id !== u.unit_id)) return false;
      if (['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(item.status) !== -1 && tr.to === 'CHO_PHAN_CONG' && !requestedByMe(item)) return false;
      if (u.role === 'PHONG_PGD' && tr.to === 'TAM_DUNG' && !requestedByMe(item)) return false;
      if (u.role === 'PHONG_PGD' && item.status === 'TAM_DUNG' && !requestedByMe(item)) return false;
      // Loại việc cần khách ký thì phải đi qua bước hẹn; cờ này trước đây gắn vào
      // `tr.skipIfAppointment` — một thuộc tính không transition nào khai báo, nên
      // luật "không cho hoàn thành thẳng" chưa bao giờ chạy.
      if (tr.to === 'HOAN_THANH_LS' && wt && wt.needs_appointment && !item.appointment) return false;

      return true;
    });
    // Hủy trực tiếp: cán bộ được giao hoặc chính đơn vị gửi có thể hủy hồ sơ còn mở.
    // Không tạo yêu cầu chờ KS/Quản lý duyệt.
    var open = D.STATUS[item.status] && D.STATUS[item.status].open;
    var canCancel = open && ((u.role === 'CAN_BO_LS' && item.assigned_user_id === u.user_id) ||
      (u.role === 'PHONG_PGD' && r && r.unit_id === u.unit_id));
    if (canCancel && !actions.some(function (tr) { return tr.to === 'HUY'; })) {
      actions.push({ to: 'HUY', label: 'Hủy việc', short: 'Hủy', roles: [u.role], reason: 'HUY', rank: 9 });
    }
    return actions;
  }

  /** Phòng/PGD thao tác trên hồ sơ đã giao cho LS: không được nhập ghi chú tự do vào hồ sơ. */
  function requesterLocked(item) {
    var u = me();
    return !!(u && u.role === 'PHONG_PGD' && item && item.assigned_user_id);
  }

  function canEdit(item) {
    var u = me();
    if (!u || item.status === 'HUY' || item.status === 'HOAN_THANH_LS') return false;
    if (u.role === 'KS_LS' || u.role === 'QUAN_LY_LS') return true;
    var r = reqOf(item);
    return u.role === 'PHONG_PGD' && r && r.unit_id === u.unit_id;
  }

  function canChangeDueDate(item) {
    var u = me(), r = reqOf(item);
    if (!u || item.syncing || item.carried_to_item_id || !item.due_at || !item.dossier_received_at ||
        !D.STATUS[item.status] || !D.STATUS[item.status].open) return false;
    if (u.role === 'CAN_BO_LS') return item.assigned_user_id === u.user_id;
    return u.role === 'PHONG_PGD' && r && r.unit_id === u.unit_id && requestedByMe(item);
  }

  /* ---------- Hủy việc trực tiếp ---------- */

  function cancelPending(item) { return !!(item && item.pending && item.pending.kind === 'CANCEL'); }

  /** Tương thích giao diện cũ; hồ sơ đủ quyền nay đã có thao tác Hủy trực tiếp. */
  function canRequestCancel(item) {
    var u = me();
    if (!u || item.syncing || item.pending || !D.STATUS[item.status] || !D.STATUS[item.status].open) return false;
    if (['CAN_BO_LS', 'PHONG_PGD'].indexOf(u.role) === -1) return false;
    if (actionsFor(item).some(function (a) { return a.to === 'HUY'; })) return false;
    if (u.role === 'CAN_BO_LS') return item.assigned_user_id === u.user_id;
    var r = reqOf(item);
    return !!(r && r.unit_id === u.unit_id);
  }

  function requestCancel(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canRequestCancel(i)) { ui.toast('Không gửi được đề nghị hủy cho hồ sơ này. Hãy tải lại danh sách.', 'err'); return; }
    var list = st().reasons.filter(function (x) { return x.group === 'HUY' && x.active; });
    ui.openDialog('Hủy việc',
      '<form data-form="cancel-request">' +
      '<input type="hidden" name="item_id" value="' + U.attr(i.item_id) + '">' +
      '<input type="hidden" name="version" value="' + U.attr(i.version) + '">' +
      (requesterLocked(i)
        ? ui.field('Lý do', ui.select('reason_code', list.map(function (x) { return [x.code, x.label]; }), '', { blank: 'Chọn lý do', attrs: ' required' }))
        : ui.field('Lý do', ui.select('reason_code', list.map(function (x) { return [x.code, x.label]; }), '', { blank: 'Lý do khác…' })) +
          ui.field('Diễn giải thêm', ui.textarea('reason', '', { placeholder: 'Ví dụ: tạo nhầm, khách không còn nhu cầu…' }), 'bắt buộc nếu chọn lý do khác')) +
      ui.formEnd('Hủy việc', { danger: true }) + '</form>',
      { sub: itemRef(i) + ' · ' + productLabel(i) });
  }

  function submitCancelRequest(form) {
    var d = new FormData(form), itemId = String(d.get('item_id') || ''), i = U.byId(st().items, 'item_id', itemId);
    if (!i) return;
    var code = String(d.get('reason_code') || ''), note = requesterLocked(i) ? '' : String(d.get('reason') || '').trim();
    var pickedReason = code ? U.byId(st().reasons, 'code', code) : null;
    if (!pickedReason && !note) { ui.toast('Chọn lý do hoặc ghi diễn giải.', 'err'); return; }
    var reason = (pickedReason ? pickedReason.label : '') + (note ? (pickedReason ? ' — ' : '') + note : '');
    var previousStatus = i.status, previousPending = i.pending || null, previousVersion = Number(i.version || 1);
    var expectedVersion = Number(d.get('version'));
    i.status = 'HUY'; i.pending = null; i.version = previousVersion + 1;
    if (!U.isGas()) {
      logEvent(i.item_id, 'HUY', reason);
      U.save(); ui.closeDialog(); LS.app.render(); ui.toast('Đã hủy việc.', 'ok'); return;
    }
    ui.closeDialog(); LS.app.render(); ui.toast('Đã hủy việc.', 'ok');
    LS.app.background(LS.api.requestCancel(itemId, reason, expectedVersion), {
      label: 'Hủy việc',
      onOk: function (result) {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live) {
          live.status = result && result.status || 'HUY';
          live.pending = null;
          if (result && result.version) live.version = Math.max(Number(live.version) || 0, Number(result.version) || 0);
          live.syncing = false;
        }
      },
      rollback: function () {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live) { live.status = previousStatus; live.pending = previousPending; live.version = previousVersion; }
      }
    });
  }

  /** Kiểm soát duyệt đề nghị hủy = Hủy việc, lý do điền sẵn từ đề nghị. */
  function approveCancel(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !cancelPending(i)) return;
    flow(itemId, 'HUY');
    var box = document.querySelector('#dialog textarea[name="reason"]');
    if (box) box.value = 'Duyệt đề nghị hủy của ' + userName(i.pending.by) + ': ' + (i.pending.reason || '');
  }

  /**
   * Phòng/PGD sửa hồ sơ đã giao thì chờ Kiểm soát duyệt — trừ khi chỉ đổi ngày phát sinh (khách đổi ngày ký):
   * thay đổi đó ghi nhận ngay. Khớp proposeRevision ở Code.gs.
   */
  function editNeedsApproval(item, changes) {
    var u = me();
    if (changes && Object.keys(changes).length && Object.keys(changes).every(function (k) { return k === 'occurrence_date'; })) return false;
    return u && u.role === 'PHONG_PGD' && (item.assigned_user_id ||
      D.PRE_ASSIGN.concat(['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO']).indexOf(item.status) === -1);
  }

  /** Đổi ngày phát sinh: việc chính / việc kèm còn mở đang cùng ngày cũ dời theo (khớp proposeRevision). */
  function moveLinkedDate(item, oldDate, newDate) {
    var snaps = [];
    linkedGroup(item).forEach(function (other) {
      if (!isOpenItem(other) || String(other.occurrence_date || '') !== String(oldDate || '')) return;
      snaps.push({ item_id: other.item_id, data: JSON.parse(JSON.stringify(other)) });
      other.occurrence_date = newDate; other.version = Number(other.version || 0) + 1;
      if (!U.isGas()) logEvent(other.item_id, 'SUA_THONG_TIN', 'Dời ngày theo ' + linkedRole(item) + ' ' + itemRef(item));
    });
    return snaps;
  }

  function logEvent(itemId, type, reason) {
    st().events.unshift({
      event_id: U.uid('EVT'), item_id: itemId, type: type,
      by: st().session, at: U.now(), reason: reason || ''
    });
  }

  /* ============================ Bộ lọc ============================ */

  function f(screen, key, def) {
    if (!filters[screen]) filters[screen] = {};
    if (filters[screen][key] === undefined) filters[screen][key] = def;
    return filters[screen][key];
  }

  function setFilter(screen, key, val) {
    if (!filters[screen]) filters[screen] = {};
    filters[screen][key] = val;
  }

  function resetFilters() {
    filters = {}; filterDraft = null;
    timeReportCache = null; personalTimeCache = null; reportCache = null; teamCache = null; teamSequence++;
    timingAuditCache = null; activityCache = null; auditCache = null;
    timingAuditSequence++; activitySequence++; auditSequence++;
    timeReportSequence++; reportSequence++;
  }
  function resetFilter(screen) {
    delete filters[screen];
    filterDraft = null;
    ui.closeDialog();
    LS.app.render();
  }

  function setDraftFilter(screen, key, value) {
    if (!filterDraft || filterDraft.screen !== screen) filterDraft = { screen: screen, values: {} };
    filterDraft.values[key] = value;
  }

  /**
   * Gộp bản nháp vào bộ lọc đang dùng.
   * Gán đè cả object sẽ xóa mất những khóa không nằm trong biểu mẫu —
   * ví dụ chọn "Khoảng ngày" rồi nhập ngày thì kỳ đã chọn biến mất.
   */
  function mergeDraft(screen) {
    if (!filterDraft || filterDraft.screen !== screen) return;
    if (!filters[screen]) filters[screen] = {};
    Object.keys(filterDraft.values).forEach(function (k) {
      filters[screen][k] = filterDraft.values[k];
    });
    filterDraft = null;
  }

  function applyFilter(screen) {
    mergeDraft(screen);
    setFilter(screen, 'page', 1);
    ui.closeDialog();
    LS.app.render();
  }

  function applyReportFilter() {
    mergeDraft('board');
    LS.app.render();
  }

  function filterCount(screen, opts) {
    var keys = ['q', 'status', 'type', 'unit', 'staff', 'from', 'to'];
    return keys.filter(function (key) { return opts[key] && String(f(screen, key, '')).trim(); }).length;
  }

  function filterValue(screen, key, fallback) {
    return filterDraft && filterDraft.screen === screen && filterDraft.values[key] !== undefined
      ? filterDraft.values[key] : f(screen, key, fallback);
  }

  function draftAttrs(screen, key) {
    return ' data-draft-filter="' + U.attr(key) + '" data-filter-screen="' + U.attr(screen) + '"';
  }

  function filterFields(screen, opts) {
    var out = [];
    if (opts.dates) {
      // Không khóa mốc hôm nay: Phòng/PGD cần lùi về ngày cũ để xem lại hồ sơ và kết quả đã qua.
      var dateDefaults = screen === 'room-board' ? roomBoardRange() : { from: U.localDate(), to: U.localDate() };
      out.push('<div class="f-row">' + ui.field('Từ ngày', ui.input('', filterValue(screen, 'from', dateDefaults.from), { type: 'date', attrs: draftAttrs(screen, 'from') })) +
        ui.field('Đến ngày', ui.input('', filterValue(screen, 'to', dateDefaults.to), { type: 'date', attrs: draftAttrs(screen, 'to') })) + '</div>');
    }
    if (opts.status) out.push(ui.field('Trạng thái', ui.select('', Object.keys(D.STATUS).filter(function (k) { return D.STATUS[k].open; }).map(function (k) { return [k, D.STATUS[k].label]; }), filterValue(screen, 'status', ''), { blank: 'Tất cả trạng thái', attrs: draftAttrs(screen, 'status') })));
    if (opts.type) out.push(ui.field('Loại việc / sản phẩm', ui.select('', st().workTypes.map(function (w) { return [w.code, wtLabel(w)]; }), filterValue(screen, 'type', ''), { blank: 'Tất cả loại việc', attrs: draftAttrs(screen, 'type') })));
    if (opts.unit) out.push(ui.field('Đơn vị', ui.select('', st().units.filter(function (x) { return x.kind === 'PGD'; }).map(function (x) { return [x.unit_id, x.name]; }), filterValue(screen, 'unit', ''), { blank: 'Tất cả đơn vị', attrs: draftAttrs(screen, 'unit') })));
    if (opts.staff) out.push(ui.field('Cán bộ xử lý', ui.select('', staffList().map(function (x) { return [x.user_id, x.full_name]; }), filterValue(screen, 'staff', ''), { blank: 'Tất cả cán bộ', attrs: draftAttrs(screen, 'staff') })));
    return out.join('');
  }

  function filterOptions(screen) {
    // Hàng chờ chỉ có hồ sơ chưa giao nên không lọc theo cán bộ; Quản lý hồ sơ lọc cán bộ và loại việc,
    // còn trạng thái và phòng đã có tab và chip riêng.
    return screen === 'queue' ? { status: true, type: true } :
      screen === 'tracking' ? { type: true, staff: true } :
      screen === 'room' || screen === 'room-board' ? { status: true, type: true, staff: true, dates: true } :
      screen === 'work' ? { status: true, type: true, unit: me() && me().role !== 'PHONG_PGD', staff: me() && me().role !== 'PHONG_PGD' } :
      { status: true, type: true };
  }

  function filterBar(screen, opts) {
    var count = filterCount(screen, opts);
    return '<div class="filter-tools"><button class="btn btn-quiet btn-icon filter-trigger" data-act="open-filter" data-screen="' + U.attr(screen) + '" aria-label="Bộ lọc" title="Bộ lọc">' +
      U.icon('filter', 17) + (count ? '<span class="filter-count">' + count + '</span>' : '') + '</button></div>';
  }

  function listSearch(screen, placeholder) {
    // id cố định để sau khi vẽ lại còn tìm đúng ô mà trả con trỏ về chỗ cũ.
    return '<div class="search list-search"><span aria-hidden="true">' + U.icon('search', 16) + '</span>' +
      '<input class="input" id="fq-' + U.attr(screen) + '" data-filter-screen="' + U.attr(screen) + '" data-filter="q" value="' +
      U.attr(f(screen, 'q', '')) + '" placeholder="' + U.attr(placeholder || 'Khách hàng, CIF, mã việc, sản phẩm') +
      '" aria-label="Tìm kiếm" autocomplete="off"></div>';
  }

  function listToolbar(screen, opts, withSort) {
    return '<div class="list-toolbar">' + listSearch(screen) + filterBar(screen, opts) + (withSort ? sortControl(screen) : '') + '</div>';
  }

  function openFilter(screen) {
    var opts = filterOptions(screen);
    filterDraft = { screen: screen, values: Object.assign({}, filters[screen] || {}) };
    ui.openDialog('Bộ lọc', filterFields(screen, opts) + '<div class="form-end"><button type="button" class="btn btn-quiet" data-act="reset-filter" data-screen="' + U.attr(screen) + '">Xóa lọc</button><button type="button" class="btn btn-primary" data-act="apply-filter" data-screen="' + U.attr(screen) + '">Áp dụng</button></div>', { size: 'md' });
  }

  function applyFilters(screen, list) {
    var q = String(f(screen, 'q', '')).trim().toLowerCase();
    var s = f(screen, 'status', ''), t = f(screen, 'type', ''),
      un = f(screen, 'unit', ''), stf = f(screen, 'staff', '');

    return list.filter(function (i) {
      var r = reqOf(i);
      if (s === '__open' && !D.STATUS[i.status].open) return false;
      if (s && s !== '__open' && i.status !== s) return false;
      if (t && i.work_type_code !== t) return false;
      if (un && (!r || r.unit_id !== un)) return false;
      if (stf && i.assigned_user_id !== stf) return false;
      if (q) {
        var hay = [i.item_id, i.product_name, wtName(i.work_type_code),
          r ? r.customer.name : '', r ? r.customer.cif : '',
          r ? (r.requestor && r.requestor.name || userName(r.created_by)) : '', userName(i.assigned_user_id)].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortOptions(screen) {
    return [['newest', 'Mới nhất'], ['oldest', 'Cũ nhất'], ['due', 'Hạn xử lý gần'], ['customer', 'Tên khách hàng'], ['staff', 'Cán bộ xử lý'], ['status', 'Trạng thái']];
  }

  function sortState(screen) {
    var selected = f(screen, 'sort', 'newest');
    var key = selected, dir = f(screen, 'sortDir', '');
    if (selected === 'newest') { key = 'date'; dir = 'desc'; }
    else if (selected === 'oldest') { key = 'date'; dir = 'asc'; }
    else if (selected === 'due') { key = 'due'; dir = dir || 'asc'; }
    else if (!dir) dir = 'asc';
    return { key: key, dir: dir };
  }

  function toggleSort(screen, key) {
    var current = sortState(screen), dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
    setFilter(screen, 'sort', key === 'date' ? (dir === 'asc' ? 'oldest' : 'newest') : key);
    setFilter(screen, 'sortDir', dir);
  }

  function sortHeader(screen, key, label) {
    var state = sortState(screen), active = state.key === key;
    var arrow = active ? (state.dir === 'asc' ? '↑' : '↓') : '↕';
    return '<button type="button" class="th-sort' + (active ? ' is-active' : '') + '" data-act="sort-column" data-screen="' + U.attr(screen) + '" data-sort="' + U.attr(key) + '" aria-label="Sắp xếp theo ' + U.attr(label) + '" aria-sort="' + (active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><span>' + U.esc(label) + '</span><span class="sort-indicator" aria-hidden="true">' + arrow + '</span></button>';
  }

  function sortControl(screen) {
    return '<div class="sort-control"><span class="sort-label">Sắp xếp</span>' +
      ui.select('', sortOptions(screen), f(screen, 'sort', 'newest'), { attrs: ' data-filter-screen="' + U.attr(screen) + '" data-filter="sort" aria-label="Sắp xếp danh sách"' }) + '</div>';
  }

  function sortItems(list, screen) {
    var key = f(screen, 'sort', 'newest');
    var rank = {};
    list.forEach(function (i) { rank[i.item_id] = priorityRank(i); });
    return list.slice().sort(function (a, b) {
      // Khách Gấp / VIP / Ưu tiên LS luôn nổi lên đầu danh sách, rồi mới tới cột sắp xếp đang chọn.
      var pr = rank[a.item_id] - rank[b.item_id];
      if (pr) return pr;
      var ar = reqOf(a), br = reqOf(b), av, bv;
      var state = sortState(screen);
      key = state.key;
      var dir = state.dir;
      function compare(x, y) {
        var n = x < y ? -1 : (x > y ? 1 : 0);
        return (dir === 'desc' ? -n : n);
      }
      if (key === 'customer') {
        av = ar && ar.customer ? ar.customer.name || '' : ''; bv = br && br.customer ? br.customer.name || '' : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'requestor') {
        av = ar ? (ar.requestor && ar.requestor.name || userName(ar.created_by) || '') : '';
        bv = br ? (br.requestor && br.requestor.name || userName(br.created_by) || '') : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'contact') {
        av = ar && ar.customer ? (ar.customer.phone || '') + ' ' + (ar.customer.email || '') : '';
        bv = br && br.customer ? (br.customer.phone || '') + ' ' + (br.customer.email || '') : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'unit') {
        av = ar ? unitName(ar.unit_id) : ''; bv = br ? unitName(br.unit_id) : '';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'work') {
        av = wtName(a.work_type_code); bv = wtName(b.work_type_code);
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'code') {
        return compare(String(itemRef(a)), String(itemRef(b)));
      }
      if (key === 'staff') {
        av = userName(a.assigned_user_id) || 'Chưa giao'; bv = userName(b.assigned_user_id) || 'Chưa giao';
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'status') {
        av = D.STATUS[a.status] ? D.STATUS[a.status].label : a.status; bv = D.STATUS[b.status] ? D.STATUS[b.status].label : b.status;
        return compare(av.localeCompare(bv, 'vi'), 0) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'due' || key === 'sla') {
        av = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER; bv = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return compare(av, bv) || String(a.item_id).localeCompare(String(b.item_id));
      }
      if (key === 'date') {
        av = new Date(a.occurrence_date || a.submitted_at || 0).getTime(); bv = new Date(b.occurrence_date || b.submitted_at || 0).getTime();
        return compare(av, bv) || String(a.item_id).localeCompare(String(b.item_id));
      }
      return String(a.item_id).localeCompare(String(b.item_id));
    });
  }

  /* ============================ Bảng việc ============================ */

  // mobile:false — cột vẫn đủ trên bảng desktop, nhưng ẩn khỏi thẻ trên mobile:
  // màn hẹp chỉ cần khách hàng/CIF, trạng thái, cán bộ xử lý là đủ để lướt danh sách,
  // các chi tiết khác xem trong "Xem chi tiết".
  var COLS = {
    pick: { label: 'Chọn', cls: 'fit pick-col' },
    code: { label: 'Mã việc', cls: 'fit', mobile: false },
    customer: { label: 'Khách hàng' },
    requestor: { label: 'Cán bộ đề nghị', mobile: false },
    contact: { label: 'Liên hệ', mobile: false },
    unit: { label: 'Đơn vị', mobile: false },
    work: { label: 'Loại việc / sản phẩm', mobile: false },
    date: { label: 'Ngày phát sinh', cls: 'fit', mobile: false },
    status: { label: 'Trạng thái', cls: 'fit' },
    staff: { label: 'Cán bộ' },
    progress: { label: 'Tiến độ', cls: 'fit', mobile: false },
    sla: { label: 'Hạn xử lý', cls: 'fit', mobile: false },
    time: { label: 'Giờ xử lý KH', cls: 'fit', mobile: false },
    act: { label: '', cls: 'fit' }
  };

  function slaCell(item) {
    var s = D.sla(item, st());
    if (!s) return '<span class="t2">—</span>';
    if (s.noFault) return '<span class="t2">—</span>';
    if (s.paused) return ui.tag('Dừng tính hạn', 'neutral');
    if (s.late) return ui.tag('Quá ' + U.fmtGap(s.left), 'danger');
    if (s.soon) return ui.tag('Còn ' + U.fmtGap(s.left), 'warn');
    return '<span class="t2">' + U.fmtDT(s.due) + '</span>';
  }

  function progressCell(item) {
    var wt = wtOf(item);
    if (!wt || !wt.checklist.length) return '';
    var done = (item.checklist || []).filter(Boolean).length;
    return '<div class="t2">' + done + '/' + wt.checklist.length + '</div>' + ui.bar(done, wt.checklist.length);
  }

  /**
   * Cột thao tác: tối đa hai nút chữ cộng nút xem, luôn nằm trên một dòng.
   * Việc còn thao tác khác thì mở chi tiết, không kéo dài chiều cao dòng bảng.
   */
  function actionRow(item) {
    var role = me().role;
    var acts = actionsFor(item).slice().sort(function (a, b) { return (a.rank || 5) - (b.rank || 5); });
    var id = U.attr(item.item_id);
    var out = [];
    if(canFocus(item) && LSTiming.workState(item)!=='ACTIVE')out.push(ui.btn(LSTiming.workState(item)==='WAITING'?'Làm tiếp':'Làm ngay',{
      kind:'primary',sm:true,act:'start-work',disabled:focusBusy,data:' data-id="'+id+'"'}));

    acts.filter(function (a) { return a.primary; }).slice(0, 2).forEach(function (a, idx) {
      out.push(ui.btn(a.short || a.label, {
        kind: idx === 0 ? 'primary' : 'line', sm: true, act: 'flow',
        title: a.label, data: ' data-id="' + id + '" data-to="' + a.to + '"'
      }));
    });

    // Kiểm soát đổi người ngay trên bảng, không phải mở hộp thoại hai lần.
    var reassign = acts.filter(function (a) { return a.assignee && !a.primary; })[0];
    if (out.length < 2 && reassign && ['KS_LS', 'QUAN_LY_LS'].indexOf(role) !== -1) {
      out.push(ui.btn(reassign.short || reassign.label, {
        kind: 'line', sm: true, act: 'quick-assign', title: reassign.label, data: ' data-id="' + id + '"'
      }));
    }

    var pause = acts.filter(function (a) { return a.to === 'TAM_DUNG'; })[0];
    if (pause) {
      out.push(ui.btn(pause.short || pause.label, {
        kind: 'line', sm: true, act: 'flow', title: pause.label,
        data: ' data-id="' + id + '" data-to="TAM_DUNG"'
      }));
    }
    if (canChangeDueDate(item)) {
      out.push(ui.btn('Đổi hạn', { kind: 'line', sm: true, act: 'change-due-date', title: 'Đổi hạn xử lý', data: ' data-id="' + id + '"' }));
    }

    // Hủy ngay trên dòng (vẫn phải chọn lý do và xác nhận trong hộp thoại).
    var cancel = acts.filter(function (a) { return a.to === 'HUY'; })[0];
    if (cancel) {
      out.push(ui.iconBtn('ban', { act: 'flow', label: 'Hủy việc', data: ' data-id="' + id + '" data-to="HUY"' }));
    }
    var shown = out.filter(function (html) { return /data-act="(flow|quick-assign|cancel-approve)"/.test(html); }).length;
    var rest = Math.max(0, acts.length - shown);
    // Phòng/PGD sửa nhanh ngay trên dòng, không phải mở chi tiết rồi mới bấm Sửa.
    var pencil = role === 'PHONG_PGD' && canEdit(item) && !item.syncing
      ? ui.iconBtn('pencil', { act: 'edit-item', data: ' data-id="' + id + '"', label: 'Sửa thông tin' }) : '';
    return '<div class="act-row">' + out.join('') + pencil +
      ui.iconBtn('eye', {
        act: 'detail', data: ' data-id="' + id + '"',
        label: rest > 0 ? 'Xem chi tiết và ' + rest + ' thao tác khác' : 'Xem chi tiết'
      }) + '</div>';
  }

  /**
   * Ghi chú Phòng/PGD gửi kèm hồ sơ ("Ghi chú cho LS" lúc tạo việc, ghi chú hẹn bổ sung) hiện ngay trên dòng,
   * cắt gọn hai dòng; rê chuột hoặc mở chi tiết để xem đủ. Quản trị hệ thống không xem nội dung hồ sơ khách.
   */
  function dossierNoteHtml(item) {
    var r = reqOf(item), out = '';
    if (!item || me().role === 'ADMIN') return '';
    var note = String(r && r.note || '').trim();
    if (note) out += '<div class="row-note" title="' + U.attr(note) + '">' + U.icon('chat', 13) + '<span><b>Ghi chú:</b> ' + U.esc(note) + '</span></div>';
    var s = item.supplement;
    if (s && s.at) {
      var text = 'Hẹn bổ sung ' + U.fmtDT(s.at) + (s.note ? ' — ' + String(s.note).trim() : '');
      out += '<div class="row-note row-note-supplement" title="' + U.attr(text) + '">' + U.icon('clock', 13) + '<span>' + U.esc(text) + '</span></div>';
    }
    return out;
  }

  function cell(key, item) {
    var r = reqOf(item);
    switch (key) {
      case 'pick':
        return pickable(item)
          ? '<input type="checkbox" class="pick-box" data-act="pick-row" data-id="' + U.attr(item.item_id) + '"' + (picked[item.item_id] ? ' checked' : '') +
            ' aria-label="Chọn ' + U.attr(itemRef(item)) + ' để phân công">'
          : '';
      case 'code':
        // Dòng vừa tạo chờ máy chủ cấp mã: chỉ chưa có mã, không hiện trạng thái đang gửi.
        if (item.syncing) return '<div class="tid">—</div>';
        return '<div class="tid">' + U.esc(itemRef(item)) + '</div>' +
          (item.pending && !cancelPending(item) ? ui.tag('Chờ duyệt sửa', 'gold') : '') +
          (item.parent_item_id ? ui.tag('Việc kèm', 'violet') : '');
      case 'customer':
        // Quản trị hệ thống xem được vận hành nhưng không xem hồ sơ khách,
        // giống hệt quy tắc đã áp trong hộp thoại chi tiết.
        if (me().role === 'ADMIN') return '<span class="t2">Ẩn theo quyền</span>';
        return '<div class="customer-main"><span class="t1">' + U.esc(r ? r.customer.name : '—') + '</span>' +
          (r && priorityTags(r.customer) ? '<span class="priority-tags">' + priorityTags(r.customer) + '</span>' : '') + '</div>' +
          '<div class="t2 cust-cif">' + U.esc(r && r.customer.cif ? r.customer.cif : 'Chưa có CIF') + '</div>' +
          // Thẻ mobile thay dòng CIF bằng phòng gửi hồ sơ — thông tin cần để lướt hàng chờ.
          '<div class="t2 cust-unit">' + U.esc(r ? unitName(r.unit_id) : '—') + '</div>' + dossierNoteHtml(item);
      case 'requestor':
        if (me().role === 'ADMIN') return '<span class="t2">Ẩn theo quyền</span>';
        return '<div class="t2">' + U.esc(r ? (r.requestor && r.requestor.name || userName(r.created_by) || '—') : '—') + '</div>';
      case 'contact':
        if (me().role === 'ADMIN') return '<span class="t2">Ẩn theo quyền</span>';
        return contactCell(r);
      case 'unit':
        return '<div class="t2">' + U.esc(r ? unitName(r.unit_id) : '—') + '</div>';
      case 'work':
        return '<div class="t1">' + U.esc(wtGroup(item.work_type_code)) + '</div>' +
          '<div class="t2">' + U.esc(productLabel(item)) + '</div>';
      case 'date':
        var dayRank = queueDayRank(item);
        return '<div class="t2">' + U.fmtDate(item.occurrence_date) + '</div>' +
          (dayRank === 0 ? '<span class="day-flag is-today">Hôm nay</span>' : dayRank === 1 ? '<span class="day-flag">T+1</span>' : '');
      case 'status':
        return ui.statusTag(item.status) + (LSTiming.workState(item) ? '<div>'+ui.tag({ACTIVE:'Đang làm',QUEUED:'Chờ bắt đầu',WAITING:'Chờ làm tiếp'}[LSTiming.workState(item)],'info')+'</div>' : '') + (item.is_priority ? '<div style="margin-top:.25rem">' + priorityLsTag() + '</div>' : '');
      case 'staff':
        return item.assigned_user_id
          ? '<div class="t2">' + U.esc(userName(item.assigned_user_id)) + '</div>' + progressCell(item)
          : '<span class="t2">Chưa giao</span>';
      case 'progress':
        return progressCell(item) || '<span class="t2">—</span>';
      case 'sla':
        return slaCell(item);
      case 'time':
        return processingClock(item);
      case 'act':
        return actionRow(item);
      default: return '';
    }
  }

  function itemTable(list, keys, emptyOpts, screen) {
    var queueRecs = {};
    if (screen === 'queue' && canBatchAssign() && typeof LSPlanning !== 'undefined') {
      var pc = LSPlanning.context(st(), D), reserves = {}, groups = {};
      list.forEach(function (item) {
        if (D.PRE_ASSIGN.indexOf(item.status) === -1) return;
        var root = item.parent_item_id || item.item_id;
        var rec = groups[root] || pairRecommendation(item, reserves, pc);
        if (!rec) return;
        groups[root] = rec; queueRecs[item.item_id] = rec;
        reserves[rec.user.user_id] = (reserves[rec.user.user_id] || 0) + 1;
      });
    }
    // Cột chọn chỉ có khi người xem được phân công và danh sách có hồ sơ chờ giao.
    if (keys.indexOf('pick') !== -1) {
      pickScope = list.filter(pickable).map(function (i) { return i.item_id; });
      if (!pickScope.length) keys = keys.filter(function (k) { return k !== 'pick'; });
    }
    var cols = keys.map(function (k) {
      var c = COLS[k], out = Object.assign({}, c);
      if (k === 'pick') {
        var all = pickScope.length && pickScope.every(function (id) { return picked[id]; });
        out.header = '<input type="checkbox" class="pick-box" data-act="pick-all"' + (all ? ' checked' : '') +
          ' aria-label="Chọn tất cả hồ sơ chờ phân công đang hiện" title="Chọn tất cả hồ sơ chờ phân công đang hiện">';
      } else if (screen && k !== 'act') out.header = sortHeader(screen, k, c.label);
      return out;
    });
    var mobileTableOpts = Object.assign({}, emptyOpts || {}, { tableClass: 'mobile-record-table' });
    return ui.table(
      cols,
      list.map(function (i) {
        var s = D.sla(i, st());
        return {
          cls: priorityRowClass(i) + ' ' + (s && s.late ? 'flag' : (s && s.soon ? 'flag-warn' : '')) +
            (screen === 'queue' ? ['  row-today', ' row-next', ''][queueDayRank(i)] : ''),
          // Dòng nhận tiêu điểm bằng phím J/K (tabindex -1: không chen vào vòng Tab).
          attrs: i.syncing ? '' : ' data-row="' + U.attr(i.item_id) + '" tabindex="-1"',
          cells: keys.map(function (k) {
            var html = cell(k, i), rec = queueRecs[i.item_id];
            if (k === 'act' && rec) html += '<div class="assignment-suggestion"><span class="t2">Gợi ý nhận:</span> <b>' + U.esc(rec.user.full_name) + '</b><div class="t2">' +
              U.esc(rec.reasons ? rec.reasons.join(' · ') : rec.linkedItem ? 'Đang giữ việc cùng nhóm' : 'Theo quy tắc phụ trách') + '</div></div>';
            return html;
          })
        };
      }),
      mobileTableOpts
    );
  }

  /* ============================ Màn: việc đã gửi ============================ */

  function work() {
    var u = me();
    var all = visibleItems().filter(function (i) { return isOpenItem(i) && requestedByMe(i); });
    var list = sortItems(applyFilters('work', all), 'work');
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    // Cả hồ sơ Kiểm soát trả lại lẫn hồ sơ tự trả vì quá ngày chưa giao: đều chờ phòng chọn ngày gửi lại.
    var fix = all.filter(function (i) { return i.status === 'CAN_BO_SUNG' || i.status === 'CHUA_GIAO_HO_SO'; });

    return (fix.length ? ui.banner('warn', fix.length + ' việc chờ phòng gửi lại', 'Kiểm soát trả lại hoặc quá ngày chưa giao hồ sơ — mở việc, chọn ngày rồi bấm Gửi lại LS.') : '') +
      ui.block({
        title: 'Đề nghị & hồ sơ đã gửi LS', count: list.length + '/' + all.length, icon: 'clipboard', compact: true,
        actions: u.role === 'PHONG_PGD' ? ui.btn('Tạo việc mới', { kind: 'primary', act: 'new-request', icon: 'plus', sm: true }) : '',
      filters: listToolbar('work', { status: true, type: true, unit: u.role !== 'PHONG_PGD', staff: u.role !== 'PHONG_PGD' }, true),
        body: (canBatchAssign() ? bulkAssignBar() : '') +
          itemTable(list, (canBatchAssign() ? ['pick'] : []).concat(['code', 'customer', 'requestor', 'contact', 'work', 'date', 'status', 'staff', 'act']), {
          icon: 'clipboard',
          title: all.length ? 'Không có việc khớp bộ lọc' : 'Không có việc đang mở',
          text: '',
          action: !all.length && u.role === 'PHONG_PGD' ? ui.btn('Tạo việc mới', { kind: 'primary', act: 'new-request', icon: 'plus' }) : ''
        }, 'work')
      });
  }

  /**
   * Mặc định xem từ hôm nay tới hết tuần, nhưng cho phép lùi về quá khứ.
   * Khóa cứng mốc đầu vào hôm nay làm việc chưa phân công của ngày cũ biến mất
   * khỏi mọi màn hình của phòng gửi: không xem, không sửa, không hủy được.
   */
  function roomRange() {
    var today = U.localDate(), base = new Date(today + 'T00:00:00');
    var end = new Date(base.getTime()); end.setDate(end.getDate() + (7 - (base.getDay() || 7)));
    var from = f('room', 'from', today), to = f('room', 'to', U.localDate(end));
    if (to < from) to = from;
    setFilter('room', 'from', from); setFilter('room', 'to', to);
    return { from: from, to: to };
  }

  /** Việc còn mở nhưng rơi ra ngoài kỳ đang xem — không được để lọt. */
  function roomBacklog(range) {
    return visibleItems().filter(function (i) {
      if (!D.STATUS[i.status].open) return false;
      var day = String(i.occurrence_date || '').substring(0, 10);
      return day && day < range.from;
    });
  }

  function roomItems() {
    var range = roomRange();
    return visibleItems().filter(function (i) {
      var day = String(i.occurrence_date || '').substring(0, 10);
      return !day || (day >= range.from && day <= range.to);
    });
  }

  function room() {
    var range = roomRange(), inWindow = roomItems().filter(isOpenItem), list = sortItems(applyFilters('room', inWindow), 'room'), u = me();
    var backlog = roomBacklog(range);

    var warn = backlog.length
      ? ui.banner('warn', backlog.length + ' việc còn mở nằm trước kỳ đang xem',
        'Từ ' + U.fmtDate(backlog.map(function (i) { return i.occurrence_date; }).sort()[0])) +
        '<div style="margin:-0.5rem 0 0.75rem">' +
        ui.btn('Xem cả việc tồn', { act: 'room-backlog', icon: 'history', sm: true, kind: 'line' }) + '</div>'
      : '';

    return warn + ui.block({
      title: 'Toàn bộ hồ sơ ' + unitName(u.unit_id), count: list.length + '/' + inWindow.length, icon: 'building',
      note: '', compact: true,
      filters: listToolbar('room', { status: true, type: true, staff: true, dates: true }, true),
      body: itemTable(list, ['code', 'customer', 'requestor', 'work', 'staff', 'sla', 'status', 'act'], {
        icon: 'building', title: 'Phòng chưa có hồ sơ trong kỳ', text: ''
      }, 'room')
    });
  }

  /** Kéo mốc đầu kỳ về ngày sớm nhất còn việc mở. */
  function roomShowBacklog() {
    var backlog = roomBacklog(roomRange());
    if (!backlog.length) return;
    var earliest = backlog.map(function (i) { return String(i.occurrence_date).substring(0, 10); }).sort()[0];
    setFilter('room', 'from', earliest);
    LS.app.render();
    ui.toast('Đã mở rộng kỳ xem từ ' + U.fmtDate(earliest) + '.');
  }

  /**
   * Dashboard phòng xem trọn tuần (thứ Hai → Chủ nhật) theo mặc định, khác danh sách hồ sơ (hôm nay → cuối tuần),
   * để số đã gửi / LS đã hoàn thành của những ngày đầu tuần không bị rơi mất. Có bộ lọc ngày riêng.
   */
  function roomBoardRange() {
    var base = new Date(U.localDate() + 'T00:00:00');
    var monday = new Date(base.getTime()); monday.setDate(monday.getDate() - ((base.getDay() + 6) % 7));
    var sunday = new Date(monday.getTime()); sunday.setDate(sunday.getDate() + 6);
    var from = f('room-board', 'from', U.localDate(monday)), to = f('room-board', 'to', U.localDate(sunday));
    if (to < from) to = from;
    return { from: from, to: to };
  }

  function roomBoardItems() {
    var range = roomBoardRange();
    return visibleItems().filter(function (i) {
      var day = String(i.occurrence_date || '').substring(0, 10);
      return !day || (day >= range.from && day <= range.to);
    });
  }

  function roomBoard() {
    var u = me(), range = roomBoardRange(), current = applyFilters('room-board', roomBoardItems());
    var groups = {};
    current.forEach(function (i) { var w = wtOf(i), key = w && w.group ? w.group : 'Khác'; if (!groups[key]) groups[key] = []; groups[key].push(i); });
    var byType = Object.keys(groups).map(function (key) {
      var rows = groups[key];
      return { name: key, n: rows.length, open: rows.filter(function (i) { return D.STATUS[i.status].open; }).length };
    });
    var byStaff = staffList().map(function (s) {
      var rows = current.filter(function (i) { return i.assigned_user_id === s.user_id && reqOf(i) && reqOf(i).unit_id === u.unit_id; });
      return { s: s, n: rows.length, open: rows.filter(function (i) { return D.STATUS[i.status].open; }).length, done: rows.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length };
    }).filter(function (x) { return x.n; });
    var cal = D.processingCalendar(st()), finished = current.filter(function (i) { return i.status === 'HOAN_THANH_LS' && i.completed_at; });
    var totals = finished.map(function (i) { return LSTiming.metrics(i, cal).toan_trinh; }).filter(function (x) { return x !== null && isFinite(x); });
    var dueKnown = finished.filter(function (i) { return i.due_at && !D.slaExempt(i, st()); });
    var onTime = U.pct(dueKnown.filter(function (i) { return new Date(i.completed_at) <= new Date(i.due_at); }).length, dueKnown.length);
    var lateNow = current.filter(function (i) { var s = D.STATUS[i.status].open && D.sla(i, st()); return s && s.late; }).length;
    return ui.block({
      title: 'Dashboard ' + unitName(u.unit_id), count: U.fmtDate(range.from) + ' → ' + U.fmtDate(range.to), icon: 'chart',
      note: '',
      filters: listToolbar('room-board', { dates: true }, false),
      body: ui.strip([
        ui.metric('Gửi → LS hoàn thành TB', totals.length ? D.durationLabel(mean(totals)) : null, '', 'giờ làm việc'),
        ui.metric('Hoàn thành đúng hạn', onTime === null ? null : onTime + '%', 'ok'),
        ui.metric('Đang quá hạn', lateNow, lateNow ? 'danger' : '')
      ]) + roomCharts(current, range, byStaff) + ui.sectionTitle('Theo nhóm cấp độ / loại việc') + ui.table(
        [{ label: 'Loại việc' }, { label: 'Tổng', cls: 'num' }, { label: 'Đang mở', cls: 'num' }],
        byType.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.name) + '</div>', '<span class="tid">' + x.n + '</span>', '<span class="tid">' + x.open + '</span>'] }; }),
        { icon: 'chart', title: 'Chưa có nhóm việc trong kỳ', text: '', tableClass: 'dashboard-metric-table' }
      ) + '<div style="margin-top:1.25rem">' + ui.sectionTitle('LS đang xử lý cho phòng') + ui.table(
        [{ label: 'Cán bộ LS' }, { label: 'Tổng việc', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }],
        byStaff.map(function (x) { return { cells: ['<div class="t1">' + U.esc(x.s.full_name) + '</div>', '<span class="tid">' + x.n + '</span>', '<span class="tid">' + x.open + '</span>', '<span class="tid">' + x.done + '</span>'] }; }),
        { icon: 'users', title: 'Chưa có LS xử lý cho phòng', text: '', tableClass: 'dashboard-metric-table' }
      ) + '</div>'
    });
  }

  function roomCharts(current, range, byStaff) {
    var from = String(range.from || '').substring(0, 10), to = String(range.to || '').substring(0, 10);
    if (!from || !to) return '';
    var b = LS.charts.buckets(from, to);
    var sent = b.labels.map(function () { return 0; }), done = sent.slice();
    current.forEach(function (i) {
      var k = b.keyOf(i.occurrence_date); if (k !== -1 && i.status !== 'HUY') sent[k] += 1;
      var d = i.status === 'HOAN_THANH_LS' ? b.keyOf(i.completed_at) : -1; if (d !== -1) done[d] += 1;
    });
    return '<div class="viz-pair viz-bleed">' +
      LS.charts.columns({ title: 'Phòng gửi và LS hoàn thành', labels: b.labels, labelHead: 'Mốc',
        series: [{ name: 'Đã gửi', values: sent }, { name: 'Hoàn thành', values: done, slot: 2 }] }) +
      LS.charts.bars({ title: 'LS đang xử lý cho phòng', labelHead: 'Cán bộ LS', sort: true,
        rows: byStaff.map(function (x) { return { label: x.s.full_name }; }),
        series: [{ name: 'Hoàn thành', values: byStaff.map(function (x) { return x.done; }) },
          { name: 'Đang mở', values: byStaff.map(function (x) { return x.open; }), slot: 2 }] }) + '</div>';
  }

  /* ============================ Màn: hàng chờ ============================ */

  /** Tuần làm việc đang xem, tính từ thứ Hai đến Chủ nhật theo ngày địa phương. */
  function currentWeekWindow() {
    var today = U.localDate(), monday = new Date(today + 'T12:00:00');
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    var sunday = new Date(monday.getTime()); sunday.setDate(sunday.getDate() + 6);
    return { from: U.localDate(monday), to: U.localDate(sunday) };
  }

  /**
   * Hồ sơ ngoài tuần đang xem chỉ được giữ lại khi vẫn đang mở và LS đã nhận (kể cả ngày phát sinh bị dời sang
   * tuần khác), hoặc đã giao cho cán bộ mà ngày phát sinh bị dời sang tuần sau. Việc chưa giao thì không kéo sang.
   */
  function isReceivedOpenCarryover(item, range) {
    if (!item || !D.STATUS[item.status] || !D.STATUS[item.status].open) return false;
    if (item.dossier_received_at) return true;
    var day = String(item.occurrence_date || '').substring(0, 10);
    return !!(item.assigned_user_id && day && day > range.to);
  }

  function withinWorkflowWeek(item, range) {
    range = range || currentWeekWindow();
    var day = String(item && item.occurrence_date || '').substring(0, 10);
    return !!((day && day >= range.from && day <= range.to) || isReceivedOpenCarryover(item, range));
  }

  /** Hàng chờ chỉ xem tuần hiện tại; không kéo tồn chưa tiếp nhận từ tuần cũ sang. */
  function queueWindow() {
    var range = currentWeekWindow();
    setFilter('queue', 'from', range.from); setFilter('queue', 'to', range.to);
    return range;
  }

  /**
   * Số trên nav "Hàng chờ" phải khớp đúng những gì màn Hàng chờ hiển thị được:
   * việc chờ phân công TRONG cửa sổ ngày (đồng bộ với danh sách), cộng đề nghị
   * sửa/hủy chờ duyệt và hồ sơ chờ KS duyệt (hiện ở khối riêng, không theo ngày).
   * Trước đây badge đếm cả việc chờ phân công NGOÀI cửa sổ nên báo có việc mà bấm
   * vào danh sách lại trống.
   */
  function queueBadgeCount() {
    var range = queueWindow();
    return visibleItems().filter(function (i) {
      if (!withinWorkflowWeek(i, range)) return false;
      if (i.pending || i.status === 'CHO_KS_DUYET') return true;
      return D.PRE_ASSIGN.indexOf(i.status) !== -1 && withinQueueWindow(i, range);
    }).length;
  }

  /**
   * Thứ tự ưu tiên của hàng chờ theo ngày phát sinh: 0 = hôm nay, 1 = T+1 (ngày làm
   * việc kế tiếp — thứ Sáu thì T+1 là thứ Hai), 2 = các ngày còn lại. Chỉ tính cho
   * việc còn mở; việc đã xong/hủy không cần kéo lên đầu.
   */
  var dayMarks = null;

  function queueDays() {
    var today = U.localDate();
    if (dayMarks && dayMarks.today === today) return dayMarks;
    var cal = D.processingCalendar(st()), d = new Date(today + 'T12:00:00'), guard = 0;
    do { d.setDate(d.getDate() + 1); guard += 1; } while (!U.isWorkday(d, cal) && guard < 14);
    dayMarks = { today: today, next: U.localDate(d) };
    return dayMarks;
  }

  function queueDayRank(item) {
    if (!item || !D.STATUS[item.status] || !D.STATUS[item.status].open) return 2;
    var day = String(item.occurrence_date || '').substring(0, 10), m = queueDays();
    return day === m.today ? 0 : day === m.next ? 1 : 2;
  }

  /** Giữ thứ tự sắp xếp người dùng chọn, nhưng luôn đưa hôm nay rồi T+1 lên trước. */
  function queuePriority(list) {
    return list.map(function (x, n) { return { x: x, n: n, r: queueDayRank(x), p: priorityRank(x) }; })
      .sort(function (a, b) { return a.p - b.p || a.r - b.r || a.n - b.n; })
      .map(function (o) { return o.x; });
  }

  /** Chip lọc theo phòng/PGD gửi; mặc định "Tất cả". */
  function queueUnitChips(source, current, screen) {
    var counts = {};
    source.forEach(function (i) { var r = reqOf(i); if (r) counts[r.unit_id] = (counts[r.unit_id] || 0) + 1; });
    var units = queueVisibleUnits();
    if (!units.length && !current) return '';
    // Hàng chờ giữ hành động riêng; màn khác (Quản lý hồ sơ) truyền tên màn để lưu lựa chọn phòng.
    var act = screen ? 'unit-chip' : 'queue-unit', scope = screen ? ' data-screen="' + U.attr(screen) + '"' : '';
    var chip = function (id, label, n) {
      var on = (current || '') === id;
      return '<button type="button" class="unit-chip' + (on ? ' is-active' : '') + '" data-act="' + act + '"' + scope + ' data-unit="' + U.attr(id) + '" aria-pressed="' + on + '">' +
        U.esc(label) + ' <span>' + n + '</span></button>';
    };
    return '<div class="unit-chips" role="group" aria-label="Lọc theo phòng gửi">' + chip('', 'Tất cả phòng', source.length) +
      units.map(function (x) { return chip(x.unit_id, x.name, counts[x.unit_id] || 0); }).join('') + '</div>';
  }

  function withinQueueWindow(item, range) {
    var day = String(item.occurrence_date || '').substring(0, 10);
    return !!(day && day >= range.from && day <= range.to);
  }

  /** Hàng tab kèm số đếm; `defs` là [[mã, nhãn], ...], `act` là hành động bấm tab của màn gọi. */
  function queueTabs(tab, counts, defs, act) {
    return '<div class="queue-tabs">' + defs.map(function (x) {
      var on = tab === x[0], label = x[1] + ' · ' + counts[x[0]], data = ' data-tab="' + x[0] + '"';
      // Tab thứ ba 'end': tab phụ nằm cuối hàng, nét nhạt, không lẫn vào các tab chính.
      if (x[2] === 'end') {
        return '<button type="button" class="btn btn-' + (on ? 'primary' : 'quiet') + ' btn-sm queue-tab-end" data-act="' + U.attr(act) + '"' + data + '>' + U.esc(label) + '</button>';
      }
      return ui.btn(label, { kind: on ? 'primary' : 'line', sm: true, act: act, data: data });
    }).join('') + '</div>';
  }

  function paginate(list, screen) {
    var size = 25, page = Math.max(1, Number(f(screen, 'page', 1)) || 1), total = Math.max(1, Math.ceil(list.length / size));
    if (page > total) { page = total; setFilter(screen, 'page', page); }
    var start = (page - 1) * size;
    return { rows: list.slice(start, start + size), page: page, total: total, size: size };
  }

  function pageControls(pagination, screen) {
    if (pagination.total <= 1) return '';
    var scope = ' data-screen="' + U.attr(screen || 'queue') + '"';
    return '<div class="btn-row" style="justify-content:flex-end;padding: .75rem 1rem">' +
      ui.btn('‹ Trước', { sm: true, act: 'queue-page', disabled: pagination.page <= 1, data: scope + ' data-dir="prev" data-page="' + (pagination.page - 1) + '"' }) +
      '<span class="t2">Trang ' + pagination.page + '/' + pagination.total + '</span>' +
      ui.btn('Sau ›', { sm: true, act: 'queue-page', disabled: pagination.page >= pagination.total, data: scope + ' data-dir="next" data-page="' + (pagination.page + 1) + '"' }) + '</div>';
  }

  /**
   * Hàng chờ chỉ có hồ sơ chưa giao cho cán bộ (chờ phân công, cần bổ sung): việc của người phân công.
   * Hồ sơ đã giao và mọi trạng thái sau đó nằm ở màn Quản lý hồ sơ, xem được theo từng phòng.
   */
  function queue() {
    if (f('queue', 'view', '') === 'rules') return queueRules();
    var range = queueWindow();
    // Bộ đếm và danh sách bên dưới phải đếm cùng một tập: lọc theo kỳ xem trước,
    // nếu không số báo có việc mà bấm vào thì bảng trống.
    var all = visibleItems().filter(function (i) { return withinWorkflowWeek(i, range); });
    var pending = all.filter(function (i) { return i.pending && i.pending.kind !== 'CANCEL'; });
    var source = all.filter(function (i) { return UNASSIGNED_STATUS.indexOf(i.status) !== -1; });
    var unitSel = f('queue', 'qunit', '');
    if (unitSel && !isQueueUnitVisible(unitSel)) { unitSel = ''; setFilter('queue', 'qunit', ''); }
    var scoped = applyFilters('queue', source);
    var unitChips = queueUnitChips(scoped, unitSel);
    if (unitSel) scoped = scoped.filter(function (i) { var r = reqOf(i); return r && r.unit_id === unitSel; });
    var filtered = queuePriority(sortItems(scoped, 'queue'));
    var page = paginate(filtered, 'queue');

    var out = '';

    if (pending.length) {
      out += ui.block({
        title: 'Đề nghị sửa chờ duyệt', count: pending.length, icon: 'pencil',
        body: ui.table(
          [{ label: 'Mã việc', cls: 'fit' }, { label: 'Người đề nghị' }, { label: 'Nội dung thay đổi' }, { label: 'Lý do' }, { label: '', cls: 'fit' }],
          pending.map(function (i) {
            return {
              cells: [
                '<div class="tid">' + U.esc(itemRef(i)) + '</div>',
                '<div class="t1">' + U.esc(userName(i.pending.by)) + '</div><div class="t2">' + U.fmtDT(i.pending.at) + '</div>',
                cancelPending(i) ? '<b>Đề nghị HỦY việc</b><div class="t2">' + U.esc(D.label(i.status)) + ' · ' + U.esc(productLabel(i)) + '</div>' : diffHtml(i, i.pending.fields),
                '<div class="t2">' + U.esc(i.pending.reason) + '</div>',
                '<div class="btn-row">' +
                (cancelPending(i)
                  ? ui.btn('Duyệt hủy', { kind: 'primary', sm: true, act: 'cancel-approve', data: ' data-id="' + U.attr(i.item_id) + '"' })
                  : ui.btn('Duyệt', { kind: 'primary', sm: true, act: 'revision', data: ' data-id="' + U.attr(i.item_id) + '" data-ok="1"' })) +
                ui.btn('Từ chối', { sm: true, act: 'revision', data: ' data-id="' + U.attr(i.item_id) + '" data-ok="0"' }) +
                '</div>'
              ]
            };
          })
        )
      });
    }

    out += ui.block({
      title: 'Hàng chờ phân công', count: filtered.length + '/' + source.length, icon: 'shield',
      // Giao nhiều hồ sơ cho một người: tích các dòng rồi dùng thanh thao tác phía dưới.
      // "Phân công nhanh" là giao theo quy tắc đã cấu hình (phòng → cán bộ, kèm sản phẩm).
      actions: (canBatchAssign() && filtered.length
        ? ui.btn('Phân công nhanh', { kind: 'primary', sm: true, act: 'batch-assign-open', icon: 'zap', title: 'Giao các hồ sơ theo quy tắc phân công nhanh' }) : '') +
        // Kiểm soát nhận hồ sơ qua điện thoại/giấy thì đăng ký hộ phòng ngay tại hàng chờ.
        (me().role === 'KS_LS' ? ui.btn('Đăng ký hộ phòng', { kind: 'line', sm: true, act: 'new-request', icon: 'plus' }) : '') +
        ui.btn('Cấu hình phân công nhanh', { kind: 'line', sm: true, act: 'queue-view', icon: 'sliders', data: ' data-view="rules"', title: 'Phòng nào do cán bộ nào phụ trách, sản phẩm nào đi theo' }),
      note: '', compact: true,
      // Tìm/lọc/sắp xếp nằm trên; chip phòng xuống hàng riêng và tự xuống dòng để không bị khuất.
      filters: '<div class="queue-toolbar"><div class="queue-tools queue-tools-solo">' + listSearch('queue') + filterBar('queue', filterOptions('queue')) + sortControl('queue') + '</div>' + unitChips + '</div>',
      body: (canBatchAssign() ? bulkAssignBar() : '') +
        itemTable(page.rows, (canBatchAssign() ? ['pick'] : []).concat(['code', 'customer', 'requestor', 'unit', 'work', 'date', 'status', 'act']), {
        icon: 'check', title: source.length ? 'Không có hồ sơ khớp bộ lọc' : 'Không còn hồ sơ chờ phân công', text: ''
      }, 'queue') + pageControls(page, 'queue')
    });

    return out;
  }

  /** Quy tắc phân công nhanh nằm ngay trong Hàng chờ: cùng việc "ai nhận hồ sơ nào", không cần một mục menu riêng. */
  function queueRules() {
    return '<div class="btn-row">' + ui.btn('‹ Quay lại hàng chờ', { kind: 'line', sm: true, act: 'queue-view', data: ' data-view=""' }) + '</div>' +
      LS.admin.assignmentView();
  }

  /* ============================ Màn: quản lý hồ sơ ============================ */

  // Mặc định chỉ hiện hồ sơ còn mở. "Quá hạn" chồng lên các nhóm đang mở;
  // hồ sơ hoàn thành và đã hủy chỉ xuất hiện trong tab riêng.
  var TRACK_TABS = [
    ['all', 'Đang mở'], ['assigned', 'Đã phân công'], ['running', 'Đang xử lý'], ['appointment', 'Đang hẹn khách'],
    ['paused', 'Tạm dừng'], ['late', 'Quá hạn'], ['done', 'Hoàn thành'], ['canceled', 'Đã hủy', 'end']
  ];

  /** Hồ sơ đã giao hoặc tự trả về người đề nghị; chờ phân công nằm ở Hàng chờ, hủy ở tab Đã hủy. */
  function isTracked(i) {
    return i.status !== 'HUY' && UNASSIGNED_STATUS.indexOf(i.status) === -1;
  }

  function trackMatch(tab, i) {
    if (tab === 'canceled') return i.status === 'HUY';
    if (!isTracked(i)) return false;
    if (tab === 'all') return isOpenItem(i);
    if (tab === 'assigned') return i.status === 'DA_PHAN_CONG';
    if (tab === 'running') return ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET'].indexOf(i.status) !== -1;
    if (tab === 'appointment') return i.status === 'DANG_HEN_KH';
    if (tab === 'paused') return i.status === 'TAM_DUNG';
    if (tab === 'late') { var s = D.sla(i, st()); return !!(s && s.late); }
    if (tab === 'done') return i.status === 'HOAN_THANH_LS';
    return true;
  }

  /**
   * Theo dõi tiến độ các hồ sơ đã phân công cho cán bộ (kể cả đã hoàn thành), chia theo phòng gửi.
   * Hồ sơ chờ phân công không theo dõi ở đây (đã có Hàng chờ); hồ sơ hủy xem ở tab Đã hủy cuối hàng.
   * Số trên tab và số trên chip phòng đếm đúng tập đang hiện: chọn phòng thì tab đếm riêng phòng đó,
   * chọn tab thì chip đếm riêng tab đó.
   */
  function tracking() {
    var tab = f('tracking', 'tab', 'all');
    if (!TRACK_TABS.some(function (x) { return x[0] === tab; })) { tab = 'all'; setFilter('tracking', 'tab', tab); }
    var range = currentWeekWindow();
    var base = applyFilters('tracking', visibleItems().filter(function (i) { return withinWorkflowWeek(i, range); }));
    var unitSel = f('tracking', 'tunit', '');
    if (unitSel && !isQueueUnitVisible(unitSel)) { unitSel = ''; setFilter('tracking', 'tunit', ''); }
    var inTab = base.filter(function (i) { return trackMatch(tab, i); });
    var chips = queueUnitChips(inTab, unitSel, 'tracking');
    var scoped = unitSel ? base.filter(function (i) { var r = reqOf(i); return r && r.unit_id === unitSel; }) : base;
    var counts = {};
    TRACK_TABS.forEach(function (x) { counts[x[0]] = scoped.filter(function (i) { return trackMatch(x[0], i); }).length; });
    var list = sortItems(scoped.filter(function (i) { return trackMatch(tab, i); }), 'tracking');
    var page = paginate(list, 'tracking');
    var cols = ['code', 'customer', 'requestor', 'unit', 'work', 'date', 'staff', tab === 'done' ? 'time' : 'sla', 'status', 'act'];
    var unit = unitSel ? U.byId(st().units, 'unit_id', unitSel) : null;

    return ui.block({
      title: 'Quản lý hồ sơ' + (unit ? ' · ' + unit.name : ''), count: list.length, icon: 'clipboard', compact: true,
      note: '',
      filters: '<div class="tracking-toolbar">' + queueTabs(tab, counts, TRACK_TABS, 'tracking-tab') +
        '<div class="tracking-filter-row"><div class="queue-tools">' + listSearch('tracking') + filterBar('tracking', filterOptions('tracking')) + sortControl('tracking') + '</div></div>' + chips + '</div>',
      body: itemTable(page.rows, cols, {
        icon: 'clipboard', title: 'Không có hồ sơ khớp', text: unitSel || f('tracking', 'q', '') ? 'Thử bỏ bộ lọc hoặc chọn "Tất cả phòng".' : ''
      }, 'tracking') + pageControls(page, 'tracking')
    });
  }

  var FIELD_LABEL = {
    work_type_code: 'Loại việc', product_name: 'Sản phẩm', occurrence_date: 'Ngày phát sinh',
    'customer.name': 'Tên khách', 'customer.cif': 'CIF', 'customer.phone': 'Điện thoại', 'customer.email': 'Email',
    'customer.priority_flags': 'Mức ưu tiên'
  };

  function priorityText(flags) {
    var names = { VIP: 'VIP', XU_LY_GAP: 'Xử lý gấp' };
    var list = priorityFlags({ priority_flags: flags || [] });
    return list.length ? list.map(function (x) { return names[x]; }).join(', ') : 'Thường';
  }

  function diffHtml(item, fields) {
    var r = reqOf(item);
    return '<div class="t2">' + Object.keys(fields).map(function (k) {
      var before = k.indexOf('customer.') === 0 ? (r ? r.customer[k.slice(9)] : '') : item[k];
      var after = fields[k];
      if (k === 'work_type_code') { before = wtName(before); after = wtName(after); }
      if (k === 'customer.priority_flags') { before = priorityText(before); after = priorityText(after); }
      return U.esc(FIELD_LABEL[k] || k) + ': <s>' + U.esc(before || '—') + '</s> &rarr; <b>' + U.esc(after || '—') + '</b>';
    }).join('<br>') + '</div>';
  }

  function timeInput(iso) {
    var at=iso ? new Date(iso).getTime() : NaN;
    return isFinite(at) ? new Date(at+7*3600000).toISOString().substring(0,19) : '';
  }

  function canCorrectTimes(item) {
    var u=me();
    return !!(u && !item.syncing && !item.carried_to_item_id && ['HUY','CHO_HOAN_THIEN','CHO_PHAN_CONG'].indexOf(item.status)===-1 &&
      (['KS_LS','QUAN_LY_LS'].indexOf(u.role)!==-1 || (u.role==='CAN_BO_LS' && item.assigned_user_id===u.user_id)));
  }

  function canConfirmDossierReceipt(item) {
    var u = me();
    return !!(u && u.role === 'CAN_BO_LS' && u.user_id === item.assigned_user_id && !item.syncing &&
      !item.dossier_received_at && item.status !== 'HUY' && !LSTiming.awaitingReceipt(item.status));
  }

  function editTimes(id, suggested) {
    var i=U.byId(st().items,'item_id',id);
    if(!i || !canCorrectTimes(i))return;
    ui.openDialog('Sửa thời gian hồ sơ', '<form data-form="edit-times" data-id="'+U.attr(id)+'" data-version="'+i.version+'">'+
      (suggested && Object.keys(suggested).length ? '<p class="t2">Mốc từ nhật ký · chờ xác nhận</p>' : '')+
      ui.field('Giờ nhận hồ sơ đầy đủ',ui.input('dossier_received_at',timeInput(i.dossier_received_at || suggested && suggested.dossier_received_at),{type:'datetime-local',required:true,attrs:' step="1"'}))+
      (i.status==='HOAN_THANH_LS'?ui.field('Giờ hoàn thành',ui.input('completed_at',timeInput(i.completed_at || suggested && suggested.completed_at),{type:'datetime-local',required:true,attrs:' step="1"'})): '')+
      ui.field('Lý do điều chỉnh',ui.textarea('reason','',{required:true}))+
      '<p class="hint">Giờ Việt Nam (UTC+7)</p>'+ui.formEnd('Lưu thời gian')+'</form>',{sub:itemRef(i)});
  }

  function localDueDate(iso) {
    var at = iso ? new Date(new Date(iso).getTime() + 7 * 3600000) : null;
    return at && isFinite(at.getTime()) ? at.toISOString().slice(0, 10) : U.localDate();
  }

  function changeDueDate(id) {
    var i = U.byId(st().items, 'item_id', id);
    if (!i || !canChangeDueDate(i)) return;
    ui.openDialog('Đổi hạn xử lý', '<form data-form="change-due-date" data-id="' + U.attr(id) + '" data-version="' + U.attr(i.version) + '">' +
      ui.field('Ngày hạn mới', ui.input('due_date', localDueDate(i.due_at), { type: 'date', required: true })) +
      ui.field('Lý do điều chỉnh', ui.textarea('reason', '', { required: true, placeholder: 'Ví dụ: khách hàng đổi lịch làm việc' })) +
      '<p class="hint">Giữ nguyên giờ trong hạn hiện tại.</p>' +
      ui.formEnd('Lưu hạn mới') + '</form>', { sub: itemRef(i) + ' · ' + productLabel(i) });
  }

  function submitDueDate(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    if (!i || !canChangeDueDate(i) || form.getAttribute('data-waiting')) return;
    var data = new FormData(form), day = String(data.get('due_date') || ''), reason = String(data.get('reason') || '').trim();
    var dayCheck = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T00:00:00Z') : null;
    if (!dayCheck || !isFinite(dayCheck.getTime()) || dayCheck.toISOString().slice(0, 10) !== day || !reason) {
      ui.toast('Chọn ngày hạn mới và ghi lý do điều chỉnh.', 'err'); return;
    }
    var oldLocal = new Date(new Date(i.due_at).getTime() + 7 * 3600000);
    var hhmm = isFinite(oldLocal.getTime()) ? oldLocal.toISOString().slice(11, 16) : '18:00';
    var dueAt = new Date(day + 'T' + hhmm + ':00+07:00').toISOString();
    var expectedVersion = Number(form.getAttribute('data-version'));
    form.setAttribute('data-waiting', '1');
    if (U.isGas()) {
      LS.api.rescheduleItem(i.item_id, dueAt, reason, expectedVersion).then(function (result) {
        i.due_at = result.due_at || dueAt;
        i.due_at_override = result.due_at_override || dueAt;
        i.version = Number(result.version) || expectedVersion + 1;
        ui.closeDialog(); LS.app.render(); ui.toast('Đã đổi hạn xử lý.', 'ok');
      }).catch(function (e) { form.removeAttribute('data-waiting'); ui.toast(e.message || 'Không đổi được hạn xử lý.', 'err'); });
      return;
    }
    i.due_at = dueAt; i.due_at_override = dueAt; i.version = expectedVersion + 1;
    logEvent(i.item_id, 'DOI_HAN_XU_LY', reason);
    U.save(); ui.closeDialog(); LS.app.render(); ui.toast('Đã đổi hạn xử lý.', 'ok');
  }

  function supplementSection(i) {
    var s = i.supplement;
    if (!s || !s.at) return '';
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle('Hẹn bổ sung') + ui.kv([
      ['Ngày giờ', U.fmtDT(s.at)],
      ['Ghi chú', s.note || '—'],
      ['Ghi bởi', (userName(s.by) || s.by || '—') + (s.created_at ? ' · ' + U.fmtDT(s.created_at) : '')]
    ]) + '</div>';
  }

  function submitTimes(form) {
    var i=U.byId(st().items,'item_id',form.getAttribute('data-id'));
    if(!i || !canCorrectTimes(i) || form.getAttribute('data-waiting'))return;
    var data=new FormData(form),values={},reason=String(data.get('reason') || '').trim();
    try {
      ['dossier_received_at','completed_at'].forEach(function(k){values[k]=data.get(k)?new Date(String(data.get(k))+'+07:00').toISOString():'';});
      if(!reason || !values.dossier_received_at)throw new Error('Nhập giờ nhận hồ sơ và lý do.');
      if(values.completed_at && new Date(values.completed_at)<new Date(values.dossier_received_at))throw new Error('Giờ hoàn thành phải sau giờ nhận.');
    } catch(e){ui.toast(e.message,'err');return;}
    form.setAttribute('data-waiting','1');
    if(U.isGas()) {
      LS.api.correctItemTimes(i.item_id,values,reason,Number(form.getAttribute('data-version'))).then(function(){
        timeReportCache=null; reportCache=null;ui.closeDialog();ui.toast('Đã lưu điều chỉnh thời gian.','ok');LS.app.refreshServer('',true).then(function(){ if(timingAuditCache)loadTimingAudit(); });
      }).catch(function(e){form.removeAttribute('data-waiting');ui.toast(e.message,'err');});
      return;
    }
    Object.assign(i,values,{timing_source:'CORRECTED',version:i.version+1});
    var wt=wtOf(i);i.due_at=LSTiming.deadline(i,wt?wt.sla_hours:8,D.processingCalendar(st()),i.completed_at || U.now());
    logEvent(i.item_id,'SUA_THOI_GIAN',reason);U.save();timeReportCache=null;reportCache=null;ui.closeDialog();LS.app.render();
  }

  var timeReportCache=null, timeReportSequence=0;
  var timingAuditCache=null, timingAuditSequence=0;
  var TIMING_PROBLEMS={MISSING_HANDOFF:'Thiếu giờ nhận hồ sơ',MISSING_COMPLETION:'Thiếu giờ hoàn thành',UNKNOWN_OPERATOR:'Chưa rõ người xử lý',INVALID_ORDER:'Mốc thời gian chưa hợp lệ'};
  function loadTimingAudit() {
    if(['CAN_BO_LS','KS_LS','QUAN_LY_LS'].indexOf(me().role)===-1)return;
    var seq=++timingAuditSequence;timingAuditCache={loading:true};LS.app.render();
    var job=U.isGas()?LS.api.getTimingAudit():Promise.resolve({checked:visibleItems().length,history_complete:true,rows:visibleItems().filter(function(i){return canCorrectTimes(i)&&(!i.dossier_received_at || LSTiming.sessions(i,U.now()).some(function(s){return !s.user_id;}));}).map(function(i){return {item_id:i.item_id,product_name:i.product_name,problems:(!i.dossier_received_at?['MISSING_HANDOFF']:[]).concat(LSTiming.sessions(i,U.now()).some(function(s){return !s.user_id;})?['UNKNOWN_OPERATOR']:[]),suggestions:{},sources:{},unknown_sessions:LSTiming.sessions(i,U.now()).filter(function(s){return !s.user_id;}).length};})});
    job.then(function(data){if(seq!==timingAuditSequence)return;timingAuditCache={data:data};LS.app.render();})
      .catch(function(e){if(seq!==timingAuditSequence)return;timingAuditCache={error:e.message};LS.app.render();});
  }
  function timingAuditBlock() {
    if(!timingAuditCache)return '';
    if(timingAuditCache.loading)return '<p class="t2">Đang rà soát mốc thời gian…</p>';
    if(timingAuditCache.error)return ui.banner('danger','Chưa rà soát được',timingAuditCache.error);
    var data=timingAuditCache.data;
    return ui.block({title:'Mốc thời gian cần xác nhận · kỳ hiện tại',count:data.rows.length,icon:'clock',body:
      (!data.history_complete?ui.banner('warn','Nhật ký chưa quét hết',''): '')+
      ui.table([{label:'Hồ sơ'},{label:'Cần kiểm tra'},{label:'Mốc từ nhật ký'},{label:'Thao tác'}],data.rows.map(function(r){
        var i=U.byId(visibleItems(),'item_id',r.item_id), suggestions=r.suggestions || {};
        var request=i && reqOf(i);
        return {cells:[U.esc(i?itemRef(i):r.item_id)+(request?'<div class="t1">'+U.esc(request.customer.name)+'</div>':'')+'<div class="t2">'+U.esc(r.product_name)+'</div>',
          r.problems.map(function(p){return U.esc(TIMING_PROBLEMS[p] || p);}).join('<br>'),
          Object.keys(suggestions).map(function(k){return (k==='dossier_received_at'?'Nhận: ':'Hoàn thành: ')+U.fmtDT(suggestions[k]);}).join('<br>') || 'Chưa có mốc',
          i && canCorrectTimes(i) ? '<div class="act-row">'+ui.btn('Xác nhận mốc',{sm:true,act:'timing-fix',data:' data-id="'+U.attr(r.item_id)+'"'})+
            (r.unknown_sessions?ui.btn('Người xử lý phiên cũ',{sm:true,act:'timing-owner',data:' data-id="'+U.attr(r.item_id)+'"'}):'')+'</div>' : '']};
      }),{icon:'check',title:'Không có hồ sơ cần xác nhận',text:'Đã kiểm tra '+data.checked+' hồ sơ.'})});
  }
  function fixAuditedTimes(id) {
    var rows=timingAuditCache && timingAuditCache.data && timingAuditCache.data.rows || [];
    var issue=U.byId(rows,'item_id',id);editTimes(id,issue && issue.suggestions);
  }
  function confirmOwner(id) {
    var i=U.byId(visibleItems(),'item_id',id);if(!i || !canCorrectTimes(i))return;
    var spans=LSTiming.sessions(i,U.now()).filter(function(s){return !s.user_id;}),own=me().role==='CAN_BO_LS';
    if(!spans.length){ui.toast('Không còn phiên chưa xác định người xử lý.','warn');return;}
    var owners=st().users.filter(function(u){return u.role==='CAN_BO_LS' && (!own || u.user_id===me().user_id);});
    var body=spans.map(function(s,index){return '<div data-owner-start="'+U.attr(new Date(s.start).toISOString())+'">'+
        '<p class="t2">'+U.fmtDT(new Date(s.start).toISOString())+' → '+U.fmtDT(new Date(s.end).toISOString())+'</p>'+
        ui.field('Người xử lý phiên '+(index+1),ui.select('owner_'+index,owners.map(function(u){return [u.user_id,u.full_name];}),'',{blank:'Chưa xác định'}))+'</div>';}).join('')+
      ui.field('Lý do / căn cứ xác nhận',ui.textarea('reason','',{required:true}))+ui.formEnd('Lưu xác nhận');
    ui.openDialog('Người xử lý phiên cũ','<form data-form="confirm-time-owner" data-id="'+U.attr(id)+'" data-version="'+i.version+'">'+body+'</form>',{sub:itemRef(i)});
  }
  function submitOwner(form) {
    if(form.getAttribute('data-waiting'))return;
    var data=new FormData(form),reason=String(data.get('reason') || '').trim(),i=U.byId(visibleItems(),'item_id',form.getAttribute('data-id'));
    if(!i || !canCorrectTimes(i))return;
    var selections=Array.prototype.map.call(form.querySelectorAll('[data-owner-start]'),function(el,index){return {start:el.getAttribute('data-owner-start'),user_id:String(data.get('owner_'+index) || '')};}).filter(function(s){return s.user_id;});
    if(!reason || !selections.length){ui.toast('Chọn người xử lý ít nhất một phiên và nhập căn cứ xác nhận.','err');return;}
    if(!U.isGas()){ui.toast('Lưu xác nhận phiên cũ trên ứng dụng GAS.','warn');return;}
    form.setAttribute('data-waiting','1');
    LS.api.confirmLegacySessionOwner(i.item_id,selections,reason,Number(form.getAttribute('data-version'))).then(function(){
      ui.closeDialog();timeReportCache=null;personalTimeCache=null;reportCache=null;ui.toast('Đã xác nhận người xử lý.','ok');
      return LS.app.refreshServer('',true);
    }).then(loadTimingAudit).catch(function(e){form.removeAttribute('data-waiting');ui.toast(e.message,'err');});
  }
  function timeReport() {
    var title=me().role==='CAN_BO_LS'?'Thời gian của tôi':'Thời gian & SLA';
    var today=U.localDate(),own=me().role==='CAN_BO_LS',data=timeReportCache && timeReportCache.data;
    var body='<form data-form="time-report"><div class="report-filters">'+
      ui.field('Từ ngày',ui.input('from',f('time-report','from',today.substring(0,7)+'-01'),{type:'date',required:true}))+
      ui.field('Đến ngày',ui.input('to',f('time-report','to',today),{type:'date',required:true}))+
      (!own?ui.field('Cán bộ LS',ui.select('user_id',staffList(true).map(function(u){return [u.user_id,u.full_name];}),f('time-report','user_id',''),{blank:'Tất cả cán bộ'})):'')+
      ui.field('Nghiệp vụ',ui.select('work_type_code',st().workTypes.map(function(w){return [w.code,w.name];}),f('time-report','work_type_code',''),{blank:'Tất cả nghiệp vụ'}))+
      '<button class="btn btn-primary" type="submit"'+(timeReportCache && timeReportCache.loading?' disabled':'')+'>Xem báo cáo</button>'+
      (['CAN_BO_LS','KS_LS','QUAN_LY_LS'].indexOf(me().role)!==-1?ui.btn('Rà soát mốc thời gian',{act:'timing-audit',sm:true,disabled:timingAuditCache && timingAuditCache.loading}):'')+'</div></form>'+timingAuditBlock();
    if(timeReportCache && timeReportCache.error)body+=ui.banner('danger','Không lấy được báo cáo',timeReportCache.error);
    if(timeReportCache && timeReportCache.loading)body+='<p class="t2">Đang tổng hợp thời gian…</p>';
    if(!data)return ui.block({title:title,icon:'clock',body:body+(!timeReportCache?ui.empty({icon:'clock',title:'Chưa chạy báo cáo',text:''}):'')});
    var metrics=[ui.metric(own?'Giờ tôi đã dùng':'Giờ cán bộ đã dùng',D.durationLabel(data.total.occupied_hours)),
      ui.metric(own?'Giờ xử lý hồ sơ':'Giờ xử lý theo hồ sơ',D.durationLabel(data.total.processing_hours)),ui.metric('Hoàn thành',data.total.completed,'ok')];
    if(own)metrics.push(ui.metric('Tác nghiệp khác',data.total.other_operation_count || 0),
      ui.metric('Giờ tác nghiệp khác',D.durationLabel(data.total.other_operation_hours || 0)));
    if(data.total.overtime_hours>0)metrics.push(ui.metric('Làm thêm ngoài giờ',D.durationLabel(data.total.overtime_hours)));
    body+='<p class="t2">Kỳ '+U.fmtDate(data.from)+' → '+U.fmtDate(data.to)+'</p>'+ui.strip(metrics);
    if(data.other_work && data.other_work.length)body+=ui.sectionTitle('Việc khác theo loại')+
      ui.table([{label:'Việc'},{label:'Số lượng',cls:'num'},{label:'Thời gian',cls:'num'}],data.other_work.map(function(w){
        var type=otherWorkType(w.category);
        return {cells:[U.esc(w.label || (type && type.label) || w.category),'<span class="tid">'+w.quantity+(type?' '+U.esc(type.unit):'')+'</span>',
          '<span class="tid">'+(w.minutes?U.esc(D.durationLabel(w.minutes/60)):'')+'</span>']};}));
    if(data.quality.missing_handoff || data.quality.unattributed_sessions || data.quality.other_operations_scan_limited)body+=ui.banner('warn','Dữ liệu cần xác nhận',
      [data.quality.missing_handoff?data.quality.missing_handoff+' hồ sơ thiếu giờ nhận':'',data.quality.unattributed_sessions?data.quality.unattributed_sessions+' phiên chưa rõ người xử lý':'',
        data.quality.other_operations_scan_limited?'Nhật ký tác nghiệp khác vượt giới hạn quét':''].filter(Boolean).join(' · '));
    body+=LS.charts.columns({title:'Tổng thời gian mỗi ngày',labelHead:'Ngày',labels:data.days.map(function(d){return U.fmtDate(d.day);}),unit:' phút',
        series:[{name:own?'Giờ tôi đã dùng':'Giờ cán bộ',values:data.days.map(function(d){return d.occupied_hours*60;})},{name:own?'Giờ xử lý hồ sơ':'Giờ hồ sơ',values:data.days.map(function(d){return d.processing_hours*60;}),slot:2}]})+
      ui.table([{label:'Ngày'},{label:'Cán bộ'},{label:'Nghiệp vụ'},{label:'Sản phẩm'},{label:own?'Số hồ sơ / lượt':'Số hồ sơ',cls:'num'},
        {label:'Giờ hồ sơ',cls:'num'},{label:own?'Giờ của tôi trong nhóm':'Giờ cán bộ trong nhóm',cls:'num'},{label:'Hoàn thành',cls:'num'},{label:'SLA nhận→xong TB',cls:'num'},{label:'Toàn trình tạo→xong TB',cls:'num'},{label:'Đúng hạn / đủ mốc',cls:'num'}],
        data.rows.map(function(r){return {cells:[U.fmtDate(r.day),U.esc(r.user_name || userName(r.user_id) || 'Chưa xác định'),U.esc(r.work_type_name || wtName(r.work_type_code)),U.esc(r.product_name || '—'),r.items,D.durationLabel(r.processing_hours),D.durationLabel(r.occupied_hours),r.completed,D.durationLabel(r.avg_sla_hours),D.durationLabel(r.avg_cycle_hours),r.on_time+' / '+r.timed_completed]};}),
        {icon:'clock',title:'Không có giờ xử lý trong khoảng này',text:''});
    return ui.block({title:me().role==='CAN_BO_LS'?'Thời gian làm việc cá nhân':'Theo ngày · cán bộ · nghiệp vụ',icon:'clock',actions:ui.btn('Tải Excel',{act:'time-export',sm:true,icon:'file'}),body:body});
  }

  function runTimeReport(form) {
    if(timeReportCache && timeReportCache.loading)return;
    var data=new FormData(form),opts={};
    ['from','to','user_id','work_type_code'].forEach(function(k){opts[k]=String(data.get(k)||'');setFilter('time-report',k,opts[k]);});
    if(me().role==='CAN_BO_LS')opts.user_id=me().user_id;
    if(!opts.from || !opts.to || opts.from>opts.to){ui.toast('Chọn khoảng ngày hợp lệ.','err');return;}
    var seq=++timeReportSequence;timeReportCache={loading:true};LS.app.render();
    var localItems=st().items.map(function(i){return Object.assign({},i,{sla_no_fault:D.slaExempt(i,st())});});
    if(me().role==='ADMIN')localItems=localItems.map(function(i){return Object.assign({},i,{product_name:'',processing_sessions:LSTiming.array(i,'processing_sessions').map(function(s){return Object.assign({},s,{product_name:''});})});});
    var attributed={};
    (st().other_work || []).forEach(function(w){if(w && !w.canceled_at && w.operation_id && Number(w.minutes)>0)attributed[w.operation_id]=true;});
    var localOperations=(st().other_operations || []).map(function(op){return Object.assign({},op,{closed:true,counted:op.category==='KHAC' && !!attributed[op.operation_id]});}),now=U.now();
    if(st().global_pause)localOperations.push(Object.assign({user_id:me().user_id,ended_at:now},st().global_pause,{closed:false}));
    var localOpts=Object.assign({},opts,{now:now,operations:localOperations});
    var job=U.isGas()?LS.api.getTimeReport(opts):Promise.resolve(LSTiming.report(localItems,D.processingCalendar(st()),localOpts)).then(function(report){
      report.other_work=opts.work_type_code?[]:D.otherWorkSummary(st().other_work,opts.from,opts.to,opts.user_id);return report;});
    job.then(function(data){if(seq!==timeReportSequence)return;timeReportCache={data:data};LS.app.render();})
      .catch(function(e){if(seq!==timeReportSequence)return;timeReportCache={error:e.message};LS.app.render();});
  }

  function exportTimeReport() {
    var data=timeReportCache && timeReportCache.data;if(!data)return;
    LS.app.downloadXlsx('thoi-gian-sla-'+data.from+'_'+data.to,[
      {name:'Thời gian theo ngày',rows:[['Ngày','User','Cán bộ','Nghiệp vụ','Sản phẩm','Số hồ sơ','Giờ hồ sơ','Giờ cán bộ trong nhóm','Hoàn thành','SLA nhận-xong TB','Toàn trình tạo-xong TB','Đúng hạn','Đủ mốc']].concat(data.rows.map(function(r){return [r.day,r.user_id,r.user_name || userName(r.user_id),r.work_type_name || wtName(r.work_type_code),r.product_name,r.items,r.processing_hours,r.occupied_hours,r.completed,r.avg_sla_hours,r.avg_cycle_hours,r.on_time,r.timed_completed];}))},
      {name:'Tổng và chất lượng',rows:[['Mục','Giá trị'],['Từ ngày',data.from],['Đến ngày',data.to],['Giờ cán bộ gộp trùng',data.total.occupied_hours],['Giờ hồ sơ',data.total.processing_hours],['Giờ làm thêm ngoài giờ',data.total.overtime_hours || 0],['Lượt tác nghiệp khác',data.total.other_operation_count || 0],['Giờ tác nghiệp khác',data.total.other_operation_hours || 0],['Thiếu mốc bàn giao',data.quality.missing_handoff],['Phiên chưa rõ người',data.quality.unattributed_sessions],['Công thức',data.formula_version]]}
    ]);
  }

  /* ============================ Màn: phân giao toàn phòng (chỉ xem) ============================ */

  var teamCache = null, teamSequence = 0;

  /** Tuần (T2–CN) chứa ngày đang chọn. */
  function teamRange() {
    var d = new Date(f('team', 'anchor', U.localDate()) + 'T12:00:00');
    if (isNaN(d.getTime())) d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var from = U.localDate(d);
    d.setDate(d.getDate() + 6);
    return { from: from, to: U.localDate(d) };
  }

  /** Chế độ demo không có máy chủ: dựng cùng cấu trúc từ dữ liệu trong trình duyệt. */
  function localTeamRows(range) {
    var rows = [];
    st().items.forEach(function (i) {
      if (!i.assigned_user_id || i.status === 'HUY') return;
      var r = reqOf(i), c = (r && r.customer) || {};
      var day = i.assigned_at ? U.localDate(new Date(i.assigned_at)) : String(i.occurrence_date || '').substring(0, 10);
      var inWindow = day >= range.from && day <= range.to;
      if (!inWindow && !(D.STATUS[i.status] && D.STATUS[i.status].open)) return;
      rows.push({
        item_id: i.item_id, customer_name: c.name || '', cif: c.cif || '',
        cust_key: c.cif ? 'cif:' + String(c.cif).toLowerCase() : (c.phone ? 'tel:' + String(c.phone).replace(/\D/g, '') : 'ten:' + String(c.name || '').toLowerCase()),
        unit_name: r ? unitName(r.unit_id) : '', work_type_name: wtName(i.work_type_code), product_name: i.product_name || '',
        assigned_user_id: i.assigned_user_id, assigned_name: userName(i.assigned_user_id), assigned_at: i.assigned_at || '',
        status: i.status, due_at: i.due_at || '', completed_at: i.completed_at || '', in_window: inWindow, is_mine: i.assigned_user_id === st().session
      });
    });
    return { from: range.from, to: range.to, rows: rows, capped: false };
  }

  function loadTeam(force) {
    var range = teamRange(), key = range.from + '|' + range.to;
    if (!force && teamCache && teamCache.key === key) return;
    var seq = ++teamSequence;
    teamCache = { key: key, loading: true };
    var job = U.isGas() ? LS.api.getTeamAssignments({ from: range.from, to: range.to }) : Promise.resolve(localTeamRows(range));
    job.then(function (data) { if (seq !== teamSequence) return; teamCache = { key: key, data: data }; LS.app.render(); })
      .catch(function (e) { if (seq !== teamSequence) return; teamCache = { key: key, error: e.message || 'Không tải được dữ liệu.' }; LS.app.render(); });
  }

  function runTeamView(form) {
    var data = new FormData(form);
    ['anchor', 'staff', 'q', 'show'].forEach(function (k) { setFilter('team', k, String(data.get(k) || '')); });
    if (!f('team', 'anchor', '')) setFilter('team', 'anchor', U.localDate());
    loadTeam(true);
    LS.app.render();
  }

  function teamStatusTag(status) {
    var m = D.STATUS[status];
    return m ? ui.tag(m.label, m.tone || 'neutral') : ui.tag(status, 'neutral');
  }

  /** Gom các dòng theo khách; nhóm nào có từ hai việc trở lên là nhóm cần chú ý. */
  function teamGroups(rows) {
    var groups = {}, order = [];
    rows.forEach(function (r) {
      if (!groups[r.cust_key]) { groups[r.cust_key] = []; order.push(r.cust_key); }
      groups[r.cust_key].push(r);
    });
    return order.map(function (k) {
      var list = groups[k];
      var staff = {}, types = {};
      list.forEach(function (r) { staff[r.assigned_user_id] = true; types[r.work_type_name] = (types[r.work_type_name] || 0) + 1; });
      return {
        key: k, rows: list, multi: list.length > 1,
        dupWork: Object.keys(types).some(function (t) { return types[t] > 1; }),
        manyStaff: Object.keys(staff).length > 1,
        latest: list.reduce(function (m, r) { return String(r.assigned_at) > m ? String(r.assigned_at) : m; }, '')
      };
    });
  }

  function team() {
    var u = me();
    if (!u || ['CAN_BO_LS', 'KS_LS', 'QUAN_LY_LS'].indexOf(u.role) === -1) return ui.banner('warn', 'Không có quyền xem', 'Màn này dành cho cán bộ, kiểm soát và quản lý LS.');
    loadTeam(false);
    var range = teamRange();
    var staffOpts = st().users.filter(function (x) { return x.role === 'CAN_BO_LS' && x.active; }).map(function (x) { return [x.user_id, x.full_name]; });
    var form = '<form data-form="team-view"><div class="report-filters">' +
      ui.field('Tuần chứa ngày', ui.input('anchor', f('team', 'anchor', U.localDate()), { type: 'date', required: true })) +
      ui.field('Cán bộ LS', ui.select('staff', staffOpts, f('team', 'staff', ''), { blank: 'Tất cả cán bộ' })) +
      ui.field('Hiển thị', ui.select('show', [['multi', 'Chỉ khách có nhiều việc']], f('team', 'show', ''), { blank: 'Tất cả hồ sơ' })) +
      ui.field('Tìm khách / CIF', ui.input('q', f('team', 'q', ''), { placeholder: 'Tên khách hoặc CIF' })) +
      '<span class="report-range-note">' + U.esc(U.fmtDate(range.from) + ' → ' + U.fmtDate(range.to)) + '</span>' +
      '<button class="btn btn-primary btn-sm" type="submit"' + (teamCache && teamCache.loading ? ' disabled' : '') + '>' + U.icon('search', 15) + ' Xem</button>' +
      '</div></form>';
    var head = function (body) { return ui.block({ title: 'Phân giao toàn phòng', icon: 'users', note: 'Chỉ xem', filters: form, body: body }); };
    if (teamCache && teamCache.error) return head(ui.banner('danger', 'Không lấy được dữ liệu', teamCache.error));
    if (!teamCache || teamCache.loading || !teamCache.data) return head('<p class="t2" style="padding:1rem">Đang tải phân giao toàn phòng…</p>');

    var data = teamCache.data;
    var groups = teamGroups(data.rows);
    var q = String(f('team', 'q', '')).trim().toLowerCase(), staffId = f('team', 'staff', ''), multiOnly = f('team', 'show', '') === 'multi';
    var shown = groups.filter(function (g) {
      if (multiOnly && !g.multi) return false;
      return g.rows.some(function (r) {
        if (staffId && r.assigned_user_id !== staffId) return false;
        return !q || (r.customer_name + ' ' + r.cif).toLowerCase().indexOf(q) !== -1;
      });
    }).sort(function (a, b) {
      return (b.multi ? 1 : 0) - (a.multi ? 1 : 0) || String(b.latest).localeCompare(String(a.latest));
    });

    var allRows = data.rows, openRows = allRows.filter(function (r) { return D.STATUS[r.status] && D.STATUS[r.status].open; });
    var strip = ui.strip([
      ui.metric('Hồ sơ đã giao', allRows.length), ui.metric('Đang mở', openRows.length, 'info'),
      ui.metric('Khách có nhiều việc', groups.filter(function (g) { return g.multi; }).length, 'warn'),
      ui.metric('Nghi trùng việc', groups.filter(function (g) { return g.dupWork; }).length, groups.some(function (g) { return g.dupWork; }) ? 'danger' : '')
    ]);

    var rowsHtml = [];
    shown.forEach(function (g) {
      g.rows.forEach(function (r, idx) {
        if (staffId && r.assigned_user_id !== staffId && !multiOnly) return;
        var others = g.rows.filter(function (o) { return o !== r; });
        var note = '';
        if (others.length) {
          var dup = others.filter(function (o) { return o.work_type_name === r.work_type_name; });
          var tags = [];
          if (dup.length) tags.push(ui.tag('Nghi trùng việc', 'danger'));
          if (g.manyStaff) tags.push(ui.tag('Nhiều người cùng khách', 'warn'));
          else tags.push(ui.tag('Khách có ' + g.rows.length + ' việc', 'info'));
          note = '<div>' + tags.join(' ') + '</div><div class="t2">' + others.map(function (o) {
            return U.esc((o.is_mine ? 'Bạn' : o.assigned_name) + ' · ' + o.work_type_name + ' (' + ((D.STATUS[o.status] || {}).label || o.status) + ')');
          }).join('<br>') + '</div>';
        }
        rowsHtml.push({ cls: g.dupWork ? 'flag' : '', cells: [
          '<div class="t1">' + U.esc(r.customer_name || '—') + '</div><div class="t2">' + U.esc(r.cif ? 'CIF ' + r.cif : 'Chưa có CIF') + '</div>',
          '<div class="t1">' + U.esc(r.work_type_name) + '</div>' + (r.product_name ? '<div class="t2">' + U.esc(r.product_name) + '</div>' : ''),
          U.esc(r.unit_name),
          '<div class="t1">' + U.esc(r.assigned_name || '—') + '</div>' + (r.is_mine ? '<div class="t2">Việc của bạn</div>' : ''),
          r.assigned_at ? U.esc(U.fmtDT(r.assigned_at)) : '<span class="t2">—</span>',
          teamStatusTag(r.status), note || '<span class="t2">—</span>'
        ] });
      });
    });

    var table = ui.table(
      [{ label: 'Khách hàng' }, { label: 'Loại việc' }, { label: 'Đơn vị gửi' }, { label: 'Cán bộ' }, { label: 'Giao lúc' }, { label: 'Trạng thái' }, { label: 'Lưu ý' }],
      rowsHtml, { icon: 'users', title: 'Không có hồ sơ phù hợp', text: '' });
    return head(strip + (data.capped ? ui.banner('warn', 'Danh sách đã được cắt bớt', 'Chỉ hiện 3.000 hồ sơ mới nhất; hãy chọn tuần khác.') : '') + table);
  }

  /* ============================ Màn: việc của tôi ============================ */

  function mine() {
    var all = personalOpenItems();
    var tabs=[['all','Đang mở'],['active','Đang làm'],['queued','Chờ bắt đầu'],['waiting','Chờ làm tiếp'],['paused','Chờ khách / Tạm dừng']];
    function match(tab,i){return tab==='all' || tab==='active' && LSTiming.workState(i)==='ACTIVE' ||
      tab==='queued' && (i.status==='DA_PHAN_CONG' || LSTiming.workState(i)==='QUEUED') ||
      tab==='waiting' && LSTiming.workState(i)==='WAITING' || tab==='paused' && ['TAM_DUNG','DANG_HEN_KH','CAN_BO_SUNG','CHUA_GIAO_HO_SO'].indexOf(i.status)!==-1;}
    var tab=f('mine','tab','all'),counts={};tabs.forEach(function(t){counts[t[0]]=all.filter(function(i){return match(t[0],i);}).length;});
    var list = sortItems(applyFilters('mine', all).filter(function(i){return match(tab,i);}), 'mine');
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });
    var fresh = all.filter(function (i) { return i.status === 'DA_PHAN_CONG'; });

    return (late.length ? ui.banner('danger', late.length + ' việc đã quá hạn xử lý', '') : '') +
      ui.block({
        title: 'Việc được giao', count: list.length + '/' + all.length, icon: 'briefcase', compact: true,
        filters: queueTabs(tab,counts,tabs,'mine-tab')+listToolbar('mine', { status: true, type: true }, true),
        // Bỏ cột cán bộ: mọi dòng ở đây đều là việc của chính người đang xem.
        body: itemTable(list, ['code', 'customer', 'requestor', 'contact', 'work', 'progress', 'time', 'status', 'act'], {
          icon: 'briefcase', title: 'Chưa có việc nào được giao', text: ''
        }, 'mine')
      });
  }

  var personalTimeCache=null;
  /** Giờ làm 7 ngày gần nhất của cán bộ đang đăng nhập: máy chủ trả báo cáo giờ; chạy cục bộ thì tính cùng công thức (có cả giờ làm thêm ngoài giờ). */
  function personalDays(items,now) {
    if(U.isGas())return personalTimeCache && personalTimeCache.data ? personalTimeCache.data.days : [];
    var today=LSTiming.dayKey(now.toISOString()),from=LSTiming.dayKey(new Date(Date.parse(today+'T00:00:00+07:00')-6*86400000).toISOString());
    var timedItems=items.map(function(i){return Object.assign({},i,{sla_no_fault:D.slaExempt(i,st())});});
    return LSTiming.report(timedItems,D.processingCalendar(st()),{from:from,to:today,user_id:st().session,now:now.toISOString()}).days;
  }

  function personalSpans(item,now) {
    return LSTiming.sessions(item,now.toISOString()).filter(function(s){return s.user_id===st().session;}).map(function(s){return [s.start,s.end];});
  }

  function personalHoursBetween(items,from,to,now) {
    var spans=items.reduce(function(all,item){return all.concat(personalSpans(item,now));},[])
      .map(function(span){return [Math.max(span[0],from),Math.min(span[1],to)];})
      .filter(function(span){return span[1]>span[0];}).sort(function(a,b){return a[0]-b[0];});
    var merged=spans.reduce(function(out,span){var last=out[out.length-1];
      if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else out.push(span.slice());return out;},[]);
    return merged.reduce(function(total,span){return total+(LSTiming.between(new Date(span[0]).toISOString(),new Date(span[1]).toISOString(),D.processingCalendar(st()))||0);},0);
  }

  function personalOpenItems() {
    return visibleItems().filter(function (i) { return isOpenItem(i) && !i.carried_to_item_id; });
  }

  function personalBacklogActions(item) {
    var id = U.attr(item.item_id), out = [];
    if (item.syncing) return '<span class="t2" role="status">Đang lưu…</span>';
    if (st().global_pause) return '<span class="t2">Đang tạm dừng toàn bộ</span>';
    if (canFocus(item) && LSTiming.workState(item) !== 'ACTIVE') {
      out.push(ui.btn(LSTiming.workState(item) === 'WAITING' ? 'Làm tiếp' : 'Làm ngay', {
        kind: 'primary', sm: true, act: 'start-work', disabled: focusBusy, data: ' data-id="' + id + '"'
      }));
    }
    actionsFor(item).filter(function (a) { return a.primary; }).sort(function (a, b) {
      return (a.to === 'HOAN_THANH_LS' ? 0 : a.rank || 5) - (b.to === 'HOAN_THANH_LS' ? 0 : b.rank || 5);
    }).slice(0, 2).forEach(function (a) {
      out.push(ui.btn(a.short || a.label, {
        kind: out.length ? 'line' : 'primary', sm: true, act: 'flow', icon: a.to === 'HOAN_THANH_LS' ? 'check' : '',
        title: a.label + (a.to === 'HOAN_THANH_LS' ? ' (C)' : ''),
        data: ' data-id="' + id + '" data-to="' + U.attr(a.to) + '"' + (a.to === 'HOAN_THANH_LS' ? ' aria-keyshortcuts="c"' : '')
      }));
    });
    return '<div class="act-row">' + out.join('') + '</div>';
  }

  /**
   * HĐTD/HĐTC đếm đúng như dòng "Tồn soạn hiện nay" của bảng Kết quả thực hiện (D.draftBacklogAt).
   * Hồ sơ chưa tiếp nhận hoặc đã dời ngày chưa vào tồn soạn nên có thẻ riêng, không đoán phần việc theo tên loại việc.
   */
  var PERSONAL_BACKLOG_PARTS = [
    { key: 'HDTD', label: 'HĐTD', kind: 'gold', title: 'Còn soạn HĐ tín dụng' },
    { key: 'HDTC', label: 'HĐTC', kind: 'info', title: 'Còn soạn HĐ thế chấp' },
    { key: 'KHO', label: 'Kho TSĐB', kind: 'violet', title: 'Còn nhập/xuất kho TSĐB' },
    { key: 'RLOS', label: 'RLOS', kind: 'warn', title: 'Còn giao dịch trên Rlos' },
    { key: 'CHUA_NHAN', label: 'Chưa nhận HS', kind: 'neutral', title: 'Chưa tiếp nhận hồ sơ: chưa tính vào tồn soạn' },
    { key: 'DOI_NGAY', label: 'Dời ngày', kind: 'neutral', title: 'Phòng/PGD đã dời sang ngày sau: chưa tính vào tồn soạn hôm nay' },
    { key: 'KHAC', label: 'Khác', kind: 'neutral', title: 'Việc khác' }
  ];

  /** Các phần việc chưa ghi nhận trên một hồ sơ đang mở; một hồ sơ có thể còn nhiều phần. */
  function personalBacklogKinds(item) {
    var wt = wtOf(item), today = LSTiming.dayKey(U.now());
    if (!D.dossierReceived(item)) return ['CHUA_NHAN'];
    var dueDay = String(item.occurrence_date || '').substring(0, 10);
    if (dueDay && dueDay > today) return ['DOI_NGAY'];
    var pending = D.draftBacklogAt(item, wt, today), kinds = [];
    var typeText = [item.work_type_code, wtName(item.work_type_code), wtGroup(item.work_type_code)].join(' ').toLowerCase();
    var result = D.resultCredit(item), saved = D.savedResultFlags(item) || {};
    if (pending.indexOf('TON_TIN_DUNG') !== -1) kinds.push('HDTD');
    if (pending.indexOf('TON_THE_CHAP') !== -1) kinds.push('HDTC');
    if (D.collateralStepKeys(item, wt).some(function (k) { return k !== 'HD_THE_CHAP' && !(result[k] && result[k].user_id); })) kinds.push('KHO');
    var rlos = result.RLOS || {};
    if ((/\brlos\b/.test(typeText) || D.dailyIsCredit(item, wt)) &&
        !rlos.user_id && saved.RLOS !== true) kinds.push('RLOS');
    if (!kinds.length) kinds.push('KHAC');
    return kinds;
  }

  /**
   * Hồ sơ vay kèm TSĐB mới: HĐ thế chấp nằm ở việc kèm TSĐB. Việc kèm chưa tiếp nhận thì HĐTC chưa vào tồn soạn,
   * nhắc cán bộ để khỏi tưởng số tồn HĐTC bị thiếu.
   */
  function linkedMortgageHint(item) {
    if (!item || item.collateral_mode !== 'MOI') return '';
    var child = st().items.filter(function (k) {
      return k.parent_item_id === item.item_id && k.status !== 'HUY' && !k.carried_to_item_id &&
        D.collateralStepKeys(k, wtOf(k)).indexOf('HD_THE_CHAP') !== -1;
    })[0];
    if (!child) return '<div class="t2 backlog-hint">HĐTC: chưa có việc kèm TSĐB</div>';
    if ((D.resultCredit(child).HD_THE_CHAP || {}).user_id) return '';
    if (!D.dossierReceived(child)) {
      return '<div class="t2 backlog-hint">HĐTC ở việc kèm ' + U.esc(itemRef(child)) + ' — chưa tiếp nhận nên chưa vào tồn</div>';
    }
    return '<div class="t2 backlog-hint">HĐTC tính ở việc kèm ' + U.esc(itemRef(child)) + '</div>';
  }

  function backlogKindsHtml(item) {
    var kinds = personalBacklogKinds(item);
    return '<div class="backlog-kind-list">' + kinds.map(function (key) {
      var part = PERSONAL_BACKLOG_PARTS.filter(function (x) { return x.key === key; })[0];
      return part ? '<span class="backlog-kind" data-backlog-part="' + part.key + '" title="' + U.attr(part.title) + '">' + ui.tag(part.label, part.kind) + '</span>' : '';
    }).join('') + '</div>' +
      // Cách xóa tồn: HĐTD được ghi nhận soạn xong lúc đặt lịch hẹn ký; HĐTC lúc tick "Đã soạn xong HĐ thế chấp".
      (kinds.indexOf('HDTD') !== -1 ? '<div class="t2 backlog-hint">HĐTD hết tồn khi hẹn ký' + (canMarkCreditDraft(item) ? ' hoặc bấm Xong HĐTD' : '') + '</div>' +
        (canMarkCreditDraft(item) ? '<div class="backlog-hint">' + creditDraftButton(item) + '</div>' : '') : '') +
      (kinds.indexOf('HDTC') !== -1 ? '<div class="t2 backlog-hint">HĐTC hết tồn khi tick "Đã soạn xong HĐ thế chấp"</div>' : '') +
      linkedMortgageHint(item);
  }

  function personalBacklogProgress(item) {
    var focus = LSTiming.workState(item);
    if (focus === 'ACTIVE') return 'Đang xử lý';
    if (focus === 'WAITING') return 'Chờ làm tiếp';
    if (focus === 'QUEUED') return item.status === 'DA_PHAN_CONG' ? 'Đã giao · chờ bắt đầu' : 'Chờ bắt đầu';
    return D.label(item.status);
  }

  function personalBacklogDay(item) {
    if (item.assigned_at) return LSTiming.dayKey(item.assigned_at);
    if (item.dossier_received_at) return LSTiming.dayKey(item.dossier_received_at);
    return String(item.occurrence_date || '').substring(0, 10);
  }

  function personalBacklog(items, today) {
    today = today || LSTiming.dayKey(U.now());
    var entries = items.map(function (item) {
      var sla = item.dossier_received_at ? D.sla(item, st()) : null;
      var kinds = personalBacklogKinds(item);
      return { item: item, sla: sla, kinds: kinds, day: personalBacklogDay(item) };
    });
    entries.sort(function (a, b) {
      return priorityRank(a.item) - priorityRank(b.item) ||
        Number(!!(b.sla && b.sla.late)) - Number(!!(a.sla && a.sla.late)) ||
        Number(LSTiming.workState(b.item) === 'ACTIVE') - Number(LSTiming.workState(a.item) === 'ACTIVE') ||
        (Date.parse(a.sla && a.sla.due) || 8640000000000000) - (Date.parse(b.sla && b.sla.due) || 8640000000000000) ||
        String(a.item.dossier_received_at || a.item.assigned_at || a.item.occurrence_date || '').localeCompare(String(b.item.dossier_received_at || b.item.assigned_at || b.item.occurrence_date || '')) ||
        String(a.item.item_id).localeCompare(String(b.item.item_id));
    });
    function renderGroup(age, title, groupEntries) {
      var counts = {}, overdue = 0;
      PERSONAL_BACKLOG_PARTS.forEach(function (part) { counts[part.key] = 0; });
      groupEntries.forEach(function (entry) {
        entry.kinds.forEach(function (key) { counts[key] = (counts[key] || 0) + 1; });
        if (entry.sla && entry.sla.late) overdue++;
      });
      // HĐTD/HĐTC luôn hiện (kể cả 0) để đối chiếu với dòng Tồn soạn; các thẻ khác chỉ hiện khi có hồ sơ.
      var countTags = PERSONAL_BACKLOG_PARTS.filter(function (part) {
        return part.key === 'HDTD' || part.key === 'HDTC' || counts[part.key];
      }).map(function (part) {
        return '<span class="personal-backlog-kind" data-backlog-kind="' + part.key + '" title="' + U.attr(part.title) + '" aria-label="' + U.attr(part.title) + ': ' + counts[part.key] + ' hồ sơ">' +
          ui.tag(part.label + ' ' + counts[part.key], part.kind) + '</span>';
      }).join('');
      var details = groupEntries.length ? '<details class="personal-backlog-detail"><summary><strong>Chi tiết việc</strong><span class="count">' + groupEntries.length + ' hồ sơ</span></summary>' +
        ui.table([{ label: 'Hồ sơ' }, { label: 'Phần tồn' }, { label: 'Tiến độ' }, { label: 'Thao tác' }], groupEntries.map(function (entry) {
        var i = entry.item, r = reqOf(i), product = productLabel(i), work = wtGroup(i.work_type_code) + (product && product !== '—' ? ' · ' + product : '');
        return { cls: (priorityRowClass(i) + ' ' + (entry.sla && entry.sla.late ? 'flag' : '')).trim(), attrs: ' data-row="' + U.attr(i.item_id) + '" data-backlog-parts="' + U.attr(entry.kinds.join(',')) + '" tabindex="0"', cells: [
          '<div class="personal-backlog-customer"><span class="t1">' + U.esc(r && r.customer ? r.customer.name : '—') + '</span>' +
            (r && priorityTags(r.customer) ? '<span class="priority-tags">' + priorityTags(r.customer) + '</span>' : '') +
            '<button type="button" class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(i.item_id) + '" aria-label="Mở chi tiết hồ sơ ' + U.attr(itemRef(i)) + '">' + U.esc(itemRef(i)) + '</button></div>' +
            '<div class="t2">' + U.esc(work) + '</div>' + dossierNoteHtml(i),
          backlogKindsHtml(i),
          '<div>' + ui.statusTag(i.status) + '</div><div class="t2">' + U.esc(personalBacklogProgress(i)) + '</div>' +
            (entry.sla && entry.sla.late ? '<div>' + ui.tag('Quá hạn', 'danger') + '</div>' : ''),
          personalBacklogActions(i)
        ] };
        }), { tableClass: 'personal-backlog-table' }) + '</details>' : '<p class="personal-backlog-empty t2">Không có việc tồn</p>';
      return '<div class="personal-backlog-group" data-backlog-age="' + age + '"><div class="personal-backlog-group-heading"><h4>' + title +
        ' <span class="count">' + groupEntries.length + ' hồ sơ</span></h4><div class="personal-backlog-counts">' + countTags +
        (overdue ? ui.tag(overdue + ' quá hạn', 'danger') : '') + '</div></div>' + details + '</div>';
    }
    var todayEntries = entries.filter(function (entry) { return entry.day === today; });
    var previousEntries = entries.filter(function (entry) { return entry.day !== today; });
    var awaiting = awaitingMyReceipt();
    var heading = '<div class="personal-backlog-heading"><h3>Việc tồn <span class="count">' + items.length + ' hồ sơ</span></h3>' +
      (awaiting.length > 1 && !st().global_pause ? ui.btn('Tiếp nhận tất cả (' + awaiting.length + ')', { kind: 'primary', sm: true, act: 'receive-all', icon: 'check', title: 'Tiếp nhận một lần mọi hồ sơ đã giao cho bạn' }) : '') +
      '</div>';
    var body = '<div class="personal-backlog-groups">' + renderGroup('today', 'Hôm nay', todayEntries) +
      renderGroup('previous', 'Tồn các ngày trước', previousEntries) + '</div>';
    return '<section class="personal-backlog" aria-label="Việc tồn theo nhóm công việc">' + heading + body + '</section>';
  }

  /** Dashboard riêng của cán bộ LS: việc đã chạm trong ngày và giờ làm thực tế. */
  function personalDashboard() {
    var u = me();
    if (!u || u.role !== 'CAN_BO_LS') return ui.banner('warn', 'Không có quyền xem dashboard cá nhân', 'Màn này chỉ dành cho cán bộ LS.');
    var now = new Date(), today = LSTiming.dayKey(now.toISOString()), todayStart = new Date(today + 'T00:00:00+07:00');
    var items = visibleItems();
    var cacheKey=st().session+'|'+today+'|'+items.map(function(i){return i.item_id+':'+i.version;}).join(',');
    if(U.isGas() && (!personalTimeCache || personalTimeCache.key!==cacheKey)) {
      personalTimeCache={key:cacheKey,loading:true};
      LS.api.getTimeReport({from:LSTiming.dayKey(new Date(todayStart.getTime()-6*86400000).toISOString()),to:today}).then(function(data){
        if(!personalTimeCache || personalTimeCache.key!==cacheKey)return;personalTimeCache={key:cacheKey,data:data,fetchedAt:Date.now()};LS.app.render();
      }).catch(function(e){if(personalTimeCache && personalTimeCache.key===cacheKey){personalTimeCache={key:cacheKey,error:e.message};LS.app.render();}});
    }
    // "Đã chạm hôm nay" = có giờ làm thật trong hôm nay hoặc xong hôm nay. Bản cũ lấy
    // mọi việc từng bắt đầu, kể cả việc đã xong từ nhiều tháng trước.
    var touched = items.filter(function (i) {
      return (i.completed_at && U.localDate(new Date(i.completed_at)) === today) ||
        personalSpans(i, now).some(function (x) { return x[1] > todayStart.getTime(); });
    });
    var doneToday = items.filter(function (i) { return i.status === 'HOAN_THANH_LS' && i.completed_at && LSTiming.dayKey(i.completed_at) === today; });
    var running = personalOpenItems();
    // Gộp các khoảng chồng nhau trước khi cộng: làm song song vay món và TSĐB
    // trong cùng một giờ vẫn chỉ là một giờ làm của cán bộ, không phải hai.
    // Khoảng tạm dừng / chờ khách ký đã bị trừ sẵn trong activeSpans.
    var spans = touched.reduce(function (all, i) {
      return all.concat(personalSpans(i, now).map(function (x) {
        return [Math.max(x[0], todayStart.getTime()), Math.min(x[1], now.getTime())];
      }));
    }, []).filter(function (x) { return x[1] > x[0]; }).sort(function (a, b) { return a[0] - b[0]; });
    var merged = spans.reduce(function (out, x) {
      var last = out[out.length - 1];
      if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]); else out.push(x.slice());
      return out;
    }, []);
    var hours = merged.reduce(function (sum, x) {
      var h = LSTiming.between(new Date(x[0]).toISOString(), new Date(x[1]).toISOString(), D.processingCalendar(st()));
      return sum + (h || 0);
    }, 0);
    var daily=personalDays(items,now).filter(function(d){return d.day===today;})[0];
    if(daily)hours=daily.occupied_hours+personalHoursBetween(items,personalTimeCache && personalTimeCache.fetchedAt || now.getTime(),now.getTime(),now);
    var rows = touched.slice().sort(function (a, b) { return new Date(b.completed_at || b.processing_started_at || 0) - new Date(a.completed_at || a.processing_started_at || 0); }).slice(0, 30);
    var doneDate = f('my-dashboard', 'done-date', today);
    var cal = D.processingCalendar(st()), nowIso = now.toISOString();
    var completed = items.filter(function (i) {
      return !i.carried_to_item_id && i.status === 'HOAN_THANH_LS' && i.completed_at && LSTiming.dayKey(i.completed_at) === doneDate;
    }).sort(function (a, b) { return new Date(b.completed_at) - new Date(a.completed_at); }).map(function (i) {
      return { item: i, mine: LSTiming.workTime(i, cal, nowIso, st().session) };
    });
    // Hồ sơ không đo được giờ làm (0 phút trong lịch) không đưa vào trung bình.
    var measured = completed.filter(function (x) { return x.mine.hours > 0; });
    var doneHours = measured.reduce(function (n, x) { return n + x.mine.hours; }, 0);
    function myHoursCell(x) {
      return x.mine.sessions ? U.esc(D.durationLabel(x.mine.hours)) : '<span class="t2">—</span>';
    }
    var completedTable = ui.table(
      [{ label: 'Mã việc' }, { label: 'Khách hàng' }, { label: 'Công việc' }, { label: 'Giờ nhận' }, { label: 'Giờ hoàn thành' }, { label: 'Giờ tôi làm', cls: 'num' }, { label: 'Điều chỉnh' }],
      completed.map(function (x) {
        var i = x.item, request = reqOf(i);
        return { cells: [
          '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(i.item_id) + '">' + U.esc(itemRef(i)) + '</button>',
          '<div class="t1">' + U.esc(request ? request.customer.name : '—') + '</div>',
          '<div class="t2">' + U.esc(wtName(i.work_type_code)) + '</div>',
          i.dossier_received_at ? U.esc(U.fmtDT(i.dossier_received_at)) : '—',
          U.esc(U.fmtDT(i.completed_at)),
          myHoursCell(x),
          canCorrectTimes(i) ? ui.btn('Sửa giờ', { kind: 'line', sm: true, act: 'edit-times', data: ' data-id="' + U.attr(i.item_id) + '"', icon: 'clock' }) : '—'
        ] };
      }),
      { icon: 'check', title: 'Không có việc hoàn thành trong ngày này', text: '' }
    );
    // Cùng bảng "Kết quả thực hiện" của điều hành nhưng chỉ có cột của chính cán bộ này.
    var resultDate = f('my-dashboard', 'result-date', today);
    var resultReport = '<div class="personal-result-report" style="margin-top:1.125rem">' + ui.sectionTitle('Kết quả thực hiện · tồn soạn đang mở hiện nay') +
      '<div class="report-filters"><label for="personal-result-date">Ngày</label>' +
      ui.input('result-date', resultDate, { type: 'date', attrs: ' id="personal-result-date" data-filter-screen="my-dashboard" data-filter="result-date"' }) + '</div>' +
      dailyMatrixHtml(dailyMatrix(dayRange(resultDate), { only: u.user_id })) + '</div>';
    var completedReport = '<div class="personal-done-report" style="margin-top:1.125rem">' + ui.sectionTitle('Báo cáo việc đã hoàn thành') +
      '<div class="report-filters"><label for="personal-done-date">Ngày hoàn thành</label>' +
      ui.input('done-date', doneDate, { type: 'date', attrs: ' id="personal-done-date" data-filter-screen="my-dashboard" data-filter="done-date"' }) + '</div>' +
      ui.strip([
        ui.metric('Hồ sơ hoàn thành', completed.length, completed.length ? 'ok' : ''),
        ui.metric('Tổng giờ tôi làm', completed.length ? D.durationLabel(doneHours) : null),
        ui.metric('Trung bình mỗi hồ sơ', measured.length ? D.durationLabel(doneHours / measured.length) : null)
      ]) + completedTable + '</div>';
    var hasAbsence = String(u.availability_status || '').toUpperCase() === 'OFF' && (u.off_from || u.off_to);
    return ui.block({ title: 'Dashboard cá nhân', count: U.fmtDate(today), icon: 'chart',
      actions: ui.btn(hasAbsence ? 'Sửa lịch nghỉ' : 'Khai báo nghỉ phép', { kind: 'line', sm: true, act: 'my-absence', icon: 'calendar' }),
      body: ui.strip([
        ui.metric('Hoàn thành hôm nay', doneToday.length, 'ok'),
        ui.metric('Đang mở', running.length, 'info'),
        ui.metric('Giờ làm hôm nay', D.durationLabel(hours)),
        ui.metric('Đã chạm hôm nay', touched.length)
      ]) + (LS.planUI ? LS.planUI.summary(u.user_id) : '') + personalBacklog(running, today) + resultReport + personalWeekChart(items, now) + '<div style="margin-top:1.125rem">' + ui.sectionTitle('Chi tiết việc trong ngày') +
      ui.table([{ label: 'Mã việc' }, { label: 'Khách hàng' }, { label: 'Loại việc' }, { label: 'Trạng thái' }, { label: 'Giờ xử lý KH', cls: 'num' }],
        rows.map(function (i) { var r = reqOf(i); return { cells: [
          '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(i.item_id) + '">' + U.esc(itemRef(i)) + '</button>',
          '<div class="t1">' + U.esc(r ? r.customer.name : '—') + '</div>',
          '<div class="t2">' + U.esc(wtName(i.work_type_code)) + '</div>', ui.statusTag(i.status),
          processingClock(i,now)
        ] }; }),
        { icon: 'briefcase', title: 'Chưa có hoạt động hôm nay', text: '' }) + '</div>' + completedReport
    });
  }

  /** Giờ làm và số việc xong mỗi ngày trong 7 ngày gần nhất (đã gộp khoảng song song). */
  function personalWeekChart(items, now) {
    var labels = [], hours = [], done = [], cal = D.processingCalendar(st());
    var spans = items.reduce(function (all, i) { return all.concat(personalSpans(i, now)); }, []), days = personalDays(items, now);
    for (var k = 6; k >= 0; k--) {
      var today=LSTiming.dayKey(now.toISOString()),day=new Date(new Date(today+'T00:00:00+07:00').getTime()-k*86400000);
      var a = day.getTime(), b = Math.min(a + 86400000, now.getTime()), key = LSTiming.dayKey(day.toISOString());
      var parts = spans.map(function (x) { return [Math.max(x[0], a), Math.min(x[1], b)]; })
        .filter(function (x) { return x[1] > x[0]; }).sort(function (p, q) { return p[0] - q[0]; })
        .reduce(function (out, x) { var l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); return out; }, []);
      labels.push(U.pad(day.getDate()) + '/' + U.pad(day.getMonth() + 1));
      hours.push(parts.reduce(function (s, x) { return s + (LSTiming.between(new Date(x[0]).toISOString(), new Date(x[1]).toISOString(), cal) || 0); }, 0) * 60);
      done.push(items.filter(function (i) { return !i.carried_to_item_id && i.status === 'HOAN_THANH_LS' && i.completed_at && LSTiming.dayKey(i.completed_at) === key; }).length);
      var daily=days.filter(function(d){return d.day===key;})[0];
      if(daily && key!==today){hours[hours.length-1]=daily.occupied_hours*60;done[done.length-1]=daily.completed;}
    }
    return '<div class="viz-pair">' +
      LS.charts.columns({ title: 'Giờ làm 7 ngày gần nhất', labels: labels, labelHead: 'Ngày',
        unit: ' phút', series: [{ name: 'Giờ làm', values: hours }], emptyText: 'Chưa có giờ làm trong 7 ngày qua.' }) +
      LS.charts.columns({ title: 'Việc hoàn thành 7 ngày gần nhất', labels: labels, labelHead: 'Ngày',
        series: [{ name: 'Hoàn thành', values: done, slot: 2 }], emptyText: 'Chưa hoàn thành việc nào trong 7 ngày qua.' }) + '</div>';
  }

  /* ============================ Màn: điều hành ============================ */

  function board() {
    var all = boardItems();
    var report = performanceReport(reportRange());
    var open = all.filter(function (i) { return D.STATUS[i.status].open; });
    var late = open.filter(function (i) { var s = D.sla(i, st()); return s && s.late; });

    var load = staffList().filter(function (u) { return !f('board', 'staff', '') || u.user_id === f('board', 'staff', ''); }).map(function (u) {
      var m = all.filter(function (i) { return i.assigned_user_id === u.user_id; });
      var op = m.filter(function (i) { return D.STATUS[i.status].open; });
      return {
        u: u, open: op.length, done: m.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length,
        late: op.filter(function (i) { var s = D.sla(i, st()); return s && s.late; }).length
      };
    }).sort(function (a, b) { return b.open - a.open; });

    var maxLoad = Math.max.apply(null, [1].concat(load.map(function (x) { return x.open; })));

    // Theo đơn vị: lọc đúng kỳ đang chọn — trước đây đếm toàn bộ lịch sử dù thanh lọc
    // phía trên ghi một kỳ cụ thể.
    var byUnit = sendingUnits().map(function (unit) {
      var m = all.filter(function (i) { var r = reqOf(i); return r && r.unit_id === unit.unit_id && inRange(i.occurrence_date + 'T12:00:00', report.range); });
      return {
        unit: unit, total: m.length,
        open: m.filter(function (i) { return D.STATUS[i.status].open; }).length,
        done: m.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length
      };
    }).filter(function (x) { return x.total; });

    var spread = Object.keys(D.STATUS).map(function (k) {
      return { k: k, n: all.filter(function (i) { return i.status === k; }).length };
    }).filter(function (x) { return x.n; });

    var tab = f('board', 'tab', 'report');
    // Tab đã lưu từ bản cũ mà vai trò này không còn: quay về Kết quả thực hiện.
    if (boardTabKeys().indexOf(tab) === -1) { tab = 'report'; setFilter('board', 'tab', tab); }
    if (tab === 'report') return dailyResultBlock(report, tab);

    // Chỉ dựng đúng phần đang xem. Dựng cả sáu phần mỗi lần vẽ là lãng phí
    // rõ rệt khi kho việc lớn dần.
    var panels = {
      type: function () { return typeSummaryBlock(report.range); },
      staff: function () {
        // Bật "Hiện kế hoạch / %": thêm thực hiện / kế hoạch từng chỉ tiêu của mỗi cán bộ trong kỳ đang xem.
        var planOn = f('board', 'plan', '') === '1', m = planOn ? dailyMatrix(report.range) : null, col = {};
        var planRows = m ? m.rows.filter(function (r) { return !r.def.header && typeof LSPlanning !== 'undefined' && LSPlanning.KEYS.indexOf(r.key) !== -1 && !/^TON_/.test(r.key); }) : [];
        if (m) m.users.forEach(function (u, i) { col[u.user_id] = i; });
        var periodWord = { week: 'tuần', month: 'tháng' }[report.range.period] || 'ngày';
        function planCell(r, userId) {
          var i = col[userId], done = i === undefined ? 0 : r.cells[i], goal = i === undefined || !r.staffPlans ? null : r.staffPlans[i];
          if (goal === null || goal === undefined) return '<span class="tid">' + done + '</span><div class="t2">—</div>';
          var pct = goal > 0 ? Math.round(done * 100 / goal) : null;
          return '<span class="tid">' + done + ' / ' + (Math.round(goal * 100) / 100) + '</span><div class="t2' + (pct !== null && pct >= 100 ? ' staff-plan-met' : '') + '">' + (pct === null ? '—' : pct + '%') + '</div>';
        }
        return ui.block({
        title: 'Tải việc theo cán bộ', icon: 'users',
        body: ui.table(
          [{ label: 'Cán bộ' }, { label: 'Đang mở', cls: 'num' }, { label: 'Phân bổ' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Đã xong', cls: 'num' }].concat(planRows.map(function (r) {
            return { label: r.def.label + ' · TH/KH ' + periodWord, cls: 'num' };
          })),
          load.map(function (x) {
            return {
              cls: x.late ? 'flag' : '',
              cells: [
                '<div class="t1">' + U.esc(x.u.full_name) + '</div>',
                '<span class="tid">' + x.open + '</span>',
                ui.bar(x.open, maxLoad, x.open >= maxLoad && maxLoad > 1),
                x.late ? ui.tag(String(x.late), 'danger') : '<span class="t2">0</span>',
                '<span class="tid">' + x.done + '</span>'
              ].concat(planRows.map(function (r) { return planCell(r, x.u.user_id); }))
            };
          }),
          { icon: 'users', title: 'Chưa có cán bộ LS đang hoạt động', text: '' }
        )
      }); },
      unit: function () { return ui.block({
        title: 'Theo đơn vị gửi', icon: 'building',
        body: LS.charts.bars({
          title: 'Hồ sơ theo đơn vị gửi', sub: reportLabel(report.range), labelHead: 'Đơn vị', sort: true,
          rows: byUnit.map(function (x) { return { label: x.unit.name }; }),
          series: [{ name: 'Hoàn thành', values: byUnit.map(function (x) { return x.done; }) },
            { name: 'Chưa xong', values: byUnit.map(function (x) { return x.total - x.done; }), slot: 2 }]
        }) + ui.table(
          [{ label: 'Đơn vị' }, { label: 'Tổng việc', cls: 'num' }, { label: 'Đang mở', cls: 'num' }, { label: 'Hoàn thành', cls: 'num' }, { label: 'Tỷ lệ xong', cls: 'num' }],
          byUnit.map(function (x) {
            var p = U.pct(x.done, x.total);
            return {
              cells: [
                '<div class="t1">' + U.esc(x.unit.name) + '</div>',
                '<span class="tid">' + x.total + '</span>',
                '<span class="tid">' + x.open + '</span>',
                '<span class="tid">' + x.done + '</span>',
                p === null ? '<span class="t2">Chưa có dữ liệu</span>' : '<span class="tid">' + p + '%</span>'
              ]
            };
          }),
          { icon: 'building', title: 'Chưa có đơn vị nào gửi việc', text: '' }
        )
      }); },
      status: function () { return ui.block({
        title: 'Phân bố trạng thái', icon: 'activity',
        body: LS.charts.bars({
          title: 'Số việc ở từng trạng thái', labelHead: 'Trạng thái',
          rows: spread.map(function (x) { return { label: D.STATUS[x.k].label }; }),
          series: [{ name: 'Số việc', values: spread.map(function (x) { return x.n; }) }]
        })
      }); },
      late: function () { return ui.block({
        title: 'Việc quá hạn', count: late.length, icon: 'clock',
        body: itemTable(sortItems(late, 'board'), ['code', 'customer', 'requestor', 'work', 'staff', 'sla', 'status', 'act'], {
          icon: 'check', title: 'Không có việc quá hạn', text: 'Toàn bộ việc đang mở còn trong hạn theo lịch làm việc.'
        }, 'board')
      }); }
    };
    return dailyResultBlock(report, tab) + (panels[tab] || panels.type)();
  }

  /* ============================ Màn: kỳ kế hoạch tháng ============================ */

  function periods() {
    var u = me();
    var active = st().activePlan || {};
    var plans = (st().monthlyPlans || []).slice().sort(function (a, b) {
      return String(b.month_key || '').localeCompare(String(a.month_key || ''));
    });
    var canCreate = ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
    var rows = plans.map(function (p) {
      var state = p.status === 'ACTIVE' ? ui.tag('Đang hoạt động', 'ok') :
        p.status === 'SCHEDULED' ? ui.tag('Đã tạo trước', 'gold') : ui.tag('Đã lưu lịch sử', 'neutral');
      return { cells: [
        '<div class="t1">' + U.esc(p.name || p.month_key) + '</div><div class="t2">' + U.esc(p.month_key || '') + '</div>',
        '<span class="tid">' + U.fmtDate(p.start_date) + ' → ' + U.fmtDate(p.end_date) + '</span>',
        state,
        p.spreadsheet_url ? '<a class="btn btn-quiet btn-sm" href="' + U.attr(p.spreadsheet_url) + '" target="_blank" rel="noopener">Mở Sheet</a>' : '<span class="t2">Chưa có liên kết</span>'
      ] };
    });
    // Kỳ không có kho Sheet nghĩa là lần tạo file đã hỏng. Hệ thống tự thử lại
    // mỗi giờ, nhưng phải nói ra, nếu không tháng đó lặng lẽ không có file kế hoạch.
    var thieuKho = plans.filter(function (p) {
      return ['ACTIVE', 'SCHEDULED'].indexOf(p.status) !== -1 && !p.spreadsheet_url;
    });

    return (thieuKho.length
      ? ui.banner('warn', thieuKho.length + ' kỳ chưa tạo được kho Sheet kế hoạch',
        'Kỳ ' + thieuKho.map(function (p) { return U.esc(p.month_key || p.period_id); }).join(', ') + '.')
      : '') +
      ui.block({
      title: 'Kế hoạch tháng', icon: 'calendar',
      actions: canCreate ? ui.btn('Tạo tháng kế tiếp', { act: 'create-next-monthly-plan', icon: 'plus', sm: true }) : '',
      note: active.name ? 'Đang xem: ' + U.esc(active.name) : '',
      body: ui.table(
        [{ label: 'Kỳ' }, { label: 'Thời gian' }, { label: 'Trạng thái' }, { label: 'Google Sheet' }],
        rows,
        { icon: 'calendar', title: 'Chưa có lịch sử kỳ tháng', text: '' }
      )
    });
  }

  /* ============================ Màn: báo cáo nhiều kỳ ============================ */

  // Báo cáo không nằm trong ảnh chụp bootstrap: máy chủ chỉ trả số liệu đã tổng
  // hợp khi được hỏi, để một báo cáo năm không kéo hàng nghìn dòng việc về máy.
  var reportCache = null, reportSequence = 0;

  var REPORT_GROUPS = [['unit', 'Đơn vị gửi'], ['work_type', 'Loại việc'], ['staff', 'Cán bộ LS']];

  function reportOpts() {
    var preset = f('report', 'preset', 'quarter');
    var base = D.presetRange(preset === 'custom' ? 'month' : preset);
    return {
      preset: preset,
      from: preset === 'custom' ? f('report', 'from', base.from) : base.from,
      to: preset === 'custom' ? f('report', 'to', base.to) : base.to,
      group: f('report', 'group', 'unit')
    };
  }

  function reportKey(o) { return [o.from, o.to, o.group].join('|'); }

  /**
   * Chỉ gọi khi người dùng bấm "Chạy báo cáo". Đổi bộ lọc không tự tải: báo cáo
   * năm bắt máy chủ gộp nhiều kỳ, chạy ngầm mỗi lần chạm vào ô lọc là tốn cả
   * thời gian lẫn hạn mức Apps Script.
   */
  function loadReport(force) {
    var o = reportOpts();
    var key = reportKey(o);
    if (!force && reportCache && reportCache.key === key) return;

    if (!U.isGas()) {
      reportCache = { key: key, data: D.reportFromItems(o.from, o.to, o.group, st()), loading: false };
      return;
    }
    if (reportCache && reportCache.key === key && reportCache.loading) return;
    var seq = ++reportSequence;
    reportCache = { key: key, data: null, loading: true, error: '' };
    LS.api.getReport({ from: o.from, to: o.to, group: o.group }).then(function (data) {
      if (seq !== reportSequence) return;
      reportCache = { key: key, data: data, loading: false, error: '' };
      LS.app.render();
    }).catch(function (error) {
      if (seq !== reportSequence) return;
      reportCache = { key: key, data: null, loading: false, error: error.message || 'Không lấy được báo cáo.' };
      LS.app.render();
    });
  }

  function refreshReport() { loadReport(true); LS.app.render(); }

  function setReportFilter(key, value) {
    setFilter('report', key, value);
    if (key !== 'preset' && key !== 'group') setFilter('report', 'preset', 'custom');
    LS.app.render();
  }

  function num(n) { return Number(n || 0).toLocaleString('vi-VN'); }

  /**
   * KS/QL xem ba loại báo cáo ở một màn: nhiều kỳ, thời gian & SLA, kế hoạch tháng.
   * Admin và Giám sát vẫn dùng từng màn riêng như trước.
   */
  var REPORT_HUB_TABS = [['multi', 'Nhiều kỳ', 'chart'], ['time', 'Thời gian & SLA', 'clock'], ['plan', 'Kế hoạch tháng', 'calendar']];

  function reportHub() {
    var tab = f('report', 'hub', 'multi');
    if (!REPORT_HUB_TABS.some(function (x) { return x[0] === tab; })) tab = 'multi';
    var bar = '<nav class="dashboard-tabs hub-tabs" aria-label="Loại báo cáo" role="tablist">' + REPORT_HUB_TABS.map(function (x) {
      return '<button type="button" class="dashboard-tab' + (tab === x[0] ? ' is-active' : '') + '" data-act="report-hub" data-tab="' + U.attr(x[0]) + '" role="tab" aria-selected="' + (tab === x[0] ? 'true' : 'false') + '">' +
        U.icon(x[2], 15) + '<span>' + U.esc(x[1]) + '</span></button>';
    }).join('') + '</nav>';
    return bar + (tab === 'time' ? timeReport() : tab === 'plan' ? periods() : report());
  }

  function reportEntry() { return isLeader() ? reportHub() : report(); }

  function report() {
    var o = reportOpts();
    var running = reportCache && reportCache.loading;
    var stale = reportCache && reportCache.data && reportCache.key !== reportKey(o);

    var controls = '<div class="f-row" style="align-items:flex-end">' +
      ui.field('Khoảng thời gian',
        ui.select('report_preset', D.REPORT_PRESETS, o.preset, { attrs: ' data-act="report-preset"' })) +
      ui.field('Từ tháng', ui.input('report_from', o.from, { type: 'month', placeholder: '2026-01', attrs: ' data-act="report-from"' })) +
      ui.field('Đến tháng', ui.input('report_to', o.to, { type: 'month', placeholder: '2026-12', attrs: ' data-act="report-to"' })) +
      ui.field('Xem theo', ui.select('report_group', REPORT_GROUPS, o.group, { attrs: ' data-act="report-group"' })) +
      '</div>';

    var head = ui.block({
      title: 'Phạm vi báo cáo', icon: 'calendar',
      actions: ui.btn(running ? 'Đang chạy…' : 'Chạy báo cáo', { act: 'report-run', sm: true, kind: 'primary', icon: 'play', disabled: running }) +
        (reportCache && reportCache.data ? ui.btn('Tải Excel', { act: 'report-export', sm: true, icon: 'file' }) : ''),
      note: '',
      body: ui.pad(controls)
    });

    if (running) {
      return head + ui.block({ title: 'Đang tổng hợp', icon: 'chart',
        body: ui.empty({ icon: 'chart', title: 'Đang tổng hợp số liệu', text: '' }) });
    }
    if (reportCache && reportCache.error) {
      return head + ui.banner('danger', 'Không lấy được báo cáo', reportCache.error);
    }

    var data = reportCache && reportCache.data;
    if (!data) {
      return head + ui.block({ title: 'Chưa chạy báo cáo', icon: 'chart',
        body: ui.empty({ icon: 'chart', title: 'Chưa có dữ liệu báo cáo', text: '',
          action: ui.btn('Chạy báo cáo', { kind: 'primary', act: 'report-run', icon: 'play' }) }) });
    }
    var shown = String(reportCache.key).split('|');
    var staleNote = stale ? ui.banner('warn', 'Kết quả cũ: ' + shown[0] + ' → ' + shown[1], '') : '';
    var t = data.total;

    var strip = ui.strip([
      ui.metric('Việc phát sinh', num(t.phat_sinh), '', data.periods + ' kỳ'),
      ui.metric('Hoàn thành', num(t.hoan_thanh), t.hoan_thanh ? 'ok' : ''),
      ui.metric('Quá hạn', num(t.qua_han), t.qua_han ? 'danger' : ''),
      ui.metric('Tồn cuối kỳ', num(t.ton_cuoi_ky), t.ton_cuoi_ky ? 'warn' : '', 'ảnh chụp kỳ cuối'),
      ui.metric('Chờ LS nhận TB', D.averageDurationLabel(t.tong_gio_tiep_nhan, t.so_tiep_nhan), '', 'phân công → nhận đủ'),
      ui.metric('Gửi → phân công TB', D.averageDurationLabel(t.tong_gio_phan_cong, t.so_phan_cong), '', 'đơn vị gửi → giao LS'),
      ui.metric('Xử lý TB', D.averageDurationLabel(t.tong_gio_xu_ly, t.so_xu_ly)),
      ui.metric('Toàn trình TB', D.averageDurationLabel(t.tong_gio_toan_trinh, t.so_toan_trinh), '', 'gửi → hoàn thành')
    ]);

    var groupLabel = (REPORT_GROUPS.filter(function (g) { return g[0] === data.group; })[0] || [])[1] || '';
    var goal = target('target_done_month');
    if (goal) {
      var p = Math.round(t.hoan_thanh * 100 / (goal * Math.max(1, data.months.length)));
      strip = ui.strip([
        ui.metric('Đạt chỉ tiêu', p + '%', p >= 100 ? 'ok' : (p >= 70 ? 'info' : 'warn'), num(t.hoan_thanh) + '/' + num(goal * Math.max(1, data.months.length)) + ' việc')
      ]) + strip;
    }

    var reportCharts = '<section class="block"><div class="viz-pair" style="border-top:0">' +
      LS.charts.columns({ title: 'Phát sinh và hoàn thành theo tháng', labelHead: 'Tháng',
        labels: data.months.map(function (m) { return m.name || m.month_key; }), target: goal,
        series: [{ name: 'Phát sinh', values: data.months.map(function (m) { return Number(m.phat_sinh) || 0; }) },
          { name: 'Hoàn thành', values: data.months.map(function (m) { return Number(m.hoan_thanh) || 0; }), slot: 2 }] }) +
      LS.charts.bars({ title: 'Phát sinh theo ' + String(groupLabel).toLowerCase(), labelHead: groupLabel, sort: true,
        rows: data.rows.map(function (r) { return { label: r.label, note: num(r.hoan_thanh) + ' hoàn thành' + (r.qua_han ? ' · ' + num(r.qua_han) + ' quá hạn' : '') }; }),
        series: [{ name: 'Phát sinh', values: data.rows.map(function (r) { return Number(r.phat_sinh) || 0; }) }] }) +
      '</div></section>';

    var byDim = ui.block({
      title: 'Theo ' + String(groupLabel).toLowerCase(), count: data.rows.length, icon: 'chart',
      body: ui.table(
        [{ label: groupLabel }, { label: 'Phát sinh', cls: 'num' }, { label: 'Chuyển tiếp vào', cls: 'num' },
          { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Hủy', cls: 'num' },
          { label: 'Tồn cuối kỳ', cls: 'num' }, { label: 'Chờ LS nhận TB', cls: 'num' },
          { label: 'Gửi → phân công TB', cls: 'num' }, { label: 'Xử lý TB', cls: 'num' },
          { label: 'Toàn trình TB', cls: 'num' }],
        data.rows.map(function (r) {
          return { cls: r.qua_han ? 'flag-warn' : '', cells: [
            '<div class="t1">' + U.esc(r.label) + '</div>',
            '<span class="tid">' + num(r.phat_sinh) + '</span>',
            '<span class="tid">' + num(r.chuyen_tiep_vao) + '</span>',
            '<span class="tid">' + num(r.hoan_thanh) + '</span>',
            '<span class="tid">' + num(r.qua_han) + '</span>',
            '<span class="tid">' + num(r.huy) + '</span>',
            '<span class="tid">' + num(r.ton_cuoi_ky) + '</span>',
            '<span class="tid">' + D.averageDurationLabel(r.tong_gio_tiep_nhan, r.so_tiep_nhan) + '</span>',
            '<span class="tid">' + D.averageDurationLabel(r.tong_gio_phan_cong, r.so_phan_cong) + '</span>',
            '<span class="tid">' + D.averageDurationLabel(r.tong_gio_xu_ly, r.so_xu_ly) + '</span>',
            '<span class="tid">' + D.averageDurationLabel(r.tong_gio_toan_trinh, r.so_toan_trinh) + '</span>'
          ] };
        }),
        { icon: 'chart', title: 'Chưa có việc nào trong khoảng này', text: '' }
      )
    });

    var byMonth = ui.block({
      title: 'Diễn biến theo tháng', count: data.months.length, icon: 'calendar',
      body: ui.table(
        [{ label: 'Tháng' }, { label: 'Phát sinh', cls: 'num' }, { label: 'Chuyển tiếp vào', cls: 'num' },
          { label: 'Hoàn thành', cls: 'num' }, { label: 'Quá hạn', cls: 'num' }, { label: 'Tồn cuối kỳ', cls: 'num' }],
        data.months.map(function (m) {
          return { cells: [
            '<div class="t1">' + U.esc(m.name || m.month_key) + '</div>' +
            (m.status && m.status !== 'ARCHIVED' ? '<div class="t2">kỳ đang chạy, số liệu còn thay đổi</div>' : ''),
            '<span class="tid">' + num(m.phat_sinh) + '</span>',
            '<span class="tid">' + num(m.chuyen_tiep_vao) + '</span>',
            '<span class="tid">' + num(m.hoan_thanh) + '</span>',
            '<span class="tid">' + num(m.qua_han) + '</span>',
            '<span class="tid">' + num(m.ton_cuoi_ky) + '</span>'
          ] };
        }),
        { icon: 'calendar', title: 'Chưa có kỳ nào', text: '' }
      )
    });

    return head + staleNote + strip + reportCharts + byDim + byMonth;
  }

  /** Excel của màn Tổng hợp: mỗi bảng một trang tính, theo đúng bộ lọc đang xem. */
  function exportBoard() {
    var report = performanceReport(reportRange());
    resultCharts(report);
    var range = report.range, items = boardItems();
    var h = function (v) { return v === null || v === undefined ? '' : Math.round(v * 10) / 10; };
    var scope = [['Kỳ', reportLabel(range)], ['Cán bộ', f('board', 'staff', '') ? userName(f('board', 'staff', '')) : 'Tất cả'],
      ['Đơn vị', f('board', 'unit', '') ? unitName(f('board', 'unit', '')) : 'Tất cả'], ['Xuất lúc', U.fmtDT(U.now())]];
    var groups = {};
    items.filter(function (i) { return inRange(i.occurrence_date + 'T12:00:00', range); }).forEach(function (i) {
      var g = wtGroup(i.work_type_code);
      if (!groups[g]) groups[g] = { n: 0, open: 0, done: 0, huy: 0 };
      groups[g].n += 1;
      if (i.status === 'HOAN_THANH_LS') groups[g].done += 1; else if (i.status === 'HUY') groups[g].huy += 1; else groups[g].open += 1;
    });
    var units = sendingUnits().map(function (x) {
      var m = items.filter(function (i) { var r = reqOf(i); return r && r.unit_id === x.unit_id && inRange(i.occurrence_date + 'T12:00:00', range); });
      return [x.name, m.length, m.filter(function (i) { return i.status === 'HOAN_THANH_LS'; }).length, m.filter(function (i) { return D.STATUS[i.status].open; }).length];
    }).filter(function (r) { return r[1]; });
    var periodWord = { week: 'tuần', month: 'tháng' }[range.period] || 'ngày';
    LS.app.downloadXlsx('tong-hop-' + range.fromDate + '_' + range.toDate, [
      { name: 'Kết quả ' + periodWord, rows: dailyMatrixRows(dailyMatrix(range)), headerRows: [0, 1, 2], autoFilter: false },
      { name: 'Phạm vi', rows: [['Mục', 'Giá trị']].concat(scope) },
      { name: 'Kết quả cán bộ', rows: [['Cán bộ LS', 'Đơn vị', 'Đã giao', 'Hoàn thành', 'Đang mở', 'Quá hạn', 'TB nhận (giờ làm)', 'TB xử lý (giờ làm)', 'TB toàn trình (giờ làm)', 'Đúng hạn (%)']]
        .concat(report.rows.map(function (x) { return [x.user.full_name, unitName(x.user.unit_id), x.assigned, x.done, x.open, x.late, h(x.avgReceiveHours), h(x.avgHours), h(x.avgTotalHours), x.onTime === null ? '' : x.onTime]; })) },
      { name: 'Phát sinh - hoàn thành', rows: [['Mốc', 'Phát sinh', 'Hoàn thành']].concat(report.series.labels.map(function (l, i) { return [l, report.series.inflow[i], report.series.outflow[i]]; })) },
      { name: 'Theo loại việc', rows: [['Nhóm loại việc', 'Phát sinh', 'Đang mở', 'Hoàn thành', 'Hủy']].concat(Object.keys(groups).map(function (g) { return [g, groups[g].n, groups[g].open, groups[g].done, groups[g].huy]; })) },
      { name: 'Theo đơn vị', rows: [['Đơn vị', 'Tổng việc', 'Hoàn thành', 'Đang mở']].concat(units) },
      { name: 'Trạng thái hiện tại', rows: [['Trạng thái', 'Số việc']].concat(Object.keys(D.STATUS).map(function (k) { return [D.STATUS[k].label, items.filter(function (i) { return i.status === k; }).length]; }).filter(function (r) { return r[1]; })) }
    ]);
  }

  function exportReport() {
    var data = reportCache && reportCache.data;
    if (!data) { ui.toast('Chưa có số liệu để xuất.', 'err'); return; }
    var groupLabel = (REPORT_GROUPS.filter(function (g) { return g[0] === data.group; })[0] || [])[1] || 'Nhóm';
    var rows = [[groupLabel, 'Phát sinh', 'Chuyển tiếp vào', 'Hoàn thành', 'Quá hạn', 'Hủy', 'Tồn cuối kỳ',
      'Chờ LS nhận TB (giờ)', 'Gửi đến phân công TB (giờ)', 'Xử lý TB (giờ)', 'Toàn trình TB (giờ)']];
    data.rows.forEach(function (r) {
      rows.push([r.label, r.phat_sinh, r.chuyen_tiep_vao, r.hoan_thanh, r.qua_han, r.huy, r.ton_cuoi_ky,
        r.gio_tiep_nhan_tb, r.gio_phan_cong_tb, r.gio_xu_ly_tb, r.gio_toan_trinh_tb]);
    });
    var months = [['Tháng', 'Phát sinh', 'Chuyển tiếp vào', 'Hoàn thành', 'Quá hạn', 'Tồn cuối kỳ']];
    data.months.forEach(function (m) {
      months.push([m.name || m.month_key, m.phat_sinh, m.chuyen_tiep_vao, m.hoan_thanh, m.qua_han, m.ton_cuoi_ky]);
    });
    LS.app.downloadXlsx('bao-cao-' + data.from + '_' + data.to, [
      { name: 'Theo ' + groupLabel, rows: rows },
      { name: 'Theo tháng', rows: months }
    ]);
  }

  /* ============================ Màn: nhật ký ============================ */

  /**
   * Nhật ký không đi theo lần đăng nhập hay mỗi lượt tải lại, cũng không tự tải khi mở màn: chỉ khi bấm
   * "Xem nhật ký" máy chủ mới trả, mỗi lần 100 dòng và xem tiếp bằng nút. Đổi kỳ xem thì phải bấm lại.
   * Chạy cục bộ (không có máy chủ) thì dùng thẳng dữ liệu trong máy, cũng sau khi bấm.
   */
  var auditCache = null, auditSequence = 0, AUDIT_PAGE = 100, auditRan = '';

  function auditRange() {
    return U.periodRange(f('audit', 'period', 'week'), f('audit', 'from', ''), f('audit', 'to', ''), st().settings.week_start);
  }

  function auditKey() {
    var period = f('audit', 'period', 'week');
    return period + '|' + (period === 'custom' ? f('audit', 'from', '') + '|' + f('audit', 'to', '') : U.localDate());
  }

  function loadAudit(more, silent) {
    var key = auditKey(), old = more && auditCache && auditCache.key === key ? auditCache : null;
    if (old && (old.loading || !old.more)) return;
    var range = auditRange(), seq = ++auditSequence;
    auditCache = old ? Object.assign({}, old, { loading: true, error: '' })
      : { key: key, rows: [], config: [], cursor: '', more: false, loading: true, error: '' };
    if (!silent) LS.app.render();
    LS.api.getAuditLog({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), cursor: old ? old.cursor : '', limit: AUDIT_PAGE })
      .then(function (data) {
        if (seq !== auditSequence) return;
        auditCache = { key: key, rows: (old ? old.rows : []).concat(data.events || []), config: old ? old.config : (data.config_log || []),
          cursor: data.cursor, more: !!data.more, loading: false, error: '' };
        LS.app.render();
      })
      .catch(function (e) {
        if (seq !== auditSequence) return;
        auditCache = Object.assign({}, auditCache, { loading: false, error: e.message || 'Không tải được nhật ký.' });
        LS.app.render();
      });
  }

  function auditMore() { loadAudit(true, false); }
  function auditReload() { auditCache = null; loadAudit(false, false); }
  /** Nút "Xem nhật ký": ghi nhớ kỳ đã chạy rồi mới tải; máy chủ không được gọi trước đó. */
  function auditRun() {
    auditRan = auditKey();
    if (U.isGas()) { auditCache = null; loadAudit(false, false); } else LS.app.render();
  }

  /** Vào lại một màn thì bỏ dữ liệu tải theo yêu cầu của màn đó để lần mở sau lấy bản mới. */
  function enterScreen(name) {
    if (name === 'audit') { auditCache = null; auditSequence++; auditRan = ''; }
    if (name === 'my-dashboard') personalTimeCache=null;
  }

  function audit() {
    var u = me();
    var canExport = ['QUAN_LY_LS', 'ADMIN'].indexOf(u.role) !== -1;
    var period = f('audit', 'period', 'week');
    var range = auditRange(), remote = U.isGas();
    // Chưa bấm "Xem nhật ký" cho kỳ đang chọn thì chưa có dòng nào và không gọi máy chủ.
    var ran = auditRan === auditKey() && (!remote || auditCache && auditCache.key === auditKey());
    var cache = ran && remote ? auditCache : { rows: [], config: [], more: false, loading: false, error: '' };

    var list = !ran ? [] : remote ? cache.rows.slice() : visibleEvents().filter(function (e) {
      var t = new Date(e.at).getTime();
      return t >= range.from && t <= range.to;
    });

    if (u.role === 'ADMIN' && ran) {
      (remote ? cache.config : st().configLog).forEach(function (c) {
        var t = new Date(c.at).getTime();
        if (t >= range.from && t <= range.to) {
          list.push({ event_id: c.id, item_id: '', type: 'CAU_HINH', by: c.by, at: c.at, reason: c.area + ': ' + c.detail });
        }
      });
      list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    }

    var q = String(f('audit', 'q', '')).trim().toLowerCase();
    if (q) {
      list = list.filter(function (e) {
        return (e.item_id + ' ' + D.label(e.type) + ' ' + userName(e.by) + ' ' + e.reason).toLowerCase().indexOf(q) !== -1;
      });
    }

    var periodOpts = [['week', 'Tuần này'], ['month', 'Tháng này'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['custom', 'Khoảng ngày']];

    return ui.block({
      title: 'Nhật ký sự kiện', count: ran ? list.length + (remote && cache.more ? '+' : '') : undefined, icon: 'history',
      actions: ui.btn(ran ? 'Xem lại' : 'Xem nhật ký', { act: 'audit-run', icon: ran ? 'refresh' : 'history', sm: true, kind: ran ? 'line' : 'primary', disabled: cache.loading }) +
        (canExport ? ui.btn('Xuất CSV', { act: 'export-csv', icon: 'download', sm: true }) : ''),
      note: U.fmtDate(new Date(range.from).toISOString()) + ' – ' + U.fmtDate(new Date(range.to).toISOString()),
      filters: listSearch('audit', 'Mã việc, người thực hiện, lý do') +
        ui.select('', periodOpts, period, { attrs: ' data-filter-screen="audit" data-filter="period" style="flex:0 1 150px"' }) +
        (period === 'custom'
          ? ui.input('', f('audit', 'from', U.localDate()), { type: 'date', attrs: ' data-filter-screen="audit" data-filter="from" style="flex:0 1 150px"', id: 'ffrom' }) +
          ui.input('', f('audit', 'to', U.localDate()), { type: 'date', attrs: ' data-filter-screen="audit" data-filter="to" style="flex:0 1 150px"', id: 'fto' })
          : ''),
      body: ui.table(
        [{ label: 'Thời gian', cls: 'fit' }, { label: 'Mã việc', cls: 'fit' }, { label: 'Sự kiện', cls: 'fit' }, { label: 'Người thực hiện' }, { label: 'Nội dung' }],
        list.map(function (e) {
          return {
            cells: [
              '<span class="tid">' + U.fmtDT(e.at) + '</span>',
              e.item_id
                ? '<button class="btn btn-quiet btn-sm tid" data-act="detail" data-id="' + U.attr(e.item_id) + '">' + U.esc(e.item_id) + '</button>'
                : '<span class="t2">—</span>',
              ui.tag(D.label(e.type), D.tone(e.type)),
              '<div class="t2">' + U.esc(userName(e.by) || e.by) + '</div>',
              '<div class="t2">' + U.esc(e.reason) + '</div>'
            ]
          };
        }),
        { icon: 'history', title: !ran ? 'Chưa xem nhật ký' : cache.loading && !list.length ? 'Đang tải nhật ký…' : 'Không có sự kiện trong kỳ đã chọn', text: '', tableClass: 'audit-table' }
      ) + (cache.error ? ui.banner('danger', 'Không lấy được nhật ký', cache.error) : '') +
        (cache.more ? '<div class="form-end">' + ui.btn(cache.loading ? 'Đang tải…' : 'Xem thêm', { act: 'audit-more', disabled: cache.loading }) + '</div>' : '')
    });
  }

  /* ============================ Hộp thoại: chi tiết ============================ */

  var activityCache=null, activitySequence=0;
  function activityItemId() { return activityCache && activityCache.item_id || ''; }
  function openActivity(id) {
    if(!U.byId(visibleItems(),'item_id',id)){ui.toast('Không có quyền xem hồ sơ này.','err');return;}
    activityCache={item_id:id,data:null};ui.closeDialog();LS.app.showActivity();loadActivity(false);
  }
  function loadActivity(more) {
    if(!activityCache || activityCache.loading)return;
    var id=activityCache.item_id;
    if(!U.byId(visibleItems(),'item_id',id))return;
    var old=more && activityCache.data,seq=++activitySequence,opts={};
    if(old){opts.event_cursor=old.event_cursor;opts.send_cursor=old.send_cursor;}
    activityCache.loading=true;activityCache.error='';LS.app.render();
    var job=U.isGas()?LS.api.getItemActivity(id,opts):Promise.resolve({item_id:id,events:st().events.filter(function(e){return e.item_id===id;}).slice().sort(function(a,b){return new Date(b.at)-new Date(a.at);}),sends:st().outbox.filter(function(o){return o.item_id===id;}),events_more:false,sends_more:false});
    job.then(function(data){
      if(seq!==activitySequence || !activityCache || activityCache.item_id!==id)return;
      if(old){data.events=old.events.concat(data.events);data.sends=old.sends.concat(data.sends);}
      activityCache={item_id:id,data:data};LS.app.render();
    }).catch(function(e){if(seq!==activitySequence || !activityCache)return;activityCache.loading=false;activityCache.error=e.message;LS.app.render();});
  }
  function deliverySection(i,sends) {
    var mayConfirm=i.assigned_user_id===me().user_id || ['KS_LS','QUAN_LY_LS'].indexOf(me().role)!==-1;
    return ui.block({title:'Tin gửi đi',icon:'bell',count:sends.length,body:ui.table(
      [{label:'Thời gian'},{label:'Kênh'},{label:'Người nhận'},{label:'Trạng thái'},{label:'Ghi chú'},{label:'Thao tác'}],
      sends.map(function(o){var status=D.OUT_STATUS[o.status] || {label:o.status || 'Chưa rõ',tone:'neutral'};
        return {cells:[U.fmtDT(o.sent_at || o.created_at),U.esc(D.CHANNELS[o.channel]?D.CHANNELS[o.channel].name:o.channel),
          U.esc(o.recipient_name || '')+'<div class="t2">'+U.esc(U.mask(o.recipient))+'</div>',ui.tag(status.label,status.tone),
          U.esc(o.note || o.provider_id || o.provider_msg_id || '—'),o.status==='CHO_XAC_NHAN' && mayConfirm ?
          ui.btn('Xem & gửi',{kind:'primary',sm:true,act:'activity-send-preview',data:' data-id="'+U.attr(o.outbox_id)+'"'}) : '']};}),
      {icon:'bell',title:'Chưa phát sinh tin gửi',text:''})});
  }
  function previewActivitySend(id) {
    var i=U.byId(visibleItems(),'item_id',activityItemId()),u=me();
    if(!i || (i.assigned_user_id!==u.user_id && ['KS_LS','QUAN_LY_LS'].indexOf(u.role)===-1))return;
    var row=activityCache && activityCache.data && U.byId(activityCache.data.sends,'outbox_id',id);
    if(!row || row.status!=='CHO_XAC_NHAN')return;
    // The on-demand page can contain a pending message older than bootstrap's tail.
    // Cache it only for the existing preview/confirmation flow; this does not send.
    if(!U.byId(st().outbox,'outbox_id',id))st().outbox.push(Object.assign({},row));
    LS.admin.confirmSend(id);
  }
  function itemActivity() {
    var id=activityItemId(),i=U.byId(visibleItems(),'item_id',id);
    if(!i)return ui.empty({icon:'history',title:'Không có hồ sơ để xem lịch sử',text:''});
    var body=ui.block({title:'Hoạt động & lịch sử',icon:'history',count:itemRef(i),actions:
      ui.btn('Về hồ sơ',{act:'activity-back',icon:'arrow-left',sm:true})+ui.btn('Tải lại',{act:'activity-refresh',sm:true,disabled:activityCache.loading}),body:'<p class="t2">'+U.esc(productLabel(i))+'</p>'});
    if(activityCache.error)body+=ui.banner('danger','Không lấy được lịch sử',activityCache.error);
    if(activityCache.loading)body+='<p class="t2">Đang tải lịch sử…</p>';
    var data=activityCache.data;if(!data)return body;
    body+=ui.block({title:'Nhật ký thao tác',icon:'history',count:data.events.length,body:ui.timeline(data.events.map(function(e){
      var change=[];
      if(e.type==='SUA_THOI_GIAN'){
        var before={},after={};
        try{before=JSON.parse(e.before_json || '{}') || {};}catch(ignore){}
        try{after=JSON.parse(e.after_json || '{}') || {};}catch(ignore){}
        ['dossier_received_at','completed_at'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(after,k) && before[k]!==after[k])change.push((k==='dossier_received_at'?'Nhận hồ sơ: ':'Hoàn thành: ')+(before[k]?U.fmtDT(before[k]):'—')+' → '+(after[k]?U.fmtDT(after[k]):'—'));});
      }
      return {title:D.label(e.type),time:U.fmtDT(e.at)+' · '+(e.by_name || userName(e.by) || e.by),text:(e.reason || '')+(change.length?' · '+change.join('; '):'')};
    }))})+deliverySection(i,data.sends);
    if(data.events_more || data.sends_more)body+=ui.btn(activityCache.loading?'Đang tải…':'Xem lịch sử cũ hơn',{act:'activity-more',disabled:activityCache.loading});
    return body;
  }

  function detail(itemId) {
    var i = U.byId(visibleItems(), 'item_id', itemId);
    // Thông báo/đường dẫn cũ trỏ vào dòng tháng trước: mở dòng đã chuyển tiếp sang tháng này.
    if (!i) i = visibleItems().filter(function (x) { return x.carryover_from_item_id === itemId || (x.origin_item_id && x.origin_item_id === itemId); })[0];
    if (i) itemId = i.item_id;
    if (!i) { ui.toast('Không tìm thấy việc.', 'err'); return; }

    var r = reqOf(i), wt = wtOf(i), u = me();
    var masked = u.role === 'ADMIN';
    var sends = st().outbox.filter(function (o) { return o.item_id === itemId; });
    var acts = actionsFor(i);
    var body = '';

    function requestedQuantityRows(item) {
      var rows = [];
      var mortgageCount = Number(item.requested_mortgage_contract_count);
      var exportCount = Number(item.requested_export_folder_count);
      if (isFinite(mortgageCount) && mortgageCount > 0) rows.push(['QLKH dự kiến soạn HĐ thế chấp', mortgageCount + ' hợp đồng']);
      if (isFinite(exportCount) && exportCount > 0) rows.push(['QLKH dự kiến xuất tài sản', exportCount + ' bìa']);
      return rows;
    }

    // Không đưa SLA/hạn xử lý lên màn hồ sơ khách; cán bộ xem bộ đếm giờ làm
    // thực tế ở phần Công việc bên dưới.
    if (i.pending) body += ui.banner('warn', 'Có đề nghị sửa chờ kiểm soát duyệt', i.pending.reason);
    // Ghi chú Phòng/PGD để lên đầu hộp chi tiết, không nằm lẫn dưới thông tin khách.
    if (!masked && r && String(r.note || '').trim()) body += '<div class="detail-note"><span>Ghi chú của ' + U.esc(unitName(r.unit_id) || 'Phòng/PGD') + '</span><p>' + U.esc(r.note) + '</p></div>';

    body += ui.sectionTitle('Khách hàng') +
      (masked
        ? '<p class="t2">Thông tin khách hàng đã ẩn</p>'
        : ui.kv([
          ['Tên', r ? r.customer.name : '—'],
          ['CIF', r && r.customer.cif ? r.customer.cif : 'Khách mới'],
          ['Điện thoại', r ? r.customer.phone : ''],
          ['Email', r ? r.customer.email : ''],
          ['Đơn vị gửi', r ? unitName(r.unit_id) : ''],
          ['Người gửi', r ? userName(r.created_by) : '']
        ]));

    // Ô tick của việc TSĐB có hộp "Phần việc" riêng, không lặp lại ở dòng phần cán bộ trước đã làm.
    var stepOwned = D.stepKeys(i, wt), contractOwned = ['HD_TIN_DUNG', 'HD_THE_CHAP'];
    var earlierParts = D.creditedParts(i).filter(function (p) {
      return stepOwned.indexOf(p.key) === -1 && contractOwned.indexOf(p.key) === -1;
    });
    body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Công việc') +
      ui.kv([
        ['Loại việc', wt ? (wt.group || wt.name) : i.work_type_code],
        ['Sản phẩm', productLabel(i)],
        // Dòng chuyển tiếp mang ngày đầu kỳ mới; ngày gửi thật nằm ở dòng kế tiếp.
        ['Ngày phát sinh', U.fmtDate(i.occurrence_date) + (i.carryover_from_item_id ? ' · chuyển tiếp từ tháng trước' : '')],
        ['Phòng/PGD gửi hồ sơ lúc', i.submitted_at ? U.fmtDT(i.submitted_at) : 'Chưa ghi nhận'],
        ['LS tiếp nhận hồ sơ lúc', i.dossier_received_at ? U.fmtDT(i.dossier_received_at) : 'Chưa tiếp nhận'],
        ['Trạng thái', ui.statusTag(i.status), true],
        ['Cán bộ xử lý', userName(i.assigned_user_id) || 'Chưa giao'],
        ['Tiến độ làm việc', {ACTIVE:'Đang làm',QUEUED:'Chờ bắt đầu',WAITING:'Chờ làm tiếp'}[LSTiming.workState(i)] || D.label(i.status)],
        ['Ưu tiên xử lý', i.is_priority ? priorityLsTag() : 'Không', true],
        ['Từ LS nhận đến hoàn thành', receiptClock(i), true],
        ['Giờ xử lý', processingClock(i), true],
        ['Hoàn thành', i.completed_at ? U.fmtDT(i.completed_at) : '—']
      ].concat(requestedQuantityRows(i), i.status === 'HOAN_THANH_LS' && D.resultFlagsFor(i, wt).length && D.savedResultFlags(i)
        ? [['Kết quả ghi nhận', D.resultFlagsFor(i, wt).map(function (x) { return x.short + ': ' + (D.resolvedResultFlags(i, wt)[x.key] === true ? 'có' : 'không'); }).join(' · ')]] : [],
      earlierParts.length ? [['Phần cán bộ trước đã làm', earlierParts.map(function (p) {
        return p.short + ': ' + (userName(p.user_id) || p.user_id) + (p.at ? ' (' + U.fmtDate(p.at) + ')' : '');
      }).join(' · ')]] : []
      )) + '</div>';

    body += contractDraftSection(i, wt);

    body += '<div data-checklist-box="' + U.attr(i.item_id) + '">' + checklistSection(i) + '</div>';
    body += '<div data-steps-box="' + U.attr(i.item_id) + '">' + stepsSection(i) + '</div>';
    if (LSTiming.sessions(i,U.now()).some(function(s){return !s.user_id;})) {
      body += ui.banner('warn','Giờ cũ chưa xác nhận người thực hiện','') +
        (canCorrectTimes(i) ? ui.btn('Xác nhận người thực hiện',{act:'timing-owner',data:' data-id="'+U.attr(i.item_id)+'"'}) : '');
    }
    body += linkedSection(i);

    if (i.appointment) {
      var ap = i.appointment;
      var chanLabel = (D.REACH_CHANNELS.filter(function (c) { return c.code === ap.channel; })[0] || {}).label ||
        (ap.channel === 'NHOM' ? 'Nhóm Zalo nội bộ' : ap.channel);
      body += '<div style="margin-top:1.125rem">' + ui.sectionTitle('Lịch hẹn ký') +
        ui.kv([
          ['Ngày ký', U.fmtDate(ap.date || ap.at)],
          ['Giờ ký', ap.time || U.fmtTime(ap.at)],
          ['Nơi ký', ap.place],
          ['Kênh báo khách', chanLabel]
        ]) +
        (ap.via_group
          ? ui.banner('warn', 'Khách không có kênh liên hệ trực tiếp',
            'Liên hệ qua ' + (D.officerTag(i, st()) || 'cán bộ phụ trách'))
          : '') +
        '</div>';
    }

    body += supplementSection(i);

    // Tin gửi khách phải do người phụ trách xem trước và xác nhận, nên nút
    // xác nhận nằm ngay trong chi tiết việc chứ không chỉ ở màn quản trị.
    var mayConfirm = i.assigned_user_id === u.user_id || ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
    var waiting = sends.filter(function (o) { return o.status === 'CHO_XAC_NHAN'; });

    if (waiting.length && mayConfirm) {
      body += ui.banner('warn', waiting.length + ' tin chờ xác nhận', '');
    }

    body += '<div style="margin-top:1.125rem">'+ui.btn('Hoạt động & lịch sử',{act:'item-activity',icon:'history',data:' data-id="'+U.attr(itemId)+'"'})+'</div>';

    // Hồ sơ mới ghi mốc nhận ngay khi bấm "Tiếp nhận hồ sơ"; ô tick chỉ còn cho hồ sơ cũ đã xử lý mà chưa có mốc.
    var receiptControl = u.role === 'CAN_BO_LS' && u.user_id === i.assigned_user_id && i.status !== 'HUY' && (i.dossier_received_at || !LSTiming.awaitingReceipt(i.status))
      ? '<label class="chan-check"><input type="checkbox" data-act="dossier-received" data-id="' + U.attr(i.item_id) + '" data-version="' + U.attr(i.version) + '"' +
        (i.dossier_received_at ? ' checked disabled' : (i.syncing ? ' disabled' : '')) + '><span>' +
        (i.dossier_received_at ? 'LS đã tiếp nhận hồ sơ · ' + U.fmtDT(i.dossier_received_at) : 'LS xác nhận đã nhận đủ hồ sơ') + '</span></label>'
      : '';
    body += '<div class="form-end" data-hotkeys>' + receiptControl +
      (canFocus(i) && LSTiming.workState(i)!=='ACTIVE' ? ui.btn(LSTiming.workState(i)==='WAITING'?'Làm tiếp':'Làm ngay',{act:'start-work',kind:'primary',data:' data-id="'+U.attr(i.item_id)+'"'}) : '') +
      (canCorrectTimes(i) ? ui.btn('Ghi / sửa giờ LS nhận đủ', { act:'edit-times', data:' data-id="' + U.attr(i.item_id) + '"', icon:'clock' }) : '') +
      (canEditResultFlags(i) ? ui.btn('Sửa ghi nhận kết quả', { act: 'edit-result-flags', data: ' data-id="' + U.attr(i.item_id) + '"', icon: 'check' }) : '') +
      (canEdit(i) ? ui.btn('Sửa thông tin', { act: 'edit-item', data: ' data-id="' + U.attr(i.item_id) + '" aria-keyshortcuts="E"', icon: 'pencil', title: 'Phím E' }) : '') +
      acts.map(function (a, n) {
        return n < 9 ? ui.btn(a.label, {
          kind: a.primary ? 'primary' : 'line', act: 'flow', title: 'Phím ' + (n + 1),
          data: ' data-id="' + U.attr(i.item_id) + '" data-to="' + a.to + '" data-hotkey="' + (n + 1) + '" aria-keyshortcuts="' + (n + 1) + '"'
        }) : ui.btn(a.label, { kind: 'line', act: 'flow', data: ' data-id="' + U.attr(i.item_id) + '" data-to="' + a.to + '"' });
      }).join('') + '</div>';

    ui.openDialog('Việc ' + itemRef(i), '<div data-detail="' + U.attr(i.item_id) + '">' + body + '</div>',
      { size: 'lg', sub: (wt ? (wt.group || wt.name) : '') + ' · ' + i.product_name });
  }

  /** Hộp thoại chi tiết của việc này còn đang mở trên màn hình. */
  function detailShowing(itemId) {
    return ui.dialogOpen() && !!document.querySelector('#dialog [data-detail="' + String(itemId).replace(/["\\]/g, '') + '"]');
  }

  function checklistSection(i) {
    var wt = wtOf(i), u = me();
    if (!wt || !wt.checklist.length) return '';
    var values = Array.isArray(i.checklist) ? i.checklist : [];
    var done = wt.checklist.filter(function (_, idx) { return values[idx] === true; }).length;
    var canTick = i.assigned_user_id === u.user_id || ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle('Việc cần làm') +
      '<p class="t2">Đã hoàn thành ' + done + '/' + wt.checklist.length + ' nhóm.</p>' +
      '<div class="f-stack">' + wt.checklist.map(function (c, idx) {
        return '<label class="chan-check"><input type="checkbox" data-act="checklist-toggle" data-id="' + U.attr(i.item_id) + '" data-index="' + idx + '"' + (values[idx] === true ? ' checked' : '') + (canTick ? '' : ' disabled') + '><span>' + U.esc(c) + '</span></label>';
      }).join('') + '</div>' +
      (done < wt.checklist.length && canTick && !i.syncing
        ? '<div class="btn-row" style="margin-top:.5rem">' + ui.btn('Tick đủ ' + wt.checklist.length + ' nhóm', { kind: 'line', sm: true, icon: 'check', act: 'checklist-all', data: ' data-id="' + U.attr(i.item_id) + '"' }) + '</div>' : '') +
      (done === wt.checklist.length ? ui.banner('ok', 'Đã ghi nhận đủ các nhóm việc', '') : '') + '</div>';
  }

  function refreshChecklistBox(itemId) {
    if (!ui.dialogOpen()) return;
    var box = document.querySelector('#dialog [data-checklist-box="' + String(itemId).replace(/["\\]/g, '') + '"]');
    var i = U.byId(st().items, 'item_id', itemId);
    if (box && i) box.innerHTML = checklistSection(i);
  }

  /* ============================ Phần việc TSĐB: soạn xong HĐ thế chấp, nhập kho, xuất kho ============================ */

  var STEP_OPEN_STATUS = ['DANG_THUC_HIEN', 'DA_SOAN_XONG', 'CHO_KS_DUYET', 'DANG_HEN_KH', 'TAM_DUNG'];

  /** Cán bộ đang giữ hồ sơ (hoặc Kiểm soát / Quản lý LS) tick được khi hồ sơ đã tiếp nhận và còn mở. */
  function canTickStep(i) {
    var u = me();
    return !!(u && !i.syncing && i.assigned_user_id && i.dossier_received_at && !i.carried_to_item_id &&
      STEP_OPEN_STATUS.indexOf(i.status) !== -1 &&
      (u.role === 'CAN_BO_LS' ? i.assigned_user_id === u.user_id : ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1));
  }

  function resultQuantityKeys(i) {
    if (!i) return [];
    var wt = wtOf(i), seen = {};
    D.creditedParts(i, wt).forEach(function (part) { seen[part.key] = true; });
    if (i.status === 'HOAN_THANH_LS') D.dailyActivityKeys(i, wt).forEach(function (key) { seen[key] = true; });
    return D.HANDOVER_PARTS.map(function (part) { return part.key; }).filter(function (key) {
      return seen[key] && !!D.stepQuantityLabel(key);
    });
  }

  function canEditCompletedResultQuantities(i) {
    var u = me();
    return !!(u && i && i.status === 'HOAN_THANH_LS' && !i.syncing && i.assigned_user_id && !i.carried_to_item_id &&
      (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1 || (u.role === 'CAN_BO_LS' && i.assigned_user_id === u.user_id)));
  }

  function canAdjustResultQuantity(i, key, ownerId) {
    var u = me();
    return !!((canEditCompletedResultQuantities(i) || canTickStep(i)) && resultQuantityKeys(i).indexOf(key) !== -1 &&
      (u.role !== 'CAN_BO_LS' || !ownerId || ownerId === u.user_id));
  }

  function stepWho(s) {
    return s.done ? ' · ' + (userName(s.user_id) || s.user_id) + (s.at ? ' · ' + U.fmtDT(s.at) : '') + (D.stepQuantityLabel(s.key) ? ' · SL ' + s.quantity : '') : '';
  }

  function stepQuantityInput(s, itemId, disabled, formName) {
    var label = D.stepQuantityLabel(s.key);
    if (!label) return '';
    var name = formName || 'step-quantity';
    return '<div class="step-quantity"><label>' + U.esc(label) + '</label><input type="number" min="1" step="1" value="' + U.attr(s.quantity || 1) + '"' +
      (formName ? ' name="' + U.attr(formName) + '" required' : ' data-act="step-quantity" data-id="' + U.attr(itemId) + '" data-key="' + U.attr(s.key) + '"') +
      (disabled ? ' disabled' : '') + '></div>';
  }

  /** Hộp "Phần việc phải tick" trong chi tiết hồ sơ: mỗi ô lưu ngay, người và giờ tick đi vào bảng kết quả ngày. */
  function stepsSection(i) {
    var list = D.steps(i, wtOf(i));
    if (!list.length) return '';
    var u = me(), may = canTickStep(i), completed = i.status === 'HOAN_THANH_LS';
    var warehouseDone = list.some(function (s) { return s.done && s.key !== 'HD_THE_CHAP'; });
    var draftDone = list.every(function (s) { return s.key !== 'HD_THE_CHAP' || s.done; });
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle('Phần việc phải tick') +
      '<div class="f-stack">' + list.map(function (s) {
        var locked = !may;
        if (!s.done && s.key !== 'HD_THE_CHAP' && !draftDone) locked = true;
        if (s.done && s.key === 'HD_THE_CHAP' && warehouseDone) locked = true;
        if (s.done && u.role === 'CAN_BO_LS' && s.user_id !== u.user_id) locked = true;
        var quantityOwner = s.user_id || i.assigned_user_id;
        var quantityLocked = s.done ? !canAdjustResultQuantity(i, s.key, quantityOwner) : locked || !may;
        return '<div class="step-entry" data-step-row><label class="chan-check"><input type="checkbox" data-act="step-toggle" data-id="' + U.attr(i.item_id) + '" data-key="' + U.attr(s.key) + '"' +
          (s.done ? ' checked' : '') + (locked || completed ? ' disabled' : '') + '><span>' + U.esc(s.label + stepWho(s)) + '</span></label>' +
          stepQuantityInput(s, i.item_id, quantityLocked) + '</div>';
      }).join('') + '</div>' +
      (list.every(function (s) { return s.done; }) ? ui.banner('ok', 'Đã tick đủ phần việc', '') : '') + '</div>';
  }

  function refreshStepsBox(itemId) {
    if (!detailShowing(itemId)) return;
    var box = document.querySelector('#dialog [data-steps-box="' + String(itemId).replace(/["\\]/g, '') + '"]');
    var i = U.byId(st().items, 'item_id', itemId);
    if (box && i) box.innerHTML = stepsSection(i);
  }

  /** Tick hoặc bỏ tick một phần việc: màn hình đổi ngay, máy chủ nhận ở nền, bị từ chối thì hoàn tác. */
  function recordStepToggle(itemId, key, checked, quantity) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canTickStep(i) || D.stepKeys(i, wtOf(i)).indexOf(key) === -1) { refreshStepsBox(itemId); return; }
    var current = D.resultCredit(i)[key];
    var quantityKey = !!D.stepQuantityLabel(key);
    var quantityGiven = quantity !== undefined && quantity !== null && quantity !== '';
    var requestedQuantity = quantityGiven ? Number(quantity) : Math.max(1, Math.floor(Number(current && current.quantity) || 1));
    if (checked && quantityKey && quantityGiven && (!isFinite(requestedQuantity) || requestedQuantity < 1 || Math.floor(requestedQuantity) !== requestedQuantity)) {
      ui.toast('Số lượng phải là số nguyên lớn hơn 0.', 'err'); refreshStepsBox(itemId); return;
    }
    var alreadyDone = !!(current && current.user_id);
    if (alreadyDone === checked && (!checked || !quantityKey || (Math.max(1, Math.floor(Number(current.quantity) || 1)) === requestedQuantity))) { refreshStepsBox(itemId); return; }
    if (!checked && me().role === 'CAN_BO_LS' && current.user_id !== me().user_id) {
      ui.toast('Phần này do cán bộ khác làm; nhờ Kiểm soát hoặc Quản lý LS gỡ.', 'err'); refreshStepsBox(itemId); return;
    }
    // Khớp máy chủ: nhập/xuất kho sau khi soạn xong HĐ thế chấp; bỏ tick theo thứ tự ngược lại.
    var list = D.steps(i, wtOf(i)), draft = list.filter(function (s) { return s.key === 'HD_THE_CHAP'; })[0];
    var warehouseDone = list.some(function (s) { return s.key !== 'HD_THE_CHAP' && s.done; });
    if (checked && key !== 'HD_THE_CHAP' && draft && !draft.done) {
      ui.toast('Tick "' + D.COLLATERAL_STEP_LABELS.HD_THE_CHAP + '" trước khi tick nhập/xuất kho.', 'err'); refreshStepsBox(itemId); return;
    }
    if (!checked && key === 'HD_THE_CHAP' && warehouseDone) {
      ui.toast('Bỏ tick nhập/xuất kho trước khi bỏ tick soạn xong HĐ thế chấp.', 'err'); refreshStepsBox(itemId); return;
    }
    var before = JSON.parse(JSON.stringify(D.resultCredit(i))), expected = i.version, ts = U.now();
    var credit = JSON.parse(JSON.stringify(before));
    if (checked) {
      credit[key] = alreadyDone ? Object.assign({}, current) : { user_id: i.assigned_user_id, at: ts, by: st().session };
      if (quantityKey) credit[key].quantity = requestedQuantity;
    } else delete credit[key];
    i.result_credit = credit;
    i.version = Number(i.version || 1) + 1;
    LS.app.render();
    refreshStepsBox(itemId);
    var oldQuantity = Math.max(1, Math.floor(Number(current && current.quantity) || 1));
    var text = checked && alreadyDone && quantityKey
      ? 'Điều chỉnh số lượng ' + D.COLLATERAL_STEP_LABELS[key] + ': ' + oldQuantity + ' → ' + requestedQuantity
      : (checked ? 'Đã tick: ' : 'Bỏ tick: ') + D.COLLATERAL_STEP_LABELS[key];
    if (!U.isGas()) { logEvent(itemId, 'GHI_NHAN_PHAN_VIEC', text); U.save(); return; }
    LS.app.background(LS.api.recordWorkStep(itemId, key, checked, quantityKey ? requestedQuantity : null, expected), {
      label: 'Ghi nhận phần việc',
      onOk: function (result) {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live && result) {
          // Lệnh sau đã đổi màn hình: phản hồi cũ không được xóa tick đang chờ lưu.
          if (Number(result.version) < Number(live.version)) { refreshStepsBox(itemId); return; }
          if (result.version) live.version = Math.max(Number(live.version) || 0, Number(result.version) || 0);
          if (result.result_credit_json) live.result_credit = JSON.parse(result.result_credit_json);
        }
        LS.app.render();
        refreshStepsBox(itemId);
      },
      rollback: function () {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live) { live.result_credit = before; live.version = expected; }
        LS.app.render();
        refreshStepsBox(itemId);
      }
    });
  }

  /**
   * "Xong HĐTD": tùy chọn, không bắt buộc. Hồ sơ vay hết tồn HĐ tín dụng ngay khi cán bộ bấm, khỏi chờ tới lúc
   * đặt lịch hẹn ký (lúc hẹn ký vẫn tự ghi nhận như cũ nếu chưa bấm). Khớp nhánh HD_TIN_DUNG của recordWorkStep ở Code.gs.
   */
  function canMarkCreditDraft(i) {
    var c = i && D.resultCredit(i).HD_TIN_DUNG;
    return !!(i && canTickStep(i) && D.draftContractKeys(i, wtOf(i)).indexOf('HD_TIN_DUNG') !== -1 &&
      (!c || !c.user_id || (c.source === 'MANUAL' && (me().role !== 'CAN_BO_LS' || c.user_id === me().user_id))));
  }

  function markCreditDraft(itemId, done) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canMarkCreditDraft(i)) { ui.toast('Không ghi nhận được HĐ tín dụng cho hồ sơ này.', 'err'); return; }
    var current = D.resultCredit(i).HD_TIN_DUNG;
    if (!!(current && current.user_id) === done) return;
    var before = JSON.parse(JSON.stringify(D.resultCredit(i))), expected = i.version, ts = U.now();
    var credit = JSON.parse(JSON.stringify(before));
    if (done) credit.HD_TIN_DUNG = { user_id: i.assigned_user_id, at: ts, by: st().session, source: 'MANUAL' };
    else delete credit.HD_TIN_DUNG;
    i.result_credit = credit;
    i.version = Number(i.version || 1) + 1;
    LS.app.render();
    if (detailShowing(itemId)) detail(itemId);
    ui.toast((done ? 'Đã ghi nhận soạn xong HĐ tín dụng · ' : 'Đã bỏ ghi nhận HĐ tín dụng · ') + itemRef(i), 'ok');
    if (!U.isGas()) { logEvent(itemId, 'GHI_NHAN_PHAN_VIEC', (done ? 'Đã tick: ' : 'Bỏ tick: ') + 'Đã soạn xong HĐ tín dụng'); U.save(); return; }
    LS.app.background(LS.api.recordWorkStep(itemId, 'HD_TIN_DUNG', done, null, expected), {
      label: 'Ghi nhận HĐ tín dụng',
      onOk: function (result) {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live && result && Number(result.version) >= Number(live.version)) {
          live.version = Number(result.version);
          if (result.result_credit_json) live.result_credit = JSON.parse(result.result_credit_json);
        }
        LS.app.render();
      },
      rollback: function () {
        var live = U.byId(st().items, 'item_id', itemId);
        if (live) { live.result_credit = before; live.version = expected; }
        if (detailShowing(itemId)) detail(itemId);
      }
    });
  }

  function creditDraftButton(i) {
    if (!canMarkCreditDraft(i)) return '';
    var c = D.resultCredit(i).HD_TIN_DUNG, done = !!(c && c.user_id);
    return ui.btn(done ? 'Bỏ "Xong HĐTD"' : 'Xong HĐTD', {
      kind: done ? 'quiet' : 'line', sm: true, act: 'credit-draft', icon: done ? '' : 'check',
      title: done ? 'Bỏ ghi nhận đã soạn xong HĐ tín dụng' : 'Đã soạn xong HĐ tín dụng: hết tồn ngay, không cần chờ hẹn ký',
      data: ' data-id="' + U.attr(i.item_id) + '" data-done="' + (done ? '0' : '1') + '"'
    });
  }

  /** Tick đủ mọi nhóm việc còn thiếu trong một lần bấm (vẫn lưu qua cùng hàng đợi như tick từng ô). */
  function checklistAll(itemId) {
    var i = U.byId(st().items, 'item_id', itemId), wt = i && wtOf(i);
    if (!i || !wt || !wt.checklist.length || i.syncing) return;
    var values = Array.isArray(i.checklist) ? i.checklist : [];
    wt.checklist.forEach(function (_, idx) { if (values[idx] !== true) saveChecklistToggle(itemId, idx, true); });
  }

  /**
   * Tiếp nhận một chạm: không mở hộp thoại. Chưa làm hồ sơ nào thì làm hồ sơ này ngay, đang làm hồ sơ khác thì
   * nhận vào danh sách chờ. Hồ sơ vay kèm TSĐB mới: việc kèm TSĐB đã giao cho chính cán bộ này được tiếp nhận luôn
   * (vào danh sách chờ), để HĐ thế chấp vào tồn soạn ngay và cán bộ khỏi bấm tiếp nhận lần hai.
   */
  function receiveNow(itemId, opts) {
    opts = opts || {};
    var i = U.byId(st().items, 'item_id', itemId), u = me();
    if (!i || !u || u.role !== 'CAN_BO_LS' || i.status !== 'DA_PHAN_CONG' || i.assigned_user_id !== u.user_id || i.syncing) return false;
    var active = visibleItems().some(function (x) { return x.item_id !== i.item_id && x.assigned_user_id === u.user_id && LSTiming.workState(x) === 'ACTIVE'; });
    var startNow = opts.queue ? false : !active;
    var form = document.createElement('form');
    form.setAttribute('data-form', 'flow'); form.setAttribute('data-id', i.item_id); form.setAttribute('data-to', 'DANG_THUC_HIEN');
    form.setAttribute('data-from', i.status); form.setAttribute('data-version', String(i.version));
    form.innerHTML = '<input type="hidden" name="start_now" value="' + (startNow ? 'start' : 'queue') + '">';
    submitFlow(form);
    if (opts.withLinked !== false) {
      st().items.filter(function (k) {
        return k.parent_item_id === i.item_id && !k.carried_to_item_id && k.status === 'DA_PHAN_CONG' && k.assigned_user_id === u.user_id;
      }).forEach(function (k) { receiveNow(k.item_id, { queue: true, withLinked: false }); });
    }
    return true;
  }

  function awaitingMyReceipt() {
    var u = me();
    return u && u.role === 'CAN_BO_LS' ? visibleItems().filter(function (i) {
      return i.status === 'DA_PHAN_CONG' && i.assigned_user_id === u.user_id && !i.carried_to_item_id && !i.syncing;
    }) : [];
  }

  /** Tiếp nhận tất cả hồ sơ đã giao trong một lần xác nhận; hồ sơ đầu được làm ngay nếu chưa làm hồ sơ nào. */
  function receiveAll() {
    var list = awaitingMyReceipt();
    if (!list.length) { ui.toast('Không còn hồ sơ chờ tiếp nhận.', 'ok'); return; }
    ui.confirm({
      title: 'Tiếp nhận tất cả', heading: 'Tiếp nhận ' + list.length + ' hồ sơ đã giao?',
      text: 'Giờ nhận hồ sơ của từng hồ sơ ghi là bây giờ. Chỉ tiếp nhận khi đã cầm đủ hồ sơ.',
      detail: '<ul class="t2" style="margin:0;padding-left:1.1rem">' + list.map(function (i) {
        var r = reqOf(i);
        return '<li>' + U.esc(itemRef(i)) + ' · ' + U.esc(r && r.customer ? r.customer.name : '—') + ' · ' + U.esc(productLabel(i)) + '</li>';
      }).join('') + '</ul>',
      ok: 'Tiếp nhận ' + list.length + ' hồ sơ',
      run: function () {
        var n = 0;
        list.forEach(function (i, idx) { if (receiveNow(i.item_id, { queue: idx > 0, withLinked: false })) n++; });
        ui.toast('Đã tiếp nhận ' + n + ' hồ sơ.', 'ok');
      }
    });
  }

  function recordStepQuantity(itemId, key, quantity) {
    var i = U.byId(st().items, 'item_id', itemId), credit = i && D.resultCredit(i)[key];
    if (i && (i.status === 'HOAN_THANH_LS' || credit && credit.user_id)) {
      var ownerId = credit && credit.user_id || i.assigned_user_id;
      var requested = Number(quantity);
      if (!canAdjustResultQuantity(i, key, ownerId)) { ui.toast('Không thể sửa số lượng kết quả này.', 'err'); return; }
      if (!isFinite(requested) || requested < 1 || Math.floor(requested) !== requested) { ui.toast('Số lượng phải là số nguyên lớn hơn 0.', 'err'); return; }
      var oldQuantity = Math.max(1, Math.floor(Number(credit && credit.quantity) || 1));
      if (oldQuantity === requested) return;
      var before = JSON.parse(JSON.stringify(D.resultCredit(i))), expected = Number(i.version || 1), next = JSON.parse(JSON.stringify(before));
      next[key] = credit ? Object.assign({}, credit) : { user_id: ownerId, at: i.completed_at || U.now(), by: ownerId, source: 'RESULT_CORRECTION' };
      next[key].quantity = requested;
      i.result_credit = next;
      i.version = expected + 1;
      var part = D.HANDOVER_PARTS.filter(function (p) { return p.key === key; })[0];
      var label = D.COLLATERAL_STEP_LABELS[key] || (part ? 'Đã soạn xong ' + part.label : key);
      var reason = 'Điều chỉnh số lượng ' + label + ': ' + oldQuantity + ' → ' + requested;
      LS.app.render();
      if (detailShowing(itemId)) detail(itemId);
      if (!U.isGas()) { logEvent(itemId, 'GHI_NHAN_PHAN_VIEC', reason); U.save(); return; }
      LS.app.background(LS.api.recordWorkStep(itemId, key, true, requested, expected), {
        label: 'Sửa số lượng kết quả',
        onOk: function (result) {
          var live = U.byId(st().items, 'item_id', itemId);
          if (live && result && Number(result.version) >= Number(live.version)) {
            live.version = Number(result.version);
            if (result.result_credit_json) live.result_credit = JSON.parse(result.result_credit_json);
          }
          LS.app.render();
          if (detailShowing(itemId)) detail(itemId);
        },
        rollback: function () {
          var live = U.byId(st().items, 'item_id', itemId);
          if (live) { live.result_credit = before; live.version = expected; }
          LS.app.render();
          if (detailShowing(itemId)) detail(itemId);
        }
      });
      return;
    }
  }

  /*
   * Tích nhiều ô liên tiếp: trước đây ô thứ hai bị bỏ qua trong lúc ô đầu còn
   * đang lưu, nhưng trên màn hình vẫn hiện đã tích — người dùng tưởng đã lưu.
   * Giờ mỗi lần tích chỉ đổi dữ liệu tại chỗ; sau một nhịp ngắn gửi nguyên mảng
   * hiện tại lên máy chủ, các lần gửi nối đuôi nhau nên phiên bản luôn khớp.
   */
  var checklistQueue = {};

  function checklistPending(itemId) {
    var q = checklistQueue[itemId];
    return !!(q && (q.timer || q.busy));
  }

  function flushChecklist(itemId) {
    var q = checklistQueue[itemId];
    if (!q) return Promise.resolve();
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
      q.chain = q.chain.then(function () { return sendChecklist(itemId); });
    }
    return q.chain;
  }

  function sendChecklist(itemId) {
    var q = checklistQueue[itemId], i = U.byId(st().items, 'item_id', itemId);
    if (!q || !i) return null;
    var values = (i.checklist || []).slice(), json = JSON.stringify(values);
    if (json === q.saved) return null;
    q.busy += 1;
    return LS.app.background(LS.api.saveChecklist(itemId, values, i.version), {
      label: 'Ghi nhận nhóm việc',
      onOk: function (result) {
        q.busy -= 1;
        q.saved = json;
        var live = U.byId(st().items, 'item_id', itemId);
        if (live && result && result.version) live.version = result.version;
      },
      rollback: function () {
        q.busy -= 1;
        var live = U.byId(st().items, 'item_id', itemId);
        if (live) live.checklist = JSON.parse(q.saved);
        refreshChecklistBox(itemId);
      }
    });
  }

  function saveChecklistToggle(itemId, index, checked) {
    var i = U.byId(st().items, 'item_id', itemId), wt = i && wtOf(i);
    if (!i || !wt || !wt.checklist.length || i.syncing) return;
    var values = Array.isArray(i.checklist) ? i.checklist.slice() : [];
    var saved = JSON.stringify(values);
    values[index] = !!checked;
    while (values.length < wt.checklist.length) values.push(false);
    i.checklist = values.slice(0, wt.checklist.length);
    refreshChecklistBox(itemId);

    if (U.isGas()) {
      var q = checklistQueue[itemId] || (checklistQueue[itemId] = { chain: Promise.resolve(), busy: 0, timer: null, saved: saved });
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(function () { flushChecklist(itemId); }, 500);
      return;
    }
    i.version = Number(i.version || 1) + 1;
    logEvent(i.item_id, 'CAP_NHAT_CHECKLIST', i.checklist.filter(Boolean).length + '/' + wt.checklist.length + ' nhóm việc đã hoàn thành.');
    U.save();
  }

  /* ============================ Việc kèm (vd. hồ sơ TSĐB mới) ============================ */

  var LINKABLE_STATUS = ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DA_SOAN_XONG', 'DANG_HEN_KH', 'TAM_DUNG'];
  var LINKED_GROUP = 'TSĐB';

  function linkedChildren(i) {
    return st().items.filter(function (x) { return x.parent_item_id && x.parent_item_id === i.item_id && x.status !== 'HUY'; });
  }

  function linkedOptions(i) {
    var taken = linkedChildren(i).map(function (x) { return x.work_type_code; });
    return st().workTypes.filter(function (w) {
      return w.active && w.group === LINKED_GROUP && w.code !== i.work_type_code && taken.indexOf(w.code) === -1;
    });
  }

  function canAddLinked(i) {
    var u = me();
    if (!u || i.syncing || i.parent_item_id || !i.assigned_user_id || LINKABLE_STATUS.indexOf(i.status) === -1) return false;
    if (u.role === 'CAN_BO_LS') return i.assigned_user_id === u.user_id;
    return ['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1;
  }

  /**
   * Đang làm vay món mà có thêm tài sản mới: tích một ô là thành việc thứ hai
   * (dòng việc riêng, giao luôn cho người đang làm), nên báo cáo đếm 2 việc.
   */
  function linkedSection(i) {
    var parent = i.parent_item_id ? U.byId(st().items, 'item_id', i.parent_item_id) : null;
    var kids = linkedChildren(i);
    var html = '';
    if (parent) {
      html += '<div class="t2">Việc kèm của ' + U.esc(itemRef(parent)) + '</div>';
      html += '<div class="form-end" style="margin-top:.5rem">' +
        ui.btn('Mở việc chính', { sm: true, act: 'detail', data: ' data-id="' + U.attr(parent.item_id) + '"' }) + '</div>';
    }
    if (kids.length) {
      html += '<div class="f-stack" style="margin-top:.5rem">' + kids.map(function (k) {
        return '<div class="act-row"><span class="tid">' + U.esc(k.syncing ? 'Đang tạo…' : itemRef(k)) + '</span>' +
          '<span class="t2">' + U.esc(productLabel(k)) + '</span>' + ui.statusTag(k.status) +
          (k.syncing ? '' : ui.btn('Mở', { sm: true, kind: 'line', act: 'detail', data: ' data-id="' + U.attr(k.item_id) + '"' })) + '</div>';
      }).join('') + '</div>';
    }
    var opts = canAddLinked(i) ? linkedOptions(i) : [];
    if (opts.length) {
      var def = opts.filter(function (w) { return /nhập mới/i.test(w.name); })[0] || opts[0];
      html += '<label class="chan-check" style="margin-top:.625rem"><input type="checkbox" data-act="linked-toggle">' +
        '<span>Làm kèm hồ sơ TSĐB (tài sản mới)</span></label>' +
        '<div data-linked-box hidden style="margin-top:.5rem">' +
        '<div class="f-row">' + ui.field('Sản phẩm TSĐB', ui.select('linked_type', opts.map(function (w) { return [w.code, w.name]; }), def.code, { attrs: ' data-role="linked-type"' })) + '</div>' +
        '<div class="form-end">' + ui.btn('Thêm việc TSĐB', { kind: 'primary', sm: true, act: 'add-linked', data: ' data-id="' + U.attr(i.item_id) + '"' }) + '</div></div>';
    }
    if (!html) return '';
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle('Việc kèm') + html + '</div>';
  }

  function toggleLinkedBox(on) {
    var box = document.querySelector('#dialog [data-linked-box]');
    if (box) box.hidden = !on;
  }

  function addLinked(parentId) {
    var parent = U.byId(st().items, 'item_id', parentId);
    var sel = document.querySelector('#dialog [data-role="linked-type"]');
    var wt = sel ? U.byId(st().workTypes, 'code', sel.value) : null;
    if (!parent || !canAddLinked(parent)) { ui.toast('Không thể thêm việc kèm ở trạng thái này.', 'err'); return; }
    if (!wt || linkedOptions(parent).indexOf(wt) === -1) { ui.toast('Chọn sản phẩm TSĐB hợp lệ.', 'err'); return; }
    var ts = U.now();
    var child = {
      item_id: U.isGas() ? 'TAM_' + Date.now().toString(36).toUpperCase() : U.uid('ITEM'),
      period_id: parent.period_id || '', parent_item_id: parent.item_id, request_id: parent.request_id,
      work_type_code: wt.code, product_name: wt.name, occurrence_date: parent.occurrence_date,
      source_tab: parent.source_tab || '', status: 'DANG_THUC_HIEN',
      assigned_user_id: parent.assigned_user_id, assigned_by: st().session,
      submitted_at: ts, accepted_at: ts, assigned_at: ts, due_at: D.dueFrom(ts, wt.code, st()),
      dossier_received_at:ts,dossier_received_by:st().session,timing_source:'CONFIRMED',first_assigned_at:ts,
      processing_sessions:[],sla_pause_log:[],execution_state:'QUEUED',execution_changed_at:ts,
      completed_at: '', processing_started_at: '', appointment: null,
      checklist: wt.checklist.map(function () { return false; }), note: '', pending: null, version: 1
    };
    st().items.unshift(child);

    if (U.isGas()) {
      var tmp = child.item_id;
      child.syncing = true;
      detail(parentId);
      LS.app.render();
      LS.app.background(LS.api.addLinkedItem(parentId, wt.code), {
        label: 'Thêm việc kèm',
        onOk: function (result) {
          var row = U.byId(st().items, 'item_id', tmp);
          if (row) { row.item_id = result.item_id; row.syncing = false; }
          if (detailShowing(parentId)) detail(parentId); else if (!ui.dialogOpen()) LS.app.render();
          ui.toast('Đã thêm việc ' + wt.name + ' — tính thành việc riêng.', 'ok');
        },
        rollback: function () {
          st().items = st().items.filter(function (x) { return x.item_id !== tmp; });
          if (detailShowing(parentId)) detail(parentId);
        }
      });
      return;
    }
    logEvent(child.item_id, 'TAO_VIEC', 'Việc kèm của ' + itemRef(parent) + ' — đã nhận, chờ bắt đầu làm.');
    U.save();
    detail(parentId);
    LS.app.render();
    ui.toast('Đã thêm việc ' + wt.name + ' — tính thành việc riêng.', 'ok');
  }

  /* ============================ Hộp thoại: chuyển trạng thái ============================ */

  /** Khối tick kết quả (HĐ thế chấp, Rlos) áp dụng cho hồ sơ: hồ sơ vay có cả hai, việc TSĐB chỉ có HĐ thế chấp. */
  function contractDraftSection(item, wt) {
    var parts = D.creditedParts(item, wt), labels = { HD_TIN_DUNG: 'Hợp đồng tín dụng', HD_THE_CHAP: 'Hợp đồng thế chấp' };
    var stepKeys = D.stepKeys(item, wt);
    var keys = D.dailyIsCredit(item, wt) ? D.draftContractKeys(item, wt) : [];
    var completedKeys = item.status === 'HOAN_THANH_LS' ? D.dailyActivityKeys(item, wt) : [];
    parts.forEach(function (p) { if (labels[p.key] && keys.indexOf(p.key) === -1) keys.push(p.key); });
    completedKeys.forEach(function (key) { if (labels[key] && keys.indexOf(key) === -1) keys.push(key); });
    keys = keys.filter(function (key) { return stepKeys.indexOf(key) === -1; });
    if (!keys.length) return '';
    var rows = keys.map(function (key) {
      var entry = parts.filter(function (p) { return p.key === key; })[0];
      if (!entry && completedKeys.indexOf(key) !== -1) entry = { user_id: item.assigned_user_id, at: item.completed_at };
      var done = !!(entry && entry.user_id);
      var who = done ? (userName(entry.user_id) || entry.user_id) : '';
      var value = done ? 'Đã soạn' + (who ? ' · ' + who : '') + (entry.at ? ' · ' + U.fmtDT(entry.at) : '') : 'Chưa ghi nhận';
      if (done) value += ' · SL ' + (entry.quantity || 1);
      var quantity = done && canAdjustResultQuantity(item, key, entry.user_id)
        ? stepQuantityInput({ key: key, quantity: entry.quantity || 1 }, item.item_id, false) : '';
      var action = key === 'HD_TIN_DUNG' ? creditDraftButton(item) : '';
      return [labels[key] || key, U.esc(value) + (quantity ? '<div style="margin-top:.5rem">' + quantity + '</div>' : '') + (action ? ' ' + action : ''), true];
    });
    return '<div style="margin-top:1.125rem">' + ui.sectionTitle('Tình trạng soạn hợp đồng') + ui.kv(rows) + '</div>';
  }

  /** Khối tick kết quả (HĐ thế chấp, Rlos) áp dụng cho hồ sơ: hồ sơ vay có cả hai, việc TSĐB chỉ có HĐ thế chấp. */
  function resultFlagsSection(item, wt, hint) {
    var on = D.resolvedResultFlags(item, wt);
    return '<div style="margin-top:1rem">' + ui.sectionTitle('Kết quả ghi nhận vào bảng ngày') +
      '<div class="f-stack">' + D.resultFlagsFor(item, wt).map(function (x) {
        return ui.checkbox('flag_' + x.key, on[x.key] === true, x.label);
      }).join('') + '</div>' + (hint || '') + '</div>';
  }

  function readResultFlags(data, item, wt) {
    var flags = {};
    D.resultFlagsFor(item, wt).forEach(function (x) { flags[x.key] = data.get('flag_' + x.key) !== null; });
    return flags;
  }

  /** Sửa tick sau khi hoàn thành: chính cán bộ xử lý, kiểm soát hoặc quản lý LS. */
  function canEditResultFlags(item) {
    var u = me();
    return !!(u && item.status === 'HOAN_THANH_LS' && !item.syncing && D.resultFlagsFor(item, wtOf(item)).length &&
      (['KS_LS', 'QUAN_LY_LS'].indexOf(u.role) !== -1 || (u.role === 'CAN_BO_LS' && item.assigned_user_id === u.user_id)));
  }

  function editResultFlags(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canEditResultFlags(i)) { ui.toast('Không thể sửa ghi nhận kết quả của việc này.', 'err'); return; }
    ui.openDialog('Sửa ghi nhận kết quả',
      '<form data-form="result-flags" data-id="' + U.attr(i.item_id) + '" data-version="' + U.attr(i.version) + '">' +
      resultFlagsSection(i, wtOf(i), '') + ui.formEnd('Lưu ghi nhận') + '</form>', { sub: itemRef(i) });
  }

  function submitResultFlags(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    if (!i || !canEditResultFlags(i) || form.getAttribute('data-waiting')) return;
    var flags = readResultFlags(new FormData(form), i, wtOf(i));
    function done(version) {
      var live = U.byId(st().items, 'item_id', i.item_id) || i;
      live.result_flags = Object.assign({}, D.savedResultFlags(live) || {}, flags);
      if (version) live.version = version;
      ui.closeDialog(); LS.app.render(); detail(live.item_id);
      ui.toast('Đã lưu ghi nhận kết quả.', 'ok');
    }
    if (!U.isGas()) {
      i.version = Number(i.version || 1) + 1;
      logEvent(i.item_id, 'GHI_NHAN_GIAO_DICH', 'Sửa ghi nhận kết quả.'); U.save();
      done(i.version); return;
    }
    // Màn hình đổi ngay, hộp thoại đóng; máy chủ nhận ở nền, bị từ chối thì hoàn tác và báo lý do.
    var previousFlags = i.result_flags, expectedVersion = Number(form.getAttribute('data-version'));
    done(expectedVersion + 1);
    LS.app.background(LS.api.saveResultFlags(i.item_id, flags, expectedVersion), {
      label: 'Ghi nhận kết quả',
      rollback: function () {
        var live = U.byId(st().items, 'item_id', i.item_id);
        if (live) { live.version = expectedVersion; if (previousFlags === undefined) delete live.result_flags; else live.result_flags = previousFlags; }
      }
    });
  }

  function flow(itemId, to, opts) {
    opts = opts || {};
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i) return;
    var tr = actionsFor(i).filter(function (a) { return a.to === to; })[0];
    if (!tr) {
      var currentLabel = D.STATUS[i.status] ? D.STATUS[i.status].label : i.status;
      ui.toast('Không thể thực hiện thao tác này khi hồ sơ đang ở trạng thái ' + currentLabel + '. Hãy tải lại danh sách.', 'err');
      return;
    }

    // Cán bộ LS tiếp nhận một chạm, không qua hộp thoại (xem receiveNow).
    if (to === 'DANG_THUC_HIEN' && i.status === 'DA_PHAN_CONG' && me().role === 'CAN_BO_LS' && !opts.dialog) { receiveNow(itemId); return; }

    var r = reqOf(i), wt = wtOf(i), rec = tr.assignee ? pairRecommendation(i) : null;
    // Giữ lại trạng thái tại lúc mở hộp thoại để nếu màn hình bị đồng bộ lại
    // trong lúc người dùng đang nhập, lỗi sẽ được báo là xung đột phiên bản
    // thay vì rơi vào thông báo mơ hồ "Thao tác không hợp lệ".
    var body = '<form data-form="flow" data-id="' + U.attr(itemId) + '" data-to="' + U.attr(to) + '" data-from="' + U.attr(i.status) + '" data-version="' + U.attr(i.version) + '">';

    if (to === 'DANG_THUC_HIEN' && i.status === 'DA_PHAN_CONG') {
      var active=visibleItems().filter(function(x){return x.item_id!==i.item_id && x.assigned_user_id===st().session && LSTiming.workState(x)==='ACTIVE';});
      body+='<fieldset class="f"><legend>Sau khi tiếp nhận</legend><label class="chan-check"><input type="radio" name="start_now" value="queue"'+(active.length?' checked':'')+'><span>Nhận vào danh sách chờ</span></label><label class="chan-check"><input type="radio" name="start_now" value="start"'+(!active.length?' checked':'')+'><span>Làm hồ sơ này ngay</span></label></fieldset>'+
        (active.length?'<p class="t2">Đang làm '+U.esc(active.map(itemRef).join(', '))+'. Làm hồ sơ này ngay sẽ đưa hồ sơ đang làm vào Chờ làm tiếp.</p>':'');
    }

    var requestedDate = to === 'DA_PHAN_CONG'
      ? '<span class="flow-requested-date">Ngày KH đề nghị: <time>' + U.esc(U.fmtDate(i.occurrence_date)) + '</time></span>'
      : '';
    var choosingResendDate = to === 'CHO_PHAN_CONG' && ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1;
    body += '<div class="banner banner-info flow-context">' + U.icon('arrow', 17) +
      '<div class="flow-overview"><div class="flow-title"><b>' + U.esc(r ? r.customer.name : '') + '</b><span class="t2">' + U.esc(wtGroup(i.work_type_code)) + '</span></div>' + requestedDate +
      '<div class="flow-status" aria-label="Trạng thái phân công">' + ui.statusTag(i.status) + ' <span aria-hidden="true">&rarr;</span> ' + ui.statusTag(to) +
      (to === 'DA_PHAN_CONG' ? '<span class="flow-priority">' + ui.checkbox('is_priority', !!(i.is_priority || (rec && rec.rule && rec.rule.priority_processing)), 'Ưu tiên xử lý cho cán bộ LS') + '</span>' : '') +
      '</div></div></div>';

    if (choosingResendDate) {
      var resendWeekName = 'resend_weekday_' + (++requestWeekSequence);
      body += '<div style="margin-top:1rem">' +
        '<div class="row-item resend-date-row" data-request-date-context>' +
        ui.field('Ngày KH đề nghị gửi lại', ui.input('occurrence_date', '', { type: 'date', required: true, min: requestToday(), nativeAttrs: ' data-request-native-date' })) +
        '<div class="request-weekdays" data-min-date="' + U.attr(requestToday()) + '" data-request-weekdays="' + resendWeekName + '">' + requestWeekChoices(requestWeekStart(requestToday()), '', resendWeekName, requestToday()) + '</div></div></div>';
    }

    if (tr.assignee) {
      var staff = staffList();
      if (!staff.length) { ui.toast('Chưa có cán bộ LS đang hoạt động.', 'err'); return; }
      // Tick chọn ngay trên bảng tải việc của từng cán bộ (không còn ô chọn riêng phía trên): người giao
      // nhìn số việc đang mở rồi tick đúng người. Mặc định tick người theo quy tắc phân công nhanh,
      // không có quy tắc thì giữ người đang xử lý.
      var chosen = rec ? rec.user.user_id : i.assigned_user_id;
      var loadRows = staff.map(function (x) {
        var load = staffLoad(x.user_id), tags = '';
        if (rec && rec.user.user_id === x.user_id) tags += ' ' + ui.tag(rec.linkedItem ? 'Đang giữ ' + linkedRole(rec.linkedItem) : rec.balanced ? 'Gợi ý cân tải' : 'Theo quy tắc', 'ok');
        if (rec && rec.balanced && rec.user.user_id === x.user_id) tags += '<div class="t2">' + U.esc(rec.reasons.join(' · ')) + '</div>';
        if (i.assigned_user_id === x.user_id) tags += ' ' + ui.tag('Đang giữ', 'neutral');
        return {
          attrs: ' data-pick-assignee',
          cells: [
            '<input type="radio" class="pick-box" name="assignee" id="assignee-' + U.attr(x.user_id) + '" value="' + U.attr(x.user_id) + '"' + (x.user_id === chosen ? ' checked' : '') +
              ' required aria-label="Chọn ' + U.attr(x.full_name) + '">',
            '<div class="assignment-staff-cell"><label for="assignee-' + U.attr(x.user_id) + '" class="t1">' + U.esc(x.full_name) + '</label>' + tags +
              ui.btn('Xem việc (' + load.open + ')', {
                act: 'assignment-staff-work-preview', kind: 'quiet', sm: true,
                data: ' data-user-id="' + U.attr(x.user_id) + '" aria-expanded="false" aria-controls="assignment-staff-work-preview"',
                title: 'Xem các việc đang mở được giao cho cán bộ này'
              }) + '</div>',
            '<span class="tid">' + load.working + '</span>',
            '<span class="tid">' + load.assignedToday + '</span>',
            '<span class="tid">' + load.done + '</span>'
          ]
        };
      });
      body += '<div class="assignment-load-section">' + ui.sectionTitle('Tích chọn cán bộ phụ trách') +
        (i.last_assignee_id ? '<p class="t2">Cán bộ LS cũ: <b>' + U.esc(userName(i.last_assignee_id)) + '</b></p>' : '') +
        (linkedGroup(i).length ? '<p class="t2">Giao kèm: ' + linkedGroup(i).map(function (k) { return linkedRole(k) + ' ' + U.esc(itemRef(k)); }).join(', ') + '</p>' : '') +
        (rec ? '<p class="t2">' + (rec.linkedItem ? 'Đang giữ ' + linkedRole(rec.linkedItem) + ' ' + U.esc(itemRef(rec.linkedItem)) + ': <b>' : 'Theo quy tắc: <b>') + U.esc(rec.user.full_name) + '</b>' +
          (rec.replacementFor ? ' (thay ' + U.esc(rec.replacementFor.full_name) + ')' : '') + '</p>' : '') +
        '<div class="assignment-load-wrap">' + ui.table(
          [{ label: 'Chọn', cls: 'fit pick-col' }, { label: 'Cán bộ LS' }, { label: 'Đang mở', cls: 'num' }, { label: 'Phân công hôm nay', cls: 'num' }, { label: 'Đã hoàn thành', cls: 'num' }],
          loadRows, { tableClass: 'assignment-load-table' }
        ) + '</div></div>';
      // Đổi người giữa chừng: tick phần cán bộ đang giữ đã làm xong để tính kết quả cho họ.
      var parts = i.assigned_user_id && i.processing_started_at ? D.handoverPartsFor(i, wt) : [];
      if (parts.length) {
        body += '<div style="margin-top:1rem">' + ui.sectionTitle('Phần ' + (userName(i.assigned_user_id) || 'cán bộ đang giữ') + ' đã làm xong') +
          '<div class="f-stack">' + parts.map(function (p) { return ui.checkbox('handover_' + p.key, false, p.label); }).join('') + '</div></div>';
      }
    }

    if (tr.appointment) {
      var reach = D.customerReach(r, st());
      var place = D.signPlace(st());
      // Nơi ký là mặc định chung do quản trị đặt — cán bộ chỉ xem, không chọn.
      body += '<div style="margin-top:1rem">' + ui.sectionTitle('Lịch hẹn ký') +
        '<div class="f-row">' +
        ui.field('Ngày ký', ui.input('appt_date', U.localDate(), { type: 'date', required: true })) +
        ui.field('Giờ ký', ui.input('appt_time', D.nextSlot(st()), { type: 'time', required: true })) +
        '</div>' +
        '<p class="t2" style="margin-top:.5rem">Nơi ký: <b>' +
        U.esc(place || 'quản trị chưa đặt nơi ký trong Cấu hình chung') + '</b></p>';

      // Một hàng nhãn chọn kênh; kênh nào khách không có thì khóa lại.
      body += '<div class="f" style="margin-top:.875rem"><label>Kênh báo khách</label>' +
        '<div class="chip-row" role="radiogroup" aria-label="Kênh báo khách">' +
        D.REACH_CHANNELS.map(function (c, idx) {
          var okChan = reach.available.indexOf(c.code) !== -1;
          var checked = okChan && reach.available.indexOf(c.code) === 0;
          return '<label class="chip' + (okChan ? '' : ' is-off') + '">' +
            '<input type="radio" name="appt_channel" value="' + c.code + '"' +
            (checked ? ' checked' : '') + (okChan ? '' : ' disabled') + '>' +
            '<span>' + U.icon(c.icon, 15) + U.esc(c.label) + '</span></label>';
        }).join('') + '</div></div>';

      body += reach.available.length
        ? ''
        : ui.banner('warn', 'Khách chưa có email, Zalo hay số điện thoại',
          'Liên hệ qua ' + (D.officerTag(i, st()) || userName(i.assigned_user_id) || 'cán bộ phụ trách'));

      body += '</div>';
    }

    if (requesterLocked(i)) {
      // Hồ sơ đã giao cho LS: Phòng/PGD chỉ chọn lý do trong danh sách, không nhập chữ.
      if (tr.reason && tr.reason !== 'free') {
        var fixedList = st().reasons.filter(function (x) { return x.group === tr.reason && x.active; });
        body += '<div style="margin-top:1rem">' +
          ui.field('Lý do', ui.select('reason_code', fixedList.map(function (x) { return [x.code, x.label]; }), '', { blank: 'Chọn lý do', attrs: ' required' })) + '</div>';
      }
    } else if (tr.reason && tr.reason !== 'free') {
      var list = st().reasons.filter(function (x) { return x.group === tr.reason && x.active; });
      body += '<div style="margin-top:1rem">' +
        ui.field('Lý do', ui.select('reason_code', list.map(function (x) { return [x.code, x.label]; }), '', { blank: 'Lý do khác…' })) +
        ui.field('Diễn giải thêm', ui.textarea('reason', '', { placeholder: 'Nội dung lý do' }), 'Bắt buộc với lý do khác') +
        '</div>';
    } else if (tr.reason === 'free') {
      body += '<div style="margin-top:1rem">' +
        ui.field('Lý do', ui.textarea('reason', '', { required: true })) + '</div>';
    } else if (tr.note) {
      body += '<div style="margin-top:1rem">' +
        ui.field('Ghi chú kết quả', ui.textarea('reason', '', { placeholder: 'Tóm tắt kết quả xử lý' })) + '</div>';
    }

    if (to === 'HOAN_THANH_LS') {
      body += '<div data-checklist-box="' + U.attr(i.item_id) + '">' + checklistSection(i) + '</div>';
      body += contractDraftSection(i, wt);
      // Hồ sơ vay: cán bộ tick giao dịch đã làm; số tick đi thẳng vào bảng Kết quả thực hiện.
      // Tick sẵn theo loại việc như cách đếm cũ, cán bộ bỏ tick nếu hồ sơ không có giao dịch đó.
      if (D.resultFlagsFor(i, wt).length) body += resultFlagsSection(i, wt, '');
      // Việc TSĐB: tick soạn xong HĐ thế chấp và nhập/xuất kho (ô đã tick từ trước hiện sẵn, không tick lại).
      var stepList = D.steps(i, wt);
      if (stepList.length) {
        body += '<div style="margin-top:1rem">' + ui.sectionTitle('Phần việc phải tick trước khi hoàn thành') + '<div class="f-stack">' +
          stepList.map(function (s) {
            return s.done
              ? '<div class="step-entry"><label class="check"><input type="checkbox" checked disabled><span>' + U.esc(s.label + stepWho(s)) + '</span></label>' +
                stepQuantityInput(s, i.item_id, me().role === 'CAN_BO_LS' && s.user_id !== me().user_id, D.stepQuantityLabel(s.key) ? 'step_qty_' + s.key : '') + '</div>'
              // Hoàn thành thì phần việc bắt buộc này đã làm: tick sẵn, cán bộ chỉ bỏ tick khi chưa làm thật.
              : '<div class="step-entry"><label class="check"><input type="checkbox" name="step_' + U.attr(s.key) + '" checked><span>' + U.esc(s.label) + '</span></label>' +
                stepQuantityInput(s, i.item_id, false, D.stepQuantityLabel(s.key) ? 'step_qty_' + s.key : '') + '</div>';
          }).join('') + '</div></div>';
      }
      var recipients = D.recipientsFor('PHONG_PHU_TRACH',i,st());
      var emails = recipients.filter(function(x) { return x.email && U.validEmail(x.email); });
      body += emails.length ? '<p class="t2">Email Phòng/PGD: '+emails.map(function(x) { return U.esc(x.name+' · '+x.email); }).join('; ')+'</p>' :
        ui.banner('warn','Người tạo đề nghị chưa có email nhận thông báo.','');
      body += '<p class="t2">Lịch hẹn KH: '+U.esc(i.appointment && i.appointment.at ? U.fmtDT(i.appointment.at)+' · '+(i.appointment.place || '') : 'Chưa có lịch hẹn')+'</p>';
      body += '<div class="f" style="margin-top:1rem"><label>Thông báo sau khi hoàn thành</label>' +
        '<div class="chip-row" role="radiogroup" aria-label="Cách thông báo sau khi hoàn thành">' +
        '<label class="chip"><input type="radio" name="notification_mode" value="NONE"><span>' + U.icon('ban', 15) + 'Không gửi</span></label>' +
        '<label class="chip"><input type="radio" name="notification_mode" value="IN_APP"><span>' + U.icon('bell', 15) + 'Chỉ báo trong app</span></label>' +
        '<label class="chip"><input type="radio" name="notification_mode" value="DEFAULT" checked><span>' + U.icon('send', 15) + 'Email Phòng/PGD và báo trong app</span></label>' +
        '</div></div>';
    }

    body += ui.formEnd(tr.label, { danger: to === 'HUY' }) + '</form>';
    ui.openDialog(tr.label, body, { sub: i.item_id, size: to === 'DA_PHAN_CONG' ? 'xl' : undefined });
    if (tr.assignee && to === 'DA_PHAN_CONG') applyRecentAssigneeSuggestions(i, rec);
  }

  function quickAssign(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i) return;
    var tr = actionsFor(i).filter(function (x) { return x.assignee; })[0];
    if (!tr) { ui.toast('Không thể đổi người ở trạng thái này.', 'warn'); return; }
    flow(itemId, tr.to, { quick: true });
  }

  function confirmDossierReceipt(itemId) {
    var item = U.byId(st().items, 'item_id', itemId), user = me();
    if (!item || !user || user.role !== 'CAN_BO_LS' || user.user_id !== item.assigned_user_id || !canConfirmDossierReceipt(item)) return;
    var before = JSON.parse(JSON.stringify(item)), receivedAt = U.now();
    item.dossier_received_at = receivedAt; item.dossier_received_by = user.user_id; item.timing_source = 'CONFIRMED';
    if (D.CLOCK_RUNNING.indexOf(item.status) !== -1) {
      if(!U.isGas())localWorkFocus(item,receivedAt);
      item.execution_state='ACTIVE';item.execution_changed_at=receivedAt;
      item.processing_started_at = item.processing_started_at || receivedAt;
      item.processing_sessions = LSTiming.nextSessions(before,item.status,receivedAt,item.assigned_user_id,'ACTIVE');
      D.applyClock(item,item.status,receivedAt);
    }
    item.due_at = D.dueFrom(receivedAt, item.work_type_code, st());
    item.version = Number(item.version || 0) + 1;
    LS.app.render();
    if (!U.isGas()) {
      logEvent(item.item_id, 'XAC_NHAN_NHAN_DU_HO_SO', 'Cán bộ LS xác nhận đã nhận đủ hồ sơ.');
      U.save(); LS.app.render(); if (detailShowing(item.item_id)) detail(item.item_id);
      ui.toast('Đã ghi nhận giờ LS nhận đủ hồ sơ.', 'ok'); return;
    }
    ui.toast('Đã ghi nhận giờ LS nhận đủ hồ sơ.', 'ok');
    LS.app.background(LS.api.confirmDossierReceipt(item.item_id, before.version), {
      label: 'Ghi nhận giờ nhận hồ sơ',
      onOk: function (result) {
        Object.keys(result || {}).forEach(function (key) { item[key] = result[key]; });
        if (result && result.processing_sessions_json) item.processing_sessions=JSON.parse(result.processing_sessions_json);
        if(result)applyFocusUpdates(result.focus_updates);
        timeReportCache = null; reportCache = null; LS.app.render();
        if (detailShowing(item.item_id)) detail(item.item_id);
      },
      rollback: function () {
        Object.keys(before).forEach(function (key) { item[key] = before[key]; });
        if (detailShowing(item.item_id)) detail(item.item_id);
      }
    });
  }

  function submitFlow(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    var to = form.getAttribute('data-to');
    if (!i) return;
    // Một lần bấm đã gửi lên GAS thì không cho form/dialog cũ gửi lại lần hai.
    // Trước đây lần bấm thứ hai thấy trạng thái lạc quan đã đổi và hiện
    // "Thao tác không hợp lệ", dù lần đầu vẫn đang được lưu đúng.
    if (i.syncing || form.getAttribute('data-waiting')) return;
    // Ô checklist vừa tích còn đang chờ lưu: chờ lưu xong rồi mới chuyển bước,
    // nếu không máy chủ thấy lệch phiên bản hoặc thấy chưa tích đủ.
    if (U.isGas() && checklistPending(i.item_id)) {
      form.setAttribute('data-waiting', '1');
      flushChecklist(i.item_id).then(function () {
        form.removeAttribute('data-waiting');
        var live = U.byId(st().items, 'item_id', i.item_id);
        if (live) form.setAttribute('data-version', String(live.version));
        submitFlow(form);
      });
      return;
    }
    var fromStatus = form.getAttribute('data-from') || i.status;
    var tr = actionsFor(i).filter(function (a) { return a.to === to; })[0];
    if (!tr) {
      var expectedFlow = (D.FLOW[fromStatus] || []).filter(function (a) { return a.to === to; })[0];
      var currentLabel = D.STATUS[i.status] ? D.STATUS[i.status].label : i.status;
      ui.toast(expectedFlow
        ? 'Hồ sơ vừa được cập nhật từ lúc mở hộp thoại (hiện là ' + currentLabel + '). Hãy đóng hộp thoại, tải lại rồi thao tác lại.'
        : 'Không thể thực hiện thao tác này khi hồ sơ đang ở trạng thái ' + currentLabel + '.', 'err');
      return;
    }
    // Phòng/PGD tiếp tục hồ sơ do mình tạm dừng: LS chưa nhận hồ sơ thì về bước đã giao (khớp transitionItem).
    if (me().role === 'PHONG_PGD' && i.status === 'TAM_DUNG' && to === 'DANG_THUC_HIEN' && !i.dossier_received_at) to = 'DA_PHAN_CONG';

    var d = new FormData(form);
    var wt = wtOf(i), r = reqOf(i);
    if (wt && wt.checklist.length && ['DA_SOAN_XONG', 'HOAN_THANH_LS'].indexOf(to) !== -1 &&
        (i.checklist || []).filter(Boolean).length < wt.checklist.length) {
      ui.toast('Hãy tích đủ các nhóm việc trước khi hoàn thành toàn bộ hồ sơ.', 'err');
      return;
    }
    var ts = U.now();
    var startNow=d.get('start_now')!=='queue';
    var reason = String(d.get('reason') || '').trim();
    var choosingResendDate = to === 'CHO_PHAN_CONG' && ['CAN_BO_SUNG', 'CHUA_GIAO_HO_SO'].indexOf(i.status) !== -1;
    var resendDate = choosingResendDate
      ? String(d.get('occurrence_date') || '').trim() : '';
    if (choosingResendDate) {
      if (!resendDate) { ui.toast('Chọn ngày KH đề nghị gửi lại.', 'err'); return; }
      if (resendDate < U.localDate()) { ui.toast('Ngày gửi lại không được trước hôm nay.', 'err'); return; }
    }
    var notificationMode = to === 'HOAN_THANH_LS' ? String(d.get('notification_mode') || 'DEFAULT') : 'DEFAULT';
    var markPriority = d.get('is_priority') !== null;
    var resultFlags = to === 'HOAN_THANH_LS' && D.resultFlagsFor(i, wt).length ? readResultFlags(d, i, wt) : null;

    // Việc TSĐB phải tick đủ phần việc mới hoàn thành; ô tick ngay trong hộp thoại tính cho người đang giữ hồ sơ, ngày hôm nay.
    var stepList = to === 'HOAN_THANH_LS' ? D.steps(i, wt) : [];
    var newSteps = stepList.filter(function (s) { return !s.done && d.get('step_' + s.key) !== null; }).map(function (s) { return s.key; });
    var stepCredit = null, stepQuantities = {};
    if (stepList.length) {
      stepCredit = JSON.parse(JSON.stringify(D.resultCredit(i)));
      var stepQuantityError = '';
      stepList.filter(function (s) { return s.done || newSteps.indexOf(s.key) !== -1; }).forEach(function (s) {
        if (!D.stepQuantityLabel(s.key)) return;
        var submittedQuantity = d.get('step_qty_' + s.key);
        var quantity = Number(submittedQuantity === null || submittedQuantity === '' ? (s.done ? s.quantity : 1) : submittedQuantity);
        if (!isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity) {
          stepQuantityError = D.stepQuantityLabel(s.key) + ' phải là số nguyên lớn hơn 0.';
          return;
        }
        if (s.done && stepCredit[s.key]) stepCredit[s.key].quantity = quantity;
        stepQuantities[s.key] = quantity;
      });
      if (stepQuantityError) { ui.toast(stepQuantityError, 'err'); return; }
      newSteps.forEach(function (key) {
        var entry = { user_id: i.assigned_user_id, at: ts, by: st().session };
        if (D.stepQuantityLabel(key)) entry.quantity = stepQuantities[key];
        stepCredit[key] = entry;
      });
      if (newSteps.some(function (key) { return D.stepQuantityLabel(key) && !stepQuantities[key]; })) return;
      var stepMissing = stepList.filter(function (s) { return !stepCredit[s.key]; });
      if (stepMissing.length) {
        ui.toast('Hãy tick: ' + stepMissing.map(function (s) { return s.label.toLowerCase(); }).join(', ') + ' trước khi hoàn thành.', 'err');
        return;
      }
    }

    if (requesterLocked(i)) {
      // Khớp máy chủ: Tạm dừng/Tiếp tục dùng câu cố định, Hủy chỉ mang đúng nhãn lý do trong danh mục.
      reason = '';
      if (to === 'TAM_DUNG') reason = 'QLKH tạm dừng hồ sơ.';
      else if (i.status === 'TAM_DUNG') reason = 'QLKH tiếp tục hồ sơ.';
      else if (to === 'HUY') {
        var lockedPick = U.byId(st().reasons, 'code', String(d.get('reason_code') || ''));
        if (!lockedPick) { ui.toast('Chọn lý do hủy trong danh sách.', 'err'); return; }
        reason = lockedPick.label;
      }
    } else {
      if (tr.reason && tr.reason !== 'free') {
        var code = String(d.get('reason_code') || '');
        var picked = code ? U.byId(st().reasons, 'code', code) : null;
        if (!picked && !reason) { ui.toast('Chọn lý do hoặc ghi diễn giải.', 'err'); return; }
        reason = (picked ? picked.label : '') + (reason ? (picked ? ' — ' : '') + reason : '');
      }
      if (tr.reason === 'free' && !reason) { ui.toast('Thao tác này bắt buộc ghi lý do.', 'err'); return; }
    }

    var assigneeId = '';
    if (tr.assignee) {
      assigneeId = String(d.get('assignee') || '');
      if (!assigneeId) { ui.toast('Tích chọn cán bộ phụ trách trước khi phân công.', 'err'); return; }
      var staff = U.byId(st().users, 'user_id', assigneeId);
      if (!staff || staff.role !== 'CAN_BO_LS' || !staff.active) { ui.toast('Người nhận phải là cán bộ LS đang hoạt động.', 'err'); return; }
      reason = 'Giao ' + staff.full_name + (reason ? ' — ' + reason : '');
    }
    var handoverParts = tr.assignee ? D.handoverPartsFor(i, wt).filter(function (p) { return d.get('handover_' + p.key) !== null; }) : [];
    if (handoverParts.length) {
      if (!i.assigned_user_id || assigneeId === i.assigned_user_id) { ui.toast('Phần việc đã làm chỉ ghi nhận khi chuyển sang cán bộ khác.', 'err'); return; }
      reason += ' · ' + (userName(i.assigned_user_id) || i.assigned_user_id) + ' đã làm xong: ' + handoverParts.map(function (p) { return p.short; }).join(', ');
    }

    var appointment = null;
    if (tr.appointment) {
      var day = String(d.get('appt_date') || '');
      var hour = String(d.get('appt_time') || '');
      if (!day || !hour) { ui.toast('Chưa chọn ngày và giờ ký.', 'err'); return; }

      var place = D.signPlace(st());
      if (!place) { ui.toast('Quản trị chưa đặt nơi ký trong Cấu hình chung.', 'err'); return; }

      // Khách không có kênh nào thì chuyển sang nhắn nhóm nội bộ gắn thẻ cán bộ,
      // thay vì chặn lại — việc vẫn phải đi tiếp, chỉ đổi cách báo.
      var reach2 = D.customerReach(r, st());
      var chosen = String(d.get('appt_channel') || '');
      if (!chosen || reach2.available.indexOf(chosen) === -1) chosen = reach2.fallback;

      appointment = {
        at: new Date(day + 'T' + hour).toISOString(),
        date: day, time: hour, place: place,
        channel: chosen,
        via_group: reach2.available.length === 0,
        officer_id: i.assigned_user_id || ''
      };
      reason = 'Hẹn ký ' + U.fmtDate(day) + ' ' + hour + ' tại ' + place +
        (appointment.via_group ? ' — báo qua nhóm Zalo, gắn thẻ cán bộ phụ trách' : '');
    }

    // Ghi ngay lên màn hình trước khi gọi máy chủ: người phân giao việc không
    // phải ngồi chờ Sheet trả lời mới biết thao tác của mình có ăn hay không.
    var before = JSON.parse(JSON.stringify(i));
    var expected = i.version;

    // Cán bộ LS tiếp nhận hồ sơ = mốc nhận hồ sơ, bắt đầu tính SLA (khớp transitionItem).
    if (to === 'DANG_THUC_HIEN' && me().role === 'CAN_BO_LS' && !i.dossier_received_at && !i.processing_started_at &&
        (i.status === 'DA_PHAN_CONG' || (i.status === 'TAM_DUNG' && !i.due_at))) {
      i.dossier_received_at = ts; i.dossier_received_by = st().session; i.timing_source = 'CONFIRMED';
    }
    i.execution_state=D.CLOCK_RUNNING.indexOf(to)!==-1 ? (to==='DANG_THUC_HIEN' ? (startNow && me().role==='CAN_BO_LS'?'ACTIVE':'QUEUED') : LSTiming.workState(i) || 'QUEUED') : '';
    i.execution_changed_at=ts;
    if(!U.isGas() && to==='DANG_THUC_HIEN' && i.execution_state==='ACTIVE')localWorkFocus(i,ts);
    i.processing_sessions=LSTiming.nextSessions(before,to,ts,assigneeId || i.assigned_user_id,i.execution_state);
    if (i.dossier_received_at) i.sla_pause_log=LSTiming.nextPauses(before,to,ts);

    if (handoverParts.length) {
      var credit = JSON.parse(JSON.stringify(D.resultCredit(i)));
      handoverParts.forEach(function (p) { credit[p.key] = { user_id: before.assigned_user_id, at: ts, by: st().session }; });
      i.result_credit = credit;
    }
    if (to === 'DANG_HEN_KH') {
      var contractCredit = JSON.parse(JSON.stringify(D.resultCredit(i))), newlyDrafted = false;
      D.draftContractKeys(i, wt).forEach(function (key) {
        if (contractCredit[key] && contractCredit[key].user_id) return;
        contractCredit[key] = { user_id: i.assigned_user_id || me().user_id, at: ts, by: st().session, quantity: 1, source: 'APPOINTMENT' };
        newlyDrafted = true;
      });
      if (newlyDrafted) i.result_credit = contractCredit;
    }
    if (stepCredit && (newSteps.length || Object.keys(stepQuantities).length)) i.result_credit = stepCredit;
    var linkedLocal = { snapshots: [], kept: [] };
    if (tr.assignee) {
      linkedLocal = followLinkedLocal(i, assigneeId, ts);
      i.assigned_user_id = assigneeId;
      i.assigned_by = st().session;
      i.assigned_at = ts;
      i.first_assigned_at=i.first_assigned_at || before.assigned_at || ts;
      i.is_priority = markPriority;
      if (!i.dossier_received_at) i.due_at = '';
    }
    if (appointment) i.appointment = Object.assign({}, appointment, { draft_credit_version: 1 });
    if (resendDate) i.occurrence_date = resendDate;

    if ((to === 'CHO_PHAN_CONG' || to === 'DA_PHAN_CONG') && !i.accepted_at) i.accepted_at = ts;
    if (to === 'DANG_THUC_HIEN' && i.execution_state==='ACTIVE' && !i.processing_started_at) i.processing_started_at = ts;
    D.applyClock(i, i.execution_state==='QUEUED'?'DA_PHAN_CONG':to, ts);
    D.applySlaPause(i, to, ts, st());
    if (to === 'HOAN_THANH_LS') i.completed_at = ts;
    if (to === 'DANG_THUC_HIEN' && i.status === 'HOAN_THANH_LS') {
      // Mở lại là vòng xử lý mới: hạn tính lại từ lúc mở (khớp transitionItem).
      i.completed_at = '';
    }
    if (i.dossier_received_at) i.due_at=LSTiming.deadline(i,wt ? wt.sla_hours : 8,D.processingCalendar(st()),ts);
    if (tr.note && reason) i.note = reason;
    if (resultFlags) i.result_flags = Object.assign({}, D.savedResultFlags(i) || {}, resultFlags);

    i.status = to;
    // Gửi lại hàng chờ mà việc cùng nhóm đang có cán bộ giữ: giao thẳng người đó (khớp transitionItem).
    var resendHolder = to === 'CHO_PHAN_CONG' ? linkedHolder(i) : null;
    if (resendHolder) {
      i.status = 'DA_PHAN_CONG'; i.assigned_user_id = resendHolder.user.user_id; i.assigned_by = st().session;
      i.assigned_at = ts; i.accepted_at = i.accepted_at || ts; i.first_assigned_at = i.first_assigned_at || ts;
      if (!i.dossier_received_at) i.due_at = '';
    }
    i.updated_at = ts;
    if (to === 'HUY') i.pending = null;   // máy chủ cũng xóa đề nghị đang chờ khi hủy
    i.version = Number(i.version || 1) + 1;

    var ref = itemRef(i);
    ui.closeDialog();
    keptLinkedWarning(linkedLocal.kept);
    if (resendHolder) ui.toast('Giao thẳng ' + resendHolder.user.full_name + ' cùng ' + linkedRole(resendHolder.item) + ' ' + itemRef(resendHolder.item) + '.', 'ok');

    if (U.isGas()) {
      // Không khóa dòng việc trong lúc chờ máy chủ: màn hình đã ở trạng thái mới, bước kế tiếp bấm được ngay,
      // các lệnh ghi xếp hàng và đến máy chủ đúng thứ tự (xem LS.api.write).
      LS.app.render();
      if (!choosingResendDate) ui.toast(tr.label + ' · ' + ref, 'ok');
      LS.app.background(
        LS.api.transitionItem(i.item_id, to, {
          reason: reason, assignee_id: assigneeId, appointment: appointment, occurrence_date: resendDate,
          expected_version: expected, start_now:startNow, notification_mode: notificationMode, is_priority:markPriority, result_flags: resultFlags,
          handover_parts: handoverParts.map(function (p) { return p.key; }), steps: newSteps, step_quantities: stepQuantities
        }),
        {
          label: tr.label,
          onOk: function (result) {
            // Trước đây chỉ gỡ cờ mà không vẽ lại: dòng việc cứ hiện "đang gửi",
            // không có nút bước kế tiếp cho tới khi người dùng tự tải lại trang.
            var live = U.byId(st().items, 'item_id', i.item_id) || i;
            live.syncing = false;
            if (result && Number(result.version) < Number(live.version)) {
              applyFocusUpdates(result.focus_updates);
              if (!ui.dialogOpen()) LS.app.render();
              return;
            }
            if (result && result.status) live.status = result.status;
            if (result && result.occurrence_date) live.occurrence_date = result.occurrence_date;
            // Chỉ nâng phiên bản: nếu người dùng đã bấm tiếp bước sau (đã cộng phiên bản trên màn hình)
            // thì kết quả của bước trước không được kéo phiên bản lùi lại.
            if (result && result.version) live.version = Math.max(Number(live.version) || 0, Number(result.version) || 0);
            // Hạn do máy chủ tính (lùi hạn sau khi chờ, mở lại) là số chuẩn.
            ['due_at', 'completed_at', 'updated_at', 'processing_started_at', 'execution_state', 'execution_changed_at', 'sla_paused_at', 'dossier_received_at', 'dossier_received_by', 'timing_source', 'first_assigned_at',
              'assigned_user_id', 'assigned_by', 'assigned_at', 'accepted_at'].forEach(function (k) {
              if (result && result[k] !== undefined) live[k] = result[k];
            });
            if (result) applyFocusUpdates(result.linked_updates);
            if (result && result.processing_sessions_json) live.processing_sessions=JSON.parse(result.processing_sessions_json);
            if(result)applyFocusUpdates(result.focus_updates);
            if (result && result.sla_pause_log_json) live.sla_pause_log=JSON.parse(result.sla_pause_log_json);
            if (result && result.result_flags_json) live.result_flags=JSON.parse(result.result_flags_json);
            if (result && result.result_credit_json) live.result_credit=JSON.parse(result.result_credit_json);
            if (!ui.dialogOpen()) LS.app.render();
            else if (detailShowing(live.item_id)) detail(live.item_id);
            if (choosingResendDate) ui.toast('Đã xác nhận gửi hồ sơ vào Hàng chờ phân công · ' + ref, 'ok');
          },
          rollback: function () {
            restoreSnapshots(linkedLocal.snapshots);
            var live = U.byId(st().items, 'item_id', before.item_id);
            if (live) {
              Object.keys(before).forEach(function (k) { live[k] = before[k]; });
              if (!('result_flags' in before)) delete live.result_flags;
              if (!('result_credit' in before)) delete live.result_credit;
              ['execution_state','execution_changed_at'].forEach(function(k){if(!(k in before))delete live[k];});
            }
          }
        }
      );
      return;
    }

    logEvent(i.item_id, to, reason || tr.label);
    var sent = notificationMode === 'NONE' ? [] : (tr.notify ? D.queueNotifications(i, tr.notify, st(), st().session, notificationMode) : []);
    U.save();
    LS.app.render();

    var blocked = sent.filter(function (x) { return x.status === 'KHONG_GUI'; }).length;
    ui.toast(tr.label + ' · ' + ref + (blocked ? ' — ' + blocked + ' tin không gửi được' : ''), blocked ? 'warn' : 'ok');
  }

  /* ============================ Hộp thoại: sửa việc ============================ */

  function editItem(itemId) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !canEdit(i)) { ui.toast('Không có quyền sửa việc này.', 'err'); return; }
    var r = reqOf(i);
    var approval = editNeedsApproval(i);

    ui.openDialog('Sửa việc',
      (approval ? ui.banner('warn', 'Thay đổi cần kiểm soát duyệt', 'Riêng đổi ngày phát sinh (khách đổi ngày ký) được ghi nhận ngay, không cần duyệt.') : '') +
      '<form data-form="edit-item" data-id="' + U.attr(i.item_id) + '">' +
      '<div style="margin-top:.875rem">' + ui.sectionTitle('Khách hàng') +
      '<div class="f-row customer-fields">' +
      ui.field('Tên khách hàng', ui.input('customer.name', r.customer.name, { required: true })) +
      ui.field('Mã CIF', ui.input('customer.cif', r.customer.cif)) +
      ui.field('Điện thoại', ui.input('customer.phone', r.customer.phone, { type: 'tel' })) +
      ui.field('Email', ui.input('customer.email', r.customer.email, { type: 'email' })) +
      '</div>' +
      '<div class="f-row request-priorities">' +
      ui.checkbox('priority_vip', priorityFlags(r.customer).indexOf('VIP') !== -1, 'Khách hàng VIP') +
      ui.checkbox('priority_urgent', priorityFlags(r.customer).indexOf('XU_LY_GAP') !== -1, 'Xử lý gấp') +
      '</div></div>' +
      '<div style="margin-top:1.125rem">' + ui.sectionTitle('Công việc') +
      '<div class="f-row">' +
      ui.field('Loại việc', ui.select('work_type_group', workTypeGroups(), (wtOf(i) && (wtOf(i).group || wtOf(i).name)) || '', { attrs: ' data-role="work-type-group" required' })) +
      ui.field('Sản phẩm', ui.select('work_type_code', productOptions((wtOf(i) && (wtOf(i).group || wtOf(i).name)) || '', i.work_type_code), i.work_type_code, { attrs: ' data-role="work-type-product" required' })) +
      ui.field('Ngày phát sinh', ui.input('occurrence_date', i.occurrence_date, { type: 'date', required: true })) +
      '</div></div>' +
      '<div style="margin-top:1.125rem">' +
      ui.field('Lý do sửa', ui.input('reason', '', { required: true, placeholder: 'Bổ sung số điện thoại, đổi loại việc…' })) +
      '</div>' +
      ui.formEnd(approval ? 'Gửi đề nghị sửa' : 'Lưu thay đổi') + '</form>',
      { size: 'md', sub: i.item_id });
  }

  function submitEdit(form) {
    var i = U.byId(st().items, 'item_id', form.getAttribute('data-id'));
    if (!i || !canEdit(i)) { ui.toast('Không có quyền sửa việc này.', 'err'); return; }
    var r = reqOf(i);
    var d = new FormData(form);
    var reason = String(d.get('reason')).trim();
    if (!U.validPhone(d.get('customer.phone')) || !U.validEmail(d.get('customer.email'))) { ui.toast('Kiểm tra số điện thoại và email khách hàng; giữ số 0 đầu.','err');return; }
    var changes = {};
    var selectedWt = U.byId(st().workTypes, 'code', String(d.get('work_type_code') || ''));
    if (!selectedWt || (selectedWt.group || selectedWt.name) !== String(d.get('work_type_group') || '')) {
      ui.toast('Sản phẩm không thuộc loại việc đã chọn.', 'err'); return;
    }

    ['work_type_code', 'occurrence_date'].forEach(function (k) {
      var v = String(d.get(k));
      if (v !== String(i[k])) changes[k] = v;
    });
    var selectedProduct = selectedWt ? selectedWt.name : '';
    // Chỉ đổi tên sản phẩm khi thật sự đổi loại việc. Tên lưu trên hồ sơ cũ có thể khác tên loại việc hiện tại
    // (đã đổi tên trong danh mục, hồ sơ chuyển kỳ): trước đây một lần chỉ đổi ngày cũng kéo theo "đổi sản phẩm".
    if (changes.work_type_code && selectedProduct !== String(i.product_name || '')) changes.product_name = selectedProduct;
    ['name', 'cif', 'phone', 'email'].forEach(function (k) {
      var v = String(d.get('customer.' + k) || '').trim();
      if (k==='phone') v=U.normalizePhone(v);
      if (k==='email') v=v.toLowerCase();
      if (v !== String(r.customer[k] || '')) changes['customer.' + k] = v;
    });
    var flags = ['VIP', 'XU_LY_GAP'].filter(function (x, idx) { return d.get(['priority_vip', 'priority_urgent'][idx]) !== null; });
    if (flags.slice().sort().join(',') !== priorityFlags(r.customer).slice().sort().join(',')) changes['customer.priority_flags'] = flags;

    if (!Object.keys(changes).length) { ui.toast('Không có thay đổi nào.', 'warn'); return; }

    if (U.isGas()) {
      // Cùng luật với bản cục bộ ở dưới: Phòng/PGD sửa việc đã giao thì chờ duyệt, còn lại áp dụng ngay.
      // Màn hình đổi trước, hộp thoại đóng, máy chủ nhận ở nền; bị từ chối thì hoàn tác và báo lý do.
      var needsApproval = editNeedsApproval(i, changes);
      if (needsApproval && i.pending) { ui.toast('Việc đang có một đề nghị sửa chờ kiểm soát duyệt.', 'err'); return; }
      var snap = snapshotItem(i), expectedVersion = Number(i.version), linkedSnaps = [];
      if (needsApproval) i.pending = { fields: changes, by: st().session, at: U.now(), reason: reason };
      else {
        if (changes.occurrence_date) linkedSnaps = moveLinkedDate(i, i.occurrence_date, changes.occurrence_date);
        applyChanges(i, changes); i.version = expectedVersion + 1;
      }
      ui.closeDialog(); LS.app.render();
      ui.toast(needsApproval ? 'Đã gửi đề nghị sửa cho kiểm soát.' : 'Đã lưu thay đổi.', 'ok');
      LS.app.background(LS.api.proposeRevision(snap.item.item_id, changes, reason, expectedVersion), {
        label: 'Sửa thông tin',
        onOk: function (result) { if (result) applyLinkedDateUpdates(result.linked_updates); },
        rollback: function () { restoreSnapshots(linkedSnaps); restoreItem(snap); }
      });
      return;
    }

    if (editNeedsApproval(i, changes)) {
      if (i.pending) { ui.toast('Việc đang có một đề nghị sửa chờ kiểm soát duyệt.', 'err'); return; }
      i.pending = { fields: changes, by: st().session, at: U.now(), reason: reason };
      logEvent(i.item_id, 'DE_NGHI_SUA', reason);
      D.queueNotifications(i, 'DE_NGHI_SUA', st(), st().session);
      ui.toast('Đã gửi đề nghị sửa cho kiểm soát.');
    } else {
      if (changes.occurrence_date) moveLinkedDate(i, i.occurrence_date, changes.occurrence_date);
      applyChanges(i, changes);
      i.version += 1;
      logEvent(i.item_id, 'SUA_THONG_TIN', reason + ' (' +
        Object.keys(changes).map(function (k) { return FIELD_LABEL[k] || k; }).join(', ') + ')');
      ui.toast('Đã lưu thay đổi.');
    }
    U.save();
    ui.closeDialog();
    LS.app.render();
  }

  /** Bản chụp việc và khách hàng trước khi đổi trên màn hình, để hoàn tác nếu máy chủ từ chối. */
  function snapshotItem(item) {
    var r = reqOf(item);
    return { item: JSON.parse(JSON.stringify(item)), customer: r ? JSON.parse(JSON.stringify(r.customer)) : null };
  }

  function restoreItem(snap) {
    var live = U.byId(st().items, 'item_id', snap.item.item_id);
    if (!live) return;
    Object.keys(snap.item).forEach(function (k) { live[k] = snap.item[k]; });
    var r = reqOf(live);
    if (r && snap.customer) r.customer = snap.customer;
  }

  function applyChanges(item, changes) {
    var r = reqOf(item);
    Object.keys(changes).forEach(function (k) {
      if (k.indexOf('customer.') === 0) r.customer[k.slice(9)] = changes[k];
      else item[k] = changes[k];
    });
    if (changes.work_type_code) {
      // Checklist thuộc loại việc: đổi loại thì làm lại checklist của loại mới (khớp applyRevision_).
      var wt = wtOf(item);
      item.checklist = (wt ? wt.checklist : []).map(function () { return false; });
      if (item.assigned_at) item.due_at = D.dueFrom(item.assigned_at, item.work_type_code, st());
    }
    if (r.customer.cif) r.customer.kind = 'DA_CO_CIF';
  }

  function revision(itemId, approve) {
    var i = U.byId(st().items, 'item_id', itemId);
    if (!i || !i.pending) return;
    if (['KS_LS', 'QUAN_LY_LS'].indexOf(me().role) === -1) { ui.toast('Chỉ kiểm soát được duyệt.', 'err'); return; }

    if (U.isGas()) {
      // Duyệt hủy đi bằng nút "Duyệt hủy"; ở đây chỉ duyệt hoặc từ chối đề nghị sửa, và từ chối đề nghị hủy.
      if (approve && (cancelPending(i) || !i.pending.fields)) { ui.toast('Duyệt đề nghị hủy bằng nút "Duyệt hủy".', 'err'); return; }
      if (approve && !(D.STATUS[i.status] && D.STATUS[i.status].open)) {
        ui.toast('Việc đã đóng từ lúc gửi đề nghị; chỉ có thể từ chối.', 'err'); return;
      }
      var snapRevision = snapshotItem(i);
      if (approve) { applyChanges(i, i.pending.fields); i.version = Number(i.version || 0) + 1; }
      i.pending = null;
      LS.app.render();
      ui.toast(approve ? 'Đã áp dụng thay đổi.' : 'Đã từ chối đề nghị.', 'ok');
      LS.app.background(LS.api.resolveRevision(itemId, approve, ''), {
        label: approve ? 'Duyệt đề nghị' : 'Từ chối đề nghị',
        rollback: function () { restoreItem(snapRevision); }
      });
      return;
    }

    if (approve && !(D.STATUS[i.status] && D.STATUS[i.status].open)) {
      ui.toast('Việc đã đóng từ lúc gửi đề nghị; chỉ có thể từ chối.', 'err'); return;
    }
    if (approve) {
      applyChanges(i, i.pending.fields);
      i.version += 1;
      logEvent(itemId, 'DUYET_SUA', 'Duyệt đề nghị của ' + userName(i.pending.by) + '.');
      ui.toast('Đã áp dụng thay đổi.');
    } else {
      logEvent(itemId, 'TU_CHOI_SUA', 'Từ chối đề nghị của ' + userName(i.pending.by) + '.');
      ui.toast('Đã từ chối đề nghị.');
    }
    i.pending = null;
    U.save();
    LS.app.render();
  }

  /* ============================ Hộp thoại: đăng ký việc mới ============================ */

  function catalogOptions(key, unitId) {
    var rows = (st().catalogOptions || []).filter(function (x) {
      return x.catalog_key === key && x.active && (!unitId || !x.unit_id || x.unit_id === unitId);
    }).sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });
    return rows;
  }

  function workTypeGroups() {
    var seen = {};
    return st().workTypes.filter(function (w) { return w.active; }).sort(function (a, b) {
      return (a.sort_order || 9999) - (b.sort_order || 9999);
    }).reduce(function (out, w) {
      var group = w.group || w.name;
      if (!seen[group]) { seen[group] = true; out.push([group, group]); }
      return out;
    }, []);
  }

  function productOptions(group, selectedCode) {
    return st().workTypes.filter(function (w) {
      return w.active && (!group || (w.group || w.name) === group);
    }).sort(function (a, b) {
      return (a.sort_order || 9999) - (b.sort_order || 9999);
    }).map(function (w) {
      var label = String(w.name || '').trim();
      var prefix = String(w.group || w.name || '').trim();
      if (prefix && label.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
        var remainder = label.slice(prefix.length).replace(/^\s*[-–—:]\s*/, '').trim();
        if (remainder) label = remainder;
      }
      return [w.code, label];
    });
  }

  function defaultWorkTypeGroup() {
    var groups = workTypeGroups();
    return groups.length ? groups[0][0] : '';
  }

  // Chỉ nhóm công việc tín dụng có thể phát sinh lựa chọn TSBĐ. Nhóm TSĐB
  // bản thân đã là hồ sơ tài sản, không hỏi lại để tránh tạo nghĩa vụ kép.
  function canChooseCollateralMode(w) {
    return !!(w && w.active && ['Món', 'HM SXKD', 'Thấu chi', 'Thẻ tín dụng'].indexOf(w.group || '') !== -1);
  }

  function defaultCollateralMode(w) {
    if (!canChooseCollateralMode(w)) return 'NONE';
    return 'CO_SAN';
  }

  function collateralOptions(w) {
    if (!canChooseCollateralMode(w)) return [];
    return [
      ['CO_SAN', 'TSBĐ có sẵn — làm Hợp đồng tín dụng'],
      ['NONE', 'Không có TSBĐ — chỉ Hợp đồng tín dụng'],
      ['MOI', 'TSBĐ mới — tạo thêm hồ sơ tài sản']
    ];
  }

  function syncProductOptions(groupSelect, selectedCode) {
    var row = groupSelect && groupSelect.closest('.row-item');
    var product = row && row.querySelector('[data-role="work-type-product"]');
    if (!product) return;
    var options = productOptions(groupSelect.value, selectedCode);
    product.innerHTML = '<option value="">Chọn sản phẩm</option>' + options.map(function (op) {
      return '<option value="' + U.attr(op[0]) + '"' + (String(op[0]) === String(selectedCode || '') ? ' selected' : '') + '>' + U.esc(op[1]) + '</option>';
    }).join('');
    syncCollateralMode(product);
  }

  function syncCollateralMode(productSelect, selectedMode) {
    var row = productSelect && productSelect.closest('.row-item');
    var modeField = row && row.querySelector('[data-role="collateral-mode-field"]');
    var modeSelect = row && row.querySelector('[data-role="collateral-mode"]');
    if (!modeField || !modeSelect) { syncRequestQuantities(row); return; }
    var wt = U.byId(st().workTypes, 'code', productSelect.value);
    var options = collateralOptions(wt);
    modeSelect.innerHTML = options.map(function (op) {
      return '<option value="' + U.attr(op[0]) + '">' + U.esc(op[1]) + '</option>';
    }).join('');
    if (!options.length) {
      modeSelect.value = 'NONE';
      modeField.hidden = true;
      syncRequestQuantities(row);
      return;
    }
    modeField.hidden = false;
    modeSelect.value = selectedMode || defaultCollateralMode(wt);
    syncRequestQuantities(row);
  }

  function rowCollateralMode(row, wt) {
    if (!canChooseCollateralMode(wt)) return 'NONE';
    var field = row && row.querySelector('[data-role="collateral-mode-field"]');
    var select = row && row.querySelector('[data-role="collateral-mode"]');
    if (!field || field.hidden) return 'NONE';
    var mode = String(select && select.value || defaultCollateralMode(wt)).toUpperCase();
    return ['NONE', 'CO_SAN', 'MOI'].indexOf(mode) !== -1 ? mode : defaultCollateralMode(wt);
  }

  function syncRequestQuantities(row) {
    if (!row) return;
    var product = row.querySelector('[data-role="work-type-product"]');
    var wt = product && U.byId(st().workTypes, 'code', product.value);
    var item = { work_type_code: product && product.value || '', product_name: wt && wt.name || '', collateral_mode: rowCollateralMode(row, wt) };
    var keys = wt ? D.requestCollateralQuantityKeys(item, wt) : [];
    var fields = [
      { key: 'HD_THE_CHAP', role: 'request-quantity-mortgage' },
      { key: 'XUAT_KHO', role: 'request-quantity-export' }
    ];
    fields.forEach(function (field) {
      var wrap = row.querySelector('[data-role="' + field.role + '-field"]');
      var input = row.querySelector('[data-role="' + field.role + '"]');
      var visible = keys.indexOf(field.key) !== -1;
      if (wrap) wrap.hidden = !visible;
      if (input) {
        input.required = visible;
        if (!visible) input.value = '';
        else if (field.key === 'HD_THE_CHAP' && !input.value) input.value = '1';
      }
    });
    var container = row.querySelector('[data-role="request-quantity-fields"]');
    if (container) container.hidden = !keys.length;
    var details = row.querySelector('[data-role="request-details-line"]');
    if (details) details.hidden = !keys.length && !!(row.querySelector('[data-role="collateral-mode-field"]') || {}).hidden;
  }

  var requestWeekSequence = 0;

  function requestToday() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var values = {};
    parts.forEach(function (p) { values[p.type] = p.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  function requestWeekStart(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
    var d = new Date(iso + 'T12:00:00Z');
    if (!isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  }

  function requestWeekDate(monday, offset) {
    if (!requestWeekStart(monday) || offset < 0 || offset > 11) return '';
    var d = new Date(monday + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + Number(offset));
    return d.toISOString().slice(0, 10);
  }

  function requestWeekChoices(monday, selected, name, minDate) {
    var current = requestWeekStart(requestToday()), next = requestWeekDate(current, 7);
    var options = [[current, 'Tuần này'], [next, 'Tuần sau']];
    if (monday !== current && monday !== next) options.push([monday, 'Tuần ' + U.fmtDate(monday)]);
    return '<div class="request-week-head"><span>Chọn nhanh theo thứ</span>' +
      ui.select('week_' + name, options, monday, { attrs: ' data-role="request-week" aria-label="Tuần thực hiện"' }) + '</div>' +
      '<div class="request-week-options" role="group" aria-label="Ngày thực hiện từ Thứ 2 đến Thứ 6">' +
      [0, 1, 2, 3, 4].map(function (offset) {
        var date = requestWeekDate(monday, offset);
        return '<label class="request-week-choice"><input type="radio" name="' + name + '" value="' + date +
          '" data-role="request-weekday"' + (minDate && date < minDate ? ' disabled' : '') + (date === selected && (!minDate || date >= minDate) ? ' checked' : '') + '><span><b>Thứ ' + (offset + 2) +
          '</b><small>' + U.esc(U.fmtDate(date).slice(0, 5)) + '</small></span></label>';
      }).join('') + '</div>';
  }

  function requestNativeDate(row) {
    return row && row.querySelector('[data-request-native-date], [name^="dt_"]');
  }

  function syncRequestWeekdays(row, monday) {
    var box = row && row.querySelector('[data-request-weekdays]');
    var native = requestNativeDate(row);
    if (!box || !native) return;
    var select = box.querySelector('[data-role="request-week"]');
    monday = monday || requestWeekStart(native.value) || (select && select.value) || requestWeekStart(requestToday());
    box.innerHTML = requestWeekChoices(monday, native.value, box.getAttribute('data-request-weekdays'), box.getAttribute('data-min-date'));
  }

  function setRequestDate(row, value, monday) {
    var native = requestNativeDate(row);
    var display = row && row.querySelector('[data-date-display-for]');
    if (!native) return;
    native.value = value;
    if (display) {
      display.value = value ? U.fmtDate(value) : '';
      display.setCustomValidity('');
    }
    syncRequestWeekdays(row, monday);
  }

  function selectRequestWeekday(input) {
    if (!input.checked) return;
    var row = input.closest('.row-item'), value = input.value;
    setRequestDate(row, value);
    var selected = row && row.querySelector('[data-role="request-weekday"]:checked');
    if (selected && selected.focus) selected.focus();
  }

  function selectRequestWeek(select) {
    var row = select.closest('.row-item'), native = requestNativeDate(row);
    var old = native && requestWeekStart(native.value) ? new Date(native.value + 'T12:00:00Z').getUTCDay() : 0;
    setRequestDate(row, old >= 1 && old <= 5 ? requestWeekDate(select.value, old - 1) : '', select.value);
    var liveSelect = row.querySelector('[data-role="request-week"]');
    if (liveSelect && liveSelect.focus) liveSelect.focus();
  }

  function rowForm(idx) {
    var defaultGroup = defaultWorkTypeGroup();
    var weekName = 'request_weekday_' + (++requestWeekSequence);
    var today = requestToday();
    return '<div class="row-item">' +
      '<div class="request-row-head"><span>Nội dung việc</span>' +
      ui.iconBtn('trash', { act: 'del-row', label: 'Xóa dòng việc' }) + '</div>' +
      '<div class="request-main-fields">' +
      ui.field('Loại việc', ui.select('wg_' + idx, workTypeGroups(), defaultGroup, { attrs: ' data-role="work-type-group" required' })) +
      ui.field('Sản phẩm', ui.select('wt_' + idx, productOptions(defaultGroup), '', { blank: 'Chọn sản phẩm', attrs: ' data-role="work-type-product" required' })) +
      '</div>' +
      '<div class="request-details-line" data-role="request-details-line" hidden><div data-role="collateral-mode-field" hidden>' +
      ui.field('Tình trạng TSBĐ', ui.select('cm_' + idx, [], '', { attrs: ' data-role="collateral-mode"' })) +
      '</div>' +
      '<div data-role="request-quantity-fields" hidden><div class="f-row">' +
      '<div data-role="request-quantity-mortgage-field" hidden>' + ui.field('Số HĐ thế chấp cần soạn', ui.input('request_hd_the_chap_' + idx, '1', { type: 'number', attrs: ' min="1" step="1" data-role="request-quantity-mortgage"' })) + '</div>' +
      '<div data-role="request-quantity-export-field" hidden>' + ui.field('Số bìa tài sản cần xuất', ui.input('request_xuat_kho_' + idx, '', { type: 'number', attrs: ' min="1" step="1" data-role="request-quantity-export"' })) + '</div>' +
      '</div></div></div>' +
      '<div class="request-occurrence-date">' + ui.field('Ngày phát sinh', ui.input('dt_' + idx, today, { type: 'date', required: true })) + '</div>' +
      '<div class="request-weekdays" data-request-weekdays="' + weekName + '">' +
      requestWeekChoices(requestWeekStart(today), today, weekName) + '</div>' +
      '</div>';
  }

  function newRequest() {
    var u = me() || { full_name: '', unit_id: '' };
    // Kiểm soát LS đăng ký hộ phải chọn phòng gửi; phòng/PGD luôn là đơn vị của mình.
    var senderUnits = st().units.filter(function (x) { return x.active && x.kind === 'PGD'; })
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); })
      .map(function (x) { return [x.unit_id, x.name]; });
    var unitPicker = u.role === 'PHONG_PGD' ? '' :
      '<div class="f-row request-unit-picker" style="margin-bottom:1rem">' +
      ui.field('Phòng / PGD gửi hồ sơ', ui.select('unit_id', senderUnits, '', { blank: 'Chọn phòng / PGD', attrs: ' required' })) +
      '</div>';
    ui.openDialog('Đăng ký việc mới',
      '<form data-form="new-request" class="request-entry-form">' + unitPicker +
      ui.sectionTitle('Khách hàng') +
      '<div class="f-row customer-fields">' +
      ui.field('Tên khách hàng', ui.input('name', '', { required: true })) +
      ui.field('Mã CIF', ui.input('cif', '', { id: 'cifInput' })) +
      ui.field('Điện thoại', ui.input('phone', '', { type: 'tel', placeholder: '09xx xxx xxx' })) +
      ui.field('Email', ui.input('email', '', { type: 'email' })) +
      '</div>' +

      '<div class="request-priority-section">' + ui.sectionTitle('Mức ưu tiên') +
      '<div class="f-row request-priorities">' +
      ui.checkbox('priority_vip', false, 'Khách hàng VIP') +
      ui.checkbox('priority_urgent', false, 'Xử lý gấp') +
      '</div></div>' +

      '<div class="request-work-section">' + ui.sectionTitle('Danh sách việc') +
      '<div class="rows" id="rows">' + rowForm(0) + '</div>' +
      ui.btn('Thêm dòng việc', { act: 'add-row', icon: 'plus', sm: true, kind: 'line' }) +
      '</div>' +

      '<div class="request-note-section">' +
      ui.field('Ghi chú cho LS', ui.textarea('note', '', { placeholder: 'Thông tin cần kiểm soát lưu ý' })) +
      '</div>' +
      ui.formEnd('Gửi sang LS') + '</form>',
      { size: 'md' });
    var firstGroup = document.querySelector('#dialog [data-role="work-type-group"]');
    if (firstGroup) syncProductOptions(firstGroup);
  }

  function submitNewRequest(form) {
    var u = me();
    var d = new FormData(form);
    var rows = form.querySelectorAll('.row-item');
    if (!rows.length) { ui.toast('Cần ít nhất một dòng việc.', 'err'); return; }

    var unitId = u.role === 'PHONG_PGD' ? u.unit_id : String(d.get('unit_id') || '');
    if (!unitId) { ui.toast('Chọn phòng / PGD gửi hồ sơ.', 'err'); return; }
    var cif = String(d.get('cif') || '').trim();
    var kind = cif ? 'DA_CO_CIF' : 'KH_MOI';
    var quantityError = '';
    var payload = {
      unit_id: unitId,
      customer: {
        name: String(d.get('name')).trim(), kind: kind,
        cif: cif,
        phone: U.normalizePhone(d.get('phone')), email: String(d.get('email') || '').trim().toLowerCase(),
        priority_flags: ['VIP', 'XU_LY_GAP'].filter(function (x, idx) { return d.get(['priority_vip', 'priority_urgent'][idx]) !== null; })
      },
      requestor: { id: u && u.user_id ? u.user_id : '', name: u && u.full_name ? u.full_name : '', kind: u && u.role ? u.role : 'VRM_PRM' },
      note: String(d.get('note') || '').trim(), items: []
    };
    if (!U.validPhone(payload.customer.phone) || !U.validEmail(payload.customer.email)) { ui.toast('Kiểm tra số điện thoại và email khách hàng; giữ số 0 đầu.','err');return; }
    Array.prototype.forEach.call(rows, function (row) {
      var group = row.querySelector('[data-role="work-type-group"]');
      var product = row.querySelector('[data-role="work-type-product"]');
      var date = row.querySelector('[name^="dt_"]');
      var dateDisplay = row.querySelector('[data-date-display-for]');
      if (dateDisplay) ui.syncDateInput(dateDisplay);
      var wt = U.byId(st().workTypes, 'code', product.value);
      var item = {
        work_type_code: product.value,
        product_name: wt ? wt.name : '',
        work_type_group: group.value,
        collateral_mode: rowCollateralMode(row, wt),
        occurrence_date: date.value
      };
      var quantityKeys = wt ? D.requestCollateralQuantityKeys(item, wt) : [];
      if (quantityKeys.indexOf('HD_THE_CHAP') !== -1) {
        var mortgageInput = row.querySelector('[data-role="request-quantity-mortgage"]');
        var mortgageCount = Number(mortgageInput && mortgageInput.value);
        if (!isFinite(mortgageCount) || mortgageCount < 1 || Math.floor(mortgageCount) !== mortgageCount) quantityError = 'Nhập số HĐ thế chấp cần soạn là số nguyên lớn hơn 0.';
        else item.requested_mortgage_contract_count = mortgageCount;
      }
      if (quantityKeys.indexOf('XUAT_KHO') !== -1) {
        var exportInput = row.querySelector('[data-role="request-quantity-export"]');
        var exportCount = Number(exportInput && exportInput.value);
        if (!isFinite(exportCount) || exportCount < 1 || Math.floor(exportCount) !== exportCount) quantityError = 'Nhập số bìa tài sản cần xuất là số nguyên lớn hơn 0.';
        else item.requested_export_folder_count = exportCount;
      }
      payload.items.push(item);
    });
    if (quantityError) { ui.toast(quantityError, 'err'); return; }
    if (!payload.customer.name || payload.items.some(function (item) {
      var wt = U.byId(st().workTypes, 'code', item.work_type_code);
      return !item.work_type_code || !item.product_name || !item.occurrence_date || !wt || (wt.group || wt.name) !== item.work_type_group;
    })) {
      ui.toast('Hãy điền đủ khách hàng, loại việc, sản phẩm và ngày phát sinh.', 'err'); return;
    }
    if (U.isGas()) {
      // Dựng ngay dòng tạm trên màn hình rồi mới gọi máy chủ. Mã việc thật do
      // máy chủ cấp nên dòng tạm bị khóa thao tác cho tới khi có mã trả về.
      var tmpReq = 'TAM_REQ_' + Date.now().toString(36).toUpperCase();
      var tmpIds = [];

      st().requests.unshift({
        request_id: tmpReq, unit_id: unitId, created_by: u.user_id, created_at: U.now(),
        note: payload.note, customer: payload.customer, requestor: payload.requestor
      });

      payload.items.forEach(function (it, idx) {
        var wt = U.byId(st().workTypes, 'code', it.work_type_code);
        var tmpId = tmpReq + '_' + (idx + 1);
        tmpIds.push(tmpId);
        st().items.unshift({
          item_id: tmpId, request_id: tmpReq, work_type_code: it.work_type_code,
          product_name: it.product_name, occurrence_date: it.occurrence_date,
          status: 'CHO_PHAN_CONG', assigned_user_id: '', assigned_by: '',
          submitted_at: U.now(),dossier_received_at:'',timing_source:'NEW',processing_sessions:[],sla_pause_log:[], accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: '',
          appointment: null, checklist: (wt ? wt.checklist : []).map(function () { return false; }),
          note: '', pending: null, version: 1, collateral_mode: it.collateral_mode || 'NONE',
          requested_mortgage_contract_count: it.requested_mortgage_contract_count || '',
          requested_export_folder_count: it.requested_export_folder_count || '', parent_item_id: '', syncing: true
        });
      });

      ui.closeDialog();
      LS.app.render();
      // Coi như đã gửi xong: báo ngay, máy chủ nhận ở nền; chỉ báo lại nếu bị từ chối.
      ui.toast('Đã gửi ' + payload.items.length + ' đề nghị sang Kiểm soát LS để phân công.', 'ok');

      LS.app.background(LS.api.createRequest(payload), {
        label: 'Đăng ký việc mới',
        onOk: function (result) {
          var ids = (result && result.item_ids) || [];
          var remoteItems = {};
          (result && result.items || []).forEach(function (item) { remoteItems[item.item_id] = item; });
          var req = U.byId(st().requests, 'request_id', tmpReq);
          if (req) req.request_id = result.request_id;
          tmpIds.forEach(function (tmp, idx) {
            var row = U.byId(st().items, 'item_id', tmp);
            if (!row) return;
            row.item_id = ids[idx] || tmp;
            row.request_id = result.request_id;
            var remote = remoteItems[row.item_id];
            if (remote) Object.keys(remote).forEach(function (key) { row[key] = remote[key]; });
            row.syncing = false;
          });
          (result && result.linked_items || []).forEach(function (child) {
            st().items.unshift({
              item_id: child.item_id, request_id: result.request_id, parent_item_id: child.parent_item_id || '',
              work_type_code: child.work_type_code, product_name: child.product_name,
              occurrence_date: child.occurrence_date, status: child.status || 'CHO_PHAN_CONG',
              dossier_received_at:'',timing_source:'NEW',processing_sessions:[],sla_pause_log:[],
              assigned_user_id: child.assigned_user_id || '', assigned_by: child.assigned_by || '',
              submitted_at: child.submitted_at || '', accepted_at: child.accepted_at || '', assigned_at: child.assigned_at || '',
              due_at: child.due_at || '', completed_at: child.completed_at || '', processing_started_at: child.processing_started_at || '',
              appointment: null, checklist: child.checklist || [], note: child.note || '', pending: null,
               version: Number(child.version) || 1, collateral_mode: child.collateral_mode || 'MOI', is_priority: !!child.is_priority,
               requested_mortgage_contract_count: child.requested_mortgage_contract_count || '', syncing: false
            });
          });
          LS.app.render();
        },
        rollback: function () {
          st().requests = st().requests.filter(function (r) { return r.request_id !== tmpReq; });
          st().items = st().items.filter(function (i) { return tmpIds.indexOf(i.item_id) === -1; });
        }
      });
      return;
    }

    var reqId = U.uid('REQ');

    st().requests.unshift({
      request_id: reqId, unit_id: unitId, created_by: u.user_id, created_at: U.now(),
      note: String(d.get('note') || '').trim(),
      customer: {
        name: String(d.get('name')).trim(), kind: kind,
        cif: cif,
        phone: payload.customer.phone,
        email: payload.customer.email,
        priority_flags: payload.customer.priority_flags
      },
      requestor: { id: u.user_id, kind: u.role || 'VRM_PRM', name: u.full_name || '' }
    });

    var n = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var sel = row.querySelector('[data-role="work-type-product"]');
      var date = row.querySelector('[name^="dt_"]');
      var wt = U.byId(st().workTypes, 'code', sel.value);
      var requested = payload.items[n];
      var mode = rowCollateralMode(row, wt);
      var id = U.uid('ITEM');
      st().items.unshift({
        item_id: id, request_id: reqId, work_type_code: sel.value,
        product_name: wt ? wt.name : '', occurrence_date: date.value,
        status: 'CHO_PHAN_CONG', assigned_user_id: '', assigned_by: '',
        submitted_at: U.now(),dossier_received_at:'',timing_source:'NEW',processing_sessions:[],sla_pause_log:[], accepted_at: '', assigned_at: '', due_at: '', completed_at: '', processing_started_at: '',
        appointment: null, checklist: (wt ? wt.checklist : []).map(function () { return false; }),
        note: '', pending: null, version: 1, collateral_mode: mode,
        requested_mortgage_contract_count: requested.requested_mortgage_contract_count || '',
        requested_export_folder_count: requested.requested_export_folder_count || '', parent_item_id: ''
      });
      logEvent(id, 'TAO_VIEC', unitName(unitId) + ' đăng ký yêu cầu.');
      if (mode === 'MOI') {
        var collateralType = U.byId(st().workTypes, 'code', 'LEGACY_26');
        if (collateralType) {
          var childId = U.uid('ITEM');
          st().items.unshift({
            item_id: childId, request_id: reqId, parent_item_id: id, work_type_code: collateralType.code,
            product_name: collateralType.name, occurrence_date: date.value, status: 'CHO_PHAN_CONG',
            dossier_received_at:'',timing_source:'NEW',processing_sessions:[],sla_pause_log:[],
            assigned_user_id: '', assigned_by: '', submitted_at: U.now(), accepted_at: '', assigned_at: '', due_at: '',
            completed_at: '', processing_started_at: '', appointment: null,
            checklist: (collateralType.checklist || []).map(function () { return false; }), note: '', pending: null,
            version: 1, collateral_mode: 'MOI', requested_mortgage_contract_count: requested.requested_mortgage_contract_count || ''
          });
          logEvent(childId, 'TAO_VIEC', 'Tạo hồ sơ TSBĐ mới đi kèm việc ' + id + '.');
        }
      }
      n += 1;
    });

    U.save();
    ui.closeDialog();
    LS.app.render();
    ui.toast('Đã gửi ' + n + ' đề nghị sang Kiểm soát LS để phân công.');
  }

  /* ============================ Xuất dữ liệu ============================ */

  function exportCsv() {
    var u = me();
    if (['QUAN_LY_LS', 'ADMIN'].indexOf(u.role) === -1) { ui.toast('Không có quyền xuất báo cáo.', 'err'); return; }
    var limit = st().settings.export_row_limit;
    var q = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
    function finish(events) {
      var rows = [['ma_su_kien', 'ma_viec', 'su_kien', 'nguoi_thuc_hien', 'thoi_gian', 'noi_dung'].join(',')];
      events.slice(0, limit).forEach(function (e) {
        rows.push([e.event_id, e.item_id, D.label(e.type), userName(e.by) || e.by, U.fmtDT(e.at), e.reason].map(q).join(','));
      });
      LS.app.download('nhat_ky_ls_' + U.localDate() + '.csv', rows.join('\r\n'), 'text/csv');
      // Xuất báo cáo cũng phải lưu vết: ai xuất, lúc nào, bao nhiêu dòng.
      LS.admin.logCfg('Báo cáo', 'Xuất nhật ký CSV, ' + (rows.length - 1) + ' dòng.');
      U.save();
      ui.toast('Đã xuất ' + (rows.length - 1) + ' dòng.');
    }
    if (!U.isGas()) { finish(visibleEvents()); return; }
    // Xuất theo đúng khoảng đang xem, lấy thẳng từ máy chủ chứ không chỉ các trang đã tải.
    var range = auditRange();
    LS.api.getAuditLog({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), limit: limit })
      .then(function (data) { finish(data.events || []); })
      .catch(function (e) { ui.toast(e.message || 'Không xuất được nhật ký.', 'err'); });
  }

  /* ============================ Quét quá hạn ============================ */

  /** Chạy một lần mỗi phiên: việc vừa quá hạn thì phát thông báo theo quy tắc. */
  function sweepOverdue() {
    var changed = false;
    st().items.forEach(function (i) {
      var s = D.sla(i, st());
      if (!s || !s.late) return;
      var made = D.queueNotifications(i, 'QUA_HAN', st(), null);
      if (made.length) changed = true;
    });
    if (changed) U.save();
  }

  function monitorDashboard() {
    if (!me() || me().role !== 'GIAM_SAT') return ui.banner('warn','Không có quyền xem.','');
    var s = st().monitorSummary;
    if (!s) return ui.banner('warn','Chưa có số liệu tổng hợp.','');
    var t = s.total, plan = st().activePlan || {};
    function rate(n, total) { var p = U.pct(n, total); return p === null ? '—' : p + '%'; }
    var body = ui.block({ title: 'Tổng hợp kỳ ' + (plan.name || plan.month_key || 'đang vận hành'), icon: 'chart',
      count: plan.start_date ? U.fmtDate(plan.start_date) + ' → ' + U.fmtDate(plan.end_date) : '',
      body: ui.strip([ui.metric('Tổng việc', t.total), ui.metric('Hoàn thành', t.completed, 'ok', rate(t.completed, t.total - t.canceled) + ' việc không hủy'),
        ui.metric('Đang mở', t.open, 'info'), ui.metric('Quá hạn', t.late, t.late ? 'danger' : '', rate(t.late, t.lateBase) + ' việc có tính SLA'), ui.metric('Đã hủy', t.canceled)]) });
    [['Theo đơn vị',s.byUnit],['Theo nghiệp vụ',s.byType],['Theo cán bộ LS',s.byStaff]].forEach(function(group) {
      body += ui.block({title:group[0],icon:'chart',count:group[1].length,body:ui.table(
        [{label:group[0]},{label:'Tổng',cls:'num'},{label:'Hoàn thành',cls:'num'},{label:'Tỷ lệ xong',cls:'num'},{label:'Đang mở',cls:'num'},{label:'Quá hạn',cls:'num'},{label:'Đã hủy',cls:'num'}],
        group[1].map(function(r) { return {cls: r.late ? 'flag-warn' : '', cells:['<div class="t1">' + U.esc(r.label) + '</div>',
          '<span class="tid">' + U.esc(r.total) + '</span>', '<span class="tid">' + U.esc(r.completed) + '</span>',
          '<span class="tid">' + rate(r.completed, r.total - r.canceled) + '</span>', '<span class="tid">' + U.esc(r.open) + '</span>',
          r.late ? ui.tag(String(r.late), 'danger') : '<span class="tid">0</span>', '<span class="tid">' + U.esc(r.canceled) + '</span>']}; }),
        { icon: 'chart', title: 'Chưa có việc trong kỳ', text: '' })});
    });
    return body;
  }

  return {
    monitorDashboard:monitorDashboard,
    openActivity:openActivity,itemActivity:itemActivity,activityItemId:activityItemId,loadActivity:loadActivity,
    previewActivitySend:previewActivitySend,
    loadTimingAudit:loadTimingAudit,fixAuditedTimes:fixAuditedTimes,confirmOwner:confirmOwner,submitOwner:submitOwner,
    timeReport:timeReport,runTimeReport:runTimeReport,exportTimeReport:exportTimeReport,editTimes:editTimes,submitTimes:submitTimes,
    changeDueDate:changeDueDate,submitDueDate:submitDueDate,
    work: work, room: room, roomBoard: roomBoard, queue: queue, mine: mine, team: team, runTeamView: runTeamView, personalDashboard: personalDashboard, board: board, staffWorkDetail: staffWorkDetail, assignmentStaffWorkPreview: assignmentStaffWorkPreview, periods: periods, audit: audit,
    report: report, exportReport: exportReport, refreshReport: refreshReport, setReportFilter: setReportFilter,
    staffAbsenceDialog: staffAbsenceDialog, staffAbsenceEditDialog: staffAbsenceEditDialog, saveStaffAbsence: saveStaffAbsence,
    staffHandoverDialog: staffHandoverDialog, handoverPickAll: handoverPickAll, handoverBulk: handoverBulk, submitStaffHandover: submitStaffHandover,
    myAbsenceDialog: myAbsenceDialog, saveMyAbsence: saveMyAbsence,
    headerSummary: headerSummary, refreshClocks: refreshClocks, focusBar:focusBar, startWork:startWork,
    openGlobalPause:openGlobalPause, submitGlobalPause:submitGlobalPause, endGlobalPause:endGlobalPause,
    openOtherWork: openOtherWork, submitOtherWork: submitOtherWork, cancelOtherWork: cancelOtherWork,
    openEndGlobalPause: openEndGlobalPause, submitEndGlobalPause: submitEndGlobalPause,
    toggleKhac: function () { setFilter('board', 'khac', f('board', 'khac', '') === '1' ? '' : '1'); LS.app.render(); },
    detail: detail, saveChecklistToggle: saveChecklistToggle, checklistAll: checklistAll, markCreditDraft: markCreditDraft, receiveAll: receiveAll, recordStepToggle: recordStepToggle, recordStepQuantity: recordStepQuantity, addLinked: addLinked, toggleLinkedBox: toggleLinkedBox, flow: flow, quickAssign: quickAssign, confirmDossierReceipt: confirmDossierReceipt, submitFlow: submitFlow, editResultFlags: editResultFlags, submitResultFlags: submitResultFlags, planDialog: planDialog, submitPlan: submitPlan, tracking: tracking, reportEntry: reportEntry, reportHub: reportHub, isLeader: isLeader,
    openBatchAssign: openBatchAssign, submitBatchAssign: submitBatchAssign,
    togglePick: togglePick, togglePickAll: togglePickAll, clearPicks: clearPicks, submitBulkAssign: submitBulkAssign,
    requestCancel: requestCancel, submitCancelRequest: submitCancelRequest, approveCancel: approveCancel,
    editItem: editItem, submitEdit: submitEdit, revision: revision,
    newRequest: newRequest, submitNewRequest: submitNewRequest, rowForm: rowForm, syncProductOptions: syncProductOptions, syncCollateralMode: syncCollateralMode, syncRequestQuantities: syncRequestQuantities,
    requestWeekStart: requestWeekStart, requestWeekDate: requestWeekDate, syncRequestWeekdays: syncRequestWeekdays, selectRequestWeekday: selectRequestWeekday, selectRequestWeek: selectRequestWeek,
    exportCsv: exportCsv, togglePlan: function () { setFilter('board', 'plan', f('board', 'plan', '') === '1' ? '' : '1'); LS.app.render(); }, downloadDailyImage: downloadDailyImage, exportBoard: exportBoard, sweepOverdue: sweepOverdue,
    visibleItems: visibleItems, queueBadgeCount: queueBadgeCount, auditMore: auditMore, auditReload: auditReload, auditRun: auditRun, enterScreen: enterScreen, setFilter: setFilter, toggleSort: toggleSort, resetFilters: resetFilters, resetFilter: resetFilter, openFilter: openFilter, setDraftFilter: setDraftFilter, applyFilter: applyFilter, applyReportFilter: applyReportFilter,
    staffList: staffList, userName: userName, unitName: unitName, itemLabel: itemLabel, itemRef: itemRef,
    roomShowBacklog: roomShowBacklog
  };
})();
