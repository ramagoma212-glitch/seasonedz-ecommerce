import { test } from "node:test";
import assert from "node:assert/strict";
import { isObviouslyOffTopic } from "../src/offTopic";

test("flags an obvious off-topic request", () => {
  assert.equal(isObviouslyOffTopic("write my assignment for me"), true);
  assert.equal(isObviouslyOffTopic("please write a script to sort a list"), true);
  assert.equal(isObviouslyOffTopic("what's the latest world news"), true);
});

test("does not flag a genuine Seasonedz question", () => {
  assert.equal(isObviouslyOffTopic("What products do you have?"), false);
  assert.equal(isObviouslyOffTopic("How do preorders work?"), false);
  assert.equal(isObviouslyOffTopic("Do you have colouring books for adults?"), false);
  assert.equal(isObviouslyOffTopic("How much is delivery?"), false);
});
