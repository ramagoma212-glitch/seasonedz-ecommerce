// Server-side money helpers. All monetary math uses Prisma's Decimal
// type (never plain JS numbers) to avoid floating-point drift — the
// same type Product.price etc. are already stored and read as.

import { Prisma } from "@prisma/client";
import { STANDARD_DELIVERY_FEE, REGISTERED_FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";

const standardDeliveryFee = new Prisma.Decimal(STANDARD_DELIVERY_FEE);
const registeredFreeDeliveryThreshold = new Prisma.Decimal(REGISTERED_FREE_DELIVERY_THRESHOLD);

// Version 7, Milestone 131: free delivery is now a registered-account
// benefit, not a flat subtotal threshold for everyone — see
// config/delivery.ts's own header comment for the full rule.
// `isRegisteredCustomer` must always come from the caller's own
// verified session lookup (order.service.ts's createOrder(), sourced
// from req.customerUser.type via optionalCustomerAuth) — never from
// anything a request body claims. Courier API will replace this
// later with real, address-based rates.
export function calculateDeliveryFee(subtotal: Prisma.Decimal, isRegisteredCustomer: boolean): Prisma.Decimal {
  return isRegisteredCustomer && subtotal.gte(registeredFreeDeliveryThreshold) ? new Prisma.Decimal(0) : standardDeliveryFee;
}
