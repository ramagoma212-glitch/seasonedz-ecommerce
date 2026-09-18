// Milestone 187, Part E: server-side shape validation for the
// frontend's crypto.randomUUID() anonymous visitor ID. Never trusts an
// arbitrary or oversized value — a malformed ID is rejected outright
// (the request fails validation) rather than silently accepted, which
// would let a caller pick their own KV key.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && UUID_PATTERN.test(value);
}
