// Milestone 181: shared preorder display helpers. Every customer-facing
// surface (product card/page, cart, checkout, order confirmation, order
// email, My Orders) and the admin Orders views all format a preorder
// release date the same way, and use the same professional, non-urgent
// copy (Part S: no "Hurry"/"Limited stock" language, no emojis).
//
// No timezone-conversion library is used — same convention as every
// other date already shown on this site (js/adminFormat.js,
// pages/orderConfirmation.js): toLocaleDateString with no explicit
// timeZone renders in the *viewer's own* local time, which for a South
// African customer or admin is already SAST.

export function formatPreorderReleaseDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

// Part J/N/O/S: "Available from [date]." — never a promised delivery
// date, never confused with courier delivery timing.
export function preorderAvailabilityText(isoString) {
  const formatted = formatPreorderReleaseDate(isoString);
  return formatted ? `Available from ${formatted}.` : "Available once released.";
}

// Part K: the ship-together hold date for a cart/order containing
// preorder items is the LATEST release date among them, not the
// earliest — every physical item waits for the slowest preorder line.
// `items` is any array of objects carrying isPreorder/preorderReleaseAt
// (a cart line cross-referenced with live product data, or an
// OrderItem's own immutable snapshot — same shape either way).
export function getLatestPreorderReleaseAt(items) {
  const releaseTimes = items
    .filter((item) => item.isPreorder && item.preorderReleaseAt)
    .map((item) => new Date(item.preorderReleaseAt).getTime())
    .filter((time) => !Number.isNaN(time));
  if (releaseTimes.length === 0) return null;
  return new Date(Math.max(...releaseTimes)).toISOString();
}

// Part K/L/N/O: the one, consistent ship-together fulfilment notice
// used everywhere a mixed cart/order needs to explain the hold.
export function preorderShipTogetherNotice(latestReleaseAtIso) {
  const formatted = formatPreorderReleaseDate(latestReleaseAtIso);
  return `Your order contains a preorder item. All physical items in this order will be dispatched together once the preorder item becomes available${
    formatted ? ` (available from ${formatted})` : ""
  }.`;
}
