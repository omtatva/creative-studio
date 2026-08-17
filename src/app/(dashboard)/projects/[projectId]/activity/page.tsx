"use client";

import { Card } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";

export default function ProjectActivityPage() {
  const { project } = useProjectDetailsContext();
  if (!project) return null;
  return (
    <Card>
      <ActivityFeed take={50} filterTargetId={project.id} />
    </Card>
  );
}
