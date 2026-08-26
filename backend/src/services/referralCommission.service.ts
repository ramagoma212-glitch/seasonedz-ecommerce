// Version 7, Milestone 172B.3: read-only admin foundation for
// OrderAffiliateCommission. No function in this file ever creates,
// updates, or derives a commission — that begins in 172B.4 (atomic
// creation alongside a referred order) and 172B.5 (lifecycle
// transitions: approve/pay/reverse). This table is expected to have
// zero rows in production until then; an empty list here is the
// correct, honest result, never something to paper over with
// fabricated data (§16/§23 of the brief).

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
