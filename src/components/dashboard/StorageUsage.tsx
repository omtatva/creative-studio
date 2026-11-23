"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { formatFileLimit } from "@/lib/constants/creativeFiles";
import { ROUTES } from "@/lib/constants/routes";

/** Dashboard storage widget — used and total both come from the resolved entitlement policy (no local fallback limit). */
export function StorageUsage() {
  const { entitlements } = useEntitlements();
  const used = entitlements?.storage.usedBytes ?? 0;
  const limit = entitlements?.storage.limitBytes ?? null;
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0;

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
          {entitlements ? `${formatFileLimit(used)} of ${limit ? formatFileLimit(limit) : "unlimited"} used` : "Loading..."}
        </p>
      </Card>
    </Link>
  );
}
