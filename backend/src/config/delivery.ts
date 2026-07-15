// Delivery configuration (Version 3, Milestone 25 — preparation only).
//
// Single source of truth for delivery rules — order.service.ts (via
// utils/money.ts) and services/delivery.service.ts both read from
// here instead of hardcoding R80/R700 in more than one place. The
// rule itself is unchanged from earlier milestones:
//
//   Subtotal below R700  -> delivery fee R80
//   Subtotal R700 or more -> delivery fee R0 (free)
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
export const FREE_DELIVERY_THRESHOLD = 700;

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
