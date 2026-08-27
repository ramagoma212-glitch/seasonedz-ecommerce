// Version 7, Milestone 174C: customer notification preferences — brief
// sections 21-22. Deliberately narrow: only the four genuinely
// optional/engagement categories exist as fields at all (review
// requests, stock alerts, wishlist alerts, abandoned checkout) —
// essential/transactional notifications (orders, payments, delivery,
// security, affiliate status, commission/payout) have structurally no
// opt-out anywhere in this codebase, matching brief section 21's own
// "do not allow an opt-out that would prevent required operational
// communication."
//
// A row is only ever created lazily, the first time a customer
// changes something away from the default — see
// getNotificationPreferences() below for why "no row yet" and "row
// with every field false" mean exactly the same thing to every caller
// in this codebase (productReviewRequest.service.ts included).
import { prisma } from "../config/prisma.js";

export interface NotificationPreferenceOutput {
  reviewRequestsOptOut: boolean;
  stockAlertsOptOut: boolean;
  wishlistAlertsOptOut: boolean;
  abandonedCheckoutOptOut: boolean;
}

const DEFAULTS: NotificationPreferenceOutput = {
  reviewRequestsOptOut: false,
  stockAlertsOptOut: false,
  wishlistAlertsOptOut: false,
  abandonedCheckoutOptOut: false,
};

export async function getNotificationPreferences(customerId: string): Promise<NotificationPreferenceOutput> {
  const row = await prisma.notificationPreference.findUnique({ where: { customerId } });
  if (!row) return { ...DEFAULTS };
  return {
    reviewRequestsOptOut: row.reviewRequestsOptOut,
    stockAlertsOptOut: row.stockAlertsOptOut,
    wishlistAlertsOptOut: row.wishlistAlertsOptOut,
    abandonedCheckoutOptOut: row.abandonedCheckoutOptOut,
  };
}

// Only ever reads/writes the four known boolean fields — an unknown
// key in the request body is silently ignored, same "unknown/invalid
// extra data is dropped, not fatal" discipline order.validator.ts
// already established. Each field is only touched if the request body
// actually included it, so a partial update (e.g. just
// {stockAlertsOptOut: true}) can never accidentally reset the other
// three back to their default.
export async function updateNotificationPreferences(customerId: string, input: Record<string, unknown>): Promise<NotificationPreferenceOutput> {
  const data: Partial<NotificationPreferenceOutput> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof NotificationPreferenceOutput)[]) {
    if (typeof input[key] === "boolean") data[key] = input[key] as boolean;
  }

  const row = await prisma.notificationPreference.upsert({
    where: { customerId },
    create: { customerId, ...DEFAULTS, ...data },
    update: data,
  });

  return {
    reviewRequestsOptOut: row.reviewRequestsOptOut,
    stockAlertsOptOut: row.stockAlertsOptOut,
    wishlistAlertsOptOut: row.wishlistAlertsOptOut,
    abandonedCheckoutOptOut: row.abandonedCheckoutOptOut,
  };
}
