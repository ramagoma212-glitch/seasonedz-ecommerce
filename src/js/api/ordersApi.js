// Backend Order API calls. Building the request body is intentionally
// simple: only productSlug/quantity ever go in for items, and no
// price/subtotal/deliveryFee/total is ever sent — the backend
// recalculates all of that itself from real database prices, and
// trusting a client-supplied amount would defeat the point.

import { apiGet, apiPost } from "../apiClient.js";
import { mapPaymentMethodToBackend } from "./mappers.js";

export function buildOrderPayload({ customer, deliveryAddress, deliveryNotes, paymentMethod, items }) {
  return {
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    },
    deliveryAddress: {
      streetAddress: deliveryAddress.street,
      suburb: deliveryAddress.suburb,
      city: deliveryAddress.city,
      province: deliveryAddress.province,
      postalCode: deliveryAddress.postalCode,
      country: "South Africa",
      deliveryNotes: deliveryNotes || undefined,
    },
    paymentMethod: mapPaymentMethodToBackend(paymentMethod),
    items: items.map((item) => ({ productSlug: item.slug, quantity: item.quantity })),
  };
}

export function createOrder(payload) {
  return apiPost("/orders", payload);
}

export function getOrderByNumber(orderNumber) {
  return apiGet(`/orders/${encodeURIComponent(orderNumber)}`);
}

export function getOrderTracking(orderNumber) {
  return apiGet(`/orders/${encodeURIComponent(orderNumber)}/tracking`);
}
