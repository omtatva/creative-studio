import { doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { boardsCol, boardDoc, boardColumnsCol } from "@/lib/firebase/firestore";
import { getWorkspaceSettings } from "@/services/settingsService";
import { logBoardActivity } from "@/services/boardActivityService";
import { Board, BoardActor, BoardBackground, BoardAutoSortField, BoardCardSize } from "@/types/board.types";

/**
 * Board-level (not column-level) reads/writes. A board is created
 * lazily the first time a project's Board tab is opened — one board
 * per project, one column per workspace task status at that time.
 * Every function here is workspace-scoped, matching the rest of the
 * app's tenant-isolation pattern.
 */

export async function getBoardForProject(workspaceId: string, projectId: string): Promise<Board | null> {
  const q = query(boardsCol(), where("workspaceId", "==", workspaceId), where("projectId", "==", projectId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

/**
 * Idempotent get-or-create: if the project has no board yet, creates
 * one plus a BoardColumn for every non-archived status currently in
 * WorkspaceSettings.taskOptions.statuses (in their existing order),
 * satisfying "statuses come from Settings, never hardcoded."
 */
export async function getOrCreateBoard(
  workspaceId: string,
  projectId: string,
  createdBy: BoardActor
): Promise<Board> {
  const existing = await getBoardForProject(workspaceId, projectId);
  if (existing) return existing;

  const settings = await getWorkspaceSettings(workspaceId);
  const statuses = settings?.taskOptions.statuses ?? [];

  const boardRef = doc(boardsCol());
  const board: Omit<Board, "createdAt" | "updatedAt"> = {
    id: boardRef.id,
    workspaceId,
    projectId,
    name: "Board",
    background: null,
    defaultCardSize: "md",
    defaultColumnWidth: 280,
    autoSortEnabled: false,
    autoSortField: "manual",
    createdBy: createdBy.uid,
  };

  await setDoc(boardRef, { ...board, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await Promise.all(
    statuses.map((status, index) => {
      const columnRef = doc(boardColumnsCol());
      return setDoc(columnRef, {
        id: columnRef.id,
        boardId: boardRef.id,
        workspaceId,
        statusId: status.id,
        order: index,
        isHidden: false,
        isArchived: false,
        widthOverridePx: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    })
  );

  await logBoardActivity(boardRef.id, createdBy, "column_created", `set up the board with ${statuses.length} columns`);

  const snapshot = await getDoc(boardRef);
  return snapshot.data() as Board;
}

export async function updateBoardSettings(
  workspaceId: string,
  boardId: string,
  patch: Partial<{
    name: string;
    background: BoardBackground | null;
    defaultCardSize: BoardCardSize;
    defaultColumnWidth: number;
    autoSortEnabled: boolean;
    autoSortField: BoardAutoSortField;
  }>
): Promise<void> {
  const snapshot = await getDoc(boardDoc(boardId));
  if (!snapshot.exists() || snapshot.data().workspaceId !== workspaceId) {
    throw new Error("Board not found in this workspace.");
  }
  await updateDoc(boardDoc(boardId), { ...patch, updatedAt: serverTimestamp() } as never);
}
