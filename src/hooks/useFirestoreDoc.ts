"use client";

import { useEffect, useState } from "react";
import { onSnapshot, type DocumentReference } from "firebase/firestore";
import { AsyncState } from "@/types/common.types";

/**
 * Generic real-time single-document subscription. Any future page
 * (e.g. dashboard analytics, settings forms) can pass a typed
 * DocumentReference<T> and get live data + loading/error state
 * instead of hand-rolling onSnapshot everywhere.
 *
 * The effect keys on `ref?.path`, NOT the ref object itself:
 * `doc(db, ...)` builds a fresh DocumentReference on every call, so a
 * caller that doesn't memoize its ref (an easy mistake) would
 * otherwise make this re-subscribe on every render and loop. Keying on
 * the stable path string makes the hook safe for un-memoized callers.
 */
export function useFirestoreDoc<T>(ref: DocumentReference<T> | null): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, status: "idle", error: null });
  const path = ref?.path ?? null;

  useEffect(() => {
    if (!ref) {
      setState({ data: null, status: "idle", error: null });
      return;
    }
    setState((s) => (s.status === "loading" ? s : { ...s, status: "loading" }));
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setState({
          data: snapshot.exists() ? (snapshot.data() as T) : null,
          status: "success",
          error: null,
        });
      },
      (err) => {
        setState({ data: null, status: "error", error: err.message });
      }
    );
    return unsubscribe;
    // ref is intentionally excluded — see the doc comment above. `path`
    // uniquely identifies the document a ref points at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return state;
}
