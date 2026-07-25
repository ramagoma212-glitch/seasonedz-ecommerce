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
