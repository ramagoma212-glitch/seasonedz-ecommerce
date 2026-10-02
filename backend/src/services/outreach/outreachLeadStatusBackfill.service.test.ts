// Milestone 199, Part 2: pure-function tests for the historical
// leadStatus backfill, with no database connection — same "validates
// only the decision logic" discipline as order.validator.test.ts.
// Run with: npx tsx --test src/services/outreach/outreachLeadStatusBackfill.service.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeContactedBackfill, isPlaceholderCampaignName } from "./outreachLeadStatusBackfill.service.js";

test("a real Milestone 198 campaign name is never classified as a placeholder", () => {
  assert.equal(isPlaceholderCampaignName("Seasonedz ABC School Introductions"), false);
  assert.equal(isPlaceholderCampaignName("Seasonedz Christian School Introductions"), false);
});

test("the original test/placeholder campaign name is correctly identified", () => {
  assert.equal(isPlaceholderCampaignName("Schools, Churches and Organisations: Introduction and Bulk Orders"), true);
});

test("a genuine SENT recipient on a real campaign becomes CONTACTED with the real sentAt", () => {
  const campaigns = [{ id: "camp-1", name: "Seasonedz ABC School Introductions" }];
  const sentAt = new Date("2026-09-30T18:15:04.000Z");
  const result = computeContactedBackfill(campaigns, [{ contactId: "contact-1", campaignId: "camp-1", sentAt }]);

  assert.equal(result.size, 1);
  assert.equal(result.get("contact-1")?.getTime(), sentAt.getTime());
});

test("a contact appearing in two real campaigns gets the LATEST sentAt, not the first", () => {
  const campaigns = [
    { id: "camp-1", name: "Seasonedz ABC School Introductions" },
    { id: "camp-2", name: "Seasonedz Christian School Introductions" },
  ];
  const earlier = new Date("2026-09-30T18:13:00.000Z");
  const later = new Date("2026-09-30T18:15:00.000Z");
  const result = computeContactedBackfill(campaigns, [
    { contactId: "contact-1", campaignId: "camp-1", sentAt: earlier },
    { contactId: "contact-1", campaignId: "camp-2", sentAt: later },
  ]);

  assert.equal(result.get("contact-1")?.getTime(), later.getTime());
});

test("a contact with no SENT recipient at all never appears in the result — stays PROSPECT", () => {
  const campaigns = [{ id: "camp-1", name: "Seasonedz ABC School Introductions" }];
  const result = computeContactedBackfill(campaigns, []);
  assert.equal(result.size, 0);
  assert.equal(result.has("any-contact"), false);
});

test("a SENT recipient on the placeholder/test campaign is excluded — never becomes a genuine contacted lead", () => {
  const campaigns = [
    { id: "placeholder-camp", name: "Schools, Churches and Organisations: Introduction and Bulk Orders" },
    { id: "camp-1", name: "Seasonedz ABC School Introductions" },
  ];
  const result = computeContactedBackfill(campaigns, [
    { contactId: "owner-test-contact", campaignId: "placeholder-camp", sentAt: new Date("2026-09-26T23:16:42.000Z") },
  ]);

  assert.equal(result.size, 0);
  assert.equal(result.has("owner-test-contact"), false);
});

test("a contact in BOTH the placeholder campaign and a real campaign is still classified CONTACTED, from the real campaign's date only", () => {
  const campaigns = [
    { id: "placeholder-camp", name: "Schools, Churches and Organisations: Introduction and Bulk Orders" },
    { id: "camp-1", name: "Seasonedz ABC School Introductions" },
  ];
  const placeholderSentAt = new Date("2026-09-26T23:16:42.000Z");
  const realSentAt = new Date("2026-09-30T18:15:04.000Z");
  const result = computeContactedBackfill(campaigns, [
    { contactId: "contact-1", campaignId: "placeholder-camp", sentAt: placeholderSentAt },
    { contactId: "contact-1", campaignId: "camp-1", sentAt: realSentAt },
  ]);

  assert.equal(result.size, 1);
  assert.equal(result.get("contact-1")?.getTime(), realSentAt.getTime());
});

// Reproduces the exact real production shape found during the
// Milestone 199 investigation: 52 contacts, 13 campaigns (1
// placeholder + 12 real), 52 SENT recipients (2 on the placeholder, 50
// on the 12 real campaigns, one each) — expected result: exactly 50
// contacts CONTACTED, the 2 placeholder-only contacts excluded.
test("reproduces the real Milestone 199 production shape: 50 of 52 contacts become CONTACTED", () => {
  const campaigns = [
    { id: "placeholder-camp", name: "Schools, Churches and Organisations: Introduction and Bulk Orders" },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `real-camp-${i}`, name: `Seasonedz Real Campaign ${i}` })),
  ];
  const placeholderRecipients = [
    { contactId: "owner-contact-1", campaignId: "placeholder-camp", sentAt: new Date("2026-09-26T23:16:42.000Z") },
    { contactId: "owner-contact-2", campaignId: "placeholder-camp", sentAt: new Date("2026-09-26T23:16:43.000Z") },
  ];
  const realRecipients = Array.from({ length: 50 }, (_, i) => ({
    contactId: `real-contact-${i}`,
    campaignId: `real-camp-${i % 12}`,
    sentAt: new Date("2026-09-30T18:15:00.000Z"),
  }));

  const result = computeContactedBackfill(campaigns, [...placeholderRecipients, ...realRecipients]);

  assert.equal(result.size, 50);
  assert.equal(result.has("owner-contact-1"), false);
  assert.equal(result.has("owner-contact-2"), false);
});
