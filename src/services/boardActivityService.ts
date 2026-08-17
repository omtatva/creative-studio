import { addDoc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { boardActivityCol } from "@/lib/firebase/firestore";
import { BoardActivityAction, BoardActor } from "@/types/board.types";

/**
 * Append-only per-board audit trail (boards/{boardId}/activity) —
 * covers column management and board-level task movement, distinct
 * from the per-task activity log in taskActivityService.ts (which
 * still separately records "status_changed" on the task itself when
 * a card is dragged between columns, since that's a real task-level
 * event too). This is the feed the spec's Board > Activity panel
 * reads from.
 */
export async function logBoardActivity(
  boardId: string,
  actor: BoardActor,
  action: BoardActivityAction,
  message: string
): Promise<void> {
  await addDoc(boardActivityCol(boardId), {
    actor,
    action,
    message,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getBoardActivity(boardId: string, take = 50) {
  const q = query(boardActivityCol(boardId), orderBy("createdAt", "desc"), limit(take));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
