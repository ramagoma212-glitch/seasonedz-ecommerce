// Version 7, Milestone 172B.3: proves requireAdminAuth guards every
// admin referrals route, the same way adminAffiliateRouteWiring.test.ts
// (172B) and productReviewRouteWiring.test.ts already prove it for
// their own admin routers. A CustomerSession cookie can never reach
// these handlers — it authenticates a completely separate table behind
// a completely separate cookie name from AdminSession.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminReferralsRoutes from "./adminReferrals.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every referrals route", () => {
  const firstLayer = adminReferralsRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected referrals admin route is registered", () => {
  const expected: Array<[string, string]> = [
    ["get", "/overview"],
    ["get", "/affiliates"],
    ["post", "/affiliates"],
    ["get", "/affiliates/:id"],
    ["patch", "/affiliates/:id"],
    ["patch", "/affiliates/:id/approve"],
    ["patch", "/affiliates/:id/reject"],
    ["patch", "/affiliates/:id/suspend"],
    ["patch", "/affiliates/:id/reactivate"],
    ["get", "/settings"],
    ["patch", "/settings"],
    ["get", "/commissions"],
  ];

  for (const [method, path] of expected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (adminReferralsRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});

test("no POST /settings route exists — settings can only ever be read or updated, never created arbitrarily", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasPostSettings = (adminReferralsRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === "/settings" && entry.route.methods.post);
  assert.equal(hasPostSettings, false);
});

test("no DELETE route exists for an affiliate — suspend/reactivate is the only removal-shaped path", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDelete = (adminReferralsRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path?.startsWith("/affiliates") && entry.route.methods.delete);
  assert.equal(hasDelete, false);
});

test("no POST /commissions route exists — commissions are only ever produced by future automatic order creation, never typed in directly", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasPostCommissions = (adminReferralsRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === "/commissions" && entry.route.methods.post);
  assert.equal(hasPostCommissions, false);
});
