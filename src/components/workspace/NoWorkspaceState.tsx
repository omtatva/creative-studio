import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

interface NoWorkspaceStateProps {
  onCreateWorkspace: () => void;
}

/**
 * "USER → WORKSPACE → PROJECT": a project can never exist without a
 * workspace, so any workspace-dependent page renders this instead
 * of a broken/empty version of itself when there's no active
 * workspace — never a non-functional "New Project" button with
 * nothing behind it.
 */
export function NoWorkspaceState({ onCreateWorkspace }: NoWorkspaceStateProps) {
  return (
    <EmptyState
      icon={<Building2 className="h-9 w-9" />}
      title="Create your workspace to get started."
      action={<Button onClick={onCreateWorkspace}>Create Workspace</Button>}
      className="py-20"
    />
  );
}
