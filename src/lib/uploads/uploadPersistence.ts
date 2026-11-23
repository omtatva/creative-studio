import type { EnginePersistence, PersistedUpload } from "@/lib/uploads/multipartEngine";

/**
 * Survives a page refresh / browser restart: which multipart uploads were in flight and which parts are done, kept in IndexedDB.
 *
 * It stores IDENTIFIERS ONLY — session id, workspace/project/file ids, name, size, part layout, completed part numbers, the file's identity hashes. It never
 * stores a Firebase token, a signed URL or any credential, and never the file's bytes. The browser loses its File object on refresh, so a restored upload
 * waits for the user to pick the file again (checked against the stored name/size/mtime/content hashes); the SERVER is asked which parts it already holds,
 * and only the missing parts are sent.
 */

export interface StoredUpload extends PersistedUpload {
  userId: string;
  workspaceName: string;
  stageId: string | null;
  newVersionOfId: string | null;
}

const DB_NAME = "feedo-uploads";
const STORE = "sessions";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "sessionId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null); // private mode / blocked: persistence is a bonus, uploads still work
    }
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export const uploadPersistence = {
  save: async (record: StoredUpload): Promise<void> => {
    await run("readwrite", (s) => s.put(record));
  },
  remove: async (sessionId: string): Promise<void> => {
    await run("readwrite", (s) => s.delete(sessionId));
  },
  /** Everything this user left unfinished, dropping sessions that have expired server-side. */
  listFor: async (userId: string): Promise<StoredUpload[]> => {
    const all = ((await run("readonly", (s) => s.getAll())) ?? []) as StoredUpload[];
    const mine = all.filter((r) => r.userId === userId);
    for (const r of mine) if (r.expiresAt < Date.now()) void uploadPersistence.remove(r.sessionId);
    return mine.filter((r) => r.expiresAt >= Date.now());
  },
};

/** An EnginePersistence bound to the extra context the engine itself doesn't know. */
export function persistenceFor(ctx: { userId: string; workspaceName: string; stageId: string | null; newVersionOfId: string | null }): EnginePersistence {
  return {
    save: (record) => uploadPersistence.save({ ...record, ...ctx }),
    remove: (sessionId) => uploadPersistence.remove(sessionId),
  };
}
