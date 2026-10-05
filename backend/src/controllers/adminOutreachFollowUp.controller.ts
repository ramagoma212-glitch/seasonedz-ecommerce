// Milestone 202: individual follow-up email handlers. Thin: the send, reserve,
// reconcile and queue rules live in followUpEmail.service.ts. Admin identity
// comes only from the verified session. Sending and reconciling are mounted
// behind requireAdminRole(ADMIN) in the router.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { OutreachContactError } from "../services/outreach/outreachContact.service.js";
import * as followUp from "../services/outreach/followUpEmail.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";
import type { AdminActor } from "../services/outreach/crmActivity.service.js";

function handleError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof OutreachContactError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

function requireActor(req: Request, res: Response): AdminActor | null {
  if (!req.adminUser) {
    sendError(res, { message: "Admin session required.", statusCode: 401 });
    return null;
  }
  return { id: req.adminUser.id, name: req.adminUser.name, email: req.adminUser.email };
}

function bodyOf(req: Request): Record<string, unknown> {
  return (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
}

export async function followUpQueueHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const queue = await followUp.listFollowUpQueue();
    sendSuccess(res, { message: "Follow-up queue retrieved", data: queue });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function followUpComposerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const context = await followUp.getFollowUpComposerContext(req.params.id ?? "");
    sendSuccess(res, { message: "Follow-up composer retrieved", data: context });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function followUpPreviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const preview = await followUp.previewFollowUp(req.params.id ?? "", bodyOf(req));
    sendSuccess(res, { message: "Preview generated. Nothing has been sent.", data: preview });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function followUpSendHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;
    const contactId = req.params.id ?? "";
    const result = await followUp.sendFollowUp(contactId, bodyOf(req), actor);
    if (!result.replayed) {
      void recordAdminSecurityEvent({ adminUserId: actor.id, eventType: "OUTREACH_FOLLOW_UP_EMAIL_SENT", summary: `Follow-up accepted for contact ${contactId}` });
    }
    sendSuccess(res, {
      message: result.replayed ? "This message was already sent. Nothing was sent again." : "Follow-up email accepted by the provider and recorded.",
      data: result,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function followUpReconcileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;
    const result = await followUp.reconcileFollowUpAttempt(req.params.id ?? "", req.params.attemptId ?? "", bodyOf(req), actor);
    void recordAdminSecurityEvent({ adminUserId: actor.id, eventType: "OUTREACH_FOLLOW_UP_EMAIL_SENT", summary: `Follow-up attempt ${req.params.attemptId} reconciled` });
    sendSuccess(res, { message: "Send outcome recorded", data: result });
  } catch (error) {
    handleError(error, res, next);
  }
}
