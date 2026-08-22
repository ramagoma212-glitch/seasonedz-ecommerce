// Version 7, Milestone 171F: security tests for the OAuth
// state/nonce/PKCE cookie mechanism — see oauthState.service.ts's own
// header comment for the design (a signed, HttpOnly, short-lived cookie
// standing in for a server-side state store, plus an explicit in-memory
// single-use tracker). These are the milestone brief's own required
// "invalid state rejected / missing state rejected / expired state
// rejected / replayed state rejected" tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CookieOptions, Request, Response } from "express";
import { beginOAuthState, consumeOAuthState, OAUTH_STATE_COOKIE_NAME, OAuthStateError } from "./oauthState.service.js";

// Minimal fake Response capturing exactly what res.cookie()/res.clearCookie()
// are called with — no real Express app/server needed for this file,
// same "test the unit, not the framework" spirit as the stub() helper
// used throughout this backend's other *.service.test.ts files.
function fakeRes(): Response & { _cookieValue?: string } {
  const fake: Partial<Response> & { _cookieValue?: string } = {
    cookie(name: string, value: string, _options?: CookieOptions) {
      if (name === OAUTH_STATE_COOKIE_NAME) fake._cookieValue = value;
      return fake as Response;
    },
    clearCookie(_name: string, _options?: CookieOptions) {
      return fake as Response;
    },
  };
  return fake as Response & { _cookieValue?: string };
}

function fakeReqWithCookie(rawValue: string | undefined): Request {
  return { signedCookies: rawValue === undefined ? {} : { [OAUTH_STATE_COOKIE_NAME]: rawValue } } as unknown as Request;
}

test("valid round trip: begin then consume with the matching state succeeds and returns the same payload", () => {
  const beginRes = fakeRes();
  const payload = beginOAuthState(beginRes, { provider: "GOOGLE", intent: "login" });

  const req = fakeReqWithCookie(beginRes._cookieValue);
  const consumeRes = fakeRes();
  const result = consumeOAuthState(req, consumeRes, "GOOGLE", payload.state);

  assert.equal(result.state, payload.state);
  assert.equal(result.nonce, payload.nonce);
  assert.equal(result.codeVerifier, payload.codeVerifier);
  assert.equal(result.provider, "GOOGLE");
});

test("missing state cookie is rejected", () => {
  const req = fakeReqWithCookie(undefined);
  assert.throws(() => consumeOAuthState(req, fakeRes(), "GOOGLE", "some-state"), OAuthStateError);
});

test("missing incoming state parameter is rejected even with a valid cookie present", () => {
  const beginRes = fakeRes();
  beginOAuthState(beginRes, { provider: "GOOGLE", intent: "login" });
  const req = fakeReqWithCookie(beginRes._cookieValue);

  assert.throws(() => consumeOAuthState(req, fakeRes(), "GOOGLE", undefined), OAuthStateError);
});

test("mismatched (invalid) incoming state is rejected", () => {
  const beginRes = fakeRes();
  beginOAuthState(beginRes, { provider: "GOOGLE", intent: "login" });
  const req = fakeReqWithCookie(beginRes._cookieValue);

  assert.throws(() => consumeOAuthState(req, fakeRes(), "GOOGLE", "attacker-supplied-state"), OAuthStateError);
});

test("wrong provider (state was issued for a different provider) is rejected", () => {
  const beginRes = fakeRes();
  const payload = beginOAuthState(beginRes, { provider: "GOOGLE", intent: "login" });
  const req = fakeReqWithCookie(beginRes._cookieValue);

  assert.throws(() => consumeOAuthState(req, fakeRes(), "FACEBOOK", payload.state), OAuthStateError);
});

test("expired state is rejected", () => {
  const expiredPayload = {
    provider: "GOOGLE" as const,
    intent: "login" as const,
    state: "expired-state-value",
    nonce: "n",
    codeVerifier: "v",
    issuedAt: Date.now() - 60 * 60 * 1000, // an hour ago — well past the 10-minute TTL
  };
  const req = fakeReqWithCookie(JSON.stringify(expiredPayload));

  assert.throws(() => consumeOAuthState(req, fakeRes(), "GOOGLE", expiredPayload.state), (error: unknown) => error instanceof OAuthStateError && /expired/i.test(error.message));
});

test("a replayed state — the exact same cookie value presented twice — is rejected the second time", () => {
  const beginRes = fakeRes();
  const payload = beginOAuthState(beginRes, { provider: "GOOGLE", intent: "login" });

  // First consumption succeeds (a genuine callback).
  const firstReq = fakeReqWithCookie(beginRes._cookieValue);
  consumeOAuthState(firstReq, fakeRes(), "GOOGLE", payload.state);

  // A captured/replayed request presenting the identical cookie value a
  // second time — even though nothing here depends on the browser
  // having actually dropped the cookie, this must still be rejected.
  const secondReq = fakeReqWithCookie(beginRes._cookieValue);
  assert.throws(() => consumeOAuthState(secondReq, fakeRes(), "GOOGLE", payload.state), OAuthStateError);
});

test("a tampered/unparseable cookie value is rejected", () => {
  const req = fakeReqWithCookie("not-valid-json-at-all");
  assert.throws(() => consumeOAuthState(req, fakeRes(), "GOOGLE", "some-state"), OAuthStateError);
});

test("link intent carries the linking customer id through the round trip", () => {
  const beginRes = fakeRes();
  const payload = beginOAuthState(beginRes, { provider: "APPLE", intent: "link", linkingCustomerId: "customer-123" });
  const req = fakeReqWithCookie(beginRes._cookieValue);

  const result = consumeOAuthState(req, fakeRes(), "APPLE", payload.state);
  assert.equal(result.intent, "link");
  assert.equal(result.linkingCustomerId, "customer-123");
});
