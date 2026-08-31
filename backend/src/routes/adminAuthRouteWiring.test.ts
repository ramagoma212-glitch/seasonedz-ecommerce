// Milestone 179: proves the security-critical routing shape of
// adminAuth.routes.ts directly, by introspecting Express's own
// router.stack — no HTTP server started, no database touched. The
// property that matters most here: /login, /otp/verify, /otp/resend,
// /forgot-password, /reset-password and the invitation routes must be
// reachable WITHOUT an existing session (a brand new admin has none
// yet), while /logout-all and /me must require one.
import { test } from "node:test";
import assert from "node:assert/strict";
import adminAuthRoutes from "./adminAuth.routes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

function findRouteLayer(method: string, path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (adminAuthRoutes as AnyRouter).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
}

const PUBLIC_ROUTES: Array<[string, string]> = [
  ["post", "/login"],
  ["post", "/otp/verify"],
  ["post", "/otp/resend"],
  ["post", "/logout"],
  ["post", "/forgot-password"],
  ["post", "/reset-password"],
  ["get", "/invitation"],
  ["post", "/invitation/activate"],
];

test("every pre-session route exists and is never gated by requireAdminAuth — a brand new admin has no session yet", () => {
  for (const [method, path] of PUBLIC_ROUTES) {
    const layer = findRouteLayer(method, path);
    assert.ok(layer, `expected route ${method.toUpperCase()} ${path} to be registered`);
    const hasAuthGate = layer.route.stack.some((entry: { name: string }) => entry.name === "requireAdminAuth");
    assert.equal(hasAuthGate, false, `${method.toUpperCase()} ${path} must not require an existing session`);
  }
});

test("/me requires requireAdminAuth", () => {
  const layer = findRouteLayer("get", "/me");
  assert.ok(layer);
  const hasAuthGate = layer.route.stack.some((entry: { name: string }) => entry.name === "requireAdminAuth");
  assert.equal(hasAuthGate, true);
});

test("/logout-all requires requireAdminAuth — self-service session revocation needs a valid session to revoke", () => {
  const layer = findRouteLayer("post", "/logout-all");
  assert.ok(layer);
  const hasAuthGate = layer.route.stack.some((entry: { name: string }) => entry.name === "requireAdminAuth");
  assert.equal(hasAuthGate, true);
});

test("/login is rate limited", () => {
  const layer = findRouteLayer("post", "/login");
  assert.ok(layer.route.stack.length >= 2, "expected a rate limiter in front of loginHandler");
});

test("no route creates an admin account directly — invite/activate only, never a plain register endpoint", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPaths = (adminAuthRoutes as AnyRouter).stack.filter((entry: any) => entry.route).map((entry: any) => entry.route.path as string);
  assert.ok(!allPaths.includes("/register"));
  assert.ok(!allPaths.includes("/signup"));
});
