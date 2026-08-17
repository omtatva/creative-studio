"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { CommentItem } from "./CommentItem";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useTaskDetailsContext } from "@/contexts/TaskDetailsContext";
import { useComments } from "@/hooks/useComments";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { getProject } from "@/services/projectService";
import { TaskActor, TaskComment } from "@/types/task.types";

/** Rich comments with @mentions, one level of replies, emoji (via RichTextEditor), and edit/delete for the author's own comments. */
export function TaskCommentsTab() {
  const { task } = useTaskDetailsContext();
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser } = useAuthContext();
  const { comments, isLoading } = useComments(task?.id);
  const actions = useTaskActions();
  const toast = useToast();

  const [draft, setDraft] = useState("");
  const [mentionedUids, setMentionedUids] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<TaskActor[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const uid = firebaseUser?.uid ?? "";

  useEffect(() => {
    if (!task || !workspaceId) return;
    getProject(workspaceId, task.projectId).then((project) => {
      setMentionCandidates(
        project ? project.members.map((m) => ({ uid: m.uid, displayName: m.displayName, photoURL: m.photoURL, email: m.email })) : []
      );
    });
  }, [task, workspaceId]);

  if (!task) return null;

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesFor = (commentId: string) => comments.filter((c) => c.parentCommentId === commentId);

  async function handlePost() {
    const text = draft.replace(/<[^>]*>/g, "").trim();
    if (!text) return;
    const commentId = await actions.addComment(task!.id, draft, mentionedUids, replyTo?.id ?? null);
    if (!commentId) {
      toast.error(actions.error ?? "Couldn't post your comment. Please try again.");
      return;
    }
    setDraft("");
    setMentionedUids([]);
    setReplyTo(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>

      {!isLoading && topLevel.length === 0 ? (
        <EmptyState title="No comments yet" description="Start the conversation on this task." className="py-8" />
      ) : (
        <div className="flex flex-col gap-5">
          {topLevel.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-3">
              <CommentItem
                comment={comment}
                currentUid={uid}
                mentionCandidates={mentionCandidates}
                onReply={setReplyTo}
                onEdit={(id, body) => actions.editComment(task!.id, id, body)}
                onDelete={setDeleteTargetId}
              />
              {repliesFor(comment.id).map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUid={uid}
                  mentionCandidates={mentionCandidates}
                  onReply={setReplyTo}
                  onEdit={(id, body) => actions.editComment(task!.id, id, body)}
                  onDelete={setDeleteTargetId}
                  isReply
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-theme bg-surface-muted px-2.5 py-1.5 text-xs text-foreground-muted">
            Replying to {replyTo.author.displayName}
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          mentionCandidates={mentionCandidates}
          onMentionsChange={setMentionedUids}
          placeholder="Write a comment... use @ to mention someone"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={handlePost} isLoading={actions.isSubmitting}>
            {replyTo ? "Post reply" : "Comment"}
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={async () => {
          if (deleteTargetId) await actions.deleteComment(task!.id, deleteTargetId);
          setDeleteTargetId(null);
        }}
        title="Delete comment?"
        description="This can't be undone."
        confirmLabel="Delete"
        isDanger
        isSubmitting={actions.isSubmitting}
      />
    </Card>
  );
}
