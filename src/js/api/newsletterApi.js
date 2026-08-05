// Backend newsletter subscription API call, used by the homepage
// "Free Pages and Fresh Updates" form (see
// components/newsletterSignup.js and the submit handler in js/app.js).

import { apiPost } from "../apiClient.js";

export function subscribeToNewsletter(payload) {
  return apiPost("/newsletter/subscribe", payload);
}
