// Customer-facing order history (Version 7, Milestone 130). Fully
// separate from order.service.ts's admin/public-tracking shapes and
// from adminDashboard.service.ts's admin-only augmentation — every
// query here is scoped by `customerId` at the database level, never
// filtered client-side after the fact, and every field returned is
// deliberately narrow. Never includes: passwordHash, session data,
// Payment.provider/providerReference/failureReason (PayFast/ITN
// internals), or any Shipping.courier* admin-booking field (see
// schema.prisma's own comment on Shipping — those are Courier Guy
// internal IDs/costs, admin-only, added in Milestone 112).
//
// `Order.paymentStatus`/`Order.paymentMethod` are the Order model's own
// columns (kept in sync with Payment.status/method at write time — see
// payfast.service.ts) — reading them means never touching the Payment
// table at all here, so there's no separate "don't expose this Payment
// field" filtering to get right.

import { ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface CustomerOrderSummary {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: Date;
  itemCount: number;
  firstItemName: string | null;
  firstItemImageUrl: string | null;
  // Version 7, Milestone 157: order composition — see order.service.ts's
  // OrderOutput for the same fields and why they exist.
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
  isDigitalOnly: boolean;
}

export interface CustomerOrderDetail {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
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
  items: Array<{
    productName: string;
    productSlug: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    imageUrl: string | null;
  }>;
  shipping: {
    status: string;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDelivery: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
  isDigitalOnly: boolean;
}

// Best-effort only — an order line item's own productId is nullable
// (a product can be deleted after the sale; see schema.prisma's own
// comment on OrderItem), so a missing image here just means the
// product no longer exists or has no images, never an error.
const firstItemImageInclude = {
  product: {
    include: {
      images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
    },
  },
} satisfies import("@prisma/client").Prisma.OrderItemInclude;

function computeComposition(items: { productType: ProductType }[]): {
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
  isDigitalOnly: boolean;
} {
  const hasPhysicalItems = items.some((item) => item.productType === ProductType.PHYSICAL);
  const hasDigitalItems = items.some((item) => item.productType === ProductType.DIGITAL);
  return { hasPhysicalItems, hasDigitalItems, isDigitalOnly: hasDigitalItems && !hasPhysicalItems };
}

// Ordered newest-first — the natural, expected order for "my orders".
export async function getOrdersForCustomer(customerId: string): Promise<CustomerOrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { items: { include: firstItemImageInclude, orderBy: { createdAt: "asc" } } },
  });

  return orders.map((order) => {
    const firstItem = order.items[0];
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal.toNumber(),
      deliveryFee: order.deliveryFee.toNumber(),
      total: order.total.toNumber(),
      createdAt: order.createdAt,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      firstItemName: firstItem?.productName ?? null,
      firstItemImageUrl: firstItem?.product?.images?.[0]?.url ?? null,
      ...computeComposition(order.items),
    };
  });
}

// Returns null both when the order doesn't exist AND when it exists
// but belongs to a different customer — deliberately the same result
// either way, so the controller can return one 404 that never reveals
// which case it was (see customerOrder.controller.ts).
export async function getOrderForCustomer(orderNumber: string, customerId: string): Promise<CustomerOrderDetail | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      items: { include: firstItemImageInclude, orderBy: { createdAt: "asc" } },
      shipping: true,
    },
  });

  if (!order || order.customerId !== customerId) return null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal.toNumber(),
    deliveryFee: order.deliveryFee.toNumber(),
    discountTotal: order.discountTotal.toNumber(),
    total: order.total.toNumber(),
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
    items: order.items.map((item) => ({
      productName: item.productName,
      productSlug: item.productSlug,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      lineTotal: item.lineTotal.toNumber(),
      imageUrl: item.product?.images?.[0]?.url ?? null,
    })),
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
    ...computeComposition(order.items),
  };
}
