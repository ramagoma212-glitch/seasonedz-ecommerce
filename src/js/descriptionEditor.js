// Version 7, Milestone 146: initialises Quill for every
// [data-description-editor] container components/descriptionEditor.js
// renders. Restricted to exactly the approved formats — see that
// component's own header comment for the full rationale — via both
// the custom toolbar markup (only bold/italic/H2/H3/list/undo/redo/
// clean buttons exist at all) and Quill's own `formats` option (belt-
// and-braces against a paste bringing in an unlisted format like
// colour or a link). The backend (adminProduct.service.ts +
// utils/descriptionSanitizer.ts) is still the only thing this is ever
// allowed to depend on for real safety — nothing here is trusted on
// its own.
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { resolveDescriptionHtml } from "./descriptionFormat.js";

export const MAX_DESCRIPTION_VISIBLE_CHARACTERS = 5000;
const ALLOWED_FORMATS = ["bold", "italic", "header", "list"];

// Keyed by the hidden input's id (e.g. "productDescription") — lets
// app.js's submit-time validation ask "how long is this field right
// now" without needing to know anything about Quill or re-parse HTML
// itself. Quill's own getText() is the source of truth for "visible
// characters", the same definition the backend's countVisibleCharacters()
// independently arrives at from the sanitised HTML.
const quillInstances = new Map();

function countVisibleCharacters(quill) {
  // getText() always ends in an implicit trailing "\n", even on a
  // genuinely empty editor — trimmed so an empty description reads as
  // "0 / 5,000", not "1 / 5,000".
  return quill.getText().replace(/\n$/, "").length;
}

function updateCounter(root, quill) {
  const counterEl = root.querySelector("[data-description-counter]");
  if (!counterEl) return;
  const count = countVisibleCharacters(quill);
  counterEl.textContent = `${count} / ${MAX_DESCRIPTION_VISIBLE_CHARACTERS} characters`;
  counterEl.classList.toggle("is-over-limit", count > MAX_DESCRIPTION_VISIBLE_CHARACTERS);
}

function updatePreview(root, quill) {
  const previewEl = root.querySelector("[data-description-preview]");
  if (!previewEl || previewEl.hidden) return;
  previewEl.innerHTML = quill.root.innerHTML;
}

function initEditor(root) {
  if (root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  const fieldId = root.dataset.fieldId;
  const hiddenInput = document.getElementById(fieldId);
  const quillContainer = root.querySelector("[data-description-quill]");
  const toolbarEl = root.querySelector(`#${fieldId}-toolbar`);
  if (!fieldId || !hiddenInput || !quillContainer || !toolbarEl) return;

  const quill = new Quill(quillContainer, {
    theme: "snow",
    modules: {
      toolbar: toolbarEl,
      history: { delay: 500, maxStack: 100, userOnly: true },
    },
    formats: ALLOWED_FORMATS,
  });

  // Seeds existing content (create page: empty; edit page: the
  // product's current description) — resolveDescriptionHtml() upgrades
  // a legacy plain-text value to safe HTML with its paragraphs/line
  // breaks preserved, or passes already-sanitised HTML through as-is.
  const initialHtml = resolveDescriptionHtml(hiddenInput.value);
  if (initialHtml) quill.clipboard.dangerouslyPasteHTML(initialHtml);

  quillInstances.set(fieldId, quill);

  const sync = () => {
    hiddenInput.value = quill.root.innerHTML;
    updateCounter(root, quill);
    updatePreview(root, quill);
  };
  quill.on("text-change", sync);
  sync();

  toolbarEl.addEventListener("click", (event) => {
    if (event.target.closest('[data-description-action="undo"]')) quill.history.undo();
    if (event.target.closest('[data-description-action="redo"]')) quill.history.redo();
  });

  const previewToggle = root.querySelector("[data-description-preview-toggle]");
  const previewEl = root.querySelector("[data-description-preview]");
  previewToggle?.addEventListener("click", () => {
    const isCurrentlyShown = !previewEl.hidden;
    previewEl.hidden = isCurrentlyShown;
    previewToggle.textContent = isCurrentlyShown ? "Show Preview" : "Hide Preview";
    if (!isCurrentlyShown) updatePreview(root, quill);
  });
}

// The router replaces #main-content's entire HTML on every navigation
// (see js/router.js), so a description editor can appear at any time,
// any number of times, after this module first loads — a
// MutationObserver (rather than a one-off init at page-load) is what
// makes that safe without router.js needing any "page mounted" hook of
// its own.
export function setupDescriptionEditors() {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;

  mainContent.querySelectorAll("[data-description-editor]").forEach(initEditor);

  const observer = new MutationObserver(() => {
    mainContent.querySelectorAll("[data-description-editor]:not([data-initialized])").forEach(initEditor);
  });
  observer.observe(mainContent, { childList: true, subtree: true });
}

// Used by app.js's admin-product-form submit validation to block
// submission client-side when over the limit — the backend
// independently re-enforces the same limit regardless (see
// backend/src/utils/descriptionSanitizer.ts), so this is a UX
// convenience, not the real gate.
export function getDescriptionVisibleCharacterCount(fieldId) {
  const quill = quillInstances.get(fieldId);
  return quill ? countVisibleCharacters(quill) : 0;
}
