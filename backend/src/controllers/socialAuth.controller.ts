// Social sign-in controller (Version 7, Milestone 171F) — Google,
// Facebook, Apple. Every route here ultimately either (a) creates the
// exact same customer_session cookie normal email/password login
// creates (see customerAuth.controller.ts's sessionCookieOptions,
// reused here) so a social-login customer lands in the same account/
// orders/settings as everyone else, or (b) attaches a provider identity
// to an already-authenticated customer. Nothing here ever puts a token
// of any kind in a URL — every redirect back to the frontend carries at
// most a short status code in the query string (e.g. ?authError=... or
// ?linked=google), never a session/access/ID token.

import type { NextFunction, Request, Response } from "express";
import type { AuthProvider } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { env } from "../config/env.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import {
  CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
  CUSTOMER_SESSION_COOKIE_NAME,
  createCustomerSession,
} from "../services/customerAuth.service.js";
import { sessionCookieOptions } from "./customerAuth.controller.js";
import { beginOAuthState, consumeOAuthState, OAuthStateError, type OAuthStatePayload } from "../services/oauthState.service.js";
import {
  findOrCreateCustomerForProviderLogin,
  linkProviderToCustomer,
  listConnectedProviders,
  SocialAuthError,
  unlinkProviderFromCustomer,
  type VerifiedProviderIdentity,
} from "../services/socialAuth.service.js";
import { buildGoogleAuthorizationUrl, exchangeGoogleCallback, GoogleOAuthError, googleCallbackUrl } from "../services/googleOAuth.service.js";
import { buildFacebookAuthorizationUrl, exchangeFacebookCallback, FacebookOAuthError, facebookCallbackUrl } from "../services/facebookOAuth.service.js";
import { AppleOAuthCancelledError, AppleOAuthError, appleCallbackUrl, buildAppleAuthorizationUrl, exchangeAppleCallback } from "../services/appleOAuth.service.js";

type ProviderSlug = "google" | "facebook" | "apple";

const SLUG_TO_PROVIDER: Record<ProviderSlug, AuthProvider> = {
  google: "GOOGLE",
  facebook: "FACEBOOK",
  apple: "APPLE",
};

function isProviderReady(provider: AuthProvider): boolean {
  switch (provider) {
    case "GOOGLE":
      return env.isGoogleAuthConfigured;
    case "FACEBOOK":
      return env.isFacebookAuthConfigured;
    case "APPLE":
      return env.isAppleAuthConfigured;
    default:
      return false;
  }
}

// GET /api/auth/providers — public, safe to call from an unauthenticated
// page (the login/register forms). Only ever booleans; a provider is
// never reported ready unless it is genuinely usable right now (see
// isGoogleAuthConfigured/isFacebookAuthConfigured/isAppleAuthConfigured
// in config/env.ts — flag AND full credentials, both required).
export function authProvidersHandler(_req: Request, res: Response): void {
  sendSuccess(res, {
    message: "Available sign-in providers retrieved successfully.",
    data: {
      google: env.isGoogleAuthConfigured,
      facebook: env.isFacebookAuthConfigured,
      apple: env.isAppleAuthConfigured,
    },
  });
}

function redirectToAccountWithError(res: Response, code: string): void {
  const url = new URL("/account", preferredFrontendBaseUrl());
  url.searchParams.set("authError", code);
  res.redirect(url.toString());
}

function redirectToAccount(res: Response, extraParams?: Record<string, string>): void {
  const url = new URL("/account", preferredFrontendBaseUrl());
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
}

// GET /api/auth/oauth/:provider — begins a sign-in (default) or, with
// ?intent=link, an "attach this provider to my already-signed-in
// account" flow. optionalCustomerAuth (applied on the route) means
// req.customerUser is populated whenever the browser already has a
// valid customer_session cookie, without ever blocking a logged-out
// visitor from starting a normal login.
export function oauthStartHandler(slug: ProviderSlug) {
  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const provider = SLUG_TO_PROVIDER[slug];
      const intent = req.query.intent === "link" ? "link" : "login";

      if (intent === "link" && !req.customerUser) {
        sendError(res, { message: "You must be signed in to connect an account.", statusCode: 401 });
        return;
      }

      if (!isProviderReady(provider)) {
        sendError(res, { message: `${slug.charAt(0).toUpperCase()}${slug.slice(1)} sign-in is not available right now.`, statusCode: 503 });
        return;
      }

      const statePayload = beginOAuthState(res, {
        provider,
        intent,
        ...(intent === "link" && req.customerUser ? { linkingCustomerId: req.customerUser.id } : {}),
      });

      let authorizationUrl: string;
      switch (provider) {
        case "GOOGLE":
          authorizationUrl = await buildGoogleAuthorizationUrl(statePayload);
          break;
        case "FACEBOOK":
          authorizationUrl = await buildFacebookAuthorizationUrl(statePayload);
          break;
        case "APPLE":
          authorizationUrl = await buildAppleAuthorizationUrl(statePayload);
          break;
      }

      res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  };
}

