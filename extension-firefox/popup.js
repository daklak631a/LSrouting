'use strict';
async function render() {
  const state = await browser.runtime.sendMessage({ type: 'STATUS' });
  document.getElementById('status').textContent = !state.connected ? 'Mở LS-Routing và đăng nhập bằng tài khoản Quản lý hoặc Kiểm soát LS.' : state.error || 'Đang theo dõi hồ sơ mới.';
  document.getElementById('count').textContent = state.connected ? state.count ?? '—' : '—';
  document.getElementById('checked').textContent = state.checked_at ? 'Kiểm tra lúc ' + new Date(state.checked_at).toLocaleTimeString('vi-VN') : 'Tự kiểm tra mỗi phút khi Firefox đang chạy.';
  document.getElementById('check').disabled = !state.connected;
}
document.getElementById('open').addEventListener('click', async () => { await browser.runtime.sendMessage({ type: 'OPEN' }); window.close(); });
document.getElementById('check').addEventListener('click', async event => {
  event.target.disabled = true;
  try { await browser.runtime.sendMessage({ type: 'CHECK' }); } finally { await render(); }
});
void render();
