"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Tags,
  Handshake,
  Flag,
  Settings2,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";

// Matches the exact Super Admin nav tree from the platform's two-level
// administration model (see lib/constants/itSupport.ts) — one flat
// list, not grouped like SettingsNav, since every item here is
// platform-wide rather than belonging to sub-categories of one
// workspace's settings.
const ITEMS = [
  { href: ROUTES.superAdmin, label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: ROUTES.superAdminCustomers, label: "Customers / Workspaces", icon: Building2 },
  { href: ROUTES.superAdminUsers, label: "Users", icon: Users },
  { href: ROUTES.superAdminBilling, label: "Billing", icon: CreditCard },
  { href: ROUTES.superAdminPlans, label: "Plans", icon: Tags },
  { href: ROUTES.superAdminSales, label: "Sales", icon: Handshake },
  { href: ROUTES.superAdminFeatures, label: "Features", icon: Flag },
  { href: ROUTES.superAdminPlatformSettings, label: "Platform Settings", icon: Settings2 },
  { href: ROUTES.superAdminAuditLogs, label: "Audit Logs", icon: ScrollText },
];

/** Left-hand sub-nav for the entire /super-admin section — mirrors SettingsNav's pattern but flat, and gated one level up (see super-admin/layout.tsx) rather than per-item. */
export function SuperAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-full shrink-0 space-y-0.5 lg:w-56">
      {ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-theme px-2.5 py-2 text-sm font-medium",
              isActive ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
