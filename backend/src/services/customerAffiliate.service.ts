// Version 7, Milestone 172B.6: the affiliate-facing portal — reuses the
// EXISTING customer authentication (CustomerSession) entirely; there is
// no second affiliate login/password anywhere. Affiliate identity is
// always derived from the authenticated Customer.id via
// Affiliate.customerId (@unique on that column since 172B.3) — never
// from an affiliate id, referral code, or email supplied by the
// client. getMyAffiliatePortal()/applyForAffiliateProgramme() both take
// only a customerId, sourced exclusively from req.customerUser.id
// (requireCustomerAuth), matching this backend's own "never trust the
// body for identity" discipline (order.service.ts, customerOrder.service.ts).
//
// Duplicate-application protection is not reimplemented here —
// applyForAffiliateProgramme() calls referralAffiliate.service.ts's
// existing createAffiliate(), which already enforces "this customer is
// already linked to another affiliate" (assertCustomerExistsAndUnlinked)
// and "this email is already in use" as 409s. Reusing it, rather than
// writing a second duplicate-check, is what makes it structurally
// impossible for the two code paths to disagree.

import { AffiliateStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createAffiliate, type AffiliateOutput } from "./referralAffiliate.service.js";
import { getReferralProgrammeSettings } from "./referralProgrammeSettings.service.js";
import { resolveCommissionRate, resolveDiscountRate } from "./referralPricing.service.js";
import { getAffiliateCommissionTotals, type AffiliateCommissionTotals } from "./referralCommission.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";

export class CustomerAffiliateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CustomerAffiliateError";
    this.statusCode = statusCode;
  }
}

// A recent commission row, shown to the AFFILIATE themselves — never
// the referred customer's own email/name/phone/address (§13 of the
// brief: minimise personal information). orderNumber is not personal
// data about the referred customer; it's an opaque reference.
export interface AffiliatePortalCommission {
  orderNumber: string;
  orderDate: Date;
  qualifyingProductSubtotal: number;
  discountAmount: number;
  commissionAmount: number;
  commissionStatus: string;
}

const RECENT_COMMISSIONS_LIMIT = 20;

export interface AffiliatePortalOutput {
  status: AffiliateStatus;
  referralCode: string;
  referralLink: string;
  effectiveCommissionRate: number;
  effectiveDiscountRate: number;
  commissionTotals: AffiliateCommissionTotals;
  payoutDayOfMonth: number;
  payoutFrequency: "monthly";
  recentCommissions: AffiliatePortalCommission[];
}

// Returns null when this customer has no linked affiliate at all —
// the frontend shows an "Apply" prompt in that case. Never throws for
// a missing affiliate; that's an ordinary, expected state, not an
// error.
export async function getMyAffiliatePortal(customerId: string): Promise<AffiliatePortalOutput | null> {
  const affiliate = await prisma.affiliate.findUnique({ where: { customerId } });
  if (!affiliate) return null;

  const [settings, commissionTotals, recentCommissionRows] = await Promise.all([
    getReferralProgrammeSettings(),
    getAffiliateCommissionTotals(affiliate.id),
    prisma.orderAffiliateCommission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_COMMISSIONS_LIMIT,
      select: {
        qualifyingProductSubtotal: true,
        discountAmount: true,
        commissionAmount: true,
        status: true,
        order: { select: { orderNumber: true, createdAt: true } },
      },
    }),
  ]);

  const effectiveCommissionRate = resolveCommissionRate(
    { discountRateOverride: affiliate.discountRateOverride, commissionRateOverride: affiliate.commissionRateOverride },
    { defaultReferralDiscountRate: new Prisma.Decimal(settings.defaultReferralDiscountRate), defaultCommissionRate: new Prisma.Decimal(settings.defaultCommissionRate) }
  ).toNumber();
  const effectiveDiscountRate = resolveDiscountRate(
    { discountRateOverride: affiliate.discountRateOverride, commissionRateOverride: affiliate.commissionRateOverride },
    { defaultReferralDiscountRate: new Prisma.Decimal(settings.defaultReferralDiscountRate), defaultCommissionRate: new Prisma.Decimal(settings.defaultCommissionRate) }
  ).toNumber();

  return {
    status: affiliate.status,
    referralCode: affiliate.referralCode,
    // A ?ref= link to the storefront root — the frontend can build the
    // same query param onto any real product page too (see §12 of the
    // brief); this is just the simplest, always-valid default. Never
    // an SEO-indexed dedicated page — see seo.js's own canonical logic
    // (172B.4), which already strips every query string, ?ref=
    // included.
    referralLink: `${preferredFrontendBaseUrl()}/?ref=${encodeURIComponent(affiliate.referralCode)}`,
    effectiveCommissionRate,
    effectiveDiscountRate,
    commissionTotals,
    payoutDayOfMonth: settings.payoutDayOfMonth,
    payoutFrequency: "monthly",
    recentCommissions: recentCommissionRows.map((row) => ({
      orderNumber: row.order.orderNumber,
      orderDate: row.order.createdAt,
      qualifyingProductSubtotal: row.qualifyingProductSubtotal.toNumber(),
      discountAmount: row.discountAmount.toNumber(),
      commissionAmount: row.commissionAmount.toNumber(),
      commissionStatus: row.status,
    })),
  };
}

// Application flow (§18 of the brief): the customer must already be
// signed in (requireCustomerAuth) — there is no separate public
// application form. Deliberately zero required input beyond the
// authenticated session itself: name/email/phone are always the
// customer's own real account details, never anything typed into a
// form field, so there is nothing here for a customer to misrepresent.
// createAffiliate() always starts the new row PENDING — an application
// can never self-approve.
export async function applyForAffiliateProgramme(customerId: string): Promise<AffiliateOutput> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { firstName: true, lastName: true, email: true, phone: true } });
  if (!customer) {
    throw new CustomerAffiliateError("Customer account not found.", 404);
  }

  return createAffiliate({
    customerId,
    name: `${customer.firstName} ${customer.lastName}`.trim(),
    email: customer.email,
    phone: customer.phone,
  });
}
