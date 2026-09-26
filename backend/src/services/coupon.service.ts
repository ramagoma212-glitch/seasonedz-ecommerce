// Milestone 197: the admin-managed coupon-code system. This is the ONE
// place coupon validation and discount math happen — both the
// non-binding cart/checkout preview (previewCoupon()) and the real,
// binding calculation used at order-creation time (resolveCouponForOrder())
// call the same shared resolve() function below, so the two can never
// quietly disagree about whether a coupon applies or how much it's worth,
// the exact same "one calculation, two callers" discipline
// referralPricing.service.ts already documents for the referral discount.
//
// Stacking policy (Milestone 197, Part 3): at most ONE promotional
// discount ever applies to a given Rand of merchandise. The existing
// preorder discount is resolved first and always wins on whichever lines
// it covers (order.service.ts, unchanged by this milestone) — a coupon is
// only ever calculated against what's LEFT after that, using the exact
// same "eligible subtotal" pattern the referral discount already uses.
// Between a coupon and the referral discount, a coupon (an explicit,
// current-session customer action) takes priority over a referral (a
// passive, earlier-session attribution) — order.service.ts only ever
// evaluates the referral discount when no coupon was successfully
// applied. This is a documented V1 policy choice, not a technical
// limitation — see this milestone's own report for the full reasoning.

import { CouponDiscountType, CouponCustomerEligibility, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { roundHalfUpToCents } from "./referralPricing.service.js";

export class CouponError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CouponError";
    this.statusCode = statusCode;
  }
}

// Case-insensitive by design (Milestone 197, Part 3's own explicit
// requirement) — WELCOME10/welcome10/Welcome10 all resolve to the one
// stored row. Trimmed too, so accidental leading/trailing whitespace from
// copy-pasting a code never causes a false "not found".
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Admin validation (create/update) — never trusts a raw request body for
// anything beyond shape/range checks; every error is a specific, human
// CouponError message, never a generic "Invalid input" (Milestone 197,
// Part 5's own explicit requirement).
// ---------------------------------------------------------------------------

export interface CouponAdminInput {
  code?: unknown;
  description?: unknown;
  isActive?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  minimumOrderSubtotal?: unknown;
  maximumDiscountAmount?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
  maxTotalUses?: unknown;
  maxUsesPerCustomer?: unknown;
  customerEligibility?: unknown;
  productIds?: unknown;
  categoryIds?: unknown;
  excludedProductIds?: unknown;
}

interface ParsedCouponInput {
  code: string;
  description: string | null;
  isActive: boolean;
  discountType: CouponDiscountType;
  discountValue: Prisma.Decimal;
  minimumOrderSubtotal: Prisma.Decimal | null;
  maximumDiscountAmount: Prisma.Decimal | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxTotalUses: number | null;
  maxUsesPerCustomer: number | null;
  customerEligibility: CouponCustomerEligibility;
  productIds: string[];
  categoryIds: string[];
  excludedProductIds: string[];
}

function parseOptionalDecimal(raw: unknown, fieldName: string, requirePositive: boolean): Prisma.Decimal | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) throw new CouponError(`${fieldName} must be a valid number.`);
  if (requirePositive && num <= 0) throw new CouponError(`${fieldName} must be greater than 0.`);
  if (num < 0) throw new CouponError(`${fieldName} cannot be negative.`);
  return new Prisma.Decimal(num);
}

function parseOptionalDate(raw: unknown, fieldName: string): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) throw new CouponError(`${fieldName} is not a valid date.`);
  return date;
}

function parseOptionalPositiveInt(raw: unknown, fieldName: string): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) throw new CouponError(`${fieldName} must be a whole number greater than 0.`);
  return num;
}

