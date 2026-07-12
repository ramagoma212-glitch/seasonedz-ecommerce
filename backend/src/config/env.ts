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
  // Not required yet — no database connection is made in this
  // milestone. Left optional so the backend can still start without it.
  databaseUrl: process.env.DATABASE_URL ?? "",
  frontendUrl: getEnv("FRONTEND_URL", "http://localhost:5173"),
};

export const isProduction = env.nodeEnv === "production";
