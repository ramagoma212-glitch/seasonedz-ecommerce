// Version 7, Milestone 172B.3: read-only admin foundation for
// OrderAffiliateCommission. Milestone 172B.4 added the actual creation
// — that write lives entirely inside order.service.ts's own
// createOrder() transaction, never here.
//
// Version 7, Milestone 172B.5: the real lifecycle — PENDING -> APPROVED
// -> PAID, and REVERSED for a cancelled/refunded order or an explicit
// admin clawback. See commissionEligibility.service.ts for the pure
// eligibility rules this file calls but does not itself decide. No
// database migration: every field this milestone needs (approvedAt,
// paidAt, reversedAt, reversalReason, the four-value status enum) was
// already added in 172B.3.
//
// "Who approved/paid/reversed this" is NOT stored in a queryable
// database column — OrderAffiliateCommission has no admin-attribution
// field, and adding one was judged not worth a migration for this
// milestone (see this milestone's own final report). Every lifecycle
// action instead writes one structured, narrow console.log line (admin
// id/email, action, commission id, before/after status, timestamp) —
// the same "safe, narrow logging" discipline payfast.service.ts's own
// logPayfastVerificationEvent() already established — so a genuine
// forensic trail exists in Render's own log retention even though it
// isn't queryable from the admin UI today.

import { Prisma, OrderStatus, PaymentStatus, ProductType, OrderAffiliateCommissionStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { getReferralProgrammeSettings } from "./referralProgrammeSettings.service.js";
import { computeApprovalEligibility, ELIGIBILITY_REASON_LABELS, type EligibilityReason, type FulfilmentBasis } from "./commissionEligibility.service.js";
import type { SafeAdminProfile } from "./adminAuth.service.js";

export class CommissionLifecycleError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CommissionLifecycleError";
    this.statusCode = statusCode;
  }
}

// Narrow, structured, secret-free — see this file's own header comment
// on why this exists at all (no admin-attribution database column).
function logCommissionLifecycleEvent(params: {
  action: "APPROVE" | "REVERSE" | "PAY" | "AUTO_REVERSE";
  commissionId: string;
  orderNumber?: string;
  fromStatus: OrderAffiliateCommissionStatus;
  toStatus: OrderAffiliateCommissionStatus;
  adminId?: string;
  adminEmail?: string;
  reason?: string;
}): void {
  // eslint-disable-next-line no-console
  console.log(
    `[commission-lifecycle] action=${params.action} commissionId=${params.commissionId}` +
      (params.orderNumber ? ` order=${params.orderNumber}` : "") +
      ` from=${params.fromStatus} to=${params.toStatus}` +
      (params.adminId ? ` adminId=${params.adminId} adminEmail=${params.adminEmail}` : " (system)") +
      (params.reason ? ` reason=${JSON.stringify(params.reason)}` : "") +
      ` at=${new Date().toISOString()}`
  );
}

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

// ---------------------------------------------------------------------------
// Shared order-context loading — the fields eligibility computation and
// the admin list/detail views both need, kept in one place so they can
// never quietly diverge (list/detail must show the exact same
// eligibility a real approve attempt would enforce).
// ---------------------------------------------------------------------------

const commissionWithOrderInclude = {
  order: {
    select: {
      orderNumber: true,
      createdAt: true,
      status: true,
      customerEmail: true,
      customerFirstName: true,
      customerLastName: true,
      payment: { select: { status: true, paidAt: true } },
      items: { select: { productType: true } },
    },
  },
} satisfies Prisma.OrderAffiliateCommissionInclude;

type CommissionWithOrder = Prisma.OrderAffiliateCommissionGetPayload<{ include: typeof commissionWithOrderInclude }>;

function deriveIsDigitalOnly(items: { productType: ProductType }[]): boolean {
  return items.length > 0 && items.every((item) => item.productType === ProductType.DIGITAL);
}

// Batched (not N+1): one query for however many orderIds are in play,
// grouped down to the single most-recent DELIVERED transition per order
// in JS. OrderStatusHistory.createdAt is append-only and never touched
// by anything else — see commissionEligibility.service.ts's own header
// comment for why this is the safest available "genuinely delivered"
// signal in this schema today.
async function loadDeliveredAtByOrderId(orderIds: string[], client: Prisma.TransactionClient | typeof prisma = prisma): Promise<Map<string, Date>> {
  if (orderIds.length === 0) return new Map();

  const rows = await client.orderStatusHistory.findMany({
    where: { orderId: { in: orderIds }, newStatus: OrderStatus.DELIVERED },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, createdAt: true },
  });

  const map = new Map<string, Date>();
  for (const row of rows) {
    // rows are already ordered desc by createdAt, so the FIRST time we
    // see a given orderId is its most recent DELIVERED transition.
    if (!map.has(row.orderId)) map.set(row.orderId, row.createdAt);
  }
  return map;
}

