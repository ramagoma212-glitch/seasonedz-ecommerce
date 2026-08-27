// Show/hide toggle for every genuine password field on the site
// (Version 7, Milestone 176). One inline SVG icon pair (no icon-font or
// third-party icon dependency, no emoji) and one delegated click handler
// wired once in app.js's mountApp(), so every password field across every
// page (customer login/register/reset, admin login) gets the same
// accessible behavior without duplicating markup or logic per page.
//
// Frontend display behavior only: this never touches the input's value,
// never submits the form, and the visibility state is never persisted
// anywhere (not localStorage, not sessionStorage) — it simply resets to
// hidden the next time the field is rendered, same as any other input.

const EYE_ICON = `
  <svg class="password-toggle__icon password-toggle__icon--show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const EYE_OFF_ICON = `
  <svg class="password-toggle__icon password-toggle__icon--hide" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.68 3.68"></path>
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
`;

// `inputId` must match the password input's own `id` — the button is
// wired purely through data-target, never a nested-input assumption, so
// it keeps working regardless of where in the DOM the input itself sits.
export function renderPasswordToggleButton(inputId) {
  return `
    <button
      type="button"
      class="password-toggle"
      data-action="toggle-password-visibility"
      data-target="${inputId}"
      aria-label="Show password"
      aria-controls="${inputId}"
    >${EYE_ICON}${EYE_OFF_ICON}</button>
  `;
}

// Delegated on document (like setupProductActions()/setupNavMoreMenu()
// elsewhere in app.js) since #main-content is replaced on every route
// change — a per-render listener would need constant re-binding.
export function setupPasswordVisibilityToggles() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="toggle-password-visibility"]');
    if (!button) return;

    const input = document.getElementById(button.dataset.target);
    if (!input) return;

    const isCurrentlyHidden = input.type === "password";
    input.type = isCurrentlyHidden ? "text" : "password";
    button.setAttribute("aria-label", isCurrentlyHidden ? "Hide password" : "Show password");

    const showIcon = button.querySelector(".password-toggle__icon--show");
    const hideIcon = button.querySelector(".password-toggle__icon--hide");
    if (showIcon) showIcon.hidden = isCurrentlyHidden;
    if (hideIcon) hideIcon.hidden = !isCurrentlyHidden;
  });
}
