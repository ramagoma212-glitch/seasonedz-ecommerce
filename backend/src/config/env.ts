// Centralised environment configuration. Everything that reads
// `process.env` anywhere in the backend should go through this file
// instead, so there's exactly one place that knows the variable names
// and their defaults.

import dotenv from "dotenv";
import { randomBytes } from "node:crypto";

dotenv.config();

function getEnv(name: string, fallback?: string): string {
  // Deliberately not `process.env[name] ?? fallback`: dotenv turns
  // `DATABASE_URL=` (present but empty, e.g. a freshly-copied
  // .env.example) into "", and "" is not nullish, so `??` would let it
  // through as a "valid" empty string instead of falling back/throwing.
  const raw = process.env[name];
  const value = raw && raw.trim() !== "" ? raw : fallback;

  if (value === undefined) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy backend/.env.example to backend/.env and fill in a real value — see backend/README.md.`
    );
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

const nodeEnv = getEnv("NODE_ENV", "development");
const nodeEnvIsProduction = nodeEnv === "production";

// The fallback itself is only offered outside production — a deployed
// backend must have its real frontend origin explicitly configured
// rather than silently defaulting to a localhost origin nothing in
// production can ever reach.
const frontendUrl = getEnv("FRONTEND_URL", nodeEnvIsProduction ? undefined : "http://localhost:5173");

// PayFast (Version 3, Milestone 20 — sandbox configuration only).
// No payment initiation or ITN handling exists yet — nothing calls
// PayFast with these values yet. See backend/PAYFAST_SETUP.md.
//
// PAYFAST_ENABLED is the safety switch introduced in this milestone
// (see order.validator.ts): real PayFast checkout stays blocked until
// this is explicitly "true", which won't happen until payment
// initiation + ITN verification are actually built and tested. Because
// of that gate, the merchant credential/URL vars below are only
// eagerly required when PAYFAST_ENABLED is true — this backend must
// keep starting normally today (and in the current Render deployment)
// without anyone having to add PayFast vars for a feature that is
// still fully disabled by default.
const payfastEnabled = getEnv("PAYFAST_ENABLED", "false").trim().toLowerCase() === "true";
const payfastMode = getEnv("PAYFAST_MODE", "sandbox");

if (payfastMode !== "sandbox" && payfastMode !== "production") {
  throw new Error(`PAYFAST_MODE must be "sandbox" or "production" — got: "${payfastMode}".`);
}

const payfastMerchantId = getOptionalEnv("PAYFAST_MERCHANT_ID");
const payfastMerchantKey = getOptionalEnv("PAYFAST_MERCHANT_KEY");
// Optional even when PayFast is enabled — only set if the merchant
// account itself has a passphrase configured.
const payfastPassphrase = getOptionalEnv("PAYFAST_PASSPHRASE");
const backendPublicUrl = getOptionalEnv("BACKEND_PUBLIC_URL");
const payfastReturnUrl = getOptionalEnv("PAYFAST_RETURN_URL");
const payfastCancelUrl = getOptionalEnv("PAYFAST_CANCEL_URL");
const payfastNotifyUrl = getOptionalEnv("PAYFAST_NOTIFY_URL");

if (payfastEnabled) {
  // Named individually (never the values) so a missing-config startup
  // failure tells you exactly what to fix — same intent as the
  // DATABASE_URL/DIRECT_URL checks above.
  const missing: string[] = [];
  if (!payfastMerchantId) missing.push("PAYFAST_MERCHANT_ID");
  if (!payfastMerchantKey) missing.push("PAYFAST_MERCHANT_KEY");
  if (!backendPublicUrl) missing.push("BACKEND_PUBLIC_URL");
  if (!payfastReturnUrl) missing.push("PAYFAST_RETURN_URL");
  if (!payfastCancelUrl) missing.push("PAYFAST_CANCEL_URL");
  if (!payfastNotifyUrl) missing.push("PAYFAST_NOTIFY_URL");

  if (missing.length > 0) {
    throw new Error(
      `PAYFAST_ENABLED is true but missing required PayFast environment variable(s): ${missing.join(", ")}. Set these in backend/.env, or set PAYFAST_ENABLED=false until PayFast is ready — see backend/PAYFAST_SETUP.md.`
    );
  }
}

// PayFast source verification hardening (Version 4, Milestone 29;
// strategy updated Version 5, Milestone 35). PAYFAST_VALIDATE_SERVER is
// an independent, always-optional boolean — never required regardless
// of PAYFAST_ENABLED, since it hardens an already-working notify flow
// rather than gates a new feature. Defaults to "false", so today's
// backend (local or the current Render deployment) starts and behaves
// identically whether or not anyone has heard of it yet. See
// backend/VERSION_4_PAYFAST_SOURCE_VERIFICATION.md and
// VERSION_5_PAYFAST_VERIFICATION_STRATEGY_UPDATE.md.
//
// For production PayFast readiness, PAYFAST_VALIDATE_SERVER=true is
// required (documentation/operational decision, not enforced here —
// this file can't know "we're about to go live" vs. "we're testing
// sandbox", and PAYFAST_VALIDATE_SERVER must stay optional for local
// startup either way).
const payfastValidateServer = getEnv("PAYFAST_VALIDATE_SERVER", "false").trim().toLowerCase() === "true";

// Version 5, Milestone 35: replaces the old hard on/off
// PAYFAST_VERIFY_SOURCE with a three-way mode, since DNS-based source
// IP matching turned out to be unreliable to prove through any proxy/
// tunnel topology tested so far (see
// VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md) — a hard
// "enforce" everywhere risked blocking genuine payments on unproven
// infrastructure (Render's own topology has never been tested).
//
//   off     — never run the DNS source check at all.
//   monitor — run it, log the pass/fail outcome, but never block on a
//             failure (all other checks — signature/merchant/amount/
//             server validation — still fully apply). Safe to run
//             anywhere, including Render, to gather real evidence
//             before ever enforcing.
//   enforce — run it and block on failure, exactly like the old
//             PAYFAST_VERIFY_SOURCE=true. Only appropriate once the
//             acceptance path is proven on the real hosting
//             environment in use.
//
// Backward compatibility with the old PAYFAST_VERIFY_SOURCE boolean:
// only consulted when PAYFAST_SOURCE_VERIFICATION_MODE isn't set at
// all, so an explicit new-variable value always wins.
//   PAYFAST_VERIFY_SOURCE=true  -> "enforce" (preserves the exact prior
//     hard-blocking behaviour for anyone who'd already opted in).
//   PAYFAST_VERIFY_SOURCE=false/unset -> "off" (preserves the exact
//     prior no-op behaviour — never silently starts a new DNS lookup
//     for an environment that never asked for one). "monitor" is
//     opt-in only, via explicitly setting
//     PAYFAST_SOURCE_VERIFICATION_MODE=monitor.
export type PayfastSourceVerificationMode = "off" | "monitor" | "enforce";

const VALID_SOURCE_VERIFICATION_MODES: readonly PayfastSourceVerificationMode[] = ["off", "monitor", "enforce"];

const payfastVerifySourceLegacy = getEnv("PAYFAST_VERIFY_SOURCE", "false").trim().toLowerCase() === "true";
const rawSourceVerificationMode = getOptionalEnv("PAYFAST_SOURCE_VERIFICATION_MODE");

let payfastSourceVerificationMode: PayfastSourceVerificationMode;
if (rawSourceVerificationMode !== undefined) {
  const normalized = rawSourceVerificationMode.trim().toLowerCase();
  if (!VALID_SOURCE_VERIFICATION_MODES.includes(normalized as PayfastSourceVerificationMode)) {
    throw new Error(
      `PAYFAST_SOURCE_VERIFICATION_MODE must be "off", "monitor", or "enforce" — got: "${rawSourceVerificationMode}".`
    );
  }
  payfastSourceVerificationMode = normalized as PayfastSourceVerificationMode;
} else {
  payfastSourceVerificationMode = payfastVerifySourceLegacy ? "enforce" : "off";
}

// Accepts "true" or "1" (both common conventions for this kind of
// flag) — see app.ts for how this is used.
const trustProxyRaw = getEnv("TRUST_PROXY", "false").trim().toLowerCase();
const trustProxy = trustProxyRaw === "true" || trustProxyRaw === "1";

// Email (Version 3, Milestone 24 — preparation only). Nothing is
// wired up to actually send anything yet — see
// backend/src/services/email/ and backend/EMAIL_SETUP.md.
//
// EMAIL_ENABLED is the same kind of safety switch as PAYFAST_ENABLED
// above: real sending stays off until this is explicitly "true", so
// the backend must keep starting normally without anyone having to
// add email credentials for a feature that's still fully disabled by
// default. EMAIL_PROVIDER defaults to "console" — log-only, never a
// real send — regardless of EMAIL_ENABLED.
const emailEnabled = getEnv("EMAIL_ENABLED", "false").trim().toLowerCase() === "true";
const emailProvider = getEnv("EMAIL_PROVIDER", "console");
const emailFromName = getEnv("EMAIL_FROM_NAME", "Seasonedz Group");
const emailFromAddress = getOptionalEnv("EMAIL_FROM_ADDRESS");
const adminNotificationEmail = getOptionalEnv("ADMIN_NOTIFICATION_EMAIL");
// Version 7, Milestone 117: the address a reply to a transactional
// email actually reaches — separate from emailFromAddress (the
// authenticated sending address), since Brevo's API accepts a
// distinct replyTo field. Optional in general (only "brevo" actually
// reads it), required specifically when EMAIL_PROVIDER=brevo — see
// the brevo-specific check below.
const emailReplyTo = getOptionalEnv("EMAIL_REPLY_TO");

// Provider API keys (RESEND_API_KEY, SENDGRID_API_KEY, SMTP_*, and now
// BREVO_API_KEY) are deliberately NOT validated here for any provider
// this backend doesn't actually use yet — see the brevo-specific
// block below for the one that now is. A future milestone that picks
// a different provider should add that provider's specific
// requirement here, at the point it actually starts being used.
const brevoApiKey = getOptionalEnv("BREVO_API_KEY");

if (emailEnabled) {
  const missing: string[] = [];
  if (!emailFromAddress) missing.push("EMAIL_FROM_ADDRESS");
  if (!adminNotificationEmail) missing.push("ADMIN_NOTIFICATION_EMAIL");

  if (missing.length > 0) {
    throw new Error(
      `EMAIL_ENABLED is true but missing required email environment variable(s): ${missing.join(", ")}. Set these in backend/.env, or set EMAIL_ENABLED=false until email is ready — see backend/EMAIL_SETUP.md.`
    );
  }

  // Version 7, Milestone 117: Brevo-specific requirements, checked
  // only when it's the active provider — an unrelated EMAIL_PROVIDER
  // value (e.g. "console") must never be blocked from starting just
  // because BREVO_API_KEY/EMAIL_REPLY_TO aren't set.
  if (emailProvider === "brevo") {
    const missingBrevo: string[] = [];
    if (!brevoApiKey) missingBrevo.push("BREVO_API_KEY");
    if (!emailReplyTo) missingBrevo.push("EMAIL_REPLY_TO");

    if (missingBrevo.length > 0) {
      throw new Error(
        `EMAIL_ENABLED is true and EMAIL_PROVIDER=brevo but missing required Brevo environment variable(s): ${missingBrevo.join(", ")}. Set these in backend/.env, or set EMAIL_ENABLED=false until Brevo is ready — see backend/EMAIL_SETUP.md.`
      );
    }
  }
}

// Admin authentication (Version 7, Milestone 58 — foundation only).
// No admin route is linked from the public site, and no real admin
// user exists in production yet — see VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md.
//
// ADMIN_SESSION_SECRET signs the session cookie (via cookie-parser)
// as defence-in-depth against cookie tampering — the session itself
// is still validated server-side against AdminSession.tokenHash
// regardless, so a missing secret is not a security hole, just a
// missing extra layer. Unlike PAYFAST_ENABLED/EMAIL_ENABLED, there is
// no "admin auth enabled" flag to gate this behind: the auth routes
// always exist once this milestone ships, but they are useless
// without a real AdminUser row, and none is ever seeded automatically
// — so this must never be eagerly required at startup the way
// DATABASE_URL is, or a Render deployment with no ADMIN_SESSION_SECRET
// set would crash the entire backend, not just disable a feature.
// Falling back to a random per-process secret is safe for this
// foundation milestone (no real admin usage exists yet); it simply
// means any session is invalidated on a process restart until a real
// secret is set — logged clearly below so this is never silently
// relied on.
const adminSessionSecret = getOptionalEnv("ADMIN_SESSION_SECRET");
if (!adminSessionSecret) {
  // eslint-disable-next-line no-console
  console.warn(
    "[admin-auth] ADMIN_SESSION_SECRET is not set — using a random, process-only secret. " +
      "Admin sessions will not survive a restart until a real secret is set in the environment."
  );
}

// Referral attribution signing (Version 7, Milestone 172B.4; hardened
// Milestone 172B.4.2). Signs the {code, capturedAt} pair a storefront
// visitor's browser stores in Local Storage (seasonedz_referral) after
// following a ?ref=CODE link, so order.service.ts can trust capturedAt
// when enforcing attributionWindowDays — a plain client-editable
// timestamp could otherwise be edited to make a stale referral look
// freshly captured forever. See utils/referralAttributionToken.ts,
// which reads only env.referralAttributionSecret below — the single
// authoritative resolution path; nothing else in this backend reads
// process.env.REFERRAL_ATTRIBUTION_SECRET directly.
//
// Version 7, Milestone 172B.4.2: unlike ADMIN_SESSION_SECRET above,
// this is NO LONGER allowed to silently fall back to a random,
// process-only secret in production. 172B.4's original "safe,
// non-financial degrade" reasoning undersold the real impact once the
// referral programme went live with real discounts/commissions: a
// silently-rotating secret invalidates every in-flight referral
// attribution on every single restart, with no error and no visible
// symptom beyond a real affiliate quietly not getting credited —
// exactly the kind of failure that should be loud at startup, not
// silent in production. Development/test still fall back to a random
// secret (no real affiliate/commission risk there, and requiring a
// real value locally would only add friction).
//
// resolveReferralAttributionSecret() is a pure function (no
// module-level closures) so this is directly unit-testable without
// needing to reload the env module under different NODE_ENV values —
// see this file's own resolveOAuthCallbackBaseUrl() above for the
// exact same pattern, and referralAttributionSecret.test.ts.
export const REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH = 32;

export function resolveReferralAttributionSecret(params: { isProduction: boolean; rawSecret: string | undefined; minLength: number }): string | null {
  const trimmed = params.rawSecret?.trim() || undefined;

  if (params.isProduction) {
    if (!trimmed) {
      throw new Error(
        "REFERRAL_ATTRIBUTION_SECRET is required in production. Set a real, random value " +
          `(at least ${params.minLength} characters) in Render's Environment tab — see backend/.env.example.`
      );
    }
    if (trimmed.length < params.minLength) {
      throw new Error(
        `REFERRAL_ATTRIBUTION_SECRET must be at least ${params.minLength} characters in production. ` +
          "Set a real, random value in Render's Environment tab — see backend/.env.example."
      );
    }
    return trimmed;
  }

  // Development/test: a missing value is fine, resolved to null here so
  // the caller below can fall back to a random per-process secret —
  // never a hard failure outside production.
  return trimmed ?? null;
}

