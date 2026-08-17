"use client";

import { cn } from "@/lib/utils/cn";
import { ProjectSection } from "@/types/project.types";

const SECTIONS: { key: ProjectSection; label: string }[] = [
  { key: "all", label: "All Projects" },
  { key: "recent", label: "Recent" },
  { key: "favorites", label: "Favorites" },
  { key: "pinned", label: "Pinned" },
  { key: "archived", label: "Archived" },
];

interface ProjectSectionTabsProps {
  active: ProjectSection;
  onChange: (section: ProjectSection) => void;
  counts: Record<ProjectSection, number>;
}

export function ProjectSectionTabs({ active, onChange, counts }: ProjectSectionTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {SECTIONS.map((section) => (
        <button
          key={section.key}
          onClick={() => onChange(section.key)}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
            active === section.key ? "text-primary" : "text-foreground-muted hover:text-foreground"
          )}
        >
          {section.label}
          <span className="text-xs text-foreground-muted">{counts[section.key]}</span>
          {active === section.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}
