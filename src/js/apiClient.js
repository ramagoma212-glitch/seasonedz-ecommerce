// Thin fetch wrapper shared by every src/js/api/*.js module. Two
// distinct failure modes matter to callers, so they're two distinct
// error classes rather than one generic Error:
//
//  - ApiUnavailableError: the request never got a response at all
//    (backend not running, network down, CORS rejection). Callers
//    should show a "couldn't connect" message.
//  - ApiError: the backend responded, but with a non-2xx status
//    (validation failure, not found, rate limited, server error).
//    Carries `status` and, for validation failures, `errors`
//    (the same [{ field, message }] shape the backend uses).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export class ApiUnavailableError extends Error {
  constructor(message = "We could not connect to the server. Please try again shortly.") {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    // Network error, CORS rejection, or the backend simply isn't
    // running — fetch itself throws, there's no response to read.
    console.warn(`[Seasonedz] Could not reach the backend API at ${API_BASE_URL}${path}.`, error);
    throw new ApiUnavailableError();
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (shouldn't normally happen — every route uses the
    // shared apiResponse envelope) — fall through with body left null.
  }

  if (!response.ok) {
    throw new ApiError(body?.message || `Request failed (${response.status}).`, {
      status: response.status,
      errors: body?.errors,
    });
  }

  return body;
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, data) {
  return request(path, { method: "POST", body: JSON.stringify(data) });
}
