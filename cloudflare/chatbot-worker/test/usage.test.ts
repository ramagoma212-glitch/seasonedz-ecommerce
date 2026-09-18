import { test } from "node:test";
import assert from "node:assert/strict";
import { getJohannesburgDate, nextJohannesburgDate, DAILY_LIMIT } from "../src/usage";

test("DAILY_LIMIT is 7", () => {
  assert.equal(DAILY_LIMIT, 7);
});

test("getJohannesburgDate returns YYYY-MM-DD for a known UTC instant", () => {
  // 2026-09-18T22:30:00Z is 2026-09-19 00:30 SAST (UTC+2) — the
  // Johannesburg calendar date has already rolled over to the 19th
  // even though UTC is still on the 18th.
  const date = getJohannesburgDate(new Date("2026-09-18T22:30:00Z"));
  assert.equal(date, "2026-09-19");
});

test("getJohannesburgDate stays on the same day for a UTC instant that hasn't crossed midnight SAST yet", () => {
  // 2026-09-18T10:00:00Z is 2026-09-18 12:00 SAST — same calendar day.
  const date = getJohannesburgDate(new Date("2026-09-18T10:00:00Z"));
  assert.equal(date, "2026-09-18");
});

test("nextJohannesburgDate advances by exactly one calendar day", () => {
  assert.equal(nextJohannesburgDate("2026-09-18"), "2026-09-19");
  assert.equal(nextJohannesburgDate("2026-09-30"), "2026-10-01");
  assert.equal(nextJohannesburgDate("2026-12-31"), "2027-01-01");
});
