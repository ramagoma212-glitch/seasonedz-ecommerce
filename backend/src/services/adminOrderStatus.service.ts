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
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
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
export async function updateOrderStatus(
  orderNumber: string,
  newStatusRaw: unknown,
  noteRaw: unknown,
  admin: SafeAdminProfile
): Promise<OrderStatusUpdateResult> {
  return prisma.$transaction(async (tx) => {
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
    };
  });
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
