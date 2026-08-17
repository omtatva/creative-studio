import { FilesPanel } from "@/components/files/FilesPanel";

export default function FilesPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Files</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every file uploaded across your workspace&apos;s projects.</p>
      </div>
      <FilesPanel showProjectLink />
    </div>
  );
}
