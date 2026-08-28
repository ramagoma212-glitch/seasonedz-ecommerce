// Delivery service (Version 3, Milestone 25 — preparation only).
//
// Thin, deliberately simple wrappers around the delivery config and
// existing Shipping data. Nothing here contacts any courier provider —
// courier fulfilment remains entirely manual (Seasonedz Group staff
// set Shipping fields by hand). See backend/DELIVERY_SETUP.md.

import { Prisma, type FulfilmentStatus } from "@prisma/client";
import { calculateDeliveryFee as calculateDeliveryFeeDecimal } from "../utils/money.js";
import { COURIER_INTEGRATION_ENABLED, COURIER_PROVIDER, FREE_DELIVERY_THRESHOLD, COURIER_LOCKER_FEE, COURIER_DOOR_FEE, type DeliveryMethodValue } from "../config/delivery.js";

// Plain-number wrapper around utils/money.ts's Decimal-based
// calculateDeliveryFee, so callers of this service don't need to
// construct a Prisma.Decimal themselves. order.service.ts's real order
// transaction still calls the Decimal version directly (via
// utils/money.ts) — this just gives the same rule a simple number-in,
// number-out API for anything else that needs it.
export function calculateDeliveryFee(method: DeliveryMethodValue, physicalSubtotal: number, hasPhysicalItems = true): number {
  return calculateDeliveryFeeDecimal(method, new Prisma.Decimal(physicalSubtotal), hasPhysicalItems).toNumber();
}

export interface DeliverySummary {
  physicalSubtotal: number;
  method: DeliveryMethodValue;
  fee: number;
  isFree: boolean;
  freeDeliveryThreshold: number;
  courierLockerFee: number;
  courierDoorFee: number;
}

// A small, display-ready summary of what a given qualifying subtotal
// and method means for delivery — e.g. usable by a future endpoint or
// script that wants to show "R100" / "Free" without reaching into
// config constants directly.
export function getDeliverySummary(method: DeliveryMethodValue, physicalSubtotal: number, hasPhysicalItems = true): DeliverySummary {
  const fee = calculateDeliveryFee(method, physicalSubtotal, hasPhysicalItems);

  return {
    physicalSubtotal,
    method,
    fee,
    isFree: fee === 0,
    freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
    courierLockerFee: COURIER_LOCKER_FEE,
    courierDoorFee: COURIER_DOOR_FEE,
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
    : "Courier tracking isn't available yet for this order. It's prepared and dispatched manually by Seasonedz Group.";

  return {
    courierIntegrationEnabled: COURIER_INTEGRATION_ENABLED,
    courierProvider: COURIER_PROVIDER,
    fulfilmentStatus: order.fulfilmentStatus,
    hasTrackingInfo,
    message,
  };
}
