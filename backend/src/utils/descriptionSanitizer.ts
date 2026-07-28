// Version 7, Milestone 146: server-side sanitisation for the product
// "Full Description" rich text field. This is the ONLY place that
// decides what HTML is safe to store and later render unescaped on
// the public product page (src/pages/productDetails.js) — the admin
// editor's own restricted Quill toolbar (src/components/
// descriptionEditor.js) is a UX nicety, never trusted on its own, per
// the milestone's own "never rely only on frontend sanitisation"
// instruction.
//
// Allowlist matches the editor's own restricted toolbar exactly (bold,
// italic, heading 2/3, bullet/numbered list) plus the paragraph/line-
// break tags Quill itself always wraps content in — nothing else.
// Deliberately no attributes at all: none of the approved tags need
// one, and allowing e.g. `style` or `class` would reopen exactly the
// XSS surface this exists to close.
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3"];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {},
  // Belt-and-braces alongside the allowlist above — never let a
  // script/style tag's contents (not just the tag itself) survive.
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "iframe"],
};

export function sanitizeDescriptionHtml(raw: string): string {
  return sanitizeHtml(raw, SANITIZE_OPTIONS).trim();
}

// Counts what a reader would actually see — HTML tags and entity
// escaping are invisible to them, so neither counts against the
// 5,000-character limit. Mirrors the frontend's Quill-based count
// (quill.getText().length, via the same "how many readable characters"
// definition) closely enough that the same document is never accepted
// on one side and rejected on the other in practice; exact agreement
// isn't required since both independently enforce the same limit.
export function countVisibleCharacters(html: string): number {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").length;
}

// Version 7, Milestone 146: every description saved before this
// milestone is plain text (no HTML at all) — sanitizeHtml() already
// leaves plain text completely untouched (no tags to strip, nothing to
// escape further), so this function needs no "is this legacy?"
// branching of its own. Kept as a distinctly-named entry point anyway
// so callers read as "this value is about to be stored/served", not
// just "sanitise some HTML".
export function sanitizeAndValidateDescription(raw: string, maxVisibleCharacters: number): { html: string; visibleLength: number } {
  const html = sanitizeDescriptionHtml(raw);
  const visibleLength = countVisibleCharacters(html);
  if (visibleLength > maxVisibleCharacters) {
    const error = new Error(`description must be ${maxVisibleCharacters} visible characters or fewer (found ${visibleLength}).`);
    error.name = "DescriptionTooLongError";
    throw error;
  }
  return { html, visibleLength };
}
