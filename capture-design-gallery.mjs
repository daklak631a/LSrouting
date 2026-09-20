import fs from 'node:fs/promises';
import path from 'node:path';

const appUrl = 'http://127.0.0.1:4174/';
const debugUrl = 'http://127.0.0.1:9222';
const outputDir = path.resolve('design-gallery');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openTarget() {
  const response = await fetch(`${debugUrl}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Cannot open Chrome capture tab: ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({ socket, call }), { once: true });
    socket.addEventListener('error', () => reject(new Error('Cannot connect to Chrome DevTools')), { once: true });
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const target = await openTarget();
  const { socket, call } = await connect(target.webSocketDebuggerUrl);
  try {
    await call('Page.enable');
    await call('Runtime.enable');

    async function setViewport(width, height, mobile = false) {
      await call('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile,
        screenWidth: width, screenHeight: height,
      });
      await call('Emulation.setVisibleSize', { width, height });
    }

    async function showRole(email) {
      await call('Runtime.evaluate', {
        expression: "document.querySelector(\"[data-act='logout']\")?.click()",
      });
      await delay(250);
      await call('Page.navigate', { url: appUrl });
      await delay(550);
      const click = await call('Runtime.evaluate', {
        expression: `(() => { const b = document.querySelector(\"button[data-act='login-as'][data-email='${email}']\"); if (!b) return 'missing'; b.click(); return 'clicked'; })()`,
        returnByValue: true,
      });
      if (click.result.value !== 'clicked') throw new Error(`Demo login button missing for ${email}`);
      await delay(850);
    }

    async function capture(filename) {
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.writeFile(path.join(outputDir, filename), Buffer.from(data, 'base64'));
      console.log(filename);
    }

    await setViewport(1440, 900);
    await showRole('pgd.benthanh@bank.vn');
    await capture('THIET_KE_01_Phong_PGD.png');
    await showRole('ksls@bank.vn');
    await capture('THIET_KE_02_Kiem_soat_LS.png');
    await showRole('cbls1@bank.vn');
    await capture('THIET_KE_03_Can_bo_LS.png');
    await showRole('quanlyls@bank.vn');
    await capture('THIET_KE_04_Dieu_hanh_LS.png');
    await showRole('admin@bank.vn');
    await capture('THIET_KE_05_Quan_tri_he_thong.png');
    await setViewport(390, 844, true);
    await showRole('quanlyls@bank.vn');
    await capture('THIET_KE_06_Dieu_hanh_mobile.png');
  } finally {
    socket.close();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
