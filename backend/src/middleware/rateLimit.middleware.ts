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
