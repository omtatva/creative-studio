"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import { STATUS_ICON_KEYS, getStatusIcon } from "@/lib/constants/statusIconMap";
import { cn } from "@/lib/utils/cn";

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (label: string, color: string, icon: string) => Promise<void>;
  isSubmitting: boolean;
}

/** Creating a custom column adds a new TaskStatusOption to Settings AND a positioned BoardColumn — see boardColumnService.createCustomColumn. */
export function AddColumnModal({ isOpen, onClose, onCreate, isSubmitting }: AddColumnModalProps) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0] ?? "99 102 241");
  const [icon, setIcon] = useState(STATUS_ICON_KEYS[0] ?? "circle");

  async function handleSubmit() {
    if (!label.trim()) return;
    await onCreate(label.trim(), color, icon);
    setLabel("");
    setColor(COLOR_PALETTE[0] ?? "99 102 241");
    setIcon(STATUS_ICON_KEYS[0] ?? "circle");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New column">
      <div className="flex flex-col gap-4">
        <Input label="Column name" placeholder="e.g. Client Feedback" value={label} onChange={(e) => setLabel(e.target.value)} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Color</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface", color === c ? "ring-foreground" : "ring-transparent")}
                style={{ backgroundColor: `rgb(${c})` }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ICON_KEYS.map((key) => {
              const Icon = getStatusIcon(key);
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-theme border", icon === key ? "border-primary bg-primary/10" : "border-border hover:bg-surface-muted")}
                >
                  <Icon className="h-4 w-4" style={{ color: icon === key ? `rgb(${color})` : undefined }} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!label.trim()}>Create column</Button>
        </div>
      </div>
    </Modal>
  );
}
