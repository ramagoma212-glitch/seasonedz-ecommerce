// Milestone 189: public, unauthenticated, token-gated welcome-gift
// downloads — GET /api/welcome-gift/download/:token/:assetKey, clicked
// straight from the welcome-gift email (a real browser navigation, not
// a frontend fetch() call). Deliberately NOT the JSON-response shape
// every other digital-download endpoint uses (digitalDownload.controller.ts)
// — a human clicking a link in an email client needs an HTTP redirect
// straight to the file, not a JSON body. On success: a 302 redirect to
// a freshly-generated, short-lived Supabase signed URL. On any failure
// (invalid/expired token, unknown/misconfigured asset key): a redirect
// to a generic frontend landing state — never a JSON error, a stack
// trace, a DB id, a storage key, or a bucket name, and never anything
// that could be used to distinguish "wrong token" from "wrong asset
// key" from "expired" (Core Rule: no enumeration).
import type { Request, Response } from "express";
import { resolveWelcomeGiftDownload } from "../services/welcomeGift.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";

export async function downloadWelcomeGiftAssetHandler(req: Request, res: Response): Promise<void> {
  const { token, assetKey } = req.params;

  try {
    const result = token && assetKey ? await resolveWelcomeGiftDownload(token, assetKey) : null;

    if (!result) {
      res.redirect(`${preferredFrontendBaseUrl()}/?welcomeGift=unavailable`);
      return;
    }

    res.redirect(result.signedUrl);
  } catch {
    // Never surfaces the underlying error (storage failure, DB error,
    // etc.) to the browser — same generic landing as any other failure.
    res.redirect(`${preferredFrontendBaseUrl()}/?welcomeGift=unavailable`);
  }
}
