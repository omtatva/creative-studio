import { getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { boardPreferenceDoc } from "@/lib/firebase/firestore";
import { BoardCardSize, BoardPreference, BoardViewDensity, DEFAULT_BOARD_PREFERENCE } from "@/types/board.types";

/**
 * Per-user board view state (density, card size override, collapsed
 * columns) — read/written against the `${boardId}_${uid}` composite
 * doc, same id pattern as the `members` collection.
 */
export async function getOrCreateBoardPreference(workspaceId: string, boardId: string, uid: string): Promise<BoardPreference> {
  const ref = boardPreferenceDoc(boardId, uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return snapshot.data();

  const preference: Omit<BoardPreference, "createdAt" | "updatedAt"> = {
    id: `${boardId}_${uid}`,
    boardId,
    workspaceId,
    userId: uid,
    ...DEFAULT_BOARD_PREFERENCE,
  };
  await setDoc(ref, { ...preference, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { ...preference, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export async function updateBoardPreference(
  boardId: string,
  uid: string,
  patch: Partial<{ viewDensity: BoardViewDensity; cardSize: BoardCardSize | null; collapsedColumnIds: string[] }>
): Promise<void> {
  await updateDoc(boardPreferenceDoc(boardId, uid), { ...patch, updatedAt: serverTimestamp() } as never);
}

export async function toggleColumnCollapsed(boardId: string, uid: string, columnId: string, isCurrentlyCollapsed: boolean, current: string[]): Promise<void> {
  const next = isCurrentlyCollapsed ? current.filter((id) => id !== columnId) : [...current, columnId];
  await updateDoc(boardPreferenceDoc(boardId, uid), { collapsedColumnIds: next, updatedAt: serverTimestamp() });
}
