// Milestone 181, Part T/W: timezone boundary tests — SAST is UTC+2,
// fixed, no daylight saving, so 23:59 SAST the night before must never
// display or evaluate as the next day, and 00:00 SAST must never
// display as still the previous day (the exact "off-by-two-hour bug
// around midnight" the brief explicitly warns against).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSastDate, formatSastDateTime } from "./southAfricaTime.js";

test("29 September 2026 23:59 SAST (stored as 21:59 UTC) displays as 29 September, not 30", () => {
  const utcInstant = new Date("2026-09-29T21:59:00.000Z");
  assert.equal(formatSastDate(utcInstant), "29 September 2026");
  assert.equal(formatSastDateTime(utcInstant), "29 September 2026 at 23:59");
});

test("30 September 2026 00:00 SAST (stored as 29 September 22:00 UTC) displays as 30 September, not 29", () => {
  const utcInstant = new Date("2026-09-29T22:00:00.000Z");
  assert.equal(formatSastDate(utcInstant), "30 September 2026");
  assert.equal(formatSastDateTime(utcInstant), "30 September 2026 at 00:00");
});

test("one minute before the SAST midnight boundary is still the earlier date", () => {
  const utcInstant = new Date("2026-09-29T21:58:00.000Z"); // 23:58 SAST
  assert.equal(formatSastDate(utcInstant), "29 September 2026");
});

test("one minute after the SAST midnight boundary is already the later date", () => {
  const utcInstant = new Date("2026-09-29T22:01:00.000Z"); // 00:01 SAST
  assert.equal(formatSastDate(utcInstant), "30 September 2026");
});
