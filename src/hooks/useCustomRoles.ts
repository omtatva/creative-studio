"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { customRolesCol } from "@/lib/firebase/firestore";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { seedDefaultRolesIfEmpty } from "@/services/roleService";
import { CustomRole } from "@/types/workspace.types";

/** Realtime roles list — seeds the 8 named default roles once per workspace if none exist yet (see roleService.seedDefaultRolesIfEmpty). */
export function useCustomRoles() {
  const { workspaceId } = useWorkspaceContext();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setRoles([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    seedDefaultRolesIfEmpty(workspaceId).catch((err) => console.error("[useCustomRoles] seedDefaultRolesIfEmpty failed:", err));
    const q = query(customRolesCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRoles(snapshot.docs.map((d) => d.data()));
      setIsLoading(false);
    });
    return unsubscribe;
  }, [workspaceId]);

  return {
    roles: roles.filter((r) => !r.isArchived),
    archivedRoles: roles.filter((r) => r.isArchived),
    isLoading,
  };
}
