import { Sparkles } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";
import { Badge } from "@/components/ui/Badge";

/**
 * Describes the AI Studio interface as it actually exists today
 * (see src/components/ai/AIStudioPanel.tsx — the workspace shell is
 * built, no generation provider is wired up yet). Copy is scoped to
 * that reality rather than implying live AI generation ships today.
 */
export function AIWorkspace() {
  return (
    <SectionWrapper id="ai-workspace" className="max-w-5xl">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <Badge variant="info">AI Workspace</Badge>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">A dedicated space for AI-assisted work.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-foreground-muted">
            Every workspace includes an AI Studio area — a home for briefs, prompts and generation workflows as they come
            online, kept in the same place as the rest of a project instead of scattered across separate tools.
          </p>
        </div>

        <div className="rounded-theme border border-border/60 bg-cards/60 p-6 shadow-soft backdrop-blur-glass">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Studio
          </div>
          <div className="mt-4 rounded-theme border border-dashed border-border bg-surface-muted/60 p-4">
            <div className="h-2.5 w-3/4 rounded-full bg-foreground-muted/20" />
            <div className="mt-2.5 h-2.5 w-1/2 rounded-full bg-foreground-muted/20" />
            <div className="mt-4 h-9 w-32 rounded-theme bg-primary/15" />
          </div>
          <p className="mt-4 text-xs text-foreground-muted">Interface ready — generation providers connect per workspace in Settings.</p>
        </div>
      </div>
    </SectionWrapper>
  );
}
