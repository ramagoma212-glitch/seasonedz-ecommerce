// Version 7, Milestone 176: pdf-parse's own package root (`index.js`)
// carries a debug-mode footgun — when `module.parent` is falsy (which
// happens reliably both under `tsx --test` and under this project's own
// ESM-importing-a-CJS-package interop, not just when run directly) it
// tries to read a hardcoded demo PDF file from its own package
// directory and crashes if that file isn't present at the current
// working directory. documentTextExtraction.service.ts therefore
// imports the real implementation directly from `pdf-parse/lib/pdf-parse.js`,
// bypassing that wrapper entirely — this ambient module declaration
// supplies the (otherwise absent) types for that subpath, matching
// @types/pdf-parse's own PDFParse function/result shape.
declare module "pdf-parse/lib/pdf-parse.js" {
  import type PdfParse from "pdf-parse";

  function PDFParse(dataBuffer: Buffer, options?: PdfParse.Options): Promise<PdfParse.Result>;
  export default PDFParse;
}
