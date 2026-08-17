"use client";

import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { ReviewsPanel } from "@/components/reviews/ReviewsPanel";

export default function ProjectReviewsPage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return <ReviewsPanel projectId={project.id} />;
}
