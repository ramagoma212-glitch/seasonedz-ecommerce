// Milestone 198, Part 12: /unsubscribe — what a real outreach recipient
// lands on after clicking the unsubscribe link in a campaign email.
// Same "read token from query string, call the backend once, show
// whichever result comes back" shape as verifyEmailPage.js.

import { unsubscribeOutreachContact } from "../js/api/outreachUnsubscribeApi.js";
import { escapeHtml } from "../js/search.js";

function renderInvalidLink() {
  return `
    <section class="container stub-page">
      <h1 class="stub-page__title">Unsubscribe</h1>
      <div class="form-banner form-banner--error">This link is invalid or has expired.</div>
      <p class="account-form__note"><a href="/">Go to homepage</a></p>
    </section>
  `;
}

function renderUnsubscribed(organisationName) {
  return `
    <section class="container stub-page">
      <h1 class="stub-page__title">Unsubscribe</h1>
      <div class="form-banner form-banner--success">You have been unsubscribed${organisationName ? ` — ${escapeHtml(organisationName)}` : ""}. You will not receive any further outreach emails from Seasonedz Group.</div>
      <p class="account-form__note"><a href="/">Go to homepage</a></p>
    </section>
  `;
}

export async function renderUnsubscribePage({ query } = {}) {
  const token = query?.get("token") || "";
  if (!token) return renderInvalidLink();

  try {
    const response = await unsubscribeOutreachContact(token);
    if (!response?.data?.success) return renderInvalidLink();
    return renderUnsubscribed(response.data.organisationName);
  } catch {
    return renderInvalidLink();
  }
}
