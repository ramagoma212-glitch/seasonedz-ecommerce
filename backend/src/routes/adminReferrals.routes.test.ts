// Version 7, Milestone 172B.5: structural proof that every commission
// lifecycle/payout route added this milestone is registered AFTER
// `router.use(requireAdminAuth)` — the same single-application-point
// discipline every other admin router in this backend already follows,
// so there is no way for a new route to accidentally land outside the
// auth gate. Cheaper and more certain than spinning up a real Express
// app just to probe each route's status code (the live/black-box side
// of this is covered by tests/smoke/adminReferrals.spec.js instead).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("every commission/payout route is registered after router.use(requireAdminAuth)", () => {
  const source = readFileSync(join(__dirname, "adminReferrals.routes.ts"), "utf8");
  const authIndex = source.indexOf("router.use(requireAdminAuth)");
  assert.ok(authIndex > -1, "requireAdminAuth must be applied at the router level");

  const routesThatMustBeGated = [
    'router.get("/commissions"',
    'router.get("/commissions/:id"',
    'router.patch("/commissions/:id/approve"',
    'router.patch("/commissions/:id/reverse"',
    'router.get("/payouts"',
    'router.post("/payouts/:affiliateId/pay"',
  ];

  for (const routeLine of routesThatMustBeGated) {
    const routeIndex = source.indexOf(routeLine);
    assert.ok(routeIndex > -1, `route line not found: ${routeLine}`);
    assert.ok(routeIndex > authIndex, `${routeLine} must be registered after requireAdminAuth`);
  }
});