export interface EligibilityOutput {
  eligible: boolean;
  reason: EligibilityReason | null;
  reasonLabel: string | null;
  eligibleForApprovalAt: Date | null;
  fulfilmentBasis: FulfilmentBasis | null;
}

export interface OrderAffiliateCommissionAdminOutput extends OrderAffiliateCommissionOutput {
  order: {
    orderNumber: string;
    createdAt: Date;
    status: OrderStatus;
    customerEmail: string;
    customerName: string;
  };
  eligibility: EligibilityOutput;
  // True when this commission is already PAID but its order has since
  // become CANCELLED/REFUNDED — a clawback case the automatic reversal
  // hook deliberately never resolves by itself (see
  // reverseCommissionsForOrder()'s own comment). Computed at read time,
  // never stored — no schema field exists or is needed for this.
  paidButOrderNowNonPayable: boolean;
}

async function toAdminOutput(
  row: CommissionWithOrder,
  commissionValidationDays: number,
  deliveredAt: Date | null,
  now: Date = new Date()
): Promise<OrderAffiliateCommissionAdminOutput> {
  const base = toOutput(row);
  const isDigitalOnly = deriveIsDigitalOnly(row.order.items);

  const eligibility = computeApprovalEligibility({
    commissionStatus: row.status,
    commissionAmount: row.commissionAmount,
    orderStatus: row.order.status,
    paymentStatus: row.order.payment?.status ?? PaymentStatus.PENDING,
    isDigitalOnly,
    paymentPaidAt: row.order.payment?.paidAt ?? null,
    deliveredStatusHistoryAt: deliveredAt,
    commissionValidationDays,
    now,
  });

  const orderIsNonPayable = row.order.status === OrderStatus.CANCELLED || row.order.status === OrderStatus.REFUNDED;

  return {
    ...base,
    order: {
      orderNumber: row.order.orderNumber,
      createdAt: row.order.createdAt,
      status: row.order.status,
      customerEmail: row.order.customerEmail,
      customerName: `${row.order.customerFirstName} ${row.order.customerLastName}`.trim(),
    },
    eligibility: {
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      reasonLabel: eligibility.reason ? ELIGIBILITY_REASON_LABELS[eligibility.reason] : null,
      eligibleForApprovalAt: eligibility.eligibleForApprovalAt,
      fulfilmentBasis: eligibility.fulfilmentBasis,
    },
    paidButOrderNowNonPayable: row.status === OrderAffiliateCommissionStatus.PAID && orderIsNonPayable,
  };
}

// ---------------------------------------------------------------------------
// List / detail (admin).
// ---------------------------------------------------------------------------