const rawReferralAttributionSecret = getOptionalEnv("REFERRAL_ATTRIBUTION_SECRET");
const resolvedReferralAttributionSecret = resolveReferralAttributionSecret({
  isProduction: nodeEnvIsProduction,
  rawSecret: rawReferralAttributionSecret,
  minLength: REFERRAL_ATTRIBUTION_SECRET_MIN_LENGTH,
});
if (!resolvedReferralAttributionSecret) {
  // Only ever reached outside production — resolveReferralAttributionSecret()
  // always either returns a valid string or throws when isProduction is true.
  // eslint-disable-next-line no-console
  console.warn(
    "[referrals] REFERRAL_ATTRIBUTION_SECRET is not set — using a random, process-only secret (development/test only). " +
      "A referral captured before a restart will stop applying its discount/commission after one, until a real secret is set."
  );
}

// Product image upload (Version 7, Milestone 69 — backend only, no
// admin upload UI yet). See VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md.
//
// Same "safety switch, optional until configured" pattern as
// PAYFAST_ENABLED/EMAIL_ENABLED above, but there is no separate
// *_ENABLED flag here — the feature is simply considered "configured"
// when both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present.
// Neither is eagerly required at startup: a Render deployment with
// neither set must keep starting and serving every other route
// normally, with only the new image-upload routes responding with a
// clear "not configured" error (supabaseStorage.service.ts) instead
// of crashing the whole backend. Never log the actual key value.
const supabaseUrl = getOptionalEnv("SUPABASE_URL");
const supabaseServiceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const productImagesBucket = getEnv("PRODUCT_IMAGES_BUCKET", "product-images");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[product-images] SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set — " +
      "product image upload is not configured. Every other route is unaffected; " +
      "only POST/GET/PATCH /api/admin/products/:id/images will respond with a " +
      "clear configuration error until both are set. See VERSION_7_PRODUCT_IMAGE_UPLOAD_BACKEND_RESULT.md."
  );
}

