// Version 7, Milestone 106: the first write action ever added against
// the Shipping table — kept in its own service file, same reasoning
// as adminOrderStatus.service.ts (Order.status) and
// adminProduct.service.ts (Product): the one place in the codebase
// that writes Shipping/Order.fulfilmentStatus should be easy to find
// and audit on its own, separate from the 100%-read-only
// adminDashboard.service.ts.
//
// No courier API is called anywhere in this file — every field here
// is set by an admin typing a value in, exactly as
// backend/DELIVERY_SETUP.md's manual workflow already describes; this
// only replaces the "direct database access" step with a real,
// authenticated, validated route.
//
// Order.fulfilmentStatus / Shipping.status decision (Milestone 106
// audit, not guessed): both fields are the same FulfilmentStatus enum,
// both default to NOT_STARTED, and backend/DELIVERY_SETUP.md's own
// "How Order Status and Fulfilment Status Should Work" table describes
// them together as one concept ("Physical preparation/delivery
// progress... Manually, by Seasonedz Group staff") stored in two
// places — Order.fulfilmentStatus for cheap access without a join
// (e.g. admin order list filtering), Shipping.status alongside the
// courier detail fields it's stored with. Nothing in the codebase ever
// diverges them today. Whenever `status` is part of an update, both
// are written together in one transaction so they can never drift out
// of sync.

import { FulfilmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class ShippingUpdateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ShippingUpdateError";
    this.statusCode = statusCode;
  }
}

const MAX_COURIER_NAME_LENGTH = 100;
const MAX_TRACKING_NUMBER_LENGTH = 100;
const MAX_TRACKING_URL_LENGTH = 500;

const VALID_STATUSES = Object.values(FulfilmentStatus);

export interface UpdateShippingInput {
  status?: unknown;
  courierName?: unknown;
  trackingNumber?: unknown;
  trackingUrl?: unknown;
  estimatedDelivery?: unknown;
  shippedAt?: unknown;
  deliveredAt?: unknown;
}

export interface ShippingUpdateResult {
  orderNumber: string;
  fulfilmentStatus: FulfilmentStatus;
  shipping: {
    status: FulfilmentStatus;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDelivery: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  };
}

// `status` has no "clear to blank" concept — the column isn't
// nullable and always has a real value (defaults to NOT_STARTED) — so
// this only ever returns a valid enum member or throws.
function parseStatus(raw: unknown): FulfilmentStatus {
  if (typeof raw !== "string" || !VALID_STATUSES.includes(raw as FulfilmentStatus)) {
    throw new ShippingUpdateError(`status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }
  return raw as FulfilmentStatus;
}

// Shared shape for the three plain-text optional fields
// (courierName/trackingNumber/trackingUrl): trimmed; an
// explicitly-provided empty string clears the field to null (the
// admin intentionally blanked it out), matching adminOrderStatus.
// service.ts's parseNote() convention for the same "blank means
// clear" behaviour. Returns `undefined` when the key was never
// provided at all, so the caller can tell "leave untouched" apart
// from "clear it" — Prisma's `data` object only includes keys that are
// actually meant to change.
function parseOptionalText(raw: unknown, fieldName: string, maxLength: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new ShippingUpdateError(`${fieldName} must be a string.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    throw new ShippingUpdateError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function parseTrackingUrl(raw: unknown): string | null | undefined {
  const parsed = parseOptionalText(raw, "trackingUrl", MAX_TRACKING_URL_LENGTH);
  if (!parsed) return parsed;

  try {
    const url = new URL(parsed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("not http(s)");
    }
  } catch {
    throw new ShippingUpdateError("trackingUrl must be a valid http:// or https:// URL.");
  }
  return parsed;
}

// Shared shape for the three date fields (estimatedDelivery/shippedAt/
// deliveredAt): an explicitly-provided empty string/null clears the
// field, same "blank means clear" convention as the text fields above.
function parseOptionalDate(raw: unknown, fieldName: string): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new ShippingUpdateError(`${fieldName} must be a date string.`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ShippingUpdateError(`${fieldName} is not a valid date.`);
  }
  return date;
}

export async function updateShipping(orderNumber: string, input: UpdateShippingInput): Promise<ShippingUpdateResult> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { shipping: true },
  });

  if (!order) {
    throw new ShippingUpdateError(`Order not found: ${orderNumber}`, 404);
  }

  if (!order.shipping) {
    // Never happens today — order.service.ts always creates a
    // Shipping row alongside every order — but handled explicitly
    // rather than assumed, so a future change to that can't silently
    // crash this route instead of giving a clear error.
    throw new ShippingUpdateError("This order has no shipping record to update.", 404);
  }

  const shippingData: Prisma.ShippingUpdateInput = {};
  let newStatus: FulfilmentStatus | undefined;

  if ("status" in input && input.status !== undefined) {
    newStatus = parseStatus(input.status);
    shippingData.status = newStatus;
  }

  const courierName = parseOptionalText(input.courierName, "courierName", MAX_COURIER_NAME_LENGTH);
  if (courierName !== undefined) shippingData.courierName = courierName;

  const trackingNumber = parseOptionalText(input.trackingNumber, "trackingNumber", MAX_TRACKING_NUMBER_LENGTH);
  if (trackingNumber !== undefined) shippingData.trackingNumber = trackingNumber;

  const trackingUrl = parseTrackingUrl(input.trackingUrl);
  if (trackingUrl !== undefined) shippingData.trackingUrl = trackingUrl;

  const estimatedDelivery = parseOptionalDate(input.estimatedDelivery, "estimatedDelivery");
  if (estimatedDelivery !== undefined) shippingData.estimatedDelivery = estimatedDelivery;

  const shippedAt = parseOptionalDate(input.shippedAt, "shippedAt");
  if (shippedAt !== undefined) shippingData.shippedAt = shippedAt;

  const deliveredAt = parseOptionalDate(input.deliveredAt, "deliveredAt");
  if (deliveredAt !== undefined) shippingData.deliveredAt = deliveredAt;

  if (Object.keys(shippingData).length === 0) {
    throw new ShippingUpdateError(
      "No recognised fields to update. Allowed: status, courierName, trackingNumber, trackingUrl, estimatedDelivery, shippedAt, deliveredAt."
    );
  }

  const [updatedOrder, updatedShipping] = await prisma.$transaction([
    // Kept aligned with Shipping.status whenever status changes — see
    // this file's header comment for why these two fields are treated
    // as one concept, never allowed to drift apart.
    prisma.order.update({
      where: { id: order.id },
      data: newStatus ? { fulfilmentStatus: newStatus } : {},
      select: { orderNumber: true, fulfilmentStatus: true },
    }),
    prisma.shipping.update({
      where: { orderId: order.id },
      data: shippingData,
      select: {
        status: true,
        courierName: true,
        trackingNumber: true,
        trackingUrl: true,
        estimatedDelivery: true,
        shippedAt: true,
        deliveredAt: true,
      },
    }),
  ]);

  return {
    orderNumber: updatedOrder.orderNumber,
    fulfilmentStatus: updatedOrder.fulfilmentStatus,
    shipping: updatedShipping,
  };
}
