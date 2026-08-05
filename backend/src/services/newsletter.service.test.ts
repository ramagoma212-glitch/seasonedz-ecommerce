// Pure-function unit tests for determineSubscribeOutcome() only — the
// decision logic is deliberately separated from the actual Prisma
// read/write in subscribeToNewsletter() so it's testable without a
// database connection. Run with:
// npx tsx --test src/services/newsletter.service.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { NewsletterSubscriberStatus } from "@prisma/client";
import { determineSubscribeOutcome, NEWSLETTER_ALREADY_ACTIVE_MESSAGE, NEWSLETTER_SUBSCRIBED_MESSAGE } from "./newsletter.service.js";

test("no existing subscriber: creates a new record", () => {
  const outcome = determineSubscribeOutcome(null);
  assert.equal(outcome.action, "created");
  assert.equal(outcome.message, NEWSLETTER_SUBSCRIBED_MESSAGE);
});

test("existing ACTIVE subscriber: idempotent, no duplicate record", () => {
  const outcome = determineSubscribeOutcome(NewsletterSubscriberStatus.ACTIVE);
  assert.equal(outcome.action, "already-active");
  assert.equal(outcome.message, NEWSLETTER_ALREADY_ACTIVE_MESSAGE);
});

test("existing UNSUBSCRIBED subscriber: reactivates with a fresh consent timestamp", () => {
  const outcome = determineSubscribeOutcome(NewsletterSubscriberStatus.UNSUBSCRIBED);
  assert.equal(outcome.action, "reactivated");
  assert.equal(outcome.message, NEWSLETTER_SUBSCRIBED_MESSAGE);
});
