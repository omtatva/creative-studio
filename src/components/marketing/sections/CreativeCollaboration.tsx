import { Check, MessageSquare, Play } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";

const CAPABILITIES = ["Projects", "Workspaces", "Stages", "Files", "Video Review", "Comments", "Tasks", "Approvals", "Versions"];

const SAMPLE_COMMENTS = [
  { name: "A. Rao", time: "0:14", text: "Logo needs to move slightly left.", resolved: true },
  { name: "S. Iyer", time: "0:23", text: "Love this transition — keep it.", resolved: false },
];

/**
 * An illustrative, non-interactive preview of the real Creative
 * Workspace review UI — built from placeholder names/copy, not a
 * live component instance (the real ReviewWorkspace has Firestore
 * hooks wired in and can't render for a logged-out visitor).
 */
export function CreativeCollaboration() {
  return (
    <SectionWrapper id="creative-collaboration" className="max-w-5xl">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Creative Collaboration</p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">Review, together, in one place.</h2>
        <p className="mt-4 text-base leading-relaxed text-foreground-muted">
          The product behind the philosophy: a full creative review workspace with frame-accurate video feedback, threaded
          comments, versioning and approvals — all connected to the same project.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-2">
        {CAPABILITIES.map((label) => (
          <Badge key={label} variant="default">
            {label}
          </Badge>
        ))}
      </div>

      <div className="mt-10 overflow-hidden rounded-theme border border-border/60 bg-cards/60 shadow-soft-lg backdrop-blur-glass">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          <div className="relative flex aspect-video items-center justify-center bg-background lg:col-span-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-secondary/15" />
            <button
              aria-hidden="true"
              tabIndex={-1}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-soft-lg"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
            <span className="absolute left-6 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/25" />
            <span className="absolute right-10 top-1/3 h-3 w-3 rounded-full bg-secondary ring-4 ring-secondary/25" />
            <div className="absolute bottom-4 left-4 right-4 h-1.5 rounded-full bg-foreground/10">
              <div className="h-full w-1/3 rounded-full bg-primary" />
            </div>
          </div>

          <div className="border-t border-border p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="h-4 w-4 text-primary" />
              Comments
            </div>
            <div className="mt-4 space-y-4">
              {SAMPLE_COMMENTS.map((comment) => (
                <div key={comment.name} className="flex gap-2.5">
                  <Avatar name={comment.name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium text-foreground">{comment.name}</p>
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{comment.time}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground-muted">{comment.text}</p>
                    {comment.resolved && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-success">
                        <Check className="h-3 w-3" /> Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-foreground-muted">Illustrative preview — not live project data.</p>
    </SectionWrapper>
  );
}
