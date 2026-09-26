// Milestone 198, Part 12: the public endpoint every outreach email's
// unsubscribe link actually calls. Deliberately generous with what it
// returns on failure — an invalid/expired/forged token or an unknown
// contact id all resolve to the same safe "link processed" response,
// never leaking whether a given id/token was real (the same
// discipline referralCapture.controller.ts's own preview endpoint
// already applies to an unknown referral code).

import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { verifyOutreachUnsubscribeToken } from "../utils/outreachUnsubscribeToken.js";
import { unsubscribeContactByToken } from "../services/outreach/outreachContact.service.js";

export async function unsubscribeOutreachContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = typeof req.query.token === "string" ? req.query.token : (req.body?.token as unknown);
    const contactId = verifyOutreachUnsubscribeToken(rawToken);

    if (!contactId) {
      sendSuccess(res, { message: "This link is invalid or has expired.", data: { success: false } });
      return;
    }

    const contact = await unsubscribeContactByToken(contactId);
    sendSuccess(res, {
      message: contact ? "You have been unsubscribed." : "This link is invalid or has expired.",
      data: { success: Boolean(contact), organisationName: contact?.organisationName ?? null },
    });
  } catch (error) {
    next(error);
  }
}
