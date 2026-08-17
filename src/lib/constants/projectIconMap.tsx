import {
  FolderKanban,
  Briefcase,
  Palette,
  Camera,
  Clapperboard,
  Megaphone,
  PenTool,
  LayoutTemplate,
  Sparkles,
  Rocket,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the icon `key` strings stored in
 * WorkspaceSettings.projectOptions.icons (and on Project.icon) to
 * actual Lucide components. Keys are plain strings in Firestore so
 * Settings can add/remove icons without shipping new component code;
 * this map is the only place that needs updating if a new icon key
 * is introduced.
 */
export const PROJECT_ICON_MAP: Record<string, LucideIcon> = {
  "folder-kanban": FolderKanban,
  briefcase: Briefcase,
  palette: Palette,
  camera: Camera,
  clapperboard: Clapperboard,
  megaphone: Megaphone,
  "pen-tool": PenTool,
  "layout-template": LayoutTemplate,
  sparkles: Sparkles,
  rocket: Rocket,
};

export function getProjectIcon(key: string): LucideIcon {
  return PROJECT_ICON_MAP[key] ?? FolderKanban;
}
