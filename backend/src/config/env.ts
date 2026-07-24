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
  // Product image upload — see the block above. supabaseServiceRoleKey
  // is undefined unless explicitly set; never logged anywhere.
  supabaseUrl,
  supabaseServiceRoleKey,
  productImagesBucket,
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
