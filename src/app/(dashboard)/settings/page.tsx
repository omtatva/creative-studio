import Link from "next/link";
import { Building2, Palette, Sliders, Users, Bell, Lock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/lib/constants/routes";

const SHORTCUTS = [
  { href: ROUTES.settingsWorkspace, label: "Workspace", description: "Name, slug, and company details", icon: Building2 },
  { href: ROUTES.settingsBranding, label: "Branding", description: "Logo, favicon, and brand color", icon: Palette },
  { href: ROUTES.settingsTheme, label: "Theme", description: "Colors, radius, and typography", icon: Sliders },
  { href: ROUTES.settingsUsers, label: "Users", description: "Manage members and invites", icon: Users },
  { href: ROUTES.settingsAi, label: "AI Settings", description: "Generation preferences for AI Studio", icon: Sparkles },
  { href: ROUTES.settingsNotifications, label: "Notifications", description: "Email and push preferences", icon: Bell },
  { href: ROUTES.settingsSecurity, label: "Security", description: "2FA, sessions, and domains", icon: Lock },
];

export default function SettingsIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">Manage your workspace configuration.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHORTCUTS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-theme bg-primary/10 text-primary">
                <item.icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="mt-1 text-xs text-foreground-muted">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
