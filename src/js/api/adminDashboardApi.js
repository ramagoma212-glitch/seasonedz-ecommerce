// Admin dashboard API client (Version 7, Milestone 59 — read only).
// Every function here is a GET — no create/update/delete request is
// made from this file, matching the backend's read-only-only routes.

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

export function getAdminEnquiries(params = {}) {
  return adminRequest(`/admin/enquiries${buildQuery(params)}`, { method: "GET" });
}

export function getAdminLowStockProducts() {
  return adminRequest("/admin/products/low-stock", { method: "GET" });
}
