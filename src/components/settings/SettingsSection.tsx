import { type ReactNode } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface SettingsSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Standard Card+header shell every settings sub-page's sections use — replaces the old "coming soon" SettingsPagePlaceholder shell. */
export function SettingsSection({ title, description, action, children }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>}
        </div>
        {action}
      </CardHeader>
      {children}
    </Card>
  );
}
