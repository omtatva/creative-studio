"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAIUsageLogs } from "@/hooks/useAIUsageLogs";
import { ROUTES } from "@/lib/constants/routes";
import { timeAgo } from "@/lib/utils/date";

/** Recent AI Studio generations — live Firestore data from ai_usage_logs, written by src/services/aiService.ts on every generate attempt. */
export function AIActivity() {
  const { logs, isLoading } = useAIUsageLogs(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Activity</CardTitle>
        {logs.length > 0 && (
          <Link href={ROUTES.aiStudio} className="text-xs font-medium text-primary hover:underline">
            Open AI Studio
          </Link>
        )}
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-theme bg-surface-muted" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-8 w-8" />} title="No generations yet" description="AI Studio activity will appear here." />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              {log.status === "succeeded" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{log.prompt}</span>
              <span className="shrink-0 text-xs text-foreground-muted">{timeAgo(log.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
