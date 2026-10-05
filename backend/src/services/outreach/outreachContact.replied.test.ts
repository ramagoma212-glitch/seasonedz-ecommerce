// Milestone 202 completion: the Replied filter counts only a genuine
// REPLY_RECEIVED activity. Opens, clicks and campaign SENT status never qualify,
// and leaving the filter off changes nothing about the existing query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOutreachContactWhere } from "./outreachContact.service.js";

test("the Replied filter requires a REPLY_RECEIVED activity and nothing else", () => {
  const where = buildOutreachContactWhere({ replied: true }) as Record<string, unknown>;
  assert.deepEqual(where.activities, { some: { type: "REPLY_RECEIVED" } });
});

test("campaign status and email opens are never used as reply evidence", () => {
  const where = JSON.stringify(buildOutreachContactWhere({ replied: true }));
  assert.doesNotMatch(where, /SENT|OPEN|CLICK|recipients/);
});

test("leaving the Replied filter off adds no activity condition", () => {
  const where = buildOutreachContactWhere({ replied: false }) as Record<string, unknown>;
  assert.equal("activities" in where, false);
});

test("the Replied filter combines with the existing filters rather than replacing them", () => {
  const where = buildOutreachContactWhere({ replied: true, leadStatus: "INTERESTED", province: "Gauteng" }) as Record<string, unknown>;
  assert.equal(where.leadStatus, "INTERESTED");
  assert.equal(where.province, "Gauteng");
  assert.deepEqual(where.activities, { some: { type: "REPLY_RECEIVED" } });
});
