import { Avatar } from "@/components/ui/Avatar";
import { ProjectMember } from "@/types/project.types";

/** Overlapping avatar stack with a "+N" overflow chip. */
export function ProjectMembersAvatarGroup({ members, max = 4 }: { members: ProjectMember[]; max?: number }) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((member) => (
        <div key={member.uid} className="ring-2 ring-surface rounded-full">
          <Avatar name={member.displayName} src={member.photoURL} size="sm" />
        </div>
      ))}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-foreground-muted ring-2 ring-surface">
          +{overflow}
        </div>
      )}
    </div>
  );
}
