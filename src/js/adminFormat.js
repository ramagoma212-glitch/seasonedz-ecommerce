// Formatting helpers shared by the read-only admin dashboard pages
// (Version 7, Milestone 59) — status badges, currency, dates.
// Currency matches the storefront's own existing `R${n.toFixed(2)}`
// convention (see components/productCard.js etc.) rather than
// introducing a different format just for admin pages.

// Version 7, Milestone 171C: APPROVED/REJECTED added for the genuine
// product review moderation queue (pages/adminReviews.js) — the same
// generic tone convention every other admin status badge already uses.
// Milestone 197: EXPIRED/INACTIVE for the coupon list's own derived
// (never stored) display status — SCHEDULED deliberately left out of
// both sets, rendering as the same default neutral tone as any other
// unrecognised value (an upcoming coupon isn't a failure state).
// Milestone 198: COMPLETED/SENT for outreach campaigns/recipients;
// UNSUBSCRIBED/BOUNCED/INVALID/SUPPRESSED/PARTIALLY_FAILED join the
// danger set below — the same generic tone convention, so a suppressed
// contact or a failed send reads as a problem state at a glance.
// Milestone 199: CUSTOMER/REPEAT_CUSTOMER join the success set — the
// two B2B CRM leadStatus values that represent genuine business
// progress, the same "reads as a good state at a glance" convention
// every other status in this set already follows. The other six lead
// statuses (PROSPECT/CONTACTED/INTERESTED/CATALOGUE_SENT/
// QUOTE_REQUESTED/NEGOTIATING) are deliberately left out of both sets
// — a lead still in progress is neither a success nor a danger state.
const SUCCESS_STATUSES = new Set(["PAID", "CONFIRMED", "DELIVERED", "RESPONDED", "CLOSED", "ACTIVE", "APPROVED", "PUBLISHED", "COMPLETED", "SENT", "CUSTOMER", "REPEAT_CUSTOMER"]);
const DANGER_STATUSES = new Set(["CANCELLED", "REFUNDED", "FAILED", "OUT_OF_STOCK", "REJECTED", "REVERSED", "EXPIRED", "INACTIVE", "UNSUBSCRIBED", "BOUNCED", "INVALID", "SUPPRESSED", "PARTIALLY_FAILED"]);

export function humanizeEnum(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function renderStatusBadge(value) {
  const tone = SUCCESS_STATUSES.has(value) ? "admin-badge--success" : DANGER_STATUSES.has(value) ? "admin-badge--danger" : "admin-badge--neutral";
  return `<span class="admin-badge ${tone}">${humanizeEnum(value)}</span>`;
}

export function formatCurrency(amount) {
  return `R${Number(amount).toFixed(2)}`;
}

export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
