// Version 7, Milestone 173: defensive parsing for the Courier Guy
// (ShipLogic) "Tracking event" webhook payload.
//
// The exact JSON shape was never obtained (ShipLogic's own API
// reference is a JavaScript-rendered site this project's tooling
// could not access, and no working API credentials were available to
// capture a real payload). ShipLogic's own portal documentation only
// confirms: the webhook is an HTTP POST, and "the payload is the
// shipment or note that changed." Everything below follows this
// codebase's existing precedent for exactly this situation —
// courierGuy.service.ts's mapBookingResponse()/pickFirst() already
// solves "the exact response field name is uncertain" by trying
// several plausible candidates and failing safe (never guessing) when
// none match. This file applies the same discipline to inbound
// webhook parsing.
//
// Nothing here ever throws for a malformed/unrecognised payload shape
// — every extractor returns null/[] on anything it can't confidently
// read, and courierStatusSync.service.ts treats that as a safe,
// logged no-op, never a crash.

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Looks up a dot-path (e.g. "tracking_status.status") on a plain
// object, returning undefined if any segment is missing or the value
// isn't a plain object partway through.
function getPath(obj: JsonRecord, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function firstStringAt(obj: JsonRecord, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

// ShipLogic's own portal doc says the payload "is the shipment ... that
// changed" — some webhook providers instead wrap that in an envelope
// (e.g. { event, data } or { topic, payload }). This unwraps one level
// if a recognisable wrapper key holds a nested object, otherwise
// returns the payload unchanged, so both shapes are handled by the
// same candidate-path lookups below.
function unwrapEnvelope(payload: JsonRecord): JsonRecord {
  for (const key of ["data", "payload", "shipment", "tracking_event", "trackingEvent"]) {
    const nested = payload[key];
    if (isRecord(nested)) return nested;
  }
  return payload;
}

const IDENTIFIER_PATHS = [
  "id",
  "shipment_id",
  "shipmentId",
  "tracking_reference",
  "short_tracking_reference",
  "custom_tracking_reference",
  "waybill",
  "waybill_number",
  "reference",
];

const STATUS_PATHS = ["status", "tracking_status", "tracking_status.status", "event", "event_status", "event_type", "type", "shipment.status"];

const TIMESTAMP_PATHS = [
  "timestamp",
  "event_timestamp",
  "occurred_at",
  "status_timestamp",
  "date",
  "created_at",
  "time",
  "tracking_status.timestamp",
  "tracking_status.date",
];

// Sanity bound for a provider-reported event timestamp — rejects
// anything implausible (a badly-parsed field, or a payload field that
// happened to match a candidate path but isn't actually a date) rather
// than trusting it blindly. Generous on both sides since this backend
// cannot know the provider's own clock skew or how long an event might
// have queued before delivery.
const EARLIEST_PLAUSIBLE_EVENT = new Date("2020-01-01T00:00:00Z");
const LATEST_PLAUSIBLE_SKEW_MS = 24 * 60 * 60 * 1000;

export interface ParsedCourierWebhookEvent {
  candidateIdentifiers: string[];
  rawStatus: string | null;
  providerEventAt: Date | null;
}

export function parseCourierWebhookPayload(rawPayload: unknown): ParsedCourierWebhookEvent {
  if (!isRecord(rawPayload)) {
    return { candidateIdentifiers: [], rawStatus: null, providerEventAt: null };
  }

  const body = unwrapEnvelope(rawPayload);

  const candidateIdentifiers: string[] = [];
  for (const path of IDENTIFIER_PATHS) {
    const value = getPath(body, path);
    if (typeof value === "string" && value.trim().length > 0) candidateIdentifiers.push(value.trim());
    if (typeof value === "number" && Number.isFinite(value)) candidateIdentifiers.push(String(value));
  }

  const rawStatus = firstStringAt(body, STATUS_PATHS);

  let providerEventAt: Date | null = null;
  const rawTimestamp = firstStringAt(body, TIMESTAMP_PATHS);
  if (rawTimestamp) {
    const parsed = new Date(rawTimestamp);
    const isPlausible = !Number.isNaN(parsed.getTime()) && parsed >= EARLIEST_PLAUSIBLE_EVENT && parsed.getTime() <= Date.now() + LATEST_PLAUSIBLE_SKEW_MS;
    if (isPlausible) providerEventAt = parsed;
  }

  return { candidateIdentifiers, rawStatus, providerEventAt };
}

// Safe-to-log summary of a webhook payload's shape (top-level key
// names only, never values) — used when a payload can't be resolved to
// a genuine shipment or can't be mapped to a known status, so the
// owner/developer has something concrete to refine the parser against
// once a real event is observed, without ever logging address/name/
// phone or any other customer PII that might be present in the actual
// values (brief section 5/29's explicit caution).
export function safeShapeSummary(rawPayload: unknown): string {
  if (!isRecord(rawPayload)) return typeof rawPayload;
  const body = unwrapEnvelope(rawPayload);
  return Object.keys(body).sort().join(",");
}
