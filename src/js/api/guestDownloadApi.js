// Version 7, Milestone 152: guest secure-token digital download access.
// Public endpoints (/api/downloads/guest/:token...) — no credentials,
// no customer session cookie needed. The token itself is the
// credential (see backend/src/routes/downloads.routes.ts's own
// comment) — never an order number alone.
import { apiGet, apiPost } from "../apiClient.js";

export function getGuestDownloads(token) {
  return apiGet(`/downloads/guest/${encodeURIComponent(token)}`);
}

export function requestGuestDownload(token, orderItemId) {
  return apiPost(`/downloads/guest/${encodeURIComponent(token)}/${encodeURIComponent(orderItemId)}`, {});
}
