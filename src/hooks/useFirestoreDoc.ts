"use client";

import { useEffect, useState } from "react";
import { onSnapshot, type DocumentReference } from "firebase/firestore";
import { AsyncState } from "@/types/common.types";

/**
 * Generic real-time single-document subscription. Any future page
 * (e.g. dashboard analytics, settings forms) can pass a typed
 * DocumentReference<T> and get live data + loading/error state
 * instead of hand-rolling onSnapshot everywhere.
 */
export function useFirestoreDoc<T>(ref: DocumentReference<T> | null): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, status: "idle", error: null });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, status: "idle", error: null });
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));
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
  }, [ref]);

  return state;
}
