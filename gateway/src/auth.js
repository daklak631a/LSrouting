import crypto from 'node:crypto';
import { unauthorized } from './errors.js';

/** So sánh không phụ thuộc thời gian để không lộ token qua thời gian phản hồi. */
function sameToken(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireBearer(expectedToken) {
  return (req, _res, next) => {
    const header = String(req.get('authorization') || '');
    if (!header.startsWith('Bearer ')) {
      return next(unauthorized('Thiếu Authorization: Bearer.'));
    }
    if (!sameToken(header.slice(7).trim(), expectedToken)) {
      return next(unauthorized('Token gateway không đúng.'));
    }
    next();
  };
}
