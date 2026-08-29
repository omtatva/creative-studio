"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FolderKanban } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { getWorkspace, deleteWorkspaceAccess } from "@/services/workspaceService";
import { getWorkspaceMembers } from "@/services/userService";
import { getWorkspaceProjects } from "@/services/projectService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import { Workspace, Member } from "@/types/workspace.types";
import { Project } from "@/types/project.types";

/**
 * One workspace's detail view, reached by clicking a row on Super
 * Admin > Customers/Workspaces — Super-Admin-only, same gate as the
 * list page. Shows the project summary a Super Admin would actually
 * need to understand what's inside before acting on it, plus the same
 * type-to-confirm delete flow the workspace's own owner gets on
 * Settings > Workspace (see deleteWorkspaceAccess in
 * workspaceService.ts — an access cutoff, not a full data wipe, same
 * as there), now also reachable for a workspace the Super Admin
 * doesn't personally belong to.
 */
export default function SuperAdminCustomerDetailPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const router = useRouter();
  const { profile } = useAuthContext();
  const toast = useToast();
  const isSuperAdmin = isSuperAdminUser(profile);

  const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setIsLoadingDetail(true);
    Promise.all([getWorkspace(workspaceId), getWorkspaceMembers(workspaceId), getWorkspaceProjects(workspaceId)])
      .then(([ws, m, p]) => {
        if (cancelled) return;
        setWorkspace(ws);
        setMembers(m);
        setProjects(p);
      })
      .catch((err) => {
        console.error("[super-admin customer detail] failed to load:", err);
        if (!cancelled) setWorkspace(null);
      })
      .finally(() => !cancelled && setIsLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, workspaceId]);

  async function handleDelete() {
    if (!workspace) return;
    setIsDeleting(true);
    try {
      await deleteWorkspaceAccess(workspace.id);
      toast.success(`"${workspace.name}" deleted`);
      router.push(ROUTES.superAdminCustomers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this workspace");
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setDeleteConfirmText("");
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Workspace</h1>
        <p className="text-sm text-foreground-muted">Only the platform Super Admin can view this page.</p>
      </div>
    );
  }

  if (isLoadingDetail || workspace === undefined) return <Loader label="Loading workspace..." />;

  if (!workspace) {
    return (
      <ErrorState
        title="Workspace not found"
        message="It may have already been deleted."
        onRetry={() => router.push(ROUTES.superAdminCustomers)}
      />
    );
  }

  const owner = members.find((m) => m.userId === workspace.ownerId) ?? null;
  const activeProjects = projects.filter((p) => !p.isArchived);
  const archivedProjects = projects.filter((p) => p.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={ROUTES.superAdminCustomers} className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Customers / Workspaces
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{workspace.name}</h1>
          <Badge variant="info">{PLAN_DISPLAY_NAMES[workspace.plan]}</Badge>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          {workspace.companyName} · Created {formatDate(workspace.createdAt)}
        </p>
      </div>

      <SettingsSection title="Overview">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-foreground-muted">Owner</p>
            <p className="text-sm font-medium text-foreground">{owner?.displayName ?? "Unknown"}</p>
            <p className="text-xs text-foreground-muted">{owner?.email ?? workspace.ownerId}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Members</p>
            <p className="text-sm font-medium text-foreground">{members.length}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Projects</p>
            <p className="text-sm font-medium text-foreground">{projects.length}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Workspace URL</p>
            <p className="truncate text-sm font-medium text-foreground">{workspace.slug}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={`Projects (${projects.length})`} description={`${activeProjects.length} active · ${archivedProjects.length} archived`}>
        {projects.length === 0 ? (
          <EmptyState icon={<FolderKanban className="h-8 w-8" />} title="No projects yet" description="This workspace hasn't created any projects." />
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <div key={project.id} className="flex items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                    {project.isArchived && <Badge variant="default">Archived</Badge>}
                  </div>
                  <p className="text-xs text-foreground-muted">
                    {project.members.length} member{project.members.length === 1 ? "" : "s"} · Updated {formatDate(project.updatedAt)}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-foreground-muted">{project.progress}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Danger zone" description="Irreversible — think before you click.">
        <div className="flex items-center justify-between gap-4 rounded-theme border border-error/30 bg-error/5 p-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Delete this workspace</p>
            <p className="text-xs text-foreground-muted">
              Removes it from every member&apos;s account immediately. Projects, files, and tasks are left in place but
              become unreachable — not permanently erased.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
            Delete workspace
          </Button>
        </div>
      </SettingsSection>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmText("");
        }}
        title="Delete this workspace?"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-theme border border-error/30 bg-error/5 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            <span>
              Every member loses access to <strong>{workspace.name}</strong> immediately. This can&apos;t be undone from here.
            </span>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-foreground">
            Type <strong>{workspace.name}</strong> to confirm
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={workspace.name} />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmText("");
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={isDeleting} disabled={deleteConfirmText !== workspace.name}>
              Delete workspace
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
