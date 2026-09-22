import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const server = read('Code.gs');
const api = read('js/gas-api.js');
const app = read('js/app.js');

const required = [
  [server, 'function markInboxRead(ids)', 'Inbox API must support selected notification IDs.'],
  [server, 'n.user_id === u.user_id', 'Inbox API must only update notifications owned by the current user.'],
  [server, 'wanted[String(n.id)]', 'Inbox API must filter by selected notification IDs.'],
  [api, 'markInboxRead: function (ids)', 'Client API must pass selected notification IDs.'],
  [app, "var inboxTab = 'UNREAD'", 'Bell dialog must default to the unread tab.'],
  [app, 'Đánh dấu tất cả đã xem', 'Bell dialog must offer an explicit mark-all action.'],
  [app, "'inbox-view'", 'A notification must support viewing its related work item.'],
  [app, "'inbox-mark-read'", 'A notification outside the visible work scope must still be markable individually.'],
  [app, "'inbox-show-read'", 'Bell dialog must retain a separate viewed-history tab.']
];

for (const [source, marker, message] of required) {
  if (!source.includes(marker)) throw new Error(message);
}

console.log('Inbox interaction contract passed.');
