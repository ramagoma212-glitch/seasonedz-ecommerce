// Milestone 202: follow-up templates grouped by the organisation types that
// really exist in the CRM (School, ECD network, Church or faith ministry, Book
// retailer, and so on). The copy never states something about the recipient
// that the CRM cannot verify (a visit, a programme, a read receipt). The admin
// reviews and can edit every message before anything is sent.

import { BUSINESS_CONTACT } from "../../config/businessContact.js";

export type FollowUpTemplateKey = "education" | "faith" | "retail" | "community" | "hospitality" | "general";

const GROUPS: Array<{ key: FollowUpTemplateKey; label: string; organisationTypes: readonly string[]; audience: string }> = [
  {
    key: "education",
    label: "Schools and early learning",
    organisationTypes: ["School", "ECD network"],
    audience:
      "We supply educational colouring books for young learners, Bible colouring books for Sunday school, and acrylic markers and crayons for classrooms and bulk orders.",
  },
  {
    key: "faith",
    label: "Churches and faith groups",
    organisationTypes: ["Church or faith ministry"],
    audience: "We have Bible colouring books for children and families, suited to Sunday school and church groups, with bulk options for congregations.",
  },
  {
    key: "retail",
    label: "Bookshops and retailers",
    organisationTypes: ["Book retailer"],
    audience: "We would be glad to discuss stocking our colouring books and markers in your shop.",
  },
  {
    key: "community",
    label: "Community, care and NGO",
    organisationTypes: ["Child and community organisation", "Disability services", "Older adult services", "Healthcare support"],
    audience: "Our colouring books and creative supplies work well for group activities, and we can discuss quantities for your group.",
  },
  {
    key: "hospitality",
    label: "Hospitality and family venues",
    organisationTypes: ["Family hospitality"],
    audience: "Our colouring books and markers are suitable for a children's activity corner, and we can discuss quantities for your venue.",
  },
  {
    key: "general",
    label: "General organisation",
    organisationTypes: [],
    audience: "Our colouring books and creative supplies are made for children, families and organisations, and we can discuss quantities for your group.",
  },
];

export const FOLLOW_UP_TEMPLATE_GROUPS = GROUPS.map(({ key, label }) => ({ key, label }));

export function templateKeyForOrganisationType(organisationType: string | null | undefined): FollowUpTemplateKey {
  const normalised = (organisationType ?? "").trim().toLowerCase();
  if (!normalised) return "general";
  const match = GROUPS.find((group) => group.organisationTypes.some((known) => known.toLowerCase() === normalised));
  return match ? match.key : "general";
}

export function isFollowUpTemplateKey(value: unknown): value is FollowUpTemplateKey {
  return typeof value === "string" && GROUPS.some((group) => group.key === value);
}

export interface FollowUpContext {
  organisationName: string | null;
  contactName: string | null;
  // The most recent campaign this contact was actually sent (status SENT). Null when none.
  latestCampaign: { name: string; subject: string; sentAt: Date | null } | null;
}

export function renderFollowUp(key: FollowUpTemplateKey, context: FollowUpContext): { subject: string; body: string } {
  const group = GROUPS.find((item) => item.key === key) ?? GROUPS[GROUPS.length - 1]!;

  const greeting = context.contactName?.trim()
    ? `Good day ${context.contactName.trim()},`
    : context.organisationName?.trim()
      ? `Good day to the team at ${context.organisationName.trim()},`
      : "Good day,";

  const opening = context.latestCampaign
    ? "I am following up on the email we sent recently about Seasonedz Group's colouring books and creative products."
    : "I wanted to check whether you had a chance to look at Seasonedz Group's colouring books and creative products.";

  const cta = `If you would like to know more, simply reply to this email. You can also call or WhatsApp us on ${BUSINESS_CONTACT.phone}.`;

  const subject = context.latestCampaign
    ? `Following up: ${context.latestCampaign.subject}`
    : "Following up on Seasonedz Group colouring books";

  return {
    subject,
    body: [greeting, "", opening, "", group.audience, "", cta].join("\n"),
  };
}

// Phrases that would claim knowledge or activity the CRM cannot verify, plus
// spellings, dashes and endorsements that do not belong in this business's copy.
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bI (saw|visited|have seen|have been following)\b|\bI've been following\b/i, reason: "claims knowledge of the recipient's activity" },
  { pattern: /\byour (recent )?(visit|programme|event|post)\b/i, reason: "refers to recipient activity that is not verified" },
  { pattern: /\b(opened|clicked|viewed|read) (your|the|our) (email|message)\b|\byou (opened|clicked|read)\b/i, reason: "claims email tracking that does not exist" },
  { pattern: /coloring/i, reason: "use the South African spelling 'colouring'" },
  { pattern: /[–—]/, reason: "remove the dash" },
  { pattern: /SEDA|endorse|funded|government/i, reason: "implies funding or endorsement" },
];

export function findUnsupportedFollowUpText(subject: string, body: string): string[] {
  const text = `${subject}\n${body}`;
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ reason }) => reason);
}
