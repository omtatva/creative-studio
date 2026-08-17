"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PERMISSION_MODULES, PERMISSION_ACTIONS, permissionKey } from "@/lib/constants/permissions";

interface PermissionMatrixProps {
  granted: string[];
  onToggle: (key: string) => void;
  onToggleModule: (moduleKeys: string[], grantAll: boolean) => void;
}

/** Module × Action checkbox grid — the same generated PERMISSION_CATALOG backs both this matrix and RoleFormModal's grouped checkbox list, so the set of possible permissions is defined exactly once. */
export function PermissionMatrix({ granted, onToggle, onToggleModule }: PermissionMatrixProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <th className="py-2 pr-3">Module</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} className="px-2 py-2 text-center capitalize">{action}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((module) => {
            const moduleKeys = PERMISSION_ACTIONS.map((a) => permissionKey(module, a));
            const allGranted = moduleKeys.every((k) => granted.includes(k));
            return (
              <tr key={module} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">
                  <button onClick={() => onToggleModule(moduleKeys, !allGranted)} className="text-sm font-medium text-foreground hover:text-primary">
                    {module}
                  </button>
                </td>
                {PERMISSION_ACTIONS.map((action) => {
                  const key = permissionKey(module, action);
                  const isGranted = granted.includes(key);
                  return (
                    <td key={key} className="px-2 py-2 text-center">
                      <button
                        onClick={() => onToggle(key)}
                        className={cn(
                          "mx-auto flex h-5 w-5 items-center justify-center rounded border transition-colors",
                          isGranted ? "border-primary bg-primary text-white" : "border-border hover:border-primary"
                        )}
                        aria-label={key}
                      >
                        {isGranted && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
