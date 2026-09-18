// Milestone 187, Part F: server-side daily reply limit, keyed on the
// real Africa/Johannesburg calendar date — never the browser's local
// timezone, and never the Worker's own runtime timezone (Workers run
// in UTC). Uses Intl's IANA timezone database rather than a hardcoded
// UTC+2 offset, so this stays correct even across any future SAST/SAT
// daylight-saving-style change (South Africa currently has none, but
// this doesn't guess that will always be true).
import type { Env } from "./types";

export const DAILY_LIMIT = 7;
// One usage key naturally expires a little over a day after the date
// it's for — comfortably covers any clock skew between the Worker and
// KV's own eventual-consistency window, while still guaranteeing a key
// from an old day can never affect the next day's allowance (each
// day's key is a distinct KV entry, addressed by date).
const KV_EXPIRATION_SECONDS = 60 * 60 * 30;

export function getJohannesburgDate(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD directly — no manual string reassembly.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);
}

function usageKey(visitorId: string, date: string): string {
  return `chat:usage:${date}:${visitorId}`;
}

interface UsageRecord {
  count: number;
}

export async function getUsageCount(env: Env, visitorId: string, date: string): Promise<number> {
  const raw = await env.CHATBOT_USAGE.get(usageKey(visitorId, date));
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as UsageRecord;
    return typeof parsed.count === "number" && parsed.count >= 0 ? parsed.count : 0;
  } catch {
    return 0;
  }
}

// Only ever called after a genuinely successful AI reply (Part F: "not
// a network failure, Workers AI outage, quota exhaustion, Turnstile
// failure, invalid request, sensitive-info rejection, or server
// error") — every one of those failure paths returns before this is
// reached. Stores only { count } — never a message, name, email, or
// any other value.
export async function incrementUsage(env: Env, visitorId: string, date: string, currentCount: number): Promise<number> {
  const next = currentCount + 1;
  await env.CHATBOT_USAGE.put(usageKey(visitorId, date), JSON.stringify({ count: next }), {
    expirationTtl: KV_EXPIRATION_SECONDS,
  });
  return next;
}

export function nextJohannesburgDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return getJohannesburgDate(next);
}
