/**
 * Kho trong bộ nhớ — dùng cho phát triển và kiểm thử.
 *
 * KHÔNG dùng ở môi trường thật khi chạy nhiều bản sao: mỗi bản sao có bộ nhớ
 * riêng nên khóa chống trùng không còn tác dụng giữa các bản sao.
 */
export function createMemoryStore({ ttlDays = 45 } = {}) {
  const keys = new Map();   // idem_key -> { state, messageId, at }
  const values = new Map(); // name -> value
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

  function sweep() {
    const cutoff = Date.now() - ttlMs;
    // An unresolved delivery stays reserved indefinitely. Expiring IN_FLIGHT
    // would let a late retry send a duplicate after a provider timeout.
    for (const [k, v] of keys) if (v.state === 'DONE' && v.at < cutoff) keys.delete(k);
  }

  return {
    driver: 'memory',

    async reserve(key) {
      sweep();
      const found = keys.get(key);
      if (found) {
        if (found.state === 'DONE') return { state: 'DONE', messageId: found.messageId };
        return { state: 'IN_FLIGHT' };
      }
      keys.set(key, { state: 'IN_FLIGHT', messageId: '', at: Date.now() });
      return { state: 'NEW' };
    },

    async complete(key, messageId) {
      keys.set(key, { state: 'DONE', messageId: String(messageId), at: Date.now() });
    },

    async release(key) {
      const found = keys.get(key);
      if (found && found.state === 'IN_FLIGHT') keys.delete(key);
    },

    async get(name) {
      return values.has(name) ? values.get(name) : null;
    },

    async set(name, value) {
      values.set(name, value);
    },

    async close() {}
  };
}
