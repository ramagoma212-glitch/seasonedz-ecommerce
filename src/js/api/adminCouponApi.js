// Milestone 197: admin API client for the coupon-code discount system.
// Same adminRequest() wrapper (admin session cookie, credentials:
// "include") every other admin API client in this codebase already
// uses — nothing new on the transport layer. Every call here hits
// /api/admin/coupons/*, behind requireAdminAuth on the backend (see
// adminCoupon.routes.ts).

import { adminRequest } from "./adminApiClient.js";

export function getAdminCoupons() {
  return adminRequest("/admin/coupons", { method: "GET" });
}

export function getAdminCoupon(id) {
  return adminRequest(`/admin/coupons/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminCoupon(payload) {
  return adminRequest("/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminCoupon(id, payload) {
  return adminRequest(`/admin/coupons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function activateAdminCoupon(id) {
  return adminRequest(`/admin/coupons/${encodeURIComponent(id)}/activate`, { method: "PATCH" });
}

export function deactivateAdminCoupon(id) {
  return adminRequest(`/admin/coupons/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
}

export function deleteAdminCoupon(id) {
  return adminRequest(`/admin/coupons/${encodeURIComponent(id)}`, { method: "DELETE" });
}
