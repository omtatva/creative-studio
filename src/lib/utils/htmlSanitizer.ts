import sanitizeHtml from "sanitize-html";

/**
 * SECURITY (audit Priority 2) — the ONE place rich-text HTML from a
 * user (task descriptions, task comments) is ever allowed to become
 * "safe to store and render." /api/tasks/description and
 * /api/tasks/comments/* call this SERVER-SIDE before writing to
 * Firestore — never only client-side, since a malicious caller could
 * skip a client-side-only sanitizer entirely by calling either route
 * (or, before this fix, the Firestore SDK directly) with a crafted
 * body. TaskOverviewTab.tsx and CommentItem.tsx ALSO run content
 * through this again immediately before dangerouslySetInnerHTML, as
 * defense in depth against anything written before this fix existed,
 * or a write path that's missed in the future — that's why this lives
 * in lib/utils (isomorphic — sanitize-html has no DOM/Node-only
 * dependency) rather than lib/server, which client components can't
 * import.
 *
 * Allowlist matches EXACTLY what RichTextEditor.tsx's toolbar can
 * produce (bold/italic/underline/lists/links/emoji-as-text/mention
 * chips) — nothing else, so a paste or a direct API call can't smuggle
 * in unsupported markup. Every link is forced to a safe scheme and
 * `rel="noopener noreferrer nofollow"` + `target="_blank"`, closing
 * both the `javascript:`-URL vector and the window.opener tab-nabbing
 * risk for legitimate external links.
 */
const MAX_HTML_LENGTH = 50_000;

const options: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "div", "p", "span", "a"],
  allowedAttributes: {
    // target/rel aren't something the editor itself ever sets — they're
    // added by transformTags below, on EVERY link, and must be in this
    // allowlist too or sanitize-html strips them back out after the
    // transform runs.
    a: ["href", "target", "rel"],
    span: ["class", "contenteditable"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
  // Anything not explicitly allowed (script, style, img, svg, iframe,
  // object, form, event-handler attributes, style attributes, etc.) is
  // stripped entirely rather than escaped-and-kept — matches "preserve
  // only the formatting elements actually supported by the editor."
  disallowedTagsMode: "discard",
};

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  const truncated = html.length > MAX_HTML_LENGTH ? html.slice(0, MAX_HTML_LENGTH) : html;
  return sanitizeHtml(truncated, options);
}
