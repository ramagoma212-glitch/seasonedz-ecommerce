// Version 7, Milestone 173: structural proof of route wiring — same
// "read source text, no real Express app needed" discipline as
// paymentConfirmationRouteWiring.test.ts.
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

test("the tracking-event route carries a :webhookSecret path segment (the secret-URL gate), not a query param or header", () => {
  const source = readFileSync(join(__dirname, "courierWebhook.routes.ts"), "utf8");
  assert.match(source, /router\.post\("\/courier-guy\/:webhookSecret\/tracking-event",\s*courierGuyTrackingWebhookHandler\)/);
});

test("no admin/customer auth middleware is applied to the webhook route (it's a public server-to-server callback, protected by the secret path segment instead)", () => {
  const source = readFileSync(join(__dirname, "courierWebhook.routes.ts"), "utf8");
  assert.doesNotMatch(source, /requireAdminAuth|requireCustomerAuth/);
});
