"use client";

import { useState } from "react";
import { DownloadsPanel } from "@/components/downloads/DownloadsPanel";
import { DownloadHistoryPanel } from "@/components/downloads/DownloadHistoryPanel";

const TABS = [
  { id: "approved", label: "Approved deliverables" },
  { id: "history", label: "My download history" },
] as const;

export function DownloadsTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("approved");
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "approved" ? <DownloadsPanel /> : <DownloadHistoryPanel />}
    </div>
  );
}
