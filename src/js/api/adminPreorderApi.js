// Milestone 181, Part D: admin API client for the store-wide preorder
// programme settings (the first-registered-customer discount rate).
// Reuses the existing adminRequest() wrapper, same as every other
// admin API client — nothing new on the transport layer. PATCH is
// backend-enforced ADMIN-only (see adminPreorder.routes.ts) — a STAFF
// member calling it gets a clear 403, surfaced by the page itself
// rather than hidden here.

import { adminRequest } from "./adminApiClient.js";

export function getPreorderSettings() {
  return adminRequest("/admin/preorder/settings", { method: "GET" });
}

export function updatePreorderSettings(payload) {
  return adminRequest("/admin/preorder/settings", { method: "PATCH", body: JSON.stringify(payload) });
}