function parseStringIdArray(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new CouponError("Expected a list of ids.");
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

// Shared by createCoupon()/updateCoupon() — `existing` supplies fallback
// values for a partial update (only the fields actually present in
// rawInput are validated/overridden), the same "effective merged value"
// discipline adminProduct.service.ts's own updateProduct() already uses
// for preorder/status fields.
function parseCouponInput(rawInput: CouponAdminInput, existing: ParsedCouponInput | null): ParsedCouponInput {
  const has = (key: keyof CouponAdminInput) => Object.prototype.hasOwnProperty.call(rawInput, key);

  let code = existing?.code ?? "";
  if (has("code")) {
    if (typeof rawInput.code !== "string" || rawInput.code.trim().length === 0) {
      throw new CouponError("Coupon code is required.");
    }
    code = normalizeCouponCode(rawInput.code);
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      throw new CouponError("Coupon code must be 3-32 characters, letters/numbers/hyphens/underscores only.");
    }
  } else if (!existing) {
    throw new CouponError("Coupon code is required.");
  }

  const description = has("description") ? (typeof rawInput.description === "string" ? rawInput.description.trim() || null : null) : (existing?.description ?? null);
  const isActive = has("isActive") ? Boolean(rawInput.isActive) : (existing?.isActive ?? true);

  let discountType = existing?.discountType ?? null;
  if (has("discountType")) {
    if (rawInput.discountType !== "PERCENTAGE" && rawInput.discountType !== "FIXED_AMOUNT") {
      throw new CouponError("Discount type must be PERCENTAGE or FIXED_AMOUNT.");
    }
    discountType = rawInput.discountType;
  }
  if (!discountType) throw new CouponError("Discount type is required.");

  let discountValue = existing?.discountValue ?? null;
  if (has("discountValue")) {
    const num = Number(rawInput.discountValue);
    if (!Number.isFinite(num)) throw new CouponError("Discount value must be a valid number.");
    if (discountType === "PERCENTAGE" && (num <= 0 || num > 100)) {
      throw new CouponError("Percentage must be between 1 and 100.");
    }
    if (discountType === "FIXED_AMOUNT" && num <= 0) {
      throw new CouponError("Fixed amount must be greater than 0.");
    }
    discountValue = new Prisma.Decimal(num);
  } else if (existing && has("discountType") && discountType !== existing.discountType) {
    // Changing discount type without also supplying a new value could
    // silently carry over a nonsensical value (e.g. a fixed R250 amount
    // reinterpreted as a 250% discount) — refuse rather than guess.
    throw new CouponError("Discount value is required when changing discount type.");
  }
  if (!discountValue) throw new CouponError("Discount value is required.");

  const minimumOrderSubtotal = has("minimumOrderSubtotal") ? parseOptionalDecimal(rawInput.minimumOrderSubtotal, "Minimum order amount", true) : (existing?.minimumOrderSubtotal ?? null);
  const maximumDiscountAmount = has("maximumDiscountAmount") ? parseOptionalDecimal(rawInput.maximumDiscountAmount, "Maximum discount", true) : (existing?.maximumDiscountAmount ?? null);
  const startsAt = has("startsAt") ? parseOptionalDate(rawInput.startsAt, "Start date") : (existing?.startsAt ?? null);
  const expiresAt = has("expiresAt") ? parseOptionalDate(rawInput.expiresAt, "Expiry date") : (existing?.expiresAt ?? null);
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new CouponError("Expiry date must be after the start date.");
  }

  const maxTotalUses = has("maxTotalUses") ? parseOptionalPositiveInt(rawInput.maxTotalUses, "Maximum total uses") : (existing?.maxTotalUses ?? null);
  const maxUsesPerCustomer = has("maxUsesPerCustomer") ? parseOptionalPositiveInt(rawInput.maxUsesPerCustomer, "Maximum uses per customer") : (existing?.maxUsesPerCustomer ?? null);

  let customerEligibility = existing?.customerEligibility ?? "ALL";
  if (has("customerEligibility")) {
    if (rawInput.customerEligibility !== "ALL" && rawInput.customerEligibility !== "LOGGED_IN_ONLY") {
      throw new CouponError("Customer eligibility must be ALL or LOGGED_IN_ONLY.");
    }
    customerEligibility = rawInput.customerEligibility;
  }

  const productIds = has("productIds") ? parseStringIdArray(rawInput.productIds) : (existing?.productIds ?? []);
  const categoryIds = has("categoryIds") ? parseStringIdArray(rawInput.categoryIds) : (existing?.categoryIds ?? []);
  const excludedProductIds = has("excludedProductIds") ? parseStringIdArray(rawInput.excludedProductIds) : (existing?.excludedProductIds ?? []);

  return {
    code,
    description,
    isActive,
    discountType,
    discountValue,
    minimumOrderSubtotal,
    maximumDiscountAmount,
    startsAt,
    expiresAt,
    maxTotalUses,
    maxUsesPerCustomer,
    customerEligibility,
    productIds,
    categoryIds,
    excludedProductIds,
  };
}

