// Milestone 198, Part 23/26 (SECURITY): proves requireAdminAuth guards
// every outreach contact admin route, the same structural level
// adminCouponRouteWiring.test.ts already proves for coupons — a normal
// customer session cookie can never reach any handler here.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminOutreachContactRoutes from "./adminOutreachContact.routes.js";
import adminOutreachQuotationRoutes from "./adminOutreachQuotation.routes.js";

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
    ["get", "/crm-summary"],
    ["post", "/import/preview"],
    ["post", "/import/commit"],
    ["post", "/"],
    ["get", "/:id"],
    ["get", "/:id/history"],
    ["patch", "/:id"],
    ["patch", "/:id/status"],
    ["delete", "/:id"],
    ["get", "/:id/crm-detail"],
    ["get", "/:id/timeline"],
    ["post", "/:id/activities"],
    ["patch", "/:id/follow-up"],
    ["post", "/:id/follow-up/complete"],
    ["post", "/:id/catalogue-sent"],
    ["post", "/:id/orders/:orderId/link"],
    ["post", "/:id/orders/:orderId/mark-customer"],
    ["post", "/:id/mark-repeat-customer"],
  ];

  for (const [method, path] of expected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = (adminOutreachContactRoutes as AnyRouter).stack.some((entry: any) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
});

test("requireAdminAuth is applied at the router level for quotations too", () => {
  const firstLayer = adminOutreachQuotationRoutes.stack[0] as { name: string; route?: unknown };
  assert.equal(firstLayer.name, "requireAdminAuth");
  assert.equal(firstLayer.route, undefined);
});

test("every expected quotation admin route is registered, with /summary before /:id", () => {
  const expected: Array<[string, string]> = [
    ["get", "/"],
    ["get", "/summary"],
    ["post", "/"],
    ["get", "/:id"],
    ["patch", "/:id"],
    ["get", "/:id/pdf"],
    ["post", "/:id/duplicate"],
    ["post", "/:id/send"],
    ["post", "/:id/accept"],
    ["post", "/:id/decline"],
    ["post", "/:id/expire"],
    ["post", "/:id/cancel"],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (adminOutreachQuotationRoutes as AnyRouter).stack as any[];
  for (const [method, path] of expected) {
    const exists = stack.some((entry) => entry.route?.path === path && entry.route.methods[method]);
    assert.ok(exists, `expected route ${method.toUpperCase()} ${path} to be registered`);
  }
  const summaryIndex = stack.findIndex((entry) => entry.route?.path === "/summary");
  const byIdIndex = stack.findIndex((entry) => entry.route?.path === "/:id");
  assert.ok(summaryIndex !== -1 && summaryIndex < byIdIndex, "/summary must be registered before /:id so it is never shadowed");
});
