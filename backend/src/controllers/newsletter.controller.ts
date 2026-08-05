import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateNewsletterSubscribeRequest } from "../validators/newsletter.validator.js";
import * as newsletterService from "../services/newsletter.service.js";
import { NEWSLETTER_SUBSCRIBED_MESSAGE } from "../services/newsletter.service.js";

export async function subscribeToNewsletterHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateNewsletterSubscribeRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    // Honeypot tripped: respond exactly like a genuine success so a
    // bot never learns its submission was rejected, but never touch
    // the database — see newsletter.validator.ts's own comment.
    if (validation.value.isSpam) {
      sendSuccess(res, { message: NEWSLETTER_SUBSCRIBED_MESSAGE, statusCode: 201, data: { subscribed: true } });
      return;
    }

    const outcome = await newsletterService.subscribeToNewsletter(validation.value);

    sendSuccess(res, {
      message: outcome.message,
      statusCode: outcome.action === "already-active" ? 200 : 201,
      data: { subscribed: true },
    });
  } catch (error) {
    next(error);
  }
}
