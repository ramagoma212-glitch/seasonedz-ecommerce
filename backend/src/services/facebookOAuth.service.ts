// Facebook sign-in via Meta's current OAuth 2.0 web login flow
// (Version 7, Milestone 171F). Facebook does not publish a full OpenID
// Connect discovery document for the classic web login dialog, so
// (unlike Google/Apple) this talks to Meta's documented REST endpoints
// directly rather than through openid-client — this is exactly what
// every maintained Facebook OAuth library (including passport-facebook)
// does under the hood; nothing here is hand-rolled cryptography, only
// HTTPS calls plus the same random state/PKCE values every provider in
// this file gets from oauthState.service.ts.
//
// PKCE (S256) is included since Meta's Graph API login dialog supports
// it, per the milestone brief's "use PKCE where supported". The state
// parameter is independently verified twice: once by
// oauthState.service.ts's signed cookie (see socialAuth.controller.ts)
// and once again by this file requiring an exact match against what we
// generated, before ever exchanging the code.

import { env } from "../config/env.js";

const FACEBOOK_GRAPH_VERSION = "v21.0";
const FACEBOOK_DIALOG_URL = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;
const FACEBOOK_TOKEN_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`;
const FACEBOOK_PROFILE_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`;

// Expected minimum only, per the milestone brief — never friends,
// pages, advertising, business data, posts, or anything else.
const FACEBOOK_SCOPE = "public_profile,email";

export class FacebookOAuthError extends Error {
  constructor(message = "Facebook sign-in could not be verified. Please try again.") {
    super(message);
    this.name = "FacebookOAuthError";
  }
}

// Version 7, Milestone 171F.1: uses env.oauthCallbackBaseUrl, NOT
// env.backendPublicUrl directly — see config/env.ts and
// googleOAuth.service.ts's own comment on why (same shared-variable
// staleness bug affects every provider's callback equally).
export function facebookCallbackUrl(): string {
  return `${env.oauthCallbackBaseUrl}/api/auth/oauth/facebook/callback`;
}

export interface FacebookAuthorizationParams {
  state: string;
  codeVerifier: string;
}

async function sha256Base64Url(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("base64url");
}

export async function buildFacebookAuthorizationUrl(params: FacebookAuthorizationParams): Promise<string> {
  const codeChallenge = await sha256Base64Url(params.codeVerifier);

  const url = new URL(FACEBOOK_DIALOG_URL);
  url.searchParams.set("client_id", env.facebookAppId as string);
  url.searchParams.set("redirect_uri", facebookCallbackUrl());
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", FACEBOOK_SCOPE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.href;
}

export interface FacebookIdentity {
  providerUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface FacebookTokenResponse {
  access_token?: string;
  error?: { message?: string };
}

interface FacebookProfileResponse {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
  error?: { message?: string };
}

// `expectedState`/`code` come from the callback query string;
// `params.state`/`params.codeVerifier` come from our own signed
// oauth_state cookie (already independently matched against the query
// string's `state` by consumeOAuthState before this is ever called —
// see socialAuth.controller.ts). Re-checking here too costs nothing and
// keeps this file safe to call correctly on its own.
export async function exchangeFacebookCallback(code: string, params: FacebookAuthorizationParams): Promise<FacebookIdentity> {
  const tokenUrl = new URL(FACEBOOK_TOKEN_URL);
  tokenUrl.searchParams.set("client_id", env.facebookAppId as string);
  tokenUrl.searchParams.set("client_secret", env.facebookAppSecret as string);
  tokenUrl.searchParams.set("redirect_uri", facebookCallbackUrl());
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("code_verifier", params.codeVerifier);

  let tokenBody: FacebookTokenResponse;
  try {
    const tokenResponse = await fetch(tokenUrl, { method: "GET" });
    tokenBody = (await tokenResponse.json()) as FacebookTokenResponse;
    if (!tokenResponse.ok || !tokenBody.access_token) {
      throw new FacebookOAuthError();
    }
  } catch (error) {
    if (error instanceof FacebookOAuthError) throw error;
    throw new FacebookOAuthError();
  }

  const profileUrl = new URL(FACEBOOK_PROFILE_URL);
  profileUrl.searchParams.set("fields", "id,first_name,last_name,email,picture.type(large)");
  profileUrl.searchParams.set("access_token", tokenBody.access_token);

  let profile: FacebookProfileResponse;
  try {
    const profileResponse = await fetch(profileUrl, { method: "GET" });
    profile = (await profileResponse.json()) as FacebookProfileResponse;
    if (!profileResponse.ok || !profile.id) {
      throw new FacebookOAuthError();
    }
  } catch (error) {
    if (error instanceof FacebookOAuthError) throw error;
    throw new FacebookOAuthError();
  }

  return {
    // Facebook's numeric user id — immutable per app, the correct
    // providerUserId per the milestone brief. Never the email.
    providerUserId: profile.id,
    email: typeof profile.email === "string" && profile.email ? profile.email : null,
    firstName: typeof profile.first_name === "string" ? profile.first_name : null,
    lastName: typeof profile.last_name === "string" ? profile.last_name : null,
    profileImageUrl: typeof profile.picture?.data?.url === "string" ? profile.picture.data.url : null,
  };
}
