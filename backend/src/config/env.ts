// Centralised environment configuration. Everything that reads
// `process.env` anywhere in the backend should go through this file
// instead, so there's exactly one place that knows the variable names
// and their defaults.

import dotenv from "dotenv";

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
