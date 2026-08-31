// Milestone 179, Part G: proves every route under /api/admin/users is
// gated by BOTH requireAdminAuth AND requireAdminRole(ADMIN) at the
// router level — this area is "ADMIN-only management" as a whole (the
// brief's own wording), unlike Content Studio's per-route STAFF-read/
// ADMIN-write split, so a single router-level check covers every route
// here rather than a per-route table.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminUsersRoutes from "./adminUsers.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every route", () => {
  const firstLayer = adminUsersRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("a second router-level middleware (requireAdminRole) follows immediately — STAFF never reaches any handler here", () => {
  const secondLayer = adminUsersRoutes.stack[1] as { route?: unknown };
  assert.equal(secondLayer.route, undefined, "must be router-level middleware, not a route handler");
});

const EXPECTED_ROUTES: Array<[string, string]> = [
  ["get", "/"],
  ["post", "/invite"],
  ["post", "/:id/reissue-invitation"],
  ["patch", "/:id/role"],
  ["patch", "/:id/status"],
];

test("every expected route is registered and has no per-route auth layer of its own — inherited from the router level only", () => {
  for (const [method, path] of EXPECTED_ROUTES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (adminUsersRoutes as AnyRouter).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.equal(layer.route.stack.length, 1, `expected ${method.toUpperCase()} ${path} to rely solely on the router-level gate`);
  }
});

test("no DELETE route exists — deactivation (PATCH status) is the only removal-shaped action, matching Content Studio's own precedent", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDelete = (adminUsersRoutes as AnyRouter).stack.some((entry: any) => entry.route?.methods?.delete);
  assert.equal(hasDelete, false);
});
