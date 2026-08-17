import { Project } from "@/types/project.types";

/**
 * Client-side export: serializes a project to JSON and triggers a
 * browser download. No server round-trip needed since the caller
 * already has the full Project object from the realtime subscription.
 */
export function exportProjectAsJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