// Digital product downloads (Version 7, Milestone 152). Reuses the same
// supabaseUrl/supabaseServiceRoleKey credentials as product image
// upload above — same Supabase project, same server-role client — but
// a completely separate, PRIVATE bucket. Never the product-images
// bucket: that one is public by design (storefront photos), while this
// one must never be. See services/digitalAssetStorage.service.ts.
const digitalProductsBucket = getEnv("DIGITAL_PRODUCTS_BUCKET", "digital-products");

// Not eagerly required at startup — same "safety switch, optional
// until configured" pattern as product image upload. A backend with no
// Supabase credentials set keeps starting and serving every other
// route normally; only the digital-asset upload/download routes
// respond with a clear "not configured" error until both are set (see
// isDigitalAssetStorageConfigured() in digitalAssetStorage.service.ts,
// which reads supabaseUrl/supabaseServiceRoleKey directly — the same
// two variables checked above for product images).
if (!supabaseUrl || !supabaseServiceRoleKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[digital-downloads] SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set — " +
      "digital product file upload/download is not configured. Every other route is " +
      "unaffected; only the digital-asset admin upload and customer/guest download " +
      "routes will respond with a clear configuration error until both are set. " +
      `The private bucket "${digitalProductsBucket}" must also be created manually in ` +
      "the Supabase dashboard (Storage) with public access OFF — this backend never " +
      "creates a bucket itself. See backend/DIGITAL_DOWNLOADS_SETUP.md."
  );
}

