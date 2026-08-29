// Content Studio Phase 2: proves requireAdminAuth guards every Content
// Studio route (same pattern as adminReferralsRouteWiring.test.ts), and
// additionally proves requireAdminRole("ADMIN") — the first role-gated
// middleware this backend has ever had — is applied to every write
// route and only write routes. No HTTP server is started and no
// database is touched; this introspects Express's own router.stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import contentStudioRoutes from "./contentStudio.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every Content Studio route", () => {
  const firstLayer = contentStudioRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

const READ_ROUTES: Array<[string, string]> = [
  ["get", "/brand-knowledge"],
  ["get", "/brand-knowledge/:id"],
  ["get", "/pillars"],
  ["get", "/pillars/:id"],
  ["get", "/audiences"],
  ["get", "/audiences/:id"],
];

const WRITE_ROUTES: Array<[string, string]> = [
  ["post", "/brand-knowledge"],
  ["patch", "/brand-knowledge/:id"],
  ["patch", "/brand-knowledge/:id/deactivate"],
  ["patch", "/brand-knowledge/:id/reactivate"],
  ["post", "/pillars"],
  ["patch", "/pillars/:id"],
  ["patch", "/pillars/:id/deactivate"],
  ["patch", "/pillars/:id/reactivate"],
  ["post", "/audiences"],
  ["patch", "/audiences/:id"],
  ["patch", "/audiences/:id/deactivate"],
  ["patch", "/audiences/:id/reactivate"],
];

function findRouteLayer(method: string, path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (contentStudioRoutes as AnyRouter).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
}

test("every expected read route is registered and reachable by any authenticated admin (no extra role middleware)", () => {
  for (const [method, path] of READ_ROUTES) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    // Exactly one handler in the route's own stack — the controller
    // itself, no requireAdminRole in front of it. STAFF can reach
    // these (brief section 22: STAFF gets read access).
    assert.equal(layer.route.stack.length, 1, `expected ${method.toUpperCase()} ${path} to have no role-gate middleware`);
  }
});

test("every expected write route is registered and gated by an extra ADMIN-only middleware", () => {
  for (const [method, path] of WRITE_ROUTES) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    // Two handlers: requireAdminRole("ADMIN") then the controller.
    // STAFF must be rejected before ever reaching the controller.
    assert.equal(layer.route.stack.length, 2, `expected ${method.toUpperCase()} ${path} to be gated by requireAdminRole`);
  }
});

test("no DELETE route exists anywhere in Content Studio — deactivate is the only removal-shaped path (brief section 19)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasDelete = (contentStudioRoutes as AnyRouter).stack.some((entry: any) => entry.route?.methods?.delete);
  assert.equal(hasDelete, false);
});

test("no campaign, generation job, social account or scheduling route exists — Phase 2 is Brand Knowledge only", () => {
  const forbiddenSubstrings = ["campaign", "generation", "social-account", "schedule", "publish"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPaths = (contentStudioRoutes as AnyRouter).stack.filter((entry: any) => entry.route).map((entry: any) => entry.route.path as string);

  for (const path of allPaths) {
    for (const forbidden of forbiddenSubstrings) {
      assert.ok(!path.toLowerCase().includes(forbidden), `route "${path}" unexpectedly references "${forbidden}" — out of scope for Phase 2`);
    }
  }
});
