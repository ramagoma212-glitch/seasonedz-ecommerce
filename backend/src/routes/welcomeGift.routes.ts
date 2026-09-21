// Milestone 189: welcome-gift download route. Mounted at
// /api/welcome-gift in routes/index.ts. Deliberately public (no auth
// middleware) — the recipient is reading this from an email, not a
// logged-in browser session; the token itself is the credential, same
// "unguessable, hashed before storage, expiring" discipline as
// downloads.routes.ts's own guest-token routes, which this file's rate
// limiter choice deliberately mirrors the reasoning of (see
// rateLimit.middleware.ts's own comment on welcomeGiftDownloadRateLimiter).
import { Router } from "express";
import { downloadWelcomeGiftAssetHandler } from "../controllers/welcomeGift.controller.js";
import { welcomeGiftDownloadRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get("/download/:token/:assetKey", welcomeGiftDownloadRateLimiter, downloadWelcomeGiftAssetHandler);

export default router;
