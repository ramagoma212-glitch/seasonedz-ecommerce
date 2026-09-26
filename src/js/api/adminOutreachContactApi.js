// Milestone 198: admin API client for B2B outreach contacts. Reuses the
// existing adminRequest() wrapper (admin session cookie, credentials:
// "include") — nothing new on the transport layer. Every call here hits
// /api/admin/outreach/contacts/*, behind requireAdminAuth on the backend.

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.search) query.set("search", params.search);
  if (params.organisationType) query.set("organisationType", params.organisationType);
  if (params.province) query.set("province", params.province);
  if (params.city) query.set("city", params.city);
  if (params.source) query.set("source", params.source);
  if (params.tag) query.set("tag", params.tag);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminOutreachContacts(params = {}) {
  return adminRequest(`/admin/outreach/contacts${buildQuery(params)}`, { method: "GET" });
}

export function getAdminOutreachContactDistinctValues() {
  return adminRequest("/admin/outreach/contacts/distinct-values", { method: "GET" });
}

export function getAdminOutreachContact(id) {
  return adminRequest(`/admin/outreach/contacts/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminOutreachContact(payload) {
  return adminRequest("/admin/outreach/contacts", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminOutreachContact(id, payload) {
  return adminRequest(`/admin/outreach/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function setAdminOutreachContactStatus(id, status, reason) {
  return adminRequest(`/admin/outreach/contacts/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}

export function deleteAdminOutreachContact(id) {
  return adminRequest(`/admin/outreach/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function previewAdminOutreachImport(payload) {
  return adminRequest("/admin/outreach/contacts/import/preview", { method: "POST", body: JSON.stringify(payload) });
}

export function commitAdminOutreachImport(payload) {
  return adminRequest("/admin/outreach/contacts/import/commit", { method: "POST", body: JSON.stringify(payload) });
}
