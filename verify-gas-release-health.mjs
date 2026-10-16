import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const version = process.argv[2];
const warehouse = process.argv.includes('--warehouse');
const receiptBacklog = process.argv.includes('--receipt-backlog');
const weekday = process.argv.includes('--weekday');
const auditFixes = process.argv.includes('--audit-fixes');
const lsAuditFixes = process.argv.includes('--ls-audit-fixes');
const compactWorkload = process.argv.includes('--compact-workload');
const appOnly = process.argv.includes('--app-only');
const autoRecovery = process.argv.includes('--auto-recovery');
const requestForm = process.argv.includes('--request-form');
const resultCounting = process.argv.includes('--result-counting');
const recentAdjustments = process.argv.includes('--recent-adjustments');
if (!/^\d+$/.test(version||'')) throw new Error('Usage: node verify-gas-release-health.mjs <version>');
const ids = [
  'AKfycbylljXwRUkxUCL_wnxztLAzotSNi9iiOvgpGtXPCwzIQHjCgpPz6d_zvG_XC1urUlCH',
  'AKfycbymv6EMyrHZHG9qVhpAUimBYFE7pRYIXtzQALlK6w2_l7qIOkuVICOMnQNvEcRNG9p2'
];
const pack=appOnly ? null : JSON.parse(/window\.LS_FIREFOX_PACKAGE=(\{[^\r\n]+?\});/.exec(fs.readFileSync('Index.gas.html','utf8'))[1]);
const hash=appOnly ? null : crypto.createHash('sha256').update(fs.readFileSync('outputs/'+pack.filename)).digest('hex');
function userHtml(response) {
  const literal=/goog\.script\.init\(("(?:\\.|[^"\\])*")/.exec(response)?.[1];
  if(!literal)return response;
  const config=JSON.parse(JSON.parse(literal.replace(/\\x([0-9a-f]{2})/gi,'\\u00$1')));
  assert.equal(typeof config.userHtml,'string','GAS sandbox HTML absent');
  return config.userHtml;
}
function checkAuditFixes(html) {
  for(const marker of ["UNASSIGNED_STATUS = ASSIGNABLE_STATUS.concat(['CAN_BO_SUNG']);",
    "nav: ['my-dashboard', 'mine', 'team', 'time-report', 'audit']", 'var correctedZero=']){
    assert.ok(html.includes(marker),'Audit fix absent from live bundle: '+marker);
  }
  assert.ok(!html.includes('Ghi nhận bước soạn hợp đồng'),'Removed appointment guidance banner is still live');
}
function checkLsAuditFixes(html) {
  for (const marker of ['function refreshDashboardClock(now)', 'refreshDashboardClock(now);',
    'activity_credits', 'avg_cycle_hours', 'function calendarIssues(c)',
    'Tồn soạn hiện nay:', 'Kết quả tính theo ngày đã chọn; tồn soạn phản ánh hồ sơ còn mở hiện nay.']) {
    assert.ok(html.includes(marker), 'LS audit fix absent from live bundle: ' + marker);
  }
}
function checkCompactWorkload(html) {
  for (const marker of ['function staffWorkDetail', 'personal-backlog-counts',
    'data-backlog-kind', 'personal-backlog-detail', 'function personalBacklogKinds',
    'function personalBacklogDay(item)', 'data-backlog-age="', 'Tồn các ngày trước',
    '.assignment-work-preview-inner { width: 100%; max-width: 960px; margin: 0 auto; }',
    '.assignment-work-preview-inner .staff-work-detail-table td:nth-child(1) { width: 44%; }']) {
    assert.ok(html.includes(marker), 'Compact workload UI absent from live bundle: ' + marker);
  }
}
function checkAutoRecoveryClient(html) {
  assert.ok(html.includes("TU_VAO_PHAN_CONG: 'Tự đưa lại vào Hàng chờ phân công'"),'Recovery event label absent from live client');
  const returnedFlow = /CHUA_GIAO_HO_SO:\s*\[([\s\S]*?)\n\s*\],/.exec(html)?.[1];
  assert.ok(returnedFlow,'Returned dossier client flow absent');
  assert.match(returnedFlow,/to: 'CHO_PHAN_CONG'[^\n]+roles: \['PHONG_PGD'\]/,'Manual resend must remain requester-only');
}
function checkRequestForm(html) {
  for (const marker of ["CAN_BO_SUNG: { label: 'Chưa giao hồ sơ'", 'class="request-details-line"',
    "ui.input('request_hd_the_chap_' + idx, '1'", "ui.input('dt_' + idx, today",
    'class="request-row-head"', 'class="request-main-fields"',
    '.request-entry-form .row-item .f { margin-bottom: 0; }',
    'requested_mortgage_contract_count: child.requested_mortgage_contract_count', 'stepQuantities[s.key] = quantity']) {
    assert.ok(html.includes(marker), 'Request form release marker absent: ' + marker);
  }
}
function checkResultCounting(html) {
  for (const marker of ['function scheduledMortgageCredit_', 'var linkedMortgageParents = {};',
    "if (item.collateral_mode === 'MOI') return false;", 'c.user_id ? c.quantity :',
    'live.result_flags = Object.assign({}, D.savedResultFlags(live) || {}, flags);',
    'return !i.carried_to_item_id && (!unit || (r && r.unit_id === unit));',
    "source: 'APPOINTMENT'"]) {
    assert.ok(html.includes(marker), 'Result counting fix absent from live bundle: ' + marker);
  }
}
function checkRecentAdjustments(html) {
  for (const marker of ['var OTHER_WORK_TYPES = [', 'function openOtherWork()', 'function openEndGlobalPause(operationId)',
    'function openSupplement(id)', 'function overtime(start, end, c)',
    'spans = subtract(spans, [[at(key, c.breakFrom), at(key, c.breakTo)]], end)', 'data-act="board-khac"']) {
    assert.ok(html.includes(marker), 'Recent adjustments absent from live bundle: ' + marker);
  }
}
if (lsAuditFixes) checkLsAuditFixes(fs.readFileSync('Index.gas.html', 'utf8'));
const results=await Promise.all(ids.map(async id=>{
  const base='https://script.google.com/macros/s/'+id+'/exec', nonce=version+'-'+Date.now();
  if(appOnly){
    const app=await fetch(base+'?release='+nonce,{signal:AbortSignal.timeout(45000)});
    const response=await app.text();
    assert.equal(app.status,200);
    if(auditFixes)checkAuditFixes(userHtml(response));
    if(lsAuditFixes)checkLsAuditFixes(userHtml(response));
    if(compactWorkload)checkCompactWorkload(userHtml(response));
    if(autoRecovery)checkAutoRecoveryClient(userHtml(response));
    if(requestForm)checkRequestForm(userHtml(response));
    if(resultCounting)checkResultCounting(userHtml(response));
    if(recentAdjustments)checkRecentAdjustments(userHtml(response));
    return {deployment:id,version:Number(version),app_status:app.status,app_bytes:Buffer.byteLength(response),
      audit_fixes_bundle_checked:auditFixes,ls_audit_fixes_bundle_checked:lsAuditFixes,auto_recovery_client_checked:autoRecovery,request_form_bundle_checked:requestForm,
      result_counting_bundle_checked:resultCounting,recent_adjustments_bundle_checked:recentAdjustments,
      compact_workload_bundle_checked:compactWorkload,firefox_checks:'excluded_by_request'};
  }
  const [app,download,post]=await Promise.all([
    fetch(base+'?release='+nonce,{signal:AbortSignal.timeout(45000)}),
    fetch(base+'?download=firefox&release='+nonce,{signal:AbortSignal.timeout(45000)}),
    fetch(base,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'assignment_queue',token:'invalid'}),signal:AbortSignal.timeout(45000)})
  ]);
  const [a,d,p]=await Promise.all([app.text(),download.text(),post.text()]);
  console.log(JSON.stringify({id,app_status:app.status,app_bytes:a.length,download_status:download.status,download_bytes:d.length,download_hash:d.includes(hash),download_package:d.includes(pack.filename),post_status:post.status}));
  assert.equal(app.status,200);assert.equal(download.status,200);assert.equal(post.status,200);
  assert.ok(a.includes('LS_ROUTING_FIREFOX_V1'),'New pairing bridge absent from live app');
  assert.ok(a.includes('dateDisplay') && a.includes('syncDateInput'),'New requested date submit absent');
  if(warehouse){
    const appHtml=userHtml(a);
    for(const marker of ['function collateralStepKeys', 'function recordStepToggle', 'NHAP_KHO', 'XUAT_KHO', 'Phần việc phải tick', 'var current = D.resultCredit(i)[key]']){
      assert.ok(appHtml.includes(marker),'Warehouse release marker absent: '+marker);
    }
  }
  if(receiptBacklog){
    assert.ok(userHtml(a).includes('if (!item || !item.dossier_received_at) return [];'),'Receipt gate absent from live daily backlog');
  }
  if(weekday){
    const appHtml=userHtml(a);
    for(const marker of ['function selectRequestWeekday', 'function selectRequestWeek', 'data-role="request-weekday"', 'Chọn nhanh theo thứ', "ui.input('dt_' + idx, today"]){
      assert.ok(appHtml.includes(marker),'Weekday selection marker absent: '+marker);
    }
  }
  if(auditFixes){
    checkAuditFixes(userHtml(a));
  }
  if(lsAuditFixes)checkLsAuditFixes(userHtml(a));
  if(compactWorkload)checkCompactWorkload(userHtml(a));
  if(autoRecovery)checkAutoRecoveryClient(userHtml(a));
  if(resultCounting)checkResultCounting(userHtml(a));
  if(recentAdjustments)checkRecentAdjustments(userHtml(a));
  assert.ok(d.includes(hash) && d.includes(pack.filename),'Live download does not contain expected package/hash');
  const downloadHtml=userHtml(d);
  const downloadLink=/download="([^"]+)" href="data:application\/octet-stream;base64,([^"]+)"/.exec(downloadHtml);
  assert.ok(downloadLink,'Live signed package download link absent');
  assert.equal(downloadLink[1],pack.filename);
  const payload=downloadLink[2].replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)));
  const downloadedBytes=Buffer.from(payload,'base64');
  assert.ok(downloadedBytes.equals(fs.readFileSync('outputs/'+pack.filename)),'Live download package bytes differ from original artifact');
  assert.equal(crypto.createHash('sha256').update(downloadedBytes).digest('hex'),hash);
  if(pack.signed)assert.ok(downloadHtml.includes('Install Add-on From File') && !downloadHtml.includes('Load Temporary Add-on'));
  assert.deepEqual(JSON.parse(p),{ok:false,code:'INVALID'},'Scoped HTTP feed must reject invalid token');
  return {deployment:id,version:Number(version),app_status:app.status,app_bytes:Buffer.byteLength(a),
    download_status:download.status,download_bytes:Buffer.byteLength(d),package_filename:pack.filename,signed:pack.signed,
    package_sha256:hash,package_bytes:downloadedBytes.length,package_bytes_match:true,invalid_token_rejected:true,warehouse_bundle_checked:warehouse,receipt_backlog_checked:receiptBacklog,weekday_selection_checked:weekday,audit_fixes_bundle_checked:auditFixes,ls_audit_fixes_bundle_checked:lsAuditFixes,result_counting_bundle_checked:resultCounting,recent_adjustments_bundle_checked:recentAdjustments,compact_workload_bundle_checked:compactWorkload};
}));
fs.writeFileSync('outputs/gas-v'+version+(appOnly ? '-app-health.json' : '-firefox-date-health.json'),JSON.stringify({checked_at:new Date().toISOString(),results},null,2)+'\n','utf8');
console.log(JSON.stringify(results,null,2));
console.log(appOnly ? 'GAS HTTP/bundle checks passed. Authenticated business workflows are not verified by this probe.' : 'Deployment HTTP/bundle checks passed. Authenticated business and Firefox desktop workflows are not verified by this probe.');
