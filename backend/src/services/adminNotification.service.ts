// Version 7, Milestone 174B: read-only admin visibility into the
// Notification outbox — brief section 58. Deliberately backend-only
// this milestone (no admin frontend page yet — see the final report's
// own "admin notification log" decision); this endpoint exists so the
// data is genuinely inspectable (via any authenticated admin HTTP
// client) without needing direct database access, and so 174C's UI has
// a real, tested API to build against rather than starting from
// nothing. No manual editing of historical records — this file exposes
// list/detail reads only, never a write.
import { NotificationStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface AdminNotificationListFilters {
  page: number;
  limit: number;
  status?: NotificationStatus;
  eventType?: string;
}

export interface AdminNotificationListItem {
  id: string;
  eventType: string;
  channel: string;
  templateName: string;
  recipientEmail: string | null;
  orderNumber: string | null;
  affiliateId: string | null;
  status: NotificationStatus;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface AdminNotificationListResult {
  notifications: AdminNotificationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const listSelect = {
  id: true,
  eventType: true,
  channel: true,
  templateName: true,
  recipientEmail: true,
  orderNumber: true,
  affiliateId: true,
  status: true,
  attemptCount: true,
  maxAttempts: true,
  scheduledAt: true,
  sentAt: true,
  failedAt: true,
  lastError: true,
  createdAt: true,
} satisfies import("@prisma/client").Prisma.NotificationSelect;

export async function listNotifications(filters: AdminNotificationListFilters): Promise<AdminNotificationListResult> {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications,
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

// Version 7, Milestone 174B: renderedBody is deliberately included only
// in the single-item detail read, never the list above — brief section
// 58's own "no manual editing" note doesn't forbid seeing the full
// content, and knowing exactly what a customer received is genuinely
// useful for support, but there's no reason to pull every row's full
// body over the wire for a list view.
export interface AdminNotificationDetail extends AdminNotificationListItem {
  recipientCustomerId: string | null;
  productId: string | null;
  dedupeKey: string;
  nextAttemptAt: Date | null;
  cancelledAt: Date | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  updatedAt: Date;
}

export async function getNotification(id: string): Promise<AdminNotificationDetail | null> {
  return prisma.notification.findUnique({ where: { id } });
}
