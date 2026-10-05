// Milestone 202: the "Needs Follow-up" rule and reply detection, as pure
// functions. Nothing here sends anything or changes a contact. This is the
// single place that decides who appears in the follow-up queue.

import type { OutreachContactStatus, OutreachLeadStatus } from "@prisma/client";

// Default quiet period. A contact with no follow-up date set becomes due this
// many days after the last contact, provided they have not replied since.
// Changing this constant is the only way to change that part of the rule.
export const FOLLOW_UP_QUIET_DAYS = 7;

export const FOLLOW_UP_LEAD_STATUSES: readonly OutreachLeadStatus[] = ["CONTACTED", "CATALOGUE_SENT", "INTERESTED", "QUOTE_REQUESTED", "NEGOTIATING"];

export interface FollowUpCandidate {
  status: OutreachContactStatus;
  leadStatus: OutreachLeadStatus;
  emailSendLockAttemptId: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
}

export interface FollowUpAssessment {
  needsFollowUp: boolean;
  replied: boolean;
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Only genuine REPLY_RECEIVED activity dates are passed in. Opens, clicks and
// campaign SENT status are never replies.
export function latestReplyAt(replyDates: readonly Date[]): Date | null {
  if (replyDates.length === 0) return null;
  return replyDates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium" }).format(date);
}

export function assessFollowUp(contact: FollowUpCandidate, lastReply: Date | null, now: Date = new Date()): FollowUpAssessment {
  if (contact.status !== "ACTIVE") {
    return { needsFollowUp: false, replied: false, reason: `Not eligible for email (status ${contact.status}).` };
  }
  if (!FOLLOW_UP_LEAD_STATUSES.includes(contact.leadStatus)) {
    return { needsFollowUp: false, replied: false, reason: `Lead status ${contact.leadStatus.replace(/_/g, " ").toLowerCase()} does not need a follow-up.` };
  }
  if (contact.emailSendLockAttemptId) {
    return { needsFollowUp: false, replied: false, reason: "An email send is in progress or its outcome is unconfirmed." };
  }
  if (!contact.lastContactedAt) {
    return { needsFollowUp: false, replied: false, reason: "Not contacted yet." };
  }
  if (lastReply && lastReply.getTime() > contact.lastContactedAt.getTime()) {
    return { needsFollowUp: false, replied: true, reason: `Replied on ${formatDate(lastReply)}. Respond rather than follow up.` };
  }
  if (contact.nextFollowUpAt) {
    if (contact.nextFollowUpAt.getTime() > now.getTime()) {
      return { needsFollowUp: false, replied: false, reason: `Scheduled for ${formatDate(contact.nextFollowUpAt)}.` };
    }
    return { needsFollowUp: true, replied: false, reason: `Follow-up was due on ${formatDate(contact.nextFollowUpAt)}.` };
  }
  if (contact.lastContactedAt.getTime() <= now.getTime() - FOLLOW_UP_QUIET_DAYS * DAY_MS) {
    return {
      needsFollowUp: true,
      replied: false,
      reason: `No follow-up date set, last contacted over ${FOLLOW_UP_QUIET_DAYS} days ago with no reply.`,
    };
  }
  return { needsFollowUp: false, replied: false, reason: `Contacted recently. The first follow-up waits ${FOLLOW_UP_QUIET_DAYS} days.` };
}
