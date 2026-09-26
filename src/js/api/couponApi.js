// Milestone 197, Part 7: the public, unauthenticated (optionally
// customer-aware) coupon preview API — backend/src/routes/coupon.routes.ts.
// Deliberately non-binding: this is what the cart/checkout page's own
// "Apply" button calls to show a live preview. The REAL, binding coupon
// resolution only ever happens again, from scratch, at actual order
// creation (order.service.ts) — never trusted as authoritative here.

import { apiPost } from "../apiClient.js";

// `items` is a plain [{productId, variantId?, quantity}] list — the
// backend independently re-resolves each line's real, current price
// itself (coupon.controller.ts's resolveEligibleLines()), never trusting
// anything about price/eligibility this call claims.
export function previewCouponCode(code, items) {
  return apiPost("/coupons/preview", { code, items }, { credentials: "include" });
}
