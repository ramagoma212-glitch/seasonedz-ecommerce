// Admin dashboard API client (Version 7, Milestone 59 — read only;
// Version 7, Milestone 64 adds updateAdminOrderStatus and the
// read-only status-history function; Version 7, Milestone 67 adds the
// product management functions — createAdminProduct/updateAdminProduct
// are the only other writes in this file, everything else is a GET).

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
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.search) query.set("search", params.search);
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

// Version 7, Milestone 67: admin product management. Reuses the
// existing, already-live, requireAdminAuth-protected routes from
// Milestone 66 — nothing new on the backend.
export function getAdminProducts(params = {}) {
  return adminRequest(`/admin/products${buildQuery(params)}`, { method: "GET" });
}

export function getAdminProduct(id) {
  return adminRequest(`/admin/products/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminProduct(payload) {
  return adminRequest("/admin/products", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminProduct(id, payload) {
  return adminRequest(`/admin/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Version 7, Milestone 70: admin product image management. Uses the
// image routes already live from Milestone 69
// (adminProductImage.controller.ts) — nothing new on the backend.
export function getProductImages(productId) {
  return adminRequest(`/admin/products/${encodeURIComponent(productId)}/images`, { method: "GET" });
}

// `file` is a File/Blob from a <input type="file">. adminApiClient.js
// detects the FormData body and skips the default JSON Content-Type so
// the browser can set the correct multipart boundary itself.
export function uploadProductImage(productId, file, altText, kind) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("altText", altText);
  if (kind) formData.append("kind", kind);

  return adminRequest(`/admin/products/${encodeURIComponent(productId)}/images`, {
    method: "POST",
    body: formData,
  });
}

export function updateProductImage(productId, imageId, payload) {
  return adminRequest(`/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
