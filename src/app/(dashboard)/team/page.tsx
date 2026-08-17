import { TeamPanel } from "@/components/team/TeamPanel";

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-foreground-muted">Everyone in your workspace. Manage roles from Settings &gt; Users.</p>
      </div>
      <TeamPanel />
    </div>
  );
}
