// Centralised environment configuration. Everything that reads
// `process.env` anywhere in the backend should go through this file
// instead, so there's exactly one place that knows the variable names
// and their defaults.

import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  nodeEnv: getEnv("NODE_ENV", "development"),
  port: Number(getEnv("PORT", "5000")),
  // Prisma Client reads DATABASE_URL directly from process.env via the
  // schema's datasource block, not through this field — kept here too,
  // optionally, so the Express app itself can still start even if it's
  // unset (nothing in app.ts/server.ts requires it yet).
  databaseUrl: process.env.DATABASE_URL ?? "",
  frontendUrl: getEnv("FRONTEND_URL", "http://localhost:5173"),
};

export const isProduction = env.nodeEnv === "production";