// Courier Guy (Version 7, Milestone 108 — admin-only RATE QUOTE only).
// See backend/src/services/courierGuy.service.ts's own header comment:
// nothing in this codebase ever calls a booking/shipment-creation
// endpoint, only POST {baseUrl}/rates.
//
// Same "safety switch, optional until configured" pattern as
// PAYFAST_ENABLED/EMAIL_ENABLED above: real quote calls stay blocked
// until this is explicitly "true", so the backend must keep starting
// normally without anyone having to add Courier Guy credentials for a
// feature that's still fully disabled by default. Once enabled, the
// API key and every collection-address field are eagerly required —
// a quote request needs a real "from" address, not just a "to" one.
const courierGuyEnabled = getEnv("COURIER_GUY_ENABLED", "false").trim().toLowerCase() === "true";
const courierGuyApiKey = getOptionalEnv("COURIER_GUY_API_KEY");
// ShipLogic's sandbox base URL (api.shiplogic.com) is also The Courier
// Guy's own developer-portal sandbox — see backend/DELIVERY_SETUP.md.
// Defaulted so local/dev startup never requires this to be set just to
// leave the feature disabled; only meaningful once courierGuyEnabled.
const courierGuyBaseUrl = getEnv("COURIER_GUY_BASE_URL", "https://api.shiplogic.com");
const courierGuyCollectionCompany = getOptionalEnv("COURIER_GUY_COLLECTION_COMPANY");
const courierGuyCollectionStreetAddress = getOptionalEnv("COURIER_GUY_COLLECTION_STREET_ADDRESS");
const courierGuyCollectionLocalArea = getOptionalEnv("COURIER_GUY_COLLECTION_LOCAL_AREA");
const courierGuyCollectionCity = getOptionalEnv("COURIER_GUY_COLLECTION_CITY");
const courierGuyCollectionZone = getOptionalEnv("COURIER_GUY_COLLECTION_ZONE");
const courierGuyCollectionCountry = getEnv("COURIER_GUY_COLLECTION_COUNTRY", "ZA");
const courierGuyCollectionCode = getOptionalEnv("COURIER_GUY_COLLECTION_CODE");
// "business" is the only realistic value for Seasonedz Group's own
// collection address (never a residential pickup) — optional to set
// explicitly, per the task's own env variable list.
const courierGuyCollectionType = getEnv("COURIER_GUY_COLLECTION_TYPE", "business");
// Safe defaults for a small book/marker-pack parcel (Milestone 107's
// planning review) — always overridable by the admin per-quote in the
// UI, never assumed to be exactly right for every order.
const courierGuyDefaultParcelWeightKg = Number(getEnv("COURIER_GUY_DEFAULT_PARCEL_WEIGHT_KG", "0.3"));
const courierGuyDefaultParcelLengthCm = Number(getEnv("COURIER_GUY_DEFAULT_PARCEL_LENGTH_CM", "30"));
const courierGuyDefaultParcelWidthCm = Number(getEnv("COURIER_GUY_DEFAULT_PARCEL_WIDTH_CM", "22"));
const courierGuyDefaultParcelHeightCm = Number(getEnv("COURIER_GUY_DEFAULT_PARCEL_HEIGHT_CM", "3"));

