// Version 7, Milestone 146: shared backward-compatibility logic for
// the product "Full Description" field, used by both the admin rich
// text editor (js/descriptionEditor.js, seeding Quill with existing
// content) and the public product page (pages/productDetails.js,
// rendering it). Every description saved before this milestone is
// plain text with no markup at all — opening or displaying one of
// those unchanged would collapse its paragraph/line breaks into a
// single run-on line, since raw "\n" characters inside HTML source are
// just collapsible whitespace, not real breaks. A description saved
// from this milestone onward is always server-sanitised HTML (see
// backend/src/utils/descriptionSanitizer.ts) restricted to a small tag
// allowlist — safe to render as-is, and never re-escaped.
import { escapeHtml } from "./search.js";

// A real HTML description only ever contains this milestone's own
// allowed tags (p, br, strong, em, ul, ol, li, h2, h3) — checking for
// any HTML-looking tag at all is enough to tell "sanitised HTML" apart
// from "legacy plain text" without needing to duplicate the backend's
// own allowlist here.
export function isLikelyHtml(value) {
  return typeof value === "string" && /<[a-z][\s\S]*>/i.test(value);
}

// Converts legacy plain text into safe HTML: blank-line-separated
// blocks become paragraphs, single newlines within a block become
// <br>, and every character is escaped first — so a stray "<" or "&"
// typed into an old plain-text description (never meant as markup)
// displays literally instead of being misread as a tag.
export function plainTextToSafeHtml(text) {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// The one entry point both the editor and the product page use:
// already-HTML content passes through untouched (never double-
// escaped); anything else is treated as legacy plain text.
export function resolveDescriptionHtml(rawDescription) {
  if (!rawDescription) return "";
  return isLikelyHtml(rawDescription) ? rawDescription : plainTextToSafeHtml(rawDescription);
}
