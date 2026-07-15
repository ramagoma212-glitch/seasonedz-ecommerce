// Server-side money helpers. All monetary math uses Prisma's Decimal
// type (never plain JS numbers) to avoid floating-point drift — the
// same type Product.price etc. are already stored and read as.

import { Prisma } from "@prisma/client";

const STANDARD_DELIVERY_FEE = new Prisma.Decimal(80);
const FREE_DELIVERY_THRESHOLD = new Prisma.Decimal(700);

// Flat-rate placeholder delivery fee — same current business rule as
// the frontend's demo cart (src/js/cart.js): R80 standard, free once
// the subtotal reaches R700. Courier API will replace this later with
// real, address-based rates.
export function calculateDeliveryFee(subtotal: Prisma.Decimal): Prisma.Decimal {
  return subtotal.gte(FREE_DELIVERY_THRESHOLD) ? new Prisma.Decimal(0) : STANDARD_DELIVERY_FEE;
}
