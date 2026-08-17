import { redirect } from "next/navigation";
import { taskRoute } from "@/lib/constants/routes";

/** `/tasks/[taskId]` has no content of its own — always resolves to the Overview tab. */
export default async function TaskDetailsIndexPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  redirect(taskRoute(taskId, "overview"));
}
