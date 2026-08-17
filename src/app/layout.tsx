import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

export const metadata: Metadata = {
  title: "Creative Studio",
  description: "Creative project management for modern teams.",
};

/**
 * Root layout. Provider order matters: Auth first (Workspace reads
 * the signed-in user's activeWorkspaceId), then Workspace, then
 * Theme (reads the resolved workspace's saved ThemeSettings).
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
              {children}
              <ToastContainer />
            </ThemeProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
