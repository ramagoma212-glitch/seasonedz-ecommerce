// Version 7, Milestone 172B.6: structural proof that the new manual
// payment confirmation route (adminDashboard.routes.ts) is registered
// after router.use(requireAdminAuth), and that the new affiliate portal
// routes (customer.routes.ts) each explicitly pass requireCustomerAuth.
// Same "read source text, no real Express app needed" discipline as
// adminReferralsRouteWiring.test.ts (172B.5) — the live/black-box side
// is covered by tests/smoke specs instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("confirm-payment is registered after router.use(requireAdminAuth) in adminDashboard.routes.ts", () => {
  const source = readFileSync(join(__dirname, "adminDashboard.routes.ts"), "utf8");
  const authIndex = source.indexOf("router.use(requireAdminAuth)");
  const routeIndex = source.indexOf('router.patch("/orders/:orderNumber/confirm-payment"');

  assert.ok(authIndex > -1, "requireAdminAuth must be applied at the router level");
  assert.ok(routeIndex > -1, "confirm-payment route not found");
  assert.ok(routeIndex > authIndex, "confirm-payment must be registered after requireAdminAuth");
});

test("both affiliate portal routes explicitly require requireCustomerAuth in customer.routes.ts", () => {
  const source = readFileSync(join(__dirname, "customer.routes.ts"), "utf8");

  const portalLine = source.split("\n").find((line) => line.includes('"/affiliate"') && line.includes("router.get"));
  const applyLine = source.split("\n").find((line) => line.includes('"/affiliate/apply"') && line.includes("router.post"));

  assert.ok(portalLine, "GET /affiliate route not found");
  assert.ok(applyLine, "POST /affiliate/apply route not found");
  assert.match(portalLine!, /requireCustomerAuth/, "GET /affiliate must require requireCustomerAuth");
  assert.match(applyLine!, /requireCustomerAuth/, "POST /affiliate/apply must require requireCustomerAuth");
});
