import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const notifications = read('Notifications.gs');
const setup = read('SetupSheetDB.gs');
const domain = read('js/domain.js');
const admin = read('js/admin.js');

const required = [
  [server, 'function sanitizeAdminRequest_', 'Admin bootstrap must redact customer fields server-side.'],
  [server, "'sign_place'", 'GAS settings must persist sign_place.'],
  [server, 'gateway_auth_ref', 'Gateway credential reference must be supported without exposing a secret.'],
  [server, 'appointment.channel', 'The selected appointment channel must reach notification selection.'],
  [notifications, "SMS:", 'Notifications must have an independent SMS channel.'],
  [notifications, 'NotificationMetrics', 'Every notification result must feed metrics.'],
  [notifications, 'recordMetric_', 'Notification metrics writer is missing.'],
  [setup, 'NotificationMetrics:', 'Storage schema must include notification metrics.'],
  [setup, "['SMS'", 'Storage seed must include SMS.'],
  [domain, "{ code: 'SMS', label: 'SMS', icon: 'send', out: 'SMS' }", 'SMS must not be mapped to ZBS.'],
  [admin, "['metrics', 'Chi phí & hiệu quả', 'chart']", 'Admin must expose notification metrics.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) throw new Error(message);
}

console.log('Fix contract passed.');
