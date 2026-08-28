// Version 7, Milestone 174C: back-in-stock subscriptions — brief
// sections 23-25, 45-46. Deliberately logged-in-only — see
// schema.prisma's own StockAlertSubscription comment for why no guest
// email variant exists in V1.
import { StockAlertStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { renderStockAlertEmail } from "./email/emailTemplates.js";
import { enqueueAndSendNow } from "./notificationEngine.service.js";

export class StockAlertError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "StockAlertError";
    this.statusCode = statusCode;
  }
}

export interface StockAlertSubscriptionOutput {
  id: string;
  productId: string;
  status: StockAlertStatus;
  createdAt: Date;
}

// Idempotent: a customer who already has a PENDING subscription for
// this exact product gets that same row back rather than a duplicate
// — the application-layer half of the "no DB-level unique constraint,
// see schema.prisma's own comment" design (a hard unique on
// (productId, customerId) would permanently block a genuine
// re-subscribe once the first one is NOTIFIED — brief section 24).
// Version 7, Milestone 174C: takes a product SLUG, not the internal
// database id — matching this whole frontend's own established
// convention (order.validator.ts's own ValidatedOrderItem.productSlug,
// the public product API's own primary identifier in every existing
// customer-facing URL/button). The real Product.id (what the Prisma
// relation this table's own foreign key actually needs) is resolved
// here, once, and never leaves this function.
export async function subscribeToStockAlert(customerId: string, productSlug: string): Promise<StockAlertSubscriptionOutput> {
  const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true, stockQuantity: true } });
  if (!product) {
    throw new StockAlertError(`Product not found: ${productSlug}`, 404);
  }
  if (product.stockQuantity > 0) {
    throw new StockAlertError("This product is currently in stock. No alert needed.", 409);
  }

  const existing = await prisma.stockAlertSubscription.findFirst({
    where: { productId: product.id, customerId, status: StockAlertStatus.PENDING },
  });
  if (existing) return existing;

  return prisma.stockAlertSubscription.create({ data: { productId: product.id, customerId, status: StockAlertStatus.PENDING } });
}

async function hasOptedOutOfStockAlerts(customerId: string): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({ where: { customerId }, select: { stockAlertsOptOut: true } });
  return pref?.stockAlertsOptOut ?? false;
}

// Called strictly after a genuine stock 0 -> positive transition has
// already committed (see adminProduct.service.ts's own hook) — never
// speculatively, and never re-fired just because stock increased again
// while already positive (brief section 24 — "do not email every time
// stock increases"). Each PENDING subscription is claimed
// (PENDING -> NOTIFIED) via a single conditional updateMany per row —
// the same atomic-claim discipline notificationEngine.service.ts's own
// attemptSend() uses — so two concurrent admin stock edits can never
// double-notify the same subscriber (brief section 25).
export async function notifyStockAlertSubscribersForProduct(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, slug: true } });
  if (!product) return;

  const subscriptions = await prisma.stockAlertSubscription.findMany({
    where: { productId, status: StockAlertStatus.PENDING },
    select: { id: true, customerId: true },
  });
  if (subscriptions.length === 0) return;

  const productUrl = `${preferredFrontendBaseUrl()}/product/${product.slug}`;

  for (const subscription of subscriptions) {
    const claim = await prisma.stockAlertSubscription.updateMany({
      where: { id: subscription.id, status: StockAlertStatus.PENDING },
      data: { status: StockAlertStatus.NOTIFIED, notifiedAt: new Date() },
    });
    if (claim.count === 0) continue; // Already claimed by a concurrent run.

    if (await hasOptedOutOfStockAlerts(subscription.customerId)) continue;

    const customer = await prisma.customer.findUnique({ where: { id: subscription.customerId }, select: { firstName: true, email: true } });
    if (!customer) continue;

    void enqueueAndSendNow({
      eventType: "STOCK_ALERT",
      templateName: "stock-alert",
      recipientEmail: customer.email,
      recipientCustomerId: subscription.customerId,
      productId,
      dedupeKey: `STOCK_ALERT:${subscription.id}`,
      rendered: renderStockAlertEmail({ customerFirstName: customer.firstName, productName: product.name, productUrl }),
    }).catch(() => {});
  }
}
