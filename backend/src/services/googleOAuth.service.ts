// Google sign-in via standards-compliant OpenID Connect (Version 7,
// Milestone 171F) — a backend-controlled authorization code flow using
// `openid-client`, a mature, maintained library, per the milestone
// brief's own instruction to prefer that over hand-rolled OAuth
// cryptography or the deprecated gapi.auth2/platform.js. State, nonce,
// and PKCE are generated once per attempt by oauthState.service.ts and
// threaded through here — this file's only job is the two network legs
// (discovery, once per process; the authorization-code-grant exchange,
// once per sign-in) plus extracting a small, safe identity shape out of
// the already-verified ID token.
//
// `openid-client` independently verifies, inside authorizationCodeGrant
// below: the returned `state` matches what we expected, the ID token's
// signature against Google's own published JWKS, `iss` is really
// Google, `aud` is really our client id, the token hasn't expired, and
// (because we pass expectedNonce) the `nonce` claim matches what we
// generated — every check the milestone brief's "GOOGLE SECURITY"
// section requires, none of it hand-rolled here.
//
// Google's access/refresh tokens (if any) are never read out of the
// `tokens` result below beyond `.claims()` — they go out of scope and
// are never persisted, matching "discard temporary provider access
// tokens after identity validation" in the brief.

import * as client from "openid-client";
import { env } from "../config/env.js";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
// Identity only — matches the brief's "use only openid, email, profile
// for authentication. Do not request unrelated Google permissions."
const GOOGLE_SCOPE = "openid email profile";

export class GoogleOAuthError extends Error {
  constructor(message = "Google sign-in could not be verified. Please try again.") {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

let configPromise: Promise<client.Configuration> | null = null;

// Discovery (fetching Google's .well-known/openid-configuration and
// JWKS) is a network call — cached per-process rather than repeated on
// every single sign-in attempt. A failed discovery is never cached, so
// the very next attempt gets a fresh retry instead of being stuck.
async function getConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const clientId = env.googleClientId as string;
    const clientSecret = env.googleClientSecret as string;
    configPromise = client.discovery(GOOGLE_ISSUER, clientId, clientSecret).catch((error) => {
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

export function googleCallbackUrl(): string {
  return `${env.backendPublicUrl}/api/auth/oauth/google/callback`;
}

export interface GoogleAuthorizationParams {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function buildGoogleAuthorizationUrl(params: GoogleAuthorizationParams): Promise<string> {
  const config = await getConfig();
  const codeChallenge = await client.calculatePKCECodeChallenge(params.codeVerifier);

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: googleCallbackUrl(),
    scope: GOOGLE_SCOPE,
    state: params.state,
    nonce: params.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return url.href;
}

export interface GoogleIdentity {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

// `callbackUrl` must be the exact, full URL Google redirected the
// browser to (including its query string) — see socialAuth.controller.ts,
// which builds this from our own known BACKEND_PUBLIC_URL rather than
// trusting proxy headers.
export async function exchangeGoogleCallback(callbackUrl: URL, params: GoogleAuthorizationParams): Promise<GoogleIdentity> {
  const config = await getConfig();

  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: params.codeVerifier,
      expectedState: params.state,
      expectedNonce: params.nonce,
    });
  } catch {
    throw new GoogleOAuthError();
  }

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    throw new GoogleOAuthError("Google did not return a valid identity.");
  }

  // Version 7, Milestone 171F: an unverified email is treated the same
  // as no email at all — defence in depth against a hypothetical
  // unverified-address account-takeover vector, even though Google only
  // ever issues ID tokens for consumer accounts with a verified email
  // in practice.
  const emailVerified = claims.email_verified === true;
  const email = emailVerified && typeof claims.email === "string" ? claims.email : null;

  return {
    providerUserId: claims.sub,
    email,
    emailVerified,
    firstName: typeof claims.given_name === "string" ? claims.given_name : null,
    lastName: typeof claims.family_name === "string" ? claims.family_name : null,
    profileImageUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}
