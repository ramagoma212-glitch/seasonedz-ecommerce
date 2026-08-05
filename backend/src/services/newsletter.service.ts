import { NewsletterSubscriberStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { ValidatedNewsletterInput } from "../validators/newsletter.validator.js";

export const NEWSLETTER_SUBSCRIBED_MESSAGE =
  "Thank you. You're now signed up for Seasonedz Group updates and free printable colouring pages.";
export const NEWSLETTER_ALREADY_ACTIVE_MESSAGE = "You're already on our updates list.";

export type NewsletterSubscribeOutcome =
  | { action: "created"; message: string }
  | { action: "already-active"; message: string }
  | { action: "reactivated"; message: string };

// Pure decision logic: given the current status of any existing
// subscriber row for this email (or null if none exists), decides
// what should happen. Kept separate from the actual Prisma read/write
// in subscribeToNewsletter() below so this can be unit tested without
// a database connection — see newsletter.service.test.ts.
export function determineSubscribeOutcome(existingStatus: NewsletterSubscriberStatus | null): NewsletterSubscribeOutcome {
  if (existingStatus === null) {
    return { action: "created", message: NEWSLETTER_SUBSCRIBED_MESSAGE };
  }
  if (existingStatus === NewsletterSubscriberStatus.ACTIVE) {
    // Idempotent: repeat sign-ups from an already-active subscriber
    // are a friendly no-op, never a second row and never an error.
    return { action: "already-active", message: NEWSLETTER_ALREADY_ACTIVE_MESSAGE };
  }
  // Previously UNSUBSCRIBED, subscribing again voluntarily.
  return { action: "reactivated", message: NEWSLETTER_SUBSCRIBED_MESSAGE };
}

export async function subscribeToNewsletter(input: ValidatedNewsletterInput): Promise<NewsletterSubscribeOutcome> {
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email: input.email },
    select: { status: true },
  });

  const outcome = determineSubscribeOutcome(existing?.status ?? null);

  if (outcome.action === "created") {
    await prisma.newsletterSubscriber.create({
      data: {
        name: input.name,
        email: input.email,
        status: NewsletterSubscriberStatus.ACTIVE,
        source: "WEBSITE",
        consentAt: new Date(),
      },
    });
  } else if (outcome.action === "reactivated") {
    // New consent timestamp on every voluntary re-subscription — the
    // original consentAt is intentionally overwritten, since POPIA
    // proof-of-consent should reflect the most recent opt-in, not a
    // stale one from before they unsubscribed.
    await prisma.newsletterSubscriber.update({
      where: { email: input.email },
      data: {
        name: input.name,
        status: NewsletterSubscriberStatus.ACTIVE,
        source: "WEBSITE",
        consentAt: new Date(),
        unsubscribedAt: null,
      },
    });
  }
  // "already-active": deliberately no write at all.

  return outcome;
}
