// Version 7, Milestone 174C: server-backed wishlist for a logged-in
// Customer — brief sections 26-29. The guest, Local-Storage-only
// wishlist (src/js/wishlist.js) is completely unchanged and untouched
// by anything in this file; this is purely the server-sync layer that
// activates once a customer is authenticated.
import { prisma } from "../config/prisma.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { renderWishlistStockAlertEmail } from "./email/emailTemplates.js";
import { enqueueAndSendNow } from "./notificationEngine.service.js";

export class WishlistError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "WishlistError";
    this.statusCode = statusCode;
  }
}

export interface WishlistItemOutput {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  price: number;
  imageUrl: string | null;
  inStock: boolean;
  createdAt: Date;
}

const productSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  stockQuantity: true,
  images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
} satisfies import("@prisma/client").Prisma.ProductSelect;

export async function listWishlistForCustomer(customerId: string): Promise<WishlistItemOutput[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: productSelect } },
  });

  // A wishlisted product that was later deleted from the catalogue has
  // no live Product row left to display — silently excluded, same
  // "never depend on a row that might be gone" discipline OrderItem's
  // own nullable productId already established, never a broken entry.
  return rows
    .filter((row) => row.product)
    .map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product!.name,
      productSlug: row.product!.slug,
      price: row.product!.price.toNumber(),
      imageUrl: row.product!.images[0]?.url ?? null,
      inStock: row.product!.stockQuantity > 0,
      createdAt: row.createdAt,
    }));
}

// Version 7, Milestone 174C: both take a product SLUG, not the
// internal database id — see subscribeToStockAlert()'s own comment
// (stockAlert.service.ts) for why this matches the frontend's own
// established "product identity = slug" convention throughout. The
// real Product.id is resolved here, once, and never leaves either
// function.
//
// Idempotent — adding an already-wishlisted product is a safe no-op,
// never a 409 (matches the guest Local-Storage wishlist's own
// addToWishlist() behaviour, which the frontend already expects).
export async function addToWishlist(customerId: string, productSlug: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
  if (!product) {
    throw new WishlistError(`Product not found: ${productSlug}`, 404);
  }

  try {
    await prisma.wishlistItem.create({ data: { customerId, productId: product.id } });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") return;
    throw error;
  }
}

export async function removeFromWishlist(customerId: string, productSlug: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
  if (!product) return;
  await prisma.wishlistItem.deleteMany({ where: { customerId, productId: product.id } });
}

// Called once, right after a successful login — brief section 27.
// Merges the guest browser's Local-Storage product slugs (see
// addToWishlist()'s own comment on why slug, not id) into the server
// wishlist; a product already saved server-side is silently absorbed
// (the same @@unique-backed idempotency addToWishlist() itself relies
// on), never duplicated, and a slug that no longer resolves to a real
// Product is silently skipped rather than erroring the whole merge —
// never removes anything already on the server side either.
export async function mergeGuestWishlistIntoAccount(customerId: string, guestProductSlugs: string[]): Promise<void> {
  const uniqueSlugs = Array.from(new Set(guestProductSlugs.filter((slug) => typeof slug === "string" && slug.trim().length > 0)));
  if (uniqueSlugs.length === 0) return;

  const realProducts = await prisma.product.findMany({ where: { slug: { in: uniqueSlugs } }, select: { id: true } });

  for (const product of realProducts) {
    try {
      await prisma.wishlistItem.create({ data: { customerId, productId: product.id } });
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
}

async function hasOptedOutOfWishlistAlerts(customerId: string): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({ where: { customerId }, select: { wishlistAlertsOptOut: true } });
  return pref?.wishlistAlertsOptOut ?? false;
}

// Called from the same 0 -> positive stock-transition hook as
// stockAlert.service.ts's notifyStockAlertSubscribersForProduct() —
// see adminProduct.service.ts's updateProduct(). A genuinely separate
// mechanism from an explicit StockAlertSubscription (brief sections 23
// vs. 28): a customer who both wishlisted AND explicitly subscribed to
// the same product may, in this rare overlap, receive two emails —
// accepted as a harmless edge case for V1 rather than building a
// cross-mechanism merge layer for it (each email is independently
// accurate; neither is spam on its own).
export async function notifyWishlistStockAlertsForProduct(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, slug: true } });
  if (!product) return;

  const items = await prisma.wishlistItem.findMany({ where: { productId }, select: { id: true, customerId: true } });
  if (items.length === 0) return;

  const productUrl = `${preferredFrontendBaseUrl()}/product/${product.slug}`;
  // Captured once, shared by every subscriber notified for this one
  // restock event — see the dedupeKey comment below for why this
  // (not just the wishlist item's own id) is what makes a *second*,
  // later restock of the same still-wishlisted product genuinely
  // eligible for its own fresh alert, rather than being silently
  // blocked forever by the first one's dedupeKey.
  const restockEventAt = new Date().toISOString();

  for (const item of items) {
    if (await hasOptedOutOfWishlistAlerts(item.customerId)) continue;

    const customer = await prisma.customer.findUnique({ where: { id: item.customerId }, select: { firstName: true, email: true } });
    if (!customer) continue;

    void enqueueAndSendNow({
      eventType: "WISHLIST_STOCK_ALERT",
      templateName: "wishlist-stock-alert",
      recipientEmail: customer.email,
      recipientCustomerId: item.customerId,
      productId,
      dedupeKey: `WISHLIST_STOCK_ALERT:${item.id}:${restockEventAt}`,
      rendered: renderWishlistStockAlertEmail({ customerFirstName: customer.firstName, productName: product.name, productUrl }),
    }).catch(() => {});
  }
}
