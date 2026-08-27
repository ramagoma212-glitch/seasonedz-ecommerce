// Version 7, Milestone 174B: thin handlers only — see
// adminNotification.service.ts for the read logic.
import type { NextFunction, Request, Response } from "express";
import { NotificationStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as adminNotificationService from "../services/adminNotification.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

function parseStatusFilter(raw: unknown): NotificationStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(NotificationStatus) as string[]).includes(value) ? (value as NotificationStatus) : undefined;
}

export async function listNotificationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const result = await adminNotificationService.listNotifications({
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit),
      status: parseStatusFilter(req.query.status),
      eventType: parseStringParam(req.query.eventType),
    });

    sendSuccess(res, { message: "Notifications retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Notification id is required.", statusCode: 400 });
      return;
    }

    const notification = await adminNotificationService.getNotification(id);
    if (!notification) {
      sendError(res, { message: `Notification not found: ${id}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Notification retrieved successfully", data: notification });
  } catch (error) {
    next(error);
  }
}
