import { Globe, MonitorSmartphone, Workflow, Zap } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";
import { Badge } from "@/components/ui/Badge";

const ITEMS = [
  { icon: Globe, title: "Web Experiences", description: "Marketing sites and product surfaces built to load fast and feel premium." },
  { icon: MonitorSmartphone, title: "Creative Platforms", description: "Purpose-built tools for teams that review, approve and ship creative work together." },
  { icon: Zap, title: "Interactive Products", description: "Applications where motion and interaction are part of the design, not an afterthought." },
  { icon: Workflow, title: "AI-Assisted Workflows", description: "Structured, assistive tooling layered into the parts of a workflow where it actually helps." },
];

export function DigitalExperiences() {
  return (
    <SectionWrapper id="digital-experiences" className="bg-surface-muted/40">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="info">Digital Experiences</Badge>
        <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">What we build with it.</h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <div key={item.title} className="flex gap-4 rounded-theme border border-border/60 bg-cards/60 p-6 shadow-soft backdrop-blur-glass transition-colors duration-200 hover:border-primary/30">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-theme bg-secondary/10 text-secondary">
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
