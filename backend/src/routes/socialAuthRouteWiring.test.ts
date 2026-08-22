// Version 7, Milestone 171F: route-wiring tests, same technique as
// productReviewRouteWiring.test.ts (inspecting the real Router's own
// middleware stack rather than spinning up a live server) — this
// backend's established pattern for asserting *who* can reach a
// handler, since that enforcement lives in middleware, not in the
// service functions themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import socialAuthRoutes from "./socialAuth.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

function findRoute(router: AnyRouter, method: string, path: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return layer.route.stack.map((entry: any) => entry.name);
}

test("GET /auth/providers has no auth middleware — must be reachable while fully logged out", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "get", "/providers");
  assert.ok(!middlewareNames.includes("requireCustomerAuth"));
  assert.ok(!middlewareNames.includes("optionalCustomerAuth"));
});

for (const provider of ["google", "facebook", "apple"]) {
  test(`GET /auth/oauth/${provider} uses optionalCustomerAuth, never requireCustomerAuth — a normal login must work while logged out`, () => {
    const middlewareNames = findRoute(socialAuthRoutes, "get", `/oauth/${provider}`);
    assert.ok(middlewareNames.includes("optionalCustomerAuth"));
    assert.ok(!middlewareNames.includes("requireCustomerAuth"));
  });
}

test("GET /auth/oauth/google/callback uses optionalCustomerAuth (link-intent re-verification happens inside the handler, not via route-level requireCustomerAuth)", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "get", "/oauth/google/callback");
  assert.ok(middlewareNames.includes("optionalCustomerAuth"));
  assert.ok(!middlewareNames.includes("requireCustomerAuth"));
});

test("GET /auth/oauth/facebook/callback uses optionalCustomerAuth", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "get", "/oauth/facebook/callback");
  assert.ok(middlewareNames.includes("optionalCustomerAuth"));
});

test("POST /auth/oauth/apple/callback exists as a POST (Apple's form_post response mode) and uses optionalCustomerAuth", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "post", "/oauth/apple/callback");
  assert.ok(middlewareNames.includes("optionalCustomerAuth"));
});

test("GET /auth/connected-accounts requires requireCustomerAuth before its handler", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "get", "/connected-accounts");
  assert.ok(middlewareNames.includes("requireCustomerAuth"));
  assert.ok(middlewareNames.indexOf("requireCustomerAuth") < middlewareNames.indexOf("listConnectedAccountsHandler"));
});

test("DELETE /auth/connected-accounts/:provider requires requireCustomerAuth before its handler — a non-owner/unauthenticated request can never reach disconnectProviderHandler", () => {
  const middlewareNames = findRoute(socialAuthRoutes, "delete", "/connected-accounts/:provider");
  assert.ok(middlewareNames.includes("requireCustomerAuth"));
  assert.ok(middlewareNames.indexOf("requireCustomerAuth") < middlewareNames.indexOf("disconnectProviderHandler"));
});
