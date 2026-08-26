// Basic in-memory rate limiting (express-rate-limit). "In-memory" means
// each counter resets if the process restarts and isn't shared across
// multiple instances — fine for this single-process milestone; a
// multi-instance deployment would need a shared store (e.g. Redis)
// instead, but that's not a concern yet.

import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { sendError } from "../utils/apiResponse.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function rateLimitHandler(_req: Request, res: Response): void {
  sendError(res, {
    message: "Too many requests. Please try again later.",
    statusCode: 429,
  });
}

// Backstop for the whole /api surface — generous enough that no normal
// browsing/testing session should ever notice it.
export const generalRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Order creation writes data and touches stock, so it gets its own
// tighter limit on top of the general one above.
export const orderCreationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// A separate counter from orderCreationRateLimiter (not the same
// instance/route) — an IP's order attempts and enquiry submissions
// shouldn't share one combined budget, even though the numbers happen
// to match. Enquiry submission is unauthenticated and write-only, the
// same shape of risk as order creation.
export const enquiryCreationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Payment initiation (Version 3, Milestone 21) does real signature
// generation and a database write on every call, and is unauthenticated
// like order/enquiry creation — same shape of risk, own counter.
export const paymentInitiationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Admin login (Version 7, Milestone 58) gets its own, much tighter
// limit than the other creation limiters above — this endpoint's risk
// is credential-guessing, not accidental double-submission, so a low
// limit is the point, not just a safety backstop.
export const adminLoginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Customer registration (Version 7, Milestone 127) — own counter, same
// shape of risk as order/enquiry creation (unauthenticated, writes
// data), not shared with adminLoginRateLimiter below or with the
// order/enquiry limiters above.
export const customerRegisterRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Customer login (Version 7, Milestone 127) — same tight limit and
// same reasoning as adminLoginRateLimiter above (credential-guessing
// risk, not accidental double-submission), kept as its own counter so
// a burst of customer login attempts never affects the admin login
// budget or vice versa.
export const customerLoginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Customer forgot-password (Version 7, Milestone 132) — same tight
// limit as login above: even though the response is always identical
// regardless of outcome, repeated calls could still be used to spam a
// real customer's inbox with reset emails, so this stays tight rather
// than as generous as registration/order creation.
export const customerForgotPasswordRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Customer reset-password (Version 7, Milestone 132) — a valid call
// already requires a genuine 32-byte random token (astronomically hard
// to guess), so this is a generous backstop against automated abuse
// rather than a credential-guessing defence like the two limiters
// above.
export const customerResetPasswordRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Newsletter subscription (Version 7, Milestone 168F) — own counter,
// same shape of risk as enquiryCreationRateLimiter (unauthenticated,
// write-only, no login required), not shared with any limiter above.
export const newsletterSubscribeRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Product review submission (Version 7, Milestone 171C) — requires a
// logged-in customer (unlike the writes above), but still gets its own
// tight limit: a compromised/scripted session could otherwise spam
// review attempts far faster than a genuine customer ever would.
export const productReviewCreationRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Social sign-in start (Version 7, Milestone 171F) — a real customer
// only ever hits this by clicking a "Continue with ..." button, so this
// stays generous (never blocks normal browsing/retrying after a
// provider-side hiccup) while still bounding an automated hammer of the
// redirect endpoint.
export const oauthStartRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Social sign-in callback (Version 7, Milestone 171F) — the provider
// (Google/Facebook/Apple) redirects the browser here, so this is
// naturally called once per real attempt; the limit exists only to
// bound a scripted replay of a captured callback URL, never to get in
// the way of a genuine customer.
export const oauthCallbackRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Connected-account link/disconnect (Version 7, Milestone 171F) —
// requires an already-authenticated customer, same tighter-than-general
// reasoning as productReviewCreationRateLimiter above.
export const oauthAccountManagementRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Affiliate programme application (Version 7, Milestone 172B.6) —
// requires an already-authenticated customer, same tighter-than-general
// reasoning as productReviewCreationRateLimiter above: a compromised/
// scripted session could otherwise hammer this write endpoint far
// faster than a genuine customer applying once ever would.
export const customerAffiliateApplyRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Referral capture/preview (Version 7, Milestone 172B.4) — public,
// read-only (neither ever writes to the database), called on every
// storefront pageview that carries a ?ref= link and again from the
// checkout page for a live preview, so this stays as generous as
// oauthStartRateLimiter above rather than as tight as a write endpoint.
export const referralCaptureRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
