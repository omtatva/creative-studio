import { Film, Layers3, Palette } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";

/**
 * Illustrative capability showcase, not a live Firestore query —
 * workspace-scoped collections are rules-gated to members only (see
 * firestore.rules), so a logged-out visitor can't read real project
 * data, and publicly displaying a real customer's work without
 * consent would be a privacy problem regardless. Framed as "what
 * teams build", not "these are our clients".
 */
const SHOWCASE = [
  { icon: Film, title: "Brand Film Review", tag: "Video Production", gradient: "from-primary/25 to-secondary/10" },
  { icon: Palette, title: "Campaign Design System", tag: "Creative Production", gradient: "from-secondary/25 to-primary/10" },
  { icon: Layers3, title: "Product Launch Microsite", tag: "Digital Experience", gradient: "from-accent/25 to-primary/10" },
];

export function FeaturedWork() {
  return (
    <SectionWrapper id="featured-work">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Featured Work</p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">The kind of work teams build with Omtatva.</h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {SHOWCASE.map((item) => (
          <div key={item.title} className="overflow-hidden rounded-theme border border-border/60 bg-cards/60 shadow-soft backdrop-blur-glass transition-colors duration-200 hover:border-primary/30">
            <div className={`flex aspect-[4/3] items-center justify-center bg-gradient-to-br ${item.gradient}`}>
              <item.icon className="h-8 w-8 text-foreground/70" />
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-foreground-muted">{item.tag}</p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">{item.title}</h3>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-foreground-muted">Illustrative examples — not live project data.</p>
    </SectionWrapper>
  );
}
