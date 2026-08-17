"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Menu, LogOut, Settings, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SearchBar } from "@/components/ui/SearchBar";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useAuthContext } from "@/contexts/AuthContext";
import { useUIStore } from "@/store/useUIStore";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";

/**
 * Sticky top bar: mobile sidebar trigger, workspace switcher, global
 * search, notifications bell, and profile menu. The notification
 * dropdown now reuses NotificationsPanel — the same component that
 * renders the full /notifications page — reading the Foundation's
 * previously-unused per-user notification feed.
 */
export function Navbar() {
  const { profile } = useAuthContext();
  const { logout } = useAuth();
  const { unreadCount } = useNotifications();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useDismissableMenu<HTMLDivElement>(isNotifOpen, () => setIsNotifOpen(false));
  const profileRef = useDismissableMenu<HTMLDivElement>(isProfileOpen, () => setIsProfileOpen(false));

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-navbar/80 px-4 backdrop-blur-glass md:px-6">
      <button
        className="rounded-theme p-2 text-foreground-muted hover:bg-surface-muted md:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <WorkspaceSwitcher />

      <SearchBar containerClassName="hidden sm:block" placeholder="Search projects, tasks, files..." />

      <div className="ml-auto flex items-center gap-2">
        <div ref={notifRef} className="relative">
          <button
            className="relative rounded-theme p-2 text-foreground-muted hover:bg-surface-muted"
            onClick={() => setIsNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
          </button>
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-theme border border-border bg-cards p-3 shadow-soft-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <Link href={ROUTES.notifications} onClick={() => setIsNotifOpen(false)} className="text-xs font-medium text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <NotificationsPanel take={8} compact />
              </div>
            </div>
          )}
        </div>

        <div ref={profileRef} className="relative">
          <button
            className="flex items-center gap-2 rounded-theme p-1 pr-2 hover:bg-surface-muted"
            onClick={() => setIsProfileOpen((v) => !v)}
          >
            <Avatar name={profile?.displayName ?? "User"} src={profile?.photoURL} size="sm" />
            <ChevronDown className="hidden h-3.5 w-3.5 text-foreground-muted sm:block" />
          </button>
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-theme border border-border bg-cards p-1.5 shadow-soft-lg">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium text-foreground">{profile?.displayName}</p>
                <p className="truncate text-xs text-foreground-muted">{profile?.email}</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <MenuLink href={ROUTES.settings} icon={<UserIcon className="h-4 w-4" />}>
                Profile
              </MenuLink>
              <MenuLink href={ROUTES.settings} icon={<Settings className="h-4 w-4" />}>
                Settings
              </MenuLink>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-theme px-2.5 py-2 text-left text-sm text-error hover:bg-error/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-theme px-2.5 py-2 text-sm text-foreground hover:bg-surface-muted"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
