// Milestone 189: automated welcome gift (three free sample PDFs) for a
// genuinely new, newly-verified customer. This is the ONE place that
// decides "should this customer receive the gift right now" and "is
// this token/asset-key pair allowed to download anything" — every
// trigger point (customerAuth.controller.ts's verify-email handler,
// socialAuth.service.ts's first-time social sign-in) and every request
// (welcomeGift.controller.ts) funnels through the functions here, same
// "one authoritative place" discipline as digitalDownload.service.ts.
//
// One-time-delivery guarantee: WelcomeGiftDelivery.customerId is
// @unique (schema.prisma) — prisma.welcomeGiftDelivery.create() is
// attempted BEFORE any Brevo send is attempted, so a concurrent
// duplicate trigger (retried verification callback, double-click, a
// race between two requests) collides on the database's own unique
// constraint and silently no-ops here: no retry, no second email, no
// error surfaced to the caller. status only ever moves CLAIMED -> SENT
// or CLAIMED -> FAILED, once, by whichever call wins the create() race;
// FAILED is terminal — there is no automatic retry, by design (a
// welcome-gift send failure must never repeatedly hammer Brevo).
//
// Never trusts a client-supplied asset key beyond checking it against
// WELCOME_GIFT_ASSET_KEYS — the only three values that will ever exist
// — defence against IDOR/path-traversal/arbitrary-asset-selection.
// Never returns a raw storagePath/storageBucket to any caller, only a
// freshly-generated short-lived signed URL, same discipline as
// digitalDownload.service.ts.

