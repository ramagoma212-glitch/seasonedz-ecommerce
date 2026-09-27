// Milestone 198: admin API client for B2B outreach campaigns. Same
// adminRequest() wrapper as adminOutreachContactApi.js — every call
// here hits /api/admin/outreach/campaigns/*, behind requireAdminAuth
// (sending actions additionally require the ADMIN role, enforced
// server-side — see adminOutreachCampaign.routes.ts).

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminOutreachCampaigns(params = {}) {
  return adminRequest(`/admin/outreach/campaigns${buildQuery(params)}`, { method: "GET" });
}

export function getAdminOutreachCampaign(id) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminOutreachCampaign(payload) {
  return adminRequest("/admin/outreach/campaigns", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminOutreachCampaign(id, payload) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteAdminOutreachCampaign(id) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function previewAdminOutreachAudience(filter) {
  return adminRequest("/admin/outreach/campaigns/preview-audience", { method: "POST", body: JSON.stringify(filter) });
}

export function buildAdminOutreachCampaignRecipients(id, filter) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/build-recipients`, { method: "POST", body: JSON.stringify(filter) });
}

export function getAdminOutreachCampaignRecipients(id, params = {}) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/recipients${buildQuery(params)}`, { method: "GET" });
}

export function sendAdminOutreachCampaignTest(id, testEmailAddress) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/send-test`, { method: "POST", body: JSON.stringify({ testEmailAddress }) });
}

export function sendAdminOutreachCampaignBatch(id, batchSize) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/send-batch`, { method: "POST", body: JSON.stringify(batchSize ? { batchSize } : {}) });
}

export function retryAdminOutreachCampaignFailed(id) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/retry-failed`, { method: "POST" });
}

export function cancelAdminOutreachCampaign(id) {
  return adminRequest(`/admin/outreach/campaigns/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

// Milestone 198.1: multi-select bulk sending. previewBulkOutreachSend is
// a read-only calculation (eligibility, cross-campaign duplicates,
// recipient totals); bulkStartAdminOutreachCampaigns is the real,
// binding send — ADMIN-only server-side regardless of what this page
// shows.
export function previewBulkOutreachSend(campaignIds) {
  return adminRequest("/admin/outreach/campaigns/bulk-preview", { method: "POST", body: JSON.stringify({ campaignIds }) });
}

export function bulkStartAdminOutreachCampaigns(campaignIds) {
  return adminRequest("/admin/outreach/campaigns/bulk-start", { method: "POST", body: JSON.stringify({ campaignIds }) });
}
