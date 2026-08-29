import { test } from "node:test";
import assert from "node:assert/strict";
import { isExactDuplicate, isNormalisedDuplicate, findNormalisedDuplicates, isCaptionDuplicate, isHookDuplicate, isScriptDuplicate } from "./duplicateDetection.util.js";

test("isExactDuplicate: identical strings match", () => {
  assert.equal(isExactDuplicate("Shop now", "Shop now"), true);
});

test("isExactDuplicate: differing whitespace/case does not match", () => {
  assert.equal(isExactDuplicate("Shop now", "shop now "), false);
});

test("isNormalisedDuplicate: differing whitespace/case still matches", () => {
  assert.equal(isNormalisedDuplicate("Shop  Now", "shop now"), true);
});

test("isNormalisedDuplicate: genuinely different text does not match", () => {
  assert.equal(isNormalisedDuplicate("Shop now", "Buy today"), false);
});

test("findNormalisedDuplicates: returns each duplicate value exactly once", () => {
  const duplicates = findNormalisedDuplicates(["Shop now", "shop now", "Buy today", "SHOP NOW"]);
  assert.deepEqual(duplicates, ["shop now"]);
});

test("findNormalisedDuplicates: an all-unique list returns nothing", () => {
  assert.deepEqual(findNormalisedDuplicates(["a", "b", "c"]), []);
});

test("isCaptionDuplicate and isHookDuplicate use normalised comparison", () => {
  assert.equal(isCaptionDuplicate("Shop Now!", "shop now!"), true);
  assert.equal(isHookDuplicate("Here's how", "here's how"), true);
});

test("isScriptDuplicate uses exact comparison — whitespace/case differences are meaningfully different scripts", () => {
  assert.equal(isScriptDuplicate("Scene one.", "Scene one."), true);
  assert.equal(isScriptDuplicate("Scene one.", "scene one."), false);
});
