// Customer account API client (Version 7, Milestone 128). Uses the
// shared customerRequest() wrapper (js/api/customerApiClient.js) which
// sends the customer session cookie via `credentials: "include"`.
// Never stores a password or session token anywhere in this module —
// the backend sets the HttpOnly cookie itself; there is nothing here
// for frontend JavaScript to read or persist.

import { customerRequest } from "./customerApiClient.js";

export function registerCustomer({ email, password, firstName, lastName, phone }) {
  return customerRequest("/customers/register", {
    method: "POST",
    body: JSON.stringify({ email, password, firstName, lastName, phone: phone || undefined }),
  });
}

export function loginCustomer(email, password) {
  return customerRequest("/customers/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logoutCustomer() {
  return customerRequest("/customers/logout", { method: "POST" });
}

export function getCurrentCustomer() {
  return customerRequest("/customers/me", { method: "GET" });
}

// Version 7, Milestone 130: both require the caller to already be
// logged in (backend returns 401 otherwise) — never called from a
// context that hasn't already confirmed a logged-in customer.
export function getCustomerOrders() {
  return customerRequest("/customers/orders", { method: "GET" });
}

export function getCustomerOrder(orderNumber) {
  return customerRequest(`/customers/orders/${encodeURIComponent(orderNumber)}`, { method: "GET" });
}

// Version 7, Milestone 132: neither endpoint requires a logged-in
// session (forgot/reset password are, by definition, logged-out
// flows). Never stores the token or password anywhere here — both are
// passed straight through to the backend in the request body.
export function forgotPassword(email) {
  return customerRequest("/customers/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token, password, confirmPassword) {
  return customerRequest("/customers/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password, confirmPassword }),
  });
}

// Version 7, Milestone 152: secure digital downloads — both require the
// caller to already be logged in (backend returns 401 otherwise), same
// as getCustomerOrder(s) above. requestCustomerDownload() returns a
// short-lived signed URL, freshly generated on every call — never
// cached or reused client-side.
export function getCustomerOrderDownloads(orderNumber) {
  return customerRequest(`/customers/orders/${encodeURIComponent(orderNumber)}/downloads`, { method: "GET" });
}

export function requestCustomerDownload(orderItemId) {
  return customerRequest(`/customers/downloads/${encodeURIComponent(orderItemId)}/request`, { method: "POST" });
}

// Version 7, Milestone 171C: genuine, verified-purchase product
// reviews. All three require the caller to already be logged in, same
// as the order-history/download endpoints above — the backend
// independently re-verifies every purchase claim, never trusting
// anything sent from here.
export function getEligibleReviewCandidates() {
  return customerRequest("/customers/reviews/eligible", { method: "GET" });
}

export function getMyReviews() {
  return customerRequest("/customers/reviews", { method: "GET" });
}

export function submitProductReview({ orderItemId, rating, reviewText }) {
  return customerRequest("/customers/reviews", {
    method: "POST",
    body: JSON.stringify({ orderItemId, rating, reviewText }),
  });
}

// Version 7, Milestone 172B.6: affiliate portal — reuses this exact
// customer session, never a second affiliate login. Both require the
// caller to already be logged in; the backend derives affiliate
// identity solely from the authenticated customer, never from anything
// this client sends (see customerAffiliate.service.ts).
export function getMyAffiliatePortal() {
  return customerRequest("/customers/affiliate", { method: "GET" });
}

export function applyForAffiliateProgramme() {
  return customerRequest("/customers/affiliate/apply", { method: "POST" });
}

// Version 7, Milestone 176: affiliate application/document verification
// — same customer session, identity always derived server-side from
// the session cookie, never from anything sent here.
export function getMyAffiliateApplication() {
  return customerRequest("/customers/affiliate/application", { method: "GET" });
}

export function updateMyAffiliateApplication(fields) {
  return customerRequest("/customers/affiliate/application", { method: "PATCH", body: JSON.stringify(fields) });
}

export function submitMyAffiliateApplication() {
  return customerRequest("/customers/affiliate/application/submit", { method: "POST" });
}

// `file` is a real File/Blob from an <input type="file">. FormData is
// used (never JSON.stringify) so the browser sets the correct
// multipart Content-Type itself — see customerApiClient.js's own
// isFormData handling.
export function uploadMyAffiliateDocument({ file, slot, identityDocumentType, proofOfResidenceType }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("slot", slot);
  if (identityDocumentType) formData.append("identityDocumentType", identityDocumentType);
  if (proofOfResidenceType) formData.append("proofOfResidenceType", proofOfResidenceType);
  return customerRequest("/customers/affiliate/application/documents", { method: "POST", body: formData });
}

export function getMyAffiliateDocumentSignedUrl(documentId) {
  return customerRequest(`/customers/affiliate/application/documents/${encodeURIComponent(documentId)}/signed-url`, { method: "GET" });
}

// Version 7, Milestone 174C: the Customer Notification Centre. All
// four require the caller to already be logged in — the backend
// always scopes every read/write to req.customerUser.id, never a
// notification id alone (see customerNotification.service.ts's own
// header comment for the IDOR protection this relies on).
export function getMyNotifications(page = 1, limit = 20) {
  return customerRequest(`/customers/notifications?page=${page}&limit=${limit}`, { method: "GET" });
}

export function getMyNotification(id) {
  return customerRequest(`/customers/notifications/${encodeURIComponent(id)}`, { method: "GET" });
}

export function markNotificationRead(id) {
  return customerRequest(`/customers/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return customerRequest("/customers/notifications/read-all", { method: "PATCH" });
}

// Version 7, Milestone 174C: engagement preferences.
export function getMyNotificationPreferences() {
  return customerRequest("/customers/notification-preferences", { method: "GET" });
}

export function updateMyNotificationPreferences(preferences) {
  return customerRequest("/customers/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(preferences),
  });
}

// Version 7, Milestone 174C: back-in-stock — logged-in only, see
// stockAlert.service.ts's own header comment for why. `productSlug`
// (not the internal database id) — same convention as product.id
// throughout this whole frontend (src/js/api/mappers.js).
export function subscribeToStockAlert(productSlug) {
  return customerRequest("/customers/stock-alerts", { method: "POST", body: JSON.stringify({ productSlug }) });
}

// Version 7, Milestone 174C: server-backed wishlist — the guest,
// Local-Storage-only wishlist (js/wishlist.js) is untouched; these
// four calls are only ever made once a customer is logged in.
export function getMyWishlist() {
  return customerRequest("/customers/wishlist", { method: "GET" });
}

export function addToServerWishlist(productSlug) {
  return customerRequest("/customers/wishlist", { method: "POST", body: JSON.stringify({ productSlug }) });
}

export function removeFromServerWishlist(productSlug) {
  return customerRequest(`/customers/wishlist/${encodeURIComponent(productSlug)}`, { method: "DELETE" });
}

export function mergeGuestWishlist(productSlugs) {
  return customerRequest("/customers/wishlist/merge", { method: "POST", body: JSON.stringify({ productSlugs }) });
}

// Version 7, Milestone 174C: abandoned checkout recovery — public,
// unauthenticated (a guest checkout is the primary case). Reuses this
// same customerRequest() wrapper purely for its fetch/error-handling
// convenience — credentials:"include" is harmless here too, since the
// backend route (optionalCustomerAuth) only ever reads a session
// cookie if one happens to be present, never requires it.
export function captureCheckoutIntent(email, items) {
  return customerRequest("/checkout-intent", { method: "POST", body: JSON.stringify({ email, items }) });
}

export function recoverCheckoutIntent(token) {
  return customerRequest(`/checkout-intent/recover/${encodeURIComponent(token)}`, { method: "GET" });
}
