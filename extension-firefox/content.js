'use strict';
(() => {
  const channel = 'LS_ROUTING_FIREFOX_V1';
  const requests = new Set();
  let connected = false, pending = false, queueOpened = false;
  function connect() {
    if (!document.getElementById('root') || pending) return;
    pending = true;
    const id = crypto.randomUUID().replaceAll('-', '');
    requests.add(id);
    window.postMessage({ channel, direction: 'request', action: 'CONNECT', id }, window.location.origin);
    setTimeout(() => { requests.delete(id); pending = false; }, 12000);
  }
  window.addEventListener('message', async event => {
    const msg = event.data;
    if (event.source !== window || !msg || msg.channel !== channel || msg.direction !== 'response' || !requests.delete(msg.id)) return;
    pending = false;
    const data = msg.data;
    if (!data || data.retry) return;
    try {
      const result = await browser.runtime.sendMessage({ type: 'PAIR', data });
      connected = !!(result && result.connected);
      if (result && result.openQueue && !queueOpened) { openQueue(); queueOpened = true; }
    } catch (_) { /* Extension reloaded. */ }
  });
  function openQueue() { window.postMessage({ channel, direction: 'request', action: 'OPEN_QUEUE' }, window.location.origin); }
  browser.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'OPEN_QUEUE' && document.getElementById('root')) { openQueue(); return Promise.resolve({ opened: true }); }
  });
  connect();
  let ticks = 0;
  setInterval(() => { ticks++; if (!connected || ticks % 4 === 0) connect(); }, 15000);
})();
