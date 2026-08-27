// Version 7, Milestone 63: the first write action ever added to the
// admin dashboard (Milestones 58-62 were entirely read-only). Kept in
// its own service file, deliberately separate from
// adminDashboard.service.ts (which stays 100% read queries), so the
// one place in the codebase that writes Order.status is easy to find
// and audit on its own.
//
// Implements the transition table and audit-transaction design from
// VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md and
// VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md.

import { OrderStatus, OrderStatusHistorySource } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { SafeAdminProfile } from "./adminAuth.service.js";
import { reverseCommissionsForOrder } from "./referralCommission.service.js";
import { renderOrderCancelledEmail, renderOrderProcessingEmail } from "./email/emailTemplates.js";
import type { OrderEmailData } from "./email/email.types.js";
import * as notificationEngine from "./notificationEngine.service.js";
import { scheduleProductReviewRequestForDeliveredOrder } from "./productReviewRequest.service.js";

// A business-rule failure (order not found, invalid status, disallowed
// transition, invalid note) — distinct from an unexpected error, so
// the controller can turn it into a clean 4xx instead of a 500. Same
// pattern as OrderError in order.service.ts.
export class OrderStatusUpdateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OrderStatusUpdateError";
    this.statusCode = statusCode;
  }
}

const MAX_NOTE_LENGTH = 500;

// Every key of OrderStatus must appear here (TypeScript enforces this
// via Record<OrderStatus, ...>), including REFUNDED — which maps to an
// empty array on purpose. REFUNDED is never a valid newStatus target
// anywhere in this table (no "from" list includes it) and never has
// outgoing transitions either, exactly matching
// VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md's decision to keep refunds
// entirely out of this workflow — a future, separate, payment-aware
// feature, not something reachable from this endpoint.
// Exported (Version 7, Milestone 173) so courierStatusSync.service.ts
// can reuse the exact same admin-approved transition graph for
// system-driven (courier webhook) transitions, instead of maintaining
// a second, potentially-drifting copy of it.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.READY_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_DELIVERY]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

function parseNewStatus(raw: unknown): OrderStatus {
  if (typeof raw !== "string" || !(Object.values(OrderStatus) as string[]).includes(raw)) {
    throw new OrderStatusUpdateError("newStatus must be a valid order status.");
  }
  return raw as OrderStatus;
}

