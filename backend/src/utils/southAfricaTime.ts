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
