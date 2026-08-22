// Sign in with Apple, web flow (Version 7, Milestone 171F). Apple is
// fully OpenID Connect compliant (discovery document + JWKS at
// https://appleid.apple.com), so — like Google — this uses
// `openid-client` for the actual authorization-code-grant exchange and
// ID token verification (issuer/audience/expiry/signature/nonce), never
// hand-rolled JWT verification.
//
// Two things make Apple different from Google/Facebook here:
//
//  1. Apple's web login requires `response_mode=form_post`: the
//     browser is redirected back via a same-origin auto-submitting POST
//     form, not a GET with a query string — see
//     socialAuth.controller.ts's POST /api/auth/oauth/apple/callback
//     route. openid-client's authorizationCodeGrant() natively supports
//     this by accepting a WHATWG `Request` (built from the parsed POST
//     body below) instead of a `URL`.
//
//  2. Apple does not use a static client secret. It requires a fresh,
//     short-lived JWT (RFC 7519, ES256, header `kid`, claims
//     `iss=TEAM_ID, sub=CLIENT_ID, aud=https://appleid.apple.com`)
//     signed with the Sign in with Apple private key (.p8) as the
//     "client_secret" — this is Apple's own documented mechanism, not a
//     deviation from the OAuth spec's client_secret slot. Generated
//     with `jsonwebtoken` (a mature, maintained JWT library — never
//     hand-rolled ECDSA), fresh on every exchange, immediately
//     discarded after use (never persisted, never logged).
//
// Apple may include a `user` field (first/last name) in the POST body
// on the very first authorization only — extracted separately from the
// OIDC exchange itself, since openid-client has no knowledge of this
// Apple-specific extension. A later sign-in for the same person will
// not include it again; see socialAuth.service.ts for why a returning
// login never overwrites a previously-stored name with nothing.

import * as client from "openid-client";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const APPLE_ISSUER = new URL("https://appleid.apple.com");
const APPLE_AUTHORIZATION_ENDPOINT = "https://appleid.apple.com/auth/authorize";
// Identity only, per the milestone brief — `name` and `email` are the
// two Apple ever offers regardless; nothing broader is ever requested.
const APPLE_SCOPE = "name email";
// Short-lived by choice, not by Apple's requirement (Apple allows up to
// ~6 months) — generated fresh for every single exchange, so there is
// never a stored secret that could go stale or need rotating.
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export class AppleOAuthError extends Error {
  constructor(message = "Apple sign-in could not be verified. Please try again.") {
    super(message);
    this.name = "AppleOAuthError";
  }
}

export class AppleOAuthCancelledError extends Error {
  constructor() {
    super("Apple sign-in was cancelled.");
    this.name = "AppleOAuthCancelledError";
  }
}

function generateAppleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env.appleTeamId,
      iat: now,
      exp: now + CLIENT_SECRET_TTL_SECONDS,
      aud: "https://appleid.apple.com",
      sub: env.appleClientId,
    },
    env.applePrivateKey as string,
    { algorithm: "ES256", keyid: env.appleKeyId }
  );
}

// Version 7, Milestone 171F.1: uses env.oauthCallbackBaseUrl, NOT
// env.backendPublicUrl directly — see config/env.ts and
// googleOAuth.service.ts's own comment on why.
export function appleCallbackUrl(): string {
  return `${env.oauthCallbackBaseUrl}/api/auth/oauth/apple/callback`;
}

export interface AppleAuthorizationParams {
  state: string;
  nonce: string;
  codeVerifier: string;
}

// No client secret and no discovery call needed for this leg — the
// authorization endpoint itself is a stable, publicly documented Apple
// URL, so building the redirect is a pure, network-free operation.
export async function buildAppleAuthorizationUrl(params: AppleAuthorizationParams): Promise<string> {
  const codeChallenge = await client.calculatePKCECodeChallenge(params.codeVerifier);

  const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", env.appleClientId as string);
  url.searchParams.set("redirect_uri", appleCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", APPLE_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.href;
}

export interface AppleIdentity {
  providerUserId: string;
  email: string | null;
  // Only ever non-null on the very first authorization — see the file
  // header. socialAuth.service.ts only uses these at account-creation
  // time, never to overwrite an existing customer's stored name.
  firstName: string | null;
  lastName: string | null;
}

interface AppleFormPostBody {
  code?: string;
  state?: string;
  error?: string;
  user?: string;
}

function parseAppleUserField(rawUser: string | undefined): { firstName: string | null; lastName: string | null } {
  if (!rawUser) return { firstName: null, lastName: null };
  try {
    const parsed = JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } };
    return {
      firstName: typeof parsed.name?.firstName === "string" && parsed.name.firstName ? parsed.name.firstName : null,
      lastName: typeof parsed.name?.lastName === "string" && parsed.name.lastName ? parsed.name.lastName : null,
    };
  } catch {
    return { firstName: null, lastName: null };
  }
}

// `body` is Express's already-parsed POST body (application/
// x-www-form-urlencoded, via the app-wide express.urlencoded()
// middleware already applied in app.ts) — reconstructed here into a
// real WHATWG Request so openid-client's own form_post handling can
// extract/validate `code`/`state` exactly as it would from a live
// request. `callbackUrl` is our own known, exact callback URL — never
// derived from proxy headers.
export async function exchangeAppleCallback(body: Record<string, unknown>, callbackUrl: URL, params: AppleAuthorizationParams): Promise<AppleIdentity> {
  const formBody = body as AppleFormPostBody;

  if (formBody.error) {
    if (formBody.error === "user_cancelled") {
      throw new AppleOAuthCancelledError();
    }
    throw new AppleOAuthError();
  }

  const clientSecret = generateAppleClientSecret();
  const config = await client.discovery(APPLE_ISSUER, env.appleClientId as string, clientSecret, client.ClientSecretPost(clientSecret));

  const formParams = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") formParams.set(key, value);
  }

  const syntheticRequest = new Request(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formParams.toString(),
  });

  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(config, syntheticRequest, {
      pkceCodeVerifier: params.codeVerifier,
      expectedState: params.state,
      expectedNonce: params.nonce,
    });
  } catch {
    throw new AppleOAuthError();
  }

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    throw new AppleOAuthError("Apple did not return a valid identity.");
  }

  const { firstName, lastName } = parseAppleUserField(formBody.user);

  return {
    providerUserId: claims.sub,
    // Apple always includes email (real, or a private-relay address —
    // both are valid, stable-enough identifiers to sign in with) when
    // the `email` scope was granted, on every authorization, not just
    // the first — unlike name, this does not need first-time-only
    // handling.
    email: typeof claims.email === "string" ? claims.email : null,
    firstName,
    lastName,
  };
}
