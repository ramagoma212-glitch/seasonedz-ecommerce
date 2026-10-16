// Milestone 197: public, unauthenticated (but optionally-customer-aware)
// coupon preview endpoint — the cart/checkout page's own "Apply" button
// calls this. Deliberately non-binding, same discipline as
// referralCapture.controller.ts's previewReferralHandler(): the REAL,
// binding coupon resolution only ever happens again, from scratch,
// inside order.service.ts's createOrder() at actual checkout submission.
// Never exposes any internal Coupon id, admin-only field, or another
// customer's redemption data — only exactly what a shopper needs to see.

import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { prisma } from "../config/prisma.js";
import { previewCoupon, type CouponEligibleLine } from "../services/coupon.service.js";

interface PreviewCouponItem {
  productSlug?: unknown;
  variantId?: unknown;
  quantity?: unknown;
}

// Never trusts a client-submitted price/lineTotal for the preview any
// more than checkout itself would — every line's price is resolved fresh
// from the live Product/ProductVariant row, the same "never trust the
// body for money" discipline order.service.ts's own verifyItems() already
// applies. A malformed/unknown line is silently skipped, never a 400 —
// this is a best-effort estimate, not a binding calculation.
//
// Keyed by productSlug, not a raw product id — the frontend's own
// product model (src/js/api/mappers.js's mapApiProductToFrontendShape)
// deliberately uses the slug as its internal `id` everywhere (a
// carry-over from when this site had only static demo data, where id
// and slug were always the same string), so it never actually has the
// database's real cuid to send here. order.service.ts's own
// verifyItems() already resolves every real order's items by slug for
// exactly this reason — this mirrors that proven path instead of
// requiring an id the client structurally cannot provide.
async function resolveEligibleLines(rawItems: unknown): Promise<CouponEligibleLine[]> {
  if (!Array.isArray(rawItems)) return [];
  const lines: CouponEligibleLine[] = [];

  for (const raw of rawItems as PreviewCouponItem[]) {
    const productSlug = typeof raw?.productSlug === "string" ? raw.productSlug : null;
    const variantId = typeof raw?.variantId === "string" ? raw.variantId : null;
    const quantity = Number(raw?.quantity);
    if (!productSlug || !Number.isInteger(quantity) || quantity <= 0) continue;

    const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true, price: true, status: true } });
    if (!product || product.status !== "ACTIVE") continue;

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId: product.id, isActive: true }, select: { price: true } });
      if (!variant) continue;
      lines.push({ productId: product.id, lineTotal: variant.price.times(quantity) });
      continue;
    }

    lines.push({ productId: product.id, lineTotal: product.price.times(quantity) });
  }

  return lines;
}

export async function previewCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser?.id ?? null;
    const customerEmail = req.customerUser?.email ?? null;
    const eligibleLines = await resolveEligibleLines(req.body?.items);

    const result = await previewCoupon(req.body?.code, customerId, customerEmail, eligibleLines);

    sendSuccess(res, {
      message: result.valid ? "Coupon applied." : result.message,
      data: {
        valid: result.valid,
        message: result.message,
        code: result.code,
        discountAmount: result.discountAmount.toNumber(),
        freeDelivery: result.freeDelivery,
      },
    });
  } catch (error) {
    next(error);
  }
}
