// Server-side money helpers. All monetary math uses Prisma's Decimal
// type (never plain JS numbers) to avoid floating-point drift — the
// same type Product.price etc. are already stored and read as.

import { Prisma } from "@prisma/client";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD, type DeliveryMethodValue } from "../config/delivery.js";
import { GIFT_WRAP_FEE_PER_ITEM } from "../config/giftWrap.js";

const defaultCourierLockerFee = new Prisma.Decimal(COURIER_LOCKER_FEE);
const defaultCourierDoorFee = new Prisma.Decimal(COURIER_DOOR_FEE);
const defaultFreeDeliveryThreshold = new Prisma.Decimal(FREE_DELIVERY_THRESHOLD);
const giftWrapFeePerItem = new Prisma.Decimal(GIFT_WRAP_FEE_PER_ITEM);

// Milestone 205: the real, current fee/threshold amounts a caller
// should pass in, sourced from services/deliverySettings.service.ts's
// getDeliverySettings() (the admin-editable DeliverySettings table).
// Optional so every pre-Milestone-205 call site and test that never
// passes a 5th argument keeps reading the config/delivery.ts fallback
// constants above, completely unchanged.
export interface DeliveryRates {
  courierLockerFee: Prisma.Decimal;
  courierDoorFee: Prisma.Decimal;
  freeDeliveryThreshold: Prisma.Decimal;
}

// Version 7, Milestone 168C: three owner-approved fulfilment methods
// and a universal free-delivery threshold (see config/delivery.ts's
// header comment for the full rule).
//
// Version 7, Milestone 180, Part A reintroduced a separate, lower
// threshold for a genuinely authenticated customer; Milestone 205
// removed that distinction again (owner-approved — see the "Website
// Fixes" developer brief, Task 1) — `isRegisteredCustomer` is kept in
// this signature only so every existing call site compiles unchanged,
// but it no longer affects which threshold applies: there is only one
// threshold now, for every customer.
//
// `physicalSubtotal` must be the QUALIFYING subtotal only — physical
// products' line totals, excluding gift wrapping and excluding any
// delivery fee itself (see order.service.ts's createOrder(), which
// derives this from verified DB-priced items, never from client input).
//
// Version 7, Milestone 152B (preserved): `hasPhysicalItems` short-
// circuits straight to a R0 fee — a digital-only order has nothing to
// deliver, regardless of method or subtotal.
export function calculateDeliveryFee(
  method: DeliveryMethodValue,
  physicalSubtotal: Prisma.Decimal,
  hasPhysicalItems = true,
  isRegisteredCustomer = false,
  rates?: DeliveryRates
): Prisma.Decimal {
  void isRegisteredCustomer; // Milestone 205: no longer changes the outcome — see this function's own comment above.
  if (!hasPhysicalItems) return new Prisma.Decimal(0);

  const courierLockerFee = rates?.courierLockerFee ?? defaultCourierLockerFee;
  const courierDoorFee = rates?.courierDoorFee ?? defaultCourierDoorFee;
  const threshold = rates?.freeDeliveryThreshold ?? defaultFreeDeliveryThreshold;
  const qualifiesForFree = physicalSubtotal.gte(threshold);

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
