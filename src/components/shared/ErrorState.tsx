import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Shared "couldn't load X" state for any realtime list/detail view. Pass `title` to say what failed to load. */
export function ErrorState({ title = "Couldn't load data", message, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-9 w-9 text-red-500" />}
      title={title}
      description={message}
      action={
        onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
      className="py-16"
    />
  );
}
