// Milestone 197, Part 6/17: proves requireAdminAuth guards every admin
// coupon route — the same level adminAffiliateRouteWiring.test.ts already
// proves this at for affiliate products. A normal customer session
// cookie can never reach these handlers at all (see that file's own
// header comment for why this is structural, not a runtime check).
import { test } from "node:test";
import assert from "node:assert/strict";
import adminCouponRoutes from "./adminCoupon.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every coupon admin route", () => {
  const firstLayer = adminCouponRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected coupon admin route is registered", () => {
  const expected: Array<[string, string]> = [
    ["get", "/"],
    ["post", "/"],
    ["get", "/:id"],
    ["patch", "/:id"],
    ["patch", "/:id/activate"],
    ["patch", "/:id/deactivate"],
    ["delete", "/:id"],
  ];

  for (const [method, path] of expected) {
    const exists = (adminCouponRoutes as AnyRouter).stack.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entry: any) => entry.route?.path === path && entry.route.methods[method]
    );
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});
