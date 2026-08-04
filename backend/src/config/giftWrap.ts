// Gift wrapping configuration (Version 7, Milestone 159).
//
// Single source of truth for the gift-wrap fee and message length limit
// — order.service.ts (via utils/money.ts) and order.validator.ts both
// read from here instead of hardcoding R30/150 in more than one place.
// The frontend (src/js/cart.js) mirrors GIFT_WRAP_FEE_PER_ITEM for
// display purposes only — same "client shows an estimate, backend is
// authoritative" discipline as the delivery fee constants in
// config/delivery.ts. A request body's own claimed gift-wrap price is
// never read anywhere in this codebase; every fee is computed here.

// Plain number, not Prisma.Decimal — a whole Rand amount (no fractional
// cents), so there's no floating-point risk in the constant itself.
// Callers that do arithmetic against a Decimal (utils/money.ts) wrap
// this in `new Prisma.Decimal(...)` at the point of use.
export const GIFT_WRAP_FEE_PER_ITEM = 30;

export const GIFT_MESSAGE_MAX_LENGTH = 150;

// Gift wrapping only ever applies to a real, physical, shippable item —
// see order.service.ts's verifyItems() for the actual enforcement
// (never trusts a client-supplied giftWrap flag for a DIGITAL item,
// regardless of what the request body claims).
export const GIFT_WRAP_ELIGIBLE_PRODUCT_TYPE = "PHYSICAL" as const;
