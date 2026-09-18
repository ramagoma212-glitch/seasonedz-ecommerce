// Milestone 187, Part C: strict production origin allowlist. Never
// "Access-Control-Allow-Origin: *" — every request's Origin header is
// checked against this exact list before any CORS header is echoed
// back, and an unapproved origin is rejected outright (no CORS headers
// at all), not silently allowed with a generic header.
const PRODUCTION_ORIGINS = ["https://www.seasonedzgroup.co.za", "https://seasonedzgroup.co.za"];

const DEV_ORIGIN_PATTERN = /^http:\/\/localhost(:\d+)?$/;

export function isAllowedOrigin(origin: string | null, environment: string): boolean {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  // Localhost is only ever accepted outside production — a Worker
  // deployed with ENVIRONMENT="production" never accepts it, even if
  // a request somehow claims to be from localhost.
  if (environment !== "production" && DEV_ORIGIN_PATTERN.test(origin)) return true;
  return false;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
