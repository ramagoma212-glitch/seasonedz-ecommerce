// Version 7, Milestone 152: guest secure-token digital download page —
// /download/:token. Reached only via the one-time link emailed after a
// guest (not logged in) order's PayFast payment is confirmed PAID (see
// backend/src/services/payfast.service.ts). The token itself is the
// only credential — this page never accepts or displays an order
// number as a way to prove access (see digitalDownload.service.ts's
// own "never use order number alone as permission" discipline).

import { getGuestDownloads } from "../js/api/guestDownloadApi.js";
import { ApiError } from "../js/apiClient.js";
import { renderDigitalDownloadsCard } from "../components/digitalDownloadsCard.js";

function renderInvalidOrExpired() {
  return `
    <div class="form-banner form-banner--error">
      This download link is invalid or has expired. Please check your payment confirmation email for the correct link,
      or contact us if you need help.
    </div>
    <div class="order-confirmation__actions">
      <a class="btn btn--secondary" href="/contact">Contact Us</a>
    </div>
  `;
}

function renderBackendUnavailable() {
  return `
    <div class="form-banner form-banner--error">
      We could not connect to the download system right now. Please try again shortly.
    </div>
  `;
}

export async function renderGuestDownloadPage({ token: rawToken } = {}) {
  const token = rawToken || "";
  let body;

  try {
    const response = await getGuestDownloads(token);
    const items = response?.data?.items || [];

    body =
      items.length > 0
        ? renderDigitalDownloadsCard(items, { guestToken: token })
        : `
          <div class="form-banner form-banner--error">
            No downloads are available for this link right now. This can happen if the link has expired, the
            order isn't paid yet, or there are no digital items on this order.
          </div>
        `;
  } catch (error) {
    if (error instanceof ApiError) {
      body = renderInvalidOrExpired();
    } else {
      body = renderBackendUnavailable();
    }
  }

  return `
    <section class="stub-page container track-order-page">
      <h1 class="stub-page__title">Your Digital Downloads</h1>
      <div class="track-order-page__body">${body}</div>
    </section>
  `;
}
