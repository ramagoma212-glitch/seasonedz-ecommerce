// Version 7, Milestone 171F.2: confirms the Facebook Graph API version
// bump (v21.0 -> v25.0) actually took effect everywhere Facebook auth
// talks to Meta — the authorization dialog URL, the token exchange
// request, and the profile fetch request — and that permissions/scope
// were left untouched by this version-only change.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FACEBOOK_GRAPH_VERSION, buildFacebookAuthorizationUrl, exchangeFacebookCallback } from "./facebookOAuth.service.js";
import { resolveOAuthCallbackBaseUrl, LEGACY_RENDER_BACKEND_HOST } from "../config/env.js";
import { env } from "../config/env.js";

test("FACEBOOK_GRAPH_VERSION is v25.0, not the old v21.0", () => {
  assert.equal(FACEBOOK_GRAPH_VERSION, "v25.0");
});

test("the authorization dialog URL uses v25.0 and never v21.0", async () => {
  const url = await buildFacebookAuthorizationUrl({ state: "test-state", codeVerifier: "test-verifier" });
  assert.ok(url.includes("/v25.0/dialog/oauth"), `expected /v25.0/dialog/oauth in ${url}`);
  assert.ok(!url.includes("v21.0"), `must not reference v21.0 anywhere: ${url}`);
});

test("the authorization dialog URL still requests exactly public_profile,email — the version bump changed nothing else", async () => {
  const url = new URL(await buildFacebookAuthorizationUrl({ state: "test-state", codeVerifier: "test-verifier" }));
  assert.equal(url.searchParams.get("scope"), "public_profile,email");
});

test("the authorization dialog URL still includes PKCE (code_challenge/S256) and the given state — unaffected by the version bump", async () => {
  const url = new URL(await buildFacebookAuthorizationUrl({ state: "my-state-value", codeVerifier: "my-code-verifier" }));
  assert.equal(url.searchParams.get("state"), "my-state-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"), "expected a code_challenge to be present");
});

test("the token exchange request and the profile fetch request both target v25.0, never v21.0", async () => {
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(async (input: string | URL) => {
    const url = input.toString();
    requestedUrls.push(url);
    if (url.includes("/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "fb-user-1", first_name: "Thandiwe", last_name: "Nkosi", email: "thandiwe@example.com" }), { status: 200 });
  }) as unknown as typeof fetch;

  try {
    await exchangeFacebookCallback("test-code", { state: "s", codeVerifier: "v" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrls.length, 2, "expected exactly two outgoing requests: token exchange, then profile fetch");
  for (const url of requestedUrls) {
    assert.ok(url.includes("v25.0"), `expected v25.0 in outgoing request: ${url}`);
    assert.ok(!url.includes("v21.0"), `must not reference v21.0 in any outgoing request: ${url}`);
  }
  assert.ok(requestedUrls[0]!.includes("/oauth/access_token"));
  assert.ok(requestedUrls[1]!.includes("/me"));
});

test("Facebook's production callback resolves through the canonical OAuth base — api.seasonedzgroup.co.za, never onrender.com", () => {
  const base = resolveOAuthCallbackBaseUrl({
    isProduction: true,
    rawBackendPublicUrl: `https://${LEGACY_RENDER_BACKEND_HOST}`,
    port: "5000",
  });
  const facebookCallback = `${base}/api/auth/oauth/facebook/callback`;

  assert.equal(facebookCallback, "https://api.seasonedzgroup.co.za/api/auth/oauth/facebook/callback");
  assert.ok(!facebookCallback.includes("onrender.com"));
});

test("Facebook remains reported as disabled without FACEBOOK_AUTH_ENABLED and real credentials configured (this test's own local/CI environment)", () => {
  // This milestone must not flip FACEBOOK_AUTH_ENABLED on — asserting
  // against the real env module (not a mock) is deliberate here: it
  // proves the actual running configuration this test suite executes
  // under still reports Facebook as unusable, exactly as required.
  assert.equal(env.isFacebookAuthConfigured, false);
});

test("Apple remains reported as disabled — this milestone did not touch Apple auth at all", () => {
  assert.equal(env.isAppleAuthConfigured, false);
});
