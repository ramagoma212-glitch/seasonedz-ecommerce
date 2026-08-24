// Version 7, Milestone 172B: admin affiliate-product management API
// client. Same shape as adminDashboardApi.js's product functions —
// reuses the existing, already-live adminRequest() wrapper (admin
// session cookie, credentials: "include"), nothing new on the
// transport layer. Every call here hits /api/admin/affiliate/*, fully
// separate from /api/admin/products above it.
//
// No public affiliate API client exists yet, and none should be added
// here — the public read API and /go/:trackingSlug are Milestone 172C.

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.isActive !== undefined && params.isActive !== "") query.set("isActive", params.isActive);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminAffiliateProducts(params = {}) {
  return adminRequest(`/admin/affiliate/products${buildQuery(params)}`, { method: "GET" });
}

export function getAdminAffiliateProduct(id) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminAffiliateProduct(payload) {
  return adminRequest("/admin/affiliate/products", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminAffiliateProduct(id, payload) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function activateAdminAffiliateProduct(id) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}/activate`, { method: "PATCH" });
}

export function deactivateAdminAffiliateProduct(id) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
}

export function featureAdminAffiliateProduct(id) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}/feature`, { method: "PATCH" });
}

export function unfeatureAdminAffiliateProduct(id) {
  return adminRequest(`/admin/affiliate/products/${encodeURIComponent(id)}/unfeature`, { method: "PATCH" });
}
