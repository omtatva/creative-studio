"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FolderKanban, CheckSquare, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { ROUTES } from "@/lib/constants/routes";

/** All three counts are live Firestore-backed workspace stats — no placeholder values. Each card links to the module it summarizes. */
export function AnalyticsCards() {
  const { allProjectsForCounts } = useProjects();
  const { allTasksForCounts } = useTasks();
  const { members } = useWorkspaceMembers();

  const activeProjectCount = allProjectsForCounts.filter((p) => !p.isArchived).length;
  const openTaskCount = allTasksForCounts.filter((t) => !t.isCompleted).length;

  const stats = [
    { label: "Active Projects", value: String(activeProjectCount), icon: FolderKanban, tint: "text-primary bg-primary/10", href: ROUTES.projects },
    { label: "Open Tasks", value: String(openTaskCount), icon: CheckSquare, tint: "text-secondary bg-secondary/10", href: ROUTES.tasks },
    { label: "Team Members", value: String(members.length), icon: Users, tint: "text-accent bg-accent/10", href: ROUTES.team },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.25, delay: i * 0.05 }}
        >
          <Link href={stat.href}>
            <Card className="transition-shadow hover:border-primary/30 hover:shadow-soft-lg">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-theme ${stat.tint}`}>
                <stat.icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-foreground-muted">{stat.label}</p>
            </Card>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
