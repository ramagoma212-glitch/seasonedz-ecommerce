// Version 7, Milestone 171C: this backend has no HTTP/supertest-level
// tests anywhere (every existing test is service/validator/util level
// — see the *.test.ts files throughout src/services, src/validators,
// src/utils), so there is no precedent for spinning up a real Express
// server just for this milestone's two remaining Part M requirements:
// "unauthenticated user cannot submit review" and "non-admin cannot
// moderate". Both are enforced entirely by middleware, never by the
// service functions themselves (which only ever receive a customerId
// argument — they have no way to know or check who's calling them).
// This file tests that enforcement at the level it actually lives:
// asserting the real Router objects wire requireCustomerAuth/
// requireAdminAuth in front of every new review route, by inspecting
// each route's own middleware stack (Express attaches each handler's
// function name to router.stack[].route.stack[].name) — the same
// mechanism Express itself uses to run them, not a re-implementation
// of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import customerRoutes from "./customer.routes.js";
import adminDashboardRoutes from "./adminDashboard.routes.js";

// Express's public type declarations don't expose the shape of
// router.stack/route.stack (they're stable, widely-relied-upon
// internals, just not part of the documented/typed public API) — `any`
// here is deliberate, the same reasoning as the stub() helpers in
// productReview.service.test.ts/adminProductReview.service.test.ts.
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

test("GET /customers/reviews/eligible requires requireCustomerAuth before its handler", () => {
  const middlewareNames = findRoute(customerRoutes, "get", "/reviews/eligible");
  assert.ok(middlewareNames.includes("requireCustomerAuth"));
  assert.ok(middlewareNames.indexOf("requireCustomerAuth") < middlewareNames.indexOf("listEligibleReviewCandidatesHandler"));
});

test("GET /customers/reviews requires requireCustomerAuth before its handler", () => {
  const middlewareNames = findRoute(customerRoutes, "get", "/reviews");
  assert.ok(middlewareNames.includes("requireCustomerAuth"));
  assert.ok(middlewareNames.indexOf("requireCustomerAuth") < middlewareNames.indexOf("listMyReviewsHandler"));
});

test("POST /customers/reviews (submit a review) requires requireCustomerAuth before its handler — an unauthenticated request can never reach submitProductReviewHandler", () => {
  const middlewareNames = findRoute(customerRoutes, "post", "/reviews");
  assert.ok(middlewareNames.includes("requireCustomerAuth"));
  assert.ok(middlewareNames.indexOf("requireCustomerAuth") < middlewareNames.indexOf("submitProductReviewHandler"));
});

test("admin review moderation routes exist and the whole admin router requires requireAdminAuth first — a non-admin (including any logged-in customer) can never reach approve/reject", () => {
  // requireAdminAuth is applied once via router.use(), before any
  // individual route — including the three review routes below — so
  // it's the very first entry in the whole router's stack, ahead of
  // every route layer.
  const firstLayer = adminDashboardRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);

  const reviewRoutePaths = ["/reviews", "/reviews/:id/approve", "/reviews/:id/reject"];
  for (const path of reviewRoutePaths) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = adminDashboardRoutes.stack.some((entry: any) => entry.route?.path === path);
    assert.ok(exists, `expected route ${path} to be registered`);
  }
});