for (const [name, value] of [
  ["COURIER_GUY_DEFAULT_PARCEL_WEIGHT_KG", courierGuyDefaultParcelWeightKg],
  ["COURIER_GUY_DEFAULT_PARCEL_LENGTH_CM", courierGuyDefaultParcelLengthCm],
  ["COURIER_GUY_DEFAULT_PARCEL_WIDTH_CM", courierGuyDefaultParcelWidthCm],
  ["COURIER_GUY_DEFAULT_PARCEL_HEIGHT_CM", courierGuyDefaultParcelHeightCm],
] as const) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number — got: "${process.env[name]}".`);
  }
}

if (courierGuyEnabled) {
  // Named individually (never the values) — same intent as the
  // PayFast/email checks above: a missing-config startup failure tells
  // you exactly what to fix.
  const missing: string[] = [];
  if (!courierGuyApiKey) missing.push("COURIER_GUY_API_KEY");
  if (!courierGuyCollectionCompany) missing.push("COURIER_GUY_COLLECTION_COMPANY");
  if (!courierGuyCollectionStreetAddress) missing.push("COURIER_GUY_COLLECTION_STREET_ADDRESS");
  if (!courierGuyCollectionLocalArea) missing.push("COURIER_GUY_COLLECTION_LOCAL_AREA");
  if (!courierGuyCollectionCity) missing.push("COURIER_GUY_COLLECTION_CITY");
  if (!courierGuyCollectionZone) missing.push("COURIER_GUY_COLLECTION_ZONE");
  if (!courierGuyCollectionCode) missing.push("COURIER_GUY_COLLECTION_CODE");

  if (missing.length > 0) {
    throw new Error(
      `COURIER_GUY_ENABLED is true but missing required Courier Guy environment variable(s): ${missing.join(", ")}. Set these in backend/.env, or set COURIER_GUY_ENABLED=false until Courier Guy is ready — see backend/DELIVERY_SETUP.md.`
    );
  }
}

// Courier Guy BOOKING (Version 7, Milestone 112 — real shipment
// creation, separate from the quote flag above). Deliberately its own
// flag, not folded into COURIER_GUY_ENABLED: quote (Milestone 108) is
// already live and safe (read-only against Courier Guy), but a real
// POST /shipments call creates a real courier booking, so it stays
// behind its own explicit switch until sandbox booking is
// deliberately tested and approved — see
// backend/src/services/courierGuy.service.ts's own header comment.
// Same "safety switch, optional until configured" pattern as every
// other *_ENABLED flag in this file: the backend must keep starting
// normally with this "false" and none of the variables below set.
const courierGuyBookingEnabled = getEnv("COURIER_GUY_BOOKING_ENABLED", "false").trim().toLowerCase() === "true";
const courierGuyCollectionContactName = getOptionalEnv("COURIER_GUY_COLLECTION_CONTACT_NAME");
const courierGuyCollectionContactPhone = getOptionalEnv("COURIER_GUY_COLLECTION_CONTACT_PHONE");
const courierGuyCollectionContactEmail = getOptionalEnv("COURIER_GUY_COLLECTION_CONTACT_EMAIL");

if (courierGuyBookingEnabled) {
  const missing: string[] = [];
  if (!courierGuyCollectionContactName) missing.push("COURIER_GUY_COLLECTION_CONTACT_NAME");
  // A courier needs at least one way to reach the collection contact —
  // phone OR email is enough, not both, so this isn't in the simple
  // per-variable list above.
  if (!courierGuyCollectionContactPhone && !courierGuyCollectionContactEmail) {
    missing.push("COURIER_GUY_COLLECTION_CONTACT_PHONE or COURIER_GUY_COLLECTION_CONTACT_EMAIL");
  }

  if (missing.length > 0) {
    throw new Error(
      `COURIER_GUY_BOOKING_ENABLED is true but missing required Courier Guy booking environment variable(s): ${missing.join(", ")}. Set these in backend/.env, or set COURIER_GUY_BOOKING_ENABLED=false until booking is ready — see backend/DELIVERY_SETUP.md.`
    );
  }
}

// Courier Guy AUTOMATIC booking (Version 7, Milestone 139 — foundation
// only; stays "false" in production until the owner explicitly
// approves turning it on). Deliberately a THIRD, separate flag from
// COURIER_GUY_ENABLED (quote) and COURIER_GUY_BOOKING_ENABLED (manual
// admin booking) — auto-booking can only ever run if all three are
// true, but turning auto-booking off never disables the admin's own
// manual quote/book flow, and vice versa.
//
// Unlike the *_ENABLED flags above, a missing COURIER_GUY_DEFAULT_SERVICE_CODE
// deliberately does NOT crash the whole backend at startup — see
// autoBookCourierForPaidOrder() in courierGuy.service.ts, which
// re-checks this at the moment of each booking attempt and safely skips
// (logging a warning, never throwing) rather than blocking a real
// customer's PayFast payment confirmation over a courier
// misconfiguration. This startup warning exists only so the missing
// value is visible immediately in logs, not to gate anything.
const courierGuyAutoBookingEnabled = getEnv("COURIER_GUY_AUTO_BOOKING_ENABLED", "false").trim().toLowerCase() === "true";

// Version 7, Milestone 141: replaces the single fixed service code as
// the primary selection mechanism. Milestone 140's real quote checks
// found Courier Guy's /rates response depends on delivery zone
// (Gauteng only offers "Local" codes like LOF, everywhere else only
// offers "national" codes like ECO — the two never co-occur), so one
// fixed code can never work for every order. autoBookCourierForPaidOrder()
// now quotes first, then picks the first of these codes (in priority
// order) that the quote actually returned. LOF (Local Overnight) and
// ECO (Economy) were chosen as the cheapest non-premium tier in each
// zone respectively — see DELIVERY_SETUP.md's "Milestone 140 finding"
// section for the real pricing data this is based on. Deliberately
// excludes SDX (Same Day Express) and any other premium/emergency
// service — those are never chosen automatically, only ever by an
// admin manually.
const courierGuyAutoBookingServiceCodes = getEnv("COURIER_GUY_AUTO_BOOKING_SERVICE_CODES", "LOF,ECO")
  .split(",")
  .map((code) => code.trim().toUpperCase())
  .filter((code) => code.length > 0);

// Version 7, Milestone 139: the original single fixed service code.
// Kept only as a legacy/reference value — autoBookCourierForPaidOrder()
// no longer reads this at all; COURIER_GUY_AUTO_BOOKING_SERVICE_CODES
// above is the only mechanism it uses. Left optional and unused by
// default rather than removed outright, in case a future rollback or
// migration ever needs to see what the old single-code value was.
const courierGuyDefaultServiceCode = getOptionalEnv("COURIER_GUY_DEFAULT_SERVICE_CODE");

// Courier Guy automatic delivery status sync (Version 7, Milestone
// 173). A FOURTH, separate flag from quote/booking/auto-booking above
// — deploying this milestone's code must never itself start receiving
// webhook traffic; the owner enables it explicitly once the callback
// URL is registered in the ShipLogic portal (manual, portal-only —
// there is no API to register it). Same "safety switch, optional
// until configured" pattern as every other *_ENABLED flag in this
// file: the backend must keep starting normally with this "false" and
// no webhook secret set.
//
// The secret is NOT a Courier Guy-issued value — ShipLogic's own
// webhook documentation (see courierWebhook.service.ts's own header
// comment) has no verified signature/HMAC/token mechanism, so this
// backend supplies its own protection instead: an unguessable secret
// segment embedded in the registered callback URL itself, compared in
// constant time. Same "required, minimum length, loud production
// failure" discipline as REFERRAL_ATTRIBUTION_SECRET above, since a
// forged delivery event could falsely trigger the affiliate commission
// validation clock (see referralCommission.service.ts).
export const COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH = 24;

// Pure function (same pattern as resolveReferralAttributionSecret()
// above) so this is directly unit-testable without reloading the env
// module under different env vars — see
// courierGuyWebhookSecret.test.ts.
export function resolveCourierGuyWebhookSecret(params: { statusSyncEnabled: boolean; rawSecret: string | undefined; minLength: number }): string | undefined {
  const trimmed = params.rawSecret?.trim() || undefined;

  if (!params.statusSyncEnabled) {
    return trimmed; // Feature off: whatever's set (or nothing) is fine, never validated.
  }

  if (!trimmed) {
    throw new Error(
      "COURIER_GUY_STATUS_SYNC_ENABLED is true but COURIER_GUY_WEBHOOK_SECRET is not set. " +
        `Set a real, random value (at least ${params.minLength} characters) in Render's Environment tab, ` +
        "use it in the callback URL registered in the ShipLogic portal, or set COURIER_GUY_STATUS_SYNC_ENABLED=false until it's ready — see backend/DELIVERY_SETUP.md."
    );
  }
  if (trimmed.length < params.minLength) {
    throw new Error(
      `COURIER_GUY_WEBHOOK_SECRET must be at least ${params.minLength} characters. ` +
        "Set a real, random value in Render's Environment tab — see backend/DELIVERY_SETUP.md."
    );
  }
  return trimmed;
}

