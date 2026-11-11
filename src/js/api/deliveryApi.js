// Milestone 205: public, read-only delivery fee/threshold settings —
// used by the cart (free-delivery progress bar) and product pages
// (per-product delivery line) to show the REAL, currently-configured
// fee amounts, never a hardcoded figure that could silently drift from
// what the admin actually set in Delivery Settings. Mirrors
// preorderApi.js's getPublicPreorderSettings() exactly.

import { apiGet } from "../apiClient.js";

export function getPublicDeliverySettings() {
  return apiGet("/delivery/settings");
}
