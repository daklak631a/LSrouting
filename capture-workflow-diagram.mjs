import fs from 'node:fs/promises';

const debugBase = 'http://127.0.0.1:9222';
const diagramUrl = 'http://127.0.0.1:4174/design-gallery/QUY_TRINH_VAN_HANH_LS.svg';
const outputPath = 'design-gallery/QUY_TRINH_VAN_HANH_LS.png';

const target = await (await fetch(`${debugBase}/json/new?${encodeURIComponent(diagramUrl)}`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
try {
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setVisibleSize', { width: 1200, height: 1600 });
  await call('Page.navigate', { url: diagramUrl });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(outputPath, Buffer.from(data, 'base64'));
  console.log(outputPath);
} finally {
  socket.close();
}
