import fs from 'node:fs';

const screens = fs.readFileSync('js/screens.js', 'utf8');
const css = fs.readFileSync('css/styles.css', 'utf8');

const required = [
  [screens, 'function priorityRowClass', 'priority row classification'],
  [screens, 'class="customer-main"', 'customer name and priority tags on one line'],
  [screens, 'class="contact-link"', 'contact links'],
  [screens, 'priority-urgent', 'urgent priority class'],
  [css, '.priority-vip', 'VIP row styling'],
  [css, '.priority-urgent', 'urgent row styling'],
  [css, '.priority-important', 'important row styling'],
  [css, '.contact-link', 'contact styling']
];

for (const [source, marker, label] of required) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
}

if (screens.includes('notifyPreview(tr.notify)')) {
  throw new Error('Redundant notification preview is still rendered in the flow dialog.');
}
if (screens.includes('function notifyPreview')) {
  throw new Error('Redundant notification preview helper is still present.');
}

console.log('UI copy contract passed.');
