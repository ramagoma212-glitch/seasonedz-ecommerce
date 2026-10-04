// Milestone 201: money handling for B2B quotations. Amounts are parsed
// straight into integer cents and all arithmetic happens on integers, so
// no floating-point rounding can ever creep into a quotation total.

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const MAX_WHOLE_RAND_DIGITS = 8;
const DECIMAL_PATTERN = new RegExp(`^\\d{1,${MAX_WHOLE_RAND_DIGITS}}(\\.\\d{1,2})?$`);

export function parseMoneyToCents(input: unknown, fieldLabel: string): number {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new MoneyError(`${fieldLabel} must be a positive amount.`);
    text = input.toFixed(2);
    if (Number(text) !== input) throw new MoneyError(`${fieldLabel} can have at most two decimal places.`);
  } else if (typeof input === "string") {
    text = input.trim();
  } else {
    throw new MoneyError(`${fieldLabel} is required.`);
  }

  if (!DECIMAL_PATTERN.test(text)) {
    throw new MoneyError(`${fieldLabel} must be an amount such as 120 or 120.50.`);
  }

  const [wholePart, fractionPart = ""] = text.split(".");
  return Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));
}

export function assertCentsIsSafeInteger(cents: number, fieldLabel: string): void {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new MoneyError(`${fieldLabel} is out of range.`);
  }
}

// Decimal(10,2) string form for Prisma writes, e.g. 1234 -> "12.34".
export function centsToDecimalString(cents: number): string {
  assertCentsIsSafeInteger(cents, "Amount");
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// Display form for PDFs and emails: "R1,234.50". ASCII only, so the
// PDF's standard fonts can always render it.
export function formatRand(cents: number): string {
  assertCentsIsSafeInteger(cents, "Amount");
  const whole = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R${whole}.${String(cents % 100).padStart(2, "0")}`;
}
