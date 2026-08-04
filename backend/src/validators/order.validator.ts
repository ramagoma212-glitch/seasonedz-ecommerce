// Pure request-shape validation for POST /api/orders. Deliberately
// only reads the fields it knows about (customer.*, deliveryAddress.*,
// paymentMethod, items[].productSlug/quantity) — anything else in the
// body (price, subtotal, total, etc.) is simply never read, which is
// how a client-supplied price gets ignored rather than trusted. Product
// existence/status/stock/price are NOT checked here — that's
// order.service.ts, since it needs the database.

import { PaymentMethod } from "@prisma/client";
import { env } from "../config/env.js";
import { GIFT_MESSAGE_MAX_LENGTH } from "../config/giftWrap.js";
import { DELIVERY_METHODS, COLLECTION_CITIES, type DeliveryMethodValue, type CollectionCityValue } from "../config/delivery.js";
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
  // Version 7, Milestone 159: only ever what the customer *asked for* —
  // never trusted as "this is eligible" or "this is what to charge".
  // order.service.ts's verifyItems() re-derives eligibility from the
  // real product's productType and computes the authoritative fee
  // itself; this validator's only job is confirming the shape/length
  // of what was sent, same as it already does for productSlug/quantity.
  giftWrap: boolean;
  giftMessage: string | null;
}

export interface ValidatedOrderInput {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  deliveryMethod: DeliveryMethodValue;
  // Version 7, Milestone 168C.1: no real Courier Guy locker-picker
  // exists yet, so COURIER_LOCKER never collects (or implies) a
  // precise delivery address — only city/province, enough for staff to
  // arrange the nearest locker manually. streetAddress/suburb/
  // postalCode are only ever populated for COURIER_DOOR, which is the
  // only method that genuinely delivers to a written address. Null
  // entirely for COLLECTION (see collectionCity below instead).
  deliveryAddress: {
    streetAddress: string | null;
    suburb: string | null;
    city: string;
    province: string;
    postalCode: string | null;
    country: string;
    deliveryNotes: string | null;
  } | null;
  // Only present for COLLECTION — "Pretoria" or "Thohoyandou".
  collectionCity: CollectionCityValue | null;
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

  // Version 7, Milestone 168C: which delivery method decides whether an
  // address or a collection city is required below. Validated first so
  // the rest of this function can branch on a known-good value.
  let deliveryMethod: DeliveryMethodValue | null = null;
  if (!isNonEmptyString(root.deliveryMethod)) {
    errors.push({ field: "deliveryMethod", message: "Delivery method is required." });
  } else if (!(DELIVERY_METHODS as readonly string[]).includes(root.deliveryMethod)) {
    errors.push({ field: "deliveryMethod", message: `Delivery method must be one of: ${DELIVERY_METHODS.join(", ")}.` });
  } else {
    deliveryMethod = root.deliveryMethod as DeliveryMethodValue;
  }

  // Version 7, Milestone 168C.1: COURIER_DOOR delivers to a written
  // address, so it needs the full set. COURIER_LOCKER has no real
  // per-locker picker yet — it only needs city/province, enough for
  // staff to manually arrange the nearest locker — collecting a full
  // street address would misleadingly imply it's the delivery
  // destination when it isn't. COLLECTION needs neither (see
  // collectionCity below instead).
  const requiresFullAddress = deliveryMethod === "COURIER_DOOR";
  const requiresAreaOnly = deliveryMethod === "COURIER_LOCKER";
  const requiresAddressFields = requiresFullAddress || requiresAreaOnly;
  const requiresCollectionCity = deliveryMethod === "COLLECTION";

  if (requiresAddressFields) {
    if (!isNonEmptyString(deliveryAddress.city)) {
      errors.push({ field: "deliveryAddress.city", message: "City is required." });
    }

    if (!isNonEmptyString(deliveryAddress.province)) {
      errors.push({ field: "deliveryAddress.province", message: "Province is required." });
    } else if (!(SA_PROVINCES as readonly string[]).includes(deliveryAddress.province)) {
      errors.push({ field: "deliveryAddress.province", message: `Province must be one of: ${SA_PROVINCES.join(", ")}.` });
    }
  }

  if (requiresFullAddress) {
    if (!isNonEmptyString(deliveryAddress.streetAddress)) {
      errors.push({ field: "deliveryAddress.streetAddress", message: "Street address is required." });
    }
    if (!isNonEmptyString(deliveryAddress.suburb)) {
      errors.push({ field: "deliveryAddress.suburb", message: "Suburb is required." });
    }
    if (!isNonEmptyString(deliveryAddress.postalCode)) {
      errors.push({ field: "deliveryAddress.postalCode", message: "Postal code is required." });
    } else if (!isValidPostalCode(deliveryAddress.postalCode)) {
      errors.push({ field: "deliveryAddress.postalCode", message: "Postal code must be 4 digits." });
    }
  }

