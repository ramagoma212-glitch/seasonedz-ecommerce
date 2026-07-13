import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateEnquiryRequest } from "../validators/enquiry.validator.js";
import * as enquiryService from "../services/enquiry.service.js";

export async function createEnquiryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateEnquiryRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    const enquiry = await enquiryService.createEnquiry(validation.value);

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
