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
  productId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
}

// Never trusts a client-submitted price/lineTotal for the preview any
// more than checkout itself would — every line's price is resolved fresh
// from the live Product/ProductVariant row, the same "never trust the
// body for money" discipline order.service.ts's own verifyItems() already
// applies. A malformed/unknown line is silently skipped, never a 400 —
// this is a best-effort estimate, not a binding calculation.
async function resolveEligibleLines(rawItems: unknown): Promise<CouponEligibleLine[]> {
  if (!Array.isArray(rawItems)) return [];
  const lines: CouponEligibleLine[] = [];

  for (const raw of rawItems as PreviewCouponItem[]) {
    const productId = typeof raw?.productId === "string" ? raw.productId : null;
    const variantId = typeof raw?.variantId === "string" ? raw.variantId : null;
    const quantity = Number(raw?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) continue;

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId, isActive: true }, select: { price: true } });
      if (!variant) continue;
      lines.push({ productId, lineTotal: variant.price.times(quantity) });
      continue;
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { price: true, status: true } });
    if (!product || product.status !== "ACTIVE") continue;
    lines.push({ productId, lineTotal: product.price.times(quantity) });
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
      },
    });
  } catch (error) {
    next(error);
  }
}
