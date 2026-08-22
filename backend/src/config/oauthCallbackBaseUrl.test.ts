// Version 7, Milestone 171F.1: regression test for the live production
// bug this fix addresses — Google rejected the OAuth authorization
// request with 400 redirect_uri_mismatch because the shared
// BACKEND_PUBLIC_URL Render variable was still carrying the
// pre-Milestone-133 legacy Render hostname
// (seasonedz-ecommerce.onrender.com) instead of the canonical
// api.seasonedzgroup.co.za production API domain. resolveOAuthCallbackBaseUrl()
// is a pure function (see config/env.ts), so this exercises it directly
// with the exact values Render's real environment can produce — no
// module-reload/process-spawning tricks needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_PRODUCTION_BACKEND_URL, LEGACY_RENDER_BACKEND_HOST, resolveOAuthCallbackBaseUrl } from "./env.js";

test("production + BACKEND_PUBLIC_URL still set to the legacy onrender.com host -> resolves to the canonical api.seasonedzgroup.co.za domain, never onrender.com", () => {
  const result = resolveOAuthCallbackBaseUrl({
    isProduction: true,
    rawBackendPublicUrl: `https://${LEGACY_RENDER_BACKEND_HOST}`,
    port: "5000",
  });

  assert.equal(result, CANONICAL_PRODUCTION_BACKEND_URL);
  assert.ok(!result.includes("onrender.com"), "must never resolve to any onrender.com host in production");
});

test("production + BACKEND_PUBLIC_URL unset -> still resolves to the canonical production domain, never undefined/blank", () => {
  const result = resolveOAuthCallbackBaseUrl({ isProduction: true, rawBackendPublicUrl: undefined, port: "5000" });
  assert.equal(result, CANONICAL_PRODUCTION_BACKEND_URL);
});

test("production + BACKEND_PUBLIC_URL correctly set to the real custom domain -> uses it as-is", () => {
  const result = resolveOAuthCallbackBaseUrl({
    isProduction: true,
    rawBackendPublicUrl: "https://api.seasonedzgroup.co.za",
    port: "5000",
  });
  assert.equal(result, "https://api.seasonedzgroup.co.za");
});

test("production + BACKEND_PUBLIC_URL set to some OTHER non-legacy value is trusted as-is (only the known legacy host is overridden)", () => {
  const result = resolveOAuthCallbackBaseUrl({
    isProduction: true,
    rawBackendPublicUrl: "https://staging-api.seasonedzgroup.co.za",
    port: "5000",
  });
  assert.equal(result, "https://staging-api.seasonedzgroup.co.za");
});

test("development + BACKEND_PUBLIC_URL unset -> defaults to http://localhost:<PORT>, matching the required dev callback", () => {
  const result = resolveOAuthCallbackBaseUrl({ isProduction: false, rawBackendPublicUrl: undefined, port: "5000" });
  assert.equal(result, "http://localhost:5000");
});

test("development + BACKEND_PUBLIC_URL explicitly set -> respected as-is (never forced to localhost or the canonical domain)", () => {
  const result = resolveOAuthCallbackBaseUrl({
    isProduction: false,
    rawBackendPublicUrl: "https://my-ngrok-tunnel.example.com",
    port: "5000",
  });
  assert.equal(result, "https://my-ngrok-tunnel.example.com");
});

test("the resulting full Google/Facebook/Apple callback URLs are exactly the canonical production values in production", () => {
  const base = resolveOAuthCallbackBaseUrl({
    isProduction: true,
    rawBackendPublicUrl: `https://${LEGACY_RENDER_BACKEND_HOST}`,
    port: "5000",
  });

  assert.equal(`${base}/api/auth/oauth/google/callback`, "https://api.seasonedzgroup.co.za/api/auth/oauth/google/callback");
  assert.equal(`${base}/api/auth/oauth/facebook/callback`, "https://api.seasonedzgroup.co.za/api/auth/oauth/facebook/callback");
  assert.equal(`${base}/api/auth/oauth/apple/callback`, "https://api.seasonedzgroup.co.za/api/auth/oauth/apple/callback");
});
