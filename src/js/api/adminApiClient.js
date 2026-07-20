// Shared fetch wrapper for authenticated admin API requests. Factored
// out of adminAuthApi.js (Version 7, Milestone 58) so the read-only
// admin dashboard API client (Milestone 59) can reuse the same
// credentials/error handling without duplicating it — behaviour is
// unchanged from the original inline version.
//
// Deliberately its own wrapper, not js/apiClient.js's shared
// `request()` — the admin session cookie must be sent/received via
// `credentials: "include"`, which no customer-facing request needs
// (nothing else in this project uses cookies at all). Reuses the same
// error classes as apiClient.js so callers can handle both consistently.

import { ApiError, ApiUnavailableError } from "../apiClient.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export async function adminRequest(path, options = {}) {
  let response;

  // Version 7, Milestone 70: a FormData body (product image upload)
  // must never get a manual Content-Type — the browser only sets the
  // correct "multipart/form-data; boundary=..." header itself when
  // Content-Type is left unset. `headers` is computed after `options`
  // in the fetch call below (not before) specifically so it always
  // wins, regardless of what options.headers does or doesn't contain.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = isFormData
    ? { ...(options.headers || {}) }
    : { "Content-Type": "application/json", ...(options.headers || {}) };

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