const courierGuyStatusSyncEnabled = getEnv("COURIER_GUY_STATUS_SYNC_ENABLED", "false").trim().toLowerCase() === "true";
const courierGuyWebhookSecret = resolveCourierGuyWebhookSecret({
  statusSyncEnabled: courierGuyStatusSyncEnabled,
  rawSecret: getOptionalEnv("COURIER_GUY_WEBHOOK_SECRET"),
  minLength: COURIER_GUY_WEBHOOK_SECRET_MIN_LENGTH,
});

// Social sign-in (Version 7, Milestone 171F). Same "safety switch,
// optional until configured" pattern as every other *_ENABLED flag in
// this file: the backend must keep starting normally with these all
// "false" and none of the credential variables below set — social
// login is entirely additive to the existing email/password system
// (see customerAuth.service.ts), never required for it to keep
// working. A provider's *_AUTH_ENABLED flag is deliberately separate
// from "credentials are present" (isXConfigured() below combines both)
// so the owner can flip a provider off instantly (e.g. if a console
// misconfiguration is discovered) without having to also blank out its
// secret. GET /api/auth/providers (see socialAuth.controller.ts) is
// the only thing the frontend ever consults to decide which buttons to
// show — never a raw env var, and never anything that could leak a
// secret.
const googleAuthEnabled = getEnv("GOOGLE_AUTH_ENABLED", "false").trim().toLowerCase() === "true";
const googleClientId = getOptionalEnv("GOOGLE_CLIENT_ID");
const googleClientSecret = getOptionalEnv("GOOGLE_CLIENT_SECRET");

const facebookAuthEnabled = getEnv("FACEBOOK_AUTH_ENABLED", "false").trim().toLowerCase() === "true";
const facebookAppId = getOptionalEnv("FACEBOOK_APP_ID");
const facebookAppSecret = getOptionalEnv("FACEBOOK_APP_SECRET");

const appleAuthEnabled = getEnv("APPLE_AUTH_ENABLED", "false").trim().toLowerCase() === "true";
const appleTeamId = getOptionalEnv("APPLE_TEAM_ID");
const appleKeyId = getOptionalEnv("APPLE_KEY_ID");
const appleClientId = getOptionalEnv("APPLE_CLIENT_ID");
// Render-friendly: a .p8 file's real newlines are commonly flattened to
// literal "\n" sequences when pasted into a single-line env var editor
// — restored here so the rest of the app only ever sees a real
// multi-line PEM string. A private key that already contains real
// newlines (e.g. set via a Render "Secret File" or a local .env with
// literal line breaks) is left untouched, since a genuine newline
// obviously never appears as the two-character sequence "\n".
const appleRawPrivateKey = getOptionalEnv("APPLE_PRIVATE_KEY");
const applePrivateKey = appleRawPrivateKey?.includes("\\n") ? appleRawPrivateKey.replace(/\\n/g, "\n") : appleRawPrivateKey;

