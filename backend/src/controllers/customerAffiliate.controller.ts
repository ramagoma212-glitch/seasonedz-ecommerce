// Version 7, Milestone 172B.6: affiliate portal handlers. Both routes
// are mounted behind requireCustomerAuth (customer.routes.ts) — thin
// handlers only, every rule lives in customerAffiliate.service.ts.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { CustomerAffiliateError, applyForAffiliateProgramme, getMyAffiliatePortal } from "../services/customerAffiliate.service.js";
import { ReferralAffiliateError } from "../services/referralAffiliate.service.js";

export async function getMyAffiliatePortalHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const portal = await getMyAffiliatePortal(req.customerUser.id);
    sendSuccess(res, { message: "Affiliate portal retrieved successfully", data: { hasAffiliate: portal !== null, affiliate: portal } });
  } catch (error) {
    next(error);
  }
}

export async function applyForAffiliateProgrammeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.customerUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const affiliate = await applyForAffiliateProgramme(req.customerUser.id);
    sendSuccess(res, { message: "Application submitted successfully", statusCode: 201, data: affiliate });
  } catch (error) {
    if (error instanceof CustomerAffiliateError || error instanceof ReferralAffiliateError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
