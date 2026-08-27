// Version 7, Milestone 174B: recovery + retry processor for the
// Notification outbox — see notificationEngine.service.ts's own header
// comment for the full design. Every transactional event today is sent
// immediately at enqueue time (brief section 42); this processor exists
// for two cases only:
//   1. Recovery — an immediate send never happened at all (e.g. the
//      process crashed between enqueue and send).
//   2. Retry — an immediate (or prior recovery) send genuinely failed
//      and attempts remain.
//
// Invoked via `npm run notifications:process` (backend/prisma/scripts/
// processNotifications.ts) — see that file and DELIVERY_SETUP.md/
// NOTIFICATIONS_SETUP.md for the recommended external schedule. Never
// invoked automatically by anything in this codebase; no in-process
// timer exists (this project's own Render plan is a single free-tier
// web service — see the 174A audit's own finding that no scheduler
// infrastructure exists here today).
import { NotificationStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { attemptSend, DEFAULT_MAX_ATTEMPTS } from "./notificationEngine.service.js";

// One run should never pick up an unbounded number of rows — a safety
// cap, not a tuning knob; real volume today is nowhere near this.
const BATCH_SIZE = 200;

export interface ProcessDueNotificationsResult {
  candidateCount: number;
  sent: number;
  stillFailed: number;
}

// Finds every notification genuinely due right now — a PENDING one
// whose scheduledAt has arrived, or a FAILED one with retries remaining
// whose nextAttemptAt has arrived — and processes each through the same
// attemptSend() the immediate-send path uses, so recovery/retry and a
// first-attempt send can never diverge in behaviour.
//
// attemptCount < maxAttempts is expressed as a literal threshold
// (DEFAULT_MAX_ATTEMPTS) rather than a genuine column-to-column
// comparison — Prisma can't compare two columns of the same row in a
// `where` clause without raw SQL, the same limitation
// adminDashboard.service.ts's own getLowStockProducts() already
// documents for the equivalent stockQuantity/lowStockThreshold case.
// Every notification created by this milestone's engine sets
// maxAttempts to this same default, so the literal is correct today;
// a future notification with a genuinely different maxAttempts would
// need this revisited, not before.
export async function processDueNotifications(now: Date = new Date()): Promise<ProcessDueNotificationsResult> {
  const candidates = await prisma.notification.findMany({
    where: {
      OR: [
        { status: NotificationStatus.PENDING, scheduledAt: { lte: now } },
        { status: NotificationStatus.FAILED, attemptCount: { lt: DEFAULT_MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
      ],
    },
    select: { id: true },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let stillFailed = 0;

  // Sequential, deliberately — brief section 28/41: never hammer Brevo,
  // and real volume today makes concurrency an unnecessary risk for the
  // safety it would need to add (rate limiting, backoff coordination).
  //
  // Each candidate is wrapped in its own try/catch (brief section 45 —
  // "one bad notification must not prevent all other due notifications
  // from being processed"): attemptSend() itself already never throws
  // for an ordinary business-rule failure (invalid recipient, Brevo
  // rejection — those already resolve to a FAILED row), so anything
  // caught here is a genuinely unexpected error for that one row (e.g.
  // a transient database hiccup mid-loop) — logged and skipped, never
  // allowed to abort the rest of the batch.
  for (const candidate of candidates) {
    try {
      await attemptSend(candidate.id);
      const after = await prisma.notification.findUnique({ where: { id: candidate.id }, select: { status: true } });
      if (after?.status === NotificationStatus.SENT) sent += 1;
      else if (after?.status === NotificationStatus.FAILED) stillFailed += 1;
    } catch (error) {
      stillFailed += 1;
      console.warn(`[notifications:process] unexpected error processing notification=${candidate.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return { candidateCount: candidates.length, sent, stillFailed };
}
