// Delivery configuration (Version 3, Milestone 25 — preparation only;
// rule replaced Version 7, Milestone 131; replaced again Version 7,
// Milestone 168C).
//
// Single source of truth for delivery rules — order.service.ts (via
// utils/money.ts) and services/delivery.service.ts both read from
// here instead of hardcoding fee/threshold amounts in more than one
// place.
//
// Version 7, Milestone 168C: replaces the old single "R80 flat fee,
// free at R650 for registered customers only" rule with three
// owner-approved fulfilment methods and a universal (guest-or-
// registered) R600 threshold:
//
//   Courier Guy Locker to Locker, qualifying subtotal < R600  -> R100
//   Courier Guy Locker to Locker, qualifying subtotal >= R600 -> R0 (free)
//   Courier Guy Door to Door,     qualifying subtotal < R600  -> R120
//   Courier Guy Door to Door,     qualifying subtotal >= R600 -> R0 (free)
//   Customer Collection (Pretoria or Thohoyandou)             -> R0, always
//   Any order with no physical items at all                   -> R0, always
//
// The R650 "registered customers only" gate from Milestone 131/152B is
// intentionally REMOVED here: the owner-approved rules above make no
// distinction between guest and registered customers, so free delivery
// at the threshold now applies to every customer. See
// utils/money.ts's calculateDeliveryFee() for the qualifying-subtotal
// definition (physical products only — excludes gift wrapping and
// excludes delivery fees themselves).
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
export const COURIER_LOCKER_FEE = 100;
export const COURIER_DOOR_FEE = 120;
export const COLLECTION_FEE = 0;

// Owner-approved change (Milestone 168C): raised from R650
// (registered-customers-only) to R600 (applies to every customer).
export const FREE_DELIVERY_THRESHOLD = 600;

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
