// Admin-triggered bulk send of the existing Milestone 189 welcome gift
// to every CURRENT customer/order that predates the automatic trigger
// (which only ever fires going forward, on email verification / first
// social sign-in). Two independent recipient groups, each reusing the
// exact same one-time-delivery-guaranteed send functions already used
// in production — this file only decides WHO to call them for, it
// never re-implements the send/dedupe logic itself:
//
//   - existing Customer accounts -> maybeSendWelcomeGift() (unchanged,
//     already-tested production function)
//   - guest checkouts with no Customer account -> maybeSendGuestWelcomeGift()
//     (new this milestone, same one-time guarantee via
//     GuestWelcomeGiftDelivery's own unique customerEmail)
//
// A guest email that has since become a real Customer account is
// treated as an account (not double-sent via both paths) — see
// buildRecipientLists() below.
import { prisma } from "../config/prisma.js";
import { maybeSendGuestWelcomeGift, maybeSendWelcomeGift } from "./welcomeGift.service.js";

interface GuestCandidate {
  email: string;
  firstName: string | null;
}

async function buildRecipientLists(): Promise<{
  customerIds: string[];
  guestCandidates: GuestCandidate[];
  guestPathAvailable: boolean;
}> {
  const activeCustomers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, email: true },
  });
  const customerEmails = new Set(activeCustomers.map((c) => c.email.trim().toLowerCase()));

  let guestCandidates: GuestCandidate[] = [];
  let guestPathAvailable = true;
  try {
    // Touch the guest delivery table first — if the Milestone 194-era
    // migration adding it hasn't been applied to this database yet,
    // this throws (Postgres "relation does not exist") and the whole
    // guest path is reported as unavailable rather than half-failing
    // partway through a real send.
    await prisma.guestWelcomeGiftDelivery.count();

    const guestOrders = await prisma.order.findMany({
      where: { customerId: null },
      select: { customerEmail: true, customerFirstName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const byEmail = new Map<string, GuestCandidate>();
    for (const order of guestOrders) {
      const email = order.customerEmail.trim().toLowerCase();
      if (!email || customerEmails.has(email)) continue; // now a real account -> handled by the customer path only
      if (!byEmail.has(email)) {
        byEmail.set(email, { email, firstName: order.customerFirstName?.trim() || null });
      }
    }
    guestCandidates = [...byEmail.values()];
  } catch {
    guestPathAvailable = false;
  }

  return { customerIds: activeCustomers.map((c) => c.id), guestCandidates, guestPathAvailable };
}

export interface WelcomeGiftBulkSendPreview {
  totalActiveCustomers: number;
  customersAlreadySent: number;
  customersEligible: number;
  guestPathAvailable: boolean;
  totalDistinctGuestEmails: number;
  guestsAlreadySent: number;
  guestsEligible: number;
  sampleGuestEmails: string[];
}

export async function previewWelcomeGiftBulkSend(): Promise<WelcomeGiftBulkSendPreview> {
  const { customerIds, guestCandidates, guestPathAvailable } = await buildRecipientLists();

  const alreadySentCustomerIds = new Set(
    (await prisma.welcomeGiftDelivery.findMany({ where: { customerId: { in: customerIds } }, select: { customerId: true } })).map(
      (row) => row.customerId
    )
  );

  let guestsAlreadySent = 0;
  if (guestPathAvailable && guestCandidates.length > 0) {
    guestsAlreadySent = await prisma.guestWelcomeGiftDelivery.count({
      where: { customerEmail: { in: guestCandidates.map((g) => g.email) } },
    });
  }

  return {
    totalActiveCustomers: customerIds.length,
    customersAlreadySent: alreadySentCustomerIds.size,
    customersEligible: customerIds.length - alreadySentCustomerIds.size,
    guestPathAvailable,
    totalDistinctGuestEmails: guestCandidates.length,
    guestsAlreadySent,
    guestsEligible: guestPathAvailable ? guestCandidates.length - guestsAlreadySent : 0,
    // First 10 only, for a human sanity-check preview — never the full
    // list in one response (this is a summary, not an export).
    sampleGuestEmails: guestCandidates.slice(0, 10).map((g) => g.email),
  };
}

export interface WelcomeGiftBulkSendResult {
  customersProcessed: number;
  guestsProcessed: number;
  guestPathAvailable: boolean;
}

// Fire-and-forget per recipient (maybeSendWelcomeGift/maybeSendGuestWelcomeGift
// never throw and silently skip anyone already delivered), run
// sequentially rather than in parallel — this is a small, admin-clicked,
// one-off batch (single digits to low tens of recipients for this
// store), not a high-throughput job, so there is no need to add
// concurrency/queueing complexity for it.
export async function runWelcomeGiftBulkSend(): Promise<WelcomeGiftBulkSendResult> {
  const { customerIds, guestCandidates, guestPathAvailable } = await buildRecipientLists();

  for (const customerId of customerIds) {
    await maybeSendWelcomeGift(customerId);
  }

  if (guestPathAvailable) {
    for (const guest of guestCandidates) {
      await maybeSendGuestWelcomeGift(guest.email, guest.firstName);
    }
  }

  return { customersProcessed: customerIds.length, guestsProcessed: guestPathAvailable ? guestCandidates.length : 0, guestPathAvailable };
}
