import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateEnquiryRequest } from "../validators/enquiry.validator.js";
import * as enquiryService from "../services/enquiry.service.js";
import { sendAdminNewEnquiryEmail, sendEnquiryReceivedEmail } from "../services/email/email.service.js";

export async function createEnquiryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateEnquiryRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    const enquiry = await enquiryService.createEnquiry(validation.value);

    // Version 7, Milestone 117: fire-and-forget, same discipline as
    // order.controller.ts — never allowed to block or fail enquiry
    // submission. name/email/message come from the validated input,
    // not the created row's own output, since enquiryService's own
    // deliberately-minimal EnquiryCreateOutput (id/type/status/
    // createdAt only) never returns personal details — see that
    // file's own comment.
    const emailData = {
      id: enquiry.id,
      type: enquiry.type,
      name: validation.value.name,
      email: validation.value.email,
      message: validation.value.message,
    };
    void sendAdminNewEnquiryEmail(emailData).catch(() => {});
    void sendEnquiryReceivedEmail(emailData).catch(() => {});

    sendSuccess(res, {
      message: "Enquiry received successfully",
      statusCode: 201,
      data: enquiry,
    });
  } catch (error) {
    next(error);
  }
}

export async function getEnquiryStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Enquiry id is required", statusCode: 400 });
      return;
    }

    const status = await enquiryService.getPublicEnquiryStatusById(id);

    if (!status) {
      sendError(res, { message: `Enquiry not found: ${id}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Enquiry status retrieved successfully", data: status });
  } catch (error) {
    next(error);
  }
}
