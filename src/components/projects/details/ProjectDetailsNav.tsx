"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PROJECT_TABS, projectRoute } from "@/lib/constants/routes";

/** Nested tab nav for a single project — Overview/Tasks/Board/Files/Reviews/Activity/Members/Settings. */
export function ProjectDetailsNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {PROJECT_TABS.map((tab) => {
        const href = projectRoute(projectId, tab.key);
        const isActive = pathname === href;
        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </div>
  );
}
