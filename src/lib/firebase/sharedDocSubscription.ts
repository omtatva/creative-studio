import { onSnapshot, type DocumentData, type DocumentReference } from "firebase/firestore";

/**
 * Ref-counted, shared single-document listener for tiny platform docs
 * that MANY components read at once (the Feature Access matrix is
 * checked per project card, per toolbar, ...). One real Firestore
 * listener per doc no matter how many subscribers; a late subscriber
 * gets the cached value immediately; the listener is torn down when the
 * last subscriber leaves.
 */
interface Entry<T> {
  unsubscribe: () => void;
  hasValue: boolean;
  value: T | null;
  error: Error | null;
  listeners: Set<{ onValue: (value: T | null) => void; onError: (err: Error) => void }>;
}

const entries = new Map<string, Entry<unknown>>();

export function subscribeSharedDoc<T extends DocumentData>(
  ref: DocumentReference<DocumentData>,
  onValue: (value: T | null) => void,
  onError: (err: Error) => void
): () => void {
  const key = ref.path;
  let entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) {
    const created: Entry<T> = { unsubscribe: () => {}, hasValue: false, value: null, error: null, listeners: new Set() };
    created.unsubscribe = onSnapshot(
      ref,
      (snap) => {
        created.hasValue = true;
        created.error = null;
        created.value = snap.exists() ? (snap.data() as T) : null;
        created.listeners.forEach((l) => l.onValue(created.value));
      },
      (err) => {
        created.error = err;
        created.listeners.forEach((l) => l.onError(err));
      }
    );
    entries.set(key, created as Entry<unknown>);
    entry = created;
  }

  const listener = { onValue, onError };
  entry.listeners.add(listener);
  if (entry.hasValue) onValue(entry.value);
  else if (entry.error) onError(entry.error);

  return () => {
    const current = entries.get(key) as Entry<T> | undefined;
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.unsubscribe();
      entries.delete(key);
    }
  };
}
