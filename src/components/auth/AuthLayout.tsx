import { type ReactNode } from "react";
import { Sparkles } from "lucide-react";

/**
 * Shared visual shell for login/signup/forgot-password: brand mark,
 * centered card column, subtle gradient backdrop. Keeps each auth
 * page focused on its form only.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-surface to-secondary/5 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-theme bg-primary text-white shadow-soft">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
