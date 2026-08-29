"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  KanbanSquare,
  Paperclip,
  MessageSquareText,
  Download,
  Users,
  CalendarDays,
  Activity,
  Bell,
  Sparkles as AIIcon,
  Settings,
  ShieldCheck,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/store/useUIStore";
import { ROUTES } from "@/lib/constants/routes";
import { useNotifications } from "@/hooks/useNotifications";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { Avatar } from "@/components/ui/Avatar";
import { DEFAULT_SIDEBAR_CONFIG, DEFAULT_FIELD_SECURITY_SETTINGS } from "@/lib/constants/settingsDefaults";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

/**
 * Primary navigation. Collapses to icon-only on desktop (persisted
 * in useUIStore) and becomes an off-canvas drawer on mobile. Every
 * item routes to a real, working page — Board is a project picker
 * (a board belongs to one project), the rest are workspace-wide.
 *
 * Visibility/order/labels are NOT hardcoded here — they're read
 * from settings.sidebarConfig (see the Access Control settings
 * page's "Page Access" section) and settings.fieldSecurity, so an
 * admin hiding a module actually removes it from every member's
 * sidebar rather than just toggling a setting nobody enforces.
 */
const NAV_ITEMS = [
  { key: "dashboard", href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { key: "projects", href: ROUTES.projects, label: "Projects", icon: FolderKanban },
  { key: "tasks", href: ROUTES.tasks, label: "My Tasks", icon: CheckSquare },
  { key: "board", href: ROUTES.board, label: "Board", icon: KanbanSquare },
  { key: "files", href: ROUTES.files, label: "Files", icon: Paperclip },
  { key: "reviews", href: ROUTES.reviews, label: "Reviews", icon: MessageSquareText },
  { key: "downloads", href: ROUTES.downloads, label: "Downloads", icon: Download },
  { key: "team", href: ROUTES.team, label: "Team", icon: Users },
  { key: "calendar", href: ROUTES.calendar, label: "Calendar", icon: CalendarDays },
  { key: "activity", href: ROUTES.activity, label: "Activity", icon: Activity },
  { key: "notifications", href: ROUTES.notifications, label: "Notifications", icon: Bell },
  { key: "aiStudio", href: ROUTES.aiStudio, label: "AI Studio", icon: AIIcon },
  { key: "settings", href: ROUTES.settings, label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const { settings } = useWorkspaceSettings();
  const { workspace } = useWorkspaceContext();
  const { profile } = useAuthContext();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const isSuperAdmin = isSuperAdminUser(profile);
  const isCollapsed = useUIStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isMobileNavOpen = useUIStore((s) => s.isMobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen, setMobileNavOpen]);

  const sidebarConfig = settings?.sidebarConfig ?? DEFAULT_SIDEBAR_CONFIG;
  const fieldSecurity = settings?.fieldSecurity ?? DEFAULT_FIELD_SECURITY_SETTINGS;

  const forcedHidden: Record<string, boolean> = {
    reviews: fieldSecurity.hideReviews,
    aiStudio: fieldSecurity.hideAI,
    // A normal project member has no workspace-administration role —
    // Settings (Branding, AI, Access Control, Users, Roles, ...) is
    // owner/admin territory. Hiding the nav entry keeps their view
    // scoped to their actual projects, matching the intended model
    // ("Normal Employee: NO workspace administration"). The
    // underlying settings data was already owner/admin-gated by
    // Firestore rules and canManageWorkspace checks on each settings
    // sub-page before this — this only removes the entry point, it
    // doesn't newly restrict anything that was actually reachable.
    settings: !isLoadingRole && !canManageWorkspace,
  };

  // Per-workspace branding (settings.branding.logoUrl), NOT the app's
  // own static logo — this is the whole point of the Branding page's
  // logo upload actually being used somewhere. Falls back to a
  // generated initial (see Avatar.tsx) when the workspace has no
  // custom logo, never a broken image. Cache-busted off the settings
  // doc's own updatedAt so re-uploading a new logo to the same fixed
  // Storage path (see workspaceBrandingLogoRef) is reflected
  // immediately instead of showing a browser-cached stale image.
  const workspaceName = workspace?.name || workspace?.companyName || "Omtatva Digitals";
  const brandingLogoUrl = settings?.branding.logoUrl
    ? `${settings.branding.logoUrl}${settings.branding.logoUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(settings.updatedAt ?? "")}`
    : null;

  const visibleItems = NAV_ITEMS
    .map((item) => {
      const config = sidebarConfig.items.find((c) => c.key === item.key);
      return {
        ...item,
        label: config?.label || item.label,
        isHidden: (config?.isHidden ?? false) || (forcedHidden[item.key] ?? false),
        isDisabled: config?.isDisabled ?? false,
        order: config?.order ?? 999,
      };
    })
    .filter((item) => !item.isHidden)
    .sort((a, b) => a.order - b.order);

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center gap-2 px-4 pt-4", isCollapsed && "justify-center px-0")}>
        {brandingLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandingLogoUrl} alt={workspaceName} className="h-8 w-8 shrink-0 rounded-theme object-cover" />
        ) : (
          <Avatar name={workspaceName} size="sm" />
        )}
        {!isCollapsed && (
          <span className="truncate text-[13px] font-semibold tracking-[0.08em] text-foreground">{workspaceName.toUpperCase()}</span>
        )}
        <button
          className="ml-auto rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isCollapsed && (
        <div className="px-3 pb-3 pt-2">
          <WorkspaceSwitcher variant="sidebar" />
        </div>
      )}

      <nav className="flex-1 space-y-1 px-2 py-2">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const showBadge = item.href === ROUTES.notifications && unreadCount > 0;
          const isAIStudio = item.key === "aiStudio";
          return (
            <Link
              key={item.key}
              href={item.isDisabled ? "#" : item.href}
              aria-disabled={item.isDisabled}
              className={cn(
                "relative flex items-center gap-3 rounded-theme px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                item.isDisabled && "pointer-events-none opacity-40",
                isCollapsed && "justify-center px-0"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-accent"
                  transition={{ duration: 0.18 }}
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                />
              )}
              <span className="relative shrink-0">
                {isAIStudio && !isActive && (
                  <span className="absolute inset-0 -m-1 rounded-full bg-primary/20 blur-[6px] motion-safe:animate-pulse" />
                )}
                <Icon className="relative h-4.5 w-4.5" />
                {showBadge && isCollapsed && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
              </span>
              {!isCollapsed && (
                <span className="flex flex-1 items-center justify-between truncate">
                  {item.label}
                  {showBadge && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {isSuperAdmin && (
        <div className="border-t border-border px-2 py-2">
          <Link
            href={ROUTES.superAdmin}
            className={cn(
              "flex items-center gap-3 rounded-theme px-3 py-2 text-sm font-medium transition-colors",
              pathname === ROUTES.superAdmin || pathname.startsWith(`${ROUTES.superAdmin}/`)
                ? "bg-primary/10 text-primary"
                : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
              isCollapsed && "justify-center px-0"
            )}
          >
            <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
            {!isCollapsed && "Super Admin"}
          </Link>
        </div>
      )}

      <button
        onClick={toggleSidebar}
        className="hidden items-center justify-center gap-2 border-t border-border py-3 text-xs text-foreground-muted hover:bg-surface-muted md:flex"
      >
        {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!isCollapsed && "Collapse"}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: isCollapsed ? 72 : 240 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="sticky top-0 hidden h-screen shrink-0 border-r border-border bg-sidebar md:block"
      >
        {content}
      </motion.aside>

      {/* Mobile off-canvas */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <motion.aside
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 top-0 h-full w-64 border-r border-border bg-sidebar"
          >
            {content}
          </motion.aside>
        </div>
      )}
    </>
  );
}
