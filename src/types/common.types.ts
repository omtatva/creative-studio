/**
 * Shared primitive types used across the app.
 */

export type ID = string;

export interface Timestamps {
  createdAt: string; // ISO string (converted from Firestore Timestamp)
  updatedAt: string;
}

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  data: T | null;
  status: AsyncStatus;
  error: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  cursor: string | null;
}
