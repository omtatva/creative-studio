/**
 * Small date-formatting helpers shared by project cards, rows, and
 * detail views. Kept dependency-free (no date-fns/dayjs) since the
 * formatting needs here are simple.
 */

/**
 * `Timestamps.createdAt`/`updatedAt` are typed as `string` (see
 * common.types.ts) but a document read straight from an `onSnapshot`
 * right after a `serverTimestamp()` write comes back as a Firestore
 * `Timestamp` instance, not a string — `new Date(timestamp)` on that
 * silently produces an Invalid Date. Duck-typing `.toDate` handles
 * both shapes without pulling in the Firestore SDK here. It also
 * comes back as `null` for the brief window between the optimistic
 * local write and the server assigning the real timestamp — treated
 * as "now" since that's what it resolves to a moment later.
 */
export function toDateSafe(value: string | Date | { toDate: () => Date } | null | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  return new Date(value as string);
}

/** Relative time ("5m ago", "2h ago") for activity/comment feeds — see toDateSafe for why this doesn't just do `new Date(iso)`. */
export function timeAgo(value: string | Date | { toDate: () => Date } | null | undefined): string {
  const minutes = Math.floor((Date.now() - toDateSafe(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDueDate(isoDate: string): string {
  const date = toDateSafe(isoDate);
  const now = new Date();
  const diffDays = Math.round((date.getTime() - stripTime(now)) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `Due in ${diffDays}d`;

  return `Due ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return toDateSafe(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isOverdue(isoDate: string | null): boolean {
  if (!isoDate) return false;
  return toDateSafe(isoDate).getTime() < stripTime(new Date());
}

function stripTime(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
