// Milestone 198, Part 23/26 (SECURITY): proves requireAdminAuth guards
// every outreach campaign admin route, and that the sending-related
// actions (test-send/batch-send/retry/cancel) carry an extra ADMIN-only
// requireAdminRole layer — same structural proof
// adminReferralsRouteWiring.test.ts already established for Affiliate
// Products' write routes. A STAFF session can read/draft everything but
// is rejected before ever reaching a sending controller.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminOutreachCampaignRoutes from "./adminOutreachCampaign.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

test("requireAdminAuth is applied at the router level, before every outreach campaign route", () => {
  const firstLayer = adminOutreachCampaignRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected outreach campaign admin route is registered", () => {
  const expected: Array<[string, string]> = [
    ["get", "/"],
    ["post", "/"],
    ["post", "/preview-audience"],
    ["get", "/:id"],
    ["patch", "/:id"],
    ["delete", "/:id"],
    ["post", "/:id/build-recipients"],
    ["get", "/:id/recipients"],
    ["post", "/:id/send-test"],
    ["post", "/:id/send-batch"],
    ["post", "/:id/retry-failed"],
    ["post", "/:id/cancel"],
  ];

  for (const [method, path] of expected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (adminOutreachCampaignRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});

function findRouteLayer(method: string, path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (adminOutreachCampaignRoutes as AnyRouter).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
}

test("draft/read/build-recipient routes have no extra role-gate middleware — STAFF can use them", () => {
  for (const [method, path] of [
    ["get", "/"],
    ["post", "/"],
    ["get", "/:id"],
    ["patch", "/:id"],
    ["post", "/:id/build-recipients"],
    ["get", "/:id/recipients"],
  ] as const) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.equal(layer.route.stack.length, 1, `expected ${method.toUpperCase()} ${path} to have no role-gate middleware`);
  }
});

test("sending routes (test-send/batch-send) are gated by requireAdminRole AND their own rate limiter — STAFF is rejected before the controller", () => {
  for (const [method, path] of [
    ["post", "/:id/send-test"],
    ["post", "/:id/send-batch"],
  ] as const) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.equal(layer.route.stack.length, 3, `expected ${method.toUpperCase()} ${path} to be gated by requireAdminRole + a rate limiter`);
  }
});

test("retry/cancel routes are gated by requireAdminRole", () => {
  for (const [method, path] of [
    ["post", "/:id/retry-failed"],
    ["post", "/:id/cancel"],
  ] as const) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.equal(layer.route.stack.length, 2, `expected ${method.toUpperCase()} ${path} to be gated by requireAdminRole`);
  }
});
