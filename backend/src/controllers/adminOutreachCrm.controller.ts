// Milestone 201: CRM activity, reply, next action, follow-up, catalogue and
// order-linking handlers. Thin: validation and persistence live in the
// outreach services. Admin identity always comes from the verified session.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { OutreachContactError } from "../services/outreach/outreachContact.service.js";
import { QuotationRuleError } from "../services/outreach/b2bQuotation.rules.js";
import * as crm from "../services/outreach/crmActivity.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";
import type { AdminActor } from "../services/outreach/crmActivity.service.js";

export function handleCrmServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof OutreachContactError || error instanceof QuotationRuleError) {
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

function requireId(req: Request, res: Response): string | null {
  const { id } = req.params;
  if (!id) {
    sendError(res, { message: "Contact id is required", statusCode: 400 });
    return null;
  }
  return id;
}

function bodyOf(req: Request): Record<string, unknown> {
  return (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
}

export async function recordActivityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const activity = await crm.recordManualActivity(contactId, bodyOf(req), actor);
    sendSuccess(res, { message: "Activity recorded", statusCode: 201, data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function setFollowUpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    if (!contactId) return;
    const contact = await crm.setFollowUp(contactId, bodyOf(req));
    sendSuccess(res, { message: "Follow-up updated", data: contact });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function completeFollowUpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const activity = await crm.completeFollowUp(contactId, bodyOf(req), actor);
    sendSuccess(res, { message: "Follow-up completed", data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function recordCatalogueSentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const activity = await crm.recordCatalogueSent(contactId, bodyOf(req), actor);
    sendSuccess(res, { message: "Catalogue sent recorded", statusCode: 201, data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function getContactTimelineHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    if (!contactId) return;
    const timeline = await crm.getContactTimeline(contactId);
    sendSuccess(res, { message: "Timeline retrieved", data: timeline });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function linkOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const orderId = req.params.orderId;
    if (!orderId) {
      sendError(res, { message: "Order id is required", statusCode: 400 });
      return;
    }
    const activity = await crm.linkOrder(contactId, orderId, actor);
    sendSuccess(res, { message: "Order linked to contact", statusCode: 201, data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function markCustomerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const orderId = req.params.orderId;
    if (!orderId) {
      sendError(res, { message: "Order id is required", statusCode: 400 });
      return;
    }
    const activity = await crm.markCustomer(contactId, orderId, actor);
    void recordAdminSecurityEvent({ adminUserId: actor.id, eventType: "OUTREACH_CRM_CUSTOMER_STATUS_CHANGED", summary: `Contact ${contactId} marked customer from order ${orderId}` });
    sendSuccess(res, { message: "Contact marked as customer", data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function markRepeatCustomerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    const actor = requireActor(req, res);
    if (!contactId || !actor) return;
    const activity = await crm.markRepeatCustomer(contactId, actor);
    void recordAdminSecurityEvent({ adminUserId: actor.id, eventType: "OUTREACH_CRM_CUSTOMER_STATUS_CHANGED", summary: `Contact ${contactId} marked repeat customer` });
    sendSuccess(res, { message: "Contact marked as repeat customer", data: activity });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function getContactCrmDetailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = requireId(req, res);
    if (!contactId) return;
    const detail = await crm.getContactCrmDetail(contactId);
    sendSuccess(res, { message: "CRM detail retrieved", data: detail });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}
