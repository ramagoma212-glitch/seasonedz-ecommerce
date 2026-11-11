// Delivery configuration (Version 3, Milestone 25 — preparation only;
// rule replaced Version 7, Milestone 131; replaced again Version 7,
// Milestone 168C; registered-customer threshold reintroduced Version
// 7, Milestone 180; registered-customer distinction removed and real
// amounts made admin-editable, Milestone 205).
//
// These constants are now FALLBACK DEFAULTS only — the real,
// authoritative, admin-editable values live in the DeliverySettings
// table (see services/deliverySettings.service.ts). They're read
// directly only when no DeliverySettings row can be reached for some
// reason (money.ts's calculateDeliveryFee() falls back to these if no
// `rates` argument is supplied), and as the literal seed values
// deliverySettings.service.ts creates the singleton row with on its
// very first read. Keep them in sync with that service's own
// DEFAULT_SETTINGS so the two can never quietly drift apart.
//
// Milestone 205 (owner-approved — see "Website Fixes" developer
// brief, Task 1): lowered Locker R100->R60 and Door R120->R90, and
// replaced the old two-tier guest/registered threshold with ONE
// universal R350 threshold that applies identically to every
// customer:
//
//   Any customer, qualifying subtotal < R350     -> R60 Locker / R90 Door
//   Any customer, qualifying subtotal >= R350     -> R0 (free), both methods
//   Customer Collection (Pretoria or Thohoyandou)  -> R0, always
//   Any order with no physical items at all         -> R0, always
//
// See utils/money.ts's calculateDeliveryFee() for the qualifying-
// subtotal definition (physical products only — excludes gift wrapping
// and excludes delivery fees themselves).
//
// Courier fulfilment is still entirely manual — nothing here contacts
// any courier provider, and no courier credentials are required. See
// backend/DELIVERY_SETUP.md for the full picture and future options.

// Plain numbers, not Prisma.Decimal — these are whole Rand amounts
// (no fractional cents), so there's no floating-point risk in the
// constants themselves. Callers that do arithmetic against a
// Decimal subtotal (e.g. utils/money.ts) wrap these in
// `new Prisma.Decimal(...)` at the point of use, exactly as before —
// this module only defines the safe, plain values.
export const COURIER_LOCKER_FEE = 60;
export const COURIER_DOOR_FEE = 90;
export const COLLECTION_FEE = 0;

// The one universal threshold (Milestone 205) — applies identically
// whether the customer is a guest or signed in. The former, separate
// REGISTERED_FREE_DELIVERY_THRESHOLD constant (R500) was removed along
// with the registered/guest distinction itself, not just renamed.
export const FREE_DELIVERY_THRESHOLD = 350;

export const DELIVERY_METHODS = ["COURIER_LOCKER", "COURIER_DOOR", "COLLECTION"] as const;
export type DeliveryMethodValue = (typeof DELIVERY_METHODS)[number];

export const COLLECTION_CITIES = ["Pretoria", "Thohoyandou"] as const;
export type CollectionCityValue = (typeof COLLECTION_CITIES)[number];

export const DEFAULT_COUNTRY = "South Africa";

// Always false for now — no real courier API is integrated anywhere
// in this codebase. Flipping this on is meaningless until a real
// provider integration exists; see backend/DELIVERY_SETUP.md for what
// that would actually require. Locker to Locker likewise has no real
// per-locker selection integrated yet — see order.service.ts's
// comments on deliveryMethod for how that's handled today.
export const COURIER_INTEGRATION_ENABLED = false;

// "manual" is the only supported value right now — Seasonedz Group
// staff set Shipping.status/courierName/trackingNumber by hand. A
// future real integration would replace this with a provider name
// (e.g. "courier-guy", "pudo", "bobgo") once it actually exists.
export const COURIER_PROVIDER = "manual";
