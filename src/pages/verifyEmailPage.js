// Verify email page (Milestone 189) — /account/verify-email. Reads the
// verification token from the query string only (?token=...), same
// "router.js passes parsed URLSearchParams through as `query`"
// convention as resetPasswordPage.js. Unlike that page, there's no form
// here — the token is a bearer credential on its own, so this page
// calls the backend once, on render, and shows whichever result comes
// back. A missing token shows the same safe, generic invalid-link
// message immediately, without calling the backend.

import { verifyCustomerEmail } from "../js/api/customerApi.js";

function renderInvalidLink() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Verify Email</h1>
      <div class="form-banner form-banner--error">This verification link is invalid or has expired.</div>
      <p class="account-form__note"><a href="/account">Go to your account</a></p>
    </section>
  `;
}

function renderVerified() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Verify Email</h1>
      <div class="form-banner form-banner--success">Your email has been verified.</div>
      <p class="account-form__note"><a href="/account">Go to your account</a></p>
    </section>
  `;
}

export async function renderVerifyEmail({ query } = {}) {
  const token = query?.get("token") || "";
  if (!token) return renderInvalidLink();

  try {
    await verifyCustomerEmail(token);
    return renderVerified();
  } catch {
    return renderInvalidLink();
  }
}
