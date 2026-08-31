// Milestone 179, Part F: admin authentication security audit log.
// eventType is a real TypeScript union validated here, even though the
// database column itself stays a plain String — same "documented in
// one place, no migration needed for a new type" discipline
// AdminSecurityEvent's own schema comment explains (matching
// NotificationEventType's own precedent).
//
// Never call this with anything that could contain a password, plaintext
// OTP code, activation/reset/session token, or full authentication
// cookie in `summary` — every call site in this codebase passes only
// short, safe, human-readable context (e.g. "STAFF login", "5 incorrect
// OTP attempts"), the same discipline affiliateDocumentClassification's
// own classificationReason already established for a different table.

import { createHash } from "node:crypto";
import { prisma } from "../config/prisma.js";

export type AdminSecurityEventType =
  | "ADMIN_LOGIN_PASSWORD_SUCCEEDED"
  | "ADMIN_LOGIN_PASSWORD_FAILED"
  | "ADMIN_OTP_SENT"
  | "ADMIN_OTP_FAILED"
  | "ADMIN_OTP_SUCCEEDED"
  | "ADMIN_LOGIN_SUCCEEDED"
  | "ADMIN_LOGOUT"
  | "ADMIN_PASSWORD_RESET_REQUESTED"
  | "ADMIN_PASSWORD_RESET_COMPLETED"
  | "ADMIN_ACCOUNT_CREATED"
  | "ADMIN_ACCOUNT_ACTIVATED"
  | "ADMIN_ACCOUNT_DEACTIVATED"
  | "ADMIN_ACCOUNT_REACTIVATED"
  | "ADMIN_ROLE_CHANGED"
  | "ADMIN_SESSIONS_REVOKED";

export interface RecordAdminSecurityEventInput {
  // Null for events with no real admin to attach to yet — an unknown-
  // email login attempt, or a failed attempt before the account is
  // known to exist. See the schema's own comment.
  adminUserId: string | null;
  eventType: AdminSecurityEventType;
  summary?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// SHA-256, not stored raw — same "never persist a real IP, only a
// hash" discipline this codebase already applies elsewhere (see
// OrderAffiliateProductCommission's own privacy-minimising comments).
// A hash still lets an investigation confirm "was this the same
// source as this other event" without this table ever being a plain
// IP log.
export function hashIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  return createHash("sha256").update(ipAddress).digest("hex");
}

// Never throws — an audit-logging failure must never break the real
// authentication flow it's describing. Fire-and-forget from every call
// site, same discipline as this codebase's own notification dispatch
// calls (`void ....catch(() => {})`).
export async function recordAdminSecurityEvent(input: RecordAdminSecurityEventInput): Promise<void> {
  try {
    await prisma.adminSecurityEvent.create({
      data: {
        adminUserId: input.adminUserId,
        eventType: input.eventType,
        summary: input.summary ?? null,
        ipHash: hashIpAddress(input.ipAddress),
        userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
      },
    });
  } catch (error) {
    console.warn(`[admin-security-event] failed to record ${input.eventType}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export interface AdminSecurityEventOutput {
  id: string;
  adminUserId: string | null;
  eventType: string;
  summary: string | null;
  createdAt: Date;
}

// Admin-facing read (no ipHash/userAgent exposed here — brief section
// 26.34-style "masked/omitted by default" discipline is unnecessary
// for an already-hashed IP, but userAgent is a full raw string and
// ipHash is internal-forensics-only, so neither is returned to the
// admin UI at all for now; add a narrower reveal action later if a
// real investigative need arises, same as identity-number reveal).
export async function listAdminSecurityEvents(adminUserId: string, limit = 20): Promise<AdminSecurityEventOutput[]> {
  const events = await prisma.adminSecurityEvent.findMany({
    where: { adminUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return events.map((event) => ({
    id: event.id,
    adminUserId: event.adminUserId,
    eventType: event.eventType,
    summary: event.summary,
    createdAt: event.createdAt,
  }));
}
