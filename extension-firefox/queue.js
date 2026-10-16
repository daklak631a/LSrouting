'use strict';
const LS_QUEUE = Object.freeze({
  compare(previous, data) {
    const waiting = data.waiting;
    if (!Array.isArray(waiting) || waiting.length > 10000 || data.count !== waiting.length || !data.period_id) throw new Error('Invalid queue');
    if (data.notify_waiting !== undefined && !Array.isArray(data.notify_waiting)) throw new Error('Invalid notification queue');
    const toMap = rows => {
      const map = {};
      for (const row of rows) {
        if (!row || typeof row.key !== 'string' || typeof row.stamp !== 'string' || Object.hasOwn(map, row.key)) throw new Error('Invalid row');
        Object.defineProperty(map, row.key, { value: row.stamp, enumerable: true });
      }
      return map;
    };
    const next = toMap(waiting);
    // Older server versions only send `waiting`; preserve their behavior until
    // the backend is deployed with the separate current-day notification list.
    const notifyWaiting = data.notify_waiting === undefined ? waiting : data.notify_waiting;
    const nextNotify = toMap(notifyWaiting);
    const prior = previous && previous.period_id === data.period_id ? previous.waiting : null;
    const priorNotify = previous && previous.period_id === data.period_id
      ? previous.notify_waiting || prior : null;
    const fresh = notifyWaiting.filter(row => !priorNotify || !Object.hasOwn(priorNotify, row.key) ||
      row.stamp.split('|').some(token => !priorNotify[row.key].split('|').includes(token))).length;
    const dayChanged = !!(previous && previous.notification_day && data.notification_day &&
      previous.notification_day !== data.notification_day);
    return {
      fresh,
      snapshot: {
        period_id: data.period_id, waiting: next, notify_waiting: nextNotify,
        notification_day: data.notification_day || ''
      },
      dayChanged,
      count: waiting.length
    };
  }
});
