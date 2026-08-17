"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PermissionMatrix } from "@/components/settings/PermissionMatrix";
import { PageAccessEditor } from "@/components/settings/PageAccessEditor";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useCustomRoles } from "@/hooks/useCustomRoles";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { updateRole } from "@/services/roleService";
import { DEFAULT_SIDEBAR_CONFIG, DEFAULT_FIELD_SECURITY_SETTINGS } from "@/lib/constants/settingsDefaults";
import { SidebarConfigSettings, FieldSecuritySettings } from "@/types/settings.types";

const WIDGET_LABELS: Record<string, string> = {
  welcomeBanner: "Welcome banner", analyticsCards: "Analytics cards", recentProjects: "Recent projects",
  pendingReviews: "Pending reviews", myTasks: "My tasks", recentActivity: "Recent activity",
  aiActivity: "AI activity", quickActions: "Quick actions", storageUsage: "Storage usage",
};

const FIELD_TOGGLES: { key: keyof FieldSecuritySettings; label: string; wired: boolean }[] = [
  { key: "hideStorage", label: "Hide Storage", wired: true },
  { key: "hideReviews", label: "Hide Reviews", wired: true },
  { key: "hideAI", label: "Hide AI", wired: true },
  { key: "hideSalary", label: "Hide Salary", wired: false },
  { key: "hideCost", label: "Hide Cost", wired: false },
  { key: "hideBilling", label: "Hide Billing", wired: false },
];

/**
 * Everything here is dynamic — no hardcoded permission list
 * (PERMISSION_CATALOG is generated from PERMISSION_MODULES ×
 * PERMISSION_ACTIONS) and no hardcoded roles (roles come from
 * useCustomRoles, the same Firestore-backed roles the Roles page
 * manages). This page edits the SAME CustomRole.permissions array
 * Roles' form modal edits — one role, one permissions field, two
 * different editing surfaces.
 */
export default function AccessControlPage() {
  const { roles, isLoading: isLoadingRoles } = useCustomRoles();
  const { settings, isLoading: isLoadingSettings, save } = useWorkspaceSettings();
  const { canManageWorkspace, isLoading: isLoadingRole } = useCurrentMemberRole();
  const toast = useToast();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [sidebarDraft, setSidebarDraft] = useState<SidebarConfigSettings>(DEFAULT_SIDEBAR_CONFIG);
  const [fieldDraft, setFieldDraft] = useState<FieldSecuritySettings>(DEFAULT_FIELD_SECURITY_SETTINGS);
  const [isSavingSidebar, setIsSavingSidebar] = useState(false);

  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (settings) {
      setSidebarDraft(settings.sidebarConfig ?? DEFAULT_SIDEBAR_CONFIG);
      setFieldDraft(settings.fieldSecurity ?? DEFAULT_FIELD_SECURITY_SETTINGS);
    }
  }, [settings]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  async function handleTogglePermission(key: string) {
    if (!selectedRole) return;
    const next = selectedRole.permissions.includes(key)
      ? selectedRole.permissions.filter((k) => k !== key)
      : [...selectedRole.permissions, key];
    try {
      await updateRole(selectedRole.id, { permissions: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update permission");
    }
  }

  async function handleToggleModule(moduleKeys: string[], grantAll: boolean) {
    if (!selectedRole) return;
    const withoutModule = selectedRole.permissions.filter((k) => !moduleKeys.includes(k));
    const next = grantAll ? [...withoutModule, ...moduleKeys] : withoutModule;
    try {
      await updateRole(selectedRole.id, { permissions: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update permissions");
    }
  }

  async function handleSaveSidebar() {
    setIsSavingSidebar(true);
    try {
      await save({ sidebarConfig: sidebarDraft, fieldSecurity: fieldDraft });
      toast.success("Access control settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    } finally {
      setIsSavingSidebar(false);
    }
  }

  if (isLoadingSettings || isLoadingRole) return <Loader label="Loading access control..." />;

  if (!canManageWorkspace) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
        <p className="text-sm text-foreground-muted">Only workspace owners and admins can view this page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
        <p className="mt-1 text-sm text-foreground-muted">Module permissions, page visibility, and field-level security.</p>
      </div>

      <SettingsSection title="Module permissions" description="Pick a role, then grant permissions per module and action.">
        {isLoadingRoles ? (
          <Loader label="Loading roles..." />
        ) : (
          <div className="flex flex-col gap-4">
            <select
              value={selectedRoleId ?? ""}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="h-10 w-full max-w-xs rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>

            {selectedRole && (
              <PermissionMatrix granted={selectedRole.permissions} onToggle={handleTogglePermission} onToggleModule={handleToggleModule} />
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Page access"
        description="Hide, disable, rename, or reorder sidebar items — applied to every member's sidebar."
        action={<Button size="sm" onClick={handleSaveSidebar} isLoading={isSavingSidebar}>Save changes</Button>}
      >
        <PageAccessEditor items={sidebarDraft.items} onChange={(items) => setSidebarDraft({ ...sidebarDraft, items })} />
      </SettingsSection>

      <SettingsSection title="Dashboard widgets" description="Hide individual dashboard widgets workspace-wide.">
        <div className="flex flex-col gap-3">
          {sidebarDraft.widgets.map((widget) => (
            <ToggleSwitch
              key={widget.key}
              checked={!widget.isHidden}
              onChange={(checked) =>
                setSidebarDraft({
                  ...sidebarDraft,
                  widgets: sidebarDraft.widgets.map((w) => (w.key === widget.key ? { ...w, isHidden: !checked } : w)),
                })
              }
              label={WIDGET_LABELS[widget.key] ?? widget.key}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Field-level security" description="Hide entire feature areas workspace-wide.">
        <div className="flex flex-col gap-4">
          {FIELD_TOGGLES.map(({ key, label, wired }) => (
            <div key={key}>
              <ToggleSwitch checked={fieldDraft[key]} onChange={(v) => setFieldDraft({ ...fieldDraft, [key]: v })} label={label} />
              {!wired && <p className="mt-1 text-xs text-foreground-muted">No corresponding data exists in this app yet — stored for future use, not currently enforced.</p>}
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
