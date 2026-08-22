// Social sign-in routes (Version 7, Milestone 171F). Mounted at
// /api/auth in routes/index.ts — deliberately its own top-level mount
// point, not nested under /api/customers, since GET /api/auth/providers
// must be reachable by a fully logged-out visitor on the login page,
// same as the OAuth start/callback routes themselves.

import { Router } from "express";
import { authProvidersHandler, disconnectProviderHandler, listConnectedAccountsHandler, oauthCallbackHandler, oauthStartHandler } from "../controllers/socialAuth.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.middleware.js";
import { optionalCustomerAuth } from "../middleware/optionalCustomerAuth.middleware.js";
import { oauthAccountManagementRateLimiter, oauthCallbackRateLimiter, oauthStartRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

// Public — the login/register page (and the "Connected Accounts" panel,
// once the customer is already signed in) both call this to decide
// which of the three buttons to actually render.
router.get("/providers", authProvidersHandler);

// optionalCustomerAuth (never requireCustomerAuth) on every OAuth route
// below: a normal login attempt must work while fully logged out, and
// the callback route independently re-verifies a "link" intent's
// customer id against req.customerUser itself (see
// socialAuth.controller.ts's completeLink) rather than ever depending
// on route-level auth enforcement alone.
router.get("/oauth/google", optionalCustomerAuth, oauthStartRateLimiter, oauthStartHandler("google"));
router.get("/oauth/google/callback", optionalCustomerAuth, oauthCallbackRateLimiter, oauthCallbackHandler("google"));

router.get("/oauth/facebook", optionalCustomerAuth, oauthStartRateLimiter, oauthStartHandler("facebook"));
router.get("/oauth/facebook/callback", optionalCustomerAuth, oauthCallbackRateLimiter, oauthCallbackHandler("facebook"));

router.get("/oauth/apple", optionalCustomerAuth, oauthStartRateLimiter, oauthStartHandler("apple"));
// Apple's web login uses response_mode=form_post — this is the one
// OAuth callback in this file that is a POST, not a GET. See
// appleOAuth.service.ts.
router.post("/oauth/apple/callback", optionalCustomerAuth, oauthCallbackRateLimiter, oauthCallbackHandler("apple"));

// Account Settings -> Connected Accounts. Both require an authenticated
// customer — starting a *link* (as opposed to a login) also requires
// this, enforced separately inside oauthStartHandler.
router.get("/connected-accounts", requireCustomerAuth, listConnectedAccountsHandler);
router.delete("/connected-accounts/:provider", requireCustomerAuth, oauthAccountManagementRateLimiter, disconnectProviderHandler);

export default router;
