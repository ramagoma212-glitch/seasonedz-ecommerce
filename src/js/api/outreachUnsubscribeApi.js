// Milestone 198, Part 12: the public, unauthenticated outreach
// unsubscribe call — what the /unsubscribe landing page hits when a
// real contact clicks the link in an outreach email.

import { apiGet } from "../apiClient.js";

export function unsubscribeOutreachContact(token) {
  return apiGet(`/outreach/unsubscribe?token=${encodeURIComponent(token)}`);
}
