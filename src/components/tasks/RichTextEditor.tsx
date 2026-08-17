"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, Link2, Smile } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TaskActor } from "@/types/task.types";

const EMOJI_SET = ["👍", "🎉", "✅", "🔥", "👀", "❤️", "😂", "🙌", "🚀", "💡", "⚠️", "🤔"];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  mentionCandidates?: TaskActor[];
  onMentionsChange?: (uids: string[]) => void;
  className?: string;
}

/**
 * Lightweight contentEditable rich-text editor backing both task
 * Description and Comments (spec calls for rich text in both).
 * Uses the browser's built-in execCommand formatting rather than a
 * heavy third-party editor dependency, which is enough for
 * bold/italic/underline/lists/links. When `mentionCandidates` is
 * passed, typing "@" opens an inline autocomplete that inserts a
 * non-editable mention chip and reports the mentioned uid via
 * `onMentionsChange` — this is what TaskCommentsTab uses to persist
 * `TaskComment.mentionedUids`.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "100px",
  mentionCandidates,
  onMentionsChange,
  className,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runCommand(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html);

    if (mentionCandidates) {
      const text = editorRef.current?.textContent ?? "";
      const match = text.match(/@([a-zA-Z0-9._-]*)$/);
      setMentionQuery(match ? match[1] : null);
    }
  }

  function insertEmoji(emoji: string) {
    runCommand("insertText", emoji);
    setIsEmojiOpen(false);
  }

  function insertMention(actor: TaskActor) {
    // Remove the partial "@query" text, then insert a styled, non-editable mention chip.
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current) {
      const text = editorRef.current.textContent ?? "";
      const match = text.match(/@([a-zA-Z0-9._-]*)$/);
      if (match) {
        // Best-effort removal: re-render is avoided by relying on execCommand undo-friendly delete.
        for (let i = 0; i < match[0].length; i++) {
          document.execCommand("delete", false);
        }
      }
    }
    document.execCommand(
      "insertHTML",
      false,
      `<span contenteditable="false" class="rounded bg-primary/10 px-1 py-0.5 text-primary font-medium">@${actor.displayName}</span>&nbsp;`
    );
    mentionedUidsRef.current.add(actor.uid);
    onMentionsChange?.(Array.from(mentionedUidsRef.current));
    setMentionQuery(null);
    handleInput();
  }

  const filteredCandidates =
    mentionQuery !== null
      ? (mentionCandidates ?? []).filter((c) => c.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
      : [];

  return (
    <div className={cn("rounded-theme border border-border bg-surface", className)}>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <ToolbarButton icon={Bold} onClick={() => runCommand("bold")} label="Bold" />
        <ToolbarButton icon={Italic} onClick={() => runCommand("italic")} label="Italic" />
        <ToolbarButton icon={Underline} onClick={() => runCommand("underline")} label="Underline" />
        <ToolbarButton icon={List} onClick={() => runCommand("insertUnorderedList")} label="Bulleted list" />
        <ToolbarButton
          icon={Link2}
          label="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) runCommand("createLink", url);
          }}
        />
        <div className="relative ml-auto">
          <ToolbarButton icon={Smile} onClick={() => setIsEmojiOpen((v) => !v)} label="Insert emoji" />
          {isEmojiOpen && (
            <div className="absolute right-0 z-20 mt-1 grid grid-cols-6 gap-1 rounded-theme border border-border bg-surface p-2 shadow-soft-lg">
              {EMOJI_SET.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="rounded p-1 text-lg hover:bg-surface-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          data-placeholder={placeholder}
          className="prose-editor px-3 py-2.5 text-sm text-foreground outline-none [&:empty]:before:text-foreground-muted [&:empty]:before:content-[attr(data-placeholder)]"
          style={{ minHeight }}
        />

        {mentionQuery !== null && filteredCandidates.length > 0 && (
          <div className="absolute left-2 top-full z-20 mt-1 w-56 rounded-theme border border-border bg-surface p-1 shadow-soft-lg">
            {filteredCandidates.map((candidate) => (
              <button
                key={candidate.uid}
                type="button"
                onClick={() => insertMention(candidate)}
                className="flex w-full items-center gap-2 rounded-theme px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted"
              >
                {candidate.displayName}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
