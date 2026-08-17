"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

export function WelcomeBanner() {
  const { profile } = useAuthContext();
  const { workspace } = useWorkspaceContext();
  const firstName = profile?.displayName?.split(" ")[0] ?? "there";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="bg-gradient-to-br from-primary/10 via-surface to-secondary/10">
        <p className="text-sm text-foreground-muted">Welcome back</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Hey {firstName}, here&apos;s what&apos;s happening at {workspace?.companyName ?? "your workspace"}.
        </h1>
      </Card>
    </motion.div>
  );
}
