// PayFast ITN server validation (Version 4, Milestone 29 — hardening,
// disabled by default via PAYFAST_VALIDATE_SERVER).
//
// PayFast's own recommended custom-integration confirmation step: POST
// the exact data an ITN delivered back to PayFast's own validation
// endpoint, and only trust the notification if PayFast itself responds
// "VALID". This is protocol-guaranteed regardless of PayFast's
// underlying IP infrastructure, and is a stronger, independent check
// on top of (never instead of) signature/amount/merchant-ID
// verification.
//
// The data POSTed back is exactly what PayFast itself already sent us
// in the ITN — nothing from this backend's own configuration
// (merchant_key, passphrase) is ever included, since none of that is
// part of an ITN body to begin with. Nothing here logs the raw payload
// or the response body itself — only the caller
// (payfast.service.ts) logs a plain pass/fail outcome.

const SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";
const PRODUCTION_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";

const VALIDATE_TIMEOUT_MS = 8000;

// Returns true only if PayFast's own validation endpoint responds with
// exactly "VALID". Any other outcome — a non-"VALID" response, a
// non-2xx status, a network error, or a timeout — returns false.
// Never throws, and never treats "couldn't reach PayFast" as success:
// the caller must reject the notification on false, exactly as it
// would for an explicit "INVALID".
export async function validateWithPayfastServer(rawBody: Record<string, unknown>, mode: "sandbox" | "production"): Promise<boolean> {
  const validateUrl = mode === "production" ? PRODUCTION_VALIDATE_URL : SANDBOX_VALIDATE_URL;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawBody)) {
    if (typeof value === "string") params.append(key, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

  try {
    const response = await fetch(validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });

    if (!response.ok) return false;

    const text = await response.text();
    return text.trim() === "VALID";
  } catch {
    // Network error, timeout, or anything else unexpected. Failing
    // "closed" (treat as not validated) is deliberate — the caller
    // only trusts this function's result when PAYFAST_VALIDATE_SERVER
    // is explicitly true, so failing open here would defeat the point.
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
