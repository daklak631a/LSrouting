'use strict';
let checking = null, pairChain = Promise.resolve();
const validRole = role => ['KS_LS', 'QUAN_LY_LS'].includes(role);
function appUrl(value) {
  try { const url = new URL(value); return LS_CONFIG.appUrls.find(base => url.origin + url.pathname === base) || ''; } catch (_) { return ''; }
}
async function paint(state) {
  const active = state.auth && state.auth.expires_at > Date.now();
  const text = !active ? '' : state.error ? '?' : state.count ? String(Math.min(state.count, 999)) : '';
  await browser.action.setBadgeText({ text });
  await browser.action.setBadgeBackgroundColor({ color: state.error ? '#a16207' : '#006b58' });
  await browser.action.setTitle({ title: active ? state.error ? 'LS-Routing — Chưa kết nối được' : `LS-Routing — ${state.count || 0} hồ sơ chờ phân công` : 'LS-Routing — Mở ứng dụng để đăng nhập' });
}
async function clearConnection() {
  await browser.storage.local.clear();
  await browser.notifications.clear('ls-new-queue');
  await paint({});
}
async function check() {
  if (checking) return checking;
  checking = poll().finally(() => { checking = null; });
  return checking;
}
async function poll() {
  const state = await browser.storage.local.get(null), auth = state.auth;
  if (!auth) { await paint(state); return; }
  if (auth.expires_at <= Date.now()) { await clearConnection(); return; }
  try {
    const response = await fetch(auth.appUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action: 'assignment_queue', token: auth.token }),
      credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error('Unavailable');
    const result = await response.json();
    if (!result.ok) {
      if (['SESSION', 'FORBIDDEN'].includes(result.code)) {
        const current = await browser.storage.local.get('auth');
        if (current.auth && current.auth.token === auth.token) await clearConnection();
        return;
      }
      throw new Error('Unavailable');
    }
    if (!validRole(result.role) || result.user_id !== auth.user_id) throw new Error('Invalid identity');
    const change = LS_QUEUE.compare(state.snapshot, result.data);
    // Account switch or logout during fetch: discard the old response.
    const current = await browser.storage.local.get('auth');
    if (!current.auth || current.auth.token !== auth.token) return;
    const next = { snapshot: change.snapshot, count: change.count, checked_at: Date.now(), error: '' };
    await browser.storage.local.set(next);
    await paint({ ...state, ...next });
    if (change.fresh) await browser.notifications.create('ls-new-queue', {
      type: 'basic', iconUrl: browser.runtime.getURL('icon.png'), title: 'LS-Routing — Hồ sơ chờ phân công',
      message: `${change.fresh} hồ sơ phát sinh hôm nay. Tổng ${change.count} hồ sơ đang chờ phân công.`
    });
    else if (change.dayChanged || !change.count) await browser.notifications.clear('ls-new-queue');
  } catch (_) {
    const current = await browser.storage.local.get('auth');
    if (!current.auth || current.auth.token !== auth.token) return;
    await browser.storage.local.set({ error: 'Chưa kết nối được. Sẽ tự thử lại.' });
    await paint({ ...state, error: true });
  }
}
async function pair(msg, sender) {
  const url = appUrl(sender.tab && sender.tab.url);
  if (!url || !sender.url || !/^https:\/\/(script\.google\.com|[a-z0-9.-]+\.googleusercontent\.com)\//i.test(sender.url)) return { connected: false };
  const data = msg.data || {}, state = await browser.storage.local.get(null);
  if (data.disconnected) {
    if (state.auth && state.auth.tabId === sender.tab.id) await clearConnection();
    return { connected: false };
  }
  if (!validRole(data.role) || !/^qe1_[a-f0-9]{64}$/.test(data.token || '') || !data.user_id || data.expires_at <= Date.now() || data.expires_at > Date.now() + 12 * 3600000 + 60000) return { connected: false };
  if (state.auth && state.auth.user_id !== data.user_id) await clearConnection();
  const auth = { token: data.token, user_id: data.user_id, role: data.role, expires_at: data.expires_at, appUrl: url, tabId: sender.tab.id };
  await browser.storage.local.set({ auth });
  void check();
  return { connected: true, openQueue: new URL(sender.tab.url).hash === '#ls-queue' };
}
async function openQueue() {
  const tabs = await browser.tabs.query({ url: 'https://script.google.com/*' });
  const existing = tabs.find(tab => appUrl(tab.url));
  if (existing) {
    await browser.tabs.update(existing.id, { active: true });
    await browser.windows.update(existing.windowId, { focused: true });
    try { await browser.tabs.sendMessage(existing.id, { type: 'OPEN_QUEUE' }); }
    catch (_) { await browser.tabs.update(existing.id, { url: appUrl(existing.url) + '#ls-queue' }); }
  } else await browser.tabs.create({ url: LS_CONFIG.appUrls[0] + '#ls-queue' });
}
browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === 'PAIR') { pairChain = pairChain.catch(() => {}).then(() => pair(msg, sender)); return pairChain; }
  if (sender.url !== browser.runtime.getURL('popup.html')) return;
  if (msg.type === 'CHECK') return check().then(() => ({ ok: true }));
  if (msg.type === 'STATUS') return browser.storage.local.get(null).then(({ auth, count, error, checked_at }) => ({ connected: !!auth && auth.expires_at > Date.now(), count, error, checked_at }));
  if (msg.type === 'OPEN') return openQueue();
});
browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === LS_CONFIG.alarm) void check(); });
browser.notifications.onClicked.addListener(id => { if (id === 'ls-new-queue') void openQueue(); });
async function start() {
  await browser.alarms.create(LS_CONFIG.alarm, { periodInMinutes: 1 });
  await check();
}
browser.runtime.onInstalled.addListener(start);
browser.runtime.onStartup.addListener(start);
// Event page can wake without onStartup: ensure alarm also exists on each load.
void browser.alarms.get(LS_CONFIG.alarm).then(alarm => { if (!alarm) return browser.alarms.create(LS_CONFIG.alarm, { periodInMinutes: 1 }); });
