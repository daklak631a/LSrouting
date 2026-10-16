/**
 * Hợp đồng: cán bộ LS tạm dừng/tiếp tục xử lý, không cần lý do và dừng đồng hồ.
 *
 * Yêu cầu nghiệp vụ: sau khi "Tiếp nhận hồ sơ" (DANG_THUC_HIEN), cán bộ LS được
 * bấm "Tạm dừng" (không cần lý do) để ngừng tính giờ, và bấm "Tiếp tục xử
 * lý" khi muốn làm tiếp. TAM_DUNG phải nằm trong nhóm dừng SLA.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (f) => fs.readFileSync(f, 'utf8');

const client = { LS: {}, localStorage: { getItem: () => null, setItem: () => {} }, window: {} };
vm.runInNewContext(read('js/core.js'), client);
vm.runInNewContext(read('js/domain.js'), client);
const D = client.LS.domain;

function step(from, to) {
  return (D.FLOW[from] || []).find((s) => s.to === to);
}

test('cán bộ LS tạm dừng được sau khi tiếp nhận hồ sơ, không cần lý do', () => {
  const pause = step('DANG_THUC_HIEN', 'TAM_DUNG');
  assert.ok(pause, 'DANG_THUC_HIEN phải có bước chuyển sang TAM_DUNG');
  assert.ok(pause.roles.includes('CAN_BO_LS'), 'cán bộ LS phải được tạm dừng');
  assert.equal(pause.reason, undefined, 'tạm dừng không được đòi lý do');
  assert.match(pause.label, /Tạm dừng/);
});

test('cán bộ LS bấm tiếp tục để làm lại', () => {
  const resume = step('TAM_DUNG', 'DANG_THUC_HIEN');
  assert.ok(resume, 'TAM_DUNG phải có đường quay lại DANG_THUC_HIEN');
  assert.ok(resume.roles.includes('CAN_BO_LS'), 'cán bộ LS phải được tiếp tục');
  assert.equal(resume.primary, true, 'nút tiếp tục là thao tác chính khi đang tạm dừng');
  assert.match(resume.label, /Tiếp tục/);
});

test('không điểm tạm dừng nào đòi lý do', () => {
  Object.keys(D.FLOW).forEach((from) => {
    (D.FLOW[from] || []).filter((s) => s.to === 'TAM_DUNG').forEach((s) => {
      assert.equal(s.reason, undefined, 'bước tạm dừng ở ' + from + ' không được đòi lý do');
    });
  });
});

test('TAM_DUNG dừng đồng hồ SLA', () => {
  assert.ok(D.SLA_PAUSED.includes('TAM_DUNG'), 'TAM_DUNG phải nằm trong nhóm dừng SLA ở client');
});

test('máy chủ dừng SLA và không bắt buộc lý do khi tạm dừng', () => {
  const server = read('Code.gs');
  assert.match(server, /SLA_PAUSED_STATUS\s*=\s*\[[^\]]*'TAM_DUNG'/, 'Code.gs phải xếp TAM_DUNG vào nhóm dừng SLA');
  assert.match(server, /\['CAN_BO_SUNG',\s*'HUY'\]\.indexOf\(to\)\s*!==\s*-1\) return true/,
    'reasonRequired_ vẫn bắt buộc lý do với trả bổ sung và hủy');
  const start = server.indexOf('function reasonRequired_');
  assert.doesNotMatch(server.slice(start, start + 400), /TAM_DUNG/, 'reasonRequired_ không được nhắc TAM_DUNG');
});

test('reasonRequired_ chạy thật: tạm dừng không cần lý do, hủy và trả bổ sung vẫn cần', () => {
  const server = {};
  vm.runInNewContext(read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//)[1], server);
  vm.runInNewContext(read('Code.gs'), server);
  ['DA_PHAN_CONG', 'DANG_THUC_HIEN', 'DANG_HEN_KH'].forEach((from) => {
    assert.equal(server.reasonRequired_(from, 'TAM_DUNG'), false, 'tạm dừng từ ' + from + ' không đòi lý do');
  });
  assert.equal(server.reasonRequired_('DANG_THUC_HIEN', 'HUY'), true);
  assert.equal(server.reasonRequired_('CHO_PHAN_CONG', 'CAN_BO_SUNG'), true);
  assert.equal(server.reasonRequired_('TAM_DUNG', 'DANG_THUC_HIEN'), true, 'tiếp tục xử lý vẫn cần lý do như cũ');
});
