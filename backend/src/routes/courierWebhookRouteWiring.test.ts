// Version 7, Milestone 173, updated 173A: structural proof of route
// wiring — same "read source text, no real Express app needed"
// discipline as paymentConfirmationRouteWiring.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("courier webhook router is mounted at /webhooks in routes/index.ts", () => {
  const source = readFileSync(join(__dirname, "index.ts"), "utf8");
  assert.match(source, /router\.use\("\/webhooks",\s*courierWebhookRoutes\)/);
});

test("173A: the tracking-event route is a fixed path with no secret path segment", () => {
  const source = readFileSync(join(__dirname, "courierWebhook.routes.ts"), "utf8");
  assert.match(source, /router\.post\("\/courier-guy\/tracking-event",\s*courierGuyTrackingWebhookHandler\)/);
  assert.doesNotMatch(source, /:webhookSecret/, "the old secret-in-URL pattern must not remain as a second working route");
});

test("no admin/customer auth middleware is applied to the webhook route (it's a public server-to-server callback, protected by bearer-token auth inside the handler instead)", () => {
  const source = readFileSync(join(__dirname, "courierWebhook.routes.ts"), "utf8");
  assert.doesNotMatch(source, /requireAdminAuth|requireCustomerAuth/);
});
