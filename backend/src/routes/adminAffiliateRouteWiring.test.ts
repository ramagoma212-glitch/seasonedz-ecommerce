// Version 7, Milestone 172B: proves requireAdminAuth guards every
// admin affiliate route, the same way productReviewRouteWiring.test.ts
// already proves it for /api/admin's review-moderation routes. This is
// the level the enforcement actually lives at — the controllers/
// services below only ever receive whatever req.adminUser the
// middleware attached; they have no way to check who's calling them.
// A CustomerSession cookie can never reach these handlers at all: it
// authenticates a completely different table (Customer/CustomerSession)
// behind a completely different cookie name — requireAdminAuth only
// ever reads the admin session cookie, so customer/admin isolation
// here is structural, not a runtime branch that could be got wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminAffiliateRoutes from "./adminAffiliate.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every affiliate admin route", () => {
  const firstLayer = adminAffiliateRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected affiliate admin route is registered", () => {
  const expected: Array<[string, string]> = [
    ["get", "/products"],
    ["post", "/products"],
    ["get", "/products/:id"],
    ["patch", "/products/:id"],
    ["patch", "/products/:id/activate"],
    ["patch", "/products/:id/deactivate"],
    ["patch", "/products/:id/feature"],
    ["patch", "/products/:id/unfeature"],
  ];

  for (const [method, path] of expected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (adminAffiliateRoutes as AnyRouter).stack.some(
      (entry: any) => entry.route?.path === path && entry.route.methods[method]
    );
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});

test("no DELETE route exists for an affiliate product — deactivate (isActive=false) is the only removal path", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDelete = (adminAffiliateRoutes as AnyRouter).stack.some(
    (entry: any) => entry.route?.path === "/products/:id" && entry.route.methods.delete
  );
  assert.equal(hasDelete, false);
});
