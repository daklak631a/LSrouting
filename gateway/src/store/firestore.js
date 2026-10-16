/**
 * Kho Firestore — dùng khi chạy thật trên Cloud Run.
 *
 * Firestore được chọn vì `reserve` cần một thao tác đọc-ghi nguyên tử giữa
 * nhiều bản sao. Không có tính chất này thì hai bản sao nhận cùng một lượt thử
 * lại sẽ cùng gọi nhà cung cấp, và khách nhận tin hai lần.
 *
 * Đặt TTL policy trên trường `expireAt` của collection để Firestore tự xóa
 * bản ghi cũ:
 *   gcloud firestore fields ttls update expireAt \
 *     --collection-group=ls_gateway --enable-ttl
 */
export async function createFirestoreStore({ collection = 'ls_gateway', ttlDays = 45 } = {}) {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore();
  const col = db.collection(collection);
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

  // Firestore không nhận '/' trong document id; khóa của LS-Routing chỉ chứa
  // ':' và ký tự an toàn, nhưng mã hóa cho chắc.
  const docId = (key) => 'idem_' + Buffer.from(String(key)).toString('base64url');

  return {
    driver: 'firestore',

    async reserve(key) {
      const ref = col.doc(docId(key));
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          const data = snap.data();
          if (data.state === 'DONE') return { state: 'DONE', messageId: data.messageId };
          return { state: 'IN_FLIGHT' };
        }
        tx.set(ref, {
          state: 'IN_FLIGHT',
          messageId: '',
          createdAt: new Date()
        });
        return { state: 'NEW' };
      });
    },

    async complete(key, messageId) {
      await col.doc(docId(key)).set({
        state: 'DONE',
        messageId: String(messageId),
        completedAt: new Date(),
        expireAt: new Date(Date.now() + ttlMs)
      }, { merge: true });
    },

    async release(key) {
      const ref = col.doc(docId(key));
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().state === 'IN_FLIGHT') tx.delete(ref);
      });
    },

    async get(name) {
      const snap = await col.doc('state_' + name).get();
      return snap.exists ? snap.data().value : null;
    },

    async set(name, value) {
      await col.doc('state_' + name).set({ value, updatedAt: new Date() });
    },

    async close() {
      await db.terminate();
    }
  };
}