import { randomBytes, createHash } from "node:crypto";
import { Prisma, WelcomeGiftDeliveryStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { digitalAssetStorage } from "./digitalAssetStorage.service.js";
import { sendWelcomeGiftEmail } from "./email/email.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";

// Stable internal identifiers, independent of whatever filename an
// admin eventually uploads — see adminWelcomeGiftAsset.service.ts.
// This exact tuple is the strict server-side allowlist; nothing else
// is ever accepted as a valid asset key anywhere in this feature.
export const WELCOME_GIFT_ASSET_KEYS = ["abc_sample", "mindfulness_sample", "creative_activity_sample"] as const;
export type WelcomeGiftAssetKey = (typeof WELCOME_GIFT_ASSET_KEYS)[number];

function isWelcomeGiftAssetKey(value: string): value is WelcomeGiftAssetKey {
  return (WELCOME_GIFT_ASSET_KEYS as readonly string[]).includes(value);
}

// 180 days — generous, unlike a purchase download link: this is a
// goodwill gift with no payment/dispute window behind it, and the
// email itself is the only place the link is ever sent, so there is no
// urgency-driven reason to expire it quickly. Matches this codebase's
// existing "reasonable, bounded expiry" pattern (CustomerSession,
// password reset, GuestDownloadToken) rather than inventing a new one.
const DOWNLOAD_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// Same 5-minute window as digitalDownload.service.ts's own
// SIGNED_URL_EXPIRY_SECONDS, for the same reasoning — regenerated fresh
// on every download click, never reused.
const SIGNED_URL_EXPIRY_SECONDS = 300;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Logged at most once per process, not once per registration — a
// misconfigured/not-yet-configured feature shouldn't spam the logs
// every time a new customer verifies while the owner hasn't uploaded
// the real PDFs yet.
let loggedNotConfiguredOnce = false;

async function allAssetsConfigured(): Promise<boolean> {
  const rows = await prisma.welcomeGiftAsset.findMany({
    where: { assetKey: { in: [...WELCOME_GIFT_ASSET_KEYS] } },
    select: { assetKey: true, isConfigured: true },
  });
  if (rows.length !== WELCOME_GIFT_ASSET_KEYS.length) return false;
  return rows.every((row) => row.isConfigured);
}

// Called from exactly two trigger points: customerAuth.controller.ts's
// verify-email handler (only when verifyCustomerEmail() reported
// firstTimeVerified: true) and socialAuth.service.ts's first-time
// social sign-in. Deliberately never throws — a welcome-gift failure of
// any kind must never block registration, verification, or login,
// which is also why every caller invokes this fire-and-forget
// (`void maybeSendWelcomeGift(...).catch(() => {})`, though the
// internal try/catch below already makes that .catch() a formality).
export async function maybeSendWelcomeGift(customerId: string): Promise<void> {
  try {
    if (!env.welcomeGiftEnabled) return;

    if (!(await allAssetsConfigured())) {
      if (!loggedNotConfiguredOnce) {
        loggedNotConfiguredOnce = true;
        console.warn("[welcome-gift] WELCOME_GIFT_ENABLED is true but the three sample assets are not all configured yet — sends stay skipped until an admin uploads and activates all three.");
      }
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, firstName: true, isActive: true },
    });
    if (!customer || !customer.isActive) return;

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);

    let deliveryId: string;
    try {
      const delivery = await prisma.welcomeGiftDelivery.create({
        data: { customerId: customer.id, tokenHash: hashToken(rawToken), expiresAt, status: WelcomeGiftDeliveryStatus.CLAIMED },
      });
      deliveryId = delivery.id;
    } catch (error) {
      // The one-time gate: someone else (a concurrent call, or this
      // customer already having received the gift previously) already
      // holds this row. Silent no-op — never a retry, never an error.
      if (isUniqueConstraintError(error)) return;
      throw error;
    }

    const assets = await prisma.welcomeGiftAsset.findMany({
      where: { assetKey: { in: [...WELCOME_GIFT_ASSET_KEYS] }, isConfigured: true },
      select: { assetKey: true, displayName: true },
    });
    const displayNameByKey = new Map(assets.map((asset) => [asset.assetKey, asset.displayName]));

    const downloads = WELCOME_GIFT_ASSET_KEYS.map((assetKey) => ({
      displayName: displayNameByKey.get(assetKey) ?? assetKey,
      downloadUrl: `${env.backendPublicUrl}/api/welcome-gift/download/${rawToken}/${assetKey}`,
    }));

    // A placeholder first name ("Customer" — socialAuth.service.ts's own
    // fallback when a provider withholds a real given_name) is not
    // "reliably available" in the sense the milestone brief means; the
    // template's own "Hello," fallback is the honest choice there.
    const reliableFirstName = customer.firstName && customer.firstName !== "Customer" ? customer.firstName.trim() : null;

    const delivered = await sendWelcomeGiftEmail({
      customerFirstName: reliableFirstName || null,
      customerEmail: customer.email,
      downloads,
    });

    await prisma.welcomeGiftDelivery.update({
      where: { id: deliveryId },
      data: delivered
        ? { status: WelcomeGiftDeliveryStatus.SENT, sentAt: new Date() }
        : { status: WelcomeGiftDeliveryStatus.FAILED, failedAt: new Date(), lastError: "Email delivery failed. See server logs for the underlying error (never stored here)." },
    });
  } catch (error) {
    // Never logs the raw token, the customer's email, or any DB id —
    // only a generic diagnostic message.
    console.warn(`[welcome-gift] maybeSendWelcomeGift failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Guest-order counterpart to maybeSendWelcomeGift() above — same
// one-time-delivery guarantee, but keyed on (lowercased, trimmed) email
// via GuestWelcomeGiftDelivery instead of customerId, since a guest
// checkout has no Customer row to attach to (see that model's own
// schema comment). Never throws, same fire-and-forget discipline.
export async function maybeSendGuestWelcomeGift(rawEmail: string, firstName: string | null): Promise<void> {
  try {
    if (!env.welcomeGiftEnabled) return;
    if (!(await allAssetsConfigured())) return;

    const customerEmail = rawEmail.trim().toLowerCase();
    if (!customerEmail) return;

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);

    let deliveryId: string;
    try {
      const delivery = await prisma.guestWelcomeGiftDelivery.create({
        data: { customerEmail, tokenHash: hashToken(rawToken), expiresAt, status: WelcomeGiftDeliveryStatus.CLAIMED },
      });
      deliveryId = delivery.id;
    } catch (error) {
      // Same one-time gate as maybeSendWelcomeGift(): this email already
      // holds a row (already sent previously, or a concurrent call).
      if (isUniqueConstraintError(error)) return;
      throw error;
    }

    const assets = await prisma.welcomeGiftAsset.findMany({
      where: { assetKey: { in: [...WELCOME_GIFT_ASSET_KEYS] }, isConfigured: true },
      select: { assetKey: true, displayName: true },
    });
    const displayNameByKey = new Map(assets.map((asset) => [asset.assetKey, asset.displayName]));

    const downloads = WELCOME_GIFT_ASSET_KEYS.map((assetKey) => ({
      displayName: displayNameByKey.get(assetKey) ?? assetKey,
      downloadUrl: `${env.backendPublicUrl}/api/welcome-gift/download/${rawToken}/${assetKey}`,
    }));

    const reliableFirstName = firstName && firstName.trim() ? firstName.trim() : null;

    const delivered = await sendWelcomeGiftEmail({
      customerFirstName: reliableFirstName,
      customerEmail,
      downloads,
      accountCreateUrl: `${preferredFrontendBaseUrl()}/account`,
    });

    await prisma.guestWelcomeGiftDelivery.update({
      where: { id: deliveryId },
      data: delivered
        ? { status: WelcomeGiftDeliveryStatus.SENT, sentAt: new Date() }
        : { status: WelcomeGiftDeliveryStatus.FAILED, failedAt: new Date(), lastError: "Email delivery failed. See server logs for the underlying error (never stored here)." },
    });
  } catch (error) {
    console.warn(`[welcome-gift] maybeSendGuestWelcomeGift failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export interface WelcomeGiftDownloadResult {
  signedUrl: string;
  displayName: string;
}

// Re-verifies everything from scratch on every call, same "never trust
// a cached/previous result" discipline as digitalDownload.service.ts's
// loadDownloadableItem() — token hash lookup, not-expired, and the
// requested asset key both genuinely exist and are configured. Returns
// null (never throws) for every failure case, so the public download
// controller can respond with one generic, non-enumerating error
// regardless of which check failed.
export async function resolveWelcomeGiftDownload(rawToken: string, assetKey: string): Promise<WelcomeGiftDownloadResult | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  if (!isWelcomeGiftAssetKey(assetKey)) return null;

  const tokenHash = hashToken(rawToken);
  let delivery = await prisma.welcomeGiftDelivery.findUnique({ where: { tokenHash }, select: { expiresAt: true } });
  if (!delivery) {
    try {
      // Falls back to the guest-order table (a token issued by
      // maybeSendGuestWelcomeGift()). Wrapped defensively: if that
      // table doesn't exist yet in this database (migration not yet
      // applied), this must still behave exactly like "token not
      // found" rather than throw — same "never throws" contract this
      // function has always had.
      delivery = await prisma.guestWelcomeGiftDelivery.findUnique({ where: { tokenHash }, select: { expiresAt: true } });
    } catch {
      delivery = null;
    }
  }
  if (!delivery) return null;
  if (delivery.expiresAt.getTime() <= Date.now()) return null;

  const asset = await prisma.welcomeGiftAsset.findUnique({ where: { assetKey } });
  if (!asset || !asset.isConfigured || !asset.storagePath) return null;

  const signedUrl = await digitalAssetStorage.createSignedDownloadUrl(asset.storagePath, SIGNED_URL_EXPIRY_SECONDS);
  return { signedUrl, displayName: asset.displayName };
}
