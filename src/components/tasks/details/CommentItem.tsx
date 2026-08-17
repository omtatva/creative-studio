"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { TaskActor, TaskComment } from "@/types/task.types";
import { timeAgo } from "@/lib/utils/date";

interface CommentItemProps {
  comment: TaskComment;
  currentUid: string;
  mentionCandidates: TaskActor[];
  onReply: (comment: TaskComment) => void;
  onEdit: (commentId: string, bodyHtml: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  isReply?: boolean;
}


/** Single comment row — used for both top-level comments and one-level replies (isReply controls indent/reply-button visibility). */
export function CommentItem({ comment, currentUid, mentionCandidates, onReply, onEdit, onDelete, isReply }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.bodyHtml);
  const isOwn = comment.authorId === currentUid;

  async function handleSaveEdit() {
    await onEdit(comment.id, draft);
    setIsEditing(false);
  }

  return (
    <div className={isReply ? "ml-10" : ""}>
      <div className="flex gap-3">
        <Avatar name={comment.author.displayName} src={comment.author.photoURL} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{comment.author.displayName}</span>
            <span className="text-xs text-foreground-muted">{timeAgo(comment.createdAt)}</span>
            {comment.isEdited && <span className="text-xs text-foreground-muted">(edited)</span>}
          </div>

          {isEditing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <RichTextEditor value={draft} onChange={setDraft} mentionCandidates={mentionCandidates} minHeight="60px" />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="prose-editor mt-1 text-sm text-foreground" dangerouslySetInnerHTML={{ __html: comment.bodyHtml }} />
          )}

          {!isEditing && (
            <div className="mt-1 flex items-center gap-3 text-xs text-foreground-muted">
              {!isReply && (
                <button onClick={() => onReply(comment)} className="hover:text-foreground">
                  Reply
                </button>
              )}
              {isOwn && (
                <>
                  <button onClick={() => setIsEditing(true)} className="hover:text-foreground">
                    Edit
                  </button>
                  <button onClick={() => onDelete(comment.id)} className="hover:text-error">
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