// Note is stored and, eventually, displayed as plain text only — the
// future admin UI must escape it before rendering (matching this
// project's existing escapeHtml() discipline everywhere else
// user-influenced text reaches the DOM), never treat it as HTML. This
// function cannot mechanically stop an admin from typing a secret into
// the note; that stays a documented process rule (see
// VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md Section 6) — no code path
// in this service ever needs a password, hash, payment secret, card
// number, or bank detail, so none should ever end up here.
function parseNote(raw: unknown, newStatus: OrderStatus): string | null {
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    throw new OrderStatusUpdateError("note must be a string.");
  }

  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (newStatus === OrderStatus.CANCELLED && trimmed.length === 0) {
    throw new OrderStatusUpdateError("A note is required when cancelling an order.");
  }

  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new OrderStatusUpdateError(`note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  return trimmed.length > 0 ? trimmed : null;
}

export interface OrderStatusUpdateResult {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  updatedAt: Date;
  latestStatusHistory: {
    oldStatus: OrderStatus;
    newStatus: OrderStatus;
    note: string | null;
    source: OrderStatusHistorySource;
    createdAt: Date;
    changedByAdminName: string | null;
    changedByAdminEmail: string | null;
  };
}

// Everything below runs in one interactive transaction: read the
// order, validate, write the new status, write the audit row. If the
// audit-row insert fails for any reason, Prisma rolls the whole
// transaction back — the status write is undone too, so a status
// change without a matching audit row can never happen (see
// VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md Section 7).
//
// Deliberately never touches paymentStatus, order totals, items,
// customer details, or Payment/Shipping rows — the `select` on the
// order update below is the enforcement: only `status` is ever passed
// to `data`, and only orderNumber/status/paymentStatus/updatedAt are
// ever read back out.
// Version 7, Milestone 174B: builds the minimal OrderEmailData these
// two templates actually need (neither renderOrderProcessingEmail nor
// renderOrderCancelledEmail reads `items`) straight from the plain
// scalar Order fields already available — no extra `include` needed.
function toStatusChangeEmailData(order: {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  total: import("@prisma/client").Prisma.Decimal;
  paymentStatus: string;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryFee: import("@prisma/client").Prisma.Decimal;
  collectionCity: string | null;
  deliveryStreetAddress: string | null;
  deliverySuburb: string | null;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  deliveryPostalCode: string | null;
  deliveryNotes: string | null;
}): OrderEmailData {
  return {
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    total: order.total.toNumber(),
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    items: [],
    deliveryMethod: order.deliveryMethod,
    deliveryFee: order.deliveryFee.toNumber(),
    collectionCity: order.collectionCity,
    deliveryStreetAddress: order.deliveryStreetAddress,
    deliverySuburb: order.deliverySuburb,
    deliveryCity: order.deliveryCity,
    deliveryProvince: order.deliveryProvince,
    deliveryPostalCode: order.deliveryPostalCode,
    deliveryNotes: order.deliveryNotes,
  };
}

// Version 7, Milestone 174B: ORDER_PROCESSING/ORDER_CANCELLED
// notifications — enqueued strictly AFTER the transaction below has
// committed (brief section 8/39: a notification failure must never be
// able to roll back the real status change), using a dedupeKey scoped
// to this exact transition (orderNumber + the specific
// OrderStatusHistory row id — never just orderNumber alone, since an
// order could in principle be cancelled, and separately some other
// status could reach PROCESSING again is not possible, but this stays
// correct regardless of how many times a given status is genuinely
// re-entered over an order's lifetime).
async function notifyOrderStatusChange(orderNumber: string, newStatus: OrderStatus, historyRowId: string, historyCreatedAt: Date): Promise<void> {
  if (newStatus === OrderStatus.DELIVERED) {
    // Version 7, Milestone 174C, brief section 6: this is the ONLY
    // completion signal Customer Collection orders have today (no
    // dedicated COLLECTED status exists — see
    // scheduleProductReviewRequestForDeliveredOrder()'s own comment for
    // the full "documented limitation"), and it's also reachable as a
    // manual override for a courier order — either way, no separate
    // "your order was delivered" email is sent from here (courier
    // deliveries already get one from courierStatusSync.service.ts;
    // adding a second, admin-triggered one would be new, unrequested
    // scope) — only the review-request scheduling.
    void scheduleProductReviewRequestForDeliveredOrder(orderNumber, historyCreatedAt).catch((error) => {
      console.warn(`[notifications] failed to schedule review request for order=${orderNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
    return;
  }

  if (newStatus !== OrderStatus.PROCESSING && newStatus !== OrderStatus.CANCELLED) return;

  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return;

  const emailData = toStatusChangeEmailData(order);

  if (newStatus === OrderStatus.PROCESSING) {
    await notificationEngine.enqueueAndSendNow({
      eventType: "ORDER_PROCESSING",
      templateName: "order-processing",
      recipientEmail: emailData.customerEmail,
      orderNumber,
      dedupeKey: `ORDER_PROCESSING:${orderNumber}:${historyRowId}`,
      rendered: renderOrderProcessingEmail(emailData),
    });
  } else {
    await notificationEngine.enqueueAndSendNow({
      eventType: "ORDER_CANCELLED",
      templateName: "order-cancelled",
      recipientEmail: emailData.customerEmail,
      orderNumber,
      dedupeKey: `ORDER_CANCELLED:${orderNumber}:${historyRowId}`,
      rendered: renderOrderCancelledEmail(emailData),
    });
  }
}

