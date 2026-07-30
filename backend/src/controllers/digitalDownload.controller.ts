// Version 7, Milestone 152: secure digital download endpoints —
// logged-in customer (requireCustomerAuth, mounted under
// /api/customers in customer.routes.ts) and guest secure-token
// (public, mounted at /api/downloads in downloads.routes.ts). Every
// handler here delegates its actual access decision to
// digitalDownload.service.ts, which re-verifies ownership and payment
// status from the database on every call — nothing here trusts
// anything beyond that.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import {
  DigitalDownloadError,
  getPurchasedDigitalItemsForCustomerOrder,
  getPurchasedDigitalItemsForGuestToken,
  requestSignedDownloadUrlForCustomer,
  requestSignedDownloadUrlForGuestToken,
} from "../services/digitalDownload.service.js";
import { DigitalAssetStorageError } from "../services/digitalAssetStorage.service.js";

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof DigitalDownloadError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  if (error instanceof DigitalAssetStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

export async function getCustomerOrderDownloadsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { orderNumber } = req.params;
    if (!orderNumber) {
      sendError(res, { message: "Order number is required.", statusCode: 400 });
      return;
    }

    const items = await getPurchasedDigitalItemsForCustomerOrder(orderNumber, customerId);
    sendSuccess(res, { message: "Digital downloads retrieved successfully.", data: { items } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function requestCustomerDownloadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { orderItemId } = req.params;
    if (!orderItemId) {
      sendError(res, { message: "Order item id is required.", statusCode: 400 });
      return;
    }

    const result = await requestSignedDownloadUrlForCustomer(orderItemId, customerId);
    sendSuccess(res, { message: "Download link generated.", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function getGuestDownloadsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      sendError(res, { message: "Download token is required.", statusCode: 400 });
      return;
    }

    const items = await getPurchasedDigitalItemsForGuestToken(token);
    sendSuccess(res, { message: "Digital downloads retrieved successfully.", data: { items } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function requestGuestDownloadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, orderItemId } = req.params;
    if (!token || !orderItemId) {
      sendError(res, { message: "Download token and order item id are required.", statusCode: 400 });
      return;
    }

    const result = await requestSignedDownloadUrlForGuestToken(token, orderItemId);
    sendSuccess(res, { message: "Download link generated.", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
