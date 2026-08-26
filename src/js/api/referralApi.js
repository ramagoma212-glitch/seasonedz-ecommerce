// Version 7, Milestone 172B.4: the public, unauthenticated referral
// capture/preview API — backend/src/routes/referrals.routes.ts. Never
// sends or receives anything beyond a code and a signed token; no rate,
// no affiliate id, no eligibility flag is ever a request PARAMETER here
// (isValid/discountRatePercent in the response are display-only, never
// sent back to the backend as if they were authoritative).

import { apiGet } from "../apiClient.js";

// Called only at the moment a real ?ref=CODE link is followed
// (js/referral.js's captureReferralFromUrl(), via router.js) — mints a
// FRESH signed capture (a new capturedAt). Never called from the
// checkout page's own preview, which would otherwise silently re-arm
// the customer's attribution window on every checkout visit.
export function captureReferral(code) {
  return apiGet(`/referrals/capture?code=${encodeURIComponent(code)}`);
}

// Verifies an EXISTING stored attribution for display purposes only —
// never mints a new token, never changes what's stored. Used by the
// checkout page to show a live "Referral discount applied" preview.
export function previewReferral({ code, capturedAt, signature }) {
  const params = new URLSearchParams({ code, capturedAt, signature });
  return apiGet(`/referrals/preview?${params.toString()}`);
}
