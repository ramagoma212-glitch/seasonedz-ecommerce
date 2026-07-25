// Delivery configuration (Version 3, Milestone 25 — preparation only;
// rule replaced Version 7, Milestone 131).
//
// Single source of truth for delivery rules — order.service.ts (via
// utils/money.ts) and services/delivery.service.ts both read from
// here instead of hardcoding R80/R500 in more than one place.
//
// Version 7, Milestone 131: the old flat "free over R700 for
// everyone" rule is removed entirely. Free delivery is now a
// registered-account benefit, not a guest one:
//
//   Guest (not logged in)                          -> delivery fee R80, always
//   Logged-in registered customer, subtotal < R500  -> delivery fee R80
//   Logged-in registered customer, subtotal >= R500 -> delivery fee R0 (free)
//
// "Logged-in registered customer" is decided server-side only, from
// the verified customer_session cookie (req.customerUser.type ===
// "REGISTERED") — never from anything a request body claims. See
// order.service.ts's createOrder() and utils/money.ts's
// calculateDeliveryFee().
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
export const STANDARD_DELIVERY_FEE = 80;
export const REGISTERED_FREE_DELIVERY_THRESHOLD = 500;

export const DEFAULT_COUNTRY = "South Africa";

// Always false for now — no real courier API is integrated anywhere
// in this codebase. Flipping this on is meaningless until a real
// provider integration exists; see backend/DELIVERY_SETUP.md for what
// that would actually require.
export const COURIER_INTEGRATION_ENABLED = false;

// "manual" is the only supported value right now — Seasonedz Group
// staff set Shipping.status/courierName/trackingNumber by hand. A
// future real integration would replace this with a provider name
// (e.g. "courier-guy", "pudo", "bobgo") once it actually exists.
export const COURIER_PROVIDER = "manual";
