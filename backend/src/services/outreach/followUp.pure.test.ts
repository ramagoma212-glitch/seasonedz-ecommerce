// Milestone 202: pure rules for follow-up templates, the signature, and the
// Needs Follow-up queue. No database and no email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_CONTACT } from "../../config/businessContact.js";
import { buildB2bSignature, bodyAlreadyHasSignature } from "./b2bSignature.js";
import { findUnsupportedFollowUpText, renderFollowUp, templateKeyForOrganisationType } from "./followUpTemplates.js";
import { FOLLOW_UP_QUIET_DAYS, FOLLOW_UP_LEAD_STATUSES, assessFollowUp, latestReplyAt } from "./followUpRules.js";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// --- business contact and signature ----------------------------------------

test("the official B2B contact details are exactly the owner's instructed values", () => {
  assert.equal(BUSINESS_CONTACT.phone, "+27 72 844 5644");
  assert.equal(BUSINESS_CONTACT.email, "seasonedzgroup@outlook.com");
  assert.equal(BUSINESS_CONTACT.website, "www.seasonedzgroup.co.za");
  assert.equal(BUSINESS_CONTACT.businessName, "Seasonedz Group");
});

test("the signature is short, human, and contains only verified details", () => {
  const signature = buildB2bSignature();
  assert.match(signature, /^Kind regards/);
  assert.match(signature, /Seasonedz Group/);
  assert.match(signature, /Call \/ WhatsApp: \+27 72 844 5644/);
  assert.match(signature, /Email: seasonedzgroup@outlook\.com/);
  assert.match(signature, /Website: www\.seasonedzgroup\.co\.za/);
  assert.doesNotMatch(signature, /SEDA|award|registered|funded|endorse|facebook|instagram|tiktok/i);
  assert.equal(signature.split("\n").length <= 8, true, "the block stays small");
});

test("a body that already contains the official number is not signed twice", () => {
  assert.equal(bodyAlreadyHasSignature("Call us on +27 72 844 5644 any time."), true);
  assert.equal(bodyAlreadyHasSignature("Hello, please reply."), false);
});

// --- template selection ------------------------------------------------------

test("templates follow the organisation types that really exist in the CRM", () => {
  assert.equal(templateKeyForOrganisationType("School"), "education");
  assert.equal(templateKeyForOrganisationType("ECD network"), "education");
  assert.equal(templateKeyForOrganisationType("Church or faith ministry"), "faith");
  assert.equal(templateKeyForOrganisationType("Book retailer"), "retail");
  assert.equal(templateKeyForOrganisationType("Child and community organisation"), "community");
  assert.equal(templateKeyForOrganisationType("Disability services"), "community");
  assert.equal(templateKeyForOrganisationType("Older adult services"), "community");
  assert.equal(templateKeyForOrganisationType("Healthcare support"), "community");
  assert.equal(templateKeyForOrganisationType("Family hospitality"), "hospitality");
});

test("a missing or unrecognised organisation type falls back to the general template", () => {
  assert.equal(templateKeyForOrganisationType(null), "general");
  assert.equal(templateKeyForOrganisationType(undefined), "general");
  assert.equal(templateKeyForOrganisationType("   "), "general");
  assert.equal(templateKeyForOrganisationType("Something new"), "general");
});

test("organisation type matching ignores case and surrounding spaces", () => {
  assert.equal(templateKeyForOrganisationType("  school "), "education");
});

// --- rendering without fake personalisation ----------------------------------------

test("a missing contact name greets the organisation, and a missing name and organisation greets no one by name", () => {
  const withOrg = renderFollowUp("education", { organisationName: "Sunnyside Primary School", contactName: null, latestCampaign: null });
  assert.match(withOrg.body, /^Good day to the team at Sunnyside Primary School,/);

  const bare = renderFollowUp("general", { organisationName: null, contactName: null, latestCampaign: null });
  assert.match(bare.body, /^Good day,/);
});

test("a named contact is greeted by the name the CRM holds, never an invented one", () => {
  const rendered = renderFollowUp("education", { organisationName: "Sunnyside", contactName: "Mrs Dlamini", latestCampaign: null });
  assert.match(rendered.body, /^Good day Mrs Dlamini,/);
});

test("a campaign-history sentence is only used when a campaign was genuinely sent", () => {
  const withHistory = renderFollowUp("education", {
    organisationName: "Sunnyside",
    contactName: null,
    latestCampaign: { name: "Intro", subject: "Colouring Books and Bulk Orders from Seasonedz Group", sentAt: NOW },
  });
  assert.match(withHistory.body, /I am following up on the email we sent recently/);
  assert.match(withHistory.subject, /^Following up: Colouring Books and Bulk Orders/);

  const withoutHistory = renderFollowUp("education", { organisationName: "Sunnyside", contactName: null, latestCampaign: null });
  assert.doesNotMatch(withoutHistory.body, /email we sent recently/);
});

test("every template carries the official callback number and a simple reply invitation", () => {
  for (const key of ["education", "faith", "retail", "community", "hospitality", "general"] as const) {
    const rendered = renderFollowUp(key, { organisationName: "Org", contactName: "Name", latestCampaign: null });
    assert.match(rendered.body, /reply to this email/);
    assert.match(rendered.body, /\+27 72 844 5644/);
    assert.deepEqual(findUnsupportedFollowUpText(rendered.subject, rendered.body), [], `${key} must pass the claims check`);
  }
});

