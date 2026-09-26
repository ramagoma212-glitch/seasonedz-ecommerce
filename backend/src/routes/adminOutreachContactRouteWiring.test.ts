// Milestone 198, Part 23/26 (SECURITY): proves requireAdminAuth guards
// every outreach contact admin route, the same structural level
// adminCouponRouteWiring.test.ts already proves for coupons — a normal
// customer session cookie can never reach any handler here.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminOutreachContactRoutes from "./adminOutreachContact.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every outreach contact route", () => {
  const firstLayer = adminOutreachContactRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected outreach contact admin route is registered", () => {
  const expected: Array<[string, string]> = [
    ["get", "/"],
    ["get", "/distinct-values"],
    ["post", "/import/preview"],
    ["post", "/import/commit"],
    ["post", "/"],
    ["get", "/:id"],
    ["patch", "/:id"],
    ["patch", "/:id/status"],
    ["delete", "/:id"],
  ];

  for (const [method, path] of expected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (adminOutreachContactRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});
