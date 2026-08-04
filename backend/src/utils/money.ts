// Server-side money helpers. All monetary math uses Prisma's Decimal
// type (never plain JS numbers) to avoid floating-point drift — the
// same type Product.price etc. are already stored and read as.

import { Prisma } from "@prisma/client";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD, type DeliveryMethodValue } from "../config/delivery.js";
import { GIFT_WRAP_FEE_PER_ITEM } from "../config/giftWrap.js";

const courierLockerFee = new Prisma.Decimal(COURIER_LOCKER_FEE);
const courierDoorFee = new Prisma.Decimal(COURIER_DOOR_FEE);
const freeDeliveryThreshold = new Prisma.Decimal(FREE_DELIVERY_THRESHOLD);
const giftWrapFeePerItem = new Prisma.Decimal(GIFT_WRAP_FEE_PER_ITEM);

// Version 7, Milestone 168C: replaces the old registered-customer-only
// R650 threshold with three owner-approved fulfilment methods and a
// universal R600 threshold (guest or registered — see config/delivery.ts's
// header comment for the full rule and the reasoning for dropping the
// registered-customer gate).
//
// `physicalSubtotal` must be the QUALIFYING subtotal only — physical
// products' line totals, excluding gift wrapping and excluding any
// delivery fee itself (see order.service.ts's createOrder(), which
// derives this from verified DB-priced items, never from client input).
//
// Version 7, Milestone 152B (preserved): `hasPhysicalItems` short-
// circuits straight to a R0 fee — a digital-only order has nothing to
// deliver, regardless of method or subtotal.
export function calculateDeliveryFee(method: DeliveryMethodValue, physicalSubtotal: Prisma.Decimal, hasPhysicalItems = true): Prisma.Decimal {
  if (!hasPhysicalItems) return new Prisma.Decimal(0);
  const qualifiesForFree = physicalSubtotal.gte(freeDeliveryThreshold);

  switch (method) {
    case "COLLECTION":
      return new Prisma.Decimal(0);
    case "COURIER_LOCKER":
      return qualifiesForFree ? new Prisma.Decimal(0) : courierLockerFee;
    case "COURIER_DOOR":
      return qualifiesForFree ? new Prisma.Decimal(0) : courierDoorFee;
    default: {
      // Unreachable when the caller validates deliveryMethod first
      // (order.validator.ts) — defensive fallback only, never trust
      // an unvalidated method this deep in the pricing path.
      const exhaustiveCheck: never = method;
      throw new Error(`Unsupported delivery method: ${exhaustiveCheck}`);
    }
  }
}

// Version 7, Milestone 159: R30 per wrapped unit, never per order — a
// line of quantity 3, all wrapped, costs 3x this, not a flat fee. The
// caller (order.service.ts's verifyItems()) is responsible for only
// ever passing isGiftWrapped=true for a PHYSICAL item — this function
// itself has no product-type awareness, it just does the arithmetic
// for whatever quantity/flag it's given.
export function calculateGiftWrapFee(quantity: number, isGiftWrapped: boolean): Prisma.Decimal {
  if (!isGiftWrapped) return new Prisma.Decimal(0);
  return giftWrapFeePerItem.times(quantity);
}
