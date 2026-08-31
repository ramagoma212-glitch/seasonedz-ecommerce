// Email service (Version 3, Milestone 24 — preparation only; templates
// and dry-run log format extended in Version 6, Milestone 53; Brevo
// wired in as a real provider in Version 7, Milestone 117 — still off
// by default at the time).
//
// Version 7, Milestone 174B: every send*Email wrapper that used to live
// here (sendOrderCreatedEmail, sendPaymentConfirmedEmail, etc.) has
// been removed — notificationEngine.service.ts is now the one
// authoritative path for all of those events (brief section 9/14: "no
// business service should call Brevo directly... one authoritative
// notification path"). This file now exposes only the low-level
// primitive that engine calls: deliverRenderedEmail(), which THROWS on
// a genuine failure (unlike the old dispatch(), which always swallowed
// internally) — the engine needs to know success/failure to update a
// Notification row's status, whereas the old wrapper functions wanted
// failure hidden from their caller entirely.
//
// sendPasswordResetEmail() is the one deliberate exception, kept
// completely unchanged: password-reset stays on this same direct,
// swallow-on-failure path it has always used, never routed through the
// Notification table's stored-content model — see
// notificationEngine.service.ts's own header comment for why (the
// reset link contains a one-time token that must never be persisted or
// logged anywhere).
//
// No real email is sent by anything in this file unless explicitly
// turned on:
//  - EMAIL_ENABLED=false (still the default outside production) makes
//    every send a safe no-op.
//  - EMAIL_PROVIDER="console" (the default provider) logs only safe
//    metadata — template name, recipient role, a masked recipient
//    address, a reference, the subject, and a short, non-sensitive
//    preview line. It never logs the full rendered body, a full email
//    address, a raw PayFast payload, or any other personal detail.
//  - EMAIL_PROVIDER="brevo" sends a real transactional email via
//    brevo.provider.ts's sendViaBrevo().
//
// See backend/EMAIL_SETUP.md and VERSION_7_NOTIFICATION_AUDIT_174A.md.

import { env } from "../../config/env.js";
import { renderAdminInvitationEmail, renderAdminOtpEmail, renderAdminPasswordResetEmail, renderPasswordResetEmail } from "./emailTemplates.js";
import { sendViaBrevo, BrevoSendError } from "./providers/brevo.provider.js";
import type {
  AdminInvitationEmailData,
  AdminOtpEmailData,
  AdminPasswordResetEmailData,
  EmailRecipientRole,
  EmailTemplateName,
  PasswordResetEmailData,
  RenderedEmail,
} from "./email.types.js";

// Masks all but the first character of the local part and of the
// domain's first label, e.g. "jane.doe@example.com" -> "j***@e***.com"
// — enough to spot-check in logs without ever printing a real address.
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";

  const domainParts = domain.split(".");
  const firstLabel = domainParts[0] ?? domain;
  const maskedDomain = domainParts.length > 1 ? `${firstLabel[0]}***.${domainParts.slice(1).join(".")}` : `${firstLabel[0]}***`;

  return `${local[0]}***@${maskedDomain}`;
}

// A short, non-sensitive preview line for the dry-run log — never the
// full body. Skips the "Hi {name}," greeting line (the only line that
// carries the customer's name) and never touches a customer's own
// free-text message; it only ever surfaces generic template wording or
// an already-non-sensitive reference, truncated well short of anything
// resembling a full paragraph.
export function safePreview(body: string): string {
  const MAX_LENGTH = 80;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const contentLine = lines.find((line) => !line.startsWith("Hi ")) || "";
  return contentLine.length > MAX_LENGTH ? `${contentLine.slice(0, MAX_LENGTH - 1)}...` : contentLine;
}

