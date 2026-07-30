// Version 7, Milestone 152: guest secure-token digital download access.
// Mounted at /api/downloads in routes/index.ts. Deliberately public (no
// auth middleware) — a guest, by definition, has no account/session to
// authenticate with. The token itself IS the credential: it's a random,
// unguessable value, only ever sent once in a payment-confirmation
// email, hashed before storage, and expiring — see
// digitalDownload.service.ts's own header comment. Never accepts an
// order number alone as permission (Core Rule 11 in the milestone
// brief) — every handler here requires the token in the URL and
// re-verifies it against the database on every call.

import { Router } from "express";
import { getGuestDownloadsHandler, requestGuestDownloadHandler } from "../controllers/digitalDownload.controller.js";
import { customerLoginRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

// Reuses the existing login rate limiter — same shape of risk (a
// public, unauthenticated endpoint someone could try to brute-force),
// same conservative per-IP throttling, no need for a third rate-limit
// config just for this.
router.get("/guest/:token", customerLoginRateLimiter, getGuestDownloadsHandler);
router.post("/guest/:token/:orderItemId", customerLoginRateLimiter, requestGuestDownloadHandler);

export default router;