const ADMIN_COUPON_INCLUDE = {
  includedProducts: { include: { product: { select: { id: true, name: true, slug: true } } } },
  includedCategories: { include: { category: { select: { id: true, name: true, slug: true } } } },
  excludedProducts: { include: { product: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.CouponInclude;

export type AdminCouponRow = Prisma.CouponGetPayload<{ include: typeof ADMIN_COUPON_INCLUDE }>;

async function writeCouponRelations(tx: Prisma.TransactionClient, couponId: string, parsed: ParsedCouponInput): Promise<void> {
  await tx.couponProduct.deleteMany({ where: { couponId } });
  await tx.couponCategory.deleteMany({ where: { couponId } });
  await tx.couponExcludedProduct.deleteMany({ where: { couponId } });

  if (parsed.productIds.length > 0) {
    await tx.couponProduct.createMany({ data: parsed.productIds.map((productId) => ({ couponId, productId })), skipDuplicates: true });
  }
  if (parsed.categoryIds.length > 0) {
    await tx.couponCategory.createMany({ data: parsed.categoryIds.map((categoryId) => ({ couponId, categoryId })), skipDuplicates: true });
  }
  if (parsed.excludedProductIds.length > 0) {
    await tx.couponExcludedProduct.createMany({ data: parsed.excludedProductIds.map((productId) => ({ couponId, productId })), skipDuplicates: true });
  }
}

export type AdminCouponListRow = AdminCouponRow & { totalDiscountGranted: number };

// Milestone 197, Part 12: "if straightforward, also expose ... total
// discount granted" — timesRedeemed already gives the admin list its
// usage count, so this only adds the one further number that's a
// genuinely simple aggregate: the real Rand total actually discounted
// across every redemption, read from each CouponRedemption's own
// immutable discountAmountSnapshot (never re-derived from the Coupon's
// current, possibly-since-edited discountValue).
export async function listCouponsForAdmin(): Promise<AdminCouponListRow[]> {
  const [coupons, totals] = await Promise.all([
    prisma.coupon.findMany({ include: ADMIN_COUPON_INCLUDE, orderBy: { createdAt: "desc" } }),
    prisma.couponRedemption.groupBy({ by: ["couponId"], _sum: { discountAmountSnapshot: true } }),
  ]);
  const totalByCouponId = new Map(totals.map((row) => [row.couponId, row._sum.discountAmountSnapshot?.toNumber() ?? 0]));
  return coupons.map((coupon) => ({ ...coupon, totalDiscountGranted: totalByCouponId.get(coupon.id) ?? 0 }));
}

export async function getCouponForAdmin(id: string): Promise<AdminCouponRow | null> {
  return prisma.coupon.findUnique({ where: { id }, include: ADMIN_COUPON_INCLUDE });
}

function toParsedFromRow(row: { code: string; description: string | null; isActive: boolean; discountType: CouponDiscountType; discountValue: Prisma.Decimal; minimumOrderSubtotal: Prisma.Decimal | null; maximumDiscountAmount: Prisma.Decimal | null; startsAt: Date | null; expiresAt: Date | null; maxTotalUses: number | null; maxUsesPerCustomer: number | null; customerEligibility: CouponCustomerEligibility }): ParsedCouponInput {
  return { ...row, productIds: [], categoryIds: [], excludedProductIds: [] };
}

export async function createCoupon(rawInput: CouponAdminInput): Promise<AdminCouponRow> {
  const parsed = parseCouponInput(rawInput, null);

  const created = await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.create({
      data: {
        code: parsed.code,
        description: parsed.description,
        isActive: parsed.isActive,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue,
        minimumOrderSubtotal: parsed.minimumOrderSubtotal,
        maximumDiscountAmount: parsed.maximumDiscountAmount,
        startsAt: parsed.startsAt,
        expiresAt: parsed.expiresAt,
        maxTotalUses: parsed.maxTotalUses,
        maxUsesPerCustomer: parsed.maxUsesPerCustomer,
        customerEligibility: parsed.customerEligibility,
      },
    });
    await writeCouponRelations(tx, coupon.id, parsed);
    return coupon;
  });

  return (await getCouponForAdmin(created.id))!;
}

export async function updateCoupon(id: string, rawInput: CouponAdminInput): Promise<AdminCouponRow> {
  const existingRow = await prisma.coupon.findUnique({ where: { id } });
  if (!existingRow) throw new CouponError(`Coupon not found: ${id}`, 404);

  const existingParsed = toParsedFromRow(existingRow);
  const parsed = parseCouponInput(rawInput, existingParsed);

  await prisma.$transaction(async (tx) => {
    await tx.coupon.update({
      where: { id },
      data: {
        code: parsed.code,
        description: parsed.description,
        isActive: parsed.isActive,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue,
        minimumOrderSubtotal: parsed.minimumOrderSubtotal,
        maximumDiscountAmount: parsed.maximumDiscountAmount,
        startsAt: parsed.startsAt,
        expiresAt: parsed.expiresAt,
        maxTotalUses: parsed.maxTotalUses,
        maxUsesPerCustomer: parsed.maxUsesPerCustomer,
        customerEligibility: parsed.customerEligibility,
      },
    });
    if (rawInput.productIds !== undefined || rawInput.categoryIds !== undefined || rawInput.excludedProductIds !== undefined) {
      await writeCouponRelations(tx, id, parsed);
    }
  });

  return (await getCouponForAdmin(id))!;
}

export async function setCouponActive(id: string, isActive: boolean): Promise<AdminCouponRow> {
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new CouponError(`Coupon not found: ${id}`, 404);
  await prisma.coupon.update({ where: { id }, data: { isActive } });
  return (await getCouponForAdmin(id))!;
}

// Deletion is only ever allowed for a coupon with zero redemption
// history (Milestone 197, Part 4's own explicit "prefer deactivation
// over destructive deletion when records exist" rule) — deactivation
// (setCouponActive(id, false)) is the correct action for a used coupon.
export async function deleteCoupon(id: string): Promise<void> {
  const redemptionCount = await prisma.couponRedemption.count({ where: { couponId: id } });
  if (redemptionCount > 0) {
    throw new CouponError("This coupon has redemption history and cannot be deleted. Deactivate it instead.", 409);
  }
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new CouponError(`Coupon not found: ${id}`, 404);
  await prisma.coupon.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Validation/resolution — shared by the non-binding preview and the real,
// binding order-creation calculation (see this file's own header comment).
// ---------------------------------------------------------------------------

export interface CouponEligibleLine {
  // Identifies the line for the purposes of restriction/eligible-subtotal
  // calculation — never anything money-bearing beyond lineTotal itself.
  productId: string | null;
  lineTotal: Prisma.Decimal;
}

export interface CouponResolutionInput {
  rawCode: unknown;
  customerId: string | null;
  customerEmail: string | null;
  // Lines still eligible for a PROMOTIONAL discount at all — i.e. already
  // excluding whatever the preorder discount claimed (order.service.ts's
  // own responsibility, never re-derived here). For a preview call before
  // checkout has resolved preorder eligibility, the caller simply passes
  // every cart line.
  eligibleLines: CouponEligibleLine[];
  now?: Date;
}

export interface CouponResolutionResult {
  valid: boolean;
  message: string;
  code: string;
  coupon: Prisma.CouponGetPayload<Record<string, never>> | null;
  discountAmount: Prisma.Decimal;
  eligibleSubtotal: Prisma.Decimal;
}

const GENERIC_NOT_FOUND: Omit<CouponResolutionResult, "code"> = {
  valid: false,
  message: "Coupon code not found.",
  coupon: null,
  discountAmount: new Prisma.Decimal(0),
  eligibleSubtotal: new Prisma.Decimal(0),
};

function calculateDiscountAmount(eligibleSubtotal: Prisma.Decimal, coupon: { discountType: CouponDiscountType; discountValue: Prisma.Decimal; maximumDiscountAmount: Prisma.Decimal | null }): Prisma.Decimal {
  if (eligibleSubtotal.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);

  if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
    let amount = roundHalfUpToCents(eligibleSubtotal.times(coupon.discountValue).dividedBy(100));
    if (coupon.maximumDiscountAmount && amount.greaterThan(coupon.maximumDiscountAmount)) {
      amount = coupon.maximumDiscountAmount;
    }
    return amount;
  }

  // FIXED_AMOUNT — Milestone 197, Part 9's explicit requirement: never
  // reduce eligible merchandise below zero (a R50 coupon on a R30
  // eligible subtotal discounts R30, never -R20).
  return Prisma.Decimal.min(coupon.discountValue, eligibleSubtotal);
}

async function resolve(input: CouponResolutionInput): Promise<CouponResolutionResult> {
  const now = input.now ?? new Date();

  if (typeof input.rawCode !== "string" || input.rawCode.trim().length === 0) {
    return { ...GENERIC_NOT_FOUND, code: "" };
  }
  const code = normalizeCouponCode(input.rawCode);

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) return { ...GENERIC_NOT_FOUND, code };

  if (!coupon.isActive) {
    return { valid: false, message: "This coupon is no longer available.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal: new Prisma.Decimal(0) };
  }
  if (coupon.startsAt && now < coupon.startsAt) {
    return { valid: false, message: "This coupon is not active yet.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal: new Prisma.Decimal(0) };
  }
  if (coupon.expiresAt && now >= coupon.expiresAt) {
    return { valid: false, message: "This coupon has expired.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal: new Prisma.Decimal(0) };
  }
  if (coupon.customerEligibility === CouponCustomerEligibility.LOGGED_IN_ONLY && !input.customerId) {
    return { valid: false, message: "Sign in to use this coupon.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal: new Prisma.Decimal(0) };
  }

  // Product/category restriction — an empty include list on the coupon
  // means "no restriction, every product is eligible" (see Coupon's own
  // schema comment); an excluded product is always removed regardless.
  const [includedProductRows, includedCategoryRows, excludedProductRows] = await Promise.all([
    prisma.couponProduct.findMany({ where: { couponId: coupon.id }, select: { productId: true } }),
    prisma.couponCategory.findMany({ where: { couponId: coupon.id }, select: { categoryId: true } }),
    prisma.couponExcludedProduct.findMany({ where: { couponId: coupon.id }, select: { productId: true } }),
  ]);
  const includedProductIds = new Set(includedProductRows.map((r) => r.productId));
  const includedCategoryIds = new Set(includedCategoryRows.map((r) => r.categoryId));
  const excludedProductIds = new Set(excludedProductRows.map((r) => r.productId));
  const hasRestriction = includedProductIds.size > 0 || includedCategoryIds.size > 0;

  let productCategoryById = new Map<string, string>();
  if (hasRestriction) {
    const productIds = input.eligibleLines.map((line) => line.productId).filter((id): id is string => Boolean(id));
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } });
      productCategoryById = new Map(products.map((p) => [p.id, p.categoryId]));
    }
  }

  const eligibleSubtotal = input.eligibleLines.reduce((sum, line) => {
    if (!line.productId) return sum; // no product reference at all — never coupon-eligible
    if (excludedProductIds.has(line.productId)) return sum;
    if (hasRestriction) {
      const inProduct = includedProductIds.has(line.productId);
      const inCategory = includedCategoryIds.has(productCategoryById.get(line.productId) ?? "");
      if (!inProduct && !inCategory) return sum;
    }
    return sum.plus(line.lineTotal);
  }, new Prisma.Decimal(0));

  if (eligibleSubtotal.lessThanOrEqualTo(0)) {
    return { valid: false, message: "This coupon is not valid for the products in your cart.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal };
  }

  if (coupon.minimumOrderSubtotal && eligibleSubtotal.lessThan(coupon.minimumOrderSubtotal)) {
    return { valid: false, message: `Your order does not meet the R${coupon.minimumOrderSubtotal.toFixed(2)} minimum for this coupon.`, code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal };
  }

  if (coupon.maxTotalUses !== null && coupon.timesRedeemed >= coupon.maxTotalUses) {
    return { valid: false, message: "This coupon has reached its usage limit.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal };
  }

  if (coupon.maxUsesPerCustomer !== null) {
    const priorRedemptions = input.customerId
      ? await prisma.couponRedemption.count({ where: { couponId: coupon.id, customerId: input.customerId } })
      : input.customerEmail
        ? await prisma.couponRedemption.count({ where: { couponId: coupon.id, customerEmail: input.customerEmail.trim().toLowerCase() } })
        : 0;
    if (priorRedemptions >= coupon.maxUsesPerCustomer) {
      return { valid: false, message: "This coupon has reached its usage limit.", code, coupon, discountAmount: new Prisma.Decimal(0), eligibleSubtotal };
    }
  }

  const discountAmount = calculateDiscountAmount(eligibleSubtotal, coupon);
  return { valid: true, message: "Coupon applied.", code, coupon, discountAmount, eligibleSubtotal };
}

// Non-binding preview — safe to call on every cart/checkout render, same
// discipline as referralCapture.service.ts's own previewReferral(). Never
// mutates anything, never consumes usage.
export async function previewCoupon(rawCode: unknown, customerId: string | null, customerEmail: string | null, eligibleLines: CouponEligibleLine[]): Promise<CouponResolutionResult> {
  return resolve({ rawCode, customerId, customerEmail, eligibleLines });
}

// The real, binding resolution — called from inside order.service.ts's
// createOrder(), re-validating everything from scratch server-side
// regardless of what any prior preview showed (Milestone 197, Part 8's
// own explicit "never trust the frontend" requirement).
export async function resolveCouponForOrder(rawCode: unknown, customerId: string | null, customerEmail: string, eligibleLines: CouponEligibleLine[]): Promise<CouponResolutionResult> {
  return resolve({ rawCode, customerId, customerEmail, eligibleLines });
}

// Called ONLY inside the same database transaction as order creation
// (order.service.ts), after the order row itself exists — mirrors
// PreorderDiscountRedemption's own reserve-inside-transaction discipline
// exactly. The conditional updateMany() below is the actual concurrency
// guarantee for the TOTAL usage limit: it only increments (and therefore
// only succeeds) while timesRedeemed is still under maxTotalUses at the
// moment of writing, the identical pattern order.service.ts's own stock-
// decrement guard already uses — two simultaneous checkouts can never
// both push a total-use coupon over its limit. The per-customer limit was
// already checked in resolve() above; closing that race completely would
// need a stronger lock than this codebase uses anywhere else today (see
// this milestone's own report for why that narrow window is a disclosed,
// accepted V1 limitation rather than silently pretended to be airtight).
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  couponId: string,
  orderId: string,
  customerId: string | null,
  customerEmail: string,
  codeSnapshot: string,
  discountAmountSnapshot: Prisma.Decimal
): Promise<void> {
  const coupon = await tx.coupon.findUnique({ where: { id: couponId }, select: { maxTotalUses: true } });
  if (!coupon) throw new CouponError("Coupon no longer exists.", 409);

  const result = await tx.coupon.updateMany({
    where: {
      id: couponId,
      OR: [{ maxTotalUses: null }, { timesRedeemed: { lt: coupon.maxTotalUses ?? Number.MAX_SAFE_INTEGER } }],
    },
    data: { timesRedeemed: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new CouponError("This coupon has reached its usage limit.", 409);
  }

  await tx.couponRedemption.create({
    data: {
      couponId,
      orderId,
      customerId,
      customerEmail: customerEmail.trim().toLowerCase(),
      codeSnapshot,
      discountAmountSnapshot,
    },
  });
}
