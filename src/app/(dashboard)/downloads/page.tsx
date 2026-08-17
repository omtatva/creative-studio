import { DownloadsPanel } from "@/components/downloads/DownloadsPanel";

export default function DownloadsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Downloads</h1>
        <p className="mt-1 text-sm text-foreground-muted">Approved deliverables, ready to download.</p>
      </div>
      <DownloadsPanel />
    </div>
  );
}
