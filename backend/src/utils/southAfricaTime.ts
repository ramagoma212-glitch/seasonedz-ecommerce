// Milestone 181, Part T: South Africa Standard Time (SAST, UTC+2, no
// daylight saving — the offset never changes across the year) display
// helpers. Every preorder timestamp is still STORED in UTC (Prisma/
// Postgres default, and the only sane way to store an instant) — these
// functions only ever affect how a Date is DISPLAYED to a human, never
// how it's stored, compared, or used in any `now >= releaseAt`-style
// check (preorder.service.ts's own derivePreorderAdminStatus()/
// isActivePreorder() always compare real UTC instants, never a
// formatted string).
//
// Uses Intl.DateTimeFormat with the real IANA zone name rather than a
// manual +2-hour offset calculation — the standard, robust way to avoid
// an off-by-N-hours bug, and self-documenting about exactly which zone
// is intended.

const SAST_TIME_ZONE = "Africa/Johannesburg";

// "30 September 2026" — date only, matching the brief's own exact
// customer-facing wording ("Available from 30 September 2026.").
export function formatSastDate(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: SAST_TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(date);
}

// "30 September 2026, 00:00" — includes the time, for admin-facing
// displays where the exact cutoff moment matters (Part C's admin
// status detail, Part Q's fulfilment hold date).
export function formatSastDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: SAST_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// Milestone 199: CRM follow-up due/overdue/upcoming judgements must be
// made against the CALENDAR DAY in SAST, not the server's own local
// time or a raw UTC day boundary — a follow-up stored as
// 2026-10-05T22:00:00Z is "5 October" to a SAST-based admin, not
// "6 October". Reads "what calendar date is `now` in SAST" via Intl
// (same zone-aware approach as formatSastDate() above) before doing
// any arithmetic; the arithmetic itself (midnight SAST == 22:00 UTC
// the day before) is then a safe, fixed +2-hour relationship because
// SAST never observes daylight saving — unlike a DST-observing zone,
// there is no day where this offset silently shifts.
export function getSastTodayBoundsUtc(now: Date = new Date()): { startOfTodayUtc: Date; startOfTomorrowUtc: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SAST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // 00:00 SAST == 22:00 UTC the previous calendar day. Date.UTC
  // normalizes an hour argument of -2 correctly (it rolls back to the
  // prior day itself), so this is exactly midnight SAST as a real UTC
  // instant, never an off-by-one-day bug.
  const startOfTodayUtc = new Date(Date.UTC(year, month - 1, day, -2, 0, 0, 0));
  const startOfTomorrowUtc = new Date(startOfTodayUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startOfTodayUtc, startOfTomorrowUtc };
}
