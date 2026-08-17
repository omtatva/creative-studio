"use client";

import { useState } from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AssetStatusOption } from "@/types/settings.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface StatusDropdownProps {
  currentStatusId: string;
  statuses: AssetStatusOption[];
  canEdit: boolean;
  onSelect: (option: AssetStatusOption) => void;
  onOpenEditStatuses: () => void;
}

/**
 * Krock-style Status dropdown for the review workspace header —
 * reads/writes ProjectFile.statusId against the workspace-configured
 * option list (WorkspaceSettings.assetOptions, see useAssetOptions),
 * never a hardcoded enum. The currently selected option is always
 * shown even if since disabled, so a file never displays a blank status.
 */
export function StatusDropdown({ currentStatusId, statuses, canEdit, onSelect, onOpenEditStatuses }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  const current = statuses.find((s) => s.id === currentStatusId) ?? statuses[0];
  const visible = statuses.filter((s) => s.isEnabled || s.id === currentStatusId).sort((a, b) => a.order - b.order);

  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${current.color})` }} />
        {current.label}
        <ChevronDown className={cn("h-3 w-3 text-foreground-muted transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-theme border border-border bg-surface py-1 shadow-soft-lg">
          {visible.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onSelect(option);
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-muted"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${option.color})` }} />
              <span className="flex-1 text-foreground">{option.label}</span>
              {option.id === current.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}

          {canEdit && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenEditStatuses();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Edit statuses
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
