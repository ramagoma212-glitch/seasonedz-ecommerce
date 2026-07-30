// Version 7, Milestone 152: secure digital download access. This is
// the ONE place in the backend that ever decides "is this specific
// download allowed right now" — every route (customer, guest-token)
// funnels through the functions here, and every one of them re-checks
// ownership + payment status from the database on every single call,
// never trusting a cached/previous result (Core Rule 4 in the
// milestone brief).
//
// Never returns a raw storagePath/storageBucket to any caller — only
// createSignedDownloadUrl()'s short-lived signed URL (see
// digitalAssetStorage.service.ts), generated fresh on every request and
// never persisted or reused.

import { randomBytes, createHash } from "node:crypto";
import { PaymentStatus, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createSignedDownloadUrl } from "./digitalAssetStorage.service.js";

export class DigitalDownloadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DigitalDownloadError";
    this.statusCode = statusCode;
  }
}

// 5 minutes — long enough for a customer to click through and start
// the download, short enough that a leaked/logged URL (e.g. in a proxy
// or browser history) is useless soon after. Regenerated fresh on every
// download click; never reused across requests.
const SIGNED_URL_EXPIRY_SECONDS = 300;

// 7 days — long enough for a customer who doesn't check email
// immediately, short enough that a compromised inbox years later can't
// still reach a real purchase. Matches this codebase's existing
// "reasonable, bounded expiry" pattern (CustomerSession, password reset).
const GUEST_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface PurchasedDigitalItem {
  orderItemId: string;
  productName: string;
  displayName: string;
  fileType: string;
  fileSizeBytes: number;
  pageCount: number | null;
  version: string | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
}

function humanizeFileType(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return "ZIP";
  return "File";
}

// Shared by both the customer-order and guest-token listing paths —
// takes an already-verified-PAID order id and returns every digital
// line item on it with a real, active, download-enabled asset. Items
// with no asset (shouldn't happen — see order.service.ts's own
// verifyItems()) or a since-deactivated asset are silently omitted
// rather than shown as broken; the "no downloads available" empty
// state is honest either way.
async function listPurchasedDigitalItemsForOrder(orderId: string): Promise<PurchasedDigitalItem[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId, productType: ProductType.DIGITAL, digitalAssetId: { not: null } },
    include: {
      digitalAsset: { select: { displayName: true, mimeType: true, fileSizeBytes: true, pageCount: true, version: true, isActive: true } },
      downloadLog: { select: { downloadCount: true, lastDownloadedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return items
    .filter((item) => item.digitalAsset && item.digitalAsset.isActive)
    .map((item) => ({
      orderItemId: item.id,
      productName: item.productName,
      displayName: item.digitalAsset!.displayName,
      fileType: humanizeFileType(item.digitalAsset!.mimeType),
      fileSizeBytes: item.digitalAsset!.fileSizeBytes,
      pageCount: item.digitalAsset!.pageCount,
      version: item.digitalAsset!.version,
      downloadCount: item.downloadLog?.downloadCount ?? 0,
      lastDownloadedAt: item.downloadLog?.lastDownloadedAt ?? null,
    }));
}

// Re-verifies everything from scratch — orderItemId belongs to an
// order that is genuinely PAID (Core Rule: PENDING/FAILED/CANCELLED/
// REFUNDED never unlock anything), the item is DIGITAL with a real,
// active, download-enabled asset, and (for the customer path) the
// order actually belongs to this customer. Returns the storage path
// only to this module's own signed-URL call below — never to a caller
// outside this file.
async function loadDownloadableItem(orderItemId: string): Promise<{ storagePath: string; digitalAssetId: string } | null> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { select: { paymentStatus: true } },
      digitalAsset: {
        select: { id: true, storagePath: true, isActive: true, product: { select: { downloadEnabled: true } } },
      },
    },
  });

  if (!item) return null;
  if (item.productType !== ProductType.DIGITAL || !item.digitalAsset) return null;
  if (item.order.paymentStatus !== PaymentStatus.PAID) return null;
  if (!item.digitalAsset.isActive || !item.digitalAsset.product.downloadEnabled) return null;

  return { storagePath: item.digitalAsset.storagePath, digitalAssetId: item.digitalAsset.id };
}

