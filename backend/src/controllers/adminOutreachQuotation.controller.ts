// Milestone 201: admin B2B quotation handlers. Every route is mounted
// behind requireAdminAuth (routes/adminOutreachQuotation.routes.ts).
// Totals, numbers, prices and recipients are always recomputed or
// revalidated on the server; nothing the client sends is trusted as a total.

import type { NextFunction, Request, Response } from "express";
import type { QuotationStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as quotations from "../services/outreach/b2bQuotation.service.js";
import { renderQuotationPdf } from "../services/outreach/b2bQuotationPdf.js";
import { handleCrmServiceError } from "./adminOutreachCrm.controller.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";
import type { AdminActor } from "../services/outreach/crmActivity.service.js";

const QUOTATION_STATUSES: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"];

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

function quotationIdOf(req: Request, res: Response): string | null {
  const { id } = req.params;
  if (!id) {
    sendError(res, { message: "Quotation id is required", statusCode: 400 });
    return null;
  }
  return id;
}

export async function listQuotationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, contactId, search, page, limit } = req.query;
    const parsedStatus = typeof status === "string" && (QUOTATION_STATUSES as string[]).includes(status) ? (status as QuotationStatus) : undefined;
    const pageNumber = Math.max(1, Number.parseInt(typeof page === "string" ? page : "1", 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number.parseInt(typeof limit === "string" ? limit : "25", 10) || 25));
    const result = await quotations.listQuotations({
      status: parsedStatus,
      contactId: typeof contactId === "string" && contactId ? contactId : undefined,
      search: typeof search === "string" && search.trim() ? search.trim().slice(0, 100) : undefined,
      page: pageNumber,
      limit: limitNumber,
    });
    sendSuccess(res, { message: "Quotations retrieved", data: result });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function quotationSummaryHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const counts = await quotations.countQuotationsByStatus();
    sendSuccess(res, { message: "Quotation summary retrieved", data: counts });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function getQuotationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = quotationIdOf(req, res);
    if (!id) return;
    const quotation = await quotations.getQuotation(id);
    sendSuccess(res, { message: "Quotation retrieved", data: quotation });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function createQuotationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = requireActor(req, res);
    if (!actor) return;
    const quotation = await quotations.createQuotationDraft(bodyOf(req), actor);
    sendSuccess(res, { message: "Quotation draft created", statusCode: 201, data: quotation });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function updateQuotationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = quotationIdOf(req, res);
    if (!id) return;
    const quotation = await quotations.updateQuotationDraft(id, bodyOf(req));
    sendSuccess(res, { message: "Quotation draft updated", data: quotation });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function duplicateQuotationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = quotationIdOf(req, res);
    const actor = requireActor(req, res);
    if (!id || !actor) return;
    const quotation = await quotations.duplicateQuotation(id, actor);
    sendSuccess(res, { message: "Quotation duplicated as a new draft", statusCode: 201, data: quotation });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

export async function sendQuotationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = quotationIdOf(req, res);
    const actor = requireActor(req, res);
    if (!id || !actor) return;
    const quotation = await quotations.sendQuotation(id, bodyOf(req), actor);
    void recordAdminSecurityEvent({ adminUserId: actor.id, eventType: "B2B_QUOTATION_SENT", summary: `Quotation ${id} sent by email` });
    sendSuccess(res, { message: "Quotation sent by email", data: quotation });
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}

const TERMINAL_ACTIONS = {
  accept: "ACCEPTED",
  decline: "DECLINED",
  expire: "EXPIRED",
  cancel: "CANCELLED",
} as const;

export function transitionHandlerFor(action: keyof typeof TERMINAL_ACTIONS) {
  return async function transitionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = quotationIdOf(req, res);
      const actor = requireActor(req, res);
      if (!id || !actor) return;
      const quotation = await quotations.transitionQuotation(id, TERMINAL_ACTIONS[action], actor);
      sendSuccess(res, { message: `Quotation marked ${TERMINAL_ACTIONS[action].toLowerCase()}`, data: quotation });
    } catch (error) {
      handleCrmServiceError(error, res, next);
    }
  };
}

export async function quotationPdfHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = quotationIdOf(req, res);
    if (!id) return;
    const quotation = await quotations.getQuotation(id);
    const pdf = await renderQuotationPdf(quotation);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${quotation.quotationNumber}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(Buffer.from(pdf));
  } catch (error) {
    handleCrmServiceError(error, res, next);
  }
}
