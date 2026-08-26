// Version 7, Milestone 172B.3: read-only admin foundation for
// OrderAffiliateCommission. Milestone 172B.4 added the actual creation
// — but that write lives entirely inside order.service.ts's own
// createOrder() transaction (it must happen atomically alongside the
// order it belongs to, using that transaction's own `tx` client), never
// here. This file stays read-only: list/detail queries for the admin
// Commissions view, plus (as of 172B.4) the small per-order lookup
// below for the admin order detail page. Lifecycle transitions
// (approve/pay/reverse) are still 172B.5.

import { Prisma, OrderAffiliateCommissionStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface OrderAffiliateCommissionOutput {
  id: string;
  orderId: string;
  affiliateId: string;
  affiliateNameSnapshot: string;
  affiliateReferralCodeSnapshot: string;
  qualifyingProductSubtotal: number;
  discountRateApplied: number;
  discountAmount: number;
  netQualifyingAmount: number;
  commissionRateApplied: number;
  commissionAmount: number;
  status: OrderAffiliateCommissionStatus;
  approvedAt: Date | null;
  paidAt: Date | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type CommissionRow = Prisma.OrderAffiliateCommissionGetPayload<Record<string, never>>;

function toOutput(row: CommissionRow): OrderAffiliateCommissionOutput {
  return {
    id: row.id,
    orderId: row.orderId,
    affiliateId: row.affiliateId,
    affiliateNameSnapshot: row.affiliateNameSnapshot,
    affiliateReferralCodeSnapshot: row.affiliateReferralCodeSnapshot,
    qualifyingProductSubtotal: row.qualifyingProductSubtotal.toNumber(),
    discountRateApplied: row.discountRateApplied.toNumber(),
    discountAmount: row.discountAmount.toNumber(),
    netQualifyingAmount: row.netQualifyingAmount.toNumber(),
    commissionRateApplied: row.commissionRateApplied.toNumber(),
    commissionAmount: row.commissionAmount.toNumber(),
    status: row.status,
    approvedAt: row.approvedAt,
    paidAt: row.paidAt,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface OrderAffiliateCommissionListFilters {
  page: number;
  limit: number;
  status?: OrderAffiliateCommissionStatus;
  affiliateId?: string;
  // Inclusive date range, matched against createdAt — conceptual
  // filtering only (§23: "prepare filtering conceptually... but do not
  // build advanced reporting unnecessarily"), no dedicated reporting
  // UI is built in this milestone.
  fromDate?: Date;
  toDate?: Date;
}

export interface OrderAffiliateCommissionListResult {
  commissions: OrderAffiliateCommissionOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildWhere(filters: OrderAffiliateCommissionListFilters): Prisma.OrderAffiliateCommissionWhereInput {
  const and: Prisma.OrderAffiliateCommissionWhereInput[] = [];
  if (filters.status) and.push({ status: filters.status });
  if (filters.affiliateId) and.push({ affiliateId: filters.affiliateId });
  if (filters.fromDate || filters.toDate) {
    and.push({
      createdAt: {
        ...(filters.fromDate ? { gte: filters.fromDate } : {}),
        ...(filters.toDate ? { lte: filters.toDate } : {}),
      },
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export async function listOrderAffiliateCommissions(filters: OrderAffiliateCommissionListFilters): Promise<OrderAffiliateCommissionListResult> {
  const where = buildWhere(filters);
  const [total, commissions] = await Promise.all([
    prisma.orderAffiliateCommission.count({ where }),
    prisma.orderAffiliateCommission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    commissions: commissions.map(toOutput),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export interface AdminOrderReferralFields {
  affiliateNameSnapshot: string;
  affiliateReferralCodeSnapshot: string;
  discountAmount: number;
  commissionAmount: number;
  commissionStatus: OrderAffiliateCommissionStatus;
}

// Version 7, Milestone 172B.4: admin-only augmentation for the order
// detail view — mirrors adminDashboard.service.ts's own
// getCourierBookingFieldsForOrder() precedent exactly: a small,
// separately-queried addition merged in by the controller
// (adminDashboard.controller.ts), never added to order.service.ts's
// shared customer-facing toOrderOutput() shape, which must never expose
// which affiliate referred an order or any commission figure to the
// customer (§19 of the brief).
//
// Returns null whenever no commission row exists for this order — which
// is also the honest, correct result for a genuine self-referral
// (discount applied, but createOrder() deliberately creates no
// commission row at all — see order.service.ts's own comment). This is
// a known, deliberate limitation: a self-referred order's discount is
// still visible via the order's own discountTotal, but which affiliate
// caused it has no durable record without a commission row. Adding one
// purely for that case was considered and rejected — see this
// milestone's own final report.
export async function getReferralCommissionFieldsForOrder(orderNumber: string): Promise<AdminOrderReferralFields | null> {
  const commission = await prisma.orderAffiliateCommission.findFirst({
    where: { order: { orderNumber } },
    select: {
      affiliateNameSnapshot: true,
      affiliateReferralCodeSnapshot: true,
      discountAmount: true,
      commissionAmount: true,
      status: true,
    },
  });
  if (!commission) return null;

  return {
    affiliateNameSnapshot: commission.affiliateNameSnapshot,
    affiliateReferralCodeSnapshot: commission.affiliateReferralCodeSnapshot,
    discountAmount: commission.discountAmount.toNumber(),
    commissionAmount: commission.commissionAmount.toNumber(),
    commissionStatus: commission.status,
  };
}
