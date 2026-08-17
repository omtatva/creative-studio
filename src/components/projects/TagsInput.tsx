"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

/** Simple comma/enter-delimited tag input backing Project.tags — used both in the create/edit form and as a search facet. */
export function TagsInput({ value, onChange, placeholder }: TagsInputProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-theme border border-border bg-surface px-2.5 py-1.5",
        "focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary"
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3 text-foreground-muted hover:text-foreground" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder ?? "Add tags..." : undefined}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
      />
    </div>
  );
}
