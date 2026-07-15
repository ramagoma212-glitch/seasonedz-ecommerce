import { prisma } from "../config/prisma.js";

// Excludes 0/O/1/I so a generated code is unambiguous if ever read
// aloud or transcribed by hand.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Readable, professional-looking order number, e.g. "SG-2026-A1B2".
// Regenerates on a collision against existing orders — cheap insurance
// that's more than enough uniqueness for this milestone's order
// volume (the transaction that actually saves the order still enforces
// Order.orderNumber's database-level uniqueness as the final guard).
export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();

  let orderNumber: string;
  let exists = true;

  do {
    orderNumber = `SG-${year}-${randomCode()}`;
    const existing = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    exists = existing !== null;
  } while (exists);

  return orderNumber;
}
