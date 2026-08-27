// Version 7, Milestone 174C: customer notification preferences — see
// notificationPreference.service.ts's own header comment.
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { getNotificationPreferences, updateNotificationPreferences } from "../services/notificationPreference.service.js";

export async function getMyNotificationPreferencesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const preferences = await getNotificationPreferences(customerId);
    sendSuccess(res, { message: "Notification preferences retrieved successfully", data: preferences });
  } catch (error) {
    next(error);
  }
}

export async function updateMyNotificationPreferencesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const preferences = await updateNotificationPreferences(customerId, req.body ?? {});
    sendSuccess(res, { message: "Notification preferences updated successfully", data: preferences });
  } catch (error) {
    next(error);
  }
}
