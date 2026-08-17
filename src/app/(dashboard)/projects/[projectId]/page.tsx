import { redirect } from "next/navigation";
import { projectRoute } from "@/lib/constants/routes";

/** `/projects/[projectId]` has no content of its own — it always resolves to the Overview tab. */
export default async function ProjectDetailsIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(projectRoute(projectId, "overview"));
}
