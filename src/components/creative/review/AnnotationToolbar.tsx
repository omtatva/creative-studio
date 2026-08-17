"use client";

import { ArrowUpRight, Circle, Eraser, MessageSquarePlus, MousePointer2, Pencil, Square, Type } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AnnotationType } from "@/types/file.types";

export type AnnotationTool = "select" | "comment" | AnnotationType | "delete";

const TOOLS: { key: AnnotationTool; label: string; icon: typeof Circle }[] = [
  { key: "select", label: "Select", icon: MousePointer2 },
  { key: "comment", label: "Marker", icon: MessageSquarePlus },
  { key: "rectangle", label: "Rectangle", icon: Square },
  { key: "circle", label: "Circle", icon: Circle },
  { key: "arrow", label: "Arrow", icon: ArrowUpRight },
  { key: "freehand", label: "Draw", icon: Pencil },
  { key: "text", label: "Text", icon: Type },
];

/** Review-canvas annotation toolbar — Select/Marker/Rectangle/Circle/Arrow/Draw/Text + Delete, labeled pill buttons in a rounded floating strip. */
export function AnnotationToolbar({ active, onChange }: { active: AnnotationTool; onChange: (tool: AnnotationTool) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-soft-lg">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = active === tool.key;
        return (
          <button
            key={tool.key}
            onClick={() => onChange(tool.key)}
            title={tool.label}
            aria-label={tool.label}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              isActive ? "bg-primary text-white" : "text-foreground-muted hover:bg-surface-muted"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{tool.label}</span>
          </button>
        );
      })}

      <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

      <button
        onClick={() => onChange("delete")}
        title="Delete annotation"
        aria-label="Delete annotation"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          active === "delete" ? "bg-error text-white" : "text-foreground-muted hover:bg-error/10 hover:text-error"
        )}
      >
        <Eraser className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
