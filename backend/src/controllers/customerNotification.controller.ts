// Version 7, Milestone 174C: the Customer Notification Centre — see
// customerNotification.service.ts's own header comment. Every handler
// requires requireCustomerAuth (mounted in customer.routes.ts) and
// only ever uses req.customerUser.id, never a customerId from the
// request body/query/params — same discipline as every other customer
// controller in this codebase.
import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam } from "../utils/query.js";
import {
  listNotificationsForCustomer,
  getNotificationForCustomer,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/customerNotification.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

export async function listMyNotificationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const page = parsePositiveIntParam(req.query.page) ?? 1;
    const limit = Math.min(parsePositiveIntParam(req.query.limit) ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const result = await listNotificationsForCustomer(customerId, page, limit);
    sendSuccess(res, { message: "Notifications retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMyNotificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Notification id is required.", statusCode: 400 });
      return;
    }

    const notification = await getNotificationForCustomer(customerId, id);
    if (!notification) {
      sendError(res, { message: "Notification not found.", statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Notification retrieved successfully", data: notification });
  } catch (error) {
    next(error);
  }
}

export async function markMyNotificationReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Notification id is required.", statusCode: 400 });
      return;
    }

    const marked = await markNotificationRead(customerId, id);
    if (!marked) {
      sendError(res, { message: "Notification not found.", statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Notification marked as read." });
  } catch (error) {
    next(error);
  }
}

export async function markAllMyNotificationsReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const count = await markAllNotificationsRead(customerId);
    sendSuccess(res, { message: "Notifications marked as read.", data: { markedCount: count } });
  } catch (error) {
    next(error);
  }
}
