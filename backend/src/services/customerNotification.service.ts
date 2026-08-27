// Version 7, Milestone 174C: the Customer Notification Centre — brief
// sections 16-19. Reuses the existing Notification table entirely (no
// new model) — see schema.prisma's own comment on Notification.readAt
// for why the same row can represent both the email that was sent and
// the account-visible notification, rather than a second, parallel
// IN_APP row per event.
//
// Only ever reads/updates rows whose recipientCustomerId matches the
// authenticated customer making the request (brief section 18 — no
// IDOR: never authorised by a notification id alone, an order number,
// or an email the client supplies). Only genuinely SENT rows are ever
// visible here — a still-PENDING scheduled notification (e.g. a review
// request not yet due) hasn't happened from the customer's point of
// view, and FAILED/CANCELLED/PROCESSING are operational delivery
// states with no customer-facing meaning; those stay admin-only (see
// adminNotification.service.ts).
import { NotificationStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface CustomerNotificationListItem {
  id: string;
  eventType: string;
  subject: string | null;
  orderNumber: string | null;
  readAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface CustomerNotificationListResult {
  notifications: CustomerNotificationListItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const listSelect = {
  id: true,
  eventType: true,
  renderedSubject: true,
  orderNumber: true,
  readAt: true,
  sentAt: true,
  createdAt: true,
} satisfies import("@prisma/client").Prisma.NotificationSelect;

export async function listNotificationsForCustomer(customerId: string, page: number, limit: number): Promise<CustomerNotificationListResult> {
  const where = { recipientCustomerId: customerId, status: NotificationStatus.SENT };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return {
    notifications: rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      subject: row.renderedSubject,
      orderNumber: row.orderNumber,
      readAt: row.readAt,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
    })),
    total,
    unreadCount,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export interface CustomerNotificationDetail extends CustomerNotificationListItem {
  body: string | null;
}

// Returns null both for "doesn't exist" and "belongs to someone else"
// — the same indistinguishable-404 discipline every other ownership
// check in this codebase already uses (e.g. findEligibleOrderItem in
// productReview.service.ts), so a client can never use the response
// shape to probe which ids exist.
export async function getNotificationForCustomer(customerId: string, notificationId: string): Promise<CustomerNotificationDetail | null> {
  const row = await prisma.notification.findFirst({
    where: { id: notificationId, recipientCustomerId: customerId, status: NotificationStatus.SENT },
    select: { ...listSelect, renderedBody: true },
  });
  if (!row) return null;

  return {
    id: row.id,
    eventType: row.eventType,
    subject: row.renderedSubject,
    body: row.renderedBody,
    orderNumber: row.orderNumber,
    readAt: row.readAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

// Returns true only if a row genuinely belonging to this customer was
// found and marked — the controller turns "false" into a 404, never a
// 403 (never confirms a different customer's notification exists).
export async function markNotificationRead(customerId: string, notificationId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientCustomerId: customerId, status: NotificationStatus.SENT },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(customerId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { recipientCustomerId: customerId, status: NotificationStatus.SENT, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
