// Backend PayFast payment API calls (Version 3, Milestone 23).
//
// initiatePayfastPayment() only ever asks the backend to prepare a
// payment for an order that already exists — it never builds PayFast
// fields or a signature itself, and never marks anything as paid.
// Validation/business-rule failures come back as the same ApiError
// shape every other src/js/api/*.js call already produces, so callers
// handle them the same way (see js/app.js's checkout flow).

import { apiPost } from "../apiClient.js";

export function initiatePayfastPayment(orderNumber) {
  return apiPost("/payments/payfast/initiate", { orderNumber });
}
