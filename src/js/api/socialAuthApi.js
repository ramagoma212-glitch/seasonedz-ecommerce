// Social sign-in API client (Version 7, Milestone 171F). Uses the same
// shared customerRequest() wrapper as customerApi.js. Deliberately does
// NOT wrap the OAuth start URLs (getGoogleStartUrl/etc. below) in a
// fetch() call anywhere — starting an OAuth flow must be a real
// top-level browser navigation (setting window.location.href), never
// an XHR/fetch, since only a full page navigation can carry the
// customer through the provider's own login/consent screen and back.

import { customerRequest } from "./customerApiClient.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

// Public — safe to call from a fully logged-out page (the login/
// register forms consult this to decide which "Continue with ..."
// buttons to render at all).
export function getAuthProviders() {
  return customerRequest("/auth/providers", { method: "GET" });
}

// Not a fetch target — pass this straight to a real navigation
// (`window.location.href = url`), optionally with `intent=link` when
// starting the flow from an already-authenticated Account Settings
// page.
export function getOAuthStartUrl(provider, { intent = "login" } = {}) {
  return `${API_BASE_URL}/auth/oauth/${provider}?intent=${encodeURIComponent(intent)}`;
}

export function getConnectedAccounts() {
  return customerRequest("/auth/connected-accounts", { method: "GET" });
}

export function disconnectProvider(provider) {
  return customerRequest(`/auth/connected-accounts/${encodeURIComponent(provider)}`, { method: "DELETE" });
}
