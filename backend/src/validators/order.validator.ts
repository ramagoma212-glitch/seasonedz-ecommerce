// Pure request-shape validation for POST /api/orders. Deliberately
// only reads the fields it knows about (customer.*, deliveryAddress.*,
// paymentMethod, items[].productSlug/quantity) — anything else in the
// body (price, subtotal, total, etc.) is simply never read, which is
// how a client-supplied price gets ignored rather than trusted. Product
// existence/status/stock/price are NOT checked here — that's
// order.service.ts, since it needs the database.

import { PaymentMethod } from "@prisma/client";
import {
  asRecord,
  isNonEmptyString,
  isValidEmail,
  isValidPostalCode,
  isValidSAPhone,
  SA_PROVINCES,
  type ValidationErrorDetail,
} from "./shared.js";

export type { ValidationErrorDetail } from "./shared.js";

const PAYMENT_METHOD_VALUES: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.PAYFAST,
  PaymentMethod.CASH_ON_DELIVERY,
  PaymentMethod.MANUAL,
];

export interface ValidatedOrderItem {
  productSlug: string;
  quantity: number;
}

export interface ValidatedOrderInput {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  deliveryAddress: {
    streetAddress: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    deliveryNotes: string | null;
  };
  paymentMethod: PaymentMethod;
  items: ValidatedOrderItem[];
}

export interface OrderValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  value: ValidatedOrderInput | null;
}

export function validateOrderRequest(body: unknown): OrderValidationResult {
  const errors: ValidationErrorDetail[] = [];
  const root = asRecord(body);
  const customer = asRecord(root.customer);
  const deliveryAddress = asRecord(root.deliveryAddress);

  if (!isNonEmptyString(customer.firstName)) {
    errors.push({ field: "customer.firstName", message: "First name is required." });
  }
  if (!isNonEmptyString(customer.lastName)) {
    errors.push({ field: "customer.lastName", message: "Last name is required." });
  }

  if (!isNonEmptyString(customer.email)) {
    errors.push({ field: "customer.email", message: "Email address is required." });
  } else if (!isValidEmail(customer.email)) {
    errors.push({ field: "customer.email", message: "Please provide a valid email address." });
  }

  if (!isNonEmptyString(customer.phone)) {
    errors.push({ field: "customer.phone", message: "Phone number is required." });
  } else if (!isValidSAPhone(customer.phone)) {
    errors.push({ field: "customer.phone", message: "Please provide a valid South African phone number, e.g. 082 123 4567." });
  }

  if (!isNonEmptyString(deliveryAddress.streetAddress)) {
    errors.push({ field: "deliveryAddress.streetAddress", message: "Street address is required." });
  }
  if (!isNonEmptyString(deliveryAddress.suburb)) {
    errors.push({ field: "deliveryAddress.suburb", message: "Suburb is required." });
  }
  if (!isNonEmptyString(deliveryAddress.city)) {
    errors.push({ field: "deliveryAddress.city", message: "City is required." });
  }

  if (!isNonEmptyString(deliveryAddress.province)) {
    errors.push({ field: "deliveryAddress.province", message: "Province is required." });
  } else if (!(SA_PROVINCES as readonly string[]).includes(deliveryAddress.province)) {
    errors.push({ field: "deliveryAddress.province", message: `Province must be one of: ${SA_PROVINCES.join(", ")}.` });
  }

  if (!isNonEmptyString(deliveryAddress.postalCode)) {
    errors.push({ field: "deliveryAddress.postalCode", message: "Postal code is required." });
  } else if (!isValidPostalCode(deliveryAddress.postalCode)) {
    errors.push({ field: "deliveryAddress.postalCode", message: "Postal code must be 4 digits." });
  }

  if (!isNonEmptyString(root.paymentMethod)) {
    errors.push({ field: "paymentMethod", message: "Payment method is required." });
  } else if (!(PAYMENT_METHOD_VALUES as string[]).includes(root.paymentMethod)) {
    errors.push({ field: "paymentMethod", message: `Payment method must be one of: ${PAYMENT_METHOD_VALUES.join(", ")}.` });
  }

  const rawItems = Array.isArray(root.items) ? root.items : null;
  const validatedItems: ValidatedOrderItem[] = [];

  if (!rawItems || rawItems.length === 0) {
    errors.push({ field: "items", message: "At least one order item is required." });
  } else {
    rawItems.forEach((rawItem, index) => {
      const item = asRecord(rawItem);
      const hasValidSlug = isNonEmptyString(item.productSlug);

      if (!hasValidSlug) {
        errors.push({ field: `items[${index}].productSlug`, message: "Product slug is required." });
      }

      const quantity = item.quantity;
      const isValidQuantity = typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
      if (!isValidQuantity) {
        errors.push({ field: `items[${index}].quantity`, message: "Quantity must be a whole number between 1 and 99." });
      }

      if (hasValidSlug && isValidQuantity) {
        validatedItems.push({ productSlug: item.productSlug as string, quantity: quantity as number });
      }
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors, value: null };
  }

  return {
    isValid: true,
    errors: [],
    value: {
      customer: {
        firstName: (customer.firstName as string).trim(),
        lastName: (customer.lastName as string).trim(),
        email: (customer.email as string).trim(),
        phone: (customer.phone as string).trim(),
      },
      deliveryAddress: {
        streetAddress: (deliveryAddress.streetAddress as string).trim(),
        suburb: (deliveryAddress.suburb as string).trim(),
        city: (deliveryAddress.city as string).trim(),
        province: deliveryAddress.province as string,
        postalCode: (deliveryAddress.postalCode as string).trim(),
        country: isNonEmptyString(deliveryAddress.country) ? deliveryAddress.country.trim() : "South Africa",
        deliveryNotes: isNonEmptyString(deliveryAddress.deliveryNotes) ? deliveryAddress.deliveryNotes.trim() : null,
      },
      paymentMethod: root.paymentMethod as PaymentMethod,
      items: validatedItems,
    },
  };
}
