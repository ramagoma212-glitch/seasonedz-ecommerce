// Version 7, Milestone 172B.4: public, unauthenticated referral capture
// and preview — the only backend surface a storefront visitor's browser
// ever talks to directly for the referral programme. Deliberately its
// own file, separate from referralAffiliate.service.ts (admin-only
// Affiliate management) — this file never requires requireAdminAuth and
// must be safe to call from any anonymous visitor.
//
// captureReferral() issues a first-party signed {code, capturedAt,
// signature} token (see utils/referralAttributionToken.ts) — the exact
// object the frontend stores as-is in Local Storage (seasonedz_referral)
// and later sends back, unchanged, as part of an order. It deliberately
// signs and returns a token for ANY well-formed code, even one that
// doesn't currently match an ACTIVE affiliate: real eligibility (ACTIVE
// affiliate, active programme, unexpired attribution) is only ever
// authoritative at actual order-creation time (order.service.ts), never
// here — see this file's own isValid/discountRatePercent fields below,
// which are a DISPLAY-ONLY preview, safe to compute since nothing
// financial is ever decided or trusted from this endpoint's response.
//
// previewReferral() re-checks an ALREADY-captured token (never mints a
// new one) — used by the checkout page to show a live "Referral
// discount applied" preview without silently re-arming the customer's
// attribution window on every checkout page load (which minting a new
// token here would do). Only captureReferral(), called at the moment a
// real ?ref=CODE link is followed, is allowed to reset that clock.

import { AffiliateStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { validateReferralCodeFormat } from "./referralAffiliate.service.js";
import { getReferralProgrammeSettings } from "./referralProgrammeSettings.service.js";
import { signReferralCapture, verifyReferralCapture, captureAgeInDays } from "../utils/referralAttributionToken.js";

export class ReferralCaptureError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ReferralCaptureError";
    this.statusCode = statusCode;
  }
}

export interface ReferralCaptureOutput {
  code: string;
  capturedAt: string;
  signature: string;
  isValid: boolean;
  discountRatePercent: number;
}

export async function captureReferral(rawCode: unknown): Promise<ReferralCaptureOutput> {
  if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
    throw new ReferralCaptureError("code is required.");
  }

  const code = validateReferralCodeFormat(rawCode);

  const [affiliate, settings] = await Promise.all([
    prisma.affiliate.findUnique({ where: { referralCode: code }, select: { status: true, discountRateOverride: true } }),
    getReferralProgrammeSettings(),
  ]);

  const isValid = Boolean(affiliate) && affiliate!.status === AffiliateStatus.ACTIVE && settings.isProgrammeActive;
  const discountRatePercent = affiliate?.discountRateOverride ? affiliate.discountRateOverride.toNumber() : settings.defaultReferralDiscountRate;

  const signed = signReferralCapture(code);

  return { ...signed, isValid, discountRatePercent };
}

export interface ReferralPreviewOutput {
  isValid: boolean;
  discountRatePercent: number;
}

// Never throws — a malformed/tampered/expired token is simply
// "isValid: false", the same silent-degrade discipline
// order.service.ts's own resolution applies at real checkout time (a
// referral problem must never surface as an error to the customer).
export async function previewReferral(rawCode: unknown, rawCapturedAt: unknown, rawSignature: unknown): Promise<ReferralPreviewOutput> {
  const settings = await getReferralProgrammeSettings();
  const fallbackRate = settings.defaultReferralDiscountRate;

  if (typeof rawCode !== "string" || typeof rawCapturedAt !== "string" || typeof rawSignature !== "string") {
    return { isValid: false, discountRatePercent: fallbackRate };
  }

  const verified = verifyReferralCapture({ code: rawCode, capturedAt: rawCapturedAt, signature: rawSignature });
  if (!verified) return { isValid: false, discountRatePercent: fallbackRate };

  if (!settings.isProgrammeActive) return { isValid: false, discountRatePercent: fallbackRate };
  if (captureAgeInDays(verified.capturedAt) > settings.attributionWindowDays) return { isValid: false, discountRatePercent: fallbackRate };

  const affiliate = await prisma.affiliate.findUnique({ where: { referralCode: verified.code }, select: { status: true, discountRateOverride: true } });
  const isValid = Boolean(affiliate) && affiliate!.status === AffiliateStatus.ACTIVE;
  const discountRatePercent = affiliate?.discountRateOverride ? affiliate.discountRateOverride.toNumber() : fallbackRate;

  return { isValid, discountRatePercent };
}
