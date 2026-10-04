// Brevo transactional email provider (Version 7, Milestone 117).
//
// Calls ONLY Brevo's transactional send endpoint — POST
// https://api.brevo.com/v3/smtp/email. No campaign, list, contact, or
// marketing-unsubscribe endpoint is ever called from this file, and no
// attachment is ever sent. This is the one place in the codebase that
// talks to Brevo directly; email.service.ts's dispatch() is the only
// caller, and it wraps every call so a Brevo failure never reaches an
// order/enquiry/PayFast request handler — see that file's own comment.
//
// Never logs the API key, the Authorization/api-key header, or a raw
// response body (which could otherwise echo back request details) —
// only a status code on failure, which is enough to cross-reference
// against Brevo's own dashboard if needed.

import { env } from "../../../config/env.js";
import type { RenderedEmail } from "../email.types.js";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_REQUEST_TIMEOUT_MS = 10_000;

// Milestone 201: `code` says what kind of failure this was, so a caller that
// must not blindly retry (B2B quotation sending) can tell a definite refusal
// from an outcome that is genuinely unknown.
//   NOT_CONFIGURED: nothing was sent.
//   REJECTED: Brevo answered with an error status, so the email was not accepted.
//   UNREACHABLE: no response arrived (timeout, network). The email may or may not have been accepted.
export type BrevoSendErrorCode = "NOT_CONFIGURED" | "REJECTED" | "UNREACHABLE";

export class BrevoSendError extends Error {
  code: BrevoSendErrorCode;

  constructor(message: string, code: BrevoSendErrorCode) {
    super(message);
    this.name = "BrevoSendError";
    this.code = code;
  }
}

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export async function sendViaBrevo(to: BrevoRecipient, rendered: RenderedEmail): Promise<void> {
  // Defensive re-check even though env.ts already validates this
  // eagerly at startup whenever EMAIL_ENABLED=true and
  // EMAIL_PROVIDER=brevo — keeps this function safe to call directly
  // in a test without needing to reload env.ts.
  if (!env.brevoApiKey || !env.emailReplyTo || !env.emailFromAddress) {
    throw new BrevoSendError("Brevo is not fully configured. Missing API key, reply-to address, or from address.", "NOT_CONFIGURED");
  }

  const body = {
    sender: { name: env.emailFromName, email: env.emailFromAddress },
    to: [to.name ? { email: to.email, name: to.name } : { email: to.email }],
    replyTo: { email: env.emailReplyTo },
    subject: rendered.subject,
    // v1: plain-text body only, matching every template's current
    // plain-text-only output — an HTML variant can be added later
    // once templates actually produce safe HTML, not invented here.
    textContent: rendered.body,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        "api-key": env.brevoApiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new BrevoSendError(`Brevo send failed (${response.status}).`, "REJECTED");
  }
}