// This backend's own public origin — every OAuth provider redirects
// back here, never directly to the frontend (see "DO NOT PUT TOKENS IN
// URLS" in the milestone brief: the callback sets the same HttpOnly
// customer_session cookie normal login already uses, then redirects
// the browser on to the frontend with no token of any kind in the
// URL).
//
// Version 7, Milestone 171F.1: does NOT simply reuse BACKEND_PUBLIC_URL
// (as 171F originally did) — a real production test found Google's
// authorization request carrying the pre-Milestone-133 legacy Render
// hostname (seasonedz-ecommerce.onrender.com) as its redirect_uri,
// which Google rejects outright (400 redirect_uri_mismatch) since it
// no longer matches the registered production callback. Root cause:
// BACKEND_PUBLIC_URL is a shared, general-purpose variable (also used
// for PayFast's return/cancel/notify URLs above) whose value in Render
// was apparently never updated when the API moved to
// api.seasonedzgroup.co.za — nothing had validated it as strictly as an
// OAuth provider's own redirect_uri whitelist does, so the staleness
// went unnoticed. This mirrors utils/frontendUrl.ts's own established
// preferredFrontendBaseUrl() defence (which skips a known-legacy
// github.io origin rather than trusting FRONTEND_PRODUCTION_URL's first
// entry blindly) — same class of problem, same fix shape, applied here
// for the backend side. PayFast's own use of BACKEND_PUBLIC_URL above
// is deliberately left untouched (out of this fix's scope) — a stale
// PayFast return URL misbehaves silently rather than hard-failing, so
// it is not addressed here.
export const LEGACY_RENDER_BACKEND_HOST = "seasonedz-ecommerce.onrender.com";
export const CANONICAL_PRODUCTION_BACKEND_URL = "https://api.seasonedzgroup.co.za";

// Pure function (no module-level closures) so this is directly unit-
// testable without needing to reload the env module under different
// NODE_ENV values — see env.oauthCallbackBaseUrl.test.ts.
export function resolveOAuthCallbackBaseUrl(params: { isProduction: boolean; rawBackendPublicUrl: string | undefined; port: string }): string {
  if (!params.isProduction) {
    // Development callback must remain http://localhost:<PORT> — never
    // requires BACKEND_PUBLIC_URL to be set locally just to test OAuth.
    return params.rawBackendPublicUrl || `http://localhost:${params.port}`;
  }
  if (params.rawBackendPublicUrl && !params.rawBackendPublicUrl.includes(LEGACY_RENDER_BACKEND_HOST)) {
    return params.rawBackendPublicUrl;
  }
  return CANONICAL_PRODUCTION_BACKEND_URL;
}

const oauthCallbackBaseUrl = resolveOAuthCallbackBaseUrl({
  isProduction: nodeEnvIsProduction,
  rawBackendPublicUrl: backendPublicUrl,
  port: getEnv("PORT", "5000"),
});

// A provider is only ever "ready" — i.e. GET /api/auth/providers ever
// reports it true, and its start/callback routes ever do real work
// instead of a clear 503 — when BOTH its explicit *_AUTH_ENABLED flag
// AND every credential it needs are present. Google/Facebook/Apple are
// intentionally independent of one another: one provider's missing
// configuration never blocks another (see the milestone brief's
// "Recommended activation order" — Google and Facebook can go live
// even if Apple Developer setup takes longer).
const isGoogleAuthConfigured = googleAuthEnabled && Boolean(googleClientId && googleClientSecret && oauthCallbackBaseUrl);
const isFacebookAuthConfigured = facebookAuthEnabled && Boolean(facebookAppId && facebookAppSecret && oauthCallbackBaseUrl);
const isAppleAuthConfigured = appleAuthEnabled && Boolean(appleTeamId && appleKeyId && appleClientId && applePrivateKey && oauthCallbackBaseUrl);

if (googleAuthEnabled && !isGoogleAuthConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[social-auth] GOOGLE_AUTH_ENABLED is true but GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and/or BACKEND_PUBLIC_URL " +
      "are not fully set — Google sign-in stays reported as unavailable via GET /api/auth/providers until all are set."
  );
}
if (facebookAuthEnabled && !isFacebookAuthConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[social-auth] FACEBOOK_AUTH_ENABLED is true but FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and/or BACKEND_PUBLIC_URL " +
      "are not fully set — Facebook sign-in stays reported as unavailable via GET /api/auth/providers until all are set."
  );
}
if (appleAuthEnabled && !isAppleAuthConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[social-auth] APPLE_AUTH_ENABLED is true but APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY, " +
      "and/or BACKEND_PUBLIC_URL are not fully set — Apple sign-in stays reported as unavailable via GET /api/auth/providers until all are set."
  );
}

if (courierGuyAutoBookingEnabled && courierGuyAutoBookingServiceCodes.length === 0) {
  // eslint-disable-next-line no-console
  console.warn(
    "[courier-guy] COURIER_GUY_AUTO_BOOKING_ENABLED is true but COURIER_GUY_AUTO_BOOKING_SERVICE_CODES is empty — " +
      "automatic booking will safely skip every order until an approved service code list is set. Manual admin booking is unaffected."
  );
}

