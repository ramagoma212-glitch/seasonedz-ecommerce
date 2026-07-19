// Admin auth API client (Version 7, Milestone 58 — foundation only).
// Uses the shared adminRequest() wrapper (js/api/adminApiClient.js,
// factored out in Milestone 59) which sends the admin session cookie
// via `credentials: "include"`.

import { adminRequest } from "./adminApiClient.js";

export function adminLogin(email, password) {
  return adminRequest("/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function adminLogout() {
  return adminRequest("/admin/auth/logout", { method: "POST" });
}

export function getCurrentAdmin() {
  return adminRequest("/admin/auth/me", { method: "GET" });
}