function logConsoleEmail(
  templateName: EmailTemplateName | string,
  recipientRole: EmailRecipientRole,
  recipientEmail: string,
  reference: string,
  rendered: RenderedEmail
): void {
  console.log(
    `[email:console] template="${templateName}" role="${recipientRole}" to="${maskEmail(recipientEmail)}" ref="${reference}" subject="${rendered.subject}" preview="${safePreview(rendered.body)}"`
  );
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

// The one low-level send primitive — throws EmailDeliveryError on a
// genuine failure (Brevo unreachable/rejected, or an unimplemented
// provider value), never on the "disabled" or "console" cases, which
// are deliberate, successful no-ops by design (see this file's own
// header comment on why the engine treats those as SENT, not FAILED).
export async function deliverRenderedEmail(params: {
  templateName: EmailTemplateName | string;
  recipientRole: EmailRecipientRole;
  recipientEmail: string;
  recipientName?: string;
  reference: string;
  rendered: RenderedEmail;
}): Promise<void> {
  const { templateName, recipientRole, recipientEmail, recipientName, reference, rendered } = params;

  if (!env.emailEnabled) return; // safe no-op — the default state outside production

  if (env.emailProvider === "console") {
    logConsoleEmail(templateName, recipientRole, recipientEmail, reference, rendered);
    return;
  }

  if (env.emailProvider === "brevo") {
    try {
      await sendViaBrevo({ email: recipientEmail, name: recipientName }, rendered);
    } catch (error) {
      // Never logs the API key, a header, or the full recipient
      // address/body — only the safe metadata already used for console
      // mode, plus the error's own message (BrevoSendError's messages
      // are themselves already safe — see brevo.provider.ts).
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[email:brevo] Send failed for template="${templateName}" role="${recipientRole}" to="${maskEmail(recipientEmail)}" ref="${reference}": ${message}`);
      throw error instanceof BrevoSendError ? error : new EmailDeliveryError(message);
    }
    return;
  }

  // No other provider is integrated.
  const message = `EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet.`;
  console.warn(`[email] ${message} No email was sent for template "${templateName}".`);
  throw new EmailDeliveryError(message);
}

// Version 7, Milestone 132: kept exactly as before Milestone 174B —
// same control flow, same swallow-on-failure discipline, same "never
// touches the raw token" safety. See this file's own header comment
// for why password reset stays on its own direct path rather than the
// Notification engine's stored-content model.
//
// Version 7, Milestone 174B: the ONE change — now returns whether the
// send genuinely succeeded (true for the disabled/console/real-success
// cases, false only on a caught Brevo failure), instead of void. This
// lets customerAuth.controller.ts record an accurate SENT/FAILED audit
// row afterward (safe metadata only — see notificationEngine.service.ts's
// recordPasswordResetAttempt()) without this function's own
// swallow-on-failure behaviour changing at all — it still never throws.
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
  if (!env.emailEnabled) return true;

  const rendered = renderPasswordResetEmail(data);

  if (env.emailProvider === "console") {
    logConsoleEmail("password-reset", "customer", data.customerEmail, "password-reset", rendered);
    return true;
  }

  if (env.emailProvider === "brevo") {
    try {
      await sendViaBrevo({ email: data.customerEmail, name: data.customerFirstName }, rendered);
      return true;
    } catch (error) {
      console.warn(`[email:brevo] Send failed for template="password-reset" role="customer" to="${maskEmail(data.customerEmail)}" ref="password-reset": ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  console.warn(`[email] EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet — no email was sent for template "password-reset".`);
  return false;
}

// Milestone 179: same direct, swallow-on-failure path as
// sendPasswordResetEmail() above, for the exact same reason — the code
// is a one-time secret that must never be persisted or logged, so it
// cannot go through notificationEngine.service.ts's stored-content
// model. Called from adminAuth.controller.ts immediately after
// adminOtp.service.ts issues a challenge; a Brevo failure here must
// never block the login response (the admin can always request a
// resend once cooldown allows).
export async function sendAdminOtpEmail(data: AdminOtpEmailData): Promise<boolean> {
  if (!env.emailEnabled) return true;

  const rendered = renderAdminOtpEmail(data);

  if (env.emailProvider === "console") {
    logConsoleEmail("admin-otp", "admin", data.adminEmail, "admin-otp", rendered);
    return true;
  }

  if (env.emailProvider === "brevo") {
    try {
      await sendViaBrevo({ email: data.adminEmail, name: data.adminName }, rendered);
      return true;
    } catch (error) {
      console.warn(`[email:brevo] Send failed for template="admin-otp" role="admin" to="${maskEmail(data.adminEmail)}" ref="admin-otp": ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  console.warn(`[email] EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet — no email was sent for template "admin-otp".`);
  return false;
}

// Milestone 179: same direct path — the activation link carries a raw,
// one-time token that must never be persisted or logged.
export async function sendAdminInvitationEmail(data: AdminInvitationEmailData): Promise<boolean> {
  if (!env.emailEnabled) return true;

  const rendered = renderAdminInvitationEmail(data);

  if (env.emailProvider === "console") {
    logConsoleEmail("admin-invitation", "admin", data.inviteeEmail, "admin-invitation", rendered);
    return true;
  }

  if (env.emailProvider === "brevo") {
    try {
      await sendViaBrevo({ email: data.inviteeEmail, name: data.inviteeName }, rendered);
      return true;
    } catch (error) {
      console.warn(`[email:brevo] Send failed for template="admin-invitation" role="admin" to="${maskEmail(data.inviteeEmail)}" ref="admin-invitation": ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  console.warn(`[email] EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet — no email was sent for template "admin-invitation".`);
  return false;
}

// Milestone 179: same direct path — mirrors sendPasswordResetEmail()
// exactly, kept as its own function so the admin reset flow never
// shares a code path with the customer one (brief section 20: "never
// send an admin through the customer login system").
export async function sendAdminPasswordResetEmail(data: AdminPasswordResetEmailData): Promise<boolean> {
  if (!env.emailEnabled) return true;

  const rendered = renderAdminPasswordResetEmail(data);

  if (env.emailProvider === "console") {
    logConsoleEmail("admin-password-reset", "admin", data.adminEmail, "admin-password-reset", rendered);
    return true;
  }

  if (env.emailProvider === "brevo") {
    try {
      await sendViaBrevo({ email: data.adminEmail, name: data.adminName }, rendered);
      return true;
    } catch (error) {
      console.warn(`[email:brevo] Send failed for template="admin-password-reset" role="admin" to="${maskEmail(data.adminEmail)}" ref="admin-password-reset": ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  console.warn(`[email] EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet — no email was sent for template "admin-password-reset".`);
  return false;
}
