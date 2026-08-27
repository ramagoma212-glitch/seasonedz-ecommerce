// Version 7, Milestone 174C: abandoned checkout recovery — brief
// sections 30-37. See schema.prisma's own CheckoutIntent comment for
// why recoveryToken is stored in plain, opaque form rather than
// hashed.
import { randomBytes } from "node:crypto";
import { CheckoutIntentStatus, type Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { renderAbandonedCheckoutReminderEmail } from "./email/emailTemplates.js";
import { scheduleNotification, cancelPendingNotificationByDedupeKey, type LazyRenderOutcome } from "./notificationEngine.service.js";

// Brief section 32's own recommended V1 delay.
const ABANDONMENT_DELAY_MS = 2 * 60 * 60 * 1000;

// productSlug (never the internal database id) — matching this whole
// frontend's own established "product identity = slug" convention,
// same as subscribeToStockAlert()/addToWishlist() (stockAlert.service.ts/
// wishlist.service.ts).
export interface CheckoutIntentCartItem {
  productSlug: string;
  quantity: number;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseCartItems(raw: unknown): CheckoutIntentCartItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CheckoutIntentCartItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.productSlug === "string" && record.productSlug.trim() && typeof record.quantity === "number" && Number.isInteger(record.quantity) && record.quantity > 0) {
      items.push({ productSlug: record.productSlug, quantity: record.quantity });
    }
  }
  return items;
}

function reminderDedupeKey(intentId: string): string {
  return `ABANDONED_CHECKOUT_REMINDER:${intentId}`;
}

// Called repeatedly, debounced, by the frontend as a customer fills in
// their checkout details — never awaited into a slow response by its
// own controller, never a hard failure for checkout itself. A no-op
// unless there's genuinely enough information to act on later (brief
// section 31): a valid email, at least one real cart item.
export async function captureCheckoutIntent(params: { email: unknown; customerId: string | null; items: unknown }): Promise<void> {
  if (!isValidEmail(params.email)) return;
  const items = parseCartItems(params.items);
  if (items.length === 0) return;

  const email = params.email.trim().toLowerCase();

  const existing = await prisma.checkoutIntent.findFirst({
    where: { email, status: CheckoutIntentStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // Section 32's own "no minute-perfect scheduling needed" spirit
    // applies here too — later debounced captures for the same still-
    // ACTIVE intent only ever refresh the cart snapshot; the reminder
    // stays scheduled from the FIRST capture, never pushed out further
    // by continued typing.
    await prisma.checkoutIntent.update({
      where: { id: existing.id },
      data: { cartSnapshot: items as unknown as Prisma.InputJsonValue, customerId: params.customerId ?? existing.customerId },
    });
    return;
  }

  const recoveryToken = randomBytes(24).toString("hex");
  const intent = await prisma.checkoutIntent.create({
    data: { email, customerId: params.customerId, cartSnapshot: items as unknown as Prisma.InputJsonValue, recoveryToken, status: CheckoutIntentStatus.ACTIVE },
  });

  await scheduleNotification({
    eventType: "ABANDONED_CHECKOUT_REMINDER",
    templateName: "abandoned-checkout-reminder",
    recipientEmail: email,
    recipientCustomerId: params.customerId ?? undefined,
    dedupeKey: reminderDedupeKey(intent.id),
    scheduledAt: new Date(Date.now() + ABANDONMENT_DELAY_MS),
  });
}

// Called after a genuine successful order placement (order.controller.ts)
// — cancels any pending reminder for this identity so a completed
// purchase never gets a "still interested?" email (brief section 34).
// Matched on email (always known) — a guest and a logged-in customer
// checking out with the same email are still the same real person for
// this purpose.
export async function markCheckoutIntentRecovered(email: string): Promise<void> {
  const normalisedEmail = email.trim().toLowerCase();
  const intents = await prisma.checkoutIntent.findMany({
    where: { email: normalisedEmail, status: CheckoutIntentStatus.ACTIVE },
    select: { id: true },
  });
  if (intents.length === 0) return;

  await prisma.checkoutIntent.updateMany({
    where: { id: { in: intents.map((intent) => intent.id) } },
    data: { status: CheckoutIntentStatus.RECOVERED },
  });

  for (const intent of intents) {
    await cancelPendingNotificationByDedupeKey(reminderDedupeKey(intent.id));
  }
}

// The lazy renderer — dynamically imported and called by
// notificationEngine.service.ts's attemptSend() at the moment an
// ABANDONED_CHECKOUT_REMINDER row is actually due. The intent id is
// recovered from the row's own dedupeKey (this file's own format,
// "ABANDONED_CHECKOUT_REMINDER:<id>") rather than a dedicated column —
// see notificationEngine.service.ts's own comment on why the generic
// orderNumber/affiliateId/productId reference fields don't cleanly fit
// "which CheckoutIntent was this."
export async function renderAbandonedCheckoutReminderContent(row: { dedupeKey: string; recipientCustomerId: string | null }): Promise<LazyRenderOutcome> {
  const intentId = row.dedupeKey.split(":")[1];
  if (!intentId) {
    return { kind: "cancel", reason: "Malformed dedupeKey — no CheckoutIntent id." };
  }

  const intent = await prisma.checkoutIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.status !== CheckoutIntentStatus.ACTIVE) {
    // Section 34: already recovered (a real order followed) or
    // expired — never send a misleading recovery email either way.
    return { kind: "cancel", reason: "This checkout was already completed, or the intent is no longer active." };
  }

  if (row.recipientCustomerId) {
    const pref = await prisma.notificationPreference.findUnique({ where: { customerId: row.recipientCustomerId }, select: { abandonedCheckoutOptOut: true } });
    if (pref?.abandonedCheckoutOptOut) {
      return { kind: "cancel", reason: "Customer opted out of abandoned-checkout reminders." };
    }
  }

  let customerFirstName: string | null = null;
  if (intent.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: intent.customerId }, select: { firstName: true } });
    customerFirstName = customer?.firstName ?? null;
  }

  await prisma.checkoutIntent.update({ where: { id: intent.id }, data: { status: CheckoutIntentStatus.REMINDED, remindedAt: new Date() } });

  const rendered = renderAbandonedCheckoutReminderEmail({
    customerFirstName,
    recoveryUrl: `${preferredFrontendBaseUrl()}/cart?recover=${intent.recoveryToken}`,
  });

  return { kind: "send", rendered };
}

