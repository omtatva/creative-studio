import { Badge } from "@/components/ui/Badge";
import { AssetStatus } from "@/types/file.types";

const LABEL: Record<AssetStatus, string> = {
  none: "Draft",
  pending_review: "In Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  archived: "Archived",
};

const VARIANT: Record<AssetStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  none: "default",
  pending_review: "info",
  approved: "success",
  changes_requested: "danger",
  archived: "default",
};

/** Renders the Creative Workspace's five-state asset lifecycle from the existing `ProjectFile.reviewStatus` field — see AssetStatus's doc comment in file.types.ts for why no separate status field exists. */
export function AssetStatusBadge({ status, className }: { status: AssetStatus; className?: string }) {
  return (
    <Badge variant={VARIANT[status]} className={className}>
      {LABEL[status]}
    </Badge>
  );
}