export interface OrderAffiliateCommissionListFilters {
  page: number;
  limit: number;
  status?: OrderAffiliateCommissionStatus;
  // Not a real database column — computed per-row via
  // computeApprovalEligibility() the exact same way a real approve
  // attempt would. Only ever combined with status=PENDING in practice
  // (nothing else can ever be "eligible for approval"); enforced here,
  // not left to the caller to remember.
  eligibleOnly?: boolean;
  affiliateId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface OrderAffiliateCommissionListResult {
  commissions: OrderAffiliateCommissionAdminOutput[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildWhere(filters: OrderAffiliateCommissionListFilters): Prisma.OrderAffiliateCommissionWhereInput {
  const and: Prisma.OrderAffiliateCommissionWhereInput[] = [];
  if (filters.status) and.push({ status: filters.status });
  if (filters.eligibleOnly) and.push({ status: OrderAffiliateCommissionStatus.PENDING });
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

// A sane safety cap for the in-memory eligibility pass below — V1's
// referral volume is small (this is a young programme), so computing
// eligibility for up to this many PENDING rows in application code is
// far simpler and perfectly adequate, never "over-engineered
// analytics" (§12 of the brief), and avoids inventing a computed SQL
// column purely to support one filter option.
const ELIGIBILITY_SCAN_CAP = 500;

export async function listOrderAffiliateCommissions(filters: OrderAffiliateCommissionListFilters): Promise<OrderAffiliateCommissionListResult> {
  const settings = await getReferralProgrammeSettings();

  if (filters.eligibleOnly) {
    // Eligibility can't be expressed as a WHERE clause (it depends on
    // Payment/OrderStatusHistory state, computed in application code —
    // see commissionEligibility.service.ts), so this path scans PENDING
    // rows, computes eligibility for each, then paginates the filtered
    // result in memory rather than in SQL.
    const where = buildWhere({ ...filters, eligibleOnly: false, status: OrderAffiliateCommissionStatus.PENDING });
    const candidates = await prisma.orderAffiliateCommission.findMany({
      where,
      include: commissionWithOrderInclude,
      orderBy: { createdAt: "desc" },
      take: ELIGIBILITY_SCAN_CAP,
    });

    const deliveredAtByOrderId = await loadDeliveredAtByOrderId(candidates.map((row) => row.orderId));
    const enriched = await Promise.all(
      candidates.map((row) => toAdminOutput(row, settings.commissionValidationDays, deliveredAtByOrderId.get(row.orderId) ?? null))
    );
    const eligible = enriched.filter((row) => row.eligibility.eligible);

    const total = eligible.length;
    const start = (filters.page - 1) * filters.limit;
    const pageRows = eligible.slice(start, start + filters.limit);

    return { commissions: pageRows, total, page: filters.page, limit: filters.limit, totalPages: Math.max(1, Math.ceil(total / filters.limit)) };
  }

  const where = buildWhere(filters);
  const [total, commissions] = await Promise.all([
    prisma.orderAffiliateCommission.count({ where }),
    prisma.orderAffiliateCommission.findMany({
      where,
      include: commissionWithOrderInclude,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  const deliveredAtByOrderId = await loadDeliveredAtByOrderId(commissions.map((row) => row.orderId));
  const output = await Promise.all(commissions.map((row) => toAdminOutput(row, settings.commissionValidationDays, deliveredAtByOrderId.get(row.orderId) ?? null)));

  return { commissions: output, total, page: filters.page, limit: filters.limit, totalPages: Math.max(1, Math.ceil(total / filters.limit)) };
}

export async function getOrderAffiliateCommissionDetail(id: string): Promise<OrderAffiliateCommissionAdminOutput | null> {
  const row = await prisma.orderAffiliateCommission.findUnique({ where: { id }, include: commissionWithOrderInclude });
  if (!row) return null;

  const settings = await getReferralProgrammeSettings();
  const deliveredAtByOrderId = await loadDeliveredAtByOrderId([row.orderId]);
  return toAdminOutput(row, settings.commissionValidationDays, deliveredAtByOrderId.get(row.orderId) ?? null);
}

// ---------------------------------------------------------------------------
// Approve: PENDING -> APPROVED. Every eligibility rule is re-checked
// server-side at the moment of approval, never trusted from whatever
// the list/detail view showed a moment earlier (§26 of the brief).
// ---------------------------------------------------------------------------

export async function approveCommission(id: string, admin: SafeAdminProfile): Promise<OrderAffiliateCommissionOutput> {
  const settings = await getReferralProgrammeSettings();

  return prisma.$transaction(async (tx) => {
    const row = await tx.orderAffiliateCommission.findUnique({ where: { id }, include: commissionWithOrderInclude });
    if (!row) throw new CommissionLifecycleError(`Commission not found: ${id}`, 404);

    const deliveredAtMap = await loadDeliveredAtByOrderId([row.orderId], tx);
    const isDigitalOnly = deriveIsDigitalOnly(row.order.items);

    const eligibility = computeApprovalEligibility({
      commissionStatus: row.status,
      commissionAmount: row.commissionAmount,
      orderStatus: row.order.status,
      paymentStatus: row.order.payment?.status ?? PaymentStatus.PENDING,
      isDigitalOnly,
      paymentPaidAt: row.order.payment?.paidAt ?? null,
      deliveredStatusHistoryAt: deliveredAtMap.get(row.orderId) ?? null,
      commissionValidationDays: settings.commissionValidationDays,
    });

    if (!eligibility.eligible) {
      throw new CommissionLifecycleError(`Cannot approve this commission: ${ELIGIBILITY_REASON_LABELS[eligibility.reason!]}`, 409);
    }

    const updated = await tx.orderAffiliateCommission.update({
      where: { id },
      data: { status: OrderAffiliateCommissionStatus.APPROVED, approvedAt: new Date() },
    });

    logCommissionLifecycleEvent({
      action: "APPROVE",
      commissionId: id,
      orderNumber: row.order.orderNumber,
      fromStatus: OrderAffiliateCommissionStatus.PENDING,
      toStatus: OrderAffiliateCommissionStatus.APPROVED,
      adminId: admin.id,
      adminEmail: admin.email,
    });

    return toOutput(updated);
  });
}

// ---------------------------------------------------------------------------
// Reverse (manual, admin-triggered): PENDING|APPROVED -> REVERSED, or
// the explicit PAID -> REVERSED clawback (requires a second, distinct
// confirmation flag on top of the reason — §3/§10 of the brief: "must
// NOT happen silently").
// ---------------------------------------------------------------------------

const MIN_REVERSAL_REASON_LENGTH = 3;
const MAX_REVERSAL_REASON_LENGTH = 500;

function parseReversalReason(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length < MIN_REVERSAL_REASON_LENGTH) {
    throw new CommissionLifecycleError(`A reversal reason of at least ${MIN_REVERSAL_REASON_LENGTH} characters is required.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_REVERSAL_REASON_LENGTH) {
    throw new CommissionLifecycleError(`Reversal reason must be ${MAX_REVERSAL_REASON_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

export async function reverseCommission(id: string, rawReason: unknown, confirmClawback: boolean, admin: SafeAdminProfile): Promise<OrderAffiliateCommissionOutput> {
  const reason = parseReversalReason(rawReason);

  return prisma.$transaction(async (tx) => {
    const row = await tx.orderAffiliateCommission.findUnique({ where: { id }, select: { id: true, status: true, orderId: true, order: { select: { orderNumber: true } } } });
    if (!row) throw new CommissionLifecycleError(`Commission not found: ${id}`, 404);

    if (row.status === OrderAffiliateCommissionStatus.REVERSED) {
      throw new CommissionLifecycleError("This commission has already been reversed.", 409);
    }

    // PAID -> REVERSED is a clawback: real money has already left the
    // building. A reason alone is not enough — the admin must also
    // explicitly confirm they understand this is a clawback, never
    // inferred from just clicking a generic "reverse" button.
    if (row.status === OrderAffiliateCommissionStatus.PAID && !confirmClawback) {
      throw new CommissionLifecycleError(
        "This commission has already been paid. Reversing it is a clawback — the affiliate was already sent this money outside the system. Set confirmClawback to proceed.",
        409
      );
    }

    const finalReason = row.status === OrderAffiliateCommissionStatus.PAID ? `[CLAWBACK — already paid] ${reason}` : reason;

    const updated = await tx.orderAffiliateCommission.update({
      where: { id },
      data: { status: OrderAffiliateCommissionStatus.REVERSED, reversedAt: new Date(), reversalReason: finalReason },
    });

    logCommissionLifecycleEvent({
      action: "REVERSE",
      commissionId: id,
      orderNumber: row.order.orderNumber,
      fromStatus: row.status,
      toStatus: OrderAffiliateCommissionStatus.REVERSED,
      adminId: admin.id,
      adminEmail: admin.email,
      reason: finalReason,
    });

    return toOutput(updated);
  });
}

// ---------------------------------------------------------------------------
// Automatic reversal — called from adminOrderStatus.service.ts's own
// updateOrderStatus() transaction the moment an order's status
// genuinely becomes CANCELLED (reachable today) or REFUNDED (not
// currently reachable by any code in this backend — REFUNDED has no
// "from" transitions in ALLOWED_TRANSITIONS, so this branch is
// correct-but-dormant until a future refund feature exists, exactly
// the same "build the safe foundation now, wire the trigger later"
// pattern this whole referral programme has followed since 172B.3).
//
// Deliberately NEVER touches an already-PAID commission automatically
// — §3 of the brief: a paid-then-reversed clawback "must NOT happen
// silently" and "should require explicit admin action". If the order
// being cancelled/refunded already has a PAID commission, this
// function leaves it untouched and logs a loud warning instead; the
// admin commission list/detail already surfaces this case via the
// read-time-computed paidButOrderNowNonPayable flag (toAdminOutput()
// above), directing them to the explicit reverseCommission() clawback
// action themselves.
export async function reverseCommissionsForOrder(tx: Prisma.TransactionClient, orderId: string, orderNumber: string, reason: string): Promise<void> {
  const commission = await tx.orderAffiliateCommission.findUnique({ where: { orderId }, select: { id: true, status: true } });
  if (!commission) return; // not a referred order — nothing to do.

  if (commission.status === OrderAffiliateCommissionStatus.REVERSED) return; // idempotent.

  if (commission.status === OrderAffiliateCommissionStatus.PAID) {
    // eslint-disable-next-line no-console
    console.warn(
      `[commission-lifecycle] CLAWBACK REQUIRED: order=${orderNumber} commissionId=${commission.id} is already PAID but the order just became non-payable (${reason}). ` +
        "Automatic reversal deliberately skipped — an admin must review and explicitly reverse this commission."
    );
    return;
  }

  await tx.orderAffiliateCommission.update({
    where: { id: commission.id },
    data: { status: OrderAffiliateCommissionStatus.REVERSED, reversedAt: new Date(), reversalReason: reason },
  });

  logCommissionLifecycleEvent({
    action: "AUTO_REVERSE",
    commissionId: commission.id,
    orderNumber,
    fromStatus: commission.status,
    toStatus: OrderAffiliateCommissionStatus.REVERSED,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Payout: no AffiliatePayout table (172B.2 deferred it, and V1's volume
// doesn't need one — see this milestone's own final report). A "payout"
// is simply: group APPROVED, unpaid commissions by affiliate; once an
// affiliate's total clears AffiliateProgrammeSettings.minimumPayoutAmount,
// an admin who has ALREADY paid them for real, off-platform, may mark
// the selected commissions PAID atomically. Every individual commission
// keeps its own permanent paidAt — that IS the audit trail, with no
// second table needed.
// ---------------------------------------------------------------------------

export interface AffiliatePayoutGroup {
  affiliateId: string;
  affiliateName: string;
  affiliateReferralCode: string;
  approvedUnpaidBalance: number;
  commissionCount: number;
  commissionIds: string[];
  isPayoutEligible: boolean;
}

export interface PayoutOverview {
  minimumPayoutAmount: number;
  payoutDayOfMonth: number;
  payoutFrequency: "monthly";
  groups: AffiliatePayoutGroup[];
}

export async function getPayoutOverview(): Promise<PayoutOverview> {
  const settings = await getReferralProgrammeSettings();

  const approvedCommissions = await prisma.orderAffiliateCommission.findMany({
    where: { status: OrderAffiliateCommissionStatus.APPROVED },
    select: { id: true, affiliateId: true, affiliateNameSnapshot: true, affiliateReferralCodeSnapshot: true, commissionAmount: true },
    orderBy: { createdAt: "asc" },
  });

  const groupsByAffiliate = new Map<string, AffiliatePayoutGroup & { balanceDecimal: Prisma.Decimal }>();
  for (const commission of approvedCommissions) {
    const existing = groupsByAffiliate.get(commission.affiliateId);
    if (existing) {
      existing.balanceDecimal = existing.balanceDecimal.plus(commission.commissionAmount);
      existing.commissionCount += 1;
      existing.commissionIds.push(commission.id);
    } else {
      groupsByAffiliate.set(commission.affiliateId, {
        affiliateId: commission.affiliateId,
        affiliateName: commission.affiliateNameSnapshot,
        affiliateReferralCode: commission.affiliateReferralCodeSnapshot,
        approvedUnpaidBalance: 0,
        commissionCount: 1,
        commissionIds: [commission.id],
        isPayoutEligible: false,
        balanceDecimal: new Prisma.Decimal(commission.commissionAmount),
      });
    }
  }

  const minimumPayoutAmount = new Prisma.Decimal(settings.minimumPayoutAmount);
  const groups: AffiliatePayoutGroup[] = Array.from(groupsByAffiliate.values()).map((group) => ({
    affiliateId: group.affiliateId,
    affiliateName: group.affiliateName,
    affiliateReferralCode: group.affiliateReferralCode,
    approvedUnpaidBalance: group.balanceDecimal.toNumber(),
    commissionCount: group.commissionCount,
    commissionIds: group.commissionIds,
    isPayoutEligible: group.balanceDecimal.gte(minimumPayoutAmount),
  }));

  return {
    minimumPayoutAmount: settings.minimumPayoutAmount,
    payoutDayOfMonth: settings.payoutDayOfMonth,
    payoutFrequency: "monthly",
    groups: groups.sort((a, b) => b.approvedUnpaidBalance - a.approvedUnpaidBalance),
  };
}

export interface PayAffiliateCommissionsResult {
  affiliateId: string;
  paidCommissionIds: string[];
  totalPaid: number;
  paidAt: Date;
}

// Marks the given commissions (or, if omitted, every currently-APPROVED
// commission for this affiliate) PAID, atomically. Concurrency safety
// (§27 of the brief): the update is a single conditional updateMany
// scoped to status=APPROVED — if a concurrent request already moved one
// of these rows out of APPROVED (paid or reversed) between this
// function's read and its write, the affected count comes back short
// and the whole transaction is rolled back rather than silently paying
// a subset twice or paying a row that changed underneath it.
export async function payAffiliateCommissions(affiliateId: string, requestedCommissionIds: string[] | undefined, admin: SafeAdminProfile): Promise<PayAffiliateCommissionsResult> {
  const settings = await getReferralProgrammeSettings();
  const minimumPayoutAmount = new Prisma.Decimal(settings.minimumPayoutAmount);

  return prisma.$transaction(async (tx) => {
    const affiliate = await tx.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } });
    if (!affiliate) throw new CommissionLifecycleError(`Affiliate not found: ${affiliateId}`, 404);

    const allApproved = await tx.orderAffiliateCommission.findMany({
      where: { affiliateId, status: OrderAffiliateCommissionStatus.APPROVED },
      select: { id: true, commissionAmount: true, order: { select: { orderNumber: true } } },
    });

    if (allApproved.length === 0) {
      throw new CommissionLifecycleError("This affiliate has no approved, unpaid commissions.", 409);
    }

    // Eligibility gate (§15/§17): the affiliate's FULL approved-unpaid
    // balance must clear the minimum threshold before ANY payout action
    // is allowed — regardless of which specific commissions end up
    // selected for THIS payout run.
    const fullBalance = allApproved.reduce((sum, row) => sum.plus(row.commissionAmount), new Prisma.Decimal(0));
    if (fullBalance.lt(minimumPayoutAmount)) {
      throw new CommissionLifecycleError(
        `This affiliate's approved unpaid balance (R${fullBalance.toFixed(2)}) has not reached the minimum payout threshold (R${minimumPayoutAmount.toFixed(2)}) — carrying forward.`,
        409
      );
    }

    const targetIds = requestedCommissionIds && requestedCommissionIds.length > 0 ? requestedCommissionIds : allApproved.map((row) => row.id);

    const targetRows = allApproved.filter((row) => targetIds.includes(row.id));
    if (targetRows.length !== targetIds.length) {
      throw new CommissionLifecycleError("One or more selected commissions are not currently APPROVED for this affiliate.", 409);
    }

    const paidAt = new Date();
    const result = await tx.orderAffiliateCommission.updateMany({
      where: { id: { in: targetIds }, affiliateId, status: OrderAffiliateCommissionStatus.APPROVED },
      data: { status: OrderAffiliateCommissionStatus.PAID, paidAt },
    });

    if (result.count !== targetIds.length) {
      // A concurrent request changed one of these rows between the read
      // above and this write — abort the whole transaction rather than
      // risk a partial/duplicate payout.
      throw new CommissionLifecycleError("Some selected commissions changed status during this request — please refresh and try again.", 409);
    }

    const totalPaid = targetRows.reduce((sum, row) => sum.plus(row.commissionAmount), new Prisma.Decimal(0));

    for (const row of targetRows) {
      logCommissionLifecycleEvent({
        action: "PAY",
        commissionId: row.id,
        orderNumber: row.order.orderNumber,
        fromStatus: OrderAffiliateCommissionStatus.APPROVED,
        toStatus: OrderAffiliateCommissionStatus.PAID,
        adminId: admin.id,
        adminEmail: admin.email,
      });
    }

    return { affiliateId, paidCommissionIds: targetIds, totalPaid: totalPaid.toNumber(), paidAt };
  });
}

// ---------------------------------------------------------------------------
// Overview stats (admin Referrals overview page) and per-affiliate
// totals (admin affiliate detail page). Both real aggregates, never
// fabricated figures.
// ---------------------------------------------------------------------------

export interface CommissionOverviewStats {
  pendingCount: number;
  pendingValue: number;
  approvedUnpaidValue: number;
  approvedUnpaidCount: number;
  paidValue: number;
  paidCount: number;
  reversedValue: number;
  reversedCount: number;
  payoutEligibleAffiliateCount: number;
}

export async function getCommissionOverviewStats(): Promise<CommissionOverviewStats> {
  const [grouped, payoutOverview] = await Promise.all([
    prisma.orderAffiliateCommission.groupBy({ by: ["status"], _sum: { commissionAmount: true }, _count: { _all: true } }),
    getPayoutOverview(),
  ]);

  const byStatus: Record<OrderAffiliateCommissionStatus, { sum: number; count: number }> = {
    PENDING: { sum: 0, count: 0 },
    APPROVED: { sum: 0, count: 0 },
    PAID: { sum: 0, count: 0 },
    REVERSED: { sum: 0, count: 0 },
  };
  for (const row of grouped) {
    byStatus[row.status] = { sum: row._sum.commissionAmount?.toNumber() ?? 0, count: row._count._all };
  }

  return {
    pendingCount: byStatus.PENDING.count,
    pendingValue: byStatus.PENDING.sum,
    approvedUnpaidCount: byStatus.APPROVED.count,
    approvedUnpaidValue: byStatus.APPROVED.sum,
    paidCount: byStatus.PAID.count,
    paidValue: byStatus.PAID.sum,
    reversedCount: byStatus.REVERSED.count,
    reversedValue: byStatus.REVERSED.sum,
    payoutEligibleAffiliateCount: payoutOverview.groups.filter((group) => group.isPayoutEligible).length,
  };
}

export interface AffiliateCommissionTotals {
  pendingTotal: number;
  approvedUnpaidTotal: number;
  paidLifetimeTotal: number;
  reversedTotal: number;
  isPayoutEligible: boolean;
  minimumPayoutAmount: number;
}

export async function getAffiliateCommissionTotals(affiliateId: string): Promise<AffiliateCommissionTotals> {
  const [grouped, settings] = await Promise.all([
    prisma.orderAffiliateCommission.groupBy({ by: ["status"], where: { affiliateId }, _sum: { commissionAmount: true } }),
    getReferralProgrammeSettings(),
  ]);

  const totals: Record<OrderAffiliateCommissionStatus, number> = { PENDING: 0, APPROVED: 0, PAID: 0, REVERSED: 0 };
  for (const row of grouped) {
    totals[row.status] = row._sum.commissionAmount?.toNumber() ?? 0;
  }

  return {
    pendingTotal: totals.PENDING,
    approvedUnpaidTotal: totals.APPROVED,
    paidLifetimeTotal: totals.PAID,
    reversedTotal: totals.REVERSED,
    isPayoutEligible: totals.APPROVED >= settings.minimumPayoutAmount,
    minimumPayoutAmount: settings.minimumPayoutAmount,
  };
}

// ---------------------------------------------------------------------------
// Order-detail augmentation (unchanged from 172B.4, now also surfaces
// eligibility/clawback context so the admin order page can link to the
// commission detail intelligently).
// ---------------------------------------------------------------------------

export interface AdminOrderReferralFields {
  commissionId: string;
  affiliateId: string;
  affiliateNameSnapshot: string;
  affiliateReferralCodeSnapshot: string;
  discountAmount: number;
  commissionAmount: number;
  commissionStatus: OrderAffiliateCommissionStatus;
}

export async function getReferralCommissionFieldsForOrder(orderNumber: string): Promise<AdminOrderReferralFields | null> {
  const commission = await prisma.orderAffiliateCommission.findFirst({
    where: { order: { orderNumber } },
    select: {
      id: true,
      affiliateId: true,
      affiliateNameSnapshot: true,
      affiliateReferralCodeSnapshot: true,
      discountAmount: true,
      commissionAmount: true,
      status: true,
    },
  });
  if (!commission) return null;

  return {
    commissionId: commission.id,
    affiliateId: commission.affiliateId,
    affiliateNameSnapshot: commission.affiliateNameSnapshot,
    affiliateReferralCodeSnapshot: commission.affiliateReferralCodeSnapshot,
    discountAmount: commission.discountAmount.toNumber(),
    commissionAmount: commission.commissionAmount.toNumber(),
    commissionStatus: commission.status,
  };
}
