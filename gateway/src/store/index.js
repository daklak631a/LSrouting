import { createMemoryStore } from './memory.js';

export async function createStore(cfg) {
  if (cfg.driver === 'firestore') {
    const { createFirestoreStore } = await import('./firestore.js');
    return createFirestoreStore(cfg);
  }
  if (cfg.driver !== 'memory') {
    throw new Error(`STORE_DRIVER không hỗ trợ: ${cfg.driver}. Dùng memory hoặc firestore.`);
  }
  return createMemoryStore(cfg);
}
