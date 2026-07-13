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
};

// Every browser origin CORS should accept — never a wildcard. Built
// from FRONTEND_URL (always present) plus FRONTEND_PRODUCTION_URL
// (only if set). See app.ts for how this is used.
export const allowedOrigins: string[] = [env.frontendUrl, env.frontendProductionUrl].filter(
  (url): url is string => Boolean(url)
);

export const isProduction = env.nodeEnv === "production";