export async function updateOrderStatus(
  orderNumber: string,
  newStatusRaw: unknown,
  noteRaw: unknown,
  admin: SafeAdminProfile
): Promise<OrderStatusUpdateResult> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { orderNumber } });
    if (!order) {
      throw new OrderStatusUpdateError(`Order not found: ${orderNumber}`, 404);
    }

    const newStatus = parseNewStatus(newStatusRaw);

    const allowedNextStatuses = ALLOWED_TRANSITIONS[order.status];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new OrderStatusUpdateError(`Cannot move order from ${order.status} to ${newStatus}.`);
    }

    const note = parseNote(noteRaw, newStatus);

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: newStatus },
      select: { orderNumber: true, status: true, paymentStatus: true, updatedAt: true },
    });

    // Version 7, Milestone 172B.5: a referred order that becomes
    // CANCELLED (reachable today) or REFUNDED (not currently reachable
    // by any code in this backend — see reverseCommissionsForOrder()'s
    // own comment) automatically reverses its commission, if any. A
    // no-op for every non-referred order (the vast majority) and for an
    // order whose commission is already PAID (that's a clawback case,
    // deliberately left for explicit admin action instead).
    if (newStatus === OrderStatus.CANCELLED || newStatus === OrderStatus.REFUNDED) {
      await reverseCommissionsForOrder(tx, order.id, order.orderNumber, `Order ${newStatus.toLowerCase()}.`);
    }

    const historyRow = await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        orderNumberSnapshot: order.orderNumber,
        changedByAdminUserId: admin.id,
        changedByAdminEmailSnapshot: admin.email,
        changedByAdminNameSnapshot: admin.name,
        oldStatus: order.status,
        newStatus,
        note,
        source: OrderStatusHistorySource.ADMIN_DASHBOARD,
      },
    });

    return {
      historyRowId: historyRow.id,
      result: {
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.paymentStatus,
        updatedAt: updatedOrder.updatedAt,
        latestStatusHistory: {
          oldStatus: historyRow.oldStatus,
          newStatus: historyRow.newStatus,
          note: historyRow.note,
          source: historyRow.source,
          createdAt: historyRow.createdAt,
          changedByAdminName: historyRow.changedByAdminNameSnapshot,
          changedByAdminEmail: historyRow.changedByAdminEmailSnapshot,
        },
      },
    };
  });

  // Version 7, Milestone 174B: strictly after the transaction above has
  // committed — see notifyOrderStatusChange()'s own comment. Never
  // awaited-into-failure: a notification problem must not turn a
  // genuinely successful status change into an error response.
  void notifyOrderStatusChange(orderNumber, result.result.status, result.historyRowId, result.result.latestStatusHistory.createdAt).catch((error) => {
    console.warn(`[notifications] failed to notify order status change for ${orderNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
  });

  return result.result;
}

export interface OrderStatusHistoryEntry {
  oldStatus: OrderStatus;
  newStatus: OrderStatus;
  note: string | null;
  source: OrderStatusHistorySource;
  createdAt: Date;
  changedByAdminName: string | null;
  changedByAdminEmail: string | null;
}

// Version 7, Milestone 64: read-only audit timeline for the admin
// order detail page. Deliberately its own function/route
// (GET /api/admin/orders/:orderNumber/status-history), never added to
// order.service.ts's getOrderByNumber() — that function is shared with
// the public, unauthenticated, order-number-gated customer-facing
// lookup (order.controller.ts), and admin-only audit data (who changed
// what, an admin's name/email) must never reach that shared response.
// `select` here is the enforcement: no passwordHash, tokenHash,
// payment secret, or raw payment payload is ever selectable from this
// query — only the fields this feature actually needs.
export async function getOrderStatusHistory(orderNumber: string): Promise<OrderStatusHistoryEntry[] | null> {
  const order = await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });
  if (!order) {
    return null;
  }

  const rows = await prisma.orderStatusHistory.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: {
      oldStatus: true,
      newStatus: true,
      note: true,
      source: true,
      createdAt: true,
      changedByAdminNameSnapshot: true,
      changedByAdminEmailSnapshot: true,
    },
  });

  return rows.map((row) => ({
    oldStatus: row.oldStatus,
    newStatus: row.newStatus,
    note: row.note,
    source: row.source,
    createdAt: row.createdAt,
    changedByAdminName: row.changedByAdminNameSnapshot,
    changedByAdminEmail: row.changedByAdminEmailSnapshot,
  }));
}
