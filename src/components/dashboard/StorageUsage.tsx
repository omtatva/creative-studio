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
  const { workspaceId } = useWorkspaceContext();
  const [usedBytes, setUsedBytes] = useState(0);
  const [limitBytes, setLimitBytes] = useState(5 * 1024 * 1024 * 1024);

  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceSettings(workspaceId).then((settings) => {
      if (settings) {
        setUsedBytes(settings.storage.usedBytes);
        setLimitBytes(settings.storage.limitBytes);
      }
    });
  }, [workspaceId]);

  const percent = Math.min(100, (usedBytes / limitBytes) * 100);

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
          {formatGb(usedBytes)} GB of {formatGb(limitBytes)} GB used
        </p>
      </Card>
    </Link>
  );
}
