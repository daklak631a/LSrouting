import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const api = read('js/gas-api.js');
const app = read('js/app.js');
const admin = read('js/admin.js');
const build = read('build-gas.mjs');
const svg = read('assets/login-workflow-hero.svg');

const required = [
  [server, 'function adminResetUserPassword(userId, nextPassword)', 'Server must expose an admin-only password reset.'],
  [api, 'resetUserPassword: function (userId, nextPassword)', 'Client API must call the password reset endpoint.'],
  [app, "'toggle-password'", 'Login must offer a password visibility control.'],
  [app, 'passwordControl(', 'Password fields must use the shared visibility control.'],
  [admin, "'user-reset-password'", 'User management must expose a dedicated password-reset action.'],
  [admin, "ui.iconBtn('lock'", 'User rows must show the password-reset lock action.'],
  [build, "assets/login-workflow-hero.svg", 'GAS build must inline the lightweight login SVG.'],
  [svg, '<svg', 'Login illustration must be an SVG asset.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) throw new Error(message);
}

if (Buffer.byteLength(svg, 'utf8') > 20 * 1024) throw new Error('Login SVG must remain under 20 KB.');
console.log('Login access contract passed.');
