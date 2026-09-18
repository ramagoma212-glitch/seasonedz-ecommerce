// Milestone 187, Part D/X: server-side Turnstile verification. The
// secret key lives only as a Worker secret (wrangler secret put
// TURNSTILE_SECRET_KEY) — never in frontend code, never committed.
// Fails closed: if the secret isn't configured yet (e.g. deployed
// before the owner has created the Turnstile widget), verification is
// treated as failed rather than silently skipped.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token: string, secretKey: string | undefined, remoteIp: string | null): Promise<boolean> {
  if (!secretKey || !token) return false;

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    // A network failure talking to Cloudflare's own verify endpoint is
    // treated as a failed verification, never a silent pass.
    return false;
  }
}
