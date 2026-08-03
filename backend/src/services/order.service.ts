import { FulfilmentStatus, OrderStatus, PaymentStatus, Prisma, ProductStatus, ProductType } from "@prisma/client";
import type { PaymentMethod, Product } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { calculateDeliveryFee, calculateGiftWrapFee } from "../utils/money.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import { GIFT_WRAP_FEE_PER_ITEM } from "../config/giftWrap.js";
import type { ValidatedOrderInput } from "../validators/order.validator.js";

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
  deliveryAddress: {
    streetAddress: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    deliveryNotes: string | null;
  };
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
    deliveryAddress: {
      streetAddress: order.deliveryStreetAddress,
      suburb: order.deliverySuburb,
      city: order.deliveryCity,
      province: order.deliveryProvince,
      postalCode: order.deliveryPostalCode,
      country: order.deliveryCountry,
      deliveryNotes: order.deliveryNotes,
    },
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
// Version 7, Milestone 131: `isRegisteredCustomer` is likewise always
// sourced from the same verified session (req.customerUser.type ===
// "REGISTERED" in order.controller.ts) — never from the request body.
// It only affects calculateDeliveryFee() below; nothing else about
// order creation changes based on it.
export async function createOrder(
  input: ValidatedOrderInput,
  customerId: string | null = null,
  isRegisteredCustomer: boolean = false
): Promise<OrderOutput> {
  const verifiedItems = await verifyItems(input.items);

  const subtotal = verifiedItems.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  // Version 7, Milestone 159: sum of every line's own giftWrapLineTotal
  // (already 0 for an unwrapped/ineligible line — see verifyItems()).
  const giftWrapTotal = verifiedItems.reduce((sum, item) => sum.plus(item.giftWrapLineTotal), new Prisma.Decimal(0));
  // Version 7, Milestone 152B: a digital-only order (every item
  // DIGITAL, none PHYSICAL) has nothing to deliver, so it's never
  // charged a delivery fee regardless of subtotal or registered
  // status. A mixed order (at least one PHYSICAL item) is charged
  // normally — see utils/money.ts's own comment.
  const hasPhysicalItems = verifiedItems.some((item) => item.productType === ProductType.PHYSICAL);
  const deliveryFee = calculateDeliveryFee(subtotal, isRegisteredCustomer, hasPhysicalItems);
  const discountTotal = new Prisma.Decimal(0);
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

    return tx.order.create({
      data: {
        orderNumber,
        customerId,
        customerEmail: input.customer.email,
        customerPhone: input.customer.phone,
        customerFirstName: input.customer.firstName,
        customerLastName: input.customer.lastName,
        deliveryStreetAddress: input.deliveryAddress.streetAddress,
        deliverySuburb: input.deliveryAddress.suburb,
        deliveryCity: input.deliveryAddress.city,
        deliveryProvince: input.deliveryAddress.province,
        deliveryPostalCode: input.deliveryAddress.postalCode,
        deliveryCountry: input.deliveryAddress.country,
        deliveryNotes: input.deliveryAddress.deliveryNotes,
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
  deliveryCity: string;
  deliveryProvince: string;
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
    deliveryCity: order.deliveryCity,
    deliveryProvince: order.deliveryProvince,
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
