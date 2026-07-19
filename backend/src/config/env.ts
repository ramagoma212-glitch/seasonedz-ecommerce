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

// Provider API keys (RESEND_API_KEY, SENDGRID_API_KEY, SMTP_*) are
// deliberately NOT validated here, even when EMAIL_ENABLED is true —
// no provider is actually wired up yet (Milestone 24 is templates +
// a console-only service), so requiring them now would just be
// busywork with nothing to check against. A future milestone that
// picks a real provider should add that provider's specific
// requirement here, at the point it actually starts being used.
if (emailEnabled) {
  const missing: string[] = [];
  if (!emailFromAddress) missing.push("EMAIL_FROM_ADDRESS");
  if (!adminNotificationEmail) missing.push("ADMIN_NOTIFICATION_EMAIL");

  if (missing.length > 0) {
    throw new Error(
      `EMAIL_ENABLED is true but missing required email environment variable(s): ${missing.join(", ")}. Set these in backend/.env, or set EMAIL_ENABLED=false until email is ready — see backend/EMAIL_SETUP.md.`
    );
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
  // Optional second allowed CORS origin — e.g. the deployed GitHub
  // Pages URL. See "CORS / Allowed Origins" in README.md.
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
  // Email — see the block above. No provider credentials are read
  // here; a real provider integration adds its own vars when it exists.
  emailEnabled,
  emailProvider,
  emailFromName,
  emailFromAddress,
  adminNotificationEmail,
  // Admin auth — see the block above. Falls back to a random,
  // process-only secret when unset (never logged, never persisted).
  adminSessionSecret: adminSessionSecret || randomBytes(32).toString("hex"),
};

// Every browser origin CORS should accept — never a wildcard. Built
// from FRONTEND_URL (always present) plus FRONTEND_PRODUCTION_URL
// (only if set). See app.ts for how this is used.
//
// Important: an "origin" is scheme + host (+ port), never a path — the
// browser's Origin header for a request from
// https://ramagoma212-glitch.github.io/seasonedz-ecommerce/#/shop is
// just "https://ramagoma212-glitch.github.io", with no /seasonedz-ecommerce
// suffix. So FRONTEND_PRODUCTION_URL must be set to that bare
// scheme+host value, not the full GitHub Pages project-site path — see
// backend/DEPLOYMENT.md.
export const allowedOrigins: string[] = [env.frontendUrl, env.frontendProductionUrl].filter(
  (url): url is string => Boolean(url)
);

export const isProduction = env.nodeEnv === "production";
