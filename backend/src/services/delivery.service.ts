// Delivery service (Version 3, Milestone 25 — preparation only).
//
// Thin, deliberately simple wrappers around the delivery config and
// existing Shipping data. Nothing here contacts any courier provider —
// courier fulfilment remains entirely manual (Seasonedz Group staff
// set Shipping fields by hand). See backend/DELIVERY_SETUP.md.

import { Prisma, type FulfilmentStatus } from "@prisma/client";
import { calculateDeliveryFee as calculateDeliveryFeeDecimal } from "../utils/money.js";
import { COURIER_INTEGRATION_ENABLED, COURIER_PROVIDER, FREE_DELIVERY_THRESHOLD, STANDARD_DELIVERY_FEE } from "../config/delivery.js";

// Plain-number wrapper around utils/money.ts's Decimal-based
// calculateDeliveryFee, so callers of this service don't need to
// construct a Prisma.Decimal themselves. order.service.ts's real order
// transaction still calls the Decimal version directly (via
// utils/money.ts) — this just gives the same rule a simple number-in,
// number-out API for anything else that needs it.
export function calculateDeliveryFee(subtotal: number): number {
  return calculateDeliveryFeeDecimal(new Prisma.Decimal(subtotal)).toNumber();
}

export interface DeliverySummary {
  subtotal: number;
  fee: number;
  isFree: boolean;
  freeDeliveryThreshold: number;
  standardDeliveryFee: number;
}

// A small, display-ready summary of what a given subtotal means for
// delivery — e.g. usable by a future endpoint or script that wants to
// show "R80" / "Free" without reaching into config constants directly.
export function getDeliverySummary(subtotal: number): DeliverySummary {
  const fee = calculateDeliveryFee(subtotal);

  return {
    subtotal,
    fee,
    isFree: fee === 0,
    freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
    standardDeliveryFee: STANDARD_DELIVERY_FEE,
  };
}

export interface ManualCourierStatusInput {
  fulfilmentStatus: FulfilmentStatus;
  shipping: {
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  } | null;
}

export interface ManualCourierStatus {
  courierIntegrationEnabled: boolean;
  courierProvider: string;
  fulfilmentStatus: FulfilmentStatus;
  hasTrackingInfo: boolean;
  message: string;
}

// Describes the *current*, honest state of manual courier handling for
// an order — never claims live tracking exists, and never contacts any
// courier provider. `order` is deliberately a narrow shape (just the
// two fields this actually needs), not order.service.ts's full
// OrderOutput — the same "small dedicated input type" pattern used by
// the email service (Milestone 24).
export function getManualCourierStatus(order: ManualCourierStatusInput): ManualCourierStatus {
  const hasTrackingInfo = Boolean(order.shipping?.trackingNumber);

  const message = hasTrackingInfo
    ? "Courier tracking details have been added by Seasonedz Group for this order."
    : "Courier tracking isn't available yet for this order — it's prepared and dispatched manually by Seasonedz Group.";

  return {
    courierIntegrationEnabled: COURIER_INTEGRATION_ENABLED,
    courierProvider: COURIER_PROVIDER,
    fulfilmentStatus: order.fulfilmentStatus,
    hasTrackingInfo,
    message,
  };
}
