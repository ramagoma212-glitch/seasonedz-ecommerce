// Admin auth API client (Version 7, Milestone 58 — foundation only).
// Uses the shared adminRequest() wrapper (js/api/adminApiClient.js,
// factored out in Milestone 59) which sends the admin session cookie
// via `credentials: "include"`.
//
// Milestone 179: login is now two steps — adminLogin() only ever
// returns a challengeToken (never sets a session cookie); only
// adminVerifyOtp() succeeding actually creates the session. Also adds
// forgotten/reset password and invitation preview/activation, all on
// their own admin-only endpoints, never the customer ones.

import { adminRequest } from "./adminApiClient.js";

export function adminLogin(email, password) {
  return adminRequest("/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function adminVerifyOtp(challengeToken, code) {
  return adminRequest("/admin/auth/otp/verify", { method: "POST", body: JSON.stringify({ challengeToken, code }) });
}

export function adminResendOtp(challengeToken) {
  return adminRequest("/admin/auth/otp/resend", { method: "POST", body: JSON.stringify({ challengeToken }) });
}

export function adminLogout() {
  return adminRequest("/admin/auth/logout", { method: "POST" });
}

// Brief section 32: "Log Out All Sessions" self-service action.
export function adminLogoutAllSessions() {
  return adminRequest("/admin/auth/logout-all", { method: "POST" });
}

export function getCurrentAdmin() {
  return adminRequest("/admin/auth/me", { method: "GET" });
}

export function adminForgotPassword(email) {
  return adminRequest("/admin/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function adminResetPassword(token, password, confirmPassword) {
  return adminRequest("/admin/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, confirmPassword }) });
}

export function previewAdminInvitation(token) {
  return adminRequest(`/admin/auth/invitation?token=${encodeURIComponent(token)}`, { method: "GET" });
}

export function activateAdminInvitation(token, password, confirmPassword) {
  return adminRequest("/admin/auth/invitation/activate", { method: "POST", body: JSON.stringify({ token, password, confirmPassword }) });
}
