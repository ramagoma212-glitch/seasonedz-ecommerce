// Cookie consent banner + preferences modal markup (Version 7,
// Milestone 171H). Pure presentation — no DOM manipulation or storage
// access here, matching this project's own established split (see
// js/app.js, which owns all the event wiring for both pieces). No
// "Preferences" toggle is rendered — see js/consent.js's own header
// comment on why: audited, nothing genuinely optional exists in this
// codebase to disable yet.

const BANNER_COPY =
  "We use necessary cookies and similar technologies to keep Seasonedz Group working securely. With your permission, we may also use optional cookies to improve your experience. You can accept, reject non-essential cookies, or manage your preferences.";

export function renderCookieConsentBanner() {
  return `
    <div class="cookie-consent-banner" data-cookie-consent-banner role="region" aria-label="Cookie consent">
      <div class="cookie-consent-banner__inner">
        <p class="cookie-consent-banner__copy">${BANNER_COPY}</p>
        <div class="cookie-consent-banner__actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="cookie-reject">Reject Non-essential</button>
          <button type="button" class="btn btn--secondary btn--sm" data-action="cookie-manage">Manage Preferences</button>
          <button type="button" class="btn btn--primary btn--sm" data-action="cookie-accept">Accept All</button>
        </div>
      </div>
    </div>
  `;
}

function renderToggleRow({ id, label, description, checked, locked }) {
  return `
    <div class="cookie-category">
      <div class="cookie-category__header">
        <label class="cookie-category__label" for="${id}">${label}</label>
        ${
          locked
            ? '<span class="cookie-category__always-active">Always Active</span>'
            : `<span class="cookie-toggle">
                <input type="checkbox" id="${id}" class="cookie-toggle__input" data-cookie-toggle ${checked ? "checked" : ""} />
                <span class="cookie-toggle__track" aria-hidden="true"></span>
              </span>`
        }
      </div>
      <p class="cookie-category__description">${description}</p>
    </div>
  `;
}

export function renderCookiePreferencesModal(consent) {
  return `
    <div class="cookie-preferences-overlay" data-cookie-preferences-overlay>
      <div
        class="cookie-preferences-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-preferences-title"
        data-cookie-preferences-modal
      >
        <div class="cookie-preferences-modal__header">
          <h2 id="cookie-preferences-title">Cookie Preferences</h2>
          <button type="button" class="cookie-preferences-modal__close" data-action="cookie-close-preferences" aria-label="Close cookie preferences">&times;</button>
        </div>

        <p class="cookie-preferences-modal__intro">
          Choose which optional cookies and similar technologies Seasonedz Group may use. Strictly necessary items keep the site working securely and can't be switched off.
        </p>

        <div class="cookie-preferences-modal__categories">
          ${renderToggleRow({
            id: "cookie-category-necessary",
            label: "Strictly Necessary",
            description: "Keeps you signed in, remembers your cart and wishlist, and protects checkout and login. Required for the site to work. Cannot be disabled.",
            locked: true,
          })}
          ${renderToggleRow({
            id: "cookie-category-analytics",
            label: "Analytics",
            // Milestone 183: Google Analytics 4 is now the real,
            // optional script this toggle gates (see js/analytics.js)
            // — worded to stay accurate whether or not a Measurement
            // ID has actually been configured yet (Part T), rather
            // than the old "Not currently in use" claim, which would
            // otherwise go stale the moment GA4 goes live.
            description: "Helps us understand how the site is used (via Google Analytics), so we can improve it. Off by default until you say otherwise.",
            checked: consent.analytics,
          })}
          ${renderToggleRow({
            id: "cookie-category-marketing",
            label: "Marketing",
            description: "Would support advertising or remarketing. Not currently in use on this site. Off by default until you say otherwise.",
            checked: consent.marketing,
          })}
        </div>

        <div class="cookie-preferences-modal__actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="cookie-reject">Reject Non-essential</button>
          <button type="button" class="btn btn--secondary btn--sm" data-action="cookie-save">Save Preferences</button>
          <button type="button" class="btn btn--primary btn--sm" data-action="cookie-accept">Accept All</button>
        </div>
      </div>
    </div>
  `;
}
