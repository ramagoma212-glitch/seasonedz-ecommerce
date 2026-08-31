// Milestone 179, Part G: admin-user management API client. Every call
// here hits /api/admin/users, which requires BOTH a valid admin
// session AND the ADMIN role server-side — see
// backend/src/routes/adminUsers.routes.ts.

import { adminRequest } from "./adminApiClient.js";

export function getAdminUsers() {
  return adminRequest("/admin/users", { method: "GET" });
}

export function inviteAdminUser(name, email, role) {
  return adminRequest("/admin/users/invite", { method: "POST", body: JSON.stringify({ name, email, role }) });
}

export function reissueAdminInvitation(id) {
  return adminRequest(`/admin/users/${encodeURIComponent(id)}/reissue-invitation`, { method: "POST" });
}

export function changeAdminUserRole(id, role) {
  return adminRequest(`/admin/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export function setAdminUserActive(id, isActive) {
  return adminRequest(`/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) });
}
