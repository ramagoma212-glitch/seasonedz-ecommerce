// Milestone 201: admin API client for the B2B CRM sales workflow (contact
// activity, follow-ups, catalogue tracking, order linking) and quotations.
// Built on the same adminRequest() wrapper as every other admin API file;
// every route here sits behind requireAdminAuth on the backend.

import { adminRequest, ADMIN_API_BASE_URL } from "./adminApiClient.js";

const contactPath = (id) => `/admin/outreach/contacts/${encodeURIComponent(id)}`;
const quotationPath = (id) => `/admin/outreach/quotations/${encodeURIComponent(id)}`;

export function getAdminOutreachCrmDetail(id) {
  return adminRequest(`${contactPath(id)}/crm-detail`, { method: "GET" });
}

export function recordAdminOutreachActivity(id, payload) {
  return adminRequest(`${contactPath(id)}/activities`, { method: "POST", body: JSON.stringify(payload) });
}

export function setAdminOutreachFollowUp(id, payload) {
  return adminRequest(`${contactPath(id)}/follow-up`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function completeAdminOutreachFollowUp(id, payload) {
  return adminRequest(`${contactPath(id)}/follow-up/complete`, { method: "POST", body: JSON.stringify(payload) });
}

export function recordAdminOutreachCatalogueSent(id, payload) {
  return adminRequest(`${contactPath(id)}/catalogue-sent`, { method: "POST", body: JSON.stringify(payload) });
}

export function linkAdminOutreachOrder(id, orderId) {
  return adminRequest(`${contactPath(id)}/orders/${encodeURIComponent(orderId)}/link`, { method: "POST" });
}

export function markAdminOutreachCustomer(id, orderId) {
  return adminRequest(`${contactPath(id)}/orders/${encodeURIComponent(orderId)}/mark-customer`, { method: "POST" });
}

export function markAdminOutreachRepeatCustomer(id) {
  return adminRequest(`${contactPath(id)}/mark-repeat-customer`, { method: "POST" });
}

export function getAdminQuotations(params = {}) {
  const query = new URLSearchParams();
  for (const key of ["status", "contactId", "search", "page", "limit"]) {
    if (params[key]) query.set(key, String(params[key]));
  }
  const qs = query.toString();
  return adminRequest(`/admin/outreach/quotations${qs ? `?${qs}` : ""}`, { method: "GET" });
}

export function getAdminQuotationSummary() {
  return adminRequest("/admin/outreach/quotations/summary", { method: "GET" });
}

export function getAdminQuotation(id) {
  return adminRequest(quotationPath(id), { method: "GET" });
}

export function createAdminQuotation(payload) {
  return adminRequest("/admin/outreach/quotations", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminQuotation(id, payload) {
  return adminRequest(quotationPath(id), { method: "PATCH", body: JSON.stringify(payload) });
}

export function duplicateAdminQuotation(id) {
  return adminRequest(`${quotationPath(id)}/duplicate`, { method: "POST" });
}

export function sendAdminQuotation(id, confirmRecipientEmail) {
  return adminRequest(`${quotationPath(id)}/send`, { method: "POST", body: JSON.stringify({ confirmRecipientEmail }) });
}

export function reconcileAdminQuotation(id, payload) {
  return adminRequest(`${quotationPath(id)}/reconcile`, { method: "POST", body: JSON.stringify(payload) });
}

export function transitionAdminQuotation(id, action) {
  return adminRequest(`${quotationPath(id)}/${action}`, { method: "POST" });
}

export function adminQuotationPdfUrl(id) {
  return `${ADMIN_API_BASE_URL}${quotationPath(id)}/pdf`;
}

// Milestone 202: individual follow-up emails. Preview is read-only; sending and
// reconciling are ADMIN-only on the server.
export function getAdminFollowUpComposer(id) {
  return adminRequest(`${contactPath(id)}/follow-up`, { method: "GET" });
}

export function previewAdminFollowUp(id, payload) {
  return adminRequest(`${contactPath(id)}/follow-up/preview`, { method: "POST", body: JSON.stringify(payload) });
}

export function sendAdminFollowUp(id, payload) {
  return adminRequest(`${contactPath(id)}/follow-up/send`, { method: "POST", body: JSON.stringify(payload) });
}

export function reconcileAdminFollowUp(id, attemptId, payload) {
  return adminRequest(`${contactPath(id)}/follow-up/attempts/${encodeURIComponent(attemptId)}/reconcile`, { method: "POST", body: JSON.stringify(payload) });
}

export function getAdminFollowUpQueue() {
  return adminRequest("/admin/outreach/contacts/follow-up-queue", { method: "GET" });
}
