import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractTextFromDocument } from "./documentTextExtraction.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A genuine, well-formed, publicly-available academic journal PDF
// (Turkish Journal of Medical Sciences, an open-access article) — used
// purely to prove real PDF text extraction genuinely works end to end.
// Never a real customer's ID/passport/bank statement (brief section
// 56); hand-rolling a byte-correct minimal PDF from scratch proved far
// more fragile than using one small, genuinely valid, already-public
// document.
const SAMPLE_PDF_PATH = path.join(__dirname, "__fixtures__", "sample-text-pdf.pdf");

test("extractTextFromDocument: extracts real embedded text from a genuine PDF", async () => {
  const buffer = fs.readFileSync(SAMPLE_PDF_PATH);
  const text = await extractTextFromDocument(buffer, "application/pdf");
  assert.ok(text && text.length > 20, `expected non-trivial extracted text, got: ${text}`);
  assert.ok(text && /[A-Za-z]{3,}/.test(text), "expected extracted text to contain real words");
});

test("extractTextFromDocument: a malformed PDF returns null instead of throwing (brief section 45)", async () => {
  const malformed = Buffer.from("%PDF-1.4\nthis is not really a valid pdf structure at all");
  const text = await extractTextFromDocument(malformed, "application/pdf");
  assert.equal(text, null);
});

test("extractTextFromDocument: images return null — no OCR is attempted (documented limitation, see this file's own header comment)", async () => {
  const fakeImage = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(await extractTextFromDocument(fakeImage, "image/jpeg"), null);
  assert.equal(await extractTextFromDocument(fakeImage, "image/png"), null);
});
