// Milestone 198: admin B2B outreach campaign lifecycle — draft, build
// recipients, preview audience size, send a test, send in batches,
// retry failures, cancel. All business logic lives in
// outreachCampaign.service.ts; every route here is mounted behind
// requireAdminAuth, with the sending-related actions additionally
// gated by requireAdminRole(ADMIN) (see routes/adminOutreachCampaign.
// routes.ts) — sending real email to external organisations is
// deliberately more sensitive than ordinary draft CRUD.

import type { NextFunction, Request, Response } from "express";
import { OutreachCampaignStatus, OutreachRecipientStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as outreachCampaignService from "../services/outreach/outreachCampaign.service.js";
import { OutreachCampaignError } from "../services/outreach/outreachCampaign.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof OutreachCampaignError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listCampaignsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, page, limit } = req.query;
    const result = await outreachCampaignService.listCampaigns({
      status: typeof status === "string" && status in OutreachCampaignStatus ? (status as OutreachCampaignStatus) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, { message: "Campaigns retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const campaign = await outreachCampaignService.getCampaign(id);
    if (!campaign) {
      sendError(res, { message: `Campaign not found: ${id}`, statusCode: 404 });
      return;
    }
    const recipientCounts = await outreachCampaignService.getCampaignRecipientCounts(id);
    sendSuccess(res, { message: "Campaign retrieved successfully", data: { ...campaign, recipientCounts } });
  } catch (error) {
    next(error);
  }
}

export async function createCampaignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await outreachCampaignService.createCampaign(req.body ?? {}, req.adminUser?.id ?? null);
    void recordAdminSecurityEvent({ adminUserId: req.adminUser?.id ?? null, eventType: "OUTREACH_CAMPAIGN_CREATED", summary: `Campaign "${campaign.name}" created` });
    sendSuccess(res, { message: "Campaign created successfully", statusCode: 201, data: campaign });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateCampaignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const campaign = await outreachCampaignService.updateCampaign(id, req.body ?? {});
    void recordAdminSecurityEvent({ adminUserId: req.adminUser?.id ?? null, eventType: "OUTREACH_CAMPAIGN_EDITED", summary: `Campaign ${id} edited` });
    sendSuccess(res, { message: "Campaign updated successfully", data: campaign });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deleteCampaignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    await outreachCampaignService.deleteCampaign(id);
    sendSuccess(res, { message: "Campaign deleted successfully", data: null });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function previewAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await outreachCampaignService.previewAudience(req.body ?? {});
    sendSuccess(res, { message: "Audience size calculated successfully", data: { count } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function buildRecipientsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const recipientCounts = await outreachCampaignService.buildCampaignRecipients(id, req.body ?? {});
    void recordAdminSecurityEvent({ adminUserId: req.adminUser?.id ?? null, eventType: "OUTREACH_CAMPAIGN_RECIPIENTS_BUILT", summary: `Campaign ${id}: ${recipientCounts.total} recipient(s) built` });
    sendSuccess(res, { message: "Recipient list built successfully", data: recipientCounts });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function listRecipientsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const { status, page, limit } = req.query;
    const result = await outreachCampaignService.listCampaignRecipients(id, {
      status: typeof status === "string" && status in OutreachRecipientStatus ? (status as OutreachRecipientStatus) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, { message: "Recipients retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function sendTestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { testEmailAddress } = req.body ?? {};
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    if (typeof testEmailAddress !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress.trim())) {
      sendError(res, { message: "A valid test email address is required.", statusCode: 400 });
      return;
    }
    await outreachCampaignService.sendTestEmail(id, testEmailAddress.trim());
    void recordAdminSecurityEvent({ adminUserId: req.adminUser?.id ?? null, eventType: "OUTREACH_CAMPAIGN_TEST_SENT", summary: `Campaign ${id}: test sent` });
    sendSuccess(res, { message: "Test email sent successfully", data: null });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function sendBatchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const { batchSize } = req.body ?? {};
    const result = await outreachCampaignService.sendCampaignBatch(id, typeof batchSize === "number" ? batchSize : undefined);
    void recordAdminSecurityEvent({
      adminUserId: req.adminUser?.id ?? null,
      eventType: "OUTREACH_CAMPAIGN_SEND_BATCH",
      summary: `Campaign ${id}: batch sent ${result.sent}, failed ${result.failed}, suppressed ${result.suppressed}`,
    });
    sendSuccess(res, { message: "Batch processed successfully", data: result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function retryFailedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const result = await outreachCampaignService.retryFailedRecipients(id);
    sendSuccess(res, { message: `${result.requeued} failed recipient(s) re-queued.`, data: result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function cancelCampaignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Campaign id is required", statusCode: 400 });
      return;
    }
    const campaign = await outreachCampaignService.cancelCampaign(id);
    sendSuccess(res, { message: "Campaign cancelled successfully", data: campaign });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
