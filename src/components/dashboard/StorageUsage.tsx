"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { getWorkspaceSettings } from "@/services/settingsService";
import { ROUTES } from "@/lib/constants/routes";

function formatGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

/** Reads the real storage.usedBytes/limitBytes from WorkspaceSettings — updated by fileService on every upload/delete. */
export function StorageUsage() {
  const { workspaceId, workspace } = useWorkspaceContext();
  const [usedBytes, setUsedBytes] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceSettings(workspaceId).then((settings) => {
      if (settings) setUsedBytes(settings.storage.usedBytes);
    });
  }, [workspaceId]);

  // The limit is the workspace's PLAN limit (what uploads are actually checked against), not the old fixed 5 GB default. The
  // server-maintained counter is the truth for "used" when it exists.
  const planLimit = workspace?.limits?.maxStorageBytes;
  const limitBytes = typeof planLimit === "number" ? planLimit : 5 * 1024 * 1024 * 1024;
  const counter = (workspace as unknown as { storageBytesUsed?: number } | null)?.storageBytesUsed;
  const shownUsed = typeof counter === "number" ? counter : usedBytes;
  const percent = Number.isFinite(limitBytes) ? Math.min(100, (shownUsed / limitBytes) * 100) : 0;

  return (
    <Link href={ROUTES.settingsStorage}>
      <Card className="transition-colors hover:bg-surface-muted">
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
          <HardDrive className="h-4 w-4 text-foreground-muted" />
        </CardHeader>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-foreground-muted">
          {formatGb(shownUsed)} GB of {Number.isFinite(limitBytes) ? `${formatGb(limitBytes)} GB` : "unlimited"} used
        </p>
      </Card>
    </Link>
  );
}
