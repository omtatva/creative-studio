import { MainLayout } from "@/components/layout/MainLayout";

/**
 * Route-group layout shared by every authenticated screen
 * (/dashboard, /settings/*). Anything inside the (dashboard) group
 * automatically gets the sidebar/navbar shell and the auth guard.
 */
export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <MainLayout>{children}</MainLayout>;
}
