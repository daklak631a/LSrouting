import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function harness() {
  const ctx={LS:{},window:{},document:{},localStorage:{getItem:()=>null,setItem(){}}};
  for(const name of ['core','domain','ui','charts','screens'])vm.runInNewContext(fs.readFileSync('js/'+name+'.js','utf8'),ctx);
  const state=ctx.LS.domain.seed();state.session=state.users.find(u=>u.role==='KS_LS').user_id;
  const item=state.items.find(i=>!['HUY','CHO_HOAN_THIEN'].includes(i.status));
  ctx.LS.replace(state);let dialog='';ctx.LS.ui.openDialog=(title,body)=>{dialog=body;};
  ctx.LS.ui.closeDialog=()=>{};ctx.LS.ui.toast=()=>{};
  ctx.LS.app={render(){},showActivity(){}};
  return {ctx,state,item,dialog:()=>dialog};
}
test('hộp sửa giờ vẫn mở khi mốc cũ sai định dạng',()=>{
  const h=harness();h.item.dossier_received_at='không phải ngày';h.item.status='HOAN_THANH_LS';h.item.completed_at='INVALID';
  assert.doesNotThrow(()=>h.ctx.LS.screens.editTimes(h.item.item_id));
  assert.match(h.dialog(),/name="dossier_received_at"[^>]*value=""/);
  assert.match(h.dialog(),/name="completed_at"[^>]*value=""/);
});
test('nhật ký null hoặc JSON hỏng không làm lỗi trang lịch sử',async()=>{
  const h=harness();h.state.events=[
    {item_id:h.item.item_id,type:'SUA_THOI_GIAN',at:'2026-09-28T08:00:00+07:00',before_json:'null',after_json:'null',reason:'OLD_NULL'},
    {item_id:h.item.item_id,type:'SUA_THOI_GIAN',at:'2026-09-28T09:00:00+07:00',before_json:'{broken',after_json:'{}',reason:'OLD_BROKEN'},
    {item_id:h.item.item_id,type:'SUA_THOI_GIAN',at:'2026-09-28T10:00:00+07:00',before_json:JSON.stringify({dossier_received_at:'2026-09-28T08:00:00+07:00'}),after_json:'null',reason:'CORRUPT_AFTER'}];
  h.ctx.LS.screens.openActivity(h.item.item_id);await Promise.resolve();await Promise.resolve();
  let html;assert.doesNotThrow(()=>{html=h.ctx.LS.screens.itemActivity();});
  assert.match(html,/OLD_NULL/);assert.match(html,/OLD_BROKEN/);
  assert.doesNotMatch(html,/→ —/,'Missing corrupt snapshot must not claim the old receipt was cleared');
});
