// Admin auth API client (Version 7, Milestone 58 — foundation only).
// Deliberately its own tiny fetch wrapper, not a reuse of
// js/apiClient.js's shared `request()` — the admin session cookie
// must be sent/received via `credentials: "include"`, which no
// customer-facing request needs (nothing else in this project uses
// cookies at all), so this stays isolated rather than changing
// behaviour for every existing API call. Reuses the same error
// classes as apiClient.js so callers can handle both consistently.

import { ApiError, ApiUnavailableError } from "../apiClient.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

async function adminRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      credentials: "include",
      ...options,
    });
  } catch (error) {
    console.warn(`[Seasonedz] Could not reach the backend API at ${API_BASE_URL}${path}.`, error);
    throw new ApiUnavailableError();
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body — fall through with body left null.
  }

  if (!response.ok) {
    throw new ApiError(body?.message || `Request failed (${response.status}).`, {
      status: response.status,
      errors: body?.errors,
    });
  }

  return body;
}

export function adminLogin(email, password) {
  return adminRequest("/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function adminLogout() {
  return adminRequest("/admin/auth/logout", { method: "POST" });
}

export function getCurrentAdmin() {
  return adminRequest("/admin/auth/me", { method: "GET" });
}
