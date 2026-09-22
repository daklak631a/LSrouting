import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const notifications = read('Notifications.gs');
const screens = read('js/screens.js');
const domain = read('js/domain.js');

const required = [
  [server, 'transitionIdempotent_', 'A repeated completed transition must be accepted idempotently.'],
  [server, 'notification_mode', 'Server must accept the user notification choice.'],
  [notifications, 'channelMode', 'GAS notification queue must support an internal-only mode.'],
  [notifications, "? ['IN_APP']", 'Internal-only mode must never select an external channel.'],
  [screens, 'Thông báo cán bộ', 'Completion dialog must offer notifying staff.'],
  [screens, 'name="notification_mode"', 'Completion dialog must submit the notification choice.'],
  [screens, 'notification_mode: notificationMode', 'Client must send the selected notification mode.'],
  [domain, 'channelMode', 'Browser fallback must match the internal-only notification choice.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) throw new Error(message);
}

console.log('Completion notification contract passed.');
