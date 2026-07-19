// Formatting helpers shared by the read-only admin dashboard pages
// (Version 7, Milestone 59) — status badges, currency, dates.
// Currency matches the storefront's own existing `R${n.toFixed(2)}`
// convention (see components/productCard.js etc.) rather than
// introducing a different format just for admin pages.

const SUCCESS_STATUSES = new Set(["PAID", "CONFIRMED", "DELIVERED", "RESPONDED", "CLOSED", "ACTIVE"]);
const DANGER_STATUSES = new Set(["CANCELLED", "REFUNDED", "FAILED", "OUT_OF_STOCK"]);

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
