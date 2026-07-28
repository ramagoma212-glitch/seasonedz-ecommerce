// Version 7, Milestone 146: renders the "Full Description" rich text
// editor markup — a custom Quill toolbar restricted to exactly the
// approved formats (bold, italic, heading 2/3, bullet/numbered list,
// undo/redo, remove formatting; deliberately no colour, background,
// font, link, image, video, code-block or table controls), a Quill
// mount point, a hidden input that mirrors the editor's HTML for the
// existing admin-product-form read code in app.js to pick up
// unchanged, a live "N / 5,000 characters" counter, and a formatted
// preview toggle so the admin can check formatting before saving.
//
// Quill itself is initialised lazily, per render, by
// js/descriptionEditor.js (a MutationObserver watches #main-content
// for this markup appearing — the router replaces the whole page's
// HTML on every navigation, so nothing here can assume Quill mounts
// only once per page load).
import { escapeHtml } from "../js/search.js";

export function renderDescriptionEditor(fieldId, initialHtml) {
  return `
    <div class="description-editor" data-description-editor data-field-id="${fieldId}">
      <div class="ql-toolbar ql-snow description-editor__toolbar" id="${fieldId}-toolbar">
        <span class="ql-formats">
          <button type="button" class="ql-bold" aria-label="Bold"></button>
          <button type="button" class="ql-italic" aria-label="Italic"></button>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-header" value="2" aria-label="Heading 2">H2</button>
          <button type="button" class="ql-header" value="3" aria-label="Heading 3">H3</button>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-list" value="bullet" aria-label="Bullet list"></button>
          <button type="button" class="ql-list" value="ordered" aria-label="Numbered list"></button>
        </span>
        <span class="ql-formats">
          <button type="button" class="description-editor__btn" data-description-action="undo" aria-label="Undo">&#8630;</button>
          <button type="button" class="description-editor__btn" data-description-action="redo" aria-label="Redo">&#8631;</button>
        </span>
        <span class="ql-formats">
          <button type="button" class="ql-clean" aria-label="Remove formatting"></button>
        </span>
      </div>
      <div class="description-editor__content" id="${fieldId}-quill" data-description-quill></div>
      <div class="description-editor__footer">
        <p class="description-editor__counter" data-description-counter>0 / 5,000 characters</p>
        <button type="button" class="btn btn--secondary btn--sm" data-description-preview-toggle>Show Preview</button>
      </div>
      <div class="description-editor__preview product-details__description-content" data-description-preview hidden></div>
      <input type="hidden" id="${fieldId}" data-description-input value="${escapeHtml(initialHtml || "")}" />
    </div>
  `;
}
