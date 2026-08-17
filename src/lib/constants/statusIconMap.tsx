import {
  Inbox,
  Circle,
  Loader,
  Eye,
  ThumbsUp,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Archive,
  Rocket,
  Bookmark,
  Clock,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the icon `key` strings on TaskStatusOption.icon (see
 * settings.types.ts / lib/constants/taskOptions.ts) to Lucide
 * components. Used anywhere a status/column icon renders — the
 * Kanban board column header, status pickers, etc. — so a status's
 * icon has exactly one definition (Settings), matching the same
 * pattern as lib/constants/projectIconMap.tsx.
 */
export const STATUS_ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  circle: Circle,
  loader: Loader,
  eye: Eye,
  "thumbs-up": ThumbsUp,
  "check-circle-2": CheckCircle2,
  "alert-triangle": AlertTriangle,
  flag: Flag,
  archive: Archive,
  rocket: Rocket,
  bookmark: Bookmark,
  clock: Clock,
};

export const STATUS_ICON_KEYS = Object.keys(STATUS_ICON_MAP);

export function getStatusIcon(key: string): LucideIcon {
  return STATUS_ICON_MAP[key] ?? Circle;
}
