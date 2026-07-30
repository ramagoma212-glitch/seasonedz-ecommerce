// Shared "which frontend origin do I put in a customer-facing link"
// helper. Extracted from customerAuth.controller.ts's own
// resetPasswordBaseUrl() (Version 7, Milestone 132B fix) when Milestone
// 152 needed the exact same logic for guest digital-download links —
// two independent copies of this github.io-skip fix would only risk
// drifting apart later.
//
// FRONTEND_PRODUCTION_URL is a CORS allow-list (see
// DOMAIN_CONNECTION_PLAN_CO_ZA.md's "Backend CORS" section), not an
// ordered list of preference — Render's real value lists the legacy
// GitHub Pages origin FIRST (kept only so old bookmarks/links still
// work during the domain transition), then the real
// www.seasonedzgroup.co.za origin. Blindly taking index 0 sent real
// password-reset emails with a dead github.io link — found live during
// Milestone 132B's owner-facing test. Fix: skip any github.io origin
// and prefer the first remaining one, falling back to FRONTEND_URL for
// local/dev where FRONTEND_PRODUCTION_URL isn't set at all.
import { env } from "../config/env.js";

export function preferredFrontendBaseUrl(): string {
  const productionOrigins = (env.frontendProductionUrl ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const preferredOrigin = productionOrigins.find((origin) => !origin.includes("github.io")) ?? productionOrigins[0];

  return preferredOrigin || env.frontendUrl;
}
