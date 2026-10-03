// Milestone 199 production incident: Render's build step
// (`prisma generate && tsc -p tsconfig.json`, see package.json's own
// "build" script and render.yaml) failed on a type error that only
// existed in a *.test.ts file — but `npm test` (tsx --test) never
// caught it, because tsx transpiles and runs tests without doing
// full type-checking the way `tsc` does. The result: Render kept
// serving the PREVIOUS successful build indefinitely, silently, while
// every other check (unit tests, frontend smoke, direct backend/
// controller reproduction against real production data) looked
// completely clean — the Admin Contacts page broke in production
// because the new CRM backend code was simply never deployed, not
// because of any runtime bug.
//
// This test closes that exact gap: it runs the TypeScript compiler
// programmatically, against this project's own tsconfig.json, the
// same project-wide type-check Render's build step runs — so a type
// error anywhere in this backend (production code OR test code;
// tsconfig.json's own "include" covers both) fails loudly here, as
// part of the ordinary test suite, before a push, rather than only
// being discovered by a silent production build failure days later.
// Uses the TypeScript Compiler API in-process (ts.createProgram)
// rather than spawning `tsc` as a child process — spawning it proved
// unreliable in this exact environment (inconsistent, sometimes-empty
// failures depending on how the test runner itself spawns child
// processes on Windows), while the in-process API has no such
// dependency on shell/PATH/binary resolution at all.
//
// Confirmed to reproduce the exact incident: this test failed before
// the real fix (the `history[0]` possibly-undefined error in
// outreachContact.service.test.ts, caused by this same tsconfig's own
// noUncheckedIndexedAccess) and passes after it.
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at backend/src/typecheckGuard.test.ts — one level
// below backend/, not two.
const BACKEND_ROOT = join(__dirname, "..");
const TSCONFIG_PATH = join(BACKEND_ROOT, "tsconfig.json");

test("the backend's production build type-check (tsconfig.json) passes with zero errors — the exact check Render's build step runs", () => {
  const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
  assert.ok(!configFile.error, "tsconfig.json itself failed to parse");

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, BACKEND_ROOT);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => BACKEND_ROOT,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    });
    assert.fail(`tsc reported ${diagnostics.length} type error(s) that would break Render's production build:\n${formatted}`);
  }
});
