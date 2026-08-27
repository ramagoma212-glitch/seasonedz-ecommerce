// Shared fetch wrapper for customer account API requests (Version 7,
// Milestone 128). Mirrors js/api/adminApiClient.js exactly — the
// customer_session cookie must be sent/received via
// `credentials: "include"`, same as the admin session cookie, but this
// stays a fully separate wrapper/module so nothing here can ever be
// confused with or reused for admin requests. No token is ever read
// from or written to this module — the cookie is HttpOnly, so frontend
// JavaScript never sees its value at all.

import { ApiError, ApiUnavailableError } from "../apiClient.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export async function customerRequest(path, options = {}) {
  let response;

  // Version 7, Milestone 176: a FormData body (affiliate verification
  // document upload) must never get a manual Content-Type — the browser
  // only sets the correct "multipart/form-data; boundary=..." header
  // itself when Content-Type is left unset. Same fix already applied to
  // adminApiClient.js's own adminRequest() for product image upload.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = isFormData ? { ...(options.headers || {}) } : { "Content-Type": "application/json", ...(options.headers || {}) };

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers,
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
