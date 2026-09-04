// Backend Order API calls. Building the request body is intentionally
// simple: only productSlug/quantity/giftWrap/giftMessage ever go in for
// items, and no price/subtotal/deliveryFee/giftWrapTotal/total is ever
// sent — the backend recalculates all of that itself from real database
// prices and its own authoritative R30/wrapped-item rule, and trusting
// a client-supplied amount (gift-wrap fee included — see
// order.service.ts's verifyItems()) would defeat the point.

import { apiGet, apiPost } from "../apiClient.js";
import { mapPaymentMethodToBackend } from "./mappers.js";
import { getStoredReferralAttribution } from "../referral.js";

// Version 7, Milestone 168C.1: `deliveryMethod` is required.
// `deliveryAddress` is sent for COURIER_DOOR (full: street/suburb/
// city/province/postalCode) and COURIER_LOCKER (partial: city/province
// only — caller passes an object with just those two keys; the other
// fields are simply absent here and JSON.stringify drops them, rather
// than sending empty strings that would misleadingly imply a real
// street address was collected). Omitted entirely for COLLECTION,
// which has no physical address at all. `collectionCity` is only sent
// for COLLECTION. Still no price/fee/total field is ever sent — the
// backend independently recomputes and validates every fee itself,
// exactly as before.
export function buildOrderPayload({ customer, deliveryMethod, deliveryAddress, collectionCity, deliveryNotes, paymentMethod, items }) {
  const requiresAddress = deliveryMethod === "COURIER_LOCKER" || deliveryMethod === "COURIER_DOOR";
  const referralAttribution = getStoredReferralAttribution();

  return {
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    },
    deliveryMethod,
    ...(requiresAddress
      ? {
          deliveryAddress: {
            streetAddress: deliveryAddress.street,
            suburb: deliveryAddress.suburb,
            city: deliveryAddress.city,
            province: deliveryAddress.province,
            postalCode: deliveryAddress.postalCode,
            country: "South Africa",
            deliveryNotes: deliveryNotes || undefined,
          },
        }
      : {}),
    ...(deliveryMethod === "COLLECTION" ? { collectionCity } : {}),
    paymentMethod: mapPaymentMethodToBackend(paymentMethod),
    items: items.map((item) => ({
      productSlug: item.slug,
      quantity: item.quantity,
      giftWrap: Boolean(item.giftWrap),
      giftMessage: item.giftWrap ? item.giftMessage || null : null,
    })),
    // Version 7, Milestone 172B.4: the referral programme's ONLY input
    // from this frontend — the exact {code, capturedAt, signature}
    // object the backend itself issued at capture time (js/referral.js),
    // never anything the checkout form lets a customer type or that
    // this file computes. Omitted entirely (not even sent as null) when
    // nothing is stored, so an order placed with no referral looks
    // exactly like it did before this milestone.
    ...(referralAttribution ? { referralAttribution } : {}),
  };
}

// Version 7, Milestone 129: credentials: "include" so a logged-in
// customer's customer_session cookie reaches the backend — the backend
// only ever reads it via optionalCustomerAuth, which never requires it
// and never blocks a guest checkout either way.
export function createOrder(payload) {
  return apiPost("/orders", payload, { credentials: "include" });
}

export function getOrderByNumber(orderNumber) {
  return apiGet(`/orders/${encodeURIComponent(orderNumber)}`);
}

export function getOrderTracking(orderNumber) {
  return apiGet(`/orders/${encodeURIComponent(orderNumber)}/tracking`);
}

// Milestone 181, Part L: a non-binding preview of the first-registered-
// customer preorder discount, shown on the cart/checkout order summary
// before submission — same credentials:"include" discipline as
// createOrder() above, since the preview must see the logged-in
// customer's own session to check "has this customer already used the
// benefit". Read-only: never reserves anything, safe to call on every
// page render.
export function previewPreorderDiscount(items) {
  return apiPost(
    "/orders/preorder-discount-preview",
    { items: items.map((item) => ({ productSlug: item.slug, quantity: item.quantity })) },
    { credentials: "include" }
  );
}
