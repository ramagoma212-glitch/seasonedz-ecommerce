// Shared PayFast form-submission and retry helper (Version 4,
// Milestone 31) — used by checkout's first payment attempt (js/app.js)
// and by the payment-success/cancelled/failed pages' "Try PayFast
// Again" retry option, so the hidden-form-building logic exists in
// exactly one place.
//
// Neither function here marks anything as paid, failed or cancelled —
// they only ever call the existing POST /api/payments/payfast/initiate
// (which itself never marks anything as paid; see
// backend/src/services/payfast.service.ts) and submit exactly the
// fields/signature it returns. The backend's own notify route remains
// the only path that can ever change payment status.

import { initiatePayfastPayment } from "./api/paymentsApi.js";
import { savePendingPayment } from "./pendingPayment.js";

// Builds a plain hidden <form> from the backend's initiate response and
// submits it — a real (non-SPA) navigation to PayFast. Every field,
// including the signature, comes from the backend; nothing here
// generates or alters any of them.
export function submitPayfastForm({ processUrl, method, fields }) {
  const form = document.createElement("form");
  form.method = method || "POST";
  form.action = processUrl;
  form.style.display = "none";

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

// Re-initiates PayFast for an existing order (first attempt or retry —
// the backend itself decides eligibility; see
// PAYFAST_RETRY_ELIGIBLE_STATUSES in payfast.service.ts) and submits
// the resulting form. Throws on failure so callers can show their own
// contextual error message rather than this module deciding for them.
export async function retryPayfastPayment(orderNumber) {
  savePendingPayment({ orderNumber, paymentMethod: "payfast" });
  const response = await initiatePayfastPayment(orderNumber);
  submitPayfastForm(response.data);
}