test("rendered copy uses South African spelling and no dashes", () => {
  for (const key of ["education", "faith", "retail", "community", "hospitality", "general"] as const) {
    const rendered = renderFollowUp(key, { organisationName: "Org", contactName: null, latestCampaign: null });
    assert.doesNotMatch(rendered.body, /coloring/i);
    assert.doesNotMatch(rendered.body, /[–—]/);
  }
});

// --- claims validator --------------------------------------------------------------

test("copy that claims knowledge of the recipient or tracking is refused", () => {
  assert.ok(findUnsupportedFollowUpText("Hi", "I saw your recent visit to the fair.").length > 0);
  assert.ok(findUnsupportedFollowUpText("Hi", "I have been following your work for a while.").length > 0);
  assert.ok(findUnsupportedFollowUpText("Hi", "Glad you opened our email.").length > 0);
  assert.ok(findUnsupportedFollowUpText("Hi", "We read your programme with interest.").length > 0, "a claim about reading their programme is unverified and is refused");
});

test("copy that implies funding, endorsement or American spelling is refused", () => {
  assert.ok(findUnsupportedFollowUpText("Hi", "Supported by SEDA.").length > 0);
  assert.ok(findUnsupportedFollowUpText("Hi", "Our coloring books are great.").length > 0);
  assert.ok(findUnsupportedFollowUpText("Hi", "Ideal for schools — call us.").length > 0);
});

// --- Needs Follow-up rule --------------------------------------------------------------

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    status: "ACTIVE" as const,
    leadStatus: "CONTACTED" as const,
    emailSendLockAttemptId: null,
    lastContactedAt: new Date(NOW.getTime() - 30 * DAY),
    nextFollowUpAt: null,
    ...overrides,
  };
}

test("the rule's quiet period is seven days and the eligible lead statuses are documented", () => {
  assert.equal(FOLLOW_UP_QUIET_DAYS, 7);
  assert.deepEqual([...FOLLOW_UP_LEAD_STATUSES].sort(), ["CATALOGUE_SENT", "CONTACTED", "INTERESTED", "NEGOTIATING", "QUOTE_REQUESTED"]);
});

test("an ACTIVE contacted lead with no date set becomes due after the quiet period", () => {
  const result = assessFollowUp(candidate(), null, NOW);
  assert.equal(result.needsFollowUp, true);
  assert.match(result.reason, /over 7 days ago/);
});

test("a contact contacted within the quiet period is not yet due", () => {
  const result = assessFollowUp(candidate({ lastContactedAt: new Date(NOW.getTime() - 2 * DAY) }), null, NOW);
  assert.equal(result.needsFollowUp, false);
});

test("a contact scheduled in the future is not due, and one whose date has passed is", () => {
  assert.equal(assessFollowUp(candidate({ nextFollowUpAt: new Date(NOW.getTime() + DAY) }), null, NOW).needsFollowUp, false);
  assert.equal(assessFollowUp(candidate({ nextFollowUpAt: new Date(NOW.getTime() - DAY) }), null, NOW).needsFollowUp, true);
});

test("a recorded reply after the last contact removes the contact from the queue and marks them replied", () => {
  const reply = new Date(NOW.getTime() - 5 * DAY);
  const result = assessFollowUp(candidate({ lastContactedAt: new Date(NOW.getTime() - 30 * DAY) }), reply, NOW);
  assert.equal(result.needsFollowUp, false);
  assert.equal(result.replied, true);
});

test("an older reply, from before the last contact, does not block a follow-up", () => {
  const oldReply = new Date(NOW.getTime() - 60 * DAY);
  const result = assessFollowUp(candidate({ lastContactedAt: new Date(NOW.getTime() - 30 * DAY) }), oldReply, NOW);
  assert.equal(result.needsFollowUp, true);
  assert.equal(result.replied, false);
});

test("suppressed, unsubscribed, bounced and invalid contacts are never in the queue", () => {
  for (const status of ["UNSUBSCRIBED", "SUPPRESSED", "BOUNCED", "INVALID"] as const) {
    assert.equal(assessFollowUp(candidate({ status }), null, NOW).needsFollowUp, false, status);
  }
});

test("customers, repeat customers and prospects are excluded by lead status", () => {
  for (const leadStatus of ["CUSTOMER", "REPEAT_CUSTOMER", "PROSPECT"] as const) {
    assert.equal(assessFollowUp(candidate({ leadStatus }), null, NOW).needsFollowUp, false, leadStatus);
  }
});

test("a contact with a send in progress or unconfirmed is never in the queue", () => {
  assert.equal(assessFollowUp(candidate({ emailSendLockAttemptId: "attempt-1" }), null, NOW).needsFollowUp, false);
});

test("a contact never contacted is not in the queue", () => {
  assert.equal(assessFollowUp(candidate({ lastContactedAt: null }), null, NOW).needsFollowUp, false);
});

test("the latest reply is the most recent genuine reply date", () => {
  assert.equal(latestReplyAt([]), null);
  assert.equal(latestReplyAt([new Date("2026-10-01T00:00:00Z"), new Date("2026-10-03T00:00:00Z")])?.toISOString(), "2026-10-03T00:00:00.000Z");
});
