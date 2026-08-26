import { AffiliateStatus, FulfilmentStatus, OrderAffiliateCommissionStatus, OrderStatus, PaymentStatus, Prisma, ProductStatus, ProductType, DeliveryMethod } from "@prisma/client";
import type { PaymentMethod, Product } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { calculateDeliveryFee, calculateGiftWrapFee } from "../utils/money.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import { GIFT_WRAP_FEE_PER_ITEM } from "../config/giftWrap.js";
import type { ValidatedOrderInput } from "../validators/order.validator.js";
import { verifyReferralCapture, captureAgeInDays } from "../utils/referralAttributionToken.js";
import { getReferralProgrammeSettings } from "./referralProgrammeSettings.service.js";
import { isSelfReferral, type CheckoutIdentity } from "./referralAffiliate.service.js";
import { calculateReferralPricing, type ReferralPricingResult } from "./referralPricing.service.js";

// A business-rule failure (product not found/inactive/out of stock,
// insufficient stock, etc.) — distinct from an unexpected error, so
// the controller can turn it into a clean 400 instead of a 500.
export class OrderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OrderError";
    this.statusCode = statusCode;
  }
}

interface VerifiedItem {
  productId: string;
  productName: string;
  productSlug: string;
  sku: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  // Version 7, Milestone 152: secure digital downloads — see this
  // file's own createOrder() comment on why these are snapshotted onto
  // OrderItem rather than looked up live at download time.
  productType: ProductType;
  digitalAssetId: string | null;
  // Version 7, Milestone 159: optional paid gift wrapping. isGiftWrapped
  // is the RE-DERIVED, authoritative value — never a straight copy of
  // whatever the client sent (see the eligibility check below).
  // giftWrapFeePerUnit is null (not 0) when not wrapped, so a line's
  // wrap state is never ambiguous from its fee alone.
  isGiftWrapped: boolean;
  giftMessage: string | null;
  giftWrapFeePerUnit: Prisma.Decimal | null;
  giftWrapLineTotal: Prisma.Decimal;
}

