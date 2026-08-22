// "Continue with Google/Facebook/Apple" buttons (Version 7, Milestone
// 171F). Reused on both the login and register panels of accountPage.js
// and, with `intent: "link"`, in the logged-in Connected Accounts
// section. Renders nothing (an empty string) for a provider that isn't
// currently configured — a button is never shown for a provider that
// can't actually complete a sign-in, per the milestone brief's
// "FEATURE AVAILABILITY" requirement. Callers must check
// `providers.google/facebook/apple` (from GET /api/auth/providers, see
// js/api/socialAuthApi.js) before calling this — see accountPage.js.
//
// Each button is a plain <a href> to the backend's OAuth start route
// (getOAuthStartUrl in js/api/socialAuthApi.js) — starting the flow is
// a real top-level navigation, never a fetch/XHR, so clicking it just
// works like any other link (including keyboard Enter, and it's
// impossible to "double submit" a navigation the way a form can be
// double-submitted — the browser is already leaving this page).

import { getOAuthStartUrl } from "../js/api/socialAuthApi.js";

const PROVIDER_META = {
  google: {
    label: "Continue with Google",
    icon: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>`,
    className: "btn--social-google",
  },
  facebook: {
    label: "Continue with Facebook",
    icon: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="9" fill="#1877F2"/><path fill="#fff" d="M12.4 9.4h-2v6.4H8.1V9.4H6.7V7.4h1.4V6.1c0-1.4.8-2.6 2.7-2.6h1.8v2H11.4c-.3 0-.6.2-.6.7v1.2h2z"/></svg>`,
    className: "btn--social-facebook",
  },
  apple: {
    label: "Continue with Apple",
    icon: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.1 9.5c0-1.8 1.5-2.7 1.6-2.8-.9-1.3-2.2-1.4-2.7-1.5-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.7-3.1 1.9-1.3 2.3-.3 5.8.9 7.7.6.9 1.4 2 2.3 1.9.9 0 1.3-.6 2.4-.6s1.5.6 2.5.6c1 0 1.7-1 2.4-1.9.5-.7.8-1.4 1-2.1-1.3-.5-2-1.7-2-2.2zM11.3 3.6c.6-.7 1-1.7.9-2.6-.8.1-1.8.5-2.4 1.2-.5.6-1 1.6-.9 2.5.9.1 1.8-.4 2.4-1.1z"/></svg>`,
    className: "btn--social-apple",
  },
};

function isProviderEnabled(providers, key) {
  return Boolean(providers && providers[key]);
}

// `intent` is "login" (default — the login/register panels) or "link"
// (the Connected Accounts section, only ever rendered while already
// authenticated). `providers` is the { google, facebook, apple }
// booleans object from GET /api/auth/providers.
export function renderSocialAuthButtons(providers, { intent = "login" } = {}) {
  const enabledKeys = Object.keys(PROVIDER_META).filter((key) => isProviderEnabled(providers, key));
  if (!enabledKeys.length) return "";

  const buttons = enabledKeys
    .map((key) => {
      const meta = PROVIDER_META[key];
      const href = getOAuthStartUrl(key, { intent });
      return `
        <a
          class="btn btn--social ${meta.className} btn--block"
          href="${href}"
          data-social-auth-button="${key}"
        >
          <span class="btn--social__icon">${meta.icon}</span>
          <span>${meta.label}</span>
        </a>
      `;
    })
    .join("");

  return `
    <div class="social-auth-buttons" data-social-auth-buttons>
      ${buttons}
    </div>
    ${intent === "login" ? '<div class="social-auth-divider"><span>OR</span></div>' : ""}
  `;
}

export const SOCIAL_AUTH_PROVIDER_LABELS = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
};
