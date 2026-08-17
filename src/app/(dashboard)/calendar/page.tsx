import { CalendarPanel } from "@/components/calendar/CalendarPanel";

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every task due date across your workspace.</p>
      </div>
      <CalendarPanel />
    </div>
  );
}
