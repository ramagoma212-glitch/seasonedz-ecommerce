// Content Studio Phase 2/3A + Milestone 182 (Zeely Campaign Brief):
// proves requireAdminAuth guards every Content Studio route (same
// pattern as adminReferralsRouteWiring.test.ts), and that
// requireAdminRole("ADMIN") is applied to exactly the routes that
// should be ADMIN-only, no more and no less. No HTTP server is started
// and no database is touched; this introspects Express's own
// router.stack.
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

// Reachable by ANY authenticated admin (ADMIN or STAFF) — no
// requireAdminRole in front of the controller. Brand Knowledge/Pillars/
// Audiences reads, the Phase 3A context preview, and — Milestone 182,
// Part J — every Campaign Brief action STAFF is explicitly allowed:
// list/view, create, edit a working brief, regenerate, move workflow
// status (never to ARCHIVED — see updateCampaignBriefStatus's own
// guard), and record/edit/delete lightweight Zeely content records.
const UNGATED_ROUTES: Array<[string, string]> = [
  ["get", "/brand-knowledge"],
  ["get", "/brand-knowledge/:id"],
  ["get", "/pillars"],
  ["get", "/pillars/:id"],
  ["get", "/audiences"],
  ["get", "/audiences/:id"],
  ["post", "/context-preview"],
  ["get", "/campaign-briefs"],
  ["get", "/campaign-briefs/:id"],
  ["post", "/campaign-briefs"],
  ["patch", "/campaign-briefs/:id"],
  ["post", "/campaign-briefs/:id/regenerate"],
  ["patch", "/campaign-briefs/:id/status"],
  ["post", "/campaign-briefs/:id/content-records"],
  ["patch", "/campaign-briefs/:briefId/content-records/:recordId"],
  ["delete", "/campaign-briefs/:briefId/content-records/:recordId"],
];

// ADMIN only — Brand Knowledge/Pillars/Audiences writes (Phase 2,
// unchanged) plus, Milestone 182 Part J, archiving a Campaign Brief
// ("manage ... create/edit/archive campaign briefs" is ADMIN's own
// list; STAFF's list stops at "edit working" — archiving is the one
// campaign-brief action reserved to ADMIN).
const ADMIN_GATED_ROUTES: Array<[string, string]> = [
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
  ["patch", "/campaign-briefs/:id/archive"],
];

function findRouteLayer(method: string, path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (contentStudioRoutes as AnyRouter).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
}

test("every expected ungated route is registered and reachable by any authenticated admin (no extra role middleware)", () => {
  for (const [method, path] of UNGATED_ROUTES) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.equal(layer.route.stack.length, 1, `expected ${method.toUpperCase()} ${path} to have no role-gate middleware`);
  }
});

test("every expected ADMIN-gated route is registered and gated by an extra ADMIN-only middleware", () => {
  for (const [method, path] of ADMIN_GATED_ROUTES) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    // Two handlers: requireAdminRole("ADMIN") then the controller.
    // STAFF must be rejected before ever reaching the controller.
    assert.equal(layer.route.stack.length, 2, `expected ${method.toUpperCase()} ${path} to be gated by requireAdminRole`);
  }
});

test("the registered route set is exactly UNGATED_ROUTES + ADMIN_GATED_ROUTES — nothing unexpected is mounted", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (contentStudioRoutes as AnyRouter).stack
    .filter((entry: any) => entry.route)
    .flatMap((entry: any) => Object.keys(entry.route.methods).map((method) => `${method.toUpperCase()} ${entry.route.path}`))
    .sort();
  const expected = [...UNGATED_ROUTES, ...ADMIN_GATED_ROUTES].map(([method, path]) => `${method.toUpperCase()} ${path}`).sort();
  assert.deepEqual(actual, expected);
});

// Milestone 182: only a lightweight Zeely content RECORD may ever be
// deleted (a staff-entered note about something already created in
// Zeely — never Zeely content itself, never a Brand Knowledge entry,
// Pillar, Audience, or Campaign Brief, all of which stay
// deactivate/archive-only, matching this backend's site-wide "prefer
// the reversible state over destructive deletion" discipline).
test("the only DELETE route in Content Studio removes a lightweight content record — no other entity can be hard-deleted", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteRoutes = (contentStudioRoutes as AnyRouter).stack.filter((entry: any) => entry.route?.methods?.delete).map((entry: any) => entry.route.path as string);
  assert.deepEqual(deleteRoutes, ["/campaign-briefs/:briefId/content-records/:recordId"]);
});

// Brief section 35 (Phase 3A) / Milestone 182 Part I & B: no generation
// job, social account, scheduling engine, publishing action, or paid AI
// provider integration route exists — "campaign" is deliberately no
// longer in this list (Milestone 182 makes Campaign Briefs a real,
// sanctioned feature), but every other forbidden shape stays forbidden,
// plus Milestone 182's own new ones: no Zeely login/API/automation
// route, and no route referencing a specific paid AI vendor.
test("no generation job, social account, scheduling engine, publishing action, Zeely automation, or paid AI vendor route exists", () => {
  const forbiddenSubstrings = [
    "generation-job",
    "generate-",
    "social-account",
    "social-connect",
    "publish",
    "zeely-api",
    "zeely-login",
    "zeely-auth",
    "browser-automation",
    "claude",
    "anthropic",
    "gemini",
    "veo",
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPaths = (contentStudioRoutes as AnyRouter).stack.filter((entry: any) => entry.route).map((entry: any) => entry.route.path as string);

  for (const path of allPaths) {
    for (const forbidden of forbiddenSubstrings) {
      assert.ok(!path.toLowerCase().includes(forbidden), `route "${path}" unexpectedly references "${forbidden}" — out of scope`);
    }
  }
});
