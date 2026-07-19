// Admin dashboard API client (Version 7, Milestone 59 — read only;
// Version 7, Milestone 64 adds the one write function, updateAdminOrderStatus,
// and the read-only status-history function — everything else here
// remains a GET).

import { adminRequest } from "./adminApiClient.js";

export function getAdminDashboard() {
  return adminRequest("/admin/dashboard", { method: "GET" });
}

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.status) query.set("status", params.status);
  if (params.paymentStatus) query.set("paymentStatus", params.paymentStatus);
  if (params.type) query.set("type", params.type);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminOrders(params = {}) {
  return adminRequest(`/admin/orders${buildQuery(params)}`, { method: "GET" });
}

export function getAdminOrder(orderNumber) {
  return adminRequest(`/admin/orders/${encodeURIComponent(orderNumber)}`, { method: "GET" });
}

export function getAdminOrderStatusHistory(orderNumber) {
  return adminRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/status-history`, { method: "GET" });
}

// The only write call in this file — everything else above is a GET.
// newStatus/note are validated server-side regardless of anything this
// client does; see backend/src/services/adminOrderStatus.service.ts.
export function updateAdminOrderStatus(orderNumber, newStatus, note) {
  return adminRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ newStatus, note }),
  });
}

export function getAdminEnquiries(params = {}) {
  return adminRequest(`/admin/enquiries${buildQuery(params)}`, { method: "GET" });
}

export function getAdminLowStockProducts() {
  return adminRequest("/admin/products/low-stock", { method: "GET" });
}
