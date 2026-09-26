// Milestone 198: the ONE place a B2B outreach email actually gets sent.
// Deliberately isolated from the recipient-loop/campaign-status logic in
// outreachCampaign.service.ts — this file's only job is "render one
// personalized email and hand it to the existing transactional
// dispatcher," so a bug in campaign batching/pagination logic can never
// change what actually gets sent to Brevo.
//
// Calls email.service.ts's deliverRenderedEmail() — the exact same
// low-level primitive the password-reset/OTP/order-notification paths
// already use, gated by the same EMAIL_ENABLED/EMAIL_PROVIDER switches.
// This file never talks to Brevo directly and never duplicates
// brevo.provider.ts's own request logic — reusing the existing, already-
// tested dispatcher is safer than a second hand-rolled implementation,
// and a failure here surfaces through the exact same, already-safe
// masked-logging path. See EMAIL_SETUP.md and this milestone's own
// report for the fuller "why not a second provider" reasoning (Part 17
// of the brief): the transactional path itself is untouched by this
// file either way — only the same account's shared Brevo sending
// reputation is an inherent, non-code risk, mitigated by real
// suppression (outreachContact.service.ts) and by keeping sends small
// and rate-limited (outreachCampaign.service.ts's own batching).
//
// Plain text only, matching every existing template's own body format
// (brevo.provider.ts: "v1: plain-text body only") — {{organisation_name}}/
// {{contact_name}} tokens are rendered as a literal substring
// replacement, never interpreted as markup, so there is no new
// HTML/script-injection surface for this milestone to introduce.

import { deliverRenderedEmail } from "../email/email.service.js";
import { preferredFrontendBaseUrl } from "../../utils/frontendUrl.js";
import { signOutreachUnsubscribeToken } from "../../utils/outreachUnsubscribeToken.js";

export interface PersonalizationContact {
  organisationName: string | null;
  contactName: string | null;
}

// Part 10: "Do not invent information when the value is unavailable.
// Provide fallback behaviour." — an absent organisation/contact name
// falls back to a neutral "there" greeting, never a guessed value.
export function renderPersonalizedOutreachBody(template: string, contact: PersonalizationContact): string {
  const organisationName = contact.organisationName?.trim() || "there";
  const contactName = contact.contactName?.trim() || contact.organisationName?.trim() || "there";
  return template.split("{{organisation_name}}").join(organisationName).split("{{contact_name}}").join(contactName);
}

export function buildOutreachUnsubscribeUrl(contactId: string): string {
  const token = signOutreachUnsubscribeToken(contactId);
  return `${preferredFrontendBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Part 12: a real, working, per-contact unsubscribe link on every real
// outreach send (never on a test send preview, which never reaches a
// real contact id anyway — see sendOutreachTestEmail() below). Appended
// server-side so the owner's own subject/body editor never needs to
// remember to include it, and can never accidentally omit it.
export function appendUnsubscribeFooter(body: string, contactId: string): string {
  const unsubscribeUrl = buildOutreachUnsubscribeUrl(contactId);
  return `${body}\n\n---\nSeasonedz Group\nIf you'd rather not receive emails like this, unsubscribe here: ${unsubscribeUrl}`;
}

export interface OutreachSendResult {
  success: boolean;
  errorMessage?: string;
}

// The real, binding send for one campaign recipient — always includes
// the unsubscribe footer. Never throws: outreachCampaign.service.ts's
// batch loop needs a per-recipient success/failure result to keep
// processing the rest of the batch even when one send fails.
export async function sendOutreachCampaignEmail(params: {
  contactId: string;
  contactEmail: string;
  contactName: string | null;
  organisationName: string | null;
  subject: string;
  bodyTemplate: string;
  reference: string;
}): Promise<OutreachSendResult> {
  const personalizedBody = renderPersonalizedOutreachBody(params.bodyTemplate, { organisationName: params.organisationName, contactName: params.contactName });
  const finalBody = appendUnsubscribeFooter(personalizedBody, params.contactId);

  try {
    await deliverRenderedEmail({
      templateName: "outreach-campaign",
      recipientRole: "contact",
      recipientEmail: params.contactEmail,
      recipientName: params.contactName ?? params.organisationName ?? undefined,
      reference: params.reference,
      rendered: { subject: params.subject, body: finalBody },
    });
    return { success: true };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Part 14: "Send Test" — rendered with a synthetic sample contact
// (never a real one, and never writes an OutreachCampaignRecipient row
// — a test send must never count as a real campaign recipient). The
// unsubscribe link still needs *some* target: it points at a synthetic,
// never-real contact id ("test-preview-no-real-contact"), which is
// inert by construction — unsubscribeContactByToken() below simply
// finds no matching OutreachContact row and does nothing, exactly like
// clicking a genuinely expired/unknown link would.
export async function sendOutreachTestEmail(params: { testEmailAddress: string; subject: string; bodyTemplate: string }): Promise<OutreachSendResult> {
  const sampleContact: PersonalizationContact = { organisationName: "Sample Organisation", contactName: "Sample Contact" };
  const personalizedBody = renderPersonalizedOutreachBody(params.bodyTemplate, sampleContact);
  const testUnsubscribeUrl = buildOutreachUnsubscribeUrl("test-preview-no-real-contact");
  const finalBody = `${personalizedBody}\n\n---\nSeasonedz Group\nIf you'd rather not receive emails like this, unsubscribe here: ${testUnsubscribeUrl}\n\n[This is a TEST SEND — it was not counted against any campaign's recipients.]`;

  try {
    await deliverRenderedEmail({
      templateName: "outreach-campaign-test",
      recipientRole: "contact",
      recipientEmail: params.testEmailAddress,
      reference: "outreach-test-send",
      rendered: { subject: `[TEST] ${params.subject}`, body: finalBody },
    });
    return { success: true };
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
  }
}