async function recordDownload(orderItemId: string, digitalAssetId: string, customerId: string | null): Promise<void> {
  await prisma.digitalDownloadLog.upsert({
    where: { orderItemId },
    create: { orderItemId, digitalAssetId, customerId, downloadCount: 1, lastDownloadedAt: new Date() },
    update: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Logged-in customer access — GET /api/customers/orders/:orderNumber/downloads
// and POST /api/customers/downloads/:orderItemId/request.
// ---------------------------------------------------------------------------

// Deliberately the same "generic not-found, never confirms whether the
// order exists" discipline as customerOrder.service.ts's own
// getOrderForCustomer() — an order that exists but belongs to someone
// else, or genuinely doesn't exist, or exists but isn't PAID yet, are
// all indistinguishable from the outside.
export async function getPurchasedDigitalItemsForCustomerOrder(orderNumber: string, customerId: string): Promise<PurchasedDigitalItem[]> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, customerId: true, paymentStatus: true },
  });

  if (!order || order.customerId !== customerId || order.paymentStatus !== PaymentStatus.PAID) {
    return [];
  }

  return listPurchasedDigitalItemsForOrder(order.id);
}

export interface SignedDownloadResult {
  url: string;
  expiresInSeconds: number;
}

export async function requestSignedDownloadUrlForCustomer(orderItemId: string, customerId: string): Promise<SignedDownloadResult> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { order: { select: { customerId: true } } },
  });

  // Same generic message regardless of which specific check fails
  // (doesn't exist / wrong customer / not paid / not digital) — never
  // reveals which case it was, same discipline as every other
  // ownership check in this codebase.
  if (!item || item.order.customerId !== customerId) {
    throw new DigitalDownloadError("Download not available.", 404);
  }

  const downloadable = await loadDownloadableItem(orderItemId);
  if (!downloadable) {
    throw new DigitalDownloadError("Download not available.", 404);
  }

  const url = await createSignedDownloadUrl(downloadable.storagePath, SIGNED_URL_EXPIRY_SECONDS);
  await recordDownload(orderItemId, downloadable.digitalAssetId, customerId);

  return { url, expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS };
}

// ---------------------------------------------------------------------------
// Guest secure-token access — GET/POST /api/downloads/guest/:token[/...].
// ---------------------------------------------------------------------------

// Called once, right after a guest (customerId-less) order is confirmed
// PAID and is known to contain at least one digital item — see
// payfast.service.ts's processPayfastNotification(). Returns the raw
// token so the caller can put it straight into the one email link it
// will ever appear in; only the SHA-256 hash is ever persisted, same
// discipline as CustomerSession.tokenHash/AdminSession.tokenHash.
export async function createGuestDownloadToken(orderId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + GUEST_TOKEN_EXPIRY_MS);

  await prisma.guestDownloadToken.create({ data: { orderId, tokenHash, expiresAt } });

  return rawToken;
}

async function resolveGuestToken(rawToken: string): Promise<{ orderId: string; tokenId: string } | null> {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashToken(rawToken);
  const record = await prisma.guestDownloadToken.findUnique({
    where: { tokenHash },
    select: { id: true, orderId: true, expiresAt: true, order: { select: { paymentStatus: true } } },
  });

  if (!record) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  if (record.order.paymentStatus !== PaymentStatus.PAID) return null;

  return { orderId: record.orderId, tokenId: record.id };
}

export async function getPurchasedDigitalItemsForGuestToken(rawToken: string): Promise<PurchasedDigitalItem[]> {
  const resolved = await resolveGuestToken(rawToken);
  if (!resolved) return [];

  return listPurchasedDigitalItemsForOrder(resolved.orderId);
}

export async function requestSignedDownloadUrlForGuestToken(rawToken: string, orderItemId: string): Promise<SignedDownloadResult> {
  const resolved = await resolveGuestToken(rawToken);
  if (!resolved) {
    throw new DigitalDownloadError("This download link is invalid or has expired.", 404);
  }

  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
  if (!item || item.orderId !== resolved.orderId) {
    throw new DigitalDownloadError("Download not available.", 404);
  }

  const downloadable = await loadDownloadableItem(orderItemId);
  if (!downloadable) {
    throw new DigitalDownloadError("Download not available.", 404);
  }

  const url = await createSignedDownloadUrl(downloadable.storagePath, SIGNED_URL_EXPIRY_SECONDS);
  await recordDownload(orderItemId, downloadable.digitalAssetId, null);
  await prisma.guestDownloadToken.update({ where: { id: resolved.tokenId }, data: { lastUsedAt: new Date() } });

  return { url, expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS };
}
