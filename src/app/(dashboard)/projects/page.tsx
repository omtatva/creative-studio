"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { useProjectOptions } from "@/hooks/useProjectOptions";
import { useProjectActions } from "@/hooks/useProjectActions";
import { useUIStore } from "@/store/useUIStore";
import { SectionTabs } from "@/components/shared/SectionTabs";
import { ProjectListToolbar } from "@/components/projects/ProjectListToolbar";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { Pagination } from "@/components/shared/Pagination";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { EMPTY_PROJECT_FILTERS, PROJECT_SECTIONS, Project, ProjectSection } from "@/types/project.types";
import { ProjectFiltersPanel } from "@/components/projects/ProjectFiltersPanel";
import { ProjectFormValues } from "@/lib/validations/project.schema";
import { useToast } from "@/hooks/useToast";
import { CreateWorkspaceModal } from "@/components/workspace/CreateWorkspaceModal";
import { NoWorkspaceState } from "@/components/workspace/NoWorkspaceState";
import { ROUTES } from "@/lib/constants/routes";

function ProjectsPageContent() {
  const { firebaseUser } = useAuthContext();
  // USER → WORKSPACE → PROJECT: a project can never exist without an
  // active workspace. If there isn't one, this page shows
  // NoWorkspaceState instead of the toolbar/grid (see below) rather
  // than a functional-looking but broken "New Project" button.
  const { workspaceId } = useWorkspaceContext();
  const { options } = useProjectOptions();
  const {
    projects,
    totalCount,
    isLoading,
    error,
    retry,
    section,
    setSection,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,
    totalPages,
    pageSize,
    allProjectsForCounts,
  } = useProjects();
  const actions = useProjectActions();
  const { metricsByProject } = useProjectMetrics();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const viewMode = useUIStore((s) => s.projectViewMode);
  const setViewMode = useUIStore((s) => s.setProjectViewMode);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);

  const uid = firebaseUser?.uid ?? "";

  const counts = useMemo<Record<ProjectSection, number>>(() => {
    const active = allProjectsForCounts.filter((p) => !p.isArchived);
    return {
      all: active.length,
      recent: Math.min(active.length, 12),
      favorites: active.filter((p) => p.favoritedBy.includes(uid)).length,
      pinned: active.filter((p) => p.pinnedBy.includes(uid)).length,
      archived: allProjectsForCounts.filter((p) => p.isArchived).length,
    };
  }, [allProjectsForCounts, uid]);

  const activeFilterCount =
    filters.statusIds.length + filters.priorityIds.length + filters.ownerIds.length +
    (filters.dueBefore ? 1 : 0) + (filters.dueAfter ? 1 : 0) + (filters.createdAfter ? 1 : 0);

  const availableOwners = useMemo(() => {
    const map = new Map<string, Project["members"][number]>();
    allProjectsForCounts.forEach((p) => {
      const owner = p.members.find((m) => m.uid === p.ownerId);
      if (owner) map.set(owner.uid, owner);
    });
    return Array.from(map.values());
  }, [allProjectsForCounts]);

  function openCreateModal() {
    // NEW PROJECT BEHAVIOR: no active workspace → open Create Workspace
    // instead of attempting a doomed Firestore write. After the
    // workspace is created, automatically continue into the Project
    // form (see CreateWorkspaceModal's onCreated below) — no manual
    // refresh or return to Projects needed.
    if (!workspaceId) {
      setIsCreateWorkspaceOpen(true);
      return;
    }
    setEditingProject(null);
    setIsFormOpen(true);
  }

  // Lets the Dashboard's "New Project" quick action deep-link straight into
  // the creation flow (/projects?new=1) instead of just landing on the list,
  // matching the "New Project -> actual create flow" requirement. Strips the
  // param right after so refreshing/back-navigating doesn't reopen the modal.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openCreateModal();
      router.replace(ROUTES.projects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openEditModal(project: Project) {
    setEditingProject(project);
    setIsFormOpen(true);
  }

  async function handleFormSubmit(values: ProjectFormValues & { coverImageFile: File | null }) {
    if (editingProject) {
      const result = await actions.update(editingProject.id, {
        name: values.name,
        description: values.description,
        color: values.color,
        icon: values.icon,
        statusId: values.statusId,
        priorityId: values.priorityId,
        startDate: values.startDate,
        dueDate: values.dueDate,
        tags: values.tags,
      });
      if (result.error === null) {
        toast.success("Project updated");
        setIsFormOpen(false);
      } else {
        toast.error(result.error ?? "Couldn't update project. Please try again.");
      }
    } else {
      const result = await actions.create({
        name: values.name,
        description: values.description,
        color: values.color,
        icon: values.icon,
        statusId: values.statusId,
        priorityId: values.priorityId,
        startDate: values.startDate,
        dueDate: values.dueDate,
        tags: values.tags,
        coverImageFile: values.coverImageFile,
      });
      if (result.data) {
        toast.success("Project created");
        setIsFormOpen(false);
      } else {
        toast.error(result.error ?? "Couldn't create project. Please try again.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <p className="mt-1 text-sm text-foreground-muted">Everything your team is creating, in one place.</p>
        </div>
      </div>

      {!workspaceId ? (
        <NoWorkspaceState onCreateWorkspace={() => setIsCreateWorkspaceOpen(true)} />
      ) : (
        <>
          <SectionTabs items={PROJECT_SECTIONS} active={section} onChange={setSection} counts={counts} />

          <ProjectListToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sort={sort}
            onSortChange={setSort}
            activeFilterCount={activeFilterCount}
            onOpenFilters={() => setIsFiltersOpen(true)}
            onCreateProject={openCreateModal}
          />

          {error ? (
            <ErrorState title="Couldn't load projects" message={error} onRetry={retry} />
          ) : !isLoading && projects.length === 0 ? (
            <ProjectEmptyState
              section={section}
              hasSearchOrFilters={Boolean(searchQuery) || activeFilterCount > 0}
              onCreateProject={openCreateModal}
              onClearSearch={() => {
                setSearchQuery("");
                setFilters(EMPTY_PROJECT_FILTERS);
              }}
            />
          ) : (
            <>
              <ProjectGrid
                projects={projects}
                isLoading={isLoading}
                viewMode={viewMode}
                options={options}
                currentUid={uid}
                metricsByProject={metricsByProject}
                onEdit={openEditModal}
                onDuplicate={async (p) => {
                  const result = await actions.duplicate(p.id);
                  if (result.error === null) toast.success(`Duplicated "${p.name}"`);
                  else toast.error(result.error ?? "Couldn't duplicate project. Please try again.");
                }}
                onArchive={(p) => setArchiveTarget(p)}
            onRestore={async (p) => {
              const result = await actions.restore(p.id);
              if (result.error === null) toast.success("Project restored");
              else toast.error(result.error ?? "Couldn't restore project. Please try again.");
            }}
            onDelete={(p) => setDeleteTarget(p)}
            onToggleFavorite={async (p) => {
              const result = await actions.toggleFavorite(p.id, p.favoritedBy.includes(uid));
              if (result.error !== null) toast.error(result.error ?? "Couldn't update favorite. Please try again.");
            }}
            onTogglePinned={async (p) => {
              const result = await actions.togglePinned(p.id, p.pinnedBy.includes(uid));
              if (result.error !== null) toast.error(result.error ?? "Couldn't update pin. Please try again.");
            }}
          />

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} pageSize={pageSize} />
        </>
      )}
        </>
      )}

      <ProjectFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        project={editingProject}
        onSubmit={handleFormSubmit}
        isSubmitting={actions.isSubmitting}
      />

      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceOpen}
        onClose={() => setIsCreateWorkspaceOpen(false)}
        onCreated={() => {
          // After workspace creation: automatically continue to the
          // Project creation flow — no manual refresh or return to
          // Projects needed. workspaceId is already updated via
          // WorkspaceContext by the time this fires (create() awaits
          // refreshProfile() before calling onSuccess).
          setIsCreateWorkspaceOpen(false);
          setEditingProject(null);
          setIsFormOpen(true);
        }}
      />

      <ProjectFiltersPanel
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        options={options}
        availableOwners={availableOwners}
      />

      <ConfirmModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (archiveTarget) {
            const result = await actions.archive(archiveTarget.id);
            if (result.error === null) toast.success(`"${archiveTarget.name}" archived`);
            else toast.error(result.error ?? "Couldn't archive project. Please try again.");
          }
          setArchiveTarget(null);
        }}
        title="Archive project?"
        description={`"${archiveTarget?.name}" will move to the Archive section. You can restore it anytime.`}
        confirmLabel="Archive"
        isSubmitting={actions.isSubmitting}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            const result = await actions.remove(deleteTarget.id);
            if (result.error === null) toast.success(`"${deleteTarget.name}" deleted`);
            else toast.error(result.error ?? "Couldn't delete project. Please try again.");
          }
          setDeleteTarget(null);
        }}
        title="Delete project?"
        description={`This permanently deletes "${deleteTarget?.name}" and its cover image. This can't be undone.`}
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}
