"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Archive, Trash2, UserPlus, ArrowRightLeft, Link2, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface BoardCardContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMove: () => void;
  onAssign: () => void;
  taskId: string;
}

/** Right-click menu on a board card: Duplicate/Archive/Delete/Assign Member/Move Task/Copy Link, per spec. Portal-rendered so it isn't clipped by the column's overflow-scroll container. */
export function BoardCardContextMenu({ position, onClose, onDuplicate, onArchive, onDelete, onMove, onAssign, taskId }: BoardCardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("contextmenu", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleCopyLink() {
    const url = `${window.location.origin}/tasks/${taskId}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => onClose(), 600);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 100 }}
      className="w-48 rounded-theme border border-border bg-surface p-1.5 shadow-soft-lg"
    >
      <MenuItem icon={UserPlus} label="Assign member" onClick={() => { onAssign(); onClose(); }} />
      <MenuItem icon={ArrowRightLeft} label="Move task" onClick={() => { onMove(); onClose(); }} />
      <MenuItem icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); onClose(); }} />
      <MenuItem icon={copied ? Check : Link2} label={copied ? "Copied!" : "Copy link"} onClick={handleCopyLink} />
      <div className="my-1 h-px bg-border" />
      <MenuItem icon={Archive} label="Archive" onClick={() => { onArchive(); onClose(); }} />
      <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDelete(); onClose(); }} />
    </div>,
    document.body
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-theme px-2.5 py-2 text-left text-sm",
        danger ? "text-error hover:bg-error/10" : "text-foreground hover:bg-surface-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
