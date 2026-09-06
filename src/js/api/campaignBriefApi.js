// Milestone 182: admin API client for the Zeely Campaign Brief tool.
// Same adminRequest() wrapper as every other Content Studio API client
// — see contentStudioApi.js's own header comment. Every call here hits
// /api/admin/content-studio/campaign-briefs*.

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminCampaignBriefs(params = {}) {
  return adminRequest(`/admin/content-studio/campaign-briefs${buildQuery(params)}`, { method: "GET" });
}

export function getAdminCampaignBrief(id) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminCampaignBrief(payload) {
  return adminRequest("/admin/content-studio/campaign-briefs", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminCampaignBrief(id, payload) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function regenerateAdminCampaignBrief(id) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(id)}/regenerate`, { method: "POST" });
}

export function updateAdminCampaignBriefStatus(id, status) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function archiveAdminCampaignBrief(id) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(id)}/archive`, { method: "PATCH" });
}

export function createAdminCampaignContentRecord(briefId, payload) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(briefId)}/content-records`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminCampaignContentRecord(briefId, recordId, payload) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(briefId)}/content-records/${encodeURIComponent(recordId)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteAdminCampaignContentRecord(briefId, recordId) {
  return adminRequest(`/admin/content-studio/campaign-briefs/${encodeURIComponent(briefId)}/content-records/${encodeURIComponent(recordId)}`, { method: "DELETE" });
}