  let collectionCity: CollectionCityValue | null = null;
  if (requiresCollectionCity) {
    if (!isNonEmptyString(root.collectionCity)) {
      errors.push({ field: "collectionCity", message: "Please choose a collection location." });
    } else if (!(COLLECTION_CITIES as readonly string[]).includes(root.collectionCity)) {
      errors.push({ field: "collectionCity", message: `Collection location must be one of: ${COLLECTION_CITIES.join(", ")}.` });
    } else {
      collectionCity = root.collectionCity as CollectionCityValue;
    }
  }

  if (!isNonEmptyString(root.paymentMethod)) {
    errors.push({ field: "paymentMethod", message: "Payment method is required." });
  } else if (!(PAYMENT_METHOD_VALUES as string[]).includes(root.paymentMethod)) {
    errors.push({ field: "paymentMethod", message: `Payment method must be one of: ${PAYMENT_METHOD_VALUES.join(", ")}.` });
  } else if (root.paymentMethod === PaymentMethod.PAYFAST && !env.payfastEnabled) {
    // Milestone 20 safety fix: PAYFAST is a valid enum value (ready for
    // when real PayFast integration exists), but until payment
    // initiation and ITN verification are actually built, a raw API
    // call must not be able to create an order that can never be
    // resolved. The frontend already disables this option in the UI
    // (src/js/orders.js); this closes the same gap at the API level.
    errors.push({ field: "paymentMethod", message: "PayFast payments are not available yet. Please choose another payment method." });
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

      // Version 7, Milestone 159: giftWrap must be a real boolean —
      // anything else (missing, a string, a number) is treated as
      // false rather than erroring the whole order, matching this
      // file's existing "unknown extra fields are just never read"
      // discipline. giftMessage is optional even when giftWrap is
      // true (Task: "must never require a message to purchase gift
      // wrapping") — only validated for shape/length when present.
      const giftWrap = item.giftWrap === true;
      let giftMessage: string | null = null;
      let giftMessageValid = true;
      if (item.giftMessage !== undefined && item.giftMessage !== null) {
        if (typeof item.giftMessage !== "string") {
          errors.push({ field: `items[${index}].giftMessage`, message: "Gift message must be text." });
          giftMessageValid = false;
        } else {
          const trimmed = item.giftMessage.trim();
          if (trimmed.length > GIFT_MESSAGE_MAX_LENGTH) {
            errors.push({ field: `items[${index}].giftMessage`, message: `Gift message must be ${GIFT_MESSAGE_MAX_LENGTH} characters or fewer.` });
            giftMessageValid = false;
          } else {
            // Empty/whitespace-only stored as null, not an empty
            // string — same "no meaningless content" convention
            // adminOrderStatus.service.ts's own note field already
            // uses.
            giftMessage = trimmed.length > 0 ? trimmed : null;
          }
        }
      }

      if (hasValidSlug && isValidQuantity && giftMessageValid) {
        validatedItems.push({
          productSlug: item.productSlug as string,
          quantity: quantity as number,
          giftWrap,
          // A message never survives on an unwrapped line — matches
          // the brief's own "no gift wrapping unless chosen and paid
          // for" rule at the data layer too, not just pricing.
          giftMessage: giftWrap ? giftMessage : null,
        });
      }
    });
  }

  if (errors.length > 0 || !deliveryMethod) {
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
      deliveryMethod,
      deliveryAddress: requiresAddressFields
        ? {
            streetAddress: requiresFullAddress ? (deliveryAddress.streetAddress as string).trim() : null,
            suburb: requiresFullAddress ? (deliveryAddress.suburb as string).trim() : null,
            city: (deliveryAddress.city as string).trim(),
            province: deliveryAddress.province as string,
            postalCode: requiresFullAddress ? (deliveryAddress.postalCode as string).trim() : null,
            country: isNonEmptyString(deliveryAddress.country) ? deliveryAddress.country.trim() : "South Africa",
            deliveryNotes: isNonEmptyString(deliveryAddress.deliveryNotes) ? deliveryAddress.deliveryNotes.trim() : null,
          }
        : null,
      collectionCity,
      paymentMethod: root.paymentMethod as PaymentMethod,
      items: validatedItems,
    },
  };
}
