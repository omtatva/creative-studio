"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { membersCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Member } from "@/types/workspace.types";

/** Realtime workspace membership list — powers the Team page and any other workspace-wide member picker. */
export function useWorkspaceMembers() {
  const { workspaceId } = useWorkspaceContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(membersCol(), where("workspaceId", "==", workspaceId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMembers(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId]);

  return { members, isLoading };
}