// Version 7, Milestone 159: a distinct order LINE is a product plus its
// gift-wrap configuration — a wrapped and unwrapped copy of the same
// product, or two wrapped copies with different messages, must price
// and store separately, mirroring the frontend cart's own line-identity
// rule (src/js/cart.js's lineId). Only exact duplicates (same product,
// same wrap state, same message) merge, same as the old plain-slug
// behaviour did for everything before this milestone.
function groupItemsByLine(items: ValidatedOrderInput["items"]): Map<string, { productSlug: string; quantity: number; giftWrap: boolean; giftMessage: string | null }> {
  const groups = new Map<string, { productSlug: string; quantity: number; giftWrap: boolean; giftMessage: string | null }>();
  for (const item of items) {
    const key = `${item.productSlug}::${item.giftWrap ? `wrap::${item.giftMessage ?? ""}` : "plain"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      groups.set(key, { productSlug: item.productSlug, quantity: item.quantity, giftWrap: item.giftWrap, giftMessage: item.giftMessage });
    }
  }
  return groups;
}

// Looks up and re-prices every requested item from the database —
// nothing about price ever comes from the request body, including
// whether gift wrapping is even allowed for it: isGiftWrapped is only
// ever true here when the request asked for it AND the real product's
// own productType is PHYSICAL, regardless of what the request claims.
// Duplicate (productSlug + gift-wrap-configuration) entries are merged
// (summed quantity) before the stock check; the STOCK check itself
// still totals every configuration of the same product together (they
// draw from the same physical inventory), even though they end up as
// separate order lines below.
async function verifyItems(items: ValidatedOrderInput["items"]): Promise<VerifiedItem[]> {
  const totalQuantityBySlug = new Map<string, number>();
  for (const item of items) {
    totalQuantityBySlug.set(item.productSlug, (totalQuantityBySlug.get(item.productSlug) ?? 0) + item.quantity);
  }

  const lineGroups = groupItemsByLine(items);
  const productCache = new Map<string, Product & { digitalAsset: { id: string; isActive: boolean } | null }>();
  const verified: VerifiedItem[] = [];

  for (const [, group] of lineGroups) {
    const totalQuantityForSlug = totalQuantityBySlug.get(group.productSlug) ?? group.quantity;
    if (totalQuantityForSlug > 99) {
      throw new OrderError(`Total quantity for "${group.productSlug}" cannot exceed 99.`);
    }

    let product = productCache.get(group.productSlug);
    if (!product) {
      const found = await prisma.product.findUnique({
        where: { slug: group.productSlug },
        include: { digitalAsset: { select: { id: true, isActive: true } } },
      });
      if (!found) {
        throw new OrderError(`Product not found: ${group.productSlug}`);
      }
      product = found;
      productCache.set(group.productSlug, product);
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new OrderError(`Product is not currently available: ${product.name}`);
    }

    // Version 7, Milestone 152: a DIGITAL product has no physical
    // inventory — stock checks/decrements are meaningless for it and
    // are skipped entirely, same as they've never applied to anything
    // but stockQuantity in this codebase. A digital product must still
    // have an active file attached to be purchasable — the same
    // guarantee adminProduct.service.ts's own validation already
    // enforces before it can ever become ACTIVE, re-checked here too
    // since a product's file could in principle be removed after
    // activation (defensive, not expected in normal admin use).
    if (product.productType === ProductType.DIGITAL) {
      if (!product.digitalAsset || !product.digitalAsset.isActive || !product.downloadEnabled) {
        throw new OrderError(`This digital product is not currently available for download: ${product.name}`);
      }
    } else {
      if (product.stockQuantity <= 0) {
        throw new OrderError(`Product is out of stock: ${product.name}`);
      }

      if (totalQuantityForSlug > product.stockQuantity) {
        throw new OrderError(`Only ${product.stockQuantity} of "${product.name}" left in stock (requested ${totalQuantityForSlug}).`);
      }
    }

    // Version 7, Milestone 159: the authoritative eligibility check —
    // a request claiming giftWrap:true for a DIGITAL product is simply
    // ignored, not an error, matching this validator layer's existing
    // "unknown/invalid extra data is dropped, not fatal" discipline.
    // giftWrapFeePerUnit is snapshotted from the one config constant
    // (config/giftWrap.ts) at the moment of purchase.
    const isGiftWrapped = group.giftWrap && product.productType === ProductType.PHYSICAL;
    const giftMessage = isGiftWrapped ? group.giftMessage : null;
    const giftWrapFeePerUnit = isGiftWrapped ? new Prisma.Decimal(GIFT_WRAP_FEE_PER_ITEM) : null;

    const unitPrice = product.price;
    verified.push({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      sku: product.sku,
      quantity: group.quantity,
      unitPrice,
      lineTotal: unitPrice.times(group.quantity),
      productType: product.productType,
      digitalAssetId: product.productType === ProductType.DIGITAL ? product.digitalAsset!.id : null,
      isGiftWrapped,
      giftMessage,
      giftWrapFeePerUnit,
      giftWrapLineTotal: calculateGiftWrapFee(group.quantity, isGiftWrapped),
    });
  }

  return verified;
}

const orderInclude = {
  items: true,
  payment: true,
  shipping: true,
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface OrderItemOutput {
  productSlug: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Version 7, Milestone 152: secure digital downloads — lets callers
  // (order.controller.ts's email mapping, the frontend cart/checkout
  // messaging) know without a second lookup whether this line is a
  // digital download or a physical item.
  productType: ProductType;
  // Version 7, Milestone 159: optional paid gift wrapping. giftWrapFee
  // is this LINE's total (per-unit fee x quantity), a display
  // convenience so callers never need to multiply themselves.
  isGiftWrapped: boolean;
  giftMessage: string | null;
  giftWrapFee: number;
}

export interface OrderOutput {
  orderNumber: string;
  createdAt: Date;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  // Version 7, Milestone 168C: which of the three owner-approved
  // fulfilment methods was chosen, and its resulting fee.
  deliveryMethod: DeliveryMethod;
  // Null only for COLLECTION orders — see collectionCity below.
  deliveryAddress: {
    streetAddress: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    deliveryNotes: string | null;
  } | null;
  // Only set for COLLECTION orders — "Pretoria" or "Thohoyandou".
  collectionCity: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  paymentMethod: PaymentMethod;
  items: OrderItemOutput[];
  subtotal: number;
  // Version 7, Milestone 159: sum of every wrapped line's own
  // giftWrapFee — see OrderItemOutput above.
  giftWrapTotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    provider: string | null;
    paidAt: Date | null;
  } | null;
  shipping: {
    status: FulfilmentStatus;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDelivery: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  // Version 7, Milestone 157: order composition, derived from `items`
  // on every response — lets every caller (order-confirmation,
  // account order detail, Track Order, admin order detail) branch on
  // "does this order need a courier at all" without re-deriving the
  // same `items.some(...)` logic in five different places. Never
  // exposes anything about the digital asset itself (see
  // OrderItemOutput above — only productType, never digitalAssetId or
  // any storage field).
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
  isDigitalOnly: boolean;
}

// Built field-by-field, not via spreading the Prisma row — no internal
// IDs (order/customer/product/payment/shipping IDs) and no costPrice
// ever reach this shape, matching the Product API's convention from
// Milestone 12.
function toOrderOutput(order: OrderWithRelations): OrderOutput {
  const hasPhysicalItems = order.items.some((item) => item.productType === ProductType.PHYSICAL);
  const hasDigitalItems = order.items.some((item) => item.productType === ProductType.DIGITAL);

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customer: {
      firstName: order.customerFirstName,
      lastName: order.customerLastName,
      email: order.customerEmail,
      phone: order.customerPhone,
    },
    deliveryMethod: order.deliveryMethod,
    deliveryAddress:
      order.deliveryMethod === DeliveryMethod.COLLECTION
        ? null
        : {
            streetAddress: order.deliveryStreetAddress ?? "",
            suburb: order.deliverySuburb ?? "",
            city: order.deliveryCity ?? "",
            province: order.deliveryProvince ?? "",
            postalCode: order.deliveryPostalCode ?? "",
            country: order.deliveryCountry,
            deliveryNotes: order.deliveryNotes,
          },
    collectionCity: order.collectionCity,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    paymentMethod: order.paymentMethod,
    items: order.items.map((item) => ({
      productSlug: item.productSlug,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      lineTotal: item.lineTotal.toNumber(),
      productType: item.productType,
      isGiftWrapped: item.isGiftWrapped,
      giftMessage: item.giftMessage,
      giftWrapFee: item.giftWrapFeePerUnit ? item.giftWrapFeePerUnit.times(item.quantity).toNumber() : 0,
    })),
    subtotal: order.subtotal.toNumber(),
    giftWrapTotal: order.giftWrapTotal.toNumber(),
    deliveryFee: order.deliveryFee.toNumber(),
    discountTotal: order.discountTotal.toNumber(),
    total: order.total.toNumber(),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: order.payment.amount.toNumber(),
          provider: order.payment.provider,
          paidAt: order.payment.paidAt,
        }
      : null,
    shipping: order.shipping
      ? {
          status: order.shipping.status,
          courierName: order.shipping.courierName,
          trackingNumber: order.shipping.trackingNumber,
          trackingUrl: order.shipping.trackingUrl,
          estimatedDelivery: order.shipping.estimatedDelivery,
          shippedAt: order.shipping.shippedAt,
          deliveredAt: order.shipping.deliveredAt,
        }
      : null,
    hasPhysicalItems,
    hasDigitalItems,
    isDigitalOnly: hasDigitalItems && !hasPhysicalItems,
  };
}

interface ResolvedReferral {
  affiliateId: string;
  affiliateNameSnapshot: string;
  affiliateReferralCodeSnapshot: string;
  isSelfReferral: boolean;
  pricing: ReferralPricingResult;
}

// Version 7, Milestone 172B.4: resolves input.referralAttribution (if
// any) into real discount/commission figures, entirely re-derived
// server-side — nothing here ever trusts a rate, amount, affiliate id
// or eligibility flag the client sent. The client only ever sends the
// referral CODE, wrapped in a token this backend itself signed at
// capture time (see order.validator.ts, referralCapture.service.ts,
// utils/referralAttributionToken.ts).
//
// Returns null for ANY reason the referral doesn't apply — missing,
// tampered/forged signature, expired attribution window, programme
// inactive, unknown code, or an affiliate that isn't ACTIVE. Every one
// of these is a silent "no referral" outcome, never an order-blocking
// error: a referral problem must never stop a legitimate customer order
// (the approved V1 rule — see this milestone's own audit).
//
// Deliberately runs BEFORE the transaction below, not inside it: it
// only reads (AffiliateProgrammeSettings, Affiliate), so it needs none
// of the atomicity the stock decrement requires. An admin changing
// programme settings or suspending the affiliate in the instant between
// this read and the transaction committing is the same ordinary
// "settings can change at any moment" race every other read in this
// codebase already accepts — it can only ever affect whether a discount/
// commission is granted, never stock correctness or order integrity.
async function resolveReferralForOrder(
  referralAttribution: ValidatedOrderInput["referralAttribution"],
  checkoutIdentity: CheckoutIdentity,
  qualifyingProductSubtotal: Prisma.Decimal
): Promise<ResolvedReferral | null> {
  if (!referralAttribution) return null;

  const verified = verifyReferralCapture(referralAttribution);
  if (!verified) return null;

  const settings = await getReferralProgrammeSettings();
  if (!settings.isProgrammeActive) return null;
  if (captureAgeInDays(verified.capturedAt) > settings.attributionWindowDays) return null;

  const affiliate = await prisma.affiliate.findUnique({ where: { referralCode: verified.code } });
  if (!affiliate || affiliate.status !== AffiliateStatus.ACTIVE) return null;

  const isSelf = isSelfReferral({ customerId: affiliate.customerId, email: affiliate.email }, checkoutIdentity);

  const pricing = calculateReferralPricing(
    qualifyingProductSubtotal,
    { discountRateOverride: affiliate.discountRateOverride, commissionRateOverride: affiliate.commissionRateOverride },
    {
      defaultReferralDiscountRate: new Prisma.Decimal(settings.defaultReferralDiscountRate),
      defaultCommissionRate: new Prisma.Decimal(settings.defaultCommissionRate),
    },
    isSelf
  );

  return {
    affiliateId: affiliate.id,
    affiliateNameSnapshot: affiliate.name,
    affiliateReferralCodeSnapshot: affiliate.referralCode,
    isSelfReferral: isSelf,
    pricing,
  };
}

// Orders are created as PENDING (not CONFIRMED): paymentStatus also
// starts PENDING, since no real payment has actually been confirmed
// yet — for BANK_TRANSFER/CASH_ON_DELIVERY there's nothing to
// automatically confirm at this point. A staff member (or, once real
// PayFast integration exists, a payment webhook) is what should move
// an order to CONFIRMED.
//
// Version 7, Milestone 129: `customerId` is deliberately a separate
// parameter, never part of `ValidatedOrderInput` — it comes from the
// verified session (req.customerUser.id via optionalCustomerAuth),
// never from anything the client's request body claims, the same
// "never trust the body for identity" discipline order.validator.ts
// already applies to price/total. Defaults to null for guest checkout
// — customerFirstName/customerLastName/customerEmail/customerPhone
// below are unchanged either way; they're always the snapshot the
// customer actually typed at checkout, not derived from the account.
//
// Version 7, Milestone 168C: `isRegisteredCustomer` and its
// registered-only free-delivery gate were removed — the owner-approved
// three-method model applies the same R600 threshold to every
// customer. See config/delivery.ts's own header comment for the full
// rule and reasoning.
export async function createOrder(input: ValidatedOrderInput, customerId: string | null = null): Promise<OrderOutput> {
  const verifiedItems = await verifyItems(input.items);

  const subtotal = verifiedItems.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  // Version 7, Milestone 159: sum of every line's own giftWrapLineTotal
  // (already 0 for an unwrapped/ineligible line — see verifyItems()).
  const giftWrapTotal = verifiedItems.reduce((sum, item) => sum.plus(item.giftWrapLineTotal), new Prisma.Decimal(0));
  // Version 7, Milestone 152B: a digital-only order (every item
  // DIGITAL, none PHYSICAL) has nothing to deliver, so it's never
  // charged a delivery fee regardless of subtotal or method — see
  // utils/money.ts's own comment.
  const hasPhysicalItems = verifiedItems.some((item) => item.productType === ProductType.PHYSICAL);
  // Version 7, Milestone 168C: the R600 free-delivery threshold must be
  // judged against PHYSICAL products only — a digital item's price must
  // never help a physical delivery qualify for free shipping, and gift
  // wrapping/delivery fees themselves are already excluded by only
  // ever summing verifiedItems' own lineTotal (never giftWrapLineTotal
  // or a fee). This deliberately differs from the pre-168C behaviour,
  // which used the whole-order subtotal (including any digital items).
  const physicalSubtotal = verifiedItems
    .filter((item) => item.productType === ProductType.PHYSICAL)
    .reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  const deliveryFee = calculateDeliveryFee(input.deliveryMethod, physicalSubtotal, hasPhysicalItems);

  // Version 7, Milestone 172B.4: qualifyingProductSubtotal is `subtotal`
  // itself — the approved V1 rule excludes gift wrap and delivery, and
  // V1 has no product-level referral exclusion, so this is exactly the
  // same value already computed above, never a second calculation that
  // could drift from it. Resolved BEFORE deliveryFee's own threshold
  // check has any bearing here — deliveryFee was already computed two
  // lines up from physicalSubtotal (the ORIGINAL, pre-discount
  // physical-only subtotal), so a referral discount can never retroactively
  // change which delivery-fee tier an order qualifies for.
  const referral = await resolveReferralForOrder(input.referralAttribution, { customerId, email: input.customer.email }, subtotal);
  const discountTotal = referral ? referral.pricing.discountAmount : new Prisma.Decimal(0);
  const total = subtotal.plus(giftWrapTotal).plus(deliveryFee).minus(discountTotal);

  const orderNumber = await generateOrderNumber();

  // timeout raised from Prisma's 5s default — each query in this
  // transaction is a real round trip to the hosted Supabase instance,
  // which alone can approach 5s under normal dev-environment latency.
  const order = await prisma.$transaction(async (tx) => {
    // Atomic, race-safe stock guard: the UPDATE only matches (and
    // therefore only decrements) if stockQuantity is still enough at
    // the moment of writing, closing the gap between the check in
    // verifyItems() above and this transaction actually committing.
    // Version 7, Milestone 152: skipped entirely for DIGITAL items —
    // there is no finite inventory to decrement or race over.
    for (const item of verifiedItems) {
      if (item.productType === ProductType.DIGITAL) continue;

      const result = await tx.product.updateMany({
        where: { id: item.productId, stockQuantity: { gte: item.quantity } },
        data: { stockQuantity: { decrement: item.quantity } },
      });

      if (result.count === 0) {
        throw new OrderError(`Not enough stock for "${item.productName}" — please review your order and try again.`);
      }
    }

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        customerEmail: input.customer.email,
        customerPhone: input.customer.phone,
        customerFirstName: input.customer.firstName,
        customerLastName: input.customer.lastName,
        deliveryStreetAddress: input.deliveryAddress?.streetAddress ?? null,
        deliverySuburb: input.deliveryAddress?.suburb ?? null,
        deliveryCity: input.deliveryAddress?.city ?? null,
        deliveryProvince: input.deliveryAddress?.province ?? null,
        deliveryPostalCode: input.deliveryAddress?.postalCode ?? null,
        deliveryCountry: input.deliveryAddress?.country ?? "South Africa",
        deliveryNotes: input.deliveryAddress?.deliveryNotes ?? null,
        deliveryMethod: input.deliveryMethod as DeliveryMethod,
        collectionCity: input.collectionCity,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        fulfilmentStatus: FulfilmentStatus.NOT_STARTED,
        paymentMethod: input.paymentMethod,
        subtotal,
        giftWrapTotal,
        deliveryFee,
        discountTotal,
        total,
        items: {
          create: verifiedItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productSlug: item.productSlug,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            productType: item.productType,
            digitalAssetId: item.digitalAssetId,
            isGiftWrapped: item.isGiftWrapped,
            giftMessage: item.giftMessage,
            giftWrapFeePerUnit: item.giftWrapFeePerUnit,
          })),
        },
        payment: {
          create: {
            method: input.paymentMethod,
            status: PaymentStatus.PENDING,
            amount: total,
            provider: null,
          },
        },
        // Version 7, Milestone 157: a digital-only order has nothing to
        // deliver — no Shipping row is created for it at all, matching
        // the same "nothing to courier" philosophy already applied to
        // deliveryFee and Courier Guy auto-booking above. A mixed order
        // (at least one PHYSICAL item) still gets one, same as before.
        ...(hasPhysicalItems ? { shipping: { create: { status: FulfilmentStatus.NOT_STARTED, courierName: null } } } : {}),
      },
      include: orderInclude,
    });

    // Version 7, Milestone 172B.4: exactly one commission row per
    // referred order, created in the SAME transaction as the order
    // itself so the two can never diverge (an order with no matching
    // commission, or a commission with no matching order). Every
    // figure here is a permanent snapshot — a later change to
    // AffiliateProgrammeSettings' defaults, an affiliate's own
    // override, or even their name/code, must never retroactively
    // alter it (see OrderAffiliateCommission's own schema comment).
    //
    // Deliberately skipped ENTIRELY for a self-referral: the customer
    // still keeps their discount (already folded into discountTotal
    // above), but no commission row is ever created for it at all —
    // the strongest possible guarantee that a self-referral commission
    // can never later become payable by accident, since there is
    // nothing here to approve or pay, not even a zero-value row.
    if (referral && !referral.isSelfReferral) {
      await tx.orderAffiliateCommission.create({
        data: {
          orderId: createdOrder.id,
          affiliateId: referral.affiliateId,
          affiliateNameSnapshot: referral.affiliateNameSnapshot,
          affiliateReferralCodeSnapshot: referral.affiliateReferralCodeSnapshot,
          qualifyingProductSubtotal: subtotal,
          discountRateApplied: referral.pricing.discountRateApplied,
          discountAmount: referral.pricing.discountAmount,
          netQualifyingAmount: referral.pricing.netQualifyingAmount,
          commissionRateApplied: referral.pricing.commissionRateApplied,
          commissionAmount: referral.pricing.commissionAmount,
          status: OrderAffiliateCommissionStatus.PENDING,
        },
      });
    }

    return createdOrder;
  }, { timeout: 20000 });

  return toOrderOutput(order);
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderOutput | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: orderInclude,
  });

  return order ? toOrderOutput(order) : null;
}

// The same 6 stages as the frontend's demo tracking model
// (src/js/orders.js), mapped from the real backend OrderStatus enum.
// CANCELLED/REFUNDED orders aren't part of this stepper — their
// `status` field communicates that state directly instead.
const TRACKING_STEPS: Array<{ status: OrderStatus; key: string; label: string }> = [
  { status: OrderStatus.PENDING, key: "order-placed", label: "Order Placed" },
  { status: OrderStatus.CONFIRMED, key: "order-confirmed", label: "Order Confirmed" },
  { status: OrderStatus.PROCESSING, key: "preparing-order", label: "Preparing Your Order" },
  { status: OrderStatus.READY_FOR_DELIVERY, key: "ready-for-delivery", label: "Ready for Delivery" },
  { status: OrderStatus.OUT_FOR_DELIVERY, key: "out-for-delivery", label: "Out for Delivery" },
  { status: OrderStatus.DELIVERED, key: "delivered", label: "Delivered" },
];

export interface OrderTrackingStep {
  key: string;
  label: string;
  isComplete: boolean;
  isCurrent: boolean;
  isPending: boolean;
}

export interface OrderTrackingOutput {
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  fulfilmentStatus: FulfilmentStatus;
  shippingStatus: FulfilmentStatus;
  deliveryMethod: DeliveryMethod;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  collectionCity: string | null;
  trackingSteps: OrderTrackingStep[];
  trackingSource: "backend-demo";
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
  isDigitalOnly: boolean;
}

export async function getOrderTracking(orderNumber: string): Promise<OrderTrackingOutput | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { shipping: true, items: { select: { productType: true } } },
  });

  if (!order) {
    return null;
  }

  const hasPhysicalItems = order.items.some((item) => item.productType === ProductType.PHYSICAL);
  const hasDigitalItems = order.items.some((item) => item.productType === ProductType.DIGITAL);

  const currentIndex = TRACKING_STEPS.findIndex((step) => step.status === order.status);

  const trackingSteps: OrderTrackingStep[] = TRACKING_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    isComplete: currentIndex !== -1 && index < currentIndex,
    isCurrent: index === currentIndex,
    isPending: currentIndex === -1 || index > currentIndex,
  }));

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    fulfilmentStatus: order.fulfilmentStatus,
    shippingStatus: order.shipping?.status ?? order.fulfilmentStatus,
    deliveryMethod: order.deliveryMethod,
    deliveryCity: order.deliveryCity,
    deliveryProvince: order.deliveryProvince,
    collectionCity: order.collectionCity,
    trackingSteps,
    // No real courier tracking exists yet — this whole response is
    // derived from Order/Shipping rows set by this backend, never a
    // live courier API. See API_ROUTES.md.
    trackingSource: "backend-demo",
    hasPhysicalItems,
    hasDigitalItems,
    isDigitalOnly: hasDigitalItems && !hasPhysicalItems,
  };
}
