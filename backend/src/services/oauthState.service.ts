// OAuth state/nonce/PKCE storage (Version 7, Milestone 171F).
//
// Deliberately no new database table: the state is carried in a
// short-lived, HttpOnly, Secure(prod), SameSite=Lax, *signed* cookie —
// the signature (cookie-parser's HMAC, the same secret already signing
// customer_session/admin_session) is what proves this backend created
// it, and it is bound to the one browser that initiated the flow
// exactly the way a server-side session-store lookup would be, without
// needing one. Cleared the instant it's read (consumeOAuthState), so a
// duplicated/replayed callback request finds nothing the second time —
// this makes reuse structurally impossible, not just checked-for.
//
// Never trust the state cookie's contents on their own for anything
// privileged (e.g. `linkingCustomerId`) — the signature only proves
// "this backend wrote this value a few minutes ago", not "the customer
// is still authenticated right now". Callers must always independently
// re-verify the live session too — see socialAuth.controller.ts.

import type { CookieOptions, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { AuthProvider } from "@prisma/client";
import { isProduction } from "../config/env.js";

export const OAUTH_STATE_COOKIE_NAME = "oauth_state";
// 10 minutes: generous enough for a real provider consent screen
// (including a customer who pauses to create a new Google account
// mid-flow), short enough that an abandoned attempt can never be
// replayed much later.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthIntent = "login" | "link";

export interface OAuthStatePayload {
  provider: AuthProvider;
  intent: OAuthIntent;
  state: string;
  nonce: string;
  codeVerifier: string;
  linkingCustomerId?: string;
  issuedAt: number;
}

export class OAuthStateError extends Error {
  constructor(message = "Your sign-in attempt could not be verified. Please try again.") {
    super(message);
    this.name = "OAuthStateError";
  }
}

// Belt-and-suspenders replay protection, on top of clearing the cookie
// below: a normal browser never resends a cleared cookie, but nothing
// stops a captured callback URL (with its original cookie header) from
// being replayed directly. This in-memory set closes that gap
// explicitly — same "single-process only, resets on restart" tolerance
// already accepted for rate limiting elsewhere in this backend (see
// rateLimit.middleware.ts's own header comment); a multi-instance
// deployment would need a shared store instead, but that's not this
// milestone's concern. Independent of this, the OAuth provider itself
// also rejects a reused authorization *code* server-side regardless.
const consumedStates = new Map<string, number>();

function pruneConsumedStates(): void {
  const now = Date.now();
  for (const [state, expiresAt] of consumedStates) {
    if (expiresAt <= now) consumedStates.delete(state);
  }
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    signed: true,
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS,
  };
}

export interface BeginOAuthStateParams {
  provider: AuthProvider;
  intent: OAuthIntent;
  // Only meaningful for intent "link" — see the file header on why this
  // is re-verified, never trusted alone, at consume time.
  linkingCustomerId?: string;
}

export function beginOAuthState(res: Response, params: BeginOAuthStateParams): OAuthStatePayload {
  const payload: OAuthStatePayload = {
    provider: params.provider,
    intent: params.intent,
    state: randomBytes(32).toString("hex"),
    nonce: randomBytes(32).toString("hex"),
    // RFC 7636 PKCE code_verifier: 32 random bytes as base64url is 43
    // characters, within the required 43-128 range.
    codeVerifier: randomBytes(32).toString("base64url"),
    ...(params.linkingCustomerId ? { linkingCustomerId: params.linkingCustomerId } : {}),
    issuedAt: Date.now(),
  };

  res.cookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(payload), cookieOptions());
  return payload;
}

// Reads and immediately clears the state cookie (single-use by
// construction), then validates provider match, state match, and
// expiry. Throws OAuthStateError — never returns a partial/unverified
// payload — on any failure: missing cookie, tampered signature,
// provider mismatch, missing/mismatched `incomingState`, or expiry.
export function consumeOAuthState(req: Request, res: Response, provider: AuthProvider, incomingState: string | undefined): OAuthStatePayload {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, cookieOptions());

  const raw = req.signedCookies?.[OAUTH_STATE_COOKIE_NAME];
  if (!raw || typeof raw !== "string") {
    throw new OAuthStateError();
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new OAuthStateError();
  }

  if (payload.provider !== provider) {
    throw new OAuthStateError();
  }

  if (!incomingState || incomingState !== payload.state) {
    throw new OAuthStateError();
  }

  if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > OAUTH_STATE_TTL_MS) {
    throw new OAuthStateError("Your sign-in attempt expired. Please try again.");
  }

  pruneConsumedStates();
  if (consumedStates.has(payload.state)) {
    throw new OAuthStateError();
  }
  consumedStates.set(payload.state, Date.now() + OAUTH_STATE_TTL_MS);

  return payload;
}