async function completeLogin(res: Response, identity: VerifiedProviderIdentity): Promise<void> {
  const { customer } = await findOrCreateCustomerForProviderLogin(identity);
  const { rawToken } = await createCustomerSession(customer.id);
  res.cookie(CUSTOMER_SESSION_COOKIE_NAME, rawToken, {
    ...sessionCookieOptions(),
    maxAge: CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
  });
  redirectToAccount(res);
}

async function completeLink(req: Request, res: Response, statePayload: OAuthStatePayload, identity: VerifiedProviderIdentity, slug: ProviderSlug): Promise<void> {
  // The state cookie's signature only proves this backend issued it a
  // few minutes ago — it does NOT prove the customer is still signed in
  // right now (a logout/session-expiry could have happened mid-flow).
  // req.customerUser (populated by optionalCustomerAuth from the live
  // customer_session cookie on this very request) is the independent,
  // authoritative re-check the milestone brief requires before ever
  // attaching a provider to an account.
  if (!req.customerUser || req.customerUser.id !== statePayload.linkingCustomerId) {
    redirectToAccountWithError(res, "link_session_expired");
    return;
  }

  await linkProviderToCustomer(req.customerUser.id, identity);
  redirectToAccount(res, { linked: slug });
}

// GET /api/auth/oauth/google/callback, GET /api/auth/oauth/facebook/callback,
// POST /api/auth/oauth/apple/callback — never redirects with a token of
// any kind (see file header); every outcome, success or failure, ends
// in a plain redirect to /account on the frontend.
export function oauthCallbackHandler(slug: ProviderSlug) {
  return async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const provider = SLUG_TO_PROVIDER[slug];
      const incomingState = slug === "apple" ? (req.body?.state as string | undefined) : (req.query.state as string | undefined);

      let statePayload: OAuthStatePayload;
      try {
        statePayload = consumeOAuthState(req, res, provider, incomingState);
      } catch (error) {
        redirectToAccountWithError(res, error instanceof OAuthStateError && error.message.includes("expired") ? "state_expired" : "state_invalid");
        return;
      }

      let identity: VerifiedProviderIdentity;
      try {
        switch (provider) {
          case "GOOGLE": {
            const callbackUrl = new URL(req.originalUrl, googleCallbackUrl());
            const result = await exchangeGoogleCallback(callbackUrl, statePayload);
            identity = { provider, providerUserId: result.providerUserId, email: result.email, firstName: result.firstName, lastName: result.lastName, profileImageUrl: result.profileImageUrl };
            break;
          }
          case "FACEBOOK": {
            const code = typeof req.query.code === "string" ? req.query.code : "";
            if (!code) throw new FacebookOAuthError();
            const result = await exchangeFacebookCallback(code, statePayload);
            identity = { provider, providerUserId: result.providerUserId, email: result.email, firstName: result.firstName, lastName: result.lastName, profileImageUrl: result.profileImageUrl };
            break;
          }
          case "APPLE": {
            const callbackUrl = new URL(appleCallbackUrl());
            const result = await exchangeAppleCallback(req.body ?? {}, callbackUrl, statePayload);
            identity = { provider, providerUserId: result.providerUserId, email: result.email, firstName: result.firstName, lastName: result.lastName, profileImageUrl: null };
            break;
          }
        }
      } catch (error) {
        if (error instanceof AppleOAuthCancelledError) {
          redirectToAccountWithError(res, "cancelled");
          return;
        }
        if (error instanceof GoogleOAuthError || error instanceof FacebookOAuthError || error instanceof AppleOAuthError) {
          redirectToAccountWithError(res, "generic");
          return;
        }
        throw error;
      }

      if (statePayload.intent === "link") {
        await completeLink(req, res, statePayload, identity, slug);
        return;
      }

      await completeLogin(res, identity);
    } catch (error) {
      if (error instanceof SocialAuthError) {
        const codeMap: Record<string, string> = {
          ACCOUNT_DISABLED: "account_disabled",
          ACCOUNT_EXISTS: "account_exists",
          EMAIL_REQUIRED: "email_required",
          PROVIDER_ALREADY_LINKED_ELSEWHERE: "provider_linked_elsewhere",
          LAST_LOGIN_METHOD: "last_login_method",
        };
        redirectToAccountWithError(res, codeMap[error.code] ?? "generic");
        return;
      }
      next(error);
    }
  };
}

// GET /api/auth/connected-accounts — requireCustomerAuth (applied on
// the route). Booleans only — never a providerUserId, never any secret.
export async function listConnectedAccountsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const providers = await listConnectedProviders(req.customerUser!.id);
    sendSuccess(res, { message: "Connected accounts retrieved successfully.", data: { providers } });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/auth/connected-accounts/:provider — requireCustomerAuth.
export async function disconnectProviderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.provider).toLowerCase() as ProviderSlug;
    const provider = SLUG_TO_PROVIDER[slug];
    if (!provider) {
      sendError(res, { message: "Unknown provider.", statusCode: 400 });
      return;
    }

    await unlinkProviderFromCustomer(req.customerUser!.id, provider);
    sendSuccess(res, { message: `${slug.charAt(0).toUpperCase()}${slug.slice(1)} disconnected successfully.` });
  } catch (error) {
    if (error instanceof SocialAuthError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
