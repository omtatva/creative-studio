import { CheckCircle2, ListChecks, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { TaskSection } from "@/types/task.types";

interface TaskEmptyStateProps {
  section: TaskSection;
  hasSearchOrFilters: boolean;
  onCreateTask: () => void;
  onClearSearch: () => void;
}

export function TaskEmptyState({ section, hasSearchOrFilters, onCreateTask, onClearSearch }: TaskEmptyStateProps) {
  if (hasSearchOrFilters) {
    return (
      <EmptyState
        icon={<SearchX className="h-9 w-9" />}
        title="No tasks match your search"
        description="Try a different keyword or clear your filters."
        action={<Button size="sm" variant="outline" onClick={onClearSearch}>Clear search & filters</Button>}
        className="py-16"
      />
    );
  }

  if (section === "completed") {
    return <EmptyState icon={<CheckCircle2 className="h-9 w-9" />} title="No completed tasks yet" className="py-16" />;
  }

  if (section === "overdue") {
    return <EmptyState icon={<CheckCircle2 className="h-9 w-9" />} title="Nothing overdue" description="You're on top of things." className="py-16" />;
  }

  return (
    <EmptyState
      icon={<ListChecks className="h-9 w-9" />}
      title="No tasks yet"
      description="Create a task to start tracking work."
      action={<Button size="sm" onClick={onCreateTask}>New Task</Button>}
      className="py-16"
    />
  );
}