export interface RecoveredCartItem {
  productSlug: string;
  productName: string;
  price: number;
  image: string | null;
  quantity: number;
}

// Public (unauthenticated — a guest needs this too), read-only, and
// deliberately returns only product references/quantities plus the
// CURRENT live price/image (never the price as it was at capture time)
// — brief section 35's own "never trust saved old prices": the
// frontend merges these into a normal cart using this response's own
// fresh values, and the existing checkout flow still independently
// re-derives every price/stock fact live at order-creation time
// regardless, exactly as it already does for any other cart line.
// Silently drops a line item whose product no longer exists rather
// than failing the whole recovery.
export async function getRecoverableCartByToken(token: string): Promise<RecoveredCartItem[] | null> {
  if (!token || typeof token !== "string") return null;

  const intent = await prisma.checkoutIntent.findUnique({ where: { recoveryToken: token } });
  if (!intent || intent.status === CheckoutIntentStatus.RECOVERED) return null;

  const items = parseCartItems(intent.cartSnapshot);
  if (items.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { slug: { in: items.map((item) => item.productSlug) } },
    select: { slug: true, name: true, price: true, images: { where: { isPrimary: true }, select: { url: true }, take: 1 } },
  });
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));

  return items
    .filter((item) => productsBySlug.has(item.productSlug))
    .map((item) => {
      const product = productsBySlug.get(item.productSlug)!;
      return { productSlug: item.productSlug, productName: product.name, price: product.price.toNumber(), image: product.images[0]?.url ?? null, quantity: item.quantity };
    });
}
