"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Lock, ShieldAlert, RotateCcw } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils/cn";
import { subscribeFeatureGrants, saveFeatureGrants } from "@/services/featureAccessService";
import {
  FEATURE_PERMISSIONS,
  FEATURE_GROUP_ORDER,
  FEATURE_ROLES,
  FEATURE_ROLE_LABEL,
  PLATFORM_CONTROLLED_PERMISSIONS,
  defaultFeatureGrants,
  resolveFeatureGrant,
  type FeatureGrants,
} from "@/lib/constants/featurePermissions";

type EditableRole = "admin" | "member";

/** Explicit, fully-materialized grants for every configurable permission — what the matrix shows and saves. */
function materialize(saved: FeatureGrants | null): FeatureGrants {
  const out = defaultFeatureGrants();
  for (const id of Object.keys(out)) {
    for (const role of ["admin", "member"] as const) {
      const v = saved?.[id]?.[role];
      if (typeof v === "boolean") out[id]![role] = v;
    }
  }
  return out;
}

const sameGrants = (a: FeatureGrants, b: FeatureGrants) =>
  Object.keys(a).every((id) => a[id]?.admin === b[id]?.admin && a[id]?.member === b[id]?.member);

/**
 * Super Admin > Feature Access — which workspace ROLE may use which product
 * capability. Edits a draft; nothing is saved until "Save Changes". Backed
 * by platform_settings/featureAccess (server-write-only) and enforced
 * server-side — see lib/constants/featurePermissions.ts. The hard-locked
 * platform permissions at the bottom have no checkboxes on purpose.
 */
export default function SuperAdminFeatureAccessPage() {
  const toast = useToast();
  const [saved, setSaved] = useState<FeatureGrants | null>(null);
  const [draft, setDraft] = useState<FeatureGrants | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let first = true;
    return subscribeFeatureGrants(
      (grants) => {
        setSaved(grants);
        // Seed the draft once; later snapshots (e.g. our own save echoing back) must not clobber unsaved edits.
        if (first) {
          first = false;
          setDraft(materialize(grants));
        }
      },
      (err) => {
        console.error("[super-admin/feature-access] failed to load:", err);
        toast.error("Couldn't load the saved feature access settings.");
        if (first) {
          first = false;
          setSaved(null);
          setDraft(materialize(null));
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedMaterialized = useMemo(() => materialize(saved), [saved]);
  const isDirty = !!draft && !sameGrants(draft, savedMaterialized);
  const isDefault = !!draft && sameGrants(draft, defaultFeatureGrants());

  function toggle(id: string, role: EditableRole) {
    setDraft((prev) => (prev ? { ...prev, [id]: { ...prev[id], [role]: !(prev[id]?.[role] ?? true) } } : prev));
  }

  async function handleSave() {
    if (!draft) return;
    setIsSaving(true);
    try {
      await saveFeatureGrants(draft);
      toast.success("Feature access saved. It applies to every workspace immediately.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save feature access.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!draft) return <Loader label="Loading feature access..." />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Feature Access</h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            Choose which workspace roles can use each capability, platform-wide. A feature permission is necessary but not sufficient: people still need workspace membership, project access and plan/quota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
          <Button size="sm" variant="secondary" onClick={() => setDraft(defaultFeatureGrants())} disabled={isDefault || isSaving}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={!isDirty}>
            Save Changes
          </Button>
        </div>
      </div>

      <SettingsSection title="Role permissions" description="Owner is always on. Rows with a lock are fixed by the product. Reset to Defaults only changes this draft — nothing is saved until Save Changes.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="py-2 pr-3">Feature</th>
                {FEATURE_ROLES.map((r) => (
                  <th key={r} className="w-24 px-2 py-2 text-center">{FEATURE_ROLE_LABEL[r]}</th>
                ))}
                <th className="hidden py-2 pl-3 lg:table-cell">Enforced by</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUP_ORDER.map((group) => {
                const rows = FEATURE_PERMISSIONS.filter((p) => p.group === group);
                if (rows.length === 0) return null;
                return (
                  <GroupRows key={group} group={group}>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-foreground">{p.label}</p>
                          <p className="font-mono text-[11px] text-foreground-muted">{p.id}</p>
                        </td>
                        {FEATURE_ROLES.map((role) => (
                          <td key={role} className="px-2 py-2 text-center">
                            {!p.configurable ? (
                              <FixedCell on={resolveFeatureGrant(null, role, p.id)} />
                            ) : role === "owner" ? (
                              <FixedCell on />
                            ) : (
                              <CheckCell
                                checked={draft[p.id]?.[role] ?? true}
                                onClick={() => toggle(p.id, role)}
                                label={`${p.label} — ${FEATURE_ROLE_LABEL[role]}`}
                              />
                            )}
                          </td>
                        ))}
                        <td className="hidden py-2 pl-3 text-xs text-foreground-muted lg:table-cell">{p.enforcedBy}</td>
                      </tr>
                    ))}
                  </GroupRows>
                );
              })}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Platform-controlled permissions"
        description="Always Super Admin only. These can never be granted to an Owner, Admin or Employee, so there are no checkboxes."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PLATFORM_CONTROLLED_PERMISSIONS.map((p) => (
            <div key={p.label} className="flex items-start gap-3 rounded-theme border border-border bg-surface p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{p.label}</p>
                <p className="text-xs text-foreground-muted">{p.enforcedBy}</p>
              </div>
              <Badge variant="info" className="ml-auto shrink-0">Super Admin only</Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Changes here are recorded in Audit Logs as &ldquo;Feature access updated&rdquo;.
        </p>
      </SettingsSection>
    </div>
  );
}

function GroupRows({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="bg-surface-muted/50 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{group}</td>
      </tr>
      {children}
    </>
  );
}

function FixedCell({ on }: { on: boolean }) {
  return (
    <span className="mx-auto inline-flex h-5 items-center justify-center text-foreground-muted" title="Fixed — not configurable">
      {on ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs">—</span>}
      <Lock className="ml-0.5 h-2.5 w-2.5 opacity-60" />
    </span>
  );
}

function CheckCell({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "mx-auto flex h-5 w-5 items-center justify-center rounded border transition-colors",
        checked ? "border-primary bg-primary text-white" : "border-border hover:border-primary"
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
}
