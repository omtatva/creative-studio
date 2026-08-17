/**
 * Turns a workspace/company name into a URL-safe, unique-ish slug.
 * Used at workspace creation time; uniqueness itself is enforced by
 * a Firestore query in workspaceService, not by this function.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
