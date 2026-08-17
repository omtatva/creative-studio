"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { cn } from "@/lib/utils/cn";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { Board, BoardAutoSortField, BoardCardSize } from "@/types/board.types";

interface BoardSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board;
  onSave: (patch: Partial<Pick<Board, "background" | "defaultCardSize" | "defaultColumnWidth" | "autoSortEnabled" | "autoSortField">>) => Promise<void>;
  isSubmitting: boolean;
}

const SORT_FIELDS: { value: BoardAutoSortField; label: string }[] = [
  { value: "manual", label: "Manual (drag order)" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
];

/** Shared, board-wide settings (spec's "Board Settings" section) — background, default card size, column width, auto sort. Per-user view density lives in BoardPreference instead (see the toolbar). */
export function BoardSettingsModal({ isOpen, onClose, board, onSave, isSubmitting }: BoardSettingsModalProps) {
  const [background, setBackground] = useState(board.background?.value ?? null);
  const [cardSize, setCardSize] = useState<BoardCardSize>(board.defaultCardSize);
  const [columnWidth, setColumnWidth] = useState(board.defaultColumnWidth);
  const [autoSortEnabled, setAutoSortEnabled] = useState(board.autoSortEnabled);
  const [autoSortField, setAutoSortField] = useState<BoardAutoSortField>(board.autoSortField);

  async function handleSave() {
    await onSave({
      background: background ? { type: "color", value: background } : null,
      defaultCardSize: cardSize,
      defaultColumnWidth: columnWidth,
      autoSortEnabled,
      autoSortField,
    });
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Board settings">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Background</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBackground(null)}
              className={cn("h-7 w-7 rounded-full border border-dashed border-border", !background && "ring-2 ring-foreground ring-offset-2 ring-offset-surface")}
            />
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setBackground(c)}
                className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface", background === c ? "ring-foreground" : "ring-transparent")}
                style={{ backgroundColor: `rgb(${c})` }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Default card size</p>
          <div className="flex gap-2">
            {(["sm", "md", "lg"] as BoardCardSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setCardSize(size)}
                className={cn("rounded-theme border px-3 py-1.5 text-xs font-medium uppercase", cardSize === size ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground-muted")}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Default column width (px)"
          type="number"
          min={200}
          max={480}
          value={columnWidth}
          onChange={(e) => setColumnWidth(Number(e.target.value))}
        />

        <div>
          <ToggleSwitch checked={autoSortEnabled} onChange={setAutoSortEnabled} label="Auto-sort cards" />
          {autoSortEnabled && (
            <select
              value={autoSortField}
              onChange={(e) => setAutoSortField(e.target.value as BoardAutoSortField)}
              className="mt-2 h-9 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {SORT_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSubmitting}>Save settings</Button>
        </div>
      </div>
    </Modal>
  );
}
