import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface LoaderProps {
  className?: string;
  fullScreen?: boolean;
  label?: string;
}

/**
 * Standard loading indicator. `fullScreen` centers it in the
 * viewport for route-level suspense/loading states.
 */
export function Loader({ className, fullScreen, label }: LoaderProps) {
  const content = (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-foreground-muted", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="flex h-screen w-full items-center justify-center">{content}</div>;
  }

  return content;
}
