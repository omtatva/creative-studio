"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Palette,
  Sliders,
  Users,
  ShieldCheck,
  Bell,
  HardDrive,
  Lock,
  FolderKanban,
  CheckSquare,
  MessageSquareText,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";

const GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: ROUTES.settingsWorkspace, label: "Workspace", icon: Building2 },
      { href: ROUTES.settingsBranding, label: "Branding", icon: Palette },
      { href: ROUTES.settingsTheme, label: "Theme", icon: Sliders },
    ],
  },
  {
    label: "People",
    items: [
      { href: ROUTES.settingsUsers, label: "Users", icon: Users },
      { href: ROUTES.settingsRoles, label: "Roles", icon: ShieldCheck },
      { href: ROUTES.settingsAccessControl, label: "Access Control", icon: KeyRound, ownerAdminOnly: true },
    ],
  },
  {
    label: "System",
    items: [
      { href: ROUTES.settingsNotifications, label: "Notifications", icon: Bell },
      { href: ROUTES.settingsStorage, label: "Storage", icon: HardDrive },
      { href: ROUTES.settingsSecurity, label: "Security", icon: Lock },
    ],
  },
  {
    label: "Defaults",
    items: [
      { href: ROUTES.settingsProject, label: "Project Settings", icon: FolderKanban },
      { href: ROUTES.settingsTask, label: "Task Settings", icon: CheckSquare },
      { href: ROUTES.settingsReview, label: "Review Settings", icon: MessageSquareText },
    ],
  },
];

/** Left-hand sub-nav for the entire /settings section. */
export function SettingsNav() {
  const pathname = usePathname();
  const { canManageWorkspace } = useCurrentMemberRole();

  return (
    <nav className="w-full shrink-0 space-y-6 lg:w-56">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items
              .filter((item) => !("ownerAdminOnly" in item && item.ownerAdminOnly) || canManageWorkspace)
              .map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-theme px-2.5 py-2 text-sm font-medium",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
