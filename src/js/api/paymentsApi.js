// Backend PayFast payment API calls (Version 3, Milestone 23).
//
// initiatePayfastPayment() only ever asks the backend to prepare a
// payment for an order that already exists — it never builds PayFast
// fields or a signature itself, and never marks anything as paid.
// Validation/business-rule failures come back as the same ApiError
// shape every other src/js/api/*.js call already produces, so callers
// handle them the same way (see js/app.js's checkout flow).
//
// `context` ("checkout" | "retry", Version 5, Milestone 34) tells the
// backend whether this is checkout's own first attempt (allowed while
// the order is still PENDING) or a customer-initiated retry (allowed
// only once the order is FAILED or CANCELLED) — see
// backend/src/services/payfast.service.ts and
// VERSION_5_RETRY_PENDING_RISK_FIX.md. Always pass it explicitly;
// callers are js/payfastRetry.js's submitPayfastForm/retry helpers.

import { apiPost } from "../apiClient.js";

export function initiatePayfastPayment(orderNumber, context) {
  return apiPost("/payments/payfast/initiate", { orderNumber, context });
}
