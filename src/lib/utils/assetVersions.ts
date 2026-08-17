import { ProjectFile } from "@/types/file.types";

export interface AssetGroup {
  groupId: string;
  latest: ProjectFile;
  versions: ProjectFile[]; // all versions, newest first (including `latest`)
}

/**
 * Groups a flat `files` list (as returned by useFiles/getProjectFiles)
 * into one entry per creative asset, newest version first. Files
 * uploaded before versioning existed have no `assetGroupId` — those
 * fall back to grouping by their own `id`, so every legacy file still
 * renders as a single-version group with no data migration needed.
 */
export function groupAssetVersions(files: ProjectFile[]): AssetGroup[] {
  const groups = new Map<string, ProjectFile[]>();

  for (const file of files) {
    const groupId = file.assetGroupId || file.id;
    const existing = groups.get(groupId);
    if (existing) existing.push(file);
    else groups.set(groupId, [file]);
  }

  const result: AssetGroup[] = [];
  for (const [groupId, versions] of groups.entries()) {
    const sorted = [...versions].sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));
    const latest = sorted.find((v) => v.isLatestVersion) ?? sorted[0];
    if (!latest) continue; // unreachable — every group has at least one file — but keeps this total under noUncheckedIndexedAccess
    result.push({ groupId, latest, versions: sorted });
  }

  return result.sort((a, b) => (b.latest.createdAt > a.latest.createdAt ? 1 : -1));
}
