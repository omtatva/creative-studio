import { SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <SettingsNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