export const env = {
  nodeEnv,
  port: Number(getEnv("PORT", "5000")),
  // The backend cannot do anything useful without a real database from
  // Milestone 11 onward, so these no longer fall back to an empty
  // string. A missing value now fails clearly here at startup instead
  // of surfacing later as a confusing Prisma error deep inside a
  // request. Note: Prisma Client itself reads DATABASE_URL/DIRECT_URL
  // directly from process.env via the schema's datasource block, not
  // through this object — these exports exist for startup validation
  // and so the rest of the app has one place to see what's required.
  databaseUrl: getEnv("DATABASE_URL"),
  directUrl: getEnv("DIRECT_URL"),
  frontendUrl,
  // Optional additional allowed CORS origin(s) — e.g. the deployed
  // GitHub Pages URL, and/or a custom domain once connected. Accepts
  // one origin, or several separated by commas (Version 7, Milestone
  // 81 — added to support a domain migration, where the old and new
  // frontend origins must both be allowed at once). See "CORS /
  // Allowed Origins" in README.md.
  frontendProductionUrl: getOptionalEnv("FRONTEND_PRODUCTION_URL"),
  // PayFast — see the block above. `mode` is validated to always be
  // one of these two literal values.
  payfastEnabled,
  payfastMode: payfastMode as "sandbox" | "production",
  payfastMerchantId,
  payfastMerchantKey,
  payfastPassphrase,
  backendPublicUrl,
  payfastReturnUrl,
  payfastCancelUrl,
  payfastNotifyUrl,
  // PayFast source verification hardening — see the block above.
  payfastSourceVerificationMode,
  payfastValidateServer,
  trustProxy,
  // Email — see the block above.
  emailEnabled,
  emailProvider,
  emailFromName,
  emailFromAddress,
  adminNotificationEmail,
  emailReplyTo,
  // Brevo — undefined unless BREVO_API_KEY is explicitly set; never
  // logged anywhere.
  brevoApiKey,
  // Admin auth — see the block above. Falls back to a random,
  // process-only secret when unset (never logged, never persisted).
  adminSessionSecret: adminSessionSecret || randomBytes(32).toString("hex"),
  // Referral attribution signing — see the block above. Production:
  // resolvedReferralAttributionSecret is always a real, validated value
  // here (resolveReferralAttributionSecret() already threw a clear
  // startup error otherwise). Development/test only: falls back to a
  // random, process-only secret.
  referralAttributionSecret: resolvedReferralAttributionSecret || randomBytes(32).toString("hex"),
  // Product image upload — see the block above. supabaseServiceRoleKey
  // is undefined unless explicitly set; never logged anywhere.
  supabaseUrl,
  supabaseServiceRoleKey,
  productImagesBucket,
  // Digital downloads — see the block above. Reuses supabaseUrl/
  // supabaseServiceRoleKey; digitalProductsBucket is its own, separate,
  // private bucket name.
  digitalProductsBucket,
  // Courier Guy — see the block above. courierGuyApiKey is undefined
  // unless explicitly set; never logged anywhere.
  courierGuyEnabled,
  courierGuyApiKey,
  courierGuyBaseUrl,
  courierGuyCollectionCompany,
  courierGuyCollectionStreetAddress,
  courierGuyCollectionLocalArea,
  courierGuyCollectionCity,
  courierGuyCollectionZone,
  courierGuyCollectionCountry,
  courierGuyCollectionCode,
  courierGuyCollectionType,
  courierGuyDefaultParcelWeightKg,
  courierGuyDefaultParcelLengthCm,
  courierGuyDefaultParcelWidthCm,
  courierGuyDefaultParcelHeightCm,
  // Courier Guy booking — see the block above. All undefined unless
  // COURIER_GUY_BOOKING_ENABLED is explicitly set.
  courierGuyBookingEnabled,
  courierGuyCollectionContactName,
  courierGuyCollectionContactPhone,
  courierGuyCollectionContactEmail,
  // Courier Guy automatic booking — see the block above. Service codes
  // are not secrets, but are still only ever surfaced via safe internal
  // logging, never in a customer-facing response.
  courierGuyAutoBookingEnabled,
  courierGuyAutoBookingServiceCodes,
  // Legacy/reference only — not read by the current selection logic.
  courierGuyDefaultServiceCode,
  // Courier Guy automatic status sync — see the block above.
  // courierGuyWebhookSecret is undefined unless explicitly set; never
  // logged anywhere, never returned in any response.
  courierGuyStatusSyncEnabled,
  courierGuyWebhookSecret,
  // Social sign-in — see the block above. Client secrets/private keys
  // are undefined unless explicitly set; never logged anywhere. The
  // isXAuthConfigured booleans are the only thing GET /api/auth/providers
  // (socialAuth.controller.ts) and the OAuth start/callback routes ever
  // consult to decide whether a provider is real usable right now.
  googleAuthEnabled,
  googleClientId,
  googleClientSecret,
  isGoogleAuthConfigured,
  facebookAuthEnabled,
  facebookAppId,
  facebookAppSecret,
  isFacebookAuthConfigured,
  appleAuthEnabled,
  appleTeamId,
  appleKeyId,
  appleClientId,
  applePrivateKey,
  isAppleAuthConfigured,
  oauthCallbackBaseUrl,
};

// Every browser origin CORS should accept — never a wildcard. Built
// from FRONTEND_URL (always present) plus FRONTEND_PRODUCTION_URL
// (only if set). See app.ts for how this is used.
//
// FRONTEND_PRODUCTION_URL accepts one origin, or multiple separated by
// commas (e.g. "https://a.example,https://b.example") — Version 7,
// Milestone 81 added this so a domain migration can allow the old
// origin (e.g. GitHub Pages) and the new one (a custom domain) at the
// same time, without a second env var or a code change needed at the
// exact moment of cutover. Each entry is trimmed; empty entries (e.g.
// a stray trailing comma) are dropped. A single value with no comma
// behaves exactly as before this change.
//
// Important: an "origin" is scheme + host (+ port), never a path — the
// browser's Origin header for a request from
// https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/shop is
// just "https://ramagoma212-glitch.github.io", with no /seasonedz-ecommerce
// suffix. So every entry in FRONTEND_PRODUCTION_URL must be that bare
// scheme+host value, not a full path — see backend/DEPLOYMENT.md.
const frontendProductionOrigins = (env.frontendProductionUrl ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const allowedOrigins: string[] = [env.frontendUrl, ...frontendProductionOrigins];

export const isProduction = env.nodeEnv === "production";
