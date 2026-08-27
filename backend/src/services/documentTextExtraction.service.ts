// Version 7, Milestone 176: server-side text extraction for affiliate
// verification documents — the input to
// affiliateDocumentClassification.service.ts's Level 2/3 checks.
//
// PDF: extracts embedded text via `pdf-parse` (the classic, small,
// dependency-light 1.x package — deliberately NOT the newer 2.x
// rewrite, which pulls in the much heavier pdfjs-dist worker machinery
// for a need this backend doesn't have: this only ever needs a PDF's
// plain embedded text, never rendering, screenshots, or table
// extraction).
//
// Images (JPG/PNG) and scanned/image-only PDFs (no embedded text
// layer): this backend does NOT run OCR. Brief section 18 is explicit —
// "only if it can run reliably and safely in the existing backend
// architecture" — and section 82 requires reporting whether a paid
// external provider was added (it was not). A real OCR engine
// (tesseract.js or equivalent) means a large WASM/data-file footprint
// and unpredictable CPU/memory cost on this project's small Render
// instance, and sending an applicant's ID/passport/bank statement to a
// third-party AI OCR service is explicitly barred without the owner's
// direct approval (brief section 18). The honest, safe choice is: no
// extractable text means classification honestly reports
// MANUAL_REVIEW, never a guessed MATCH/MISMATCH — see
// affiliateDocumentClassification.service.ts. This is a real, disclosed
// limitation of this milestone, not an oversight — see the final
// report's own "Limitations of automated document verification" item.
//
// CRITICAL (brief section 43): the extracted text itself is NEVER
// logged, NEVER persisted to any database column, and NEVER included in
// any error message — it exists only for the duration of one
// classification call, in memory, then is discarded. Only short, safe,
// derived summaries (e.g. "Bank name detected") are ever written down —
// see classification service's own buildClassificationReason().
//
// Imports pdf-parse's real implementation directly from its `lib/`
// subpath, NOT the package root — see src/types/pdf-parse-lib.d.ts's
// own header comment for why: the package root's index.js carries a
// debug-mode footgun that crashes (trying to read a hardcoded demo PDF
// file) whenever `module.parent` is falsy, which reliably happens both
// under this project's test runner and under Node's own ESM-importing-
// a-CJS-package interop — not just when the package is run directly as
// its authors intended that check for.

import pdfParse from "pdf-parse/lib/pdf-parse.js";

const PDF_MIME_TYPE = "application/pdf";

export async function extractTextFromDocument(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (mimeType !== PDF_MIME_TYPE) {
    // Images: no OCR — see this file's own header comment.
    return null;
  }

  try {
    const result = await pdfParse(buffer);
    const text = (result.text || "").trim();
    // A scanned/image-only PDF still "parses" successfully but yields
    // no real text layer — treated exactly the same as an image (honest
    // "extraction unavailable"), never coerced into an empty-string
    // MISMATCH.
    return text.length > 0 ? text : null;
  } catch {
    // Malformed/corrupt/password-protected PDF (brief section 45) — never
    // throws up to the caller, never logs the buffer or any file
    // content. Treated the same as "no text available."
    return null;
  }
}
