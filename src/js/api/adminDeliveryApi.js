// Milestone 205: admin API client for delivery settings. Reuses the
// existing adminRequest() wrapper (admin session cookie, credentials:
// "include") — nothing new on the transport layer. Mirrors
// adminReferralsApi.js's getReferralSettings()/updateReferralSettings()
// exactly.

import { adminRequest } from "./adminApiClient.js";

export function getAdminDeliverySettings() {
  return adminRequest("/admin/delivery-settings", { method: "GET" });
}

export function updateAdminDeliverySettings(payload) {
  return adminRequest("/admin/delivery-settings", { method: "PATCH", body: JSON.stringify(payload) });
}
