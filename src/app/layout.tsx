import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { EntitlementsProvider } from "@/contexts/EntitlementsContext";
import { UploadProvider } from "@/contexts/UploadContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

export const metadata: Metadata = {
  title: "Creative Studio",
  description: "Creative project management for modern teams.",
};

/**
 * Root layout. Provider order matters: Auth first (Workspace reads
 * the signed-in user's activeWorkspaceId), then Workspace, then
 * Theme (reads the resolved workspace's saved ThemeSettings), then
 * Upload — the app-level upload manager that must outlive every page
 * so an in-flight upload survives client-side navigation.
 * ToastContainer is mounted once here so any useToast() call
 * anywhere in the app renders into the same fixed layer.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <ThemeProvider>
              <EntitlementsProvider>
                <UploadProvider>
                  {children}
                  <ToastContainer />
                </UploadProvider>
              </EntitlementsProvider>
            </ThemeProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
