// Milestone 198: admin B2B outreach contact management. Same thin-
// handler shape as adminCoupon.controller.ts — all business logic lives
// in outreachContact.service.ts/outreachImport.service.ts. Every route
// this file exports is mounted behind requireAdminAuth (see
// routes/adminOutreachContact.routes.ts).

import type { NextFunction, Request, Response } from "express";
import { Prisma, OutreachContactStatus, OutreachLeadStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as outreachContactService from "../services/outreach/outreachContact.service.js";
import { OutreachContactError, OUTREACH_FOLLOW_UP_STATES, type OutreachFollowUpState } from "../services/outreach/outreachContact.service.js";
import { parseOutreachContactsCsv, parsePastedOutreachContacts, previewOutreachImport, commitOutreachImport, type RawImportRow } from "../services/outreach/outreachImport.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof OutreachContactError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  if (isPrismaUniqueConstraintError(error)) {
    sendError(res, { message: "A contact with this email already exists.", statusCode: 409 });
    return;
  }
  next(error);
}

export async function listContactsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { search, organisationType, province, city, source, tag, status, leadStatus, followUpState, page, limit } = req.query;
    const result = await outreachContactService.listContacts({
      search: typeof search === "string" ? search : undefined,
      organisationType: typeof organisationType === "string" ? organisationType : undefined,
      province: typeof province === "string" ? province : undefined,
      city: typeof city === "string" ? city : undefined,
      source: typeof source === "string" ? source : undefined,
      tag: typeof tag === "string" ? tag : undefined,
      status: typeof status === "string" && status in OutreachContactStatus ? (status as OutreachContactStatus) : undefined,
      leadStatus: typeof leadStatus === "string" && leadStatus in OutreachLeadStatus ? (leadStatus as OutreachLeadStatus) : undefined,
      followUpState:
        typeof followUpState === "string" && OUTREACH_FOLLOW_UP_STATES.includes(followUpState as OutreachFollowUpState)
          ? (followUpState as OutreachFollowUpState)
          : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, { message: "Contacts retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getCrmSummaryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await outreachContactService.getCrmSummary();
    sendSuccess(res, { message: "CRM summary retrieved successfully", data: summary });
  } catch (error) {
    next(error);
  }
}

export async function getContactHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Contact id is required", statusCode: 400 });
      return;
    }
    const contact = await outreachContactService.getContact(id);
    if (!contact) {
      sendError(res, { message: `Contact not found: ${id}`, statusCode: 404 });
      return;
    }
    const history = await outreachContactService.getContactCampaignHistory(id);
    sendSuccess(res, { message: "Contact history retrieved successfully", data: { contact, history } });
  } catch (error) {
    next(error);
  }
}

export async function listDistinctContactValuesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const values = await outreachContactService.listDistinctContactValues();
    sendSuccess(res, { message: "Distinct contact values retrieved successfully", data: values });
  } catch (error) {
    next(error);
  }
}

export async function getContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Contact id is required", statusCode: 400 });
      return;
    }
    const contact = await outreachContactService.getContact(id);
    if (!contact) {
      sendError(res, { message: `Contact not found: ${id}`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Contact retrieved successfully", data: contact });
  } catch (error) {
    next(error);
  }
}

export async function createContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await outreachContactService.createContact(req.body ?? {});
    sendSuccess(res, { message: "Contact created successfully", statusCode: 201, data: contact });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Contact id is required", statusCode: 400 });
      return;
    }
    const contact = await outreachContactService.updateContact(id, req.body ?? {});
    sendSuccess(res, { message: "Contact updated successfully", data: contact });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function setContactStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Contact id is required", statusCode: 400 });
      return;
    }
    const { status, reason } = req.body ?? {};
    if (typeof status !== "string" || !(status in OutreachContactStatus)) {
      sendError(res, { message: "A valid status is required.", statusCode: 400 });
      return;
    }
    const contact = await outreachContactService.setContactStatus(id, status as OutreachContactStatus, typeof reason === "string" ? reason : undefined);
    void recordAdminSecurityEvent({
      adminUserId: req.adminUser?.id ?? null,
      eventType: "OUTREACH_CONTACT_SUPPRESSION_CHANGED",
      summary: `Contact ${id} status set to ${status}`,
    });
    sendSuccess(res, { message: "Contact status updated successfully", data: contact });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deleteContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Contact id is required", statusCode: 400 });
      return;
    }
    await outreachContactService.deleteContact(id);
    sendSuccess(res, { message: "Contact deleted successfully", data: null });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

function parseRawImportRows(req: Request): RawImportRow[] {
  const { csvText, pastedText, rows } = req.body ?? {};
  if (Array.isArray(rows)) return rows as RawImportRow[];
  if (typeof csvText === "string") return parseOutreachContactsCsv(csvText);
  if (typeof pastedText === "string") return parsePastedOutreachContacts(pastedText);
  throw new OutreachContactError('Provide "csvText", "pastedText" or "rows".');
}

// Part 6: preview only — never writes anything.
export async function previewImportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = parseRawImportRows(req);
    const preview = await previewOutreachImport(rows);
    sendSuccess(res, { message: "Import preview generated successfully", data: preview });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

// Part 6: the owner-confirmed commit step — always a separate action
// from previewImportHandler above, never triggered automatically by it.
export async function commitImportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = parseRawImportRows(req);
    const result = await commitOutreachImport(rows);
    void recordAdminSecurityEvent({
      adminUserId: req.adminUser?.id ?? null,
      eventType: "OUTREACH_CONTACT_IMPORTED",
      summary: `Imported ${result.created} contact(s), skipped ${result.skipped}`,
    });
    sendSuccess(res, { message: `Imported ${result.created} contact(s).`, data: result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
