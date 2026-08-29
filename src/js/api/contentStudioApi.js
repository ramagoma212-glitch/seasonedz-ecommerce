// Content Studio Phase 2: admin API client for Brand Knowledge
// Foundation. Reuses the existing adminRequest() wrapper (admin
// session cookie, credentials: "include") — nothing new on the
// transport layer, same shape as adminReferralsApi.js. Every call here
// hits /api/admin/content-studio/*. No campaign, generation, social
// account or scheduling call exists anywhere in this file — Phase 2 is
// Brand Knowledge only.

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.category) query.set("category", params.category);
  if (params.isActive !== undefined && params.isActive !== "") query.set("isActive", params.isActive);
  if (params.search) query.set("search", params.search);
  if (params.tag) query.set("tag", params.tag);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

// ---- Brand Knowledge -------------------------------------------------

export function getAdminBrandKnowledgeEntries(params = {}) {
  return adminRequest(`/admin/content-studio/brand-knowledge${buildQuery(params)}`, { method: "GET" });
}

export function getAdminBrandKnowledgeEntry(id) {
  return adminRequest(`/admin/content-studio/brand-knowledge/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminBrandKnowledgeEntry(payload) {
  return adminRequest("/admin/content-studio/brand-knowledge", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminBrandKnowledgeEntry(id, payload) {
  return adminRequest(`/admin/content-studio/brand-knowledge/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deactivateAdminBrandKnowledgeEntry(id) {
  return adminRequest(`/admin/content-studio/brand-knowledge/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
}

export function reactivateAdminBrandKnowledgeEntry(id) {
  return adminRequest(`/admin/content-studio/brand-knowledge/${encodeURIComponent(id)}/reactivate`, { method: "PATCH" });
}

// ---- Content Pillars ---------------------------------------------------

export function getAdminContentPillars(params = {}) {
  return adminRequest(`/admin/content-studio/pillars${buildQuery(params)}`, { method: "GET" });
}

export function getAdminContentPillar(id) {
  return adminRequest(`/admin/content-studio/pillars/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminContentPillar(payload) {
  return adminRequest("/admin/content-studio/pillars", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminContentPillar(id, payload) {
  return adminRequest(`/admin/content-studio/pillars/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deactivateAdminContentPillar(id) {
  return adminRequest(`/admin/content-studio/pillars/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
}

export function reactivateAdminContentPillar(id) {
  return adminRequest(`/admin/content-studio/pillars/${encodeURIComponent(id)}/reactivate`, { method: "PATCH" });
}

// ---- Audiences -----------------------------------------------------

export function getAdminAudiences(params = {}) {
  return adminRequest(`/admin/content-studio/audiences${buildQuery(params)}`, { method: "GET" });
}

export function getAdminAudience(id) {
  return adminRequest(`/admin/content-studio/audiences/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminAudience(payload) {
  return adminRequest("/admin/content-studio/audiences", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminAudience(id, payload) {
  return adminRequest(`/admin/content-studio/audiences/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deactivateAdminAudience(id) {
  return adminRequest(`/admin/content-studio/audiences/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
}

export function reactivateAdminAudience(id) {
  return adminRequest(`/admin/content-studio/audiences/${encodeURIComponent(id)}/reactivate`, { method: "PATCH" });
}
