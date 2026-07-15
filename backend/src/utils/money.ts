// Server-side money helpers. All monetary math uses Prisma's Decimal
// type (never plain JS numbers) to avoid floating-point drift — the
// same type Product.price etc. are already stored and read as.

import { Prisma } from "@prisma/client";
import { STANDARD_DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";

const standardDeliveryFee = new Prisma.Decimal(STANDARD_DELIVERY_FEE);
const freeDeliveryThreshold = new Prisma.Decimal(FREE_DELIVERY_THRESHOLD);

// Flat-rate placeholder delivery fee — same current business rule as
// the frontend's demo cart (src/js/cart.js): R80 standard, free once
// the subtotal reaches R700 (see config/delivery.ts for the single
// source of truth on these numbers). Courier API will replace this
// later with real, address-based rates.
export function calculateDeliveryFee(subtotal: Prisma.Decimal): Prisma.Decimal {
  return subtotal.gte(freeDeliveryThreshold) ? new Prisma.Decimal(0) : standardDeliveryFee;
}
