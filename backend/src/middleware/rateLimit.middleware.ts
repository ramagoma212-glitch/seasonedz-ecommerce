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
